/**
 * Mercado Pago Checkout Pro (Perú): crea preferencia en backend y abre checkout.
 */

import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';
import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';
import { auth } from '@/services/firebaseConfig';
import { getCurrentI18nAppLanguage, toAcceptLanguageHeader } from '@/services/language';
import type { TierKey } from '@/services/tiersConfigService';

export type MercadoPagoBillingPeriod = 'monthly' | 'annual';
export type MercadoPagoCurrencyId = 'PEN' | 'USD';

export type MercadoPagoPublicConfig = {
  enabled: boolean;
  publicKey: string | null;
  sandbox: boolean;
  supportedCurrencies: MercadoPagoCurrencyId[];
  country: string;
  usdToPenRate: number;
};

export type MercadoPagoCheckoutSession = {
  preferenceId: string;
  initPoint: string;
  sessionId: string;
  currencyId: MercadoPagoCurrencyId;
  amount: number;
};

const CHECKOUT_TIMEOUT_MS = 60_000;

async function getFirebaseIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  return user.getIdToken();
}

function apiBase(): string {
  return resolveExpoPublicApiBaseUrl().replace(/\/+$/, '');
}

export async function fetchMercadoPagoPublicConfig(): Promise<MercadoPagoPublicConfig | null> {
  try {
    const res = await fetch(`${apiBase()}/api/payments/mercadopago/config`, {
      headers: { Accept: 'application/json' },
    });
    const data = (await res.json().catch(() => null)) as MercadoPagoPublicConfig & { ok?: boolean };
    if (!res.ok || !data?.enabled) return null;
    return {
      enabled: Boolean(data.enabled),
      publicKey: data.publicKey ?? null,
      sandbox: Boolean(data.sandbox),
      supportedCurrencies: Array.isArray(data.supportedCurrencies)
        ? (data.supportedCurrencies.filter((c) => c === 'PEN' || c === 'USD') as MercadoPagoCurrencyId[])
        : ['PEN', 'USD'],
      country: String(data.country || 'PE'),
      usdToPenRate: Number(data.usdToPenRate) || 3.75,
    };
  } catch {
    return null;
  }
}

export async function createMercadoPagoCheckoutSession(params: {
  tierKey: Exclude<TierKey, 'free'>;
  billingPeriod: MercadoPagoBillingPeriod;
  currencyId: MercadoPagoCurrencyId;
}): Promise<MercadoPagoCheckoutSession> {
  const idToken = await getFirebaseIdToken();
  const lang = getCurrentI18nAppLanguage();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHECKOUT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/payments/mercadopago/checkout`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...toAcceptLanguageHeader(lang),
      },
      body: JSON.stringify({
        tierKey: params.tierKey,
        billingPeriod: params.billingPeriod,
        currencyId: params.currencyId,
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    errorCode?: string;
    initPoint?: string;
    preferenceId?: string;
    sessionId?: string;
    currencyId?: MercadoPagoCurrencyId;
    amount?: number;
  } | null;

  if (!res.ok || !data?.ok || !data.initPoint) {
    const code = String(data?.errorCode || `http_${res.status}`);
    throw new Error(code);
  }

  return {
    preferenceId: String(data.preferenceId || ''),
    initPoint: String(data.initPoint),
    sessionId: String(data.sessionId || ''),
    currencyId: data.currencyId === 'USD' ? 'USD' : 'PEN',
    amount: Number(data.amount) || 0,
  };
}

/** Perú u otros países donde MP checkout está habilitado en backend. */
export function isMercadoPagoMarketRegion(regionCode: string | null | undefined): boolean {
  const r = String(regionCode || '').trim().toUpperCase();
  return r === 'PE';
}

export async function openMercadoPagoCheckoutUrl(initPoint: string): Promise<void> {
  const url = String(initPoint || '').trim();
  if (!url) throw new Error('mp_invalid_init_point');

  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      enableBarCollapsing: true,
      showInRecents: true,
    });
  } catch {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) throw new Error('mp_browser_open_failed');
    await Linking.openURL(url);
  }
}
