import {
  mdiAccountGroup,
  mdiEyeCircle,
  mdiLaptop,
  mdiLightbulbOn,
  mdiMessageStar,
} from '@mdi/js';

import type { PublicMedalStripDef } from '@/lib/businessMedalDefinitions';

/** Paridad con `services/medalService.ts` (`SOCIAL_MEDALS`). */
export const PUBLIC_SOCIAL_MEDAL_DEFINITIONS = [
  { key: 'creativo', labelEs: 'Mente Creativa', labelEn: 'Creative Mind', path: mdiLightbulbOn },
  { key: 'conector', labelEs: 'Súper Conector', labelEn: 'Super Connector', path: mdiAccountGroup },
  { key: 'visionario', labelEs: 'Visionario', labelEn: 'Visionary', path: mdiEyeCircle },
  { key: 'conversador', labelEs: 'Buen Conversador', labelEn: 'Good Conversationalist', path: mdiMessageStar },
  { key: 'guru', labelEs: 'Gurú Tech', labelEn: 'Tech Guru', path: mdiLaptop },
] as const satisfies readonly PublicMedalStripDef[];
