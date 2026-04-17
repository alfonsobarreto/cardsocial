/**
 * Typed REST client for Smart Cards.
 *
 * This is the ONLY module in the app that talks to `/api/smart-cards/*`.
 * All UI screens go through these functions — no direct axios calls, no
 * Firestore fallbacks, no dual-write.
 *
 * Contract: `services/types/cards.ts` (SmartCardDoc / SmartCardCreateInput).
 *
 * Identity sync: after the user edits their profile (name/avatar/nickname),
 * call `propagateUserIdentityAcrossSmartCards(uid)` ONCE — the backend fans
 * out the change to every card owned by the user.
 */

import axios from 'axios';

import type {
  SmartCardCreateInput,
  SmartCardDoc,
  SmartCardUpdateInput,
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

export async function listMySmartCards(uid: string): Promise<SmartCardDoc[]> {
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.get(`${baseUrl}/api/smart-cards`, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    const cards = Array.isArray(response?.data?.cards) ? (response.data.cards as SmartCardDoc[]) : [];
    return cards;
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}

export async function getSmartCard(uid: string, sid: string): Promise<SmartCardDoc | null> {
  const id = String(sid || '').trim();
  if (!id) throw new Error('sid is required');
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.get(`${baseUrl}/api/smart-cards/${encodeURIComponent(id)}`, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    return (response?.data?.card as SmartCardDoc) ?? null;
  } catch (error) {
    const status = Number((error as { response?: { status?: number } })?.response?.status || 0);
    if (status === 404) return null;
    throw mapBackendNetworkError(error, baseUrl);
  }
}

/** Create. Server projects user identity from `users/{uid}` — client sends nothing identity-ish. */
export async function createSmartCard(
  uid: string,
  input: SmartCardCreateInput,
): Promise<SmartCardDoc> {
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.post(`${baseUrl}/api/smart-cards`, input, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    const card = response?.data?.card as SmartCardDoc | undefined;
    if (!card || !card.sid) throw new Error('Backend did not return a card');
    return card;
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}

/** Partial update (presentation/vault only — identity is read-only from the client). */
export async function updateSmartCard(
  uid: string,
  sid: string,
  patch: SmartCardUpdateInput,
): Promise<SmartCardDoc> {
  const id = String(sid || '').trim();
  if (!id) throw new Error('sid is required');
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.patch(
      `${baseUrl}/api/smart-cards/${encodeURIComponent(id)}`,
      patch,
      { headers, timeout: REQUEST_TIMEOUT_MS },
    );
    const card = response?.data?.card as SmartCardDoc | undefined;
    if (!card || !card.sid) throw new Error('Backend did not return the updated card');
    return card;
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}

export async function deleteSmartCard(uid: string, sid: string): Promise<void> {
  const id = String(sid || '').trim();
  if (!id) throw new Error('sid is required');
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    await axios.delete(`${baseUrl}/api/smart-cards/${encodeURIComponent(id)}`, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}

/**
 * Re-sync `userFullName`, `userAvatarUrl`, `userNickname`, `userOccupation`
 * across ALL smart cards owned by `uid`. Call once after editing the profile.
 *
 * Returns the number of cards updated and the identity snapshot applied.
 */
export async function propagateUserIdentityAcrossSmartCards(
  uid: string,
): Promise<{
  updated: number;
  identity: {
    userFullName: string;
    userAvatarUrl: string | null;
    userNickname: string | null;
    userOccupation: string | null;
  };
}> {
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.post(
      `${baseUrl}/api/smart-cards/propagate-identity`,
      {},
      { headers, timeout: REQUEST_TIMEOUT_MS },
    );
    return {
      updated: Number(response?.data?.updated || 0),
      identity: response?.data?.identity ?? {
        userFullName: '',
        userAvatarUrl: null,
        userNickname: null,
        userOccupation: null,
      },
    };
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}
