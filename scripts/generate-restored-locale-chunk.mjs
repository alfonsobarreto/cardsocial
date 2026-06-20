/**
 * One-off: restore core locale keys present in git 7cc2d3d but missing from current chunk build.
 * Run: node scripts/generate-restored-locale-chunk.mjs && node scripts/build-core-locales.mjs
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const git = JSON.parse(
  execSync('git show 7cc2d3d:services/i18n/coreLocales.json', { encoding: 'utf8', cwd: root }),
);
const cur = JSON.parse(fs.readFileSync(path.join(root, 'services/i18n/coreLocales.json'), 'utf8'));
const missing = Object.keys(git).filter((k) => !cur[k]);

function esc(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
}

const lines = [
  "import { L } from './_util.mjs';",
  '',
  '/** Restored from git 7cc2d3d — keys referenced in app/services but absent from other chunks. */',
  'export const restored = {',
];

for (const k of missing.sort()) {
  const row = git[k];
  lines.push(`  ${k}: L(`);
  lines.push(`    '${esc(row.es)}',`);
  lines.push(`    '${esc(row.en)}',`);
  lines.push(`    '${esc(row.it || row.en)}',`);
  lines.push(`    '${esc(row.pt || row.en)}',`);
  lines.push(`    '${esc(row.fr || row.en)}',`);
  lines.push(`    '${esc(row.de || row.en)}',`);
  lines.push('  ),');
}

lines.push('};');
lines.push('');

const out = path.join(__dirname, 'i18n-core-chunks/restored.mjs');
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log('Wrote', out, 'keys:', missing.length);
