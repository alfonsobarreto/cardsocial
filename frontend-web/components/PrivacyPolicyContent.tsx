import type { PrivacySection } from '@/lib/legalContent';
import { PRIVACY_SECTIONS_EN, PRIVACY_SECTIONS_ES } from '@/lib/legalContent';
import React from 'react';

function SectionBlock({ section }: { section: PrivacySection }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px', color: '#004D40' }}>{section.title}</h3>
      {section.paragraphs.map((p, i) => (
        <p key={i} style={{ margin: '0 0 12px', whiteSpace: 'pre-line' }}>
          {p}
        </p>
      ))}
    </section>
  );
}

export default function PrivacyPolicyContent({ order }: { order: 'en-first' | 'es-first' }) {
  const primary = order === 'en-first' ? PRIVACY_SECTIONS_EN : PRIVACY_SECTIONS_ES;
  const secondary = order === 'en-first' ? PRIVACY_SECTIONS_ES : PRIVACY_SECTIONS_EN;
  const hPrimary = order === 'en-first' ? 'English' : 'Español';
  const hSecondary = order === 'en-first' ? 'Español' : 'English';

  return (
    <>
      <p style={{ fontSize: 14, opacity: 0.9, marginTop: 0, lineHeight: 1.55 }}>
        {order === 'en-first'
          ? 'This is the official privacy policy for Card-Social (mobile application and related web experiences). A Spanish version is provided below.'
          : 'Esta es la política de privacidad oficial de Card-Social (aplicación móvil y experiencias web relacionadas). Debajo encontrará la versión en inglés.'}
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '22px 0 14px', color: '#00695C' }}>{hPrimary}</h2>
      {primary.map((s) => (
        <SectionBlock key={s.id} section={s} />
      ))}

      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          margin: '28px 0 14px',
          paddingTop: 20,
          borderTop: '1px solid rgba(0, 137, 123, 0.35)',
          color: '#00695C',
        }}
      >
        {hSecondary}
      </h2>
      {secondary.map((s) => (
        <SectionBlock key={`${s.id}-b`} section={s} />
      ))}
    </>
  );
}
