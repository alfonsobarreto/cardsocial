/**
 * GET /api/vault/file/:fileId — proxy de descarga enmascarado (DigitalOcean Spaces interno).
 */

const express = require("express");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createVaultFileProxyRoutes({ storage }) {
  const router = express.Router();

  router.get("/file/:fileId", async (req, res) => {
    try {
      const fileId = String(req.params.fileId || "").trim();
      console.log("Buscando archivo con ID:", fileId);
      if (!UUID_RE.test(fileId)) {
        return res.status(400).send("Invalid file id");
      }

      const ok = await storage.pipeVaultFileToResponse(fileId, res);
      if (!ok) {
        if (!res.headersSent) {
          return res.status(404).send("File not found");
        }
        return;
      }
    } catch (e) {
      console.error("[GET /api/vault/file]", e?.message || e);
      if (!res.headersSent) {
        return res.status(500).send("Proxy error");
      }
    }
  });

  return router;
}

module.exports = {
  createVaultFileProxyRoutes,
};
