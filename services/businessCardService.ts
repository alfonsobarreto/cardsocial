/**
 * Business Card Service
 * Maneja creación, búsqueda y gestión de tarjetas de negocio
 */

import { normalizeMaterialIconName } from '@/app/components/iconNameValidation';
import { activateOrRenewBusinessLicense } from '@/services/businessLicenseService';
import { db } from '@/services/firebaseConfig';
import { newEntityId } from '@/services/newEntityId';
import { inferMciIconFromContext } from '@/services/searchFacetIcons';
import {
    collection,
    deleteDoc,
    deleteField,
    doc,
    getDoc,
    getDocs,
    increment,
    query,
    setDoc,
    Timestamp,
    updateDoc,
    where,
} from 'firebase/firestore';

const TRIAL_DAYS = 14;

/** Igual que Smart Cards (12 slots): máx. ítems de Bóveda por tarjeta de negocio. */
export const MAX_BUSINESS_VAULT_DATA_SLOTS = 12;

/**
 * Lee identidad de tarjeta business desde Firestore.
 */
export function readBusinessCardIdentityFields(data: Record<string, unknown>): {
  bcName: string;
  bcContactName: string;
  bcLogoUrl: string;
} {
  return {
    bcName: String(data.bcName ?? '').trim(),
    bcContactName: String(data.bcContactName ?? '').trim(),
    bcLogoUrl: String(data.bcLogoUrl ?? '').trim(),
  };
}

/**
 * Resuelve vault link IDs del owner → facetas denormalizadas para el Social Market.
 * Se guarda como `marketFacets` en el doc de businessCards para que cualquier
 * usuario autenticado pueda ver los iconos sin acceder al vault ajeno.
 */
async function resolveMarketFacets(
  uid: string,
  linkIds: string[],
): Promise<Array<{ type: string; label: string; value: string; iconName?: string }>> {
  const unique = [...new Set(linkIds.filter(Boolean))].slice(0, MAX_BUSINESS_VAULT_DATA_SLOTS);
  if (!unique.length) return [];

  // Per-link timeout (4 s) so a single slow doc never blocks the others.
  // All fetches run in parallel; results that time out are simply skipped.
  // No global race-condition timeout — Promise.all with per-item caps is sufficient
  // and avoids storing partially-resolved facets.
  const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
    Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

  const results = await Promise.all(
    unique.map(async (linkId) => {
      try {
        const snap = await withTimeout(getDoc(doc(db, 'users', uid, 'links', linkId)), 4000);
        if (snap && snap.exists()) {
          const row = snap.data() as Record<string, unknown>;
          const type = String(row.type ?? '').trim();
          const label = String(row.title ?? row.label ?? type).trim();
          const value = String(row.value ?? '').trim();
          // Priority: iconName field → icon field (if non-HTTP = material icon name)
          // Validate against MCI glyphMap so only real icon names are stored.
          const iconNameRaw = row.iconName != null ? String(row.iconName).trim() : '';
          const iconFieldRaw = row.icon != null ? String(row.icon).trim() : '';
          const rawCandidate = iconNameRaw
            || (!iconFieldRaw.startsWith('http') && iconFieldRaw ? iconFieldRaw : '');
          // Validate explicit iconName first; if absent (e.g. item uses HTTP custom icon),
          // infer a good MCI name from label + URL so the Social Market always has an icon.
          const explicitIcon = rawCandidate ? normalizeMaterialIconName(rawCandidate, '') : '';
          const iconName = explicitIcon || normalizeMaterialIconName(
            inferMciIconFromContext(type || 'otro', label || '', value), '');
          if (value) {
            return { type: type || 'otro', label: label || type || 'Dato', value, ...(iconName ? { iconName } : {}) } as { type: string; label: string; value: string; iconName?: string };
          }
        }
      } catch { /* skip unreadable */ }
      return null;
    }),
  );

  return results.filter((r): r is { type: string; label: string; value: string; iconName?: string } => r !== null);
}

export interface BusinessCardCreateInput {
  uid: string;
  /** IDs en users/{uid}/links — datos públicos salen de la Bóveda */
  vaultLinkIds?: string[];
  bcName: string;
  bcContactName: string;
  /** Texto opcional de referencia (no sustituye coordenadas GPS) */
  physicalAddress?: string;
  latitude: number;
  longitude: number;
  /** Origen de las coordenadas (p. ej. device_gps | geocode_forward). */
  locationSource?: string;
  keywords: string[];
  bcLogoUrl?: string;
  kycDocumentUrl?: string;
  kycTermsAccepted: boolean;
  businessTermsAccepted: boolean;
  /** Tema visual (misma paleta que Smart Cards). */
  themeId?: string;
}

/**
 * Crear tarjeta de negocio (email/tel/enlaces permanentes vienen de la Bóveda, no del formulario).
 */
export async function createBusinessCard(
  data: BusinessCardCreateInput
): Promise<{
  success: boolean;
  bId?: string;
  message: string;
  licenseWarning?: boolean;
}> {
  try {
    const bId = newEntityId();

    const businessCardRef = doc(db, 'businessCards', bId);

    const searchWords = (data.keywords || []).slice(0, 20);

    const now = new Date();
    const trialEnds = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const businessCardData = {
      bId,
      uid: data.uid,
      ...(Array.isArray(data.vaultLinkIds) && data.vaultLinkIds.length > 0
        ? {
            vaultLinkIds: data.vaultLinkIds
              .slice(0, MAX_BUSINESS_VAULT_DATA_SLOTS)
              .map((id) => String(id)),
          }
        : {}),
      type: 'business',
      bcName: data.bcName,
      bcContactName: data.bcContactName,
      physicalAddress: (data.physicalAddress || '').trim(),
      keywords: searchWords,
      elevatorPitchWords: searchWords,
      bcLogoUrl: data.bcLogoUrl || '',
      latitude: data.latitude,
      longitude: data.longitude,
      locationSource: data.locationSource || 'device_gps',
      city: '',
      postalCode: '',
      kycDocumentUrl: data.kycDocumentUrl || '',
      kycVerified: false,
      kycApprovedAt: null,
      kycTermsAccepted: data.kycTermsAccepted,
      businessTermsAccepted: data.businessTermsAccepted,
      subscriptionStatus: 'trial',
      trialEndsAt: Timestamp.fromDate(trialEnds),
      subscriptionExpiresAt: null,
      lastQrUpdate: null,
      averageRating: 5,
      totalRatings: 0,
      negativeRatingsCount: 0,
      isActive: true,
      isPublishedToMarket: false,
      createdAt: now,
      lastUpdated: now,
      publishedAt: null,
      viewCount: 0,
      searchRankScore: 0,
      /** Personas que guardaron la tarjeta (p. ej. desde QR); se puede actualizar con backend más adelante. */
      holdersCount: 0,
      themeId: String(data.themeId || 'deep_teal').trim() || 'deep_teal',
      isFavorite: false,
      marketFacets: [] as Array<{ type: string; label: string; value: string; iconName?: string }>,
    };

    // Resolve vault links → marketFacets BEFORE persisting so the document is
    // consistent from the start. resolveMarketFacets is capped at 3.5 s total.
    if (Array.isArray(data.vaultLinkIds) && data.vaultLinkIds.length > 0) {
      businessCardData.marketFacets = await resolveMarketFacets(data.uid, data.vaultLinkIds);
    }

    await setDoc(businessCardRef, businessCardData);

    // Create the trial license in business_card_licenses so the card passes
    // isBusinessCardMarketEligible and appears in Social Market search.
    try {
      await activateOrRenewBusinessLicense({
        uid: data.uid,
        bId,
        annualPriceUsd: 0,
        cashbackCreditsGranted: 0,
      });
    } catch (licErr) {
      console.warn('[createBusinessCard] trial license write failed:', licErr);
      return {
        success: true,
        bId,
        licenseWarning: true,
        message:
          'Tarjeta creada, pero la licencia de prueba no pudo activarse automáticamente. Activála desde la pantalla de tu tarjeta.',
      };
    }

    return {
      success: true,
      bId,
      message: 'Tarjeta de negocio creada. Periodo de prueba de 14 días iniciado.',
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creando tarjeta: ${error.message}`,
    };
  }
}

export type BusinessCardListRow = {
  bId: string;
  bcName: string;
  createdAtMs: number;
  themeId: string;
  bcContactName: string;
  bcLogoUrl: string;
  /** IDs en Bóveda (users/{uid}/links), mismo orden que en la tarjeta. */
  vaultLinkIds: string[];
  isFavorite: boolean;
  holdersCount: number;
  totalRatings: number;
  ratingAvg: number;
  silenced?: boolean;
};

function isRenderableImageUriString(value: string | null | undefined): boolean {
  const u = String(value || '').trim();
  if (!u) return false;
  if (/^https?:\/\//i.test(u)) return true;
  if (u.startsWith('file://')) return true;
  if (u.startsWith('data:image/')) return true;
  return false;
}

/**
 * Firestore puede ir vacío en `bcLogoUrl` mientras el espejo en Mongo (`smart_cards` con
 * `cardType: 'business'`) ya tiene `ownerPhotoUrl` (p. ej. logo vía vault-proxy). Misma prioridad
 * que el detalle / web: URL usable en Firestore primero, si no la de Mongo.
 */
export function mergeBusinessCardRowsWithMongoOwnerPhoto(
  rows: BusinessCardListRow[],
  mongoCards: Array<{ bId?: string | null; cardType?: string; ownerPhotoUrl?: string | null }>,
): BusinessCardListRow[] {
  const photoById = new Map<string, string>();
  for (const c of mongoCards) {
    if (String(c.cardType || '') !== 'business') continue;
    const u = String(c.ownerPhotoUrl || '').trim();
    if (isRenderableImageUriString(u)) {
      const key = String(c.bId || '').trim();
      if (key) photoById.set(key, u);
    }
  }
  if (photoById.size === 0) return rows;
  return rows.map((r) => {
    if (isRenderableImageUriString(r.bcLogoUrl)) return r;
    const fallback = photoById.get(r.bId);
    return fallback ? { ...r, bcLogoUrl: fallback } : r;
  });
}

/** Tarjetas de negocio del usuario (colección `businessCards`, distinta de Smart Cards). */
export async function listBusinessCardsByOwner(uid: string): Promise<BusinessCardListRow[]> {
  const q = query(collection(db, 'businessCards'), where('uid', '==', uid));
  const snap = await getDocs(q);
  const rows: BusinessCardListRow[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown> & {
      themeId?: string;
      vaultLinkIds?: unknown;
      isFavorite?: boolean;
      holdersCount?: number;
      totalRatings?: number;
      averageRating?: number;
      createdAt?: Timestamp | Date | { toMillis?: () => number; seconds?: number };
    };
    const idn = readBusinessCardIdentityFields(data);
    let createdAtMs = 0;
    const ca = data.createdAt as Timestamp | undefined;
    if (ca && typeof (ca as Timestamp).toMillis === 'function') {
      createdAtMs = (ca as Timestamp).toMillis();
    } else if (data.createdAt instanceof Date) {
      createdAtMs = data.createdAt.getTime();
    }
    const rawVault = Array.isArray(data.vaultLinkIds) ? data.vaultLinkIds : [];
    const vaultLinkIds = rawVault
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .slice(0, MAX_BUSINESS_VAULT_DATA_SLOTS);
    return {
      bId: d.id,
      bcName: idn.bcName || d.id,
      bcContactName: idn.bcContactName,
      bcLogoUrl: idn.bcLogoUrl,
      vaultLinkIds,
      createdAtMs,
      themeId: String(data.themeId ?? 'deep_teal').trim() || 'deep_teal',
      isFavorite: Boolean(data.isFavorite),
      holdersCount: Number(data.holdersCount ?? 0),
      totalRatings: Number(data.totalRatings ?? 0),
      ratingAvg: Number(data.averageRating ?? 5),
    };
  });
  rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return rows;
}

export async function deleteBusinessCard(
  uid: string,
  bId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const cardRef = doc(db, 'businessCards', bId);
    const snap = await getDoc(cardRef);
    if (!snap.exists()) {
      return { success: false, message: 'Tarjeta no encontrada.' };
    }
    const row = snap.data() as { uid?: string };
    if (String(row.uid) !== uid) {
      return { success: false, message: 'No autorizado.' };
    }
    await deleteDoc(cardRef);
    return { success: true, message: 'OK' };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error' };
  }
}

export async function setBusinessCardFavorite(
  uid: string,
  bId: string,
  isFavorite: boolean,
): Promise<{ success: boolean; message: string }> {
  try {
    const cardRef = doc(db, 'businessCards', bId);
    const snap = await getDoc(cardRef);
    if (!snap.exists()) {
      return { success: false, message: 'Tarjeta no encontrada.' };
    }
    const row = snap.data() as { uid?: string };
    if (String(row.uid) !== uid) {
      return { success: false, message: 'No autorizado.' };
    }
    await updateDoc(cardRef, { isFavorite, lastUpdated: new Date() });
    return { success: true, message: 'OK' };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error' };
  }
}

export type BusinessCardUpdatePayload = {
  bcName?: string;
  bcContactName?: string;
  vaultLinkIds?: string[];
  themeId?: string;
  keywords?: string[];
  bcLogoUrl?: string;
  physicalAddress?: string;
  latitude?: number;
  longitude?: number;
  locationSource?: string;
};

export async function updateBusinessCard(
  uid: string,
  bId: string,
  data: BusinessCardUpdatePayload,
): Promise<{ success: boolean; message: string }> {
  try {
    const cardRef = doc(db, 'businessCards', bId);
    const snap = await getDoc(cardRef);
    if (!snap.exists()) {
      return { success: false, message: 'Tarjeta no encontrada.' };
    }
    const row = snap.data() as { uid?: string };
    if (String(row.uid) !== uid) {
      return { success: false, message: 'No autorizado.' };
    }
    const payload: Record<string, unknown> = { lastUpdated: new Date() };
    if (data.bcName !== undefined) payload.bcName = data.bcName;
    if (data.bcContactName !== undefined) payload.bcContactName = data.bcContactName;
    if (data.vaultLinkIds !== undefined) {
      const sanitized = data.vaultLinkIds
        .slice(0, MAX_BUSINESS_VAULT_DATA_SLOTS)
        .map((id) => String(id));
      payload.vaultLinkIds = sanitized;

      // Links changed → resolve facets NOW, before updateDoc, so the document
      // is always consistent. resolveMarketFacets is capped at 3.5 s total.
      payload.marketFacets = sanitized.length > 0
        ? await resolveMarketFacets(uid, sanitized)
        : [];
    }
    // If vaultLinkIds is NOT in the payload the user didn't change the links,
    // so we leave marketFacets untouched (no key in payload = Firestore keeps it).

    if (data.themeId !== undefined) {
      payload.themeId = String(data.themeId).trim() || 'deep_teal';
    }
    if (data.keywords !== undefined) {
      const searchWords = data.keywords.slice(0, 20);
      payload.keywords = searchWords;
      payload.elevatorPitchWords = searchWords;
    }
    if (data.bcLogoUrl !== undefined) payload.bcLogoUrl = data.bcLogoUrl;
    if (data.bcName !== undefined || data.bcContactName !== undefined || data.bcLogoUrl !== undefined) {
      payload.businessName = deleteField();
      payload.ownerName = deleteField();
      payload.businessLogo = deleteField();
    }
    if (data.physicalAddress !== undefined) payload.physicalAddress = data.physicalAddress;
    if (data.latitude !== undefined) payload.latitude = data.latitude;
    if (data.longitude !== undefined) payload.longitude = data.longitude;
    if (data.locationSource !== undefined) payload.locationSource = data.locationSource;
    await updateDoc(cardRef, payload);

    return { success: true, message: 'OK' };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error' };
  }
}

/** Actualiza estado de suscripción en el documento de la tarjeta (UI + reglas; sin RevenueCat). */
export async function updateBusinessCardSubscriptionStatus(
  uid: string,
  bId: string,
  status: 'trial' | 'active' | 'dull',
  options?: { subscriptionExpiresAt?: Date | null },
): Promise<{ success: boolean; message: string }> {
  try {
    const cardRef = doc(db, 'businessCards', bId);
    const snap = await getDoc(cardRef);
    if (!snap.exists()) {
      return { success: false, message: 'Tarjeta no encontrada.' };
    }
    const row = snap.data() as { uid?: string };
    if (String(row.uid) !== uid) {
      return { success: false, message: 'No autorizado.' };
    }
    const payload: Record<string, unknown> = {
      subscriptionStatus: status,
      lastUpdated: new Date(),
    };
    if (options?.subscriptionExpiresAt !== undefined) {
      payload.subscriptionExpiresAt =
        options.subscriptionExpiresAt == null ? null : Timestamp.fromDate(options.subscriptionExpiresAt);
    }
    await updateDoc(cardRef, payload);
    return { success: true, message: 'OK' };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error' };
  }
}

export async function updateBusinessCardMarketVisibility(
  uid: string,
  bId: string,
  isPublishedToMarket: boolean,
): Promise<{ success: boolean; message: string }> {
  try {
    const cardRef = doc(db, 'businessCards', bId);
    const snap = await getDoc(cardRef);
    if (!snap.exists()) {
      return { success: false, message: 'Tarjeta no encontrada.' };
    }
    const data = snap.data() as { uid?: string };
    if (String(data.uid) !== uid) {
      return { success: false, message: 'No autorizado.' };
    }
    await updateDoc(cardRef, {
      isPublishedToMarket,
      publishedAt: isPublishedToMarket ? new Date() : null,
      lastUpdated: new Date(),
    });
    return { success: true, message: 'OK' };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error' };
  }
}

/**
 * Obtener tarjetas de negocio verificadas
 * Para búsqueda en Social Market
 */
export async function getVerifiedBusinessCards(): Promise<any[]> {
  try {
    const q = query(
      collection(db, 'businessCards'),
      where('kycVerified', '==', true),
      where('isPublishedToMarket', '==', true),
      where('isActive', '==', true),
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ bId: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting verified business cards:', error);
    return [];
  }
}

/**
 * Incrementar contador de visualizaciones
 */
export async function incrementViewCount(bId: string): Promise<void> {
  try {
    const cardRef = doc(db, 'businessCards', bId);
    await updateDoc(cardRef, {
      viewCount: increment(1),
    });
  } catch (error) {
    console.error('Error incrementing view count:', error);
  }
}

/**
 * Agregar calificación a tarjeta de negocio
 */
export async function rateBusinessCard(
  bId: string,
  rating: number, // 1-5 stars
): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    if (rating < 1 || rating > 5) {
      return {
        success: false,
        message: 'Rating debe estar entre 1 y 5.',
      };
    }

    const cardRef = doc(db, 'businessCards', bId);

    const cardSnap = await getDoc(cardRef);

    if (!cardSnap.exists()) {
      return {
        success: false,
        message: 'Tarjeta no encontrada.',
      };
    }

    const card = cardSnap.data();
    const newTotalRatings = (card.totalRatings || 0) + 1;
    const currentSum = (card.averageRating || 5) * (card.totalRatings || 0);
    const newAverage = (currentSum + rating) / newTotalRatings;

    let negativeCount = card.negativeRatingsCount || 0;
    if (rating === 1) {
      negativeCount += 1;
    }

    const updateData: Record<string, unknown> = {
      averageRating: newAverage,
      totalRatings: newTotalRatings,
      negativeRatingsCount: negativeCount,
    };

    if (negativeCount >= 15) {
      updateData.isPublishedToMarket = false;
      updateData.reviewStatus = 'shadowbanned';
      updateData.shadowbannedAt = new Date();
    }

    await updateDoc(cardRef, updateData);

    return {
      success: true,
      message: negativeCount >= 15 ? 'Tarjeta suspendida por revisión.' : 'Rating registrado.',
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error registrando rating: ${error.message}`,
    };
  }
}

/** Resuelve filas de bóveda por ID para UI (Smart/Business) sin duplicar texto en la tarjeta. */
export async function fetchVaultLinksByIds(
  uid: string,
  linkIds: string[],
): Promise<Map<string, { title?: string; value?: string; type?: string; iconVaultId?: string }>> {
  const map = new Map<string, { title?: string; value?: string; type?: string; iconVaultId?: string }>();
  const unique = [...new Set(linkIds.filter(Boolean))];
  await Promise.all(
    unique.map(async (linkId) => {
      const snap = await getDoc(doc(db, 'users', uid, 'links', linkId));
      if (snap.exists()) {
        const row = snap.data() as Record<string, unknown>;
        map.set(linkId, {
          title: row.title != null ? String(row.title) : undefined,
          value: row.value != null ? String(row.value) : undefined,
          type: row.type != null ? String(row.type) : undefined,
          iconVaultId: row.iconVaultId != null ? String(row.iconVaultId) : undefined,
        });
      }
    }),
  );
  return map;
}
