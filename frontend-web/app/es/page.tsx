import { landingPageMetadata } from '@/lib/landingI18n';
import LandingPage from '@/components/landing/LandingPage';

export const metadata = landingPageMetadata('es');

export default function SpanishLandingPage() {
  return <LandingPage locale="es" />;
}
