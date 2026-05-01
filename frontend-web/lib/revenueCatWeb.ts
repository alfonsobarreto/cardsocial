/**
 * RevenueCat Web Billing (@revenuecat/purchases-js) — solo en el cliente.
 * Requiere app Web Billing en el dashboard y clave pública RC (no es una clave secreta de Stripe).
 *
 * @see https://www.revenuecat.com/docs/web/web-billing/web-sdk
 */

import {
  LogLevel,
  type Offering,
  type Offerings,
  type Package,
  Purchases,
} from '@revenuecat/purchases-js';

const STORAGE_ANON_KEY = 'cardsocial_rc_web_anonymous_app_user_id';

export function getRevenueCatWebPublicApiKey(): string {
  return String(process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY ?? '').trim();
}

/**
 * ID estable para usuarios sin login: formato RC anonymous o UUID guardado en localStorage.
 */
export function getWebBillingAppUserId(loggedInUserId?: string | null): string {
  if (loggedInUserId && String(loggedInUserId).trim()) {
    return String(loggedInUserId).trim();
  }
  if (typeof window === 'undefined') {
    return Purchases.generateRevenueCatAnonymousAppUserId();
  }
  try {
    const existing = window.localStorage.getItem(STORAGE_ANON_KEY);
    if (existing) return existing;
    const anon = Purchases.generateRevenueCatAnonymousAppUserId();
    window.localStorage.setItem(STORAGE_ANON_KEY, anon);
    return anon;
  } catch {
    return Purchases.generateRevenueCatAnonymousAppUserId();
  }
}

/**
 * Configura el SDK una vez. Devuelve null si falta la API key (no rompe la app).
 */
export function configureRevenueCatWebClient(options: { apiKey: string; appUserId: string }): Purchases | null {
  const { apiKey, appUserId } = options;
  if (!apiKey) return null;

  if (Purchases.isConfigured()) {
    return Purchases.getSharedInstance();
  }

  if (process.env.NODE_ENV === 'development') {
    Purchases.setLogLevel(LogLevel.Debug);
  } else {
    Purchases.setLogLevel(LogLevel.Warn);
  }

  return Purchases.configure({
    apiKey,
    appUserId,
  });
}

/** Ofertas completas (current + all). */
export async function fetchRevenueCatOfferings(client: Purchases): Promise<Offerings> {
  return client.getOfferings();
}

/** Vista reducida para UI: paquetes típicos lifetime / annual / monthly del offering actual. */
export function pickProPackagesFromOfferings(offerings: Offerings | null): {
  offeringId: string | null;
  lifetime: Package | null;
  yearly: Package | null;
  monthly: Package | null;
  allPackages: Package[];
} {
  const current = offerings?.current ?? null;
  if (!current) {
    return {
      offeringId: null,
      lifetime: null,
      yearly: null,
      monthly: null,
      allPackages: [],
    };
  }
  return {
    offeringId: current.identifier,
    lifetime: current.lifetime,
    yearly: current.annual,
    monthly: current.monthly,
    allPackages: current.availablePackages ?? [],
  };
}

export type { Offerings, Offering, Package };
export { LogLevel, Purchases };
