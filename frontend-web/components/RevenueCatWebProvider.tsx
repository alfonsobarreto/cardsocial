'use client';

/**
 * Inicializa RevenueCat Web Billing en el cliente y expone la instancia vía contexto.
 * Importa estilos del checkout una sola vez.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Purchases } from '@revenuecat/purchases-js';

import {
  configureRevenueCatWebClient,
  fetchRevenueCatOfferings,
  getRevenueCatWebPublicApiKey,
  getWebBillingAppUserId,
  type Offerings,
} from '@/lib/revenueCatWeb';

type RevenueCatWebContextValue = {
  client: Purchases | null;
  ready: boolean;
  disabledReason: string | null;
  getOfferings: () => Promise<Offerings | null>;
};

const RevenueCatWebContext = createContext<RevenueCatWebContextValue | null>(null);

type Props = {
  children: React.ReactNode;
  authUserId?: string | null;
};

export function RevenueCatWebProvider({ children, authUserId = null }: Props) {
  const [client, setClient] = useState<Purchases | null>(null);
  const [ready, setReady] = useState(false);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = getRevenueCatWebPublicApiKey();
    if (!apiKey) {
      setDisabledReason(
        'Missing NEXT_PUBLIC_REVENUECAT_WEB_API_KEY (RevenueCat Web Billing public key, not Stripe).',
      );
      setReady(false);
      setClient(null);
      return;
    }

    try {
      if (!Purchases.isConfigured()) {
        const appUserId = getWebBillingAppUserId(authUserId);
        const instance = configureRevenueCatWebClient({ apiKey, appUserId });
        if (!instance) {
          setDisabledReason('configure() returned null');
          setReady(false);
          setClient(null);
          return;
        }
        setClient(instance);
        setDisabledReason(null);
        setReady(true);
        return;
      }

      const instance = Purchases.getSharedInstance();
      setClient(instance);
      setDisabledReason(null);
      setReady(true);

      if (authUserId && String(authUserId).trim()) {
        void instance.changeUser(String(authUserId).trim()).catch(() => {
          /* ignore */
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDisabledReason(msg);
      setReady(false);
      setClient(null);
    }
  }, [authUserId]);

  const getOfferings = useCallback(async (): Promise<Offerings | null> => {
    if (!client) return null;
    try {
      return await fetchRevenueCatOfferings(client);
    } catch {
      return null;
    }
  }, [client]);

  const value = useMemo<RevenueCatWebContextValue>(
    () => ({
      client,
      ready: ready && client != null,
      disabledReason,
      getOfferings,
    }),
    [client, ready, disabledReason, getOfferings],
  );

  return (
    <RevenueCatWebContext.Provider value={value}>{children}</RevenueCatWebContext.Provider>
  );
}

export function useRevenueCatWeb(): RevenueCatWebContextValue {
  const ctx = useContext(RevenueCatWebContext);
  if (!ctx) {
    throw new Error('useRevenueCatWeb must be used within RevenueCatWebProvider');
  }
  return ctx;
}

export function useRevenueCatWebOptional(): RevenueCatWebContextValue | null {
  return useContext(RevenueCatWebContext);
}
