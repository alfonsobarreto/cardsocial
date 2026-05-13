/**
 * Fondos de página detrás de la ficha pública:
 * - Smart (`/u/…`): degradado diagonal plano (arriba-derecha → abajo-izquierda; espejo del eje anterior).
 * - Business (`/b/…`): mismo eje transversal espejado, con acento del tema y brillo metálico (solo fondo).
 */

import type { CardTheme } from '@/lib/themes';

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace('#', '');
  if (h.length === 6 && /^[0-9a-fA-F]+$/i.test(h)) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return null;
}

export function rgbaHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/** Luminancia relativa (aprox. sRGB). */
function relativeLuminanceFromHex(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.4;
  const lin = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * Sombra apilada adicional para vista previa pública web: la tarjeta “flota” sin usar
 * `filter` en un ancestro (evita romper `position: fixed` en modales).
 */
export function publicCardPreviewExtraBoxShadow(theme: CardTheme): string {
  const bd = theme.border.color;
  const light = relativeLuminanceFromHex(theme.background[1]) > 0.52;
  const accentGlow = rgbaHex(bd, light ? 0.28 : 0.38);
  const depth = light ? 'rgba(15, 23, 42, 0.14)' : 'rgba(0, 0, 0, 0.4)';
  const soft = light ? 'rgba(15, 23, 42, 0.08)' : 'rgba(0, 0, 0, 0.26)';
  return `0 24px 48px ${accentGlow}, 0 10px 22px ${depth}, 0 3px 10px ${soft}`;
}

/** Smartcard: un solo degradado transversal espejado (to bottom left). */
export function publicSmartCardPageBackground(theme: CardTheme): string {
  const [top, mid, bot] = theme.background;
  return `linear-gradient(to bottom left, ${top} 0%, ${mid} 50%, ${bot} 100%)`;
}

/**
 * Business: degradado transversal espejado + acento + brillo metálico en la misma diagonal;
 * viñeta suave para dar profundidad al centro (solo CSS de página).
 */
export function publicBusinessCardPageBackground(theme: CardTheme): string {
  const [top, mid, bot] = theme.background;
  const accent = theme.border.color;
  const light = relativeLuminanceFromHex(mid) > 0.52;

  const base = `linear-gradient(to bottom left, ${top} 0%, ${mid} 48%, ${bot} 100%)`;
  const wash = `linear-gradient(to bottom left, ${rgbaHex(accent, light ? 0.22 : 0.2)} 0%, transparent 32%, transparent 68%, ${rgbaHex(bot, light ? 0.2 : 0.25)} 100%)`;
  const accentBand = `linear-gradient(to bottom left, ${rgbaHex(accent, light ? 0.38 : 0.45)} 0%, transparent 28%, ${rgbaHex(accent, light ? 0.12 : 0.15)} 72%, ${rgbaHex(accent, light ? 0.32 : 0.38)} 100%)`;

  const sheen = light
    ? `linear-gradient(to bottom left, transparent 36%, rgba(255,255,255,0.62) 45%, rgba(255,255,255,0.1) 48%, rgba(255,255,255,0.5) 51%, transparent 60%)`
    : `linear-gradient(to bottom left, transparent 34%, rgba(255,255,255,0.42) 44%, rgba(255,255,255,0.05) 47%, rgba(255,255,255,0.32) 50%, transparent 58%)`;

  const brushed = `repeating-linear-gradient(225deg, rgba(255,255,255,${light ? 0.04 : 0.025}) 0px, rgba(255,255,255,${light ? 0.04 : 0.025}) 1px, transparent 1px, transparent 5px)`;

  const vignette = light
    ? `radial-gradient(ellipse 95% 100% at 50% 45%, transparent 52%, ${rgbaHex(mid, 0.14)} 100%)`
    : `radial-gradient(ellipse 95% 100% at 50% 42%, transparent 45%, rgba(0,0,0,0.28) 100%)`;

  /** Primera capa = encima. */
  return [sheen, brushed, accentBand, wash, vignette, base].join(', ');
}

/** @deprecated Usar `publicSmartCardPageBackground`; se mantiene por compatibilidad. */
export const publicCardStonePageBackground = publicSmartCardPageBackground;
