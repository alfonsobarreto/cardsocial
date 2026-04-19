/**
 * Sustituye en fr/it/pt.fragment.json cualquier valor que sea aviso de cuota
 * de MyMemory (u otro texto basura) por el inglés de en.fragment.json.
 *
 * Uso: node scripts/repair-ui-fragments.mjs
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const enPath = path.join(root, 'locales', '_generated', 'en.fragment.json');
const targets = ['fr.fragment.json', 'it.fragment.json', 'pt.fragment.json'];

function isGarbageTranslation(s) {
  if (typeof s !== 'string' || !s.length) return true;
  const u = s.toUpperCase();
  return (
    u.includes('MYMEMORY WARNING') ||
    u.includes('USAGELIMITS') ||
    u.includes('MYMEMORY.TRANSLATED.NET/DOC')
  );
}

function main() {
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const outDir = path.join(root, 'locales', '_generated');

  for (const name of targets) {
    const p = path.join(outDir, name);
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    let fixed = 0;
    for (const k of Object.keys(j)) {
      if (isGarbageTranslation(j[k]) && typeof en[k] === 'string') {
        j[k] = en[k];
        fixed++;
      }
    }
    fs.writeFileSync(p, JSON.stringify(j, null, 2), 'utf8');
    console.log(name, 'repaired', fixed, 'keys (fallback to English)');
  }
}

main();
