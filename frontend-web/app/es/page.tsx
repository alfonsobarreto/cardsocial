import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Card-Social — Tu Identidad Protegida. Tu Mercado Dominado.',
  description:
    'Únete a la lista de espera privada de Card-Social: Vault cifrado, tarjetas dinámicas, analítica de negocio e inteligencia de mercado local.',
  openGraph: {
    title: 'Card-Social — Tu Identidad Protegida. Tu Mercado Dominado.',
    description:
      'La evolución del networking y la inteligencia local: The Vault, tarjetas dinámicas, Social Market y Market Radar.',
    url: 'https://cardsocial.me/es',
    siteName: 'Card-Social',
    locale: 'es',
    type: 'website',
  },
};

export default function SpanishLandingPage() {
  return <LandingPage locale="es" />;
}
