/**
 * Rellena fragmentos ui.* desde en.fragment.json vía MyMemory (gratis, límite diario).
 *
 * Por defecto solo it + pt para no sobrescribir fr.fragment.json (curado en POEditor).
 * Incluir francés: LANGS=fr,it,pt node scripts/fill-ui-fragments.mjs
 *
 * Uso: node scripts/fill-ui-fragments.mjs
 * Opcional: LIMIT=200 LANGS=it,pt node scripts/fill-ui-fragments.mjs
 */
import fs from 'fs';
import https from 'https';
import path from 'path';

const root = process.cwd();
const enPath = path.join(root, 'locales', '_generated', 'en.fragment.json');
const delayMs = Number(process.env.DELAY_MS || 120);
const limit = process.env.LIMIT ? Number(process.env.LIMIT) : null;

/** Por defecto it,pt — no tocar FR salvo LANGS=fr,... */
const LANG_PAIRS = {
  fr: 'en|fr',
  it: 'en|it',
  pt: 'en|pt',
};
const defaultLangCodes = ['it', 'pt'];
const langCodes = process.env.LANGS
  ? process.env.LANGS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : defaultLangCodes;

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let d = '';
        res.on('data', (c) => {
          d += c;
        });
        res.on('end', () => resolve(d));
      })
      .on('error', reject);
  });
}

function isGarbageTranslation(s) {
  if (typeof s !== 'string' || !s.length) return true;
  const u = s.toUpperCase();
  return (
    u.includes('MYMEMORY WARNING') ||
    u.includes('USAGELIMITS') ||
    u.includes('MYMEMORY.TRANSLATED.NET/DOC')
  );
}

async function translateLine(text, langpair) {
  const chunk = String(text).slice(0, 450);
  const q = encodeURIComponent(chunk);
  const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=${langpair}`;
  try {
    const raw = await get(url);
    const j = JSON.parse(raw);
    const out = j?.responseData?.translatedText;
    if (typeof out === 'string' && out.length && !isGarbageTranslation(out)) return out;
  } catch {
    /* ignore */
  }
  return text;
}

async function fillTarget(langFile, langpair, source) {
  const keys = Object.keys(source);
  const slice = limit != null && !Number.isNaN(limit) ? keys.slice(0, limit) : keys;
  const out = {};
  let i = 0;
  for (const k of slice) {
    out[k] = await translateLine(source[k], langpair);
    i++;
    if (i % 40 === 0) console.log(langFile, i, '/', slice.length);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  fs.writeFileSync(langFile, JSON.stringify(out, null, 2), 'utf8');
  console.log('Wrote', langFile, 'keys:', Object.keys(out).length);
}

async function main() {
  if (!fs.existsSync(enPath)) {
    console.error('Missing', enPath, '— run: node scripts/extract-tr-pairs.mjs');
    process.exit(1);
  }
  const source = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const outDir = path.join(root, 'locales', '_generated');
  fs.mkdirSync(outDir, { recursive: true });

  for (const code of langCodes) {
    const pair = LANG_PAIRS[code];
    if (!pair) {
      console.error('LANGS: código desconocido', code, '— use fr, it o pt');
      process.exit(1);
    }
    await fillTarget(path.join(outDir, `${code}.fragment.json`), pair, source);
  }
  console.log('Done. Revisa textos (MyMemory es aproximado). Idiomas:', langCodes.join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
