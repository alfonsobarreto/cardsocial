/**
 * Búsqueda semántica (intención) en Social Market vía Atlas $vectorSearch.
 *
 * POST /api/market/vector-search
 * Body: { q: string, limit?: number, includeSmart?: boolean }
 */
const express = require("express");
const { embedText, embeddingConfigured } = require("../services/cardVectorEmbedding");
const { searchMarketVectors } = require("../services/marketVectorSearch");

function createMarketVectorRoutes({ storage }) {
  const router = express.Router();

  router.post("/vector-search", express.json(), async (req, res) => {
    try {
      const uid = String(req.auth?.sub || "").trim();
      if (!uid) return res.status(401).json({ ok: false, error: "Unauthenticated" });

      if (!embeddingConfigured()) {
        return res.status(503).json({
          ok: false,
          error: "Embeddings not configured (set OPENAI_API_KEY or GEMINI_API_KEY and EMBEDDING_PROVIDER).",
        });
      }

      const q = String(req.body?.q ?? req.query?.q ?? "").trim();
      if (!q) return res.status(400).json({ ok: false, error: "q is required" });

      const limit = Math.min(50, Math.max(1, Number(req.body?.limit) || 20));
      const includeSmart = Boolean(req.body?.includeSmart);

      const { embedding } = await embedText(q, { geminiTaskType: "RETRIEVAL_QUERY" });
      const db = req.app.locals.db || (await storage.connect());
      const results = await searchMarketVectors(db, embedding, { limit, includeSmart });

      return res.status(200).json({ ok: true, q, limit, includeSmart, results });
    } catch (error) {
      console.error("[market] vector-search failed:", error);
      return res.status(500).json({ ok: false, error: error.message || "vector search failed" });
    }
  });

  return router;
}

module.exports = { createMarketVectorRoutes };
