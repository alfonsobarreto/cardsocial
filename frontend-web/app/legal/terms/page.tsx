import LegalStaticPage from '@/components/LegalStaticPage';
import { TERMS_LINES_EN, TERMS_LINES_ES } from '@/lib/legalContent';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Use — Card-Social',
  description: 'Terms and conditions for using the Card-Social mobile application.',
  alternates: { canonical: 'https://cardsocial.me/legal/terms' },
};

export default function LegalTermsEnPage() {
  return (
    <LegalStaticPage title="Terms of Use">
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>English</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {TERMS_LINES_EN.map((line) => (
            <li key={line} style={{ marginBottom: 10 }}>
              {line}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Español</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {TERMS_LINES_ES.map((line) => (
            <li key={line} style={{ marginBottom: 10 }}>
              {line}
            </li>
          ))}
        </ul>
      </section>
    </LegalStaticPage>
  );
}
