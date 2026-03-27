const express = require("express");
const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage() });

function isImageMime(mimeType) {
  return mimeType.startsWith("image/");
}

function validateSize(file, limits) {
  if (isImageMime(file.mimetype)) {
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

function createModerationRoutes({ azureSafety, storage, limits, middlewares = [] }) {
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

      const sizeError = validateSize(file, limits);
      if (sizeError) {
        return res.status(400).json({ ok: false, error: sizeError });
      }

      const ownerUid = String(req.body?.ownerUid || "").trim();
      const label = String(req.body?.label || "").trim();

      let moderation;
      if (isImageMime(file.mimetype)) {
        moderation = await azureSafety.moderateImageBuffer(file.buffer);
      } else {
        // For non-image files, moderate associated text metadata.
        const textToModerate = `${file.originalname} ${label}`.trim();
        moderation = await azureSafety.moderateText(textToModerate);
      }

      await storage.saveModerationAudit({
        type: "file",
        ownerUid,
        fileName: file.originalname,
        mimeType: file.mimetype,
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

      // El archivo pasó la moderación — decidir destino de almacenamiento:
      // 1. Imágenes → DO Spaces (CDN público, URL real servible)
      // 2. Documentos → MongoDB GridFS (privados, acceso por fileId)
      let saveResult;
      let publicUrl = null;

      if (isImageMime(file.mimetype)) {
        // Inferir carpeta según label: profile-photo, verification-selfie, vault-doc, etc.
        const folder = label
          ? `user-uploads/${String(label).replace(/[^a-zA-Z0-9-]/g, "-")}`
          : "user-uploads/misc";

        publicUrl = await storage.saveFileToSpaces({
          fileBuffer: file.buffer,
          filename: file.originalname,
          mimeType: file.mimetype,
          folder,
        });
      }

      if (!publicUrl) {
        // Fallback: guardar en MongoDB GridFS (documentos o si DO Spaces no está configurado)
        saveResult = await storage.saveFile({
          fileBuffer: file.buffer,
          filename: file.originalname,
          mimeType: file.mimetype,
          metadata: {
            ownerUid,
            label,
            moderated: true,
            maxSeverity: moderation.maxSeverity,
            uploadDateISO: new Date().toISOString(),
          },
        });
      } else {
        // Para imágenes en DO Spaces, guardamos solo un registro de auditoría mínimo en Mongo
        await storage.saveModerationAudit({
          type: "file",
          ownerUid,
          fileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          blocked: false,
          maxSeverity: moderation.maxSeverity,
          publicUrl,
        });
        saveResult = { fileId: `spaces://${publicUrl}`, filename: file.originalname };
      }

      return res.status(201).json({
        ok: true,
        fileId: saveResult.fileId,
        filename: saveResult.filename,
        publicUrl: publicUrl || null,
        moderated: true,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

module.exports = {
  createModerationRoutes,
};
