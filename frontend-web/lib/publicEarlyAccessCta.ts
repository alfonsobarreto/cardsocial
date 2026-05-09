import type { CardTheme } from '@/lib/themes';

/** Textos del CTA principal hacia cardsocial.me (vista pública web). */
export const PUBLIC_EARLY_ACCESS_LABEL = {
  es: 'Obtener Acceso Anticipado',
  en: 'Get Early Access',
} as const;

export function earlyAccessPrimaryLabel(locale: 'es' | 'en'): string {
  return locale === 'es' ? PUBLIC_EARLY_ACCESS_LABEL.es : PUBLIC_EARLY_ACCESS_LABEL.en;
}

function hexToRgbTriple(hex: string): [number, number, number] | null {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (/^[0-9a-f]{6}$/i.test(h)) {
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  if (/^[0-9a-f]{8}$/i.test(h)) {
    const six = h.slice(0, 6);
    const n = parseInt(six, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return null;
}

/** Canal sRGB → lineal (WCAG 2.1). */
function linearChannel(channel0to255: number): number {
  const s = channel0to255 / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Luminancia relativa WCAG ∈ [0, 1].
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgbTriple(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(linearChannel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Promedio de luminancia de los tres stops del degradado de la tarjeta
 * (aproximación del “fondo visible” del bloque).
 */
export function averageCardBackgroundLuminance(theme: CardTheme): number {
  const samples = theme.background
    .map((h) => relativeLuminance(h))
    .filter((v): v is number => v != null && !Number.isNaN(v));
  if (samples.length === 0) return 0.5;
  const sum = samples.reduce((a, v) => a + v, 0);
  return sum / samples.length;
}

export type EarlyAccessPrimaryCtaStyle = {
  backgroundColor: string;
  color: string;
  boxShadow: string;
  border: string;
  fontWeight: number;
};

/**
 * Contraste garantizado contra el tema de la tarjeta:
 * - Fondo claro (luminancia media alta) → CTA oscuro + texto blanco.
 * - Fondo oscuro → CTA claro + texto oscuro (+ sombra para que destaque).
 */
export function earlyAccessPrimaryCtaStyle(theme: CardTheme): EarlyAccessPrimaryCtaStyle {
  const lum = averageCardBackgroundLuminance(theme);
  /** Umbral en espacio luminancia relativa WCAG (~0.5 ≈ gris medio). */
  const lightSurface = lum >= 0.45;

  if (lightSurface) {
    return {
      backgroundColor: '#0f172a',
      color: '#ffffff',
      boxShadow: '0 10px 28px rgba(15, 23, 42, 0.38)',
      border: '1px solid rgba(255,255,255,0.08)',
      fontWeight: 600,
    };
  }

  return {
    backgroundColor: '#ffffff',
    color: '#0f172a',
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.35)',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    fontWeight: 600,
  };
}
