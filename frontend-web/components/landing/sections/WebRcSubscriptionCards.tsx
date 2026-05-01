'use client';

/**
 * Precios de checkout web = RevenueCat Web Billing (offering actual).
 * NO proviene del CMS Firestore `system_config/tiers` (ese CMS define límites y “precio mensual” de referencia por tier).
 */

import { ErrorCode, PackageType, type Package } from '@revenuecat/purchases-js';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { useRevenueCatWeb } from '@/components/RevenueCatWebProvider';

import styles from '../landing.module.css';

function billingSubtitle(pkg: Package): string {
  switch (pkg.packageType) {
    case PackageType.Lifetime:
      return 'Pago único';
    case PackageType.Annual:
      return 'Facturación anual';
    case PackageType.Monthly:
      return 'Facturación mensual';
    case PackageType.Weekly:
      return 'Facturación semanal';
    case PackageType.SixMonth:
      return 'Facturación cada 6 meses';
    case PackageType.ThreeMonth:
      return 'Facturación trimestral';
    case PackageType.TwoMonth:
      return 'Facturación bimestral';
    default:
      return 'Plan en RevenueCat';
  }
}

function cardCopy(pkg: Package): { headline: string; price: string; hint: string } {
  const p = pkg.webBillingProduct;
  const price = p?.price?.formattedPrice ?? '—';
  const headline = (p?.title ?? '').trim() || pkg.identifier;
  const hint = (p?.description ?? '').trim().slice(0, 140);
  return { headline, price, hint };
}

export function WebRcSubscriptionCards() {
  const { ready, client, disabledReason, getOfferings } = useRevenueCatWeb();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready || !client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const offerings = await getOfferings();
      const list = offerings?.current?.availablePackages ?? [];
      setPackages(list);
      if (list.length === 0 && offerings?.current == null) {
        setError('No hay offering actual en RevenueCat o está vacío.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar ofertas');
      setPackages([]);
    } finally {
      setLoading(false);
    }
  }, [ready, client, getOfferings]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handlePurchase(pkg: Package) {
    if (!client) return;
    setPurchasingId(pkg.identifier);
    setError(null);
    try {
      await client.purchase({ rcPackage: pkg });
      await load();
    } catch (e: unknown) {
      const err = e as { errorCode?: ErrorCode };
      if (err?.errorCode === ErrorCode.UserCancelledError) return;
      setError(e instanceof Error ? e.message : 'Error en el pago');
    } finally {
      setPurchasingId(null);
    }
  }

  if (disabledReason) {
    return (
      <div className={styles.rcBannerMuted}>
        <p>
          <strong>Checkout web (RevenueCat):</strong> {disabledReason}
        </p>
        <p className={styles.rcBannerHint}>Define NEXT_PUBLIC_REVENUECAT_WEB_API_KEY para precios en vivo.</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className={styles.rcBannerMuted}>
        <p>Preparando pasarela de pago…</p>
      </div>
    );
  }

  const featuredIndex =
    packages.length >= 2 ? Math.min(1, packages.length - 1) : packages.length === 1 ? 0 : -1;

  return (
    <div className={styles.rcBlock}>
      {loading ? <p className={styles.rcLoading}>Cargando planes desde RevenueCat…</p> : null}
      {error ? (
        <p className={styles.rcError} role="alert">
          {error}
        </p>
      ) : null}

      {!loading && packages.length === 0 ? (
        <div className={styles.rcBannerMuted}>
          <p>
            No hay paquetes publicados en el <strong>offering actual</strong> de RevenueCat Web Billing. Cuando los
            añadas en el dashboard, aparecerán aquí con su nombre y precio reales.
          </p>
        </div>
      ) : null}

      {packages.length > 0 ? (
        <div className={styles.rcGrid}>
          {packages.map((pkg, index) => {
            const { headline, price, hint } = cardCopy(pkg);
            const busy = purchasingId === pkg.identifier;
            const featured = index === featuredIndex;
            return (
              <div
                key={pkg.identifier}
                className={`${styles.priceCard} ${featured ? styles.priceCardFeatured : ''}`}
              >
                {featured ? <span className={styles.badge}>Destacado</span> : null}
                <h3 className={styles.priceName}>{headline}</h3>
                <p className={styles.priceSub}>{billingSubtitle(pkg)}</p>
                <p className={styles.priceAmount}>{price}</p>
                <p className={styles.rcPackId}>
                  Paquete: <code>{pkg.identifier}</code>
                </p>
                {hint ? <p className={styles.rcHint}>{hint}</p> : null}
                <button
                  type="button"
                  className={`${styles.priceCta} ${featured ? styles.priceCtaGold : ''} ${styles.priceCtaButton}`}
                  disabled={purchasingId != null}
                  onClick={() => void handlePurchase(pkg)}
                >
                  {busy ? 'Procesando…' : 'Suscribirse'}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className={styles.rcFootnote}>
        Los <strong>límites por tier</strong> (IconData, Smart Cards, etc.) los define el CMS de operaciones; esta
        fila es solo la <strong>pasarela de pago</strong> (RevenueCat + Stripe). Puedes{' '}
        <Link href="/login">iniciar sesión</Link> antes si quieres unificar la compra con tu cuenta.
      </p>
    </div>
  );
}
