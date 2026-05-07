/**
 * MarketTrendAggregator
 * ─────────────────────
 * Hybrid Intelligence Engine that orchestrates two market-demand sources:
 *
 *  • InternalSource  — proprietary search-intent corpus emitted by the
 *                      Card-Social network (currently 5k mock events from
 *                      `mockIntelligenceService`). Replaceable by repository
 *                      fetch when production data is wired.
 *
 *  • ExternalSource  — public demand signal feed (Google Trends via SerpApi
 *                      proxy, structured for any equivalent provider). When
 *                      `NEXT_PUBLIC_TRENDS_PROXY_URL` is unset or the request
 *                      fails, returns a deterministic broad-spread mock so
 *                      the heatmap stays alive in offline / dev mode.
 *
 * Both sources emit the same event shape so the existing Mapbox heatmap
 * pipeline works unchanged. Weighted via a normalized `w ∈ [0..1]` field.
 */

import {
  NICHE_CATEGORIES,
  generateSearchIntentEvents,
  filterEventsByNiche,
  filterEventsByIntentKeyword,
} from './mockIntelligenceService';

export const DATA_SOURCES = Object.freeze({
  APP_NETWORK: 'app_network',
  GLOBAL_DEMAND: 'global_demand',
});

/** @typedef {'app_network' | 'global_demand'} DataSourceKey */

/**
 * @typedef {{
 *   lat: number, lng: number,
 *   niche_category: string,
 *   timestamp: string,
 *   intent_phrase: string,
 *   search_blob: string,
 *   w: number,
 *   source: DataSourceKey,
 * }} HybridEvent
 */

/* ────────────────────────────────────────────────────────────────────────── */
/*  InternalSource — proprietary search intent                                */
/* ────────────────────────────────────────────────────────────────────────── */

export class InternalSource {
  constructor({ size = 5000 } = {}) {
    this._size = size;
    this._cache = null;
  }

  _prime() {
    if (this._cache) return this._cache;
    const base = generateSearchIntentEvents(this._size);
    this._cache = base.map((e) => ({
      ...e,
      w: 1,
      source: DATA_SOURCES.APP_NETWORK,
    }));
    return this._cache;
  }

  /** @param {{ niche?: string, intentKeyword?: string }} q */
  async fetch({ niche = 'all', intentKeyword = '' } = {}) {
    let list = this._prime();
    list = filterEventsByNiche(list, niche);
    list = filterEventsByIntentKeyword(list, intentKeyword);
    return list;
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  ExternalSource — Google Trends proxy (SerpApi-shaped)                     */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Anchors used for the external broad-spread mock. Real proxy responses
 * (Google Trends "interest by region") are normalized to the same shape.
 */
const TX_DEMAND_ANCHORS = [
  { city: 'Austin', lat: 30.2672, lng: -97.7431, weight: 1.0, spread: 0.45 },
  { city: 'Dallas', lat: 32.7767, lng: -96.7970, weight: 0.94, spread: 0.55 },
  { city: 'Houston', lat: 29.7604, lng: -95.3698, weight: 0.92, spread: 0.6 },
  { city: 'San Antonio', lat: 29.4241, lng: -98.4936, weight: 0.81, spread: 0.5 },
  { city: 'Killeen / Fort Cavazos', lat: 31.1171, lng: -97.7278, weight: 0.55, spread: 0.4 },
  { city: 'Waco', lat: 31.5493, lng: -97.1467, weight: 0.46, spread: 0.35 },
  { city: 'Corpus Christi', lat: 27.8006, lng: -97.3964, weight: 0.4, spread: 0.45 },
];

export class ExternalSource {
  /**
   * @param {{ proxyUrl?: string, apiKey?: string, defaultCountry?: string, mockSize?: number }} cfg
   */
  constructor({ proxyUrl, apiKey, defaultCountry = 'US-TX', mockSize = 1100 } = {}) {
    this.proxyUrl =
      typeof proxyUrl === 'string' && proxyUrl.trim().length > 0
        ? proxyUrl.trim()
        : (typeof process !== 'undefined' && process.env
            ? (process.env.NEXT_PUBLIC_TRENDS_PROXY_URL || '').trim()
            : '');
    this.apiKey = apiKey ?? null;
    this.defaultCountry = defaultCountry;
    this.mockSize = mockSize;
  }

  /** @param {{ niche?: string, intentKeyword?: string, country?: string }} q */
  async fetch({ niche = 'all', intentKeyword = '', country } = {}) {
    if (this.proxyUrl) {
      try {
        const url = new URL(this.proxyUrl);
        url.searchParams.set('engine', 'google_trends');
        if (intentKeyword) url.searchParams.set('q', intentKeyword);
        url.searchParams.set('geo', country ?? this.defaultCountry);
        if (niche && niche !== 'all') url.searchParams.set('niche', niche);

        const resp = await fetch(url.toString(), {
          headers: this.apiKey ? { 'x-api-key': this.apiKey } : undefined,
          cache: 'no-store',
        });
        if (resp.ok) {
          const json = await resp.json();
          return normalizeExternalPayload(json, niche);
        }
      } catch {
        /* fall through to mock so the heatmap never goes dark */
      }
    }

    return this._mockFallback({ niche, intentKeyword });
  }

  /** Deterministic-ish broad spread; visually distinct from internal density. */
  _mockFallback({ niche = 'all', intentKeyword = '' }) {
    const seedSalt = `${niche}-${intentKeyword}`;
    const rng = mulberry32(hashString(seedSalt) || 1);
    const total = this.mockSize;
    /** @type {HybridEvent[]} */
    const out = [];

    for (let i = 0; i < total; i++) {
      const anchor = pickWeighted(TX_DEMAND_ANCHORS, rng);
      const lat = anchor.lat + (rng() - 0.5) * anchor.spread;
      const lng = anchor.lng + (rng() - 0.5) * anchor.spread;
      const nicheCategory =
        niche !== 'all' && NICHE_CATEGORIES.includes(niche)
          ? niche
          : NICHE_CATEGORIES[Math.floor(rng() * NICHE_CATEGORIES.length)];

      const interest = Math.min(
        1,
        anchor.weight * (0.55 + rng() * 0.6) + (rng() - 0.5) * 0.08,
      );
      const w = Math.max(0.18, interest);
      const phrase = intentKeyword || `${nicheCategory.replace(/_/g, ' ')} ${anchor.city}`;
      out.push({
        lat,
        lng,
        niche_category: nicheCategory,
        timestamp: new Date().toISOString(),
        intent_phrase: phrase,
        search_blob: `${phrase} ${nicheCategory.replace(/_/g, ' ')} ${anchor.city.toLowerCase()}`,
        w,
        source: DATA_SOURCES.GLOBAL_DEMAND,
      });
    }
    return out;
  }
}

/**
 * Normalize an upstream Google-Trends-shaped payload into HybridEvent[].
 * Accepts both SerpApi `interest_by_region` and a generic `{points:[{lat,lng,score}]}` shape.
 */
function normalizeExternalPayload(payload, niche) {
  const niches = niche !== 'all' && NICHE_CATEGORIES.includes(niche) ? niche : 'general';

  if (Array.isArray(payload?.points)) {
    return payload.points
      .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
      .map((p) => ({
        lat: Number(p.lat),
        lng: Number(p.lng),
        niche_category: p.niche_category || niches,
        timestamp: p.timestamp || new Date().toISOString(),
        intent_phrase: p.query || p.intent_phrase || '',
        search_blob: String(p.query || p.intent_phrase || '').toLowerCase(),
        w: clamp01(typeof p.score === 'number' ? p.score / 100 : p.w ?? 0.6),
        source: DATA_SOURCES.GLOBAL_DEMAND,
      }));
  }

  if (Array.isArray(payload?.interest_by_region)) {
    return payload.interest_by_region
      .filter((r) => Number.isFinite(r?.coordinates?.latitude))
      .map((r) => ({
        lat: r.coordinates.latitude,
        lng: r.coordinates.longitude,
        niche_category: niches,
        timestamp: new Date().toISOString(),
        intent_phrase: r.query || '',
        search_blob: String(r.query || '').toLowerCase(),
        w: clamp01((r.value ?? 0) / 100),
        source: DATA_SOURCES.GLOBAL_DEMAND,
      }));
  }

  return [];
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Aggregator                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

export class MarketTrendAggregator {
  /** @param {{ externalProxyUrl?: string, externalApiKey?: string, internalSize?: number }} cfg */
  constructor(cfg = {}) {
    this.internal = new InternalSource({ size: cfg.internalSize ?? 5000 });
    this.external = new ExternalSource({
      proxyUrl: cfg.externalProxyUrl,
      apiKey: cfg.externalApiKey,
    });
  }

  /**
   * @param {DataSourceKey} source
   * @param {{ niche?: string, intentKeyword?: string }} q
   * @returns {Promise<HybridEvent[]>}
   */
  async fetch(source, q = {}) {
    if (source === DATA_SOURCES.APP_NETWORK) return this.internal.fetch(q);
    if (source === DATA_SOURCES.GLOBAL_DEMAND) return this.external.fetch(q);
    throw new Error(`MarketTrendAggregator: unknown source "${source}"`);
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(items, rng) {
  const total = items.reduce((acc, x) => acc + (x.weight ?? 1), 0);
  let r = rng() * total;
  for (const x of items) {
    r -= x.weight ?? 1;
    if (r <= 0) return x;
  }
  return items[items.length - 1];
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Heatmap intensity scaling helpers                                         */
/*  Keeps the golden gradient visually balanced regardless of source volume.  */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Build paint overrides for the Mapbox `intent-heatmap` layer matched to a source.
 * Internal corpus is ~5k dense points (count-driven density). External corpus is
 * sparser with weighted scores — needs larger radius + softer intensity to stay
 * legible without "blob washing" the gold.
 *
 * @param {DataSourceKey} source
 */
export function heatmapPaintForSource(source) {
  if (source === DATA_SOURCES.GLOBAL_DEMAND) {
    return {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'w'], 0, 0, 1, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 6, 0.7, 12, 1.65],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 6, 22, 12, 56],
      'heatmap-opacity': 0.9,
    };
  }
  return {
    'heatmap-weight': ['interpolate', ['linear'], ['get', 'w'], 0, 0, 1, 1],
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.85, 12, 1.95],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 7, 10, 12, 32],
    'heatmap-opacity': 0.93,
  };
}

/**
 * Convert a HybridEvent[] into the GeoJSON FeatureCollection consumed by Mapbox.
 * Preserves the `w` weight + `source` so the layer can route paint accurately.
 */
export function eventsToGeoJSON(events) {
  return {
    type: 'FeatureCollection',
    features: events.map((e, i) => ({
      type: 'Feature',
      id: i,
      geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
      properties: {
        niche_category: e.niche_category,
        timestamp: e.timestamp,
        intent_phrase: e.intent_phrase || '',
        w: typeof e.w === 'number' ? e.w : 1,
        source: e.source,
      },
    })),
  };
}
