const { MongoClient } = require("mongodb");
const { randomUUID } = require("crypto");
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");

const VAULT_REGISTRY = "vault_file_registry";

// ─── DO Spaces client (solo instanciado si las credenciales están presentes) ──
function createSpacesClient() {
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;
  const endpoint = process.env.DO_SPACES_ENDPOINT || "sfo3.digitaloceanspaces.com";
  const region = process.env.DO_SPACES_REGION || "sfo3";

  if (!key || !secret) return null;

  return new S3Client({
    region,
    endpoint: `https://${endpoint}`,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: false,
  });
}

function createMongoStorage({ uri, dbName }) {
  const client = new MongoClient(uri);
  let db;
  const spaces = createSpacesClient();

  async function connect() {
    if (!db) {
      await client.connect();
      db = client.db(dbName);
      try {
        await db.collection(VAULT_REGISTRY).createIndex({ fileId: 1 }, { unique: true });
      } catch {
        /* index may exist */
      }
    }
    return db;
  }

  /**
   * Sube un buffer a DigitalOcean Spaces y devuelve la URL pública CDN (legacy / historias).
   */
  async function saveFileToSpaces({ fileBuffer, filename, mimeType, folder }) {
    if (!spaces) return null;

    const bucket_name = process.env.DO_SPACES_BUCKET || "cardsocial-assets";
    const endpoint = process.env.DO_SPACES_ENDPOINT || "sfo3.digitaloceanspaces.com";
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "-");
    const key = `${folder}/${Date.now()}-${safeName}`;

    await spaces.send(new PutObjectCommand({
      Bucket: bucket_name,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType || "application/octet-stream",
      ACL: "public-read",
    }));

    return `https://${bucket_name}.${endpoint}/${key}`;
  }

  /**
   * Elimina un objeto en Spaces a partir de su URL pública (mismo formato que `saveFileToSpaces`).
   */
  async function deleteFromSpacesByPublicUrl(publicUrl) {
    if (!spaces || !publicUrl) {
      return false;
    }
    const urlStr = String(publicUrl).trim();
    if (!urlStr.startsWith("http")) {
      return false;
    }
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch {
      return false;
    }
    const hostParts = parsed.hostname.split(".");
    if (hostParts.length < 3) {
      return false;
    }
    const bucket_name = hostParts[0];
    const objectKey = parsed.pathname.replace(/^\//, "");
    if (!objectKey) {
      return false;
    }
    try {
      await spaces.send(
        new DeleteObjectCommand({
          Bucket: bucket_name,
          Key: objectKey,
        })
      );
      return true;
    } catch (e) {
      console.warn("[Spaces] delete failed:", objectKey, e?.message || e);
      return false;
    }
  }

  async function saveModerationAudit(audit) {
    const currentDb = await connect();
    const result = await currentDb.collection("moderation_audit").insertOne({
      ...audit,
      createdAt: new Date(),
    });

    return result.insertedId.toString();
  }

  /**
   * Sube archivo moderado a Spaces (objeto privado) y registra metadatos para el proxy /api/vault/file/:id.
   * @returns {{ fileId: string, spacesKey: string, spacesBucket: string }}
   */
  async function uploadVaultFilePrivate({ fileBuffer, filename, mimeType, ownerUid, label }) {
    if (!spaces) {
      throw new Error("DigitalOcean Spaces is not configured (DO_SPACES_KEY / DO_SPACES_SECRET)");
    }
    const bucket_name = process.env.DO_SPACES_BUCKET || "cardsocial-assets";
    const fileId = randomUUID();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "-") || "file";
    const spacesKey = `vault-proxy/${fileId}/${safeName}`;
    const contentType = mimeType || "application/octet-stream";

    await spaces.send(new PutObjectCommand({
      Bucket: bucket_name,
      Key: spacesKey,
      Body: fileBuffer,
      ContentType: contentType,
      ACL: "private",
    }));

    const currentDb = await connect();
    try {
      await currentDb.collection(VAULT_REGISTRY).insertOne({
        fileId,
        spacesKey,
        spacesBucket: bucket_name,
        mimeType: contentType,
        ownerUid: String(ownerUid || "").trim(),
        label: String(label || "").trim(),
        originalFilename: filename,
        size: fileBuffer.length,
        createdAt: new Date(),
      });
    } catch (insertErr) {
      try {
        await spaces.send(new DeleteObjectCommand({ Bucket: bucket_name, Key: spacesKey }));
      } catch (delErr) {
        console.warn("[vault upload] rollback DeleteObject failed:", spacesKey, delErr?.message || delErr);
      }
      throw insertErr;
    }

    return { fileId, spacesKey, spacesBucket: bucket_name };
  }

  /**
   * Busca registro del proxy.
   */
  async function findVaultFileRecord(fileId) {
    const currentDb = await connect();
    const id = String(fileId || "").trim();
    if (!id) return null;
    return currentDb.collection(VAULT_REGISTRY).findOne({ fileId: id });
  }

  /**
   * Stream de S3 → Express response. Resuelve false si no hay registro o error.
   */
  async function pipeVaultFileToResponse(fileId, res) {
    const meta = await findVaultFileRecord(fileId);
    if (!meta || !spaces) {
      return false;
    }
    try {
      const out = await spaces.send(new GetObjectCommand({
        Bucket: meta.spacesBucket,
        Key: meta.spacesKey,
      }));

      const mime = meta.mimeType || out.ContentType || "application/octet-stream";
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "private, max-age=300");
      if (out.ContentLength != null) {
        res.setHeader("Content-Length", String(out.ContentLength));
      }
      const safeName = String(meta.originalFilename || "file").replace(/[^\w.\-]+/g, "_").slice(0, 180);
      res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);

      const body = out.Body;
      if (!body) {
        console.warn("[vault proxy] empty Body for:", fileId);
        return false;
      }
      if (typeof body.pipe === "function") {
        body.on("error", (err) => {
          console.warn("[vault proxy] stream error:", err?.message || err);
          if (!res.headersSent) {
            res.status(500).end("Stream error");
          } else {
            res.destroy(err);
          }
        });
        body.pipe(res);
        return true;
      }
      if (typeof body.transformToByteArray === "function") {
        const bytes = await body.transformToByteArray();
        res.end(Buffer.from(bytes));
        return true;
      }
      console.warn("[vault proxy] unsupported S3 Body type for:", fileId);
      return false;
    } catch (e) {
      const code = e?.name || e?.Code || e?.code || "";
      console.warn("[vault proxy] GetObject failed:", fileId, code, e?.message || e);
      return false;
    }
  }

  async function close() {
    await client.close();
  }

  return {
    connect,
    saveFileToSpaces,
    deleteFromSpacesByPublicUrl,
    saveModerationAudit,
    uploadVaultFilePrivate,
    findVaultFileRecord,
    pipeVaultFileToResponse,
    isSpacesConfigured: () => Boolean(spaces),
    close,
  };
}

module.exports = {
  createMongoStorage,
};
