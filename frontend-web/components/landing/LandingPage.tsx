import LuxWaitlistLanding, { type LandingLocale } from './LuxWaitlistLanding';

export default function LandingPage({
  locale = 'en',
  autoDetectLocale = false,
}: {
  locale?: LandingLocale;
  autoDetectLocale?: boolean;
}) {
  return <LuxWaitlistLanding locale={locale} autoDetectLocale={autoDetectLocale} />;
}
