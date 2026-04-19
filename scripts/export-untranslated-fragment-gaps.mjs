/**
 * Lista claves donde el fragmento destino sigue igual al inglés (falta traducir).
 * Útil para POEditor: importar solo lo pendiente.
 *
 * Uso:
 *   node scripts/export-untranslated-fragment-gaps.mjs
 *   TARGET=it node scripts/export-untranslated-fragment-gaps.mjs
 *
 * Escribe: locales/_generated/<target>.gaps-for-poeditor.json  (solo pares key → texto EN fuente)
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const target = (process.env.TARGET || 'fr').trim();
if (!/^[a-z]{2}$/.test(target)) {
  console.error('TARGET debe ser fr, it o pt');
  process.exit(1);
}

const enPath = path.join(root, 'locales', '_generated', 'en.fragment.json');
const destPath = path.join(root, 'locales', '_generated', `${target}.fragment.json`);
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const dest = fs.existsSync(destPath) ? JSON.parse(fs.readFileSync(destPath, 'utf8')) : {};

const gaps = {};
let n = 0;
for (const key of Object.keys(en)) {
  const ev = String(en[key]);
  const dv = dest[key] !== undefined ? String(dest[key]) : '';
  if (dv === ev) {
    gaps[key] = ev;
    n++;
  }
}

const outPath = path.join(root, 'locales', '_generated', `${target}.gaps-for-poeditor.json`);
fs.writeFileSync(outPath, JSON.stringify(gaps, null, 2), 'utf8');
console.log(`Target ${target}: ${n} cadenas aún iguales al inglés (de ${Object.keys(en).length}).`);
console.log('Escrito:', outPath);
