/**
 * Búsqueda semántica (intención) en Social Market vía Atlas $vectorSearch.
 *
 * POST /api/market/vector-search
 * Body: { q: string, limit?: number, includeSmart?: boolean }
 */
const express = require("express");
const crypto = require("crypto");
const { embedText, embeddingConfigured } = require("../services/cardVectorEmbedding");
const { searchMarketVectors } = require("../services/marketVectorSearch");

const SEO_SYNONYM_GROUPS = [
  { niche: "uñas", words: ["nails", "nail", "uña", "uñas", "unas", "manicura", "manicure", "manicurist", "manicurista"] },
  { niche: "belleza", words: ["hair", "pelo", "cabello", "peluqueria", "peluquería", "barber", "barberia", "barbería", "barbershop", "estilista", "esthetic", "estetica", "estética", "spa", "facial", "cosmetology", "cosmetologia", "cosmetología"] },
  { niche: "web", words: ["web", "website", "pagina", "página", "sitio", "developer", "desarrollo", "diseño", "diseno"] },
  { niche: "legal", words: ["lawyer", "abogado", "abogada", "legal", "leyes"] },
  { niche: "dental", words: ["dentist", "dentista", "dental", "odontologia", "odontología"] },
  { niche: "mascotas", words: ["vet", "veterinario", "veterinaria", "mascota"] },
  { niche: "fitness", words: ["gym", "gimnasio", "fitness", "entrenador"] },
  { niche: "finanzas", words: ["bank", "banco", "banking", "banca", "finanzas", "finance", "financial", "financiero"] },
];

function normalizeMarketKeyword(raw) {
  const base = String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "";
  const first = base.split(/\s+/)[0] || "";
  for (const group of SEO_SYNONYM_GROUPS) {
    const roots = group.words.map((w) =>
      String(w)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase(),
    );
    if (roots.includes(first)) {
      return roots[0];
    }
  }
  return first.replace(/s$/i, "");
}

function normalizeZipcode(raw) {
  const zip = String(raw || "").trim().replace(/[^\w-]/g, "").slice(0, 16).toUpperCase();
  return zip || null;
}

function normalizeGeoText(raw) {
  const text = String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return text || null;
}

function displayGeoText(raw, max = 140) {
  const text = String(raw || "").trim().replace(/\s+/g, " ").slice(0, max);
  return text || null;
}

function marketPeriodWindow(modeRaw, offsetRaw) {
  const mode = ["day", "week", "month", "year"].includes(String(modeRaw)) ? String(modeRaw) : "week";
  const offset = Math.min(0, Number.parseInt(String(offsetRaw || "0"), 10) || 0);
  const now = new Date();
  const target = new Date(now);
  if (mode === "day") target.setDate(target.getDate() + offset);
  if (mode === "week") target.setDate(target.getDate() + offset * 7);
  if (mode === "month") target.setMonth(target.getMonth() + offset);
  if (mode === "year") target.setFullYear(target.getFullYear() + offset);
  const start = new Date(target);
  if (mode === "day") {
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { mode, offset, start, end };
  }
  if (mode === "week") {
    start.setHours(0, 0, 0, 0);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { mode, offset, start, end };
  }
  if (mode === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { mode, offset, start, end };
  }
  start.setMonth(0, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  return { mode, offset, start, end };
}

function keywordNiche(raw) {
  const root = normalizeMarketKeyword(raw);
  if (!root) return "general";
  for (const group of SEO_SYNONYM_GROUPS) {
    if (group.words.some((word) => normalizeMarketKeyword(word) === root)) {
      return group.niche;
    }
  }
  return "general";
}

function cardSeoKeywords(card) {
  const values = [];
  const push = (v) => {
    const s = String(v || "").trim();
    if (s) values.push(s);
  };
  if (Array.isArray(card?.bcKeywords)) {
    card.bcKeywords.forEach(push);
  }
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function buildLocationScope({ card, query }) {
  const q = String(query || "").trim();
  if (q) {
    const zip = normalizeZipcode(q);
    if (/^\d{4,10}(-\d{3,6})?$/i.test(zip || "")) {
      return {
        mode: "zipcode",
        match: { zipcode: zip },
        zipcode: zip,
        city: null,
        label: zip,
        source: "explorer",
      };
    }
    const cityNorm = normalizeGeoText(q);
    return {
      mode: "city",
      match: { cityNorm },
      zipcode: null,
      city: q,
      label: q,
      source: "explorer",
    };
  }
  const zip = normalizeZipcode(card?.bcZipcode || card?.postalCode || card?.bcPostalCode);
  if (zip) {
    return {
      mode: "zipcode",
      match: { zipcode: zip },
      zipcode: zip,
      city: displayGeoText(card?.bcCity),
      label: displayGeoText(card?.bcGeoLabel) || [card?.bcCity, card?.bcRegion, zip].filter(Boolean).join(", ") || zip,
      source: "card_location",
    };
  }
  const cityNorm = normalizeGeoText(card?.bcCity);
  if (cityNorm) {
    return {
      mode: "city",
      match: { cityNorm },
      zipcode: null,
      city: displayGeoText(card?.bcCity),
      label: displayGeoText(card?.bcGeoLabel) || [card?.bcCity, card?.bcRegion].filter(Boolean).join(", "),
      source: "card_location",
    };
  }
  return {
    mode: "all",
    match: {},
    zipcode: null,
    city: null,
    label: "Zona acumulada",
    source: "fallback",
  };
}

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

  router.post("/searches/track", express.json(), async (req, res) => {
    try {
      const uid = String(req.auth?.sub || "").trim();
      if (!uid) return res.status(401).json({ ok: false, error: "Unauthenticated" });

      const q = String(req.body?.q || req.body?.keyword || "").trim().slice(0, 160);
      const keywordRoot = normalizeMarketKeyword(req.body?.keywordRoot || q);
      if (!keywordRoot) return res.status(400).json({ ok: false, error: "keyword is required" });

      const zipcode = normalizeZipcode(req.body?.zipcode);
      const city = displayGeoText(req.body?.city);
      const region = displayGeoText(req.body?.region);
      const country = displayGeoText(req.body?.country);
      const geoLabel = displayGeoText(req.body?.geoLabel);
      const latitude = Number(req.body?.latitude);
      const longitude = Number(req.body?.longitude);
      const resultBIds = Array.isArray(req.body?.resultBIds)
        ? req.body.resultBIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 80)
        : [];
      const timestamp = req.body?.timestamp ? new Date(req.body.timestamp) : new Date();
      if (Number.isNaN(timestamp.getTime())) return res.status(400).json({ ok: false, error: "invalid timestamp" });

      const db = req.app.locals.db || (await storage.connect());
      const doc = {
        _id: `s:${timestamp.getTime()}:${crypto.randomBytes(5).toString("hex")}`,
        kind: "search",
        viewerUid: uid,
        q,
        keywordRoot,
        niche: keywordNiche(keywordRoot),
        zipcode,
        city,
        cityNorm: normalizeGeoText(city),
        region,
        country,
        geoLabel,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        resultBIds,
        timestamp,
        createdAt: new Date(),
      };
      await db.collection("market_searches").insertOne(doc);
      return res.status(200).json({ ok: true, keywordRoot, zipcode, searchId: doc._id });
    } catch (error) {
      console.error("[market] searches/track failed:", error);
      return res.status(500).json({ ok: false, error: error.message || "search track failed" });
    }
  });

  router.post("/searches/click", express.json(), async (req, res) => {
    try {
      const uid = String(req.auth?.sub || "").trim();
      if (!uid) return res.status(401).json({ ok: false, error: "Unauthenticated" });

      const bId = String(req.body?.bId || "").trim();
      const q = String(req.body?.q || req.body?.keyword || "").trim().slice(0, 160);
      const keywordRoot = normalizeMarketKeyword(req.body?.keywordRoot || q);
      if (!bId || !keywordRoot) return res.status(400).json({ ok: false, error: "bId and keyword are required" });

      const zipcode = normalizeZipcode(req.body?.zipcode);
      const city = displayGeoText(req.body?.city);
      const region = displayGeoText(req.body?.region);
      const country = displayGeoText(req.body?.country);
      const geoLabel = displayGeoText(req.body?.geoLabel);
      const timestamp = req.body?.timestamp ? new Date(req.body.timestamp) : new Date();
      if (Number.isNaN(timestamp.getTime())) return res.status(400).json({ ok: false, error: "invalid timestamp" });

      const db = req.app.locals.db || (await storage.connect());
      await db.collection("market_searches").insertOne({
        _id: `c:${bId}:${timestamp.getTime()}:${crypto.randomBytes(4).toString("hex")}`,
        kind: "card_click",
        viewerUid: uid,
        bId,
        q,
        keywordRoot,
        niche: keywordNiche(keywordRoot),
        zipcode,
        city,
        cityNorm: normalizeGeoText(city),
        region,
        country,
        geoLabel,
        timestamp,
        createdAt: new Date(),
      });
      return res.status(200).json({ ok: true, keywordRoot, zipcode });
    } catch (error) {
      console.error("[market] searches/click failed:", error);
      return res.status(500).json({ ok: false, error: error.message || "search click failed" });
    }
  });

  router.get("/seo/card/:bId/summary", async (req, res) => {
    try {
      const uid = String(req.auth?.sub || "").trim();
      if (!uid) return res.status(401).json({ ok: false, error: "Unauthenticated" });
      const bId = String(req.params?.bId || "").trim();
      if (!bId) return res.status(400).json({ ok: false, error: "bId is required" });

      const db = req.app.locals.db || (await storage.connect());
      const card = await db.collection("business_cards").findOne({ ownerUid: uid, bId });
      if (!card) return res.status(404).json({ ok: false, error: "Card not found for this owner" });

      const keywords = cardSeoKeywords(card);
      const rootsByLabel = keywords.map((label) => ({ label, root: normalizeMarketKeyword(label) })).filter((x) => x.root);
      const rootSet = new Set(rootsByLabel.map((x) => x.root));
      const scope = buildLocationScope({ card, query: req.query?.locationQuery || req.query?.zipcode });
      const baseMatch = scope.match || {};

      const searchAgg = await db.collection("market_searches").aggregate([
        { $match: { kind: "search", ...baseMatch, keywordRoot: { $in: Array.from(rootSet) } } },
        { $group: { _id: "$keywordRoot", totalSearches: { $sum: 1 } } },
      ]).toArray();
      const clickAgg = await db.collection("market_searches").aggregate([
        { $match: { kind: "card_click", bId, ...baseMatch, keywordRoot: { $in: Array.from(rootSet) } } },
        { $group: { _id: "$keywordRoot", myClicks: { $sum: 1 } } },
      ]).toArray();
      const searchesByRoot = new Map(searchAgg.map((row) => [String(row._id), Number(row.totalSearches || 0)]));
      const clicksByRoot = new Map(clickAgg.map((row) => [String(row._id), Number(row.myClicks || 0)]));
      const rows = rootsByLabel.map(({ label, root }) => {
        const totalSearches = searchesByRoot.get(root) || 0;
        const myClicks = clicksByRoot.get(root) || 0;
        const percent = totalSearches > 0 ? Math.round((myClicks / totalSearches) * 100) : 0;
        return { keyword: label, keywordRoot: root, totalSearches, myClicks, percent };
      }).sort((a, b) => {
        if (a.percent === 0 && b.percent === 0) return a.keyword.localeCompare(b.keyword, "es", { sensitivity: "base" });
        return b.percent - a.percent || b.myClicks - a.myClicks || a.keyword.localeCompare(b.keyword, "es", { sensitivity: "base" });
      });

      const nicheCounts = new Map();
      for (const { root } of rootsByLabel) {
        const n = keywordNiche(root);
        nicheCounts.set(n, (nicheCounts.get(n) || 0) + 1);
      }
      const niche = [...nicheCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "general";
      const topRows = await db.collection("market_searches").aggregate([
        { $match: { kind: "search", ...baseMatch, ...(niche !== "general" ? { niche } : {}) } },
        { $group: { _id: "$keywordRoot", totalSearches: { $sum: 1 } } },
        { $sort: { totalSearches: -1, _id: 1 } },
        { $limit: 25 },
      ]).toArray();
      const top = topRows.find((row) => !rootSet.has(String(row._id)));

      return res.status(200).json({
        ok: true,
        bId,
        zipcode: scope.zipcode,
        city: scope.city,
        locationMode: scope.mode,
        locationLabel: scope.label,
        locationSource: scope.source,
        cardLocationUpdatedAt: card.bcLocationUpdatedAt ? new Date(card.bcLocationUpdatedAt).toISOString() : null,
        niche,
        rows,
        topNicheKeyword: top ? String(top._id) : null,
        topNicheSearches: top ? Number(top.totalSearches || 0) : 0,
      });
    } catch (error) {
      console.error("[market] seo summary failed:", error);
      return res.status(500).json({ ok: false, error: error.message || "seo summary failed" });
    }
  });

  router.get("/seo/heatmap", async (req, res) => {
    try {
      const uid = String(req.auth?.sub || "").trim();
      if (!uid) return res.status(401).json({ ok: false, error: "Unauthenticated" });

      const keywordRoot = normalizeMarketKeyword(req.query?.keyword || req.query?.keywordRoot || "");
      if (!keywordRoot) return res.status(400).json({ ok: false, error: "keyword is required" });

      const window = marketPeriodWindow(req.query?.periodMode, req.query?.periodOffset);
      const locationQuery = String(req.query?.locationQuery || "").trim();
      const baseMatch = {};
      if (locationQuery) {
        const zip = normalizeZipcode(locationQuery);
        if (/^\d{4,10}(-\d{3,6})?$/i.test(zip || "")) {
          baseMatch.zipcode = zip;
        } else {
          baseMatch.cityNorm = normalizeGeoText(locationQuery);
        }
      }

      const db = req.app.locals.db || (await storage.connect());
      const docs = await db.collection("market_searches").aggregate([
        {
          $match: {
            kind: "search",
            keywordRoot,
            ...baseMatch,
            latitude: { $type: "number" },
            longitude: { $type: "number" },
            timestamp: { $gte: window.start, $lt: window.end },
          },
        },
        {
          $project: {
            latBucket: { $round: ["$latitude", 2] },
            lngBucket: { $round: ["$longitude", 2] },
            zipcode: 1,
            city: 1,
            region: 1,
            geoLabel: 1,
          },
        },
        {
          $group: {
            _id: { lat: "$latBucket", lng: "$lngBucket" },
            count: { $sum: 1 },
            zipcode: { $first: "$zipcode" },
            city: { $first: "$city" },
            region: { $first: "$region" },
            geoLabel: { $first: "$geoLabel" },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 80 },
      ]).toArray();

      const maxCount = Math.max(1, ...docs.map((row) => Number(row.count || 0)));
      const points = docs.map((row) => {
        const count = Number(row.count || 0);
        return {
          latitude: Number(row._id.lat),
          longitude: Number(row._id.lng),
          count,
          intensity: Math.max(0.2, Math.min(1, count / maxCount)),
          zipcode: normalizeZipcode(row.zipcode),
          city: displayGeoText(row.city),
          region: displayGeoText(row.region),
          label: displayGeoText(row.geoLabel) || [row.city, row.region, row.zipcode].filter(Boolean).join(", "),
        };
      });

      return res.status(200).json({
        ok: true,
        keywordRoot,
        periodMode: window.mode,
        periodOffset: window.offset,
        startAt: window.start.toISOString(),
        endAt: window.end.toISOString(),
        locationQuery: locationQuery || null,
        points,
      });
    } catch (error) {
      console.error("[market] seo heatmap failed:", error);
      return res.status(500).json({ ok: false, error: error.message || "seo heatmap failed" });
    }
  });

  return router;
}

module.exports = { createMarketVectorRoutes };
