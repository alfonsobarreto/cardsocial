import type { AppLanguage } from '@/services/language';
import { machineErrorUserMessage, type MachineErrorLocale } from '@/services/machineErrorCatalog';

function toMachineLocale(lang: AppLanguage): MachineErrorLocale {
  return lang as MachineErrorLocale;
}

/** Firebase Auth `auth/...` → código estable del catálogo (nunca mostrar el string crudo al usuario). */
function firebaseAuthCodeToStableCode(firebaseCode: string): string | null {
  const c = String(firebaseCode || '').trim();
  if (!c.startsWith('auth/')) return null;
  switch (c) {
    case 'auth/email-already-in-use':
      return 'email_already_in_use';
    case 'auth/weak-password':
    case 'auth/invalid-email':
    case 'auth/missing-email':
    case 'auth/missing-password':
      return 'REQUIRED_FIELDS_MISSING';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'USER_NOT_FOUND';
    case 'auth/network-request-failed':
    case 'auth/internal-error':
      return 'SERVER_INTERNAL_ERROR';
    case 'auth/too-many-requests':
      return 'rate_limited';
    default:
      return 'SERVER_INTERNAL_ERROR';
  }
}

/**
 * Mensaje seguro para Alert/toast: si el backend devolvió `errorCode`, usa el catálogo (6 idiomas).
 * Sin código: respuestas 5xx/401/403 se mapean a códigos estables; en el resto, `fallbackMessage`.
 */
export function userFacingAlertMessage(
  error: unknown,
  appLanguage: AppLanguage,
  fallbackMessage: string,
): string {
  const locale = toMachineLocale(appLanguage);
  const x = error as {
    response?: { status?: number; data?: { errorCode?: string; error?: string } };
    errorCode?: string;
    code?: string;
  };
  const code = String(x?.response?.data?.errorCode ?? x?.errorCode ?? '').trim();
  if (code) {
    return machineErrorUserMessage(code, locale);
  }

  const fromFirebase = firebaseAuthCodeToStableCode(String(x?.code ?? ''));
  if (fromFirebase) {
    return machineErrorUserMessage(fromFirebase, locale);
  }

  const status = Number(x?.response?.status ?? 0);
  if (status >= 500) {
    return machineErrorUserMessage('SERVER_INTERNAL_ERROR', locale);
  }
  if (status === 401 || status === 403) {
    return machineErrorUserMessage('AUTH_REQUIRED', locale);
  }

  return fallbackMessage;
}

/** Tras `fetch` + `json()` cuando no hay objeto Error con `response` (axios). */
export function userFacingAlertMessageFromHttp(
  status: number,
  body: unknown,
  appLanguage: AppLanguage,
  fallbackMessage: string,
): string {
  const data =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as { errorCode?: string })
      : {};
  const code = String(data.errorCode ?? '').trim();
  if (code) {
    return machineErrorUserMessage(code, toMachineLocale(appLanguage));
  }
  if (status >= 500) {
    return machineErrorUserMessage('SERVER_INTERNAL_ERROR', toMachineLocale(appLanguage));
  }
  if (status === 401 || status === 403) {
    return machineErrorUserMessage('AUTH_REQUIRED', toMachineLocale(appLanguage));
  }
  return fallbackMessage;
}
