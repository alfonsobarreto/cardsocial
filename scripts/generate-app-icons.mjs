/**
 * Genera assets/icon.png (iOS, ~85% logo sobre fondo blanco) y
 * assets/adaptive-icon.png (Android foreground, logo ~66% centrado, fondo transparente).
 * Fuente: logo con transparencia.
 *
 * Uso: node scripts/generate-app-icons.mjs
 */
import sharp from 'sharp';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SRC = join(ROOT, 'assets/images/cs-icon-logo-bg-transparent.png');
const OUT_IOS = join(ROOT, 'assets/icon.png');
const OUT_ANDROID = join(ROOT, 'assets/adaptive-icon.png');

const CANVAS = 1024;
/** iOS: logo ocupa ~85% del cuadrado (zona segura típica App Store). */
const IOS_LOGO_FRAC = 0.85;
/** Android adaptive: contenido en ~66% (zona segura frente / máscara adaptativa). */
const ANDROID_LOGO_FRAC = 0.66;

async function main() {
  const base = sharp(SRC).ensureAlpha();

  const iosSide = Math.round(CANVAS * IOS_LOGO_FRAC);
  const resizedIos = await base
    .clone()
    .resize(iosSide, iosSide, {
      fit: 'inside',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resizedIos, gravity: 'center' }])
    .png()
    .toFile(OUT_IOS);

  const androidSide = Math.round(CANVAS * ANDROID_LOGO_FRAC);
  const resizedAd = await base
    .clone()
    .resize(androidSide, androidSide, {
      fit: 'inside',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resizedAd, gravity: 'center' }])
    .png()
    .toFile(OUT_ANDROID);

  console.log('OK:', OUT_IOS);
  console.log('OK:', OUT_ANDROID);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
