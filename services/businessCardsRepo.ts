/**
 * Typed REST client for Business Cards.
 *
 * This is the ONLY module in the app that talks to `/api/business-cards/*`.
 * All UI screens go through these functions — no direct axios calls, no
 * Firestore fallbacks, no dual-write.
 *
 * Contract: `services/types/cards.ts` (BusinessCardDoc / BusinessCardCreateInput).
 */

import axios from 'axios';

import type {
  BusinessCardCreateInput,
  BusinessCardDoc,
  BusinessCardUpdateInput,
} from './types/cards';

import { getScopedJwtToken, mapBackendNetworkError } from './backendAuth';

const REQUEST_TIMEOUT_MS = 20000;

async function authHeaders(uid: string) {
  const auth = await getScopedJwtToken(uid, 'qr.access');
  return {
    baseUrl: auth.baseUrl,
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
  };
}

/** List all business cards owned by `uid`, newest first. */
export async function listMyBusinessCards(uid: string): Promise<BusinessCardDoc[]> {
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.get(`${baseUrl}/api/business-cards`, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    const cards = Array.isArray(response?.data?.cards) ? (response.data.cards as BusinessCardDoc[]) : [];
    return cards;
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}

/** Read a single business card by `bId`. Returns null if not found/authorized. */
export async function getBusinessCard(uid: string, bId: string): Promise<BusinessCardDoc | null> {
  const id = String(bId || '').trim();
  if (!id) throw new Error('bId is required');
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.get(`${baseUrl}/api/business-cards/${encodeURIComponent(id)}`, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    return (response?.data?.card as BusinessCardDoc) ?? null;
  } catch (error) {
    const status = Number((error as { response?: { status?: number } })?.response?.status || 0);
    if (status === 404) return null;
    throw mapBackendNetworkError(error, baseUrl);
  }
}

/** Create a new business card. Server generates `bId` + opens a 14-day trial. */
export async function createBusinessCard(
  uid: string,
  input: BusinessCardCreateInput,
): Promise<BusinessCardDoc> {
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.post(`${baseUrl}/api/business-cards`, input, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    const card = response?.data?.card as BusinessCardDoc | undefined;
    if (!card || !card.bId) throw new Error('Backend did not return a card');
    return card;
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}

/** Partial update. Identity fields (ownerUid, bId, createdAt) are rejected server-side. */
export async function updateBusinessCard(
  uid: string,
  bId: string,
  patch: BusinessCardUpdateInput,
): Promise<BusinessCardDoc> {
  const id = String(bId || '').trim();
  if (!id) throw new Error('bId is required');
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.patch(
      `${baseUrl}/api/business-cards/${encodeURIComponent(id)}`,
      patch,
      { headers, timeout: REQUEST_TIMEOUT_MS },
    );
    const card = response?.data?.card as BusinessCardDoc | undefined;
    if (!card || !card.bId) throw new Error('Backend did not return the updated card');
    return card;
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}

/** Hard delete + cascade (share_permissions, calls, mutes). Irreversible. */
export async function deleteBusinessCard(uid: string, bId: string): Promise<void> {
  const id = String(bId || '').trim();
  if (!id) throw new Error('bId is required');
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    await axios.delete(`${baseUrl}/api/business-cards/${encodeURIComponent(id)}`, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}
