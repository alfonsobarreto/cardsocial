/**
 * Rellena marketEmbedding en business_cards (mercado publicado) y opcionalmente smart_cards.
 *
 * Requiere: MONGO_URI, OPENAI_API_KEY (o GEMINI_API_KEY + EMBEDDING_PROVIDER=gemini)
 * Uso desde carpeta backend:
 *   node scripts/backfill-market-embeddings.js
 *   node scripts/backfill-market-embeddings.js --smart
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { MongoClient } = require("mongodb");
const {
  embeddingConfigured,
  syncBusinessCardMarketEmbedding,
  syncSmartCardMarketEmbedding,
} = require("../src/services/cardVectorEmbedding");

async function main() {
  const uri = process.env.MONGO_URI || "";
  const dbName = process.env.MONGO_DB_NAME || "cardsocial";
  const includeSmart = process.argv.includes("--smart");

  if (!uri) {
    console.error("Missing MONGO_URI");
    process.exit(1);
  }
  if (!embeddingConfigured()) {
    console.error("Configure OPENAI_API_KEY or GEMINI_API_KEY + EMBEDDING_PROVIDER");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const bizCursor = db.collection("business_cards").find({
    isPublishedToMarket: true,
    isActive: { $ne: false },
  });
  let bizN = 0;
  for await (const doc of bizCursor) {
    await syncBusinessCardMarketEmbedding(db, doc);
    bizN++;
    if (bizN % 20 === 0) console.log("business_cards", bizN);
  }
  console.log("business_cards done:", bizN);

  if (includeSmart) {
    const smartCursor = db.collection("smart_cards").find({});
    let sN = 0;
    for await (const doc of smartCursor) {
      await syncSmartCardMarketEmbedding(db, doc);
      sN++;
      if (sN % 50 === 0) console.log("smart_cards", sN);
    }
    console.log("smart_cards done:", sN);
  }

  await client.close();
  console.log("Backfill complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
