import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Card-Social — Tu Identidad Protegida. Tu Mercado Dominado.',
  description:
    'Únete a la lista de espera privada de Card-Social: identidad protegida, tarjetas NFC premium, Social Market y radar hiperlocal de oportunidades.',
  openGraph: {
    title: 'Card-Social — Tu Identidad Protegida. Tu Mercado Dominado.',
    description:
      'La evolución del networking y la inteligencia local: privacidad, NFC premium, Social Market y heatmap de intención de búsqueda.',
    url: 'https://cardsocial.me/',
    siteName: 'Card-Social',
    locale: 'es',
    type: 'website',
  },
};

export default function Home() {
  return <LandingPage />;
}
