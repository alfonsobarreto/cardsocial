/**
 * APIs Next (Studio): locale desde Accept-Language + mensajes vía diccionario maestro.
 * Fuente única de verdad: `services/machineErrorCatalog.ts`.
 */

import {
  machineErrorUserMessage,
  type MachineErrorLocale,
} from '@card-social/services/machineErrorCatalog';

export type UserFacingLocale = MachineErrorLocale;

export { machineErrorUserMessage };

export function pickLocaleFromHeaders(h: Headers | null): UserFacingLocale {
  const raw = String(h?.get('accept-language') ?? 'en').split(',')[0].trim().split(';')[0].trim().toLowerCase();
  if (raw.startsWith('es')) return 'es';
  if (raw.startsWith('it')) return 'it';
  if (raw.startsWith('fr')) return 'fr';
  if (raw.startsWith('de')) return 'de';
  if (raw.startsWith('pt')) return 'pt';
  return 'en';
}

/** Mensaje humano para un `errorCode` de máquina (y fallback opcional por clave legada). */
export function userFacingMessageForErrorCode(
  errorCode: string,
  locale: UserFacingLocale,
  messageKeyFallback?: string,
): string {
  return machineErrorUserMessage(errorCode, locale, messageKeyFallback);
}
