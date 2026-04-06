const { MongoClient, GridFSBucket, ObjectId } = require("mongodb");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

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
  let bucket;
  const spaces = createSpacesClient();

  async function connect() {
    if (!db) {
      await client.connect();
      db = client.db(dbName);
      bucket = new GridFSBucket(db, { bucketName: "vaultFiles" });
    }
    return db;
  }

  /**
   * Sube un buffer a DigitalOcean Spaces y devuelve la URL pública CDN.
   * Si DO Spaces no está configurado, retorna null y el caller decide el fallback.
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
   * @returns {Promise<boolean>} true si se borró o no aplicaba; false si falló el parseo.
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

  async function saveFile({ fileBuffer, filename, mimeType, metadata }) {
    await connect();

    const uploadStream = bucket.openUploadStream(filename, {
      contentType: mimeType,
      metadata,
    });

    uploadStream.end(fileBuffer);

    return new Promise((resolve, reject) => {
      uploadStream.on("finish", () => {
        resolve({
          fileId: uploadStream.id.toString(),
          filename,
        });
      });
      uploadStream.on("error", reject);
    });
  }

  async function saveModerationAudit(audit) {
    const currentDb = await connect();
    const result = await currentDb.collection("moderation_audit").insertOne({
      ...audit,
      createdAt: new Date(),
    });

    return result.insertedId.toString();
  }

  async function getFileMeta(fileId) {
    const currentDb = await connect();
    const found = await currentDb.collection("vaultFiles.files").findOne({ _id: new ObjectId(fileId) });
    if (!found) return null;
    return found;
  }

  async function close() {
    await client.close();
  }

  return {
    connect,
    saveFile,
    saveFileToSpaces,
    deleteFromSpacesByPublicUrl,
    saveModerationAudit,
    getFileMeta,
    close,
  };
}

module.exports = {
  createMongoStorage,
};
