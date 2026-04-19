/**
 * Base URL del backend en el cliente Expo (moderación, QR, `/api/auth/token`, etc.).
 *
 * Prioridad: `EXPO_PUBLIC_BACKEND_BASE_URL` (canónica / una sola IP en .env) →
 * `EXPO_PUBLIC_MODERATION_API_URL` (compatibilidad con proyectos que solo definían esta).
 *
 * No uses localhost/127.0.0.1 en móvil físico: la app rechaza esa URL.
 */
export function resolveExpoPublicApiBaseUrl(): string {
  const envUrl =
    process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_MODERATION_API_URL?.trim();
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
  return normalized;
}
