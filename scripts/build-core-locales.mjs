/**
 * Generates services/i18n/coreLocales.json (ES, EN, IT, PT-BR, FR, DE).
 * Run: node scripts/build-core-locales.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { biometric } from './i18n-core-chunks/biometric.mjs';
import { calls } from './i18n-core-chunks/calls.mjs';
import { cards } from './i18n-core-chunks/cards.mjs';
import { common } from './i18n-core-chunks/common.mjs';
import { contacts } from './i18n-core-chunks/contacts.mjs';
import { qr } from './i18n-core-chunks/qr.mjs';
import { receptor } from './i18n-core-chunks/receptor.mjs';
import { search } from './i18n-core-chunks/search.mjs';
import { vault } from './i18n-core-chunks/vault.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '..', 'services', 'i18n', 'coreLocales.json');

const dict = {
  ...common,
  ...biometric,
  ...qr,
  ...receptor,
  ...vault,
  ...calls,
  ...contacts,
  ...search,
  ...cards,
};

const keys = Object.keys(dict);
if (keys.length !== new Set(keys).size) {
  const seen = new Set();
  const dups = [];
  for (const k of keys) {
    if (seen.has(k)) dups.push(k);
    seen.add(k);
  }
  throw new Error(`Duplicate core locale keys: ${dups.join(', ')}`);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(dict, null, 2), 'utf8');
console.log('Wrote', out, 'keys:', keys.length);
