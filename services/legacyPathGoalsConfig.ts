/**
 * FASE 6 — Bóveda de Metas / Legacy Path (umbrales fijos hasta Diamante).
 * Los valores de progreso (current / ceiling) los inyecta el dashboard; después se conectarán a la DB de referidos.
 */

export const LEGACY_VIBRANT_GOLD = '#E9C349';

export const LEGACY_MODAL_CANVAS_HEX = '#1C1C1E';

/** Umbrales oficiales: Plata · Oro · Platino · Diamante */
export const LEGACY_TIER_THRESHOLDS = [250, 500, 750, 1000] as const;

export type LegacyGoalsTierKey = 'plata' | 'oro' | 'platino' | 'diamante';

export interface LegacyGoalsTierModalCopy {
  bodyEsExact: string;
  bodyEn: string;
}

export interface LegacyGoalsTierDefinition {
  key: LegacyGoalsTierKey;
  threshold: number;
  labelEs: string;
  labelEn: string;
  /** Icono MaterialCommunityIcons dentro del badge del modal */
  modalIconName: string;
  /** Color del icono en el hero del modal */
  modalIconTint: string;
  copy: LegacyGoalsTierModalCopy;
}

/** Copias de modal: ES textual según briefing; EN equivalente para i18n. */
export const LEGACY_GOALS_TIER_DEFINITIONS: readonly LegacyGoalsTierDefinition[] = [
  {
    key: 'plata',
    threshold: 250,
    labelEs: 'Plata',
    labelEn: 'Silver',
    modalIconName: 'check-decagram',
    modalIconTint: '#5AC8FA',
    copy: {
      bodyEsExact:
        '¡Eres Socio Oficial! Has alcanzado 250 referidos. Obtienes la Insignia de Verificación Azul y 1 Mes Business Card Gratis.',
      bodyEn:
        "You're an Official Partner! You've reached 250 referrals. You earn the Blue Verification Badge and 1 free month of Business Card.",
    },
  },
  {
    key: 'oro',
    threshold: 500,
    labelEs: 'Oro',
    labelEn: 'Gold',
    modalIconName: 'credit-card-chip-outline',
    modalIconTint: LEGACY_VIBRANT_GOLD,
    copy: {
      bodyEsExact:
        '¡NFC PVC en Camino! Al llegar a 500, mantienes tu Business Card Gratis y recibes una tarjeta física de PVC con envío gratuito.',
      bodyEn:
        'PVC NFC on the way! At 500 referrals you keep your free Business Card and receive a physical PVC card with free shipping.',
    },
  },
  {
    key: 'platino',
    threshold: 750,
    labelEs: 'Platino',
    labelEn: 'Platinum',
    modalIconName: 'medal',
    modalIconTint: '#D1D1D6',
    copy: {
      bodyEsExact:
        '¡Estatus de Metal! Con 750 referidos obtienes la tarjeta de Metal Premium grabada en láser y otro mes Business de cortesía.',
      bodyEn:
        'Metal status! With 750 referrals you get the Premium laser‑engraved metal card plus another complimentary Business month.',
    },
  },
  {
    key: 'diamante',
    threshold: 1000,
    labelEs: 'Diamante',
    labelEn: 'Diamond',
    modalIconName: 'radar',
    modalIconTint: LEGACY_VIBRANT_GOLD,
    copy: {
      bodyEsExact:
        '¡Dominio Total! Al llegar a 1000 referidos desbloqueas El Radar (Keywords + Mapa de Calor) para ser líder en tu rubro.',
      bodyEn:
        'Total domination! At 1000 referrals you unlock The Radar (Keywords + Heat Map) to lead your niche.',
    },
  },
] as const;

export function legacyReferralsProgressPercent(currentRaw: number, ceilingRaw: number): number {
  const ceiling = Number.isFinite(ceilingRaw) && ceilingRaw > 0 ? ceilingRaw : 1;
  const current = Math.max(0, Number.isFinite(currentRaw) ? currentRaw : 0);
  const pct = (current / ceiling) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
}

export function legacyTierUnlocked(currentRaw: number, threshold: number): boolean {
  const current = Math.max(0, Number.isFinite(currentRaw) ? currentRaw : 0);
  return current >= threshold;
}

export function legacyReferralsRemaining(threshold: number, currentRaw: number): number {
  const current = Math.max(0, Number.isFinite(currentRaw) ? currentRaw : 0);
  return Math.max(0, threshold - current);
}
