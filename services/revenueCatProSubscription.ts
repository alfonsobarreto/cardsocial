/**
 * Card-Social Pro: entitlements, paywall (RevenueCat UI) y Customer Center.
 * Claves públicas solo vía EXPO_PUBLIC_* en .env — nunca secret keys en el cliente.
 */

import { Platform } from 'react-native';
import Purchases, { type CustomerInfo } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import {
  CARD_SOCIAL_PRO_ENTITLEMENT_ID,
  CARD_SOCIAL_PRO_ENTITLEMENT_LOOKUP_KEYS,
  CARD_SOCIAL_PRO_OFFERING_ID,
} from '@/constants/revenueCat';
import { initRevenueCatOnce } from '@/services/revenueCatInit';

export { PAYWALL_RESULT } from 'react-native-purchases-ui';

function isNativeStore(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/** Texto legible para errores de compra / paywall. */
export function formatRevenueCatPurchaseError(error: unknown): { cancelled: boolean; message: string } {
  const e = error as { userCancelled?: boolean; code?: string; message?: string };
  if (e?.userCancelled) {
    return { cancelled: true, message: '' };
  }
  const code = e?.code;
  if (code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
    return { cancelled: true, message: '' };
  }
  const msg = typeof e?.message === 'string' && e.message.trim() ? e.message.trim() : 'RevenueCat error';
  return { cancelled: false, message: msg };
}

export function customerInfoHasCardSocialPro(info: CustomerInfo | null | undefined): boolean {
  if (!info?.entitlements?.active) return false;
  const active = info.entitlements.active;
  for (const id of CARD_SOCIAL_PRO_ENTITLEMENT_LOOKUP_KEYS) {
    if (active[id] != null) return true;
  }
  return false;
}

/** Equivalente al switch habitúal de la doc del paywall (éxito = compra o restore). */
export function paywallResultIndicatesUnlock(result: PAYWALL_RESULT): boolean {
  switch (result) {
    case PAYWALL_RESULT.PURCHASED:
    case PAYWALL_RESULT.RESTORED:
      return true;
    case PAYWALL_RESULT.NOT_PRESENTED:
    case PAYWALL_RESULT.ERROR:
    case PAYWALL_RESULT.CANCELLED:
    default:
      return false;
  }
}

export async function fetchCustomerInfoSafe(): Promise<CustomerInfo | null> {
  if (!isNativeStore()) return null;
  initRevenueCatOnce();
  try {
    if (!(await Purchases.isConfigured())) return null;
    return await Purchases.getCustomerInfo();
  } catch (err) {
    console.warn('[RevenueCat] getCustomerInfo failed:', err);
    return null;
  }
}

export async function refreshCardSocialProActive(): Promise<boolean> {
  const info = await fetchCustomerInfoSafe();
  return customerInfoHasCardSocialPro(info);
}

/**
 * Vincula el perfil de compras al UID de Firebase (recomendado en producción).
 */
export async function syncRevenueCatWithFirebaseUid(firebaseUid: string | null | undefined): Promise<void> {
  if (!isNativeStore()) return;
  initRevenueCatOnce();
  try {
    if (!(await Purchases.isConfigured())) return;
  } catch {
    return;
  }

  if (!firebaseUid) {
    try {
      await Purchases.logOut();
    } catch {
      /* ignore */
    }
    return;
  }

  try {
    await Purchases.logIn(firebaseUid);
  } catch (e) {
    console.warn('[RevenueCat] logIn failed:', e);
  }
}

async function resolveOfferingForPaywall() {
  const offerings = await Purchases.getOfferings();
  if (CARD_SOCIAL_PRO_OFFERING_ID) {
    const named = offerings.all[CARD_SOCIAL_PRO_OFFERING_ID];
    if (named) return named;
  }
  return offerings.current ?? null;
}

/** Paywall modal si el usuario aún no tiene el entitlement Pro. */
export async function presentCardSocialProPaywallIfNeeded(): Promise<PAYWALL_RESULT> {
  if (!isNativeStore()) return PAYWALL_RESULT.NOT_PRESENTED;
  initRevenueCatOnce();
  const offering = await resolveOfferingForPaywall();
  return RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: CARD_SOCIAL_PRO_ENTITLEMENT_ID,
    ...(offering ? { offering } : {}),
  });
}

/** Paywall siempre (p. ej. desde "Ver planes"). */
export async function presentCardSocialProPaywall(): Promise<PAYWALL_RESULT> {
  if (!isNativeStore()) return PAYWALL_RESULT.NOT_PRESENTED;
  initRevenueCatOnce();
  const offering = await resolveOfferingForPaywall();
  return RevenueCatUI.presentPaywall({
    ...(offering ? { offering } : {}),
  });
}

/** Customer Center (gestión de suscripción, restore, etc. según dashboard RC). */
export async function presentRevenueCatCustomerCenter(): Promise<void> {
  if (!isNativeStore()) return;
  initRevenueCatOnce();
  await RevenueCatUI.presentCustomerCenter({});
}

/** Resumen de paquetes del offering actual (lifetime / annual / monthly) para debug UI. */
export async function describeCurrentOfferingPackages(): Promise<string[]> {
  if (!isNativeStore()) return [];
  initRevenueCatOnce();
  try {
    if (!(await Purchases.isConfigured())) return [];
    const offerings = await Purchases.getOfferings();
    const o = offerings.current;
    if (!o?.availablePackages?.length) return ['(sin paquetes en offering current — revisa RevenueCat → Offerings)'];
    return o.availablePackages.map(
      (pkg) => `${pkg.identifier} [${String(pkg.packageType)}]`,
    );
  } catch (e) {
    return [`Error: ${e instanceof Error ? e.message : String(e)}`];
  }
}
