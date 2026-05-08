import type { Metadata } from 'next';

import ExecutiveSummaryLanding from '@/components/landing/ExecutiveSummaryLanding';

export const metadata: Metadata = {
  title: 'Executive Summary · Business Model Canvas · Card-Social',
  description:
    'Documento estratégico: Business Model Canvas para equipo de marca, marketing e inversionistas.',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  alternates: { canonical: '/executive-summary' },
};

export default function ExecutiveSummaryPage() {
  return <ExecutiveSummaryLanding />;
}
