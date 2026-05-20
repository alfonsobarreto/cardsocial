import type { PromotionsQrMarketRadarIssue } from '@/services/promotionsQrMarketRadarEmbedUrl';
import { getCurrentI18nAppLanguage } from '@/services/language';
import { machineErrorUserMessage, type MachineErrorLocale } from '@/services/machineErrorCatalog';

/** Mensaje localizado desde el código de error de red / Studio. */
export function marketRadarPromotionsQrUserMessage(issue: PromotionsQrMarketRadarIssue): string {
  const lang = getCurrentI18nAppLanguage() as MachineErrorLocale;
  return machineErrorUserMessage(issue.code, lang);
}
