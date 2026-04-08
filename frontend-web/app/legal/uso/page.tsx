import type { Metadata } from 'next';
import LegalStaticPage from '@/components/LegalStaticPage';
import { USAGE_LINES_EN, USAGE_LINES_ES } from '@/lib/legalContent';

export const metadata: Metadata = {
  title: 'Política de Uso — Card-Social',
  description: 'Política de uso y contenido de Card-Social.',
};

export default function LegalUsagePage() {
  return (
    <LegalStaticPage title="Política de Uso">
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Español</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {USAGE_LINES_ES.map((line) => (
            <li key={line} style={{ marginBottom: 10 }}>
              {line}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>English</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {USAGE_LINES_EN.map((line) => (
            <li key={line} style={{ marginBottom: 10 }}>
              {line}
            </li>
          ))}
        </ul>
      </section>
    </LegalStaticPage>
  );
}
