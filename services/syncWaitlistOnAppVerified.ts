import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';

/**
 * Tras verificar el correo en la app, marca el lead de waitlist en Firestore (si existe).
 * Idempotente; ignora errores de red para no bloquear el flujo de sesión.
 */
export async function syncWaitlistOnAppVerified(idToken: string): Promise<void> {
  const base = resolveExpoPublicApiBaseUrl();
  try {
    await fetch(`${base}/api/auth/sync-waitlist-on-verified`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
  } catch {
    /* non-blocking */
  }
}
