/**
 * Genera un lote de tarjetas NFC pre-provisionadas.
 *
 * Uso desde la raíz del repo:
 *   node backend/scripts/generateNfcBatch.js 5
 *
 * Uso desde /backend:
 *   node scripts/generateNfcBatch.js 5
 *
 * Requiere MONGO_URI y opcionalmente MONGO_DB_NAME en backend/.env.
 * Exporta: backend/nfc_batch_results.csv
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || '';
const dbName = process.env.MONGO_DB_NAME || 'cardsocial';
const PUBLIC_BASE_URL = String(process.env.PUBLIC_UNIVERSAL_CARD_BASE_URL || 'https://cardsocial.me').replace(/\/+$/, '');
const PREFIX = 'CS-METAL';
const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PIN_LENGTH = 6;

function parseCount(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 500) {
    throw new Error('Cantidad inválida. Usa un entero entre 1 y 500. Ej: node backend/scripts/generateNfcBatch.js 5');
  }
  return n;
}

function padId(n) {
  return String(n).padStart(3, '0');
}

function makePin() {
  let out = '';
  for (let i = 0; i < PIN_LENGTH; i += 1) {
    out += PIN_ALPHABET[crypto.randomInt(0, PIN_ALPHABET.length)];
  }
  return out;
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function readNextSequence(col) {
  const regex = `^${PREFIX}-\\d{3,}$`;
  const existing = await col
    .find({ nfcCardId: { $regex: regex } }, { projection: { nfcCardId: 1 } })
    .toArray();

  let max = 0;
  for (const doc of existing) {
    const match = String(doc.nfcCardId || '').match(new RegExp(`^${PREFIX}-(\\d+)$`));
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 1;
}

async function main() {
  const count = parseCount(process.argv[2]);
  if (!uri) {
    throw new Error('Missing MONGO_URI in backend/.env');
  }

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db(dbName);
    const col = db.collection('nfc_cards');
    const start = await readNextSequence(col);
    const now = new Date();
    const rows = [];
    const docs = [];

    for (let i = 0; i < count; i += 1) {
      const seq = start + i;
      const nfcCardId = `${PREFIX}-${padId(seq)}`;
      const activationPin = makePin();
      const nfcUrl = `${PUBLIC_BASE_URL}/n/${encodeURIComponent(nfcCardId)}`;

      docs.push({
        nfcCardId,
        activationPin,
        isClaimed: false,
        activatedAt: null,
        ownerUid: null,
        label: `Black & Gold Metal ${padId(seq)}`,
        material: 'metal',
        status: 'unclaimed',
        mountedTarget: null,
        fallbackTarget: null,
        recoveryContact: null,
        lastMountedAt: null,
        lastConfirmedAt: null,
        lastResolvedAt: null,
        createdAt: now,
        updatedAt: now,
        version: 0,
      });

      rows.push({
        nfcCardId,
        activationPin,
        nfcUrl,
        label: `Black & Gold Metal ${padId(seq)}`,
      });
    }

    await col.insertMany(docs, { ordered: true });

    const csvPath = path.join(__dirname, '..', 'nfc_batch_results.csv');
    const header = ['nfcCardId', 'activationPin', 'nfcUrl', 'label'];
    const csv = [
      header.join(','),
      ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(',')),
    ].join('\n');

    fs.writeFileSync(csvPath, `${csv}\n`, 'utf8');

    console.log(`NFC batch generated: ${rows.length} card(s).`);
    console.log(`Mongo DB: ${dbName}`);
    console.log(`CSV: ${csvPath}`);
    console.log('');
    for (const row of rows) {
      console.log(`${row.nfcCardId}  PIN=${row.activationPin}  URL=${row.nfcUrl}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('[generateNfcBatch]', error.message || error);
  process.exit(1);
});
