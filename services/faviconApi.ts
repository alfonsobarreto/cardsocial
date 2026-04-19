import axios from 'axios';
import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';

function getApiBaseUrl(): string {
  return resolveExpoPublicApiBaseUrl();
}

function getGatewayKey(): string {
  const key = process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim();
  if (!key) {
    throw new Error('Missing EXPO_PUBLIC_MODERATION_GATEWAY_KEY. Set it in your Expo environment.');
  }
  return key;
}

export async function fetchFaviconFromAzure(url: string): Promise<string | null> {
  const safeUrl = String(url || '').trim();
  if (!safeUrl) {
    return null;
  }

  try {
    const response = await axios.get(`${getApiBaseUrl()}/api/favicon/fetch`, {
      params: { url: safeUrl },
      headers: {
        'x-api-gateway-key': getGatewayKey(),
      },
      timeout: 15000,
    });

    const iconUrl = String(response?.data?.iconUrl || '').trim();
    return iconUrl || null;
  } catch {
    try {
      const normalized = /^https?:\/\//i.test(safeUrl) ? safeUrl : `https://${safeUrl}`;
      const host = new URL(normalized).hostname;
      return `https://www.google.com/s2/favicons?sz=128&domain=${host}`;
    } catch {
      return null;
    }
  }
}
