import LegalStaticPage from '@/components/LegalStaticPage';
import { USAGE_LINES_EN, USAGE_LINES_ES } from '@/lib/legalContent';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Acceptable Use & Content Policy — Card-Social',
  description: 'Content and acceptable use rules for Card-Social.',
  alternates: { canonical: 'https://cardsocial.me/legal/use' },
};

export default function LegalUseEnPage() {
  return (
    <LegalStaticPage title="Acceptable Use & Content Policy">
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>English</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {USAGE_LINES_EN.map((line) => (
            <li key={line} style={{ marginBottom: 10 }}>
              {line}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Español</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {USAGE_LINES_ES.map((line) => (
            <li key={line} style={{ marginBottom: 10 }}>
              {line}
            </li>
          ))}
        </ul>
      </section>
    </LegalStaticPage>
  );
}
