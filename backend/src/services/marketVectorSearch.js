/**
 * Atlas Vector Search ($vectorSearch) sobre business_cards y smart_cards.
 *
 * Índice Atlas (crear en UI): ejemplo para OpenAI text-embedding-3-small (1536 dims):
 * {
 *   "fields": [
 *     {
 *       "type": "vector",
 *       "path": "marketEmbedding",
 *       "numDimensions": 1536,
 *       "similarity": "cosine"
 *     }
 *   ]
 * }
 * Con Gemini text-embedding-004 suele ser numDimensions: 768 (ajustar EMBEDDING_DIMENSIONS).
 */
const { env } = require("../config");

function vectorStage(indexName, path, queryVector, limit, numCandidates, filter) {
  return {
    $vectorSearch: {
      index: indexName,
      path,
      queryVector,
      numCandidates: numCandidates || Math.max(limit * 8, 100),
      limit,
      ...(filter && Object.keys(filter).length ? { filter } : {}),
    },
  };
}

function projectBusiness() {
  return {
    $project: {
      marketEmbedding: 0,
      marketEmbeddingSourceHash: 0,
    },
  };
}

function projectSmart() {
  return {
    $project: {
      marketEmbedding: 0,
      marketEmbeddingSourceHash: 0,
    },
  };
}

/**
 * @param {import('mongodb').Db} db
 * @param {number[]} queryVector
 * @param {{ limit?: number, includeSmart?: boolean, numCandidates?: number }} opts
 */
async function searchMarketVectors(db, queryVector, opts = {}) {
  const limit = Math.min(50, Math.max(1, opts.limit || 20));
  const includeSmart = Boolean(opts.includeSmart);
  const numCandidates = opts.numCandidates;
  const path = env.marketEmbeddingField;
  const idxBiz = env.atlasVectorIndexBusinessCards;
  const idxSmart = env.atlasVectorIndexSmartCards;

  if (!Array.isArray(queryVector) || queryVector.length === 0) {
    throw new Error("queryVector required");
  }

  const bizPipeline = [
    vectorStage(idxBiz, path, queryVector, limit, numCandidates, {
      isPublishedToMarket: true,
      isActive: true,
    }),
    { $set: { vectorScore: { $meta: "vectorSearchScore" }, _vectorKind: "business" } },
    projectBusiness(),
  ];

  const bizRows = await db.collection("business_cards").aggregate(bizPipeline).toArray();

  let smartRows = [];
  if (includeSmart) {
    const smartPipeline = [
      vectorStage(idxSmart, path, queryVector, limit, numCandidates, {}),
      { $set: { vectorScore: { $meta: "vectorSearchScore" }, _vectorKind: "smart" } },
      projectSmart(),
    ];
    smartRows = await db.collection("smart_cards").aggregate(smartPipeline).toArray();
  }

  const merged = [...bizRows, ...smartRows]
    .map((row) => ({
      kind: row._vectorKind || "business",
      score: typeof row.vectorScore === "number" ? row.vectorScore : null,
      bId: row.bId ? String(row.bId) : null,
      sid: row.sid ? String(row.sid) : null,
      ownerUid: String(row.ownerUid || row.uid || ""),
      bcName: row.bcName != null ? String(row.bcName) : null,
      bcContactName: row.bcContactName != null ? String(row.bcContactName) : null,
      bcLogoUrl: row.bcLogoUrl || null,
      userFullName: row.userFullName != null ? String(row.userFullName) : null,
      userOccupation: row.userOccupation != null ? String(row.userOccupation) : null,
      userNickname: row.userNickname != null ? String(row.userNickname) : null,
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);

  return merged;
}

module.exports = {
  searchMarketVectors,
};
