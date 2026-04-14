import LegalStaticPage from '@/components/LegalStaticPage';
import { LEGAL_SUPPORT_EMAIL, LEGAL_URLS } from '@/lib/legalContent';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contacto — Card-Social',
  description: 'Contacto y soporte de Card-Social.',
  alternates: { canonical: 'https://cardsocial.me/legal/contacto' },
};

export default function LegalContactEsPage() {
  return (
    <LegalStaticPage title="Contacto">
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Español</h2>
        <p style={{ margin: '0 0 12px' }}>
          Para <strong>soporte</strong>, <strong>privacidad</strong> o <strong>protección de datos</strong> relacionados con
          Card-Social, escriba a:
        </p>
        <p style={{ margin: '0 0 12px', fontWeight: 700, wordBreak: 'break-word' }}>{LEGAL_SUPPORT_EMAIL}</p>
        <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
          Política de privacidad:{' '}
          <a href={LEGAL_URLS.privacyEs} style={{ color: '#00897B' }}>
            {LEGAL_URLS.privacyEs}
          </a>
        </p>
      </section>
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>English</h2>
        <p style={{ margin: '0 0 12px' }}>
          For <strong>support</strong>, <strong>privacy</strong>, or <strong>data protection</strong> inquiries, email:
        </p>
        <p style={{ margin: '0 0 12px', fontWeight: 700, wordBreak: 'break-word' }}>{LEGAL_SUPPORT_EMAIL}</p>
        <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
          Privacy policy:{' '}
          <a href={LEGAL_URLS.privacyEn} style={{ color: '#00897B' }}>
            {LEGAL_URLS.privacyEn}
          </a>
        </p>
      </section>
    </LegalStaticPage>
  );
}
