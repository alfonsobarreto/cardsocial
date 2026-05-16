/**
 * Diccionario maestro de respuestas de éxito (6 idiomas).
 * Paralelo a `machineErrorCatalog.ts`; fuente: `services/i18n/machineSuccessQrNfc.json`.
 */

import machineSuccessQrNfc from './i18n/machineSuccessQrNfc.json';
import type { MachineErrorLocale } from './machineErrorCatalog';

export type MachineSuccessLocale = MachineErrorLocale;

const SUCCESS_MAP = machineSuccessQrNfc as Record<string, Record<MachineSuccessLocale, string>>;

/** Mensaje humano para un `successCode` de máquina. */
export function machineSuccessUserMessage(code: string, locale: MachineSuccessLocale): string {
  const c0 = String(code ?? '').trim();
  const row = SUCCESS_MAP[c0];
  if (!row) return c0;
  return row[locale] || row.en;
}
