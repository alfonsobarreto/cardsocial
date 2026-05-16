/**
 * Valida `services/i18n/coreLocales.json`: ningún idioma puede ser "", solo espacios,
 * null o no-string respecto a las reglas de `repairCoreLocalesDict`.
 *
 * - Por defecto (CI): solo comprueba; si hicieran falta correcciones → process.exit(1) (sin escribir).
 * - Reparación local: `node scripts/audit-core-locales.mjs --fix`
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TARGET = path.join(ROOT, 'services', 'i18n', 'coreLocales.json');

const LANGS = /** @type {const} */ (['es', 'en', 'it', 'pt', 'fr', 'de']);
const WANT_FIX = process.argv.includes('--fix');

function ok(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

function firstGood(row) {
  for (const L of LANGS) {
    if (ok(row[L])) return row[L];
  }
  return null;
}

/** Misma lógica que antes: muta `dict` y devuelve cuántos campos se corrigen. */
function repairCoreLocalesDict(dict) {
  let fixes = 0;
  for (const key of Object.keys(dict).sort()) {
    const row = dict[key];
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;

    let enVal = row.en;
    if (!ok(enVal)) {
      const g = firstGood(row);
      if (g != null) {
        row.en = g;
        fixes++;
      } else {
        const fallback = `[${key}]`;
        for (const L of LANGS) {
          row[L] = fallback;
        }
        fixes += LANGS.length;
        continue;
      }
    }

    for (const L of LANGS) {
      if (!ok(row[L])) {
        row[L] = row.en;
        fixes++;
      }
    }
  }
  return fixes;
}

const raw = fs.readFileSync(TARGET, 'utf8');
const working = JSON.parse(raw);
const fixes = repairCoreLocalesDict(working);

if (fixes > 0 && !WANT_FIX) {
  console.error(
    `audit-core-locales: FAILED — ${fixes} locale field(s) need repair in ${TARGET}. Run: node scripts/audit-core-locales.mjs --fix`,
  );
  process.exit(1);
}

if (fixes > 0 && WANT_FIX) {
  fs.writeFileSync(TARGET, JSON.stringify(working, null, 2) + '\n', 'utf8');
  console.log('audit-core-locales:', TARGET, 'fixed', fixes, 'field(s)');
  process.exit(0);
}

console.log('audit-core-locales:', TARGET, 'OK (0 issues)');
process.exit(0);
