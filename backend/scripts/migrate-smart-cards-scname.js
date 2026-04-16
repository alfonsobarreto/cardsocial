/**
 * One-time: copia `name` → `scName` en MongoDB `smart_cards` y elimina `name`.
 *
 * Uso (desde la carpeta backend):
 *   node scripts/migrate-smart-cards-scname.js
 *
 * Requiere MONGO_URI y opcionalmente MONGO_DB_NAME en `.env`.
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || '';
const dbName = process.env.MONGO_DB_NAME || 'cardsocial';

async function main() {
  if (!uri) {
    console.error('Missing MONGO_URI');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection('smart_cards');

  const cursor = col.find({ name: { $exists: true } }, { projection: { _id: 1, name: 1, scName: 1 } });
  let updated = 0;
  for await (const doc of cursor) {
    const sc =
      doc.scName != null && String(doc.scName).trim() !== ''
        ? String(doc.scName).trim()
        : String(doc.name || 'Smart Card').trim();
    await col.updateOne(
      { _id: doc._id },
      { $set: { scName: sc }, $unset: { name: '' } },
    );
    updated += 1;
  }

  console.log(`migrate-smart-cards-scname: updated ${updated} document(s).`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
