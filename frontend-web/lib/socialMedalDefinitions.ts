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
  { key: 'creativo', labelEs: 'Estratega', labelEn: 'Strategist', path: mdiLightbulbOn },
  { key: 'conector', labelEs: 'Aliado', labelEn: 'Team Player', path: mdiAccountGroup },
  { key: 'visionario', labelEs: 'Visionario', labelEn: 'Visionary', path: mdiEyeCircle },
  { key: 'conversador', labelEs: 'Líder Alpha', labelEn: 'Alpha Lead', path: mdiMessageStar },
  { key: 'guru', labelEs: 'Influencer', labelEn: 'Influencer', path: mdiLaptop },
] as const satisfies readonly PublicMedalStripDef[];
