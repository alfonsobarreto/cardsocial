const express = require("express");
const multer = require("multer");
const { formatSpacesEnvMissingError } = require("../config");

const upload = multer({ storage: multer.memoryStorage() });

function isImageMime(mimeType) {
  return String(mimeType || "").startsWith("image/");
}

/**
 * Multer suele recibir `application/octet-stream` desde React Native si el part no trae type;
 * corregimos por extensión para Spaces, proxy y clientes móviles.
 */
function normalizeVaultMimeType(mimetype, originalname) {
  const raw = String(mimetype || "").trim().toLowerCase();
  const name = String(originalname || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  if (raw && raw !== "application/octet-stream" && raw !== "binary/octet-stream") {
    return String(mimetype || "").trim();
  }
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic" || ext === ".heif") return "image/heic";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (ext === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (ext === ".txt") return "text/plain";
  return raw || "application/octet-stream";
}

function validateSize(file, limits, resolvedMime) {
  const mime = resolvedMime || file.mimetype;
  if (isImageMime(mime)) {
    if (file.size > limits.imageMaxBytes) {
      return `Image exceeds ${Math.floor(limits.imageMaxBytes / (1024 * 1024))}MB limit`;
    }
    return null;
  }

  if (file.size > limits.docMaxBytes) {
    return `Document exceeds ${Math.floor(limits.docMaxBytes / (1024 * 1024))}MB limit`;
  }

  return null;
}

/**
 * @param {object} opts
 * @param {function(string): string} opts.buildVaultAccessUrl - URL pública del proxy (sin exponer Spaces)
 */
function createModerationRoutes({ azureSafety, storage, limits, middlewares = [], buildVaultAccessUrl }) {
  const router = express.Router();

  router.post("/moderate/text", express.json(), async (req, res) => {
    try {
      const text = String(req.body?.text || "").trim();
      if (!text) {
        return res.status(400).json({ ok: false, error: "text is required" });
      }

      const moderation = await azureSafety.moderateText(text);
      await storage.saveModerationAudit({
        type: "text",
        textPreview: text.slice(0, 200),
        blocked: moderation.blocked,
        maxSeverity: moderation.maxSeverity,
      });

      return res.status(200).json({
        ok: true,
        blocked: moderation.blocked,
        maxSeverity: moderation.maxSeverity,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post("/upload", ...middlewares, upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ ok: false, error: "file is required (multipart field name: file)" });
      }

      if (!storage.isSpacesConfigured || !storage.isSpacesConfigured()) {
        return res.status(503).json({
          ok: false,
          error: formatSpacesEnvMissingError(),
        });
      }

      const ownerUid = String(req.body?.ownerUid || "").trim();
      const label = String(req.body?.label || "").trim();
      const resolvedMime = normalizeVaultMimeType(file.mimetype, file.originalname);

      const sizeError = validateSize(file, limits, resolvedMime);
      if (sizeError) {
        return res.status(400).json({ ok: false, error: sizeError });
      }
      console.log("[POST /api/upload] recibido", {
        label,
        ownerUid: ownerUid ? `${ownerUid.slice(0, 6)}…` : "(vacío)",
        bytes: file.size,
        mime: resolvedMime,
        mimeRaw: file.mimetype,
        name: file.originalname,
      });

      let moderation;
      if (isImageMime(resolvedMime)) {
        moderation = await azureSafety.moderateImageBuffer(file.buffer);
      } else {
        const textToModerate = `${file.originalname} ${label}`.trim();
        moderation = await azureSafety.moderateText(textToModerate);
      }

      await storage.saveModerationAudit({
        type: "file",
        ownerUid,
        fileName: file.originalname,
        mimeType: resolvedMime,
        size: file.size,
        blocked: moderation.blocked,
        maxSeverity: moderation.maxSeverity,
      });

      if (moderation.blocked) {
        return res.status(403).json({
          ok: false,
          error: "File blocked by Azure Content Safety",
          maxSeverity: moderation.maxSeverity,
        });
      }

      const { fileId } = await storage.uploadVaultFilePrivate({
        fileBuffer: file.buffer,
        filename: file.originalname,
        mimeType: resolvedMime,
        ownerUid,
        label,
      });

      const accessUrl = buildVaultAccessUrl(fileId);
      console.log("[POST /api/upload] guardado OK", { label, fileId, publicUrl: accessUrl });

      await storage.saveModerationAudit({
        type: "file_stored",
        ownerUid,
        fileName: file.originalname,
        mimeType: resolvedMime,
        size: file.size,
        blocked: false,
        maxSeverity: moderation.maxSeverity,
        vaultFileId: fileId,
        proxyUrl: accessUrl,
      });

      return res.status(201).json({
        ok: true,
        fileId,
        filename: file.originalname,
        publicUrl: accessUrl,
        mimeType: resolvedMime,
        moderated: true,
      });
    } catch (error) {
      console.error("[POST /api/upload] error", error?.message || error, error?.stack);
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

module.exports = {
  createModerationRoutes,
};
