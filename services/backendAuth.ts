/**
 * Shared helpers for authenticated calls against the Card-Social backend.
 *
 * Every repo/service that talks to `/api/*` should use these three functions
 * instead of re-implementing token exchange or URL resolution.
 *
 *   - getApiBaseUrl()           → resolves the public backend base URL from env.
 *   - getApiGatewayKey()        → returns the static gateway key for the edge.
 *   - getScopedJwtToken(uid,s)  → exchanges uid+scope for a short-lived JWT.
 *   - mapBackendNetworkError(e) → normalizes axios errors into friendly Errors.
 *
 * Scope policy: `cards.*` operations use the existing `qr.access` scope. No new
 * scope is introduced until there is a real need to split permissions.
 */

import axios from 'axios';
import { Platform } from 'react-native';

import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';

export type BackendScope = 'moderation.upload' | 'qr.access';

/**
 * Solo __DEV__: escribe en la consola de Metro (no en producción). Sin API keys ni JWT.
 * Úsalo cuando un `axios` falle y quieras ver código/mensaje/URL base.
 */
export function logBackendNetworkDebug(tag: string, error: unknown, baseUrl: string): void {
  if (!__DEV__ || typeof console === 'undefined') return;
  const e = error as {
    message?: string;
    code?: string;
    response?: { status?: number; data?: unknown };
  };
  console.warn(`[CardSocial][net] ${tag}`, {
    baseUrl,
    axiosCode: e?.code ?? null,
    message: String(e?.message || '').slice(0, 280),
    httpStatus: Number(e?.response?.status || 0) || null,
    platform: Platform.OS,
  });
}

export function getApiBaseUrl(): string {
  return resolveExpoPublicApiBaseUrl();
}

export function getApiGatewayKey(): string {
  const key =
    process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim() ||
    process.env.EXPO_PUBLIC_API_GATEWAY_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GATEWAY_KEY?.trim();
  return key || '';
}

export function mapBackendNetworkError(error: unknown, baseUrl: string): Error {
  const err = error as { message?: string; code?: string; response?: { status?: number; data?: { error?: string } } };
  const message = String(err?.message || '');
  const status = Number(err?.response?.status || 0);
  const backendError = String(err?.response?.data?.error || '').trim();
  const isNetwork =
    err?.code === 'ERR_NETWORK' ||
    /Network Error/i.test(message) ||
    /Failed to fetch/i.test(message) ||
    /timeout/i.test(message);

  if (isNetwork) {
    logBackendNetworkDebug('mapBackendNetworkError', error, baseUrl);
    const androidHttpHint =
      Platform.OS === 'android' && /^http:\/\//i.test(baseUrl)
        ? ' En Android con HTTP en la LAN hace falta `android.usesCleartextTraffic: true` en app.json y volver a generar el dev client.'
        : '';
    return new Error(
      `No se pudo conectar con el backend (${baseUrl}). Verifica IP/puerto, misma red Wi-Fi y que el backend esté en marcha.${androidHttpHint}`,
    );
  }
  if (status === 401) return new Error(backendError || 'Sesión inválida o expirada. Vuelve a intentarlo.');
  if (status === 403) return new Error(backendError || 'No tienes permisos para esta operación.');
  if (status === 404) return new Error(backendError || 'Recurso no encontrado.');
  if (status === 409) return new Error(backendError || 'Conflicto con el estado actual.');
  if (backendError) return new Error(backendError);
  return error instanceof Error ? error : new Error(message || 'Backend request failed');
}

export async function getScopedJwtToken(
  uid: string,
  scope: BackendScope,
): Promise<{ token: string; baseUrl: string; gatewayKey: string }> {
  const baseUrl = getApiBaseUrl();
  const gatewayKey = getApiGatewayKey();

  let response: { data?: { token?: string } };
  try {
    response = await axios.post(
      `${baseUrl}/api/auth/token`,
      { uid, scope },
      {
        headers: { 'x-api-gateway-key': gatewayKey },
        timeout: 25000,
      },
    );
  } catch (error) {
    throw mapBackendNetworkError(error, baseUrl);
  }

  const token = String(response?.data?.token || '').trim();
  if (!token) throw new Error('Auth token exchange failed: empty token');

  return { token, baseUrl, gatewayKey };
}
