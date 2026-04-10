'use client';

import React, { useEffect, useState } from 'react';
import {
  PRIVACY_PARAGRAPH_EN,
  PRIVACY_PARAGRAPH_ES,
  SUPPORT_MAILTO,
  TERMS_LINES_EN,
  TERMS_LINES_ES,
  USAGE_LINES_EN,
  USAGE_LINES_ES,
} from '@/lib/legalContent';

type ModalKey = 'privacy' | 'terms' | 'usage';

type Props = {
  locale: 'es' | 'en';
  accentColor: string;
  background?: string;
};

export default function PublicLegalFooter({ locale, accentColor, background }: Props) {
  const tr = (es: string, en: string) => (locale === 'es' ? es : en);
  const [legalModal, setLegalModal] = useState<ModalKey | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!legalModal) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLegalModal(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [legalModal]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = legalModal ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [legalModal]);

  const modalContent: Record<ModalKey, { title: string; body: React.ReactNode }> = {
    privacy: {
      title: tr('Política de Privacidad', 'Privacy Policy'),
      body: <p style={{ margin: 0, lineHeight: 1.7 }}>{tr(PRIVACY_PARAGRAPH_ES, PRIVACY_PARAGRAPH_EN)}</p>,
    },
    terms: {
      title: tr('Términos de Uso', 'Terms of Use'),
      body: (
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          {(locale === 'es' ? TERMS_LINES_ES : TERMS_LINES_EN).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ),
    },
    usage: {
      title: tr('Política de Contenido', 'Content Policy'),
      body: (
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          {(locale === 'es' ? USAGE_LINES_ES : USAGE_LINES_EN).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ),
    },
  };

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

  const btnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: 'inherit',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
    font: 'inherit',
    fontSize: 'inherit',
    fontWeight: 'inherit',
  };

  const sep = <span aria-hidden="true"> · </span>;

  return (
    <>
      <footer style={foot}>
        <nav aria-label={tr('Enlaces legales', 'Legal links')}>
          <button style={btnStyle} onClick={() => setLegalModal('privacy')}>
            {tr('Privacidad', 'Privacy')}
          </button>
          {sep}
          <button style={btnStyle} onClick={() => setLegalModal('terms')}>
            {tr('Términos', 'Terms')}
          </button>
          {sep}
          <button style={btnStyle} onClick={() => setLegalModal('usage')}>
            {tr('Uso', 'Usage')}
          </button>
          {sep}
          <a href={SUPPORT_MAILTO} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            {tr('Soporte', 'Support')}
          </a>
        </nav>
      </footer>

      {legalModal && (
        /* Overlay — click outside closes */
        <div
          onClick={() => setLegalModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          {/* Modal box — stop propagation so clicking inside doesn't close */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1a1a2e',
              color: '#e8e8f0',
              borderRadius: 16,
              padding: '28px 24px 24px',
              width: '100%',
              maxWidth: 480,
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
              position: 'relative',
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setLegalModal(null)}
              aria-label={tr('Cerrar', 'Close')}
              style={{
                position: 'absolute',
                top: 14,
                right: 16,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#a0a0b8',
                fontSize: 22,
                lineHeight: 1,
                padding: 4,
              }}
            >
              ✕
            </button>

            {/* Title */}
            <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700, paddingRight: 28, color: '#ffffff' }}>
              {modalContent[legalModal].title}
            </h2>

            {/* Body */}
            <div style={{ fontSize: 13, lineHeight: 1.7, color: '#c8c8d8' }}>
              {modalContent[legalModal].body}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
