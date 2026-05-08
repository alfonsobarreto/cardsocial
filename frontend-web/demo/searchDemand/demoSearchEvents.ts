/**
 * FASE 4 — Dataset sintético in-memory para Market Radar (GLOBAL_DEMAND demo).
 * No toca base de datos real. Eliminar o desactivar con NEXT_PUBLIC_GLOBAL_DEMO_MODE al pasar a producción.
 */

import { filterEventsByIntentKeyword, filterEventsByNiche } from '@/lib/mockIntelligenceService';

/** Keywords acordadas para frases / search_blob (tendencias simuladas). */
export const DEMO_SEARCH_BASE_KEYWORDS: readonly string[] = [
  'Mecánico 24h',
  'Comida Peruana',
  'Cevichería',
  'Venta de Terrenos',
  'Alquiler de Casas',
  'Inmobiliaria',
  'Agente de Seguros',
  'Restaurante Criollo',
  'Venta de Casas',
  'Servicios Técnicos',
];

const GLOBAL_DEMAND_SOURCE = 'global_demand' as const;

export type DemoHeatmapEvent = {
  lat: number;
  lng: number;
  niche_category: string;
  timestamp: string;
  intent_phrase: string;
  search_blob: string;
  w: number;
  source: typeof GLOBAL_DEMAND_SOURCE;
};

type DemoBucket = {
  id: string;
  label: string;
  centerLat: number;
  centerLng: number;
  /** Número de puntos sintéticos en este bucket */
  eventCount: number;
  /** Dispersión ~gaussiana en grados (radio del “calor”) */
  spreadDeg: number;
  /** Niche fijo para cohorte demo (existe en NICHE_CATEGORIES del filtro UI) */
  nicheCategory: string;
};

const DEMO_BUCKETS: DemoBucket[] = [
  {
    id: 'lima_surco',
    label: 'Lima · Surco',
    centerLat: -12.139,
    centerLng: -76.998,
    eventCount: 2500,
    spreadDeg: 0.035,
    nicheCategory: 'restaurants',
  },
  {
    id: 'lima_barranco',
    label: 'Lima · Barranco',
    centerLat: -12.147,
    centerLng: -77.022,
    eventCount: 2000,
    spreadDeg: 0.032,
    nicheCategory: 'real_estate',
  },
  {
    id: 'tx_katy',
    label: 'Texas · Katy',
    centerLat: 29.7858,
    centerLng: -95.8244,
    eventCount: 1000,
    spreadDeg: 0.045,
    nicheCategory: 'general',
  },
  {
    id: 'tx_dallas',
    label: 'Texas · Dallas',
    centerLat: 32.7767,
    centerLng: -96.797,
    eventCount: 1500,
    spreadDeg: 0.048,
    nicheCategory: 'fitness',
  },
  {
    id: 'tx_austin',
    label: 'Texas · Austin',
    centerLat: 30.2672,
    centerLng: -97.7431,
    eventCount: 2000,
    spreadDeg: 0.042,
    nicheCategory: 'barbershop',
  },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gauss aproximada (Box-Muller lite) para agrupar calor alrededor del centro */
function gaussianPair(rng: () => number): [number, number] {
  const u = rng() || 1e-9;
  const v = rng();
  const mag = Math.sqrt(-2 * Math.log(u));
  return [mag * Math.cos(2 * Math.PI * v), mag * Math.sin(2 * Math.PI * v)];
}

let __demoEventsCache: DemoHeatmapEvent[] | null = null;

function buildDemoEventsOnce(): DemoHeatmapEvent[] {
  const out: DemoHeatmapEvent[] = [];
  let globalIdx = 0;

  for (const bucket of DEMO_BUCKETS) {
    const rng = mulberry32(
      bucket.id.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0) ^ 0x9e3779b9,
    );

    for (let i = 0; i < bucket.eventCount; i++) {
      const [gx, gy] = gaussianPair(rng);
      const lat = bucket.centerLat + gx * bucket.spreadDeg * 0.6;
      const lng = bucket.centerLng + gy * bucket.spreadDeg * 0.6;
      const kw = DEMO_SEARCH_BASE_KEYWORDS[globalIdx % DEMO_SEARCH_BASE_KEYWORDS.length];
      globalIdx += 1;
      const phrase = kw;
      const blob = `${phrase} ${bucket.label} ${bucket.nicheCategory}`.toLowerCase();

      out.push({
        lat,
        lng,
        niche_category: bucket.nicheCategory,
        timestamp: new Date(Date.now() - Math.floor(rng() * 86400000 * 40)).toISOString(),
        intent_phrase: phrase,
        search_blob: blob,
        w: 0.42 + rng() * 0.55,
        source: GLOBAL_DEMAND_SOURCE,
      });
    }
  }

  return out;
}

export function getAllDemoSearchDemandEvents(): DemoHeatmapEvent[] {
  if (!__demoEventsCache) __demoEventsCache = buildDemoEventsOnce();
  return __demoEventsCache;
}

/** Activa el dataset Fase 4 vía entorno (build-time). */
export function isGlobalDemoModeEnv(): boolean {
  return process.env.NEXT_PUBLIC_GLOBAL_DEMO_MODE === '1';
}

/**
 * Toggle Admin en el cliente: si no hay clave, default ON cuando el env está activo.
 * `localStorage cs_global_demo_heatmap` = '1' | '0'
 */
export function isGlobalDemoHeatmapEnabledClient(): boolean {
  if (!isGlobalDemoModeEnv()) return false;
  if (typeof window === 'undefined') return false;
  const v = window.localStorage.getItem('cs_global_demo_heatmap');
  if (v === null) return true;
  return v === '1';
}

export function setGlobalDemoHeatmapEnabledClient(on: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('cs_global_demo_heatmap', on ? '1' : '0');
}

export function getGlobalDemoSearchDemandEvents({
  niche = 'all',
  intentKeyword = '',
}: {
  niche?: string;
  intentKeyword?: string;
}): DemoHeatmapEvent[] {
  let list = getAllDemoSearchDemandEvents();
  list = filterEventsByNiche(list, niche) as DemoHeatmapEvent[];
  list = filterEventsByIntentKeyword(list, intentKeyword) as DemoHeatmapEvent[];
  return list;
}

export function getDemoBucketSummariesForDebug(): { label: string; count: number }[] {
  return DEMO_BUCKETS.map((b) => ({ label: b.label, count: b.eventCount }));
}
