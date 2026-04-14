import LegalStaticPage from '@/components/LegalStaticPage';
import PrivacyPolicyContent from '@/components/PrivacyPolicyContent';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Card-Social',
  description:
    'Camera, microphone, Ghost-Link, FaceCall (Agora RTC), QR codes, location, and Firebase. Card-Social does not sell your data.',
  alternates: { canonical: 'https://cardsocial.me/legal/privacy' },
  openGraph: {
    title: 'Privacy Policy — Card-Social',
    url: 'https://cardsocial.me/legal/privacy',
  },
};

/** URL recomendada para Google Play Console (inglés primero). */
export default function LegalPrivacyEnPage() {
  return (
    <LegalStaticPage title="Privacy Policy">
      <PrivacyPolicyContent order="en-first" />
    </LegalStaticPage>
  );
}
