import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Card-Social — Tu identidad digital, elevada',
  description:
    'Networking premium sin contacto: NFC, QR y tarjeta física. Vault en vivo, plantillas exclusivas y planes Gratis, Influencer, Negocio y Enterprise.',
  openGraph: {
    title: 'Card-Social — Tu identidad digital, elevada',
    description:
      'Networking premium: software y tarjetas NFC. Crea tu perfil y conecta en un gesto.',
    url: 'https://cardsocial.me/',
    siteName: 'Card-Social',
    locale: 'es',
    type: 'website',
  },
};

export default function Home() {
  return <LandingPage />;
}
