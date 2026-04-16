/**
 * Deep search — Fase 0 (inventario) + Fase 1 (utilidades compartidas)
 *
 * FASE 0 — Estado previo en pantallas (antes de cablear este módulo):
 *
 * 1) app/(tabs)/vault.tsx
 *    - Estado: `searchQuery` (TextInput "Buscar en el Búnker...").
 *    - Filtrado: `filteredLinks` solo compara `title` y `type` del ítem.
 *    - NO entra al núcleo: el campo `value` (URL, teléfono, texto, ruta doc, etc.) no se busca.
 *    - Tipo UI local `Link`: { id, title, type, value, iconName, icon?, ... }.
 *
 * 2) app/(tabs)/cards.tsx
 *    - Estado: `cardSearchQuery`.
 *    - Filtrado: nombre de tarjeta + ítems del vault enlazados por `itemIds`:
 *      compara `title`, `value`, `iconName` de cada VaultItem.
 *    - NO incluye explícitamente el string `type` del ítem (p. ej. "Enlaces"); suele estar cubierto
 *      indirectamente si aparece en value/title.
 *    - Tipo `VaultItem` alineado con bóveda (title, type, value, iconName, ...).
 *
 * 3) app/(tabs)/contacts.tsx
 *    - API devuelve `cardId` + `searchFacets` (facetas sin tipo teléfono, generadas al guardar la tarjeta).
 *    - `receivedContactMatchesDeepSearch` unifica uid, cardId, nombres, grupo, icons y facetas.
 *
 * Tipos de dato en formulario (NewInfoForm): 'Enlaces' | 'Teléfono' | 'Email' | 'Texto Plain' | 'Documento'.
 * En vault también existen claves legacy en badges: teléfono/telefono, enlaces, texto plain, etc.
 *
 * FASE 1 — Normalización, subcadena literal, strings buscables, discriminador de teléfono (contactos).
 *
 * FASE 2 — Dos fases en listas: (1) subcadena literal exacta; (2) tolerancia a espacios compactos +
 * Fuse.js (búsqueda aproximada tipo distancia de edición / Bitap). La regla de teléfono aplica a
 * ambas fases: en contactos solo entran strings de `getContactSearchableStringsFromVaultLikeItem`.
 */

import { isGhostLinkVaultType } from '@/constants/ghostLinkVault';
import Fuse, { type IFuseOptions } from 'fuse.js';

export type VaultLikeItem = {
  id?: string;
  title?: string;
  type?: string;
  value?: string;
  iconName?: string;
  icon?: string;
};

/** Quita marcas diacríticas para que "teléfono" y "telefono" alineen con la query. */
export function stripDiacritics(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Query normalizada para comparar (trim + minúsculas + sin diacríticos). */
export function normalizeSearchQuery(raw: string): string {
  return stripDiacritics(String(raw || '').trim()).toLowerCase();
}

/** Misma normalización para un campo índice (valor, título, etc.). */
export function normalizeSearchHaystack(raw: string): string {
  return stripDiacritics(String(raw || '').trim()).toLowerCase();
}

/** `type` de ítem normalizado para reglas (teléfono, etc.). */
export function normalizeVaultItemTypeKey(type: string | null | undefined): string {
  return normalizeSearchHaystack(String(type || ''));
}

/**
 * Coincidencia estricta: la query normalizada debe aparecer como subcadena en el texto
 * (tras normalizar el texto objetivo).
 */
export function searchQueryMatchesText(queryNormalized: string, text: string): boolean {
  if (!queryNormalized) {
    return true;
  }
  const haystack = normalizeSearchHaystack(text);
  return haystack.includes(queryNormalized);
}

export function searchQueryMatchesAny(
  queryNormalized: string,
  strings: Array<string | null | undefined>
): boolean {
  if (!queryNormalized) {
    return true;
  }
  for (const s of strings) {
    if (s == null) {
      continue;
    }
    const t = String(s);
    if (!t.trim()) {
      continue;
    }
    if (searchQueryMatchesText(queryNormalized, t)) {
      return true;
    }
  }
  return false;
}

/**
 * Todos los campos "núcleo" del ítem de bóveda / tarjeta que deben participar en deep search
 * (Vault y Mis tarjetas: todos; Mis contactos: filtrar antes con isPhoneTypeExcludedFromContactSearch).
 */
export function getSearchableStringsFromVaultLikeItem(item: VaultLikeItem): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const t = String(v ?? '').trim();
    if (t) {
      out.push(t);
    }
  };
  push(item.id);
  push(item.title);
  push(item.type);
  if (!isGhostLinkVaultType(item.type)) {
    push(item.value);
  }
  push(item.iconName);
  push(item.icon);
  return out;
}

const MIN_FUZZY_QUERY_LEN = 2;
/** Fuse: 0 = mejor; descartamos coincidencias demasiado débiles. */
const MAX_FUZZY_SCORE = 0.48;

type FuzzyBlobDoc = {
  blob: string;
  blobCompact: string;
};

const FUSE_DEEP_SEARCH_OPTIONS: IFuseOptions<FuzzyBlobDoc> = {
  keys: [
    { name: 'blobCompact', weight: 0.55 },
    { name: 'blob', weight: 0.45 },
  ],
  threshold: 0.42,
  ignoreLocation: true,
  includeScore: true,
  minMatchCharLength: 2,
  distance: 140,
};

/** Query ya normalizada, sin espacios (ciudadmaderas ↔ ciudad maderas). */
export function compactNormalizedQuery(queryNormalized: string): string {
  return queryNormalized.replace(/\s+/g, '');
}

/** Texto fusionado para Fuse: blob con espacios + versión compacta. */
export function buildSearchBlobs(strings: string[]): FuzzyBlobDoc {
  const normalized = strings
    .map((s) => normalizeSearchHaystack(String(s || '')))
    .filter(Boolean);
  const blob = normalized.join(' ').trim();
  const blobCompact = normalized.join('').replace(/\s/g, '');
  return { blob, blobCompact };
}

function fuzzyExtensionMatchesStrings(strings: string[], qNormalized: string): boolean {
  if (qNormalized.length < MIN_FUZZY_QUERY_LEN) {
    return false;
  }
  const { blob, blobCompact } = buildSearchBlobs(strings);
  if (!blob && !blobCompact) {
    return false;
  }
  const qc = compactNormalizedQuery(qNormalized);
  if (qc.length >= 2 && blobCompact.includes(qc)) {
    return true;
  }
  const fuse = new Fuse([{ blob, blobCompact }], FUSE_DEEP_SEARCH_OPTIONS);
  const hits = fuse.search(qNormalized);
  if (!hits.length) {
    return false;
  }
  return (hits[0].score ?? 1) <= MAX_FUZZY_SCORE;
}

/**
 * Misma lógica que bóveda/tarjetas: subcadena normalizada + Fuse (espacios + typos).
 * `queryRaw` puede incluir sinónimos concatenados (p. ej. nails + uñas).
 */
export function haystackMatchesDeepSearchQuery(searchableStrings: string[], queryRaw: string): boolean {
  const q = normalizeSearchQuery(queryRaw);
  if (!q) {
    return true;
  }
  if (searchQueryMatchesAny(q, searchableStrings)) {
    return true;
  }
  return fuzzyExtensionMatchesStrings(searchableStrings, q);
}

/**
 * Orden: primero coincidencias por subcadena literal (normalizada);
 * luego por subcadena en texto compacto (sin espacios);
 * luego Fuse ordenado por score (más relevante primero).
 */
export function orderByDeepSearchTwoPhase<T>(
  items: ReadonlyArray<T>,
  queryRaw: string,
  collectSearchStrings: (item: T) => string[],
): T[] {
  const q = normalizeSearchQuery(queryRaw);
  if (!q) {
    return [...items];
  }

  type ExactBucket = { item: T; origIdx: number };
  type CompactBucket = { item: T; origIdx: number };
  type FuseBucket = { item: T; origIdx: number; blob: string; blobCompact: string };

  const exact: ExactBucket[] = [];
  const fuzzyCompact: CompactBucket[] = [];
  const fuzzyPending: FuseBucket[] = [];

  items.forEach((item, origIdx) => {
    const strings = collectSearchStrings(item);
    if (searchQueryMatchesAny(q, strings)) {
      exact.push({ item, origIdx });
      return;
    }
    if (q.length < MIN_FUZZY_QUERY_LEN) {
      return;
    }
    const { blob, blobCompact } = buildSearchBlobs(strings);
    if (!blob && !blobCompact) {
      return;
    }
    const qc = compactNormalizedQuery(q);
    if (qc.length >= 2 && blobCompact.includes(qc)) {
      fuzzyCompact.push({ item, origIdx });
      return;
    }
    fuzzyPending.push({ item, origIdx, blob, blobCompact });
  });

  const byOrig = (a: { origIdx: number }, b: { origIdx: number }) => a.origIdx - b.origIdx;
  exact.sort(byOrig);
  fuzzyCompact.sort(byOrig);

  type FuseRow = FuzzyBlobDoc & { item: T; origIdx: number };
  const fuseDocs: FuseRow[] = fuzzyPending.map((p) => ({
    blob: p.blob,
    blobCompact: p.blobCompact,
    item: p.item,
    origIdx: p.origIdx,
  }));

  const fuseRanked: Array<{ item: T; origIdx: number; score: number }> = [];
  if (fuseDocs.length) {
    const fuse = new Fuse(fuseDocs, FUSE_DEEP_SEARCH_OPTIONS);
    for (const h of fuse.search(q)) {
      const row = h.item as FuseRow;
      const score = h.score ?? 1;
      if (score > MAX_FUZZY_SCORE) {
        continue;
      }
      fuseRanked.push({ item: row.item, origIdx: row.origIdx, score });
    }
    fuseRanked.sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
      return a.origIdx - b.origIdx;
    });
  }

  return [
    ...exact.map((x) => x.item),
    ...fuzzyCompact.map((x) => x.item),
    ...fuseRanked.map((x) => x.item),
  ];
}

/**
 * Búsqueda con query ya expandida (p. ej. sinónimos ES/EN vía buildExpandedMarketQuery).
 * Si hay varios tokens, un ítem coincide si CUALQUIER token pasa la misma tubería que
 * orderByDeepSearchTwoPhase (literal → compacto → Fuse), así "hair" puede acertar en "peluquería".
 * Un solo token delega en orderByDeepSearchTwoPhase sin overhead.
 */
export function orderByDeepSearchWithExpandedQuery<T>(
  items: ReadonlyArray<T>,
  expandedQueryRaw: string,
  collectSearchStrings: (item: T) => string[],
): T[] {
  const normalized = normalizeSearchQuery(expandedQueryRaw);
  if (!normalized) {
    return [...items];
  }
  const tokens = [...new Set(normalized.split(/\s+/).filter(Boolean))];
  if (tokens.length <= 1) {
    return orderByDeepSearchTwoPhase(items, expandedQueryRaw, collectSearchStrings);
  }

  const R_NONE = 3;
  const R_EXACT = 0;
  const R_COMPACT = 1;
  const R_FUSE = 2;

  type Hit = { item: T; origIdx: number; rank: number; fuseScore: number };
  const hits: Hit[] = [];

  items.forEach((item, origIdx) => {
    const strings = collectSearchStrings(item);
    let rank = R_NONE;
    let fuseScore = 1;

    const { blob, blobCompact } = buildSearchBlobs(strings);
    let fuse: Fuse<FuzzyBlobDoc> | null = null;

    for (const token of tokens) {
      if (!token) {
        continue;
      }

      if (searchQueryMatchesAny(token, strings)) {
        rank = R_EXACT;
        break;
      }

      if (token.length < MIN_FUZZY_QUERY_LEN) {
        continue;
      }

      if (!blob && !blobCompact) {
        continue;
      }

      const qc = compactNormalizedQuery(token);
      if (qc.length >= 2 && blobCompact.includes(qc)) {
        if (rank > R_COMPACT) {
          rank = R_COMPACT;
        }
        continue;
      }

      if (!fuse) {
        fuse = new Fuse([{ blob, blobCompact }], FUSE_DEEP_SEARCH_OPTIONS);
      }
      const fh = fuse.search(token);
      if (fh.length && (fh[0].score ?? 1) <= MAX_FUZZY_SCORE) {
        const s = fh[0].score ?? 1;
        if (rank > R_FUSE) {
          rank = R_FUSE;
          fuseScore = s;
        } else if (rank === R_FUSE && s < fuseScore) {
          fuseScore = s;
        }
      }
    }

    if (rank < R_NONE) {
      hits.push({ item, origIdx, rank, fuseScore });
    }
  });

  hits.sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    if (a.rank === R_FUSE && b.rank === R_FUSE && a.fuseScore !== b.fuseScore) {
      return a.fuseScore - b.fuseScore;
    }
    return a.origIdx - b.origIdx;
  });

  return hits.map((h) => h.item);
}

/**
 * Tipos que cuentan como "teléfono" para la regla de oro en Mis contactos:
 * no se indexa el contenido (ni aunque el número coincida).
 * Cubre DataType 'Teléfono' y variantes legacy/minúsculas/sin acentos.
 */
const PHONE_TYPE_KEYS_NORMALIZED = new Set([
  'telefono',
  'telephone',
  'phone',
  'movil',
  'mobile',
  'cell',
  'celular',
]);

export function isPhoneTypeExcludedFromContactSearch(type: string | null | undefined): boolean {
  const key = normalizeVaultItemTypeKey(type);
  if (!key) {
    return false;
  }
  if (PHONE_TYPE_KEYS_NORMALIZED.has(key)) {
    return true;
  }
  // "teléfono móvil" u otras variantes compuestas
  if (key.includes('telefono') || key.includes('telephone')) {
    return true;
  }
  return false;
}

/** Strings buscables para un contacto: vacío si el ítem es tipo teléfono (privacidad). */
export function getContactSearchableStringsFromVaultLikeItem(item: VaultLikeItem): string[] {
  if (isPhoneTypeExcludedFromContactSearch(item.type)) {
    return [];
  }
  return getSearchableStringsFromVaultLikeItem(item);
}

export function contactVaultLikeItemMatchesDeepQuery(item: VaultLikeItem, queryRaw: string): boolean {
  const q = normalizeSearchQuery(queryRaw);
  if (!q) {
    return true;
  }
  const strings = getContactSearchableStringsFromVaultLikeItem(item);
  if (searchQueryMatchesAny(q, strings)) {
    return true;
  }
  return fuzzyExtensionMatchesStrings(strings, q);
}

export function vaultLikeItemMatchesDeepQuery(item: VaultLikeItem, queryRaw: string): boolean {
  const q = normalizeSearchQuery(queryRaw);
  if (!q) {
    return true;
  }
  const strings = getSearchableStringsFromVaultLikeItem(item);
  if (searchQueryMatchesAny(q, strings)) {
    return true;
  }
  return fuzzyExtensionMatchesStrings(strings, q);
}

export type SmartCardLike = {
  scName: string;
  itemIds: string[];
};

export function collectStringsSmartCard(
  card: SmartCardLike,
  vaultItems: VaultLikeItem[],
  contactMode: boolean,
): string[] {
  const out: string[] = [];
  const name = String(card.scName || '').trim();
  if (name) {
    out.push(name);
  }
  const idSet = new Set(card.itemIds.map((id) => String(id || '').trim()).filter(Boolean));
  for (const vi of vaultItems) {
    const id = String(vi.id || '').trim();
    if (!id || !idSet.has(id)) {
      continue;
    }
    const part = contactMode
      ? getContactSearchableStringsFromVaultLikeItem(vi)
      : getSearchableStringsFromVaultLikeItem(vi);
    out.push(...part);
  }
  return out;
}

/**
 * Mis tarjetas: nombre + contenido profundo de cada VaultItem enlazado por id.
 */
export function smartCardMatchesDeepSearch(
  card: SmartCardLike,
  vaultItems: VaultLikeItem[],
  queryRaw: string
): boolean {
  const q = normalizeSearchQuery(queryRaw);
  if (!q) {
    return true;
  }
  const strings = collectStringsSmartCard(card, vaultItems, false);
  if (searchQueryMatchesAny(q, strings)) {
    return true;
  }
  return fuzzyExtensionMatchesStrings(strings, q);
}

/** Facetas persistidas en smart_cards para búsqueda del receptor (sin filas tipo teléfono). */
export type CardSearchFacet = {
  type: string;
  label: string;
  value: string;
};

export function buildSearchFacetsForSharedCard(vaultItems: VaultLikeItem[], itemIds: string[]): CardSearchFacet[] {
  const idSet = new Set(itemIds.map((id) => String(id || '').trim()).filter(Boolean));
  const out: CardSearchFacet[] = [];
  for (const it of vaultItems) {
    const id = String(it.id || '').trim();
    if (!id || !idSet.has(id)) {
      continue;
    }
    if (isPhoneTypeExcludedFromContactSearch(it.type)) {
      continue;
    }
    out.push({
      type: String(it.type || ''),
      label: String(it.title || ''),
      value: isGhostLinkVaultType(it.type) ? '' : String(it.value || ''),
    });
  }
  return out;
}

/**
 * Extrae cargo / título desde facetas de tarjeta (sync con ownerOccupation persistido al guardar).
 */
export function deriveOwnerOccupationFromFacets(facets: CardSearchFacet[]): string {
  for (const f of facets || []) {
    const type = String(f.type || '').trim().toLowerCase();
    const label = String(f.label || '').trim().toLowerCase();
    if (
      /title|role|job|occupation|position|cargo|puesto|rol/.test(type) ||
      /t[ií]tulo|cargo|puesto|rol|position| ocupaci|ceo|founder|director/.test(label)
    ) {
      const v = String(f.value || '').trim().slice(0, 240);
      if (v) {
        return v;
      }
    }
  }
  return '';
}

export type ReceivedContactSearchRow = {
  uid: string;
  cardId?: string | null;
  userFullName: string;
  userNickName: string;
  cardName: string;
  ownerOccupation?: string | null;
  searchFacets?: CardSearchFacet[] | null;
};

export function collectStringsReceivedContact(
  contact: ReceivedContactSearchRow,
  metaGroup: string,
  iconRows: Array<{ name: string; url: string }> | undefined,
): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const t = String(v ?? '').trim();
    if (t) {
      out.push(t);
    }
  };
  push(contact.uid);
  if (contact.cardId) {
    push(String(contact.cardId));
  }
  push(contact.userFullName);
  push(contact.userNickName);
  push(contact.cardName);
  push(contact.ownerOccupation);
  push(metaGroup);
  if (iconRows?.length) {
    for (const ic of iconRows) {
      push(ic.name);
      push(ic.url);
    }
  }
  for (const f of contact.searchFacets || []) {
    out.push(
      ...getContactSearchableStringsFromVaultLikeItem({
        type: f.type,
        title: f.label,
        value: f.value,
      }),
    );
  }
  return out;
}

/**
 * Mis contactos: metadatos de fila + facetas (enlace/texto/etc.); teléfono estructurado nunca está en facetas.
 */
export function receivedContactMatchesDeepSearch(
  contact: ReceivedContactSearchRow,
  metaGroup: string,
  iconRows: Array<{ name: string; url: string }> | undefined,
  queryRaw: string
): boolean {
  const q = normalizeSearchQuery(queryRaw);
  if (!q) {
    return true;
  }
  const strings = collectStringsReceivedContact(contact, metaGroup, iconRows);
  if (searchQueryMatchesAny(q, strings)) {
    return true;
  }
  return fuzzyExtensionMatchesStrings(strings, q);
}
