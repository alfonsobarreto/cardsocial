import type { CardTheme } from '@/lib/themes';
import { resolvePillForegroundColor } from '@card-social/services/pillForegroundColor';

/** Textos del CTA principal hacia cardsocial.me (vista pública web). */
export const PUBLIC_EARLY_ACCESS_LABEL = {
  es: 'Obtener Acceso Anticipado',
  en: 'Get Early Access',
} as const;

export function earlyAccessPrimaryLabel(locale: 'es' | 'en'): string {
  return locale === 'es' ? PUBLIC_EARLY_ACCESS_LABEL.es : PUBLIC_EARLY_ACCESS_LABEL.en;
}

function parseHexToRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace('#', '');
  if (h.length === 6 && /^[0-9a-fA-F]+$/i.test(h)) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return null;
}

function rgbaHexFromBorder(hex: string, alpha: number): string {
  const rgb = parseHexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/** Brillo en el texto del botón para separarlo del relleno (metálico / grises). */
function ctaLabelShadow(foregroundCss: string): string {
  const rgb = parseHexToRgb(foregroundCss);
  if (!rgb) return 'none';
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  if (lum < 0.45) {
    return '0 1px 0 rgba(255,255,255,0.28), 0 -1px 0 rgba(0,0,0,0.22)';
  }
  return '0 1px 2px rgba(0,0,0,0.35), 0 0 1px rgba(0,0,0,0.22)';
}

export type EarlyAccessPrimaryCtaStyle = {
  background: string;
  color: string;
  boxShadow: string;
  border: string;
  fontWeight: number;
  textShadow: string;
};

const CTA_MIN_CONTRAST = 7;

/**
 * CTA primario: relieve tipo metal con gradiente sobre el color de borde del tema;
 * texto con contraste alto respecto al relleno.
 */
export function earlyAccessPrimaryCtaStyle(theme: CardTheme): EarlyAccessPrimaryCtaStyle {
  const bgFill = theme.border.color;
  const color = resolvePillForegroundColor({
    cardGradient: theme.background,
    pillBackground: bgFill,
    preferredColor: theme.icon.color,
    minContrast: CTA_MIN_CONTRAST,
  });
  const bd = theme.border.color;
  const background = `linear-gradient(168deg, color-mix(in srgb, ${bgFill} 14%, white) 0%, ${bgFill} 40%, color-mix(in srgb, ${bgFill} 38%, black) 100%)`;
  const lift = rgbaHexFromBorder(bd, 0.38);
  return {
    background,
    color,
    boxShadow: [
      `0 3px 0 rgba(0,0,0,0.06)`,
      `0 22px 44px ${lift}`,
      `0 12px 28px rgba(0,0,0,0.14)`,
      `0 6px 14px rgba(0,0,0,0.1)`,
      `inset 0 1px 0 rgba(255,255,255,0.38)`,
    ].join(', '),
    border: `1px solid color-mix(in srgb, ${bd} 55%, white)`,
    fontWeight: 600,
    textShadow: ctaLabelShadow(color),
  };
}

/**
 * CTA secundario (p. ej. “Abrir en la app”): borde del theme + fondo claro;
 * contraste reforzado respecto al glass/blanco.
 */
export function earlyAccessSecondaryCtaStyle(theme: CardTheme): {
  color: string;
  border: string;
  background: string;
  fontWeight: number;
  boxShadow: string;
  textShadow: string;
} {
  const bd = theme.border.color;
  const bgFill = 'rgba(255, 255, 255, 0.92)';
  const color = resolvePillForegroundColor({
    cardGradient: theme.background,
    pillBackground: bgFill,
    preferredColor: theme.icon.color,
    minContrast: CTA_MIN_CONTRAST,
  });
  return {
    color,
    border: `2px solid ${bd}`,
    background: `linear-gradient(180deg, rgba(255,255,255,0.98) 0%, ${bgFill} 45%, color-mix(in srgb, ${bd} 9%, white) 100%)`,
    fontWeight: 600,
    boxShadow: [
      `0 2px 0 rgba(0,0,0,0.04)`,
      `0 20px 40px ${rgbaHexFromBorder(bd, 0.3)}`,
      `0 10px 24px rgba(0,0,0,0.12)`,
      `0 4px 12px rgba(0,0,0,0.08)`,
      `inset 0 1px 0 rgba(255,255,255,0.95)`,
    ].join(', '),
    textShadow: ctaLabelShadow(color),
  };
}
