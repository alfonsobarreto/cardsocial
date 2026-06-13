import Link from 'next/link';

import styles from '../landing.module.css';
import { WebRcSubscriptionCards } from './WebRcSubscriptionCards';

type Tier = {
  name: string;
  amount: string;
  sub: string;
  features: { label: string; value: string }[];
  cta: { label: string; href: string };
  featured?: boolean;
};

const tiers: Tier[] = [
  {
    name: 'Gratis',
    amount: 'Según la app',
    sub: 'Perfil esencial; límites exactos al usar Card-Social.',
    features: [
      { label: 'IconData (máx.)', value: 'En app' },
      { label: 'SmartCards', value: 'En app' },
      { label: 'BusinessCards', value: 'En app' },
    ],
    cta: { label: 'Empezar', href: '/login' },
  },
  {
    name: 'Influencer',
    amount: 'Ver membresía',
    sub: 'USD, CS, periodo de prueba y límites: todo en la página de planes.',
    features: [
      { label: 'IconData (máx.)', value: 'En app' },
      { label: 'SmartCards', value: 'En app' },
      { label: 'BusinessCards', value: 'En app' },
    ],
    cta: { label: 'Planes y membresía', href: '/es/suscripciones' },
    featured: true,
  },
  {
    name: 'Negocio',
    amount: 'Ver membresía',
    sub: 'USD, CS, periodo de prueba y límites: todo en la página de planes.',
    features: [
      { label: 'IconData (máx.)', value: 'En app' },
      { label: 'SmartCards', value: 'En app' },
      { label: 'BusinessCards', value: 'En app' },
    ],
    cta: { label: 'Planes y membresía', href: '/es/suscripciones' },
  },
  {
    name: 'Enterprise',
    amount: 'A medida',
    sub: 'Límites y base de datos según acuerdo; CRM e integración al alcance del contrato.',
    features: [
      { label: 'IconData', value: 'A medida' },
      { label: 'SmartCards', value: 'A medida' },
      { label: 'BusinessCards', value: 'A medida' },
    ],
    cta: { label: 'Contactar', href: '/legal/contacto' },
  },
];

export function PricingSection() {
  return (
    <section className={styles.pricing} id="pricing" aria-labelledby="pricing-heading">
      <div className={styles.inner}>
        <p className={styles.label}>Planes</p>
        <h2 className={styles.sectionTitle} id="pricing-heading">
          Cuatro niveles, un mismo producto
        </h2>
        <p className={styles.sectionLead}>
          Tarifas vigentes y detalle por idioma:{' '}
          <Link href="/suscripciones" className={styles.inlineLink}>
            EN
          </Link>
          {' · '}
          <Link href="/es/suscripciones" className={styles.inlineLink}>
            ES
          </Link>
          {' · '}
          <Link href="/de/suscripciones" className={styles.inlineLink}>
            DE
          </Link>
          {' · '}
          <Link href="/fr/suscripciones" className={styles.inlineLink}>
            FR
          </Link>
          {' · '}
          <Link href="/it/suscripciones" className={styles.inlineLink}>
            IT
          </Link>
          {' · '}
          <Link href="/pt/suscripciones" className={styles.inlineLink}>
            PT
          </Link>
          .
        </p>

        <p className={styles.rcSectionLabel}>Pago en la web</p>
        <p className={styles.sectionLead}>
          Si está activado, aquí aparecen los planes disponibles para suscripción web con el importe mostrado por la
          pasarela. Los límites de uso siguen definidos en la app.
        </p>
        <WebRcSubscriptionCards />

        <p className={styles.rcSectionLabel}>Límites por nivel en la app</p>
        <div className={styles.pricingGrid}>
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`${styles.priceCard} ${t.featured ? styles.priceCardFeatured : ''}`}
            >
              {t.featured ? <span className={styles.badge}>Más popular</span> : null}
              <h3 className={styles.priceName}>{t.name}</h3>
              <p className={styles.priceSub}>{t.sub}</p>
              <p className={styles.priceAmount}>{t.amount}</p>
              <ul className={styles.list}>
                {t.features.map((f) => (
                  <li key={f.label}>
                    <strong>{f.label}:</strong> {f.value}
                  </li>
                ))}
              </ul>
              <Link
                className={`${styles.priceCta} ${t.featured ? styles.priceCtaGold : ''}`}
                href={t.cta.href}
              >
                {t.cta.label}
              </Link>
            </div>
          ))}
        </div>
        <p className={styles.disclaimer}>
          Cifras orientativas; el plan efectivo es el de tu sesión en Card-Social. Campañas con QR: vigencia 365 días;
          día 366 sin renovación, retorno al nivel gratuito salvo acuerdo comercial.
        </p>
      </div>
    </section>
  );
}
