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
    amount: '$0',
    sub: 'Perfil esencial, temas estándar.',
    features: [
      { label: 'IconData (máx.)', value: '8' },
      { label: 'SmartCards', value: '5' },
      { label: 'BusinessCards', value: '0' },
    ],
    cta: { label: 'Empezar', href: '/login' },
  },
  {
    name: 'Influencer',
    amount: 'Plan destacado',
    sub: 'Temas premium, soporte priorizado, campaña QR (365 días) y add-on NFC.',
    features: [
      { label: 'IconData (máx.)', value: '20' },
      { label: 'SmartCards', value: '10' },
      { label: 'BusinessCards', value: '1' },
    ],
    cta: { label: 'Elegir Influencer', href: '/login' },
    featured: true,
  },
  {
    name: 'Negocio',
    amount: 'Para equipos',
    sub: 'Métricas básicas, gestión de equipo y NFC como add-on.',
    features: [
      { label: 'IconData (máx.)', value: '50' },
      { label: 'SmartCards', value: '10' },
      { label: 'BusinessCards', value: '5' },
    ],
    cta: { label: 'Elegir Negocio', href: '/login' },
  },
  {
    name: 'Enterprise',
    amount: 'A medida',
    sub: 'Límites y base de datos según acuerdo; CRM e integración al alcance del contrato.',
    features: [
      { label: 'IconData', value: 'Custom' },
      { label: 'SmartCards', value: 'Custom' },
      { label: 'BusinessCards', value: 'Custom' },
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
          Referencia de límites; los valores vivos y promociones activas viven en la app y en operaciones.
        </p>

        <p className={styles.rcSectionLabel}>Checkout web (RevenueCat)</p>
        <p className={styles.sectionLead}>
          Aquí se listan los <strong>paquetes del offering actual</strong> en RevenueCat Web Billing (nombre y precio
          reales). No sustituye al CMS de tiers: ese sigue dictando límites y la referencia mensual de Influencer/Negocio
          en la app.
        </p>
        <WebRcSubscriptionCards />

        <p className={styles.rcSectionLabel}>Límites por tier en la app</p>
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
          Los límites numéricos son de referencia comercial. La fuente de verdad es la configuración de plataforma y tu
          plan efectivo al iniciar sesión. Campañas con QR: vigencia 365 días; día 366 sin renovación, downgrade a
          Gratis salvo arreglo comercial.
        </p>
      </div>
    </section>
  );
}
