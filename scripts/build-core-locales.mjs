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
import { components } from './i18n-core-chunks/components.mjs';
import { contacts } from './i18n-core-chunks/contacts.mjs';
import { nfc } from './i18n-core-chunks/nfc.mjs';
import { profile } from './i18n-core-chunks/profile.mjs';
import { dashboard } from './i18n-core-chunks/dashboard.mjs';
import { misc } from './i18n-core-chunks/misc.mjs';
import { qr } from './i18n-core-chunks/qr.mjs';
import { receptor } from './i18n-core-chunks/receptor.mjs';
import { search } from './i18n-core-chunks/search.mjs';
import { settings } from './i18n-core-chunks/settings.mjs';
import { subscription } from './i18n-core-chunks/subscription.mjs';
import { vault } from './i18n-core-chunks/vault.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '..', 'services', 'i18n', 'coreLocales.json');

const dict = {
  ...common,
  ...components,
  ...misc,
  ...biometric,
  ...qr,
  ...receptor,
  ...vault,
  ...settings,
  ...nfc,
  ...calls,
  ...contacts,
  ...search,
  ...cards,
  ...subscription,
  ...profile,
  ...dashboard,
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
