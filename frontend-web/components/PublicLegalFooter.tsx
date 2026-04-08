import React from 'react';
import { SUPPORT_MAILTO } from '@/lib/legalContent';

const linkStyle: React.CSSProperties = {
  color: 'inherit',
  textDecoration: 'underline',
  textUnderlineOffset: 2,
};

type Props = {
  locale: 'es' | 'en';
  /** Color del texto (p. ej. borde del tema) */
  accentColor: string;
  /** Fondo semitransparente opcional para legibilidad sobre gradientes */
  background?: string;
};

export default function PublicLegalFooter({ locale, accentColor, background }: Props) {
  const tr = (es: string, en: string) => (locale === 'es' ? es : en);

  const foot: React.CSSProperties = {
    marginTop: 20,
    paddingTop: 14,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: 300,
    lineHeight: 1.5,
    color: accentColor,
    opacity: 0.78,
    borderTop: `1px solid ${accentColor}33`,
    ...(background ? { background, borderRadius: 8, padding: '12px 8px', marginTop: 16 } : {}),
  };

  const sep = <span aria-hidden="true"> · </span>;

  return (
    <footer style={foot}>
      <nav aria-label={tr('Enlaces legales', 'Legal links')}>
        <a href="/legal/privacidad" style={linkStyle}>
          {tr('Privacidad', 'Privacy')}
        </a>
        {sep}
        <a href="/legal/terminos" style={linkStyle}>
          {tr('Términos', 'Terms')}
        </a>
        {sep}
        <a href="/legal/uso" style={linkStyle}>
          {tr('Uso', 'Usage')}
        </a>
        {sep}
        <a href={SUPPORT_MAILTO} style={linkStyle}>
          {tr('Soporte', 'Support')}
        </a>
      </nav>
    </footer>
  );
}
