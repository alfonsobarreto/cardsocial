'use client';

import { SUPPORT_MAILTO } from '@/lib/legalContent';
import React from 'react';

type Props = {
  locale: 'es' | 'en';
  accentColor: string;
  background?: string;
  /** Si se define, color de texto/enlaces con contraste garantizado sobre `background`. */
  textColor?: string;
};

/**
 * Enlaces a páginas legales públicas en cardsocial.me (requisito tiendas / Google Play).
 */
export default function PublicLegalFooter({ locale, accentColor, background, textColor }: Props) {
  const tr = (es: string, en: string) => (locale === 'es' ? es : en);
  const privacyHref = locale === 'es' ? '/legal/privacidad' : '/legal/privacy';
  const termsHref = locale === 'es' ? '/legal/terminos' : '/legal/terms';
  const useHref = locale === 'es' ? '/legal/uso' : '/legal/use';
  const contactHref = locale === 'es' ? '/legal/contacto' : '/legal/contact';
  const mailHref = SUPPORT_MAILTO === '#' ? contactHref : SUPPORT_MAILTO;

  const resolvedText = textColor ?? accentColor;
  const foot: React.CSSProperties = {
    marginTop: 20,
    paddingTop: 14,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 300,
    lineHeight: 1.5,
    color: resolvedText,
    opacity: textColor ? 1 : 0.78,
    borderTop: `1px solid ${accentColor}33`,
    ...(background ? { background, borderRadius: 8, padding: '12px 8px', marginTop: 16 } : {}),
  };

  const linkStyle: React.CSSProperties = {
    color: 'inherit',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
    font: 'inherit',
    fontSize: 'inherit',
    fontWeight: 'inherit',
  };

  const sep = <span aria-hidden="true"> · </span>;

  return (
    <footer style={foot}>
      <nav aria-label={tr('Enlaces legales', 'Legal links')}>
        <a href={privacyHref} style={linkStyle}>
          {tr('Privacidad', 'Privacy')}
        </a>
        {sep}
        <a href={termsHref} style={linkStyle}>
          {tr('Términos', 'Terms')}
        </a>
        {sep}
        <a href={useHref} style={linkStyle}>
          {tr('Uso', 'Usage')}
        </a>
        {sep}
        <a href="/legal/about" style={linkStyle}>
          {tr('Acerca de', 'About')}
        </a>
        {sep}
        <a href={contactHref} style={linkStyle}>
          {tr('Contacto', 'Contact')}
        </a>
        {sep}
        <a href={mailHref} style={linkStyle}>
          {tr('Correo', 'Email')}
        </a>
      </nav>
    </footer>
  );
}
