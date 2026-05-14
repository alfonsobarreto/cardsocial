'use client';

/**
 * Suscripción web: paquetes devueltos por la pasarela configurada en el proyecto.
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
      return 'Plan disponible';
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
        setError('No hay planes disponibles en la pasarela en este momento.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las ofertas.');
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
      setError(e instanceof Error ? e.message : 'No se pudo completar el pago.');
    } finally {
      setPurchasingId(null);
    }
  }

  if (disabledReason) {
    return (
      <div className={styles.rcBannerMuted}>
        <p>
          <strong>Aviso:</strong> {disabledReason}
        </p>
        <p className={styles.rcBannerHint}>Si necesitas ayuda, contacta con soporte.</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className={styles.rcBannerMuted}>
        <p>Preparando la pasarela de pago…</p>
      </div>
    );
  }

  const featuredIndex =
    packages.length >= 2 ? Math.min(1, packages.length - 1) : packages.length === 1 ? 0 : -1;

  return (
    <div className={styles.rcBlock}>
      {loading ? <p className={styles.rcLoading}>Cargando planes…</p> : null}
      {error ? (
        <p className={styles.rcError} role="alert">
          {error}
        </p>
      ) : null}

      {!loading && packages.length === 0 ? (
        <div className={styles.rcBannerMuted}>
          <p>
            Cuando los planes estén publicados en tu pasarela, aparecerán aquí con el nombre y precio actuales.
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
                  Referencia: <code>{pkg.identifier}</code>
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
        Los límites por nivel en Card-Social (IconData, Smart Cards, etc.) se gestionan en la experiencia principal de la
        app. Esta sección solo muestra la suscripción web cuando está habilitada. Puedes{' '}
        <Link href="/login">iniciar sesión</Link> antes si quieres unificar la compra con tu cuenta.
      </p>
    </div>
  );
}
