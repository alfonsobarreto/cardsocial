import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dashboardPath = path.join(__dirname, '..', 'app', '(tabs)', 'dashboard.tsx');
const s = fs.readFileSync(dashboardPath, 'utf8');
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
function hashPair(es, en) {
  const t = `${en}\0${es}`;
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = (h * 33) ^ t.charCodeAt(i);
  return (h >>> 0).toString(16);
}
const re = /\btr\s*\(\s*'/g;
let m;
const seen = new Set();
const rows = [];
while ((m = re.exec(s)) !== null) {
  const a = parseSQ(s, m.index + m[0].length - 1);
  if (!a) continue;
  const rest = s.slice(a.end);
  const comma = rest.match(/^\s*,\s*'/);
  if (!comma) continue;
  const b = parseSQ(s, a.end + comma[0].length - 1);
  if (!b) continue;
  const k = `${a.text}\0${b.text}`;
  if (seen.has(k)) continue;
  seen.add(k);
  rows.push({ es: a.text, en: b.text, h: hashPair(a.text, b.text) });
}
fs.writeFileSync(path.join(__dirname, '_dash-pairs.json'), JSON.stringify(rows, null, 2), 'utf8');
console.log('pairs', rows.length);
