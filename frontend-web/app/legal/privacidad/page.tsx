import LegalStaticPage from '@/components/LegalStaticPage';
import PrivacyPolicyContent from '@/components/PrivacyPolicyContent';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidad — Card-Social',
  description:
    'Cámara, micrófono, Ghost-Link, FaceCall (Agora RTC), códigos QR, ubicación y Firebase. Card-Social no vende tus datos.',
  alternates: { canonical: 'https://cardsocial.me/legal/privacidad' },
};

export default function LegalPrivacyEsPage() {
  return (
    <LegalStaticPage title="Política de Privacidad">
      <PrivacyPolicyContent order="es-first" />
    </LegalStaticPage>
  );
}
