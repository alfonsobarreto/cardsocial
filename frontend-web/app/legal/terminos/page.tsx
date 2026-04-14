import type { Metadata } from 'next';
import LegalStaticPage from '@/components/LegalStaticPage';
import { TERMS_LINES_EN, TERMS_LINES_ES } from '@/lib/legalContent';

export const metadata: Metadata = {
  title: 'Términos y Condiciones — Card-Social',
  description: 'Términos y condiciones de uso de Card-Social.',
  alternates: { canonical: 'https://cardsocial.me/legal/terminos' },
};

export default function LegalTermsPage() {
  return (
    <LegalStaticPage title="Términos y Condiciones">
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Español</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {TERMS_LINES_ES.map((line) => (
            <li key={line} style={{ marginBottom: 10 }}>
              {line}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>English</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {TERMS_LINES_EN.map((line) => (
            <li key={line} style={{ marginBottom: 10 }}>
              {line}
            </li>
          ))}
        </ul>
      </section>
    </LegalStaticPage>
  );
}
