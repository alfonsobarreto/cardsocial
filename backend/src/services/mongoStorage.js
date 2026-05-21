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

/**
 * Detecta el MIME real de un buffer mirando los primeros bytes. Devuelve
 * `null` si no reconoce la firma; usado para corregir archivos de vault cuyo
 * `mimeType` almacenado quedó como `application/octet-stream`.
 */
function sniffMimeFromBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  // GIF87a / GIF89a
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return "image/gif";
  }
  // WebP: "RIFF"...."WEBP"
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  // HEIC/HEIF: "ftypheic" / "ftypheix" / "ftypmif1" / "ftypmsf1" en offset 4..12
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.slice(8, 12).toString("ascii").toLowerCase();
    if (brand === "heic" || brand === "heix" || brand === "mif1" || brand === "msf1" || brand === "heis") {
      return "image/heic";
    }
  }
  // PDF: "%PDF"
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return "application/pdf";
  }
  return null;
}

/** Fallback por extensión cuando no tenemos ni `storedMime` ni magic bytes. */
function mimeFromExt(name) {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]{2,6})(?:\?|$)/);
  if (!m) return null;
  switch (m[1]) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
    case "heif":
      return "image/heic";
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    default:
      return null;
  }
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

/** Opciones de pool orientadas a tráfico interactivo (baja latencia percibida, failover del driver). */
function createMongoClient(uri) {
  return new MongoClient(uri, {
    maxPoolSize: 50,
    minPoolSize: 2,
    maxIdleTimeMS: 60_000,
    waitQueueTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    retryReads: true,
    retryWrites: true,
    heartbeatFrequencyMS: 10_000,
  });
}

function createMongoStorage({ uri, dbName }) {
  logSpacesVariablesLoaded();

  const client = createMongoClient(uri);
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
  async function uploadVaultFilePrivate({ fileBuffer, filename, mimeType, uid, label }) {
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
        uid: String(uid || "").trim(),
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

  async function deleteVaultFilePrivate(fileId, uid) {
    const currentDb = await connect();
    const id = String(fileId || "").trim();
    const ownerUid = String(uid || "").trim();
    if (!id || !ownerUid) {
      return { ok: false, reason: "invalid" };
    }

    const meta = await currentDb.collection(VAULT_REGISTRY).findOne({ fileId: id });
    if (!meta) {
      return { ok: true, deleted: false, reason: "not_found" };
    }
    if (String(meta.uid || "").trim() !== ownerUid) {
      return { ok: false, reason: "forbidden" };
    }
    if (!spaces) {
      return { ok: false, reason: "spaces_unavailable" };
    }

    await spaces.send(new DeleteObjectCommand({
      Bucket: meta.spacesBucket,
      Key: meta.spacesKey,
    }));
    await currentDb.collection(VAULT_REGISTRY).deleteOne({ fileId: id });
    await currentDb.collection("moderation_audit").insertOne({
      type: "vault_file_deleted",
      uid: ownerUid,
      vaultFileId: id,
      spacesBucket: meta.spacesBucket,
      spacesKey: meta.spacesKey,
      createdAt: new Date(),
    });
    return { ok: true, deleted: true };
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
      const body = out.Body;
      if (!body) {
        console.warn("[vault proxy] empty Body for:", fileId);
        return false;
      }

      /**
       * Cargamos el cuerpo a memoria para poder sniffear magic bytes y setear
       * el `Content-Type` correcto ANTES de escribir la respuesta. Los
       * archivos de vault son avatars y adjuntos pequeños (<15 MB), está
       * dentro del budget aceptable de un proceso Node.
       *
       * iOS ExpoImage es estricto: si el `Content-Type` viene como
       * `application/octet-stream` y además ve `X-Content-Type-Options:
       * nosniff`, se niega a renderizar la imagen aunque los bytes sean un
       * JPEG válido. Android es más laxo y hace sniffing por su cuenta. Por
       * eso el mismo avatar cargaba en Android pero no en iPhone.
       */
      let buffer = null;
      if (typeof body.transformToByteArray === "function") {
        const bytes = await body.transformToByteArray();
        buffer = Buffer.from(bytes);
      } else if (typeof body.pipe === "function") {
        buffer = await new Promise((resolve, reject) => {
          const chunks = [];
          body.on("data", (chunk) => chunks.push(chunk));
          body.on("end", () => resolve(Buffer.concat(chunks)));
          body.on("error", (err) => reject(err));
        });
      } else {
        console.warn("[vault proxy] unsupported S3 Body type for:", fileId);
        return false;
      }

      const storedMime = String(meta.mimeType || out.ContentType || "").trim();
      const orig = String(meta.originalFilename || "");
      const keyTail = String(meta.spacesKey || "").split("/").pop() || "";

      /** Magic-byte sniffer: cuando `storedMime` es genérico o ausente, miramos los primeros bytes. */
      const sniffedMime = sniffMimeFromBuffer(buffer);
      const extMime = mimeFromExt(orig) || mimeFromExt(keyTail) || null;

      const isGenericStored =
        !storedMime ||
        storedMime === "application/octet-stream" ||
        storedMime === "binary/octet-stream" ||
        !storedMime.includes("/");

      /**
       * Prioridad: MIME válido almacenado > sniff por magic bytes > extensión
       * del nombre de archivo > fallback octet-stream. Con esto, un avatar
       * subido hace meses con MIME `application/octet-stream` queda
       * correctamente etiquetado como `image/jpeg` si el cuerpo lo es.
       */
      const finalMime = !isGenericStored
        ? storedMime
        : sniffedMime || extMime || storedMime || "application/octet-stream";

      res.setHeader("Content-Type", finalMime);
      /**
       * No usamos `X-Content-Type-Options: nosniff` a propósito. Ya sniffeamos
       * nosotros (arriba) y seteamos el MIME correcto; dejar a iOS/Android
       * hacer su propio sniffing de respaldo no introduce riesgo adicional
       * porque el contenido proviene exclusivamente de nuestro bucket privado.
       */
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("Content-Length", String(buffer.length));
      const safeName = String(meta.originalFilename || "file").replace(/[^\w.\-]+/g, "_").slice(0, 180);
      res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);

      res.end(buffer);
      return true;
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
    deleteVaultFilePrivate,
    findVaultFileRecord,
    pipeVaultFileToResponse,
    isSpacesConfigured: () => Boolean(spaces),
    close,
  };
}

module.exports = {
  createMongoStorage,
};
