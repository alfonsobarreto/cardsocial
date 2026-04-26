import axios from 'axios';

import { getScopedJwtToken, mapBackendNetworkError } from '@/services/backendAuth';
import type {
  NfcCardDoc,
  NfcLinkInput,
  NfcMountInput,
  NfcMountOption,
  NfcStatusInput,
} from '@/services/types/nfc';

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

export async function listMyNfcCards(uid: string): Promise<NfcCardDoc[]> {
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.get(`${baseUrl}/api/nfc/cards`, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    return Array.isArray(response?.data?.cards) ? (response.data.cards as NfcCardDoc[]) : [];
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}

export async function listNfcMountOptions(uid: string): Promise<NfcMountOption[]> {
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.get(`${baseUrl}/api/nfc/mount-options`, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    return Array.isArray(response?.data?.options) ? (response.data.options as NfcMountOption[]) : [];
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}

export async function linkNfcCard(uid: string, input: NfcLinkInput): Promise<NfcCardDoc> {
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.post(`${baseUrl}/api/nfc/cards/link`, input, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    const card = response?.data?.card as NfcCardDoc | undefined;
    if (!card?.nfcCardId) throw new Error('Backend did not return NFC card');
    return card;
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}

export async function mountNfcCard(uid: string, nfcCardId: string, input: NfcMountInput): Promise<NfcCardDoc> {
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.post(`${baseUrl}/api/nfc/cards/${encodeURIComponent(nfcCardId)}/mount`, input, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    const card = response?.data?.card as NfcCardDoc | undefined;
    if (!card?.nfcCardId) throw new Error('Backend did not return NFC card');
    return card;
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}

export async function updateNfcCardStatus(uid: string, nfcCardId: string, input: NfcStatusInput): Promise<NfcCardDoc> {
  const { baseUrl, headers } = await authHeaders(uid);
  try {
    const response = await axios.patch(`${baseUrl}/api/nfc/cards/${encodeURIComponent(nfcCardId)}/status`, input, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    const card = response?.data?.card as NfcCardDoc | undefined;
    if (!card?.nfcCardId) throw new Error('Backend did not return NFC card');
    return card;
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }
}
