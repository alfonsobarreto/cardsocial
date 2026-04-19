/**
 * Extrae pares tr('es','en') de .ts/.tsx para generar claves ui.* en locales.
 * Uso: node scripts/extract-tr-pairs.mjs
 */
import fs from 'fs';
import path from 'path';

const roots = ['app', 'components', 'services', 'hooks'];
const exts = new Set(['.ts', '.tsx']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (exts.has(path.extname(name))) out.push(p);
  }
  return out;
}

/** djb2 hex */
function hashPair(es, en) {
  const s = `${en}\0${es}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

/** Extrae string entre comillas simples con escapes */
function parseSQ(str, start) {
  let i = start + 1;
  let out = '';
  while (i < str.length) {
    const c = str[i];
    if (c === '\\') {
      i++;
      if (i < str.length) {
        out += str[i];
        i++;
      }
      continue;
    }
    if (c === "'") return { text: out, end: i + 1 };
    out += c;
    i++;
  }
  return null;
}

function extractFromFile(filePath) {
  const s = fs.readFileSync(filePath, 'utf8');
  const pairs = [];
  const re = /\btr\s*\(\s*'/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const a = parseSQ(s, m.index + m[0].length - 1);
    if (!a) continue;
    const rest = s.slice(a.end);
    const comma = rest.match(/^\s*,\s*'/);
    if (!comma) continue;
    const start2 = a.end + comma[0].length - 1;
    const b = parseSQ(s, start2);
    if (!b) continue;
    pairs.push({ es: a.text, en: b.text });
  }
  return pairs;
}

const pairs = new Map();
for (const root of roots) {
  const dir = path.join(process.cwd(), root);
  for (const file of walk(dir)) {
    for (const p of extractFromFile(file)) {
      const k = `${p.en}\0${p.es}`;
      if (!pairs.has(k)) pairs.set(k, p);
    }
  }
}

const byLang = { en: {}, es: {} };
for (const { es, en } of pairs.values()) {
  const h = hashPair(es, en);
  const key = `ui.x${h}`;
  byLang.en[key] = en;
  byLang.es[key] = es;
}

console.log('Unique tr() pairs:', pairs.size);
console.log('Writing locale fragments to locales/_generated/');

const outDir = path.join(process.cwd(), 'locales', '_generated');
fs.mkdirSync(outDir, { recursive: true });
for (const [lang, obj] of Object.entries(byLang)) {
  fs.writeFileSync(path.join(outDir, `${lang}.fragment.json`), JSON.stringify(obj, null, 2), 'utf8');
}

fs.writeFileSync(
  path.join(outDir, 'meta.json'),
  JSON.stringify(
    {
      count: pairs.size,
      note: 'IT/PT: npm run i18n:fill (solo it,pt por defecto; LANGS=fr,... si hace falta). FR suele ir por POEditor.',
    },
    null,
    2,
  ),
  'utf8',
);
