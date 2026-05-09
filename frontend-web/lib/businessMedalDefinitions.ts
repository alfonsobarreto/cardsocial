import {
  mdiCrown,
  mdiHandshakeOutline,
  mdiShieldCheck,
  mdiStarCircleOutline,
  mdiTrophy,
} from '@mdi/js';

/** Icono + etiquetas para la franja pública de medallas (negocio o social). */
export type PublicMedalStripDef = {
  readonly key: string;
  readonly labelEs: string;
  readonly labelEn: string;
  readonly path: string;
};

/** Paridad de claves / orden con `services/medalService.ts` (`BUSINESS_MEDALS`). */
export const PUBLIC_BUSINESS_MEDAL_DEFINITIONS = [
  { key: 'compromiso', labelEs: 'Compromiso', labelEn: 'Commitment', path: mdiHandshakeOutline },
  { key: 'servicio', labelEs: 'Servicio', labelEn: 'Service', path: mdiStarCircleOutline },
  { key: 'confianza', labelEs: 'Confianza', labelEn: 'Trust', path: mdiShieldCheck },
  { key: 'prestigio', labelEs: 'Prestigio', labelEn: 'Prestige', path: mdiCrown },
  { key: 'excelencia', labelEs: 'Excelencia', labelEn: 'Excellence', path: mdiTrophy },
] as const satisfies readonly PublicMedalStripDef[];
