/**
 * Client-side facade for Business Card Licenses.
 *
 * Antes vivía en Firestore (`users/{uid}/business_card_licenses/{bId}`). Ahora
 * habla contra el backend REST montado en `/api/business-card-licenses/*`, que
 * persiste en Mongo (ver `backend/src/routes/businessLicensesRoutes.js`).
 * La firma pública (`activateOrRenewBusinessLicense`,
 * `hasActiveBusinessLicense`) se mantiene para no romper callsites.
 */

import axios from 'axios';
import { getScopedJwtToken, mapBackendNetworkError } from '@/services/backendAuth';

export interface BusinessCardLicense {
  uid: string;
  bId: string;
  annualPriceUsd: number;
  startedAt: string;
  expiresAt: string;
  isActive: boolean;
  purchaseId?: string;
  platform?: 'ios' | 'android';
  cashbackCreditsGranted: number;
  updatedAt: string;
}

function asLicense(raw: unknown): BusinessCardLicense {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    uid: String(r.uid || ''),
    bId: String(r.bId || ''),
    annualPriceUsd: Number(r.annualPriceUsd || 0),
    startedAt: String(r.startedAt || new Date().toISOString()),
    expiresAt: String(r.expiresAt || new Date().toISOString()),
    isActive: Boolean(r.isActive),
    purchaseId: r.purchaseId ? String(r.purchaseId) : undefined,
    platform: r.platform === 'ios' || r.platform === 'android' ? r.platform : undefined,
    cashbackCreditsGranted: Number(r.cashbackCreditsGranted || 0),
    updatedAt: String(r.updatedAt || new Date().toISOString()),
  };
}

export async function activateOrRenewBusinessLicense(params: {
  uid: string;
  bId: string;
  purchaseId?: string;
  platform?: 'ios' | 'android';
  annualPriceUsd: number;
  cashbackCreditsGranted: number;
}): Promise<BusinessCardLicense> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');
  try {
    const response = await axios.post(
      `${auth.baseUrl}/api/business-card-licenses/upsert`,
      {
        uid: params.uid,
        bId: params.bId,
        annualPriceUsd: params.annualPriceUsd,
        cashbackCreditsGranted: params.cashbackCreditsGranted,
        purchaseId: params.purchaseId,
        platform: params.platform,
      },
      {
        headers: {
          'x-api-gateway-key': auth.gatewayKey,
          Authorization: `Bearer ${auth.token}`,
        },
        timeout: 15000,
      },
    );
    return asLicense(response?.data?.license);
  } catch (error) {
    throw mapBackendNetworkError(error, auth.baseUrl);
  }
}

export async function hasActiveBusinessLicense(uid: string, bId: string): Promise<boolean> {
  try {
    const auth = await getScopedJwtToken(uid, 'qr.access');
    const response = await axios.get(
      `${auth.baseUrl}/api/business-card-licenses/${encodeURIComponent(bId)}/active`,
      {
        params: { uid },
        headers: {
          'x-api-gateway-key': auth.gatewayKey,
          Authorization: `Bearer ${auth.token}`,
        },
        timeout: 12000,
      },
    );
    return Boolean(response?.data?.active);
  } catch {
    /**
     * Devolvemos `false` en cualquier fallo (red, 401, 404). El callsite
     * principal es el Social Market: mejor ocultar una card por precaución
     * que publicarla por un error transitorio.
     */
    return false;
  }
}

/**
 * Lista todas las licencias del usuario (para la evaluación de dull-mode en
 * `vault.tsx`). Devuelve `[]` si falla la red.
 */
export async function listBusinessLicenses(uid: string): Promise<BusinessCardLicense[]> {
  try {
    const auth = await getScopedJwtToken(uid, 'qr.access');
    const response = await axios.get(
      `${auth.baseUrl}/api/business-card-licenses/`,
      {
        params: { uid },
        headers: {
          'x-api-gateway-key': auth.gatewayKey,
          Authorization: `Bearer ${auth.token}`,
        },
        timeout: 12000,
      },
    );
    const rows = Array.isArray(response?.data?.licenses) ? response.data.licenses : [];
    return rows.map(asLicense);
  } catch {
    return [];
  }
}
