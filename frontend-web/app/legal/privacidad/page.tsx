import type { Metadata } from 'next';
import LegalStaticPage from '@/components/LegalStaticPage';
import { PRIVACY_PARAGRAPH_EN, PRIVACY_PARAGRAPH_ES } from '@/lib/legalContent';

export const metadata: Metadata = {
  title: 'Política de Privacidad — Card-Social',
  description: 'Política de privacidad de Card-Social.',
};

export default function LegalPrivacyPage() {
  return (
    <LegalStaticPage title="Política de Privacidad">
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Español</h2>
        <p style={{ margin: 0 }}>{PRIVACY_PARAGRAPH_ES}</p>
      </section>
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>English</h2>
        <p style={{ margin: 0 }}>{PRIVACY_PARAGRAPH_EN}</p>
      </section>
    </LegalStaticPage>
  );
}
