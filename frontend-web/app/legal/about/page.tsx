import LegalStaticPage from '@/components/LegalStaticPage';
import { ABOUT_LINES_EN, ABOUT_LINES_ES } from '@/lib/legalContent';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Acerca de — Card-Social',
  description: 'Acerca de Card-Social.',
};

export default function LegalAboutPage() {
  return (
    <LegalStaticPage title="Acerca de Card-Social">
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Español</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {ABOUT_LINES_ES.map((line) => (
            <li key={line} style={{ marginBottom: 10 }}>
              {line}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>English</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {ABOUT_LINES_EN.map((line) => (
            <li key={line} style={{ marginBottom: 10 }}>
              {line}
            </li>
          ))}
        </ul>
      </section>
    </LegalStaticPage>
  );
}
