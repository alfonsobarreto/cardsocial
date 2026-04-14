import LegalStaticPage from '@/components/LegalStaticPage';
import { LEGAL_SUPPORT_EMAIL, LEGAL_URLS } from '@/lib/legalContent';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact — Card-Social',
  description: 'Contact Card-Social for support and privacy inquiries.',
  alternates: { canonical: 'https://cardsocial.me/legal/contact' },
};

export default function LegalContactEnPage() {
  return (
    <LegalStaticPage title="Contact">
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>English</h2>
        <p style={{ margin: '0 0 12px' }}>
          For <strong>support</strong>, <strong>privacy requests</strong>, or <strong>data protection</strong> questions
          related to Card-Social, email:
        </p>
        <p style={{ margin: '0 0 12px', fontWeight: 700, wordBreak: 'break-word' }}>{LEGAL_SUPPORT_EMAIL}</p>
        <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
          Full privacy policy:{' '}
          <a href={LEGAL_URLS.privacyEn} style={{ color: '#00897B' }}>
            {LEGAL_URLS.privacyEn}
          </a>
        </p>
      </section>
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Español</h2>
        <p style={{ margin: '0 0 12px' }}>
          Para <strong>soporte</strong>, <strong>consultas de privacidad</strong> o <strong>protección de datos</strong>{' '}
          relacionadas con Card-Social, escriba a:
        </p>
        <p style={{ margin: '0 0 12px', fontWeight: 700, wordBreak: 'break-word' }}>{LEGAL_SUPPORT_EMAIL}</p>
        <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
          Política de privacidad completa:{' '}
          <a href={LEGAL_URLS.privacyEs} style={{ color: '#00897B' }}>
            {LEGAL_URLS.privacyEs}
          </a>
        </p>
      </section>
    </LegalStaticPage>
  );
}
