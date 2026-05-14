import type { Metadata } from 'next';
import SuscripcionesClient from '@/components/suscripciones/SuscripcionesClient';
import { tr } from '@/lib/suscripcionesI18n';

const locale = 'fr' as const;

export const metadata: Metadata = {
  title: tr(locale, 'meta.title'),
  description: tr(locale, 'meta.description'),
};

export default function SuscripcionesFrPage() {
  return <SuscripcionesClient locale={locale} />;
}
