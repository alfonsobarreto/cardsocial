/**
 * Métricas de crecimiento (Fase 1): Firestore directo, filtros por fecha donde aplica.
 * - Altas: `users.createdAt`
 * - Segmentación: `language` / `appLanguage` / `locale`, `country`
 * - Tarjetas Smart: collectionGroup `users/{uid}/cards`
 * - Business cards: colección top-level `businessCards` (puede estar vacía si el tráfico es solo Mongo)
 * - Medallas (actividad): `medals/{id}/votes/{userId}.votedAt` (últimos 30 días)
 * Errores y notas devuelven claves admin_*; la UI traduce con useAdminT.
 */

import {
  collection,
  collectionGroup,
  documentId,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export type DailyPoint = {
  key: string;
  label: string;
  count: number;
};

export type WeeklyPoint = {
  key: string;
  label: string;
  count: number;
};

/** Referencia a catálogo adminLocales (traducción en UI). */
export type AdminCatalogRef = { key: string; vars?: Record<string, string> };

export type PieSlice = {
  nameKey: string;
  nameVars?: Record<string, string>;
  value: number;
};

export const ADMIN_COUNTRY_UNSPECIFIED = '__ADMIN_COUNTRY_UNSPECIFIED__';

export type CountryRankRow = {
  rank: number;
  country: string;
  count: number;
};

export type StatisticsGrowthResult = {
  overview: {
    usersTotal: number;
    businessCardsTotal: number;
    smartCardsTotal: number;
    newUsersLast24h: number;
    newUsersTodayUtc: number;
    newUsersLast7d: number;
    newBusinessCardsLast7d: number;
    medalVotesLast30d: number;
  };
  segmentation: {
    languageByLabel: PieSlice[];
    topCountries: CountryRankRow[];
    usersScanned: number;
  };
  productNotes: AdminCatalogRef[];
  usersDaily: DailyPoint[];
  usersWeekly: WeeklyPoint[];
  businessCardsDaily: DailyPoint[];
  businessCardsWeekly: WeeklyPoint[];
  errors: AdminCatalogRef[];
};

const DEFAULT_USER_LOOKBACK_DAYS = 120;
const CHART_DAILY_DAYS = 30;
const CHART_WEEKLY_WEEKS = 12;
const USER_SEG_PAGE_SIZE = 800;
const MEDAL_LOOKBACK_DAYS = 30;

function timestampToMillis(value: unknown): number | null {
  if (value == null) return null;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value &&
    typeof (value as { seconds: number }).seconds === 'number'
  ) {
    return (value as { seconds: number }).seconds * 1000;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function formatDayLabel(ymd: string, localeTag: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(localeTag, {
    day: 'numeric',
    month: 'short',
  });
}

function mondayUtcYmdFromMs(ms: number): string {
  const x = new Date(ms);
  const d = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
  const day = d.getUTCDay();
  const toMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - toMonday);
  return d.toISOString().slice(0, 10);
}

function currentMondayUtcDate(): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  const toMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - toMonday);
  return d;
}

function getLastNWeekMondayKeys(n: number): string[] {
  const mon = currentMondayUtcDate();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const w = new Date(mon);
    w.setUTCDate(w.getUTCDate() - i * 7);
    keys.push(w.toISOString().slice(0, 10));
  }
  return keys;
}

function bucketDailyCounts(
  timestampsMs: number[],
  numDays: number,
  localeTag: string,
): DailyPoint[] {
  const end = startOfUtcDay(new Date());
  const counts = new Map<string, number>();
  for (let i = 0; i < numDays; i++) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (numDays - 1 - i));
    const key = d.toISOString().slice(0, 10);
    counts.set(key, 0);
  }
  for (const ms of timestampsMs) {
    const d = new Date(ms);
    const key = d.toISOString().slice(0, 10);
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return Array.from(counts.entries()).map(([key, count]) => ({
    key,
    label: formatDayLabel(key, localeTag),
    count,
  }));
}

function bucketWeeklyCounts(
  timestampsMs: number[],
  weekStartKeys: string[],
  localeTag: string,
): WeeklyPoint[] {
  const counts = new Map<string, number>(weekStartKeys.map((k) => [k, 0]));
  for (const ms of timestampsMs) {
    const key = mondayUtcYmdFromMs(ms);
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return weekStartKeys.map((key) => ({
    key,
    label: new Date(`${key}T12:00:00.000Z`).toLocaleDateString(localeTag, {
      day: 'numeric',
      month: 'short',
    }),
    count: counts.get(key) || 0,
  }));
}

async function collectCreatedTimestamps(
  collectionName: 'users' | 'businessCards',
  since: Date,
): Promise<number[]> {
  const sinceTs = Timestamp.fromDate(since);
  const q = query(
    collection(db, collectionName),
    where('createdAt', '>=', sinceTs),
    orderBy('createdAt', 'asc'),
  );
  const snap = await getDocs(q);
  const out: number[] = [];
  snap.forEach((docSnap) => {
    const ms = timestampToMillis(docSnap.data().createdAt);
    if (ms != null) out.push(ms);
  });
  return out;
}

export async function getOverviewCounts(): Promise<{
  usersTotal: number;
  businessCardsTotal: number;
}> {
  const usersSnap = await getCountFromServer(collection(db, 'users'));
  let businessCardsTotal = 0;
  try {
    const bcSnap = await getCountFromServer(collection(db, 'businessCards'));
    businessCardsTotal = bcSnap.data().count;
  } catch {
    /* colección ausente o sin permiso */
  }
  return {
    usersTotal: usersSnap.data().count,
    businessCardsTotal,
  };
}

async function countSmartCardsTotal(): Promise<number> {
  const snap = await getCountFromServer(collectionGroup(db, 'cards'));
  return snap.data().count;
}

async function countMedalVotesSince(since: Date): Promise<number> {
  const q = query(collectionGroup(db, 'votes'), where('votedAt', '>=', Timestamp.fromDate(since)));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

type LangAggSpec = { mapKey: string; nameKey: string; nameVars?: Record<string, string> };

function languageAggSpec(raw: unknown): LangAggSpec {
  const s = String(raw ?? '').trim();
  if (!s) return { mapKey: 'admin_stats_lang_unknown', nameKey: 'admin_stats_lang_unknown' };
  const lower = s.toLowerCase();
  if (lower === 'es' || lower.startsWith('es-')) {
    return { mapKey: 'admin_stats_lang_spanish', nameKey: 'admin_stats_lang_spanish' };
  }
  if (lower === 'en' || lower.startsWith('en-')) {
    return { mapKey: 'admin_stats_lang_english', nameKey: 'admin_stats_lang_english' };
  }
  const label = s.length > 28 ? `${s.slice(0, 25)}…` : s;
  const mapKey = `admin_stats_lang_custom:${label}`;
  return { mapKey, nameKey: 'admin_stats_lang_custom', nameVars: { label } };
}

function normalizeCountryStored(raw: unknown): string {
  const s = String(raw ?? '').trim();
  return s || ADMIN_COUNTRY_UNSPECIFIED;
}

async function loadUserSegmentation(): Promise<{
  languageByLabel: PieSlice[];
  topCountries: CountryRankRow[];
  usersScanned: number;
}> {
  const languageCounts = new Map<string, { nameKey: string; nameVars?: Record<string, string>; value: number }>();
  const countryCounts = new Map<string, number>();
  let scanned = 0;
  let lastDoc: QueryDocumentSnapshot | undefined;

  const usersCol = collection(db, 'users');

  for (;;) {
    const q = lastDoc
      ? query(usersCol, orderBy(documentId()), startAfter(lastDoc), limit(USER_SEG_PAGE_SIZE))
      : query(usersCol, orderBy(documentId()), limit(USER_SEG_PAGE_SIZE));
    const snap = await getDocs(q);
    if (snap.empty) break;

    for (const d of snap.docs) {
      scanned++;
      const data = d.data();
      const spec = languageAggSpec(data.language ?? data.appLanguage ?? data.locale);
      const cur = languageCounts.get(spec.mapKey);
      if (cur) cur.value += 1;
      else {
        languageCounts.set(spec.mapKey, {
          nameKey: spec.nameKey,
          nameVars: spec.nameVars,
          value: 1,
        });
      }
      const c = normalizeCountryStored(data.country);
      countryCounts.set(c, (countryCounts.get(c) || 0) + 1);
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < USER_SEG_PAGE_SIZE) break;
  }

  const languageByLabel: PieSlice[] = Array.from(languageCounts.values())
    .sort((a, b) => b.value - a.value)
    .map(({ nameKey, nameVars, value }) =>
      nameVars ? { nameKey, nameVars, value } : { nameKey, value },
    );

  const topCountries: CountryRankRow[] = Array.from(countryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([country, count], i) => ({ country, count, rank: i + 1 }));

  return { languageByLabel, topCountries, usersScanned: scanned };
}

function countInRange(timestampsMs: number[], sinceMs: number): number {
  return timestampsMs.filter((ms) => ms >= sinceMs).length;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function getStatisticsGrowth(options?: {
  userLookbackDays?: number;
  chartDailyDays?: number;
  chartWeeklyWeeks?: number;
  /** BCP 47, p. ej. es-ES — ejes de fechas en gráficos. */
  chartLocaleTag?: string;
}): Promise<StatisticsGrowthResult> {
  const userLookbackDays = options?.userLookbackDays ?? DEFAULT_USER_LOOKBACK_DAYS;
  const chartDailyDays = options?.chartDailyDays ?? CHART_DAILY_DAYS;
  const chartWeeklyWeeks = options?.chartWeeklyWeeks ?? CHART_WEEKLY_WEEKS;
  const chartLocaleTag = options?.chartLocaleTag ?? 'es-ES';

  const errors: AdminCatalogRef[] = [];
  const productNotes: AdminCatalogRef[] = [{ key: 'admin_stats_note_bc_firestore_vs_mongo' }];

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - userLookbackDays);
  since.setUTCHours(0, 0, 0, 0);

  const medalSince = new Date();
  medalSince.setUTCDate(medalSince.getUTCDate() - MEDAL_LOOKBACK_DAYS);
  medalSince.setUTCHours(0, 0, 0, 0);

  let overview = { usersTotal: 0, businessCardsTotal: 0 };
  let userTs: number[] = [];
  let cardTs: number[] = [];
  let segmentation: StatisticsGrowthResult['segmentation'] = {
    languageByLabel: [],
    topCountries: [],
    usersScanned: 0,
  };
  let smartCardsTotal = 0;
  let medalVotesLast30d = 0;

  const overviewP = getOverviewCounts().catch((e) => {
    errors.push({ key: 'admin_stats_err_summary', vars: { message: errMessage(e) } });
    return { usersTotal: 0, businessCardsTotal: 0 };
  });
  const userTsP = collectCreatedTimestamps('users', since).catch((e) => {
    errors.push({ key: 'admin_stats_err_users_series', vars: { message: errMessage(e) } });
    return [] as number[];
  });
  const cardTsP = collectCreatedTimestamps('businessCards', since).catch((e) => {
    errors.push({
      key: 'admin_stats_err_bc_firestore',
      vars: { message: errMessage(e) },
    });
    return [] as number[];
  });
  const segmentationP = loadUserSegmentation().catch((e) => {
    errors.push({ key: 'admin_stats_err_segmentation', vars: { message: errMessage(e) } });
    return { languageByLabel: [] as PieSlice[], topCountries: [] as CountryRankRow[], usersScanned: 0 };
  });
  const smartP = countSmartCardsTotal().catch((e) => {
    errors.push({ key: 'admin_stats_err_smart_cards', vars: { message: errMessage(e) } });
    return 0;
  });
  const medalP = countMedalVotesSince(medalSince).catch((e) => {
    errors.push({ key: 'admin_stats_err_medal_votes', vars: { message: errMessage(e) } });
    return 0;
  });

  [overview, userTs, cardTs, segmentation, smartCardsTotal, medalVotesLast30d] = await Promise.all([
    overviewP,
    userTsP,
    cardTsP,
    segmentationP,
    smartP,
    medalP,
  ]);

  const weekKeys = getLastNWeekMondayKeys(chartWeeklyWeeks);
  const now = Date.now();
  const dayMs = 86400000;
  const startTodayMs = startOfUtcDay(new Date()).getTime();

  const newUsersLast24h = countInRange(userTs, now - dayMs);
  const newUsersTodayUtc = countInRange(userTs, startTodayMs);
  const newUsersLast7d = countInRange(userTs, now - 7 * dayMs);
  const newBusinessCardsLast7d = countInRange(cardTs, now - 7 * dayMs);

  return {
    overview: {
      ...overview,
      smartCardsTotal,
      newUsersLast24h,
      newUsersTodayUtc,
      newUsersLast7d,
      newBusinessCardsLast7d,
      medalVotesLast30d,
    },
    segmentation,
    productNotes,
    usersDaily: bucketDailyCounts(userTs, chartDailyDays, chartLocaleTag),
    usersWeekly: bucketWeeklyCounts(userTs, weekKeys, chartLocaleTag),
    businessCardsDaily: bucketDailyCounts(cardTs, chartDailyDays, chartLocaleTag),
    businessCardsWeekly: bucketWeeklyCounts(cardTs, weekKeys, chartLocaleTag),
    errors,
  };
}
