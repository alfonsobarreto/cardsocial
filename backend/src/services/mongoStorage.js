const { MongoClient } = require("mongodb");
const { randomUUID } = require("crypto");
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const {
  env,
  getSpacesMissingEnvVars,
  logSpacesVariablesLoaded,
  formatSpacesEnvMissingError,
} = require("../config");

const VAULT_REGISTRY = "vault_file_registry";

/** Si el nombre saneado pierde extensión, se añade según Content-Type (Spaces + proxy conservan tipo). */
function extensionForMime(mimeType) {
  const m = String(mimeType || "").toLowerCase();
  if (m.includes("pdf")) return ".pdf";
  if (m === "image/jpeg" || m === "image/jpg") return ".jpg";
  if (m === "image/png") return ".png";
  if (m === "image/webp") return ".webp";
  if (m === "image/gif") return ".gif";
  if (m === "image/heic" || m === "image/heif") return ".heic";
  if (m.includes("wordprocessingml")) return ".docx";
  if (m.includes("spreadsheetml")) return ".xlsx";
  if (m === "text/plain") return ".txt";
  return "";
}

function ensureVaultSpacesLeafName(filename, mimeType) {
  let base = String(filename || "").trim() || "file";
  base = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^\.+/, "");
  if (!base) base = "file";
  if (/\.[a-z0-9]{2,12}$/i.test(base)) {
    return base.slice(0, 200);
  }
  const ext = extensionForMime(mimeType);
  return ext ? `${base}${ext}`.slice(0, 200) : base.slice(0, 200);
}

/** S3 solo si las cinco `DO_SPACES_*` están en `config` (mapeadas desde `process.env`). */
function createSpacesClient() {
  if (getSpacesMissingEnvVars().length > 0) {
    return null;
  }
  return new S3Client({
    region: env.spacesRegion,
    endpoint: `https://${env.spacesEndpoint}`,
    credentials: {
      accessKeyId: env.spacesKey,
      secretAccessKey: env.spacesSecret,
    },
    forcePathStyle: false,
  });
}

function createMongoStorage({ uri, dbName }) {
  logSpacesVariablesLoaded();

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

    const bucket_name = env.spacesBucket;
    const endpoint = env.spacesEndpoint;
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
      throw new Error(formatSpacesEnvMissingError());
    }
    const bucket_name = env.spacesBucket;
    const fileId = randomUUID();
    const contentType = mimeType || "application/octet-stream";
    const safeName = ensureVaultSpacesLeafName(filename, contentType);
    const spacesKey = `vault-proxy/${fileId}/${safeName}`;

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
    if (!spaces) {
      console.warn(
        "[vault proxy] pipeVaultFileToResponse:",
        formatSpacesEnvMissingError(),
        "fileId=",
        fileId
      );
      return false;
    }
    if (!meta) {
      console.warn("[vault proxy] pipeVaultFileToResponse: sin registro en vault_file_registry, fileId=", fileId);
      return false;
    }
    console.log(
      "[vault proxy] registro Mongo OK → Spaces GetObject bucket=%s key=%s fileId=%s",
      meta.spacesBucket,
      meta.spacesKey,
      fileId
    );
    // Upload usa la misma Key en PutObject y en Mongo (vault-proxy/<fileId>/<safeName>).
    // No hay ruta alterna "sin extensión": el nombre del objeto en Spaces incluye el safeName del multipart (ej. .jpg).
    let out;
    try {
      out = await spaces.send(
        new GetObjectCommand({
          Bucket: meta.spacesBucket,
          Key: meta.spacesKey,
        })
      );
    } catch (getErr) {
      console.error(
        "ERROR CRÍTICO AL RECUPERAR DE SPACES:",
        getErr,
        "| Bucket:",
        meta.spacesBucket,
        "| Key:",
        meta.spacesKey,
        "| stack:",
        getErr?.stack,
        "| $metadata:",
        getErr?.$metadata ? JSON.stringify(getErr.$metadata) : "(none)"
      );
      return false;
    }

    try {
      let mime = String(meta.mimeType || out.ContentType || "").trim() || "application/octet-stream";
      const orig = String(meta.originalFilename || "");
      const keyTail = String(meta.spacesKey || "").split("/").pop() || "";
      const pathLooksPdf = /\.pdf(\?|$)/i.test(orig) || /\.pdf(\?|$)/i.test(keyTail);
      if (
        pathLooksPdf &&
        (mime === "application/octet-stream" || mime === "binary/octet-stream" || !mime.includes("/"))
      ) {
        mime = "application/pdf";
      }
      res.setHeader("Content-Type", mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
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
      console.warn("[vault proxy] respuesta GetObject OK pero fallo al escribir al cliente:", fileId, code, e?.message || e);
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
