#!/usr/bin/env node
/**
 * Re-chequeo Fase D — anti-pattern persona: `userAvatarUrl || ownerPhotoUrl` (y simétrico).
 * Portable (sin ripgrep). Ver docs/IDENTITY_PHASE_D_AUDIT.md §Re-chequeo D.
 * Uso: node scripts/audit-identity-phase-d.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_DIRS = ['services', 'app', 'components', 'hooks', 'types'];
const BAD = /userAvatarUrl\s*\|\|\s*ownerPhotoUrl|ownerPhotoUrl\s*\|\|\s*userAvatarUrl/;

function walk(dir, acc) {
  let st;
  try {
    st = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of st) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(ent.name)) acc.push(p);
  }
}

const files = [];
for (const d of SCAN_DIRS) {
  const base = path.join(root, d);
  if (fs.existsSync(base)) walk(base, files);
}

let hits = 0;
for (const file of files.sort()) {
  const s = fs.readFileSync(file, 'utf8');
  if (!BAD.test(s)) continue;
  const lines = s.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (BAD.test(line)) {
      console.log(`${path.relative(root, file)}:${i + 1}: ${line.trim()}`);
      hits += 1;
    }
  });
}

if (hits > 0) {
  console.error(`\n[audit-identity-phase-d] ${hits} línea(s) con anti-pattern — revisar IDENTITY_PHASE_D_AUDIT.md`);
  process.exit(1);
}
console.log('[audit-identity-phase-d] OK — sin userAvatarUrl||ownerPhotoUrl ni simétrico en services/app/components/hooks/types.');
process.exit(0);
