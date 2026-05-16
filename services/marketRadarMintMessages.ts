import type { MintMarketRadarIssue } from '@/services/mintMarketRadarEmbedUrl';
import { getCurrentI18nAppLanguage } from '@/services/language';
import { machineErrorUserMessage, type MachineErrorLocale } from '@/services/machineErrorCatalog';

/** Mensaje localizado (6 idiomas) a partir del `errorCode` del mint / red. */
export function marketRadarMintUserMessage(issue: MintMarketRadarIssue): string {
  const lang = getCurrentI18nAppLanguage() as MachineErrorLocale;
  return machineErrorUserMessage(issue.code, lang);
}
