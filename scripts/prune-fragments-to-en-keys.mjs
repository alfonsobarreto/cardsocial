/**
 * Alinea fr/it/pt.fragment.json con las claves de en.fragment.json:
 * - elimina claves que ya no existen en en (huérfanas tras quitar tr() del código)
 * - añade claves nuevas en en copiando el valor inglés hasta que traduzcáis
 *
 * Uso: node scripts/prune-fragments-to-en-keys.mjs
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const enPath = path.join(root, 'locales', '_generated', 'en.fragment.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const keys = Object.keys(en);
const targets = ['fr', 'it', 'pt', 'de'];

for (const lang of targets) {
  const p = path.join(root, 'locales', '_generated', `${lang}.fragment.json`);
  if (!fs.existsSync(p)) continue;
  const prev = JSON.parse(fs.readFileSync(p, 'utf8'));
  const out = {};
  let added = 0;
  let removed = 0;
  for (const k of keys) {
    if (prev[k] !== undefined) out[k] = prev[k];
    else {
      out[k] = en[k];
      added++;
    }
  }
  for (const k of Object.keys(prev)) {
    if (!en[k]) removed++;
  }
  fs.writeFileSync(p, JSON.stringify(out, null, 2), 'utf8');
  console.log(`${lang}.fragment.json: ${keys.length} keys, +${added} desde EN (nuevas), −${removed} huérfanas`);
}
