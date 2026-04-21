/**
 * Embeddings para búsqueda por intención (Social Market) — OpenAI o Gemini.
 * Campo BSON: `marketEmbedding` (array de float), alineado con el índice vectorial de Atlas.
 */
const crypto = require("crypto");
const axios = require("axios");
const { env } = require("../config");

const MAX_CHARS = 24000;

function truncateForEmbed(text) {
  const s = String(text || "").trim();
  if (!s) return "";
  return s.length <= MAX_CHARS ? s : s.slice(0, MAX_CHARS);
}

function hashSourceText(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function buildBusinessCardEmbeddingText(doc) {
  if (!doc) return "";
  const facets = Array.isArray(doc.bcMarketFacets) ? doc.bcMarketFacets : [];
  const facetLines = facets
    .map((f) => {
      const type = String(f?.type || "").trim();
      const label = String(f?.label || "").trim();
      const value = String(f?.value || "").trim();
      return [type, label, value].filter(Boolean).join(" · ");
    })
    .filter(Boolean);
  const keywords = Array.isArray(doc.bcKeywords) ? doc.bcKeywords.map((k) => String(k).trim()).filter(Boolean) : [];
  const slots = Array.isArray(doc.publicCardSlots) ? doc.publicCardSlots : [];
  const slotLines = slots
    .map((s) => {
      const label = String(s?.label || "").trim();
      const value = String(s?.value || "").trim();
      const type = String(s?.type || "").trim();
      return [label, value, type].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  const parts = [
    "Business profile for semantic search.",
    doc.bcName && `Trade name: ${doc.bcName}`,
    doc.bcContactName && `Contact: ${doc.bcContactName}`,
    doc.bcPhysicalAddress && `Address: ${doc.bcPhysicalAddress}`,
    keywords.length && `Keywords: ${keywords.join(", ")}`,
    facetLines.length && `Services / facets:\n${facetLines.join("\n")}`,
    slotLines.length && `Public links and data:\n${slotLines.join("\n")}`,
  ].filter(Boolean);
  return truncateForEmbed(parts.join("\n"));
}

function buildSmartCardEmbeddingText(doc) {
  if (!doc) return "";
  const slots = Array.isArray(doc.publicCardSlots) ? doc.publicCardSlots : [];
  const slotLines = slots
    .map((s) => {
      const label = String(s?.label || "").trim();
      const value = String(s?.value || "").trim();
      const type = String(s?.type || "").trim();
      return [label, value, type].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  const parts = [
    "Personal / professional card for semantic search.",
    doc.userFullName && `Name: ${doc.userFullName}`,
    doc.userNickname && `Nickname: ${doc.userNickname}`,
    doc.userOccupation && `Occupation: ${doc.userOccupation}`,
    slotLines.length && `Public profile slots:\n${slotLines.join("\n")}`,
  ].filter(Boolean);
  return truncateForEmbed(parts.join("\n"));
}

function embeddingConfigured() {
  if (env.embeddingProvider === "gemini") return Boolean(env.geminiApiKey);
  return Boolean(env.openAiApiKey);
}

async function embedWithOpenAI(text) {
  const input = truncateForEmbed(text);
  if (!input) throw new Error("embedding: empty text");
  if (!env.openAiApiKey) throw new Error("OPENAI_API_KEY is not set");

  const body = {
    model: env.openAiEmbeddingModel,
    input,
  };
  const dims = env.embeddingDimensions;
  if (dims && env.openAiEmbeddingModel.includes("text-embedding-3")) {
    body.dimensions = dims;
  }

  const { data } = await axios.post("https://api.openai.com/v1/embeddings", body, {
    headers: {
      Authorization: `Bearer ${env.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 60000,
  });
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb)) throw new Error("OpenAI embeddings: unexpected response");
  return { embedding: emb, model: env.openAiEmbeddingModel };
}

async function embedWithGemini(text, taskType) {
  const input = truncateForEmbed(text);
  if (!input) throw new Error("embedding: empty text");
  if (!env.geminiApiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = env.geminiEmbeddingModel.replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;
  const body = {
    model: `models/${model}`,
    content: { parts: [{ text: input }] },
  };
  if (env.embeddingDimensions) {
    body.outputDimensionality = env.embeddingDimensions;
  }
  if (taskType) {
    body.taskType = taskType;
  }
  const { data } = await axios.post(url, body, {
    params: { key: env.geminiApiKey },
    timeout: 60000,
  });
  const values = data?.embedding?.values;
  if (!Array.isArray(values)) throw new Error("Gemini embedContent: unexpected response");
  return { embedding: values, model: model };
}

/**
 * @param {string} text
 * @param {{ geminiTaskType?: string }} [opts] RETRIEVAL_QUERY vs RETRIEVAL_DOCUMENT (Gemini)
 * @returns {Promise<{ embedding: number[], model: string }>}
 */
async function embedText(text, opts = {}) {
  if (env.embeddingProvider === "gemini") {
    return embedWithGemini(text, opts.geminiTaskType);
  }
  return embedWithOpenAI(text);
}

async function syncBusinessCardMarketEmbedding(db, doc) {
  const field = env.marketEmbeddingField;
  const bId = String(doc?.bId || "").trim();
  if (!bId || !db) return;

  const published = Boolean(doc.isPublishedToMarket);
  const active = doc.isActive !== false;
  if (!published || !active) {
    await db.collection("business_cards").updateOne(
      { bId },
      {
        $unset: {
          [field]: "",
          marketEmbeddingSourceHash: "",
          marketEmbeddedAt: "",
          marketEmbeddingModel: "",
        },
      },
    );
    return;
  }

  const source = buildBusinessCardEmbeddingText(doc);
  const h = hashSourceText(source);
  if (!source) return;
  if (doc.marketEmbeddingSourceHash === h && Array.isArray(doc[field]) && doc[field].length > 0) {
    return;
  }

  const { embedding, model } = await embedText(source, { geminiTaskType: "RETRIEVAL_DOCUMENT" });
  await db.collection("business_cards").updateOne(
    { bId },
    {
      $set: {
        [field]: embedding,
        marketEmbeddingSourceHash: h,
        marketEmbeddedAt: new Date(),
        marketEmbeddingModel: model,
      },
    },
  );
}

/**
 * Solo indexa smart_cards con texto útil (ocupación o slots); evita ruido en el índice.
 */
async function syncSmartCardMarketEmbedding(db, doc) {
  const field = env.marketEmbeddingField;
  const sid = String(doc?.sid || "").trim();
  if (!sid || !db) return;

  const source = buildSmartCardEmbeddingText(doc);
  const hasSignal =
    String(doc.userOccupation || "").trim().length > 2 ||
    (Array.isArray(doc.publicCardSlots) && doc.publicCardSlots.length > 0);
  if (!hasSignal || !source) {
    await db.collection("smart_cards").updateOne(
      { sid },
      {
        $unset: {
          [field]: "",
          marketEmbeddingSourceHash: "",
          marketEmbeddedAt: "",
          marketEmbeddingModel: "",
        },
      },
    );
    return;
  }

  const h = hashSourceText(source);
  if (doc.marketEmbeddingSourceHash === h && Array.isArray(doc[field]) && doc[field].length > 0) {
    return;
  }

  const { embedding, model } = await embedText(source, { geminiTaskType: "RETRIEVAL_DOCUMENT" });
  await db.collection("smart_cards").updateOne(
    { sid },
    {
      $set: {
        [field]: embedding,
        marketEmbeddingSourceHash: h,
        marketEmbeddedAt: new Date(),
        marketEmbeddingModel: model,
      },
    },
  );
}

function scheduleBusinessCardEmbeddingSync(db, doc) {
  if (!embeddingConfigured()) return;
  setImmediate(() => {
    syncBusinessCardMarketEmbedding(db, doc).catch((e) =>
      console.warn("[embedding] business_cards sync failed:", e?.message || e),
    );
  });
}

module.exports = {
  buildBusinessCardEmbeddingText,
  buildSmartCardEmbeddingText,
  hashSourceText,
  embedText,
  embeddingConfigured,
  syncBusinessCardMarketEmbedding,
  syncSmartCardMarketEmbedding,
  scheduleBusinessCardEmbeddingSync,
};
