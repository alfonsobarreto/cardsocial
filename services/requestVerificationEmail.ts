import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';

export type VerificationEmailLocale = 'es' | 'en';

/**
 * Envía el correo de verificación vía backend (Resend + Firebase Admin link).
 * Requiere usuario recién autenticado con Firebase (ID token).
 */
export async function requestVerificationEmailViaBackend(
  idToken: string,
  locale: VerificationEmailLocale,
): Promise<void> {
  const base = resolveExpoPublicApiBaseUrl();
  const res = await fetch(`${base}/api/auth/send-verification-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ locale }),
  });

  let payload: { ok?: boolean; error?: string; alreadyVerified?: boolean; retryAfterSec?: number } = {};
  try {
    payload = await res.json();
  } catch {
    /* ignore */
  }

  if (res.status === 429) {
    const wait = payload.retryAfterSec ?? 90;
    throw new Error(
      locale === 'es'
        ? `Espera ${wait}s antes de pedir otro correo de verificación.`
        : `Please wait ${wait}s before requesting another verification email.`,
    );
  }

  if (!res.ok) {
    throw new Error(
      payload.error || (locale === 'es' ? 'No se pudo enviar el correo de verificación.' : 'Could not send verification email.'),
    );
  }

  if (payload.alreadyVerified) {
    return;
  }
}
