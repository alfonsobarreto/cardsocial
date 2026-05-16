/**
 * Genera services/i18n/creationLocales.json (ES, EN, IT, PT, FR, DE).
 * Ejecutar desde la raíz: node scripts/build-creation-locales.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '../services/i18n/creationLocales.json');

/** @param {string} es @param {string} en @param {string} [it] @param {string} [pt] @param {string} [fr] @param {string} [de] */
function six(es, en, it, pt, fr, de) {
  return { es, en, it: it ?? en, pt: pt ?? en, fr: fr ?? en, de: de ?? en };
}

const ROWS = {
  ...Object.fromEntries([]),
};

// --- merge all domain chunks (append below) ---
import { creationChunk } from './creation-locales-chunks.mjs';
Object.assign(ROWS, creationChunk);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(ROWS, null, 2), 'utf8');
console.log('Wrote', outPath, 'keys:', Object.keys(ROWS).length);
