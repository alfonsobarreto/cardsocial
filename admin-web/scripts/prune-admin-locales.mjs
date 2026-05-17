import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src');
const jsonPath = path.join(__dirname, '..', 'src', 'i18n', 'adminLocales.json');

function walkDir(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkDir(p, acc);
    else if (/\.(tsx|ts)$/.test(name)) acc.push(p);
  }
  return acc;
}

const files = walkDir(srcRoot);
const reT = /t\(\s*['"](admin_[^'"]+)['"]/g;
/** Claves pasadas a t() vía variables (p. ej. labelKey, o errores en statsService con { key: '…' }). */
const reKeyFields =
  /(?:labelKey|descKey|nameKey|hintKey|titleKey|bodyKey|\bkey)\s*:\s*['"](admin_[^'"]+)['"]/g;
const used = new Set();
for (const f of files) {
  if (f.replace(/\\/g, '/').endsWith('/i18n/adminLocales.json')) continue;
  const s = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = reT.exec(s))) used.add(m[1]);
  while ((m = reKeyFields.exec(s))) used.add(m[1]);
}

const catalog = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const jsonKeys = Object.keys(catalog);
const orphans = jsonKeys.filter((k) => !used.has(k));
const missing = [...used].filter((k) => !catalog[k]);

console.log('used keys:', used.size);
console.log('json keys:', jsonKeys.length);
console.log('orphans:', orphans.length);
if (missing.length) {
  console.log('MISSING in json:', missing);
  process.exit(1);
}

const pruned = {};
for (const k of jsonKeys) {
  if (!used.has(k)) continue;
  const row = catalog[k];
  pruned[k] = { es: row.es, en: row.en };
}

fs.writeFileSync(jsonPath, JSON.stringify(pruned, null, 2) + '\n', 'utf8');
console.log('Wrote', Object.keys(pruned).length, 'keys (es+en only), removed', orphans.length, 'orphans');
