/**
 * Base URL del backend en el cliente Expo (moderación, QR, `/api/auth/token`, etc.).
 *
 * Prioridad: `EXPO_PUBLIC_BACKEND_BASE_URL` (canónica / una sola IP en .env) →
 * `EXPO_PUBLIC_MODERATION_API_URL` (compatibilidad con proyectos que solo definían esta).
 *
 * No uses localhost/127.0.0.1 en móvil físico: la app rechaza esa URL.
 */

let __lastResolvedApiBaseLog: string | null = null;

export function resolveExpoPublicApiBaseUrl(): string {
  const fromBackend = process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.trim() || '';
  const fromModeration = process.env.EXPO_PUBLIC_MODERATION_API_URL?.trim() || '';
  const source: 'EXPO_PUBLIC_BACKEND_BASE_URL' | 'EXPO_PUBLIC_MODERATION_API_URL' = fromBackend
    ? 'EXPO_PUBLIC_BACKEND_BASE_URL'
    : 'EXPO_PUBLIC_MODERATION_API_URL';
  const envUrl = fromBackend || fromModeration;
  if (!envUrl) {
    throw new Error(
      'Falta EXPO_PUBLIC_BACKEND_BASE_URL o EXPO_PUBLIC_MODERATION_API_URL. Define la base del backend en .env y reinicia Expo con -c.',
    );
  }
  const normalized = envUrl.replace(/\/+$/, '');
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) {
    throw new Error(
      'La URL del backend no puede ser localhost/127.0.0.1 en móvil físico. Usa la IP LAN del PC (ej. http://192.168.x.x:4000) o HTTPS público.',
    );
  }

  if (__DEV__ && typeof console !== 'undefined') {
    const conflict =
      fromBackend && fromModeration && fromBackend.replace(/\/+$/, '') !== fromModeration.replace(/\/+$/, '');
    const sig = `${source}|${normalized}|${conflict ? 'conflict' : ''}`;
    if (__lastResolvedApiBaseLog !== sig) {
      __lastResolvedApiBaseLog = sig;
      console.log('[CardSocial][apiBase]', {
        source,
        resolvedUrl: normalized,
        rawEXPO_PUBLIC_BACKEND_BASE_URL: fromBackend || '(vacío)',
        rawEXPO_PUBLIC_MODERATION_API_URL: fromModeration || '(vacío)',
        duplicateUrlsDiffer: conflict
          ? 'Sí: define solo una URL canónica o iguala ambas; si no, gana BACKEND en resolveExpoPublicApiBaseUrl pero otros archivos pueden leer solo MODERATION.'
          : 'No',
      });
    }
  }

  return normalized;
}
