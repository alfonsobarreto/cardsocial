import type { ActionCodeSettings } from 'firebase/auth';

/** Debe coincidir con un dominio en Firebase Console → Authentication → Settings → Authorized domains. */
const DEFAULT_CONTINUE_URL = 'https://cardsocial.me/';

function trimBase(raw: string): string {
  const t = raw.trim().replace(/\/+$/, '');
  return t || DEFAULT_CONTINUE_URL.replace(/\/+$/, '');
}

/**
 * URL de continuación tras completar la acción de correo (verificación alta / cambio de email).
 * Configurable con `EXPO_PUBLIC_*` (app) o `NEXT_PUBLIC_*` (web) para staging.
 */
export function getEmailVerificationContinueUrl(): string {
  const fromEnv =
    (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_EMAIL_VERIFICATION_CONTINUE_URL?.trim()) ||
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_EMAIL_VERIFICATION_CONTINUE_URL?.trim()) ||
    '';
  const base = fromEnv ? trimBase(fromEnv) : trimBase(DEFAULT_CONTINUE_URL);
  return base.startsWith('https://') ? base : trimBase(DEFAULT_CONTINUE_URL);
}

/**
 * Opciones para ` sendEmailVerification ` / ` verifyBeforeUpdateEmail `:
 * - `url` enlaza el flujo a tu dominio (mejor alineación con marca y filtros heurísticos).
 * - `handleCodeInApp: false` evita depender de Dynamic Links para el mismo mensaje.
 */
export function getEmailVerificationActionCodeSettings(): ActionCodeSettings {
  const base = getEmailVerificationContinueUrl();
  const url = base.includes('?') ? `${base}&from=email-verification` : `${base}?from=email-verification`;
  return {
    url,
    handleCodeInApp: false,
  };
}
