/**
 * Copia el standalone de Next.js a backend/frontend-web (mismo paso que CI Azure).
 * Uso: node scripts/bundle-frontend-web-into-backend.mjs
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fw = join(root, 'frontend-web');
const standalone = join(fw, '.next', 'standalone', 'server.js');
const dest = join(root, 'backend', 'frontend-web');

if (!existsSync(standalone)) {
  console.error('Falta frontend-web/.next/standalone — ejecuta: npm run build:web');
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(join(fw, '.next', 'standalone'), dest, { recursive: true });
mkdirSync(join(dest, '.next', 'static'), { recursive: true });
cpSync(join(fw, '.next', 'static'), join(dest, '.next', 'static'), { recursive: true });
if (existsSync(join(fw, 'public'))) {
  mkdirSync(join(dest, 'public'), { recursive: true });
  cpSync(join(fw, 'public'), join(dest, 'public'), { recursive: true });
}

console.log('OK: backend/frontend-web actualizado desde frontend-web build');
