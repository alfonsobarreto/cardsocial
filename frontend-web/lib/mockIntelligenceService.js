/**
 * Proprietary mock intelligence — simulates internal search-intent events only.
 * No third-party POI feeds. Replace with API / DB when production data is wired.
 */

/**
 * @typedef {{
 *   lat: number,
 *   lng: number,
 *   niche_category: string,
 *   timestamp: string,
 *   intent_phrase: string,
 *   search_blob: string,
 * }} SearchIntentEvent
 */

export const NICHE_CATEGORIES = [
  'restaurants',
  'food_trucks',
  'barbershop',
  'real_estate',
  'nails',
  'fitness',
  'general',
];

/** Expanded intent lexicon tied to cohorts — used only for deterministic mock tagging. */
const INTENT_BY_NICHE = {
  restaurants: [
    'comida peruana',
    'comida mexicana',
    'mariscos frescos',
    'bbq central texas',
    'sushi omakase',
    'brunch weekend',
    'vegan brunch',
    'steakhouse',
    'fried chicken southern',
    'ramen izakaya',
  ],
  food_trucks: [
    'tacos al pastor',
    'food truck burgers',
    'arepas',
    'korean fusion truck',
    'bbq brisket tray',
    'ceviche truck',
    'coffee trailer',
    'late night sliders',
    'churros',
    'vietnamese bahn mi',
  ],
  barbershop: [
    'fade haircut',
    'beard trim shave',
    'kids haircut',
    'walk in barber',
    'mens grooming',
    'straight razor lineup',
    'braids shop',
    'loc maintenance',
    'black owned barbershop',
    'premium cut',
  ],
  real_estate: [
    'lotes urbanos',
    'lotes comerciales',
    'homes for lease',
    'townhomes nuevo',
    'acreage hill country',
    'invest duplex',
    'fixer flip',
    'land for sale texas',
    'short term rental permit',
    'new construction modelo',
  ],
  nails: [
    'gel manicure',
    'nail art bridal',
    'acrylic refill',
    'pedicure spa',
    'dip powder nails',
    'lash extensions studio',
    'brow threading',
    'mobile manicure',
    'walk in nails',
    'lux nail spa',
  ],
  fitness: [
    'personal trainer grupos',
    'crossfit box',
    'hot yoga studio',
    'pilates reformer',
    'open gym mes',
    'bootcamp sunrise',
    'pickleball league',
    'swim lessons adult',
    'mma gym',
    'recovery stretch',
  ],
  general: [
    'electricista residencial',
    'plomería emergencia',
    'construcción remodelacion',
    'hvac instalación',
    'limpieza comercial',
    'landscaping xeriscape',
    'cerrajero 24h',
    'pintura exterior',
    'mudanzas locales',
    'tech support soporte informático',
  ],
};

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Austin metro + Killeen / Fort Cavazos corridor (internal simulation ROI).
 */
const REGIONS = [
  { latMin: 30.08, latMax: 30.58, lngMin: -98.12, lngMax: -97.48, weight: 0.55 },
  { latMin: 30.92, latMax: 31.38, lngMin: -98.05, lngMax: -97.52, weight: 0.28 },
  { latMin: 30.56, latMax: 30.92, lngMin: -97.98, lngMax: -97.22, weight: 0.17 },
];

function pickWeightedRegion() {
  const r = Math.random();
  let acc = 0;
  for (const reg of REGIONS) {
    acc += reg.weight;
    if (r <= acc) return reg;
  }
  return REGIONS[0];
}

/** @param {string} text */
export function normalizeIntentText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim();
}

/**
 * Compose a deterministic search blob used for substring / token probes.
 */
function composeSearchBlob(nicheCategory, intentPhrase) {
  const phrases = INTENT_BY_NICHE[nicheCategory] ?? INTENT_BY_NICHE.general;
  const synonyms = [...phrases, nicheCategory.replace(/_/g, ' '), intentPhrase];
  const raw = synonyms.join(' | ');
  return normalizeIntentText(raw);
}

/** @returns {number} stable-ish index from string */
function hashPick(str, modulo) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % Math.max(1, modulo);
}

function pickIntentForNiche(nicheCategory, salt) {
  const list = INTENT_BY_NICHE[nicheCategory] ?? INTENT_BY_NICHE.general;
  const idx = hashPick(`${nicheCategory}-${salt}`, list.length);
  return list[idx];
}

/**
 * @param {number} [total=5000]
 * @returns {SearchIntentEvent[]}
 */
export function generateSearchIntentEvents(total = 5000) {
  const events = [];
  const now = Date.now();
  const windowMs = 86400000 * 45;
  for (let i = 0; i < total; i++) {
    const reg = pickWeightedRegion();
    const niche = NICHE_CATEGORIES[Math.floor(Math.random() * NICHE_CATEGORIES.length)];
    const lat = randomBetween(reg.latMin, reg.latMax);
    const lng = randomBetween(reg.lngMin, reg.lngMax);
    const intentPhrase = pickIntentForNiche(niche, `${i}-${lat}-${lng}`);
    events.push({
      lat,
      lng,
      niche_category: niche,
      timestamp: new Date(now - Math.floor(Math.random() * windowMs)).toISOString(),
      intent_phrase: intentPhrase,
      search_blob: composeSearchBlob(niche, intentPhrase),
    });
  }
  return events;
}

/**
 * Filters by free-text keyword against proprietary `intent_phrase` + `search_blob`.
 * Empty / short query ⇒ no narrowing (heatmap uses full corpus for current niche).
 * @param {SearchIntentEvent[]} events
 * @param {string} rawQuery
 */
export function filterEventsByIntentKeyword(events, rawQuery) {
  const norm = normalizeIntentText(rawQuery);
  if (!norm || norm.length < 2) return events;
  const tokens = norm.split(' ').filter((w) => w.length >= 2);
  return events.filter((e) => {
    const blob = e.search_blob || normalizeIntentText(e.intent_phrase || '');
    if (blob.includes(norm)) return true;
    const phrase = normalizeIntentText(e.intent_phrase || '');
    if (phrase.includes(norm) || norm.includes(phrase)) return true;
    if (tokens.length === 0) return true;
    return tokens.every((tok) => blob.includes(tok) || phrase.includes(tok));
  });
}

/**
 * @param {SearchIntentEvent[]} events
 * @param {string} niche — use 'all' for no filter
 */
export function filterEventsByNiche(events, niche) {
  if (!niche || niche === 'all') return events;
  return events.filter((e) => e.niche_category === niche);
}

export function eventsToGeoJSONFeatureCollection(events) {
  return {
    type: 'FeatureCollection',
    features: events.map((e, i) => ({
      type: 'Feature',
      id: i,
      geometry: {
        type: 'Point',
        coordinates: [e.lng, e.lat],
      },
      properties: {
        niche_category: e.niche_category,
        timestamp: e.timestamp,
        intent_phrase: e.intent_phrase || '',
        w: 1,
      },
    })),
  };
}

/** Ray casting; ring closed [lng,lat][] */
export function pointInPolygonRing(lng, lat, ring) {
  if (!ring?.length) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * @param {{ type:string, features: object[] }} featureCollection GeoJSON FeatureCollection
 * @param {number} lng
 * @param {number} lat
 */
export function findZipFeatureForPoint(featureCollection, lng, lat) {
  for (const f of featureCollection.features || []) {
    const geom = f.geometry;
    if (!geom) continue;
    if (geom.type === 'Polygon') {
      const outer = geom.coordinates[0];
      if (pointInPolygonRing(lng, lat, outer)) return f;
    }
  }
  return null;
}

/**
 * Events whose coordinates fall inside a GeoJSON Polygon feature exterior ring.
 * @param {SearchIntentEvent[]} events
 * @param {object|null} polygonFeature
 */
export function filterEventsInZipFeature(events, polygonFeature) {
  if (!polygonFeature?.geometry || polygonFeature.geometry.type !== 'Polygon') return [];
  const ring = polygonFeature.geometry.coordinates[0];
  return events.filter((e) => pointInPolygonRing(e.lng, e.lat, ring));
}

/**
 * @param {{ type:string, features: object[] }} zipFc
 */
export function computeZipSeoMetrics(zipFc, lng, lat, corpusEvents) {
  const feature = findZipFeatureForPoint(zipFc, lng, lat);
  if (!feature) {
    return {
      zip: null,
      zipLabel: null,
      eventsInZip: [],
      modeledSignals: 0,
      uniqueIntents: 0,
    };
  }
  const z = feature.properties?.ZCTA ?? null;
  const label = feature.properties?.label ?? null;
  const eventsInZip = filterEventsInZipFeature(corpusEvents, feature);
  const uniqueIntents = new Set(eventsInZip.map((e) => e.intent_phrase || '').filter(Boolean)).size;
  return {
    zip: z,
    zipLabel: label,
    eventsInZip,
    modeledSignals: eventsInZip.length,
    uniqueIntents,
  };
}

/**
 * Spatial bucket index for fast hover density (proprietary points only).
 */
export function buildDensityGrid(events, cellDeg = 0.04) {
  /** @type {Map<string, number>} */
  const grid = new Map();
  for (const e of events) {
    const gx = Math.floor(e.lng / cellDeg);
    const gy = Math.floor(e.lat / cellDeg);
    const k = `${gx},${gy}`;
    grid.set(k, (grid.get(k) || 0) + 1);
  }
  return { grid, cellDeg };
}

export function sampleDensity({ grid, cellDeg }, lng, lat) {
  const gx = Math.floor(lng / cellDeg);
  const gy = Math.floor(lat / cellDeg);
  let sum = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      sum += grid.get(`${gx + dx},${gy + dy}`) || 0;
    }
  }
  return sum;
}
