import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function hashPair(es, en) {
  const s = `${en}\0${es}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function unquote(s) {
  return s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

/** Encuentra `tr('es','en')` incluyendo saltos de línea entre `tr(` y las cadenas. */
function extractTrPairs(source) {
  const pairs = [];
  let i = 0;
  while (i < source.length) {
    const start = source.indexOf('tr(', i);
    if (start === -1) break;
    let j = start + 3;
    while (j < source.length && /\s/.test(source[j])) j++;
    if (source[j] !== "'") {
      i = start + 3;
      continue;
    }
    j++;
    let es = '';
    while (j < source.length) {
      if (source[j] === '\\' && source[j + 1] != null) {
        es += source[j] + source[j + 1];
        j += 2;
        continue;
      }
      if (source[j] === "'") break;
      es += source[j++];
    }
    if (source[j] !== "'") {
      i = start + 3;
      continue;
    }
    j++;
    while (j < source.length && /\s/.test(source[j])) j++;
    if (source[j] !== ',') {
      i = start + 3;
      continue;
    }
    j++;
    while (j < source.length && /\s/.test(source[j])) j++;
    if (source[j] !== "'") {
      i = start + 3;
      continue;
    }
    j++;
    let en = '';
    while (j < source.length) {
      if (source[j] === '\\' && source[j + 1] != null) {
        en += source[j] + source[j + 1];
        j += 2;
        continue;
      }
      if (source[j] === "'") break;
      en += source[j++];
    }
    if (source[j] !== "'") {
      i = start + 3;
      continue;
    }
    pairs.push({ es: unquote(es), en: unquote(en) });
    i = j + 1;
  }
  return pairs;
}

const dashboardPath = path.join(__dirname, '../app/(tabs)/dashboard.tsx');
const raw = fs.readFileSync(dashboardPath, 'utf8');
const list = extractTrPairs(raw);
const seen = new Map();
for (const { es, en } of list) {
  const h = hashPair(es, en);
  if (!seen.has(h)) seen.set(h, { es, en, h });
}
const rows = [...seen.values()].sort((a, b) => a.h.localeCompare(b.h));

const outPath = path.join(__dirname, '_dash-hash-out.json');
fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf8');
console.log('pairs', list.length, 'unique', rows.length, '→', outPath);
