import { landingPageMetadata } from '@/lib/landingI18n';
import LandingPage from '@/components/landing/LandingPage';

export const metadata = landingPageMetadata('en');

export default function Home() {
  return <LandingPage autoDetectLocale />;
}
