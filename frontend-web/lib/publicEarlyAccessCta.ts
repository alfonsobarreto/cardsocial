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

export type EarlyAccessPrimaryCtaStyle = {
  backgroundColor: string;
  color: string;
  boxShadow: string;
  border: string;
  fontWeight: number;
};

/**
 * CTA primario del preview público (armonizado con la tarjeta):
 * usa el color de borde del theme como relleno; el texto usa `resolvePillForegroundColor`
 * (misma lógica que chips del mirror nativo sobre el degradado).
 */
export function earlyAccessPrimaryCtaStyle(theme: CardTheme): EarlyAccessPrimaryCtaStyle {
  const bgFill = theme.border.color;
  const color = resolvePillForegroundColor({
    cardGradient: theme.background,
    pillBackground: bgFill,
    preferredColor: '#ffffff',
    minContrast: 4.5,
  });
  const bd = theme.border.color;
  return {
    backgroundColor: bgFill,
    color,
    boxShadow: `0 10px 28px ${bd}52`,
    border: '1px solid rgba(255,255,255,0.16)',
    fontWeight: 600,
  };
}
