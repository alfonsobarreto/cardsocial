import { Platform } from 'react-native';

/** Conversión km por milla terrestre (US). */
export const KM_PER_STATUTE_MILE = 1.60934;

export type LocaleLike = {
  measurementSystem?: 'metric' | 'us' | 'uk' | null;
  regionCode?: string | null;
  languageTag?: string | null;
};

/**
 * Usa `measurementSystem` del primer locale (`expo-localization` / `getLocales()[0]`).
 * En Web suele ser `null`: se infiere por región / etiqueta de idioma; por defecto → métrico.
 */
export function devicePrefersMetricDistance(locales: LocaleLike[]): boolean {
  const l = locales[0];
  if (!l) return true;
  const ms = l.measurementSystem;
  if (ms === 'metric') return true;
  if (ms === 'us' || ms === 'uk') return false;

  if (Platform.OS === 'web' || ms == null) {
    const region = (l.regionCode || '').toUpperCase();
    if (region === 'US' || region === 'LR' || region === 'MM' || region === 'GB') {
      return false;
    }
    const tag = (l.languageTag || '').toLowerCase();
    if (tag.endsWith('-us') || tag.includes('-gb')) return false;
  }
  return true;
}

/** Millas (actual en `searchService`) o metros si el backend envía distancia en metros. */
export type MarketDistanceSource = 'miles' | 'meters';

function toMiles(raw: number, source: MarketDistanceSource): number {
  if (source === 'meters') return raw / 1609.344;
  return raw;
}

/**
 * Etiqueta de distancia para listas del Mercado Social.
 * - Fuente actual: `distanceMiles` en millas.
 * - Si en el futuro llegan metros, usar `source: 'meters'`.
 */
export function formatMarketDistanceLabel(
  raw: number,
  tr: (es: string, en: string) => string,
  prefersMetric: boolean,
  source: MarketDistanceSource = 'miles',
): string {
  const miles = toMiles(raw, source);
  if (!Number.isFinite(miles) || miles <= 0) return '';

  if (prefersMetric) {
    const km = miles * KM_PER_STATUTE_MILE;
    if (km > 0 && km < 0.05) {
      return tr('Menos de 100 m', '< 100 m');
    }
    const r = Math.round(km * 10) / 10;
    return `${r.toFixed(1)} ${tr('km', 'km')}`;
  }

  if (miles < 1) {
    return tr('<1 mi', '<1 mi');
  }
  const r = Math.round(miles * 10) / 10;
  return `${r.toFixed(1)} ${tr('mi.', 'mi.')}`;
}
