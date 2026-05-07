import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Card-Social — Your Identity Protected. Your Market Dominated.',
  description:
    'Join the private waitlist for Card-Social: encrypted Vault privacy, dynamic cards, business analytics, and local market intelligence.',
  openGraph: {
    title: 'Card-Social — Your Identity Protected. Your Market Dominated.',
    description:
      'The evolution of networking and local intelligence: The Vault, dynamic cards, Social Market, and Market Radar.',
    url: 'https://cardsocial.me/',
    siteName: 'Card-Social',
    locale: 'en_US',
    type: 'website',
  },
};

export default function Home() {
  return <LandingPage />;
}
