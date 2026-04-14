import React from 'react';
import { LEGAL_URLS } from '@/lib/legalContent';

/**
 * Enlaces canónicos públicos para tiendas (Google Play, etc.) y usuarios.
 * @see https://support.google.com/googleplay/android-developer/answer/9859152
 */
export default function LegalSiteNav() {
  const linkStyle: React.CSSProperties = {
    color: '#00897B',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  };

  return (
    <nav
      aria-label="Legal pages"
      style={{
        marginTop: 36,
        paddingTop: 22,
        borderTop: '1px solid rgba(0, 137, 123, 0.35)',
        fontSize: 14,
        lineHeight: 1.65,
      }}
    >
      <p style={{ fontWeight: 700, margin: '0 0 10px', color: '#004D40' }}>Legal — Card-Social</p>
      <p style={{ margin: '0 0 14px', color: '#00695C' }}>
        Canonical URLs on <strong>cardsocial.me</strong> (bilingual):
      </p>
      <ul style={{ margin: 0, paddingLeft: 20, color: '#004D40' }}>
        <li style={{ marginBottom: 8 }}>
          <strong>Privacy:</strong>{' '}
          <a href={LEGAL_URLS.privacyEn} style={linkStyle}>
            English
          </a>
          {' · '}
          <a href={LEGAL_URLS.privacyEs} style={linkStyle}>
            Español
          </a>
        </li>
        <li style={{ marginBottom: 8 }}>
          <strong>Terms:</strong>{' '}
          <a href={LEGAL_URLS.termsEn} style={linkStyle}>
            English
          </a>
          {' · '}
          <a href={LEGAL_URLS.termsEs} style={linkStyle}>
            Español
          </a>
        </li>
        <li style={{ marginBottom: 8 }}>
          <strong>Acceptable use / Content:</strong>{' '}
          <a href={LEGAL_URLS.useEn} style={linkStyle}>
            English
          </a>
          {' · '}
          <a href={LEGAL_URLS.useEs} style={linkStyle}>
            Español
          </a>
        </li>
        <li style={{ marginBottom: 8 }}>
          <strong>About:</strong>{' '}
          <a href={LEGAL_URLS.about} style={linkStyle}>
            cardsocial.me/legal/about
          </a>
        </li>
        <li style={{ marginBottom: 8 }}>
          <strong>Contact:</strong>{' '}
          <a href={LEGAL_URLS.contactEn} style={linkStyle}>
            English
          </a>
          {' · '}
          <a href={LEGAL_URLS.contactEs} style={linkStyle}>
            Español
          </a>
        </li>
      </ul>
    </nav>
  );
}
