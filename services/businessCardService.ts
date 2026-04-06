/**
 * Business Card Service
 * Maneja creación, búsqueda y gestión de tarjetas de negocio
 */

import { db } from '@/services/firebaseConfig';
import { newEntityId } from '@/services/newEntityId';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  where,
  updateDoc,
  increment,
  Timestamp,
} from 'firebase/firestore';

const TRIAL_DAYS = 14;

/** Igual que Smart Cards (12 slots): máx. ítems de Bóveda por tarjeta de negocio. */
export const MAX_BUSINESS_VAULT_DATA_SLOTS = 12;

export interface BusinessCardCreateInput {
  ownerUid: string;
  /** IDs en users/{ownerUid}/links — datos públicos salen de la Bóveda */
  vaultLinkIds?: string[];
  businessName: string;
  ownerName: string;
  /** Texto opcional de referencia (no sustituye coordenadas GPS) */
  physicalAddress?: string;
  latitude: number;
  longitude: number;
  /** Origen de las coordenadas (p. ej. device_gps | geocode_forward). */
  locationSource?: string;
  keywords: string[];
  businessLogo?: string;
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
  cardId?: string;
  message: string;
}> {
  try {
    const cardId = newEntityId();

    const businessCardRef = doc(db, 'businessCards', cardId);

    const searchWords = (data.keywords || []).slice(0, 20);

    const now = new Date();
    const trialEnds = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const businessCardData = {
      id: cardId,
      ownerUid: data.ownerUid,
      ...(Array.isArray(data.vaultLinkIds) && data.vaultLinkIds.length > 0
        ? {
            vaultLinkIds: data.vaultLinkIds
              .slice(0, MAX_BUSINESS_VAULT_DATA_SLOTS)
              .map((id) => String(id)),
          }
        : {}),
      type: 'business',
      businessName: data.businessName,
      ownerName: data.ownerName,
      ownerEmail: '',
      ownerPhone: '',
      physicalAddress: (data.physicalAddress || '').trim(),
      calendlyLink: '',
      keywords: searchWords,
      elevatorPitchWords: searchWords,
      permanent_business_link: '',
      mapsLink: '',
      professionalVault: {
        contractsPdf: '',
      },
      businessLogo: data.businessLogo || '',
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
    };

    await setDoc(businessCardRef, businessCardData);

    return {
      success: true,
      cardId,
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
  id: string;
  businessName: string;
  createdAtMs: number;
  themeId: string;
  ownerName: string;
  businessLogo: string;
  /** IDs en Bóveda (users/{uid}/links), mismo orden que en la tarjeta. */
  vaultLinkIds: string[];
  isFavorite: boolean;
  holdersCount: number;
  totalRatings: number;
  ratingAvg: number;
};

/** Tarjetas de negocio del usuario (colección `businessCards`, distinta de Smart Cards). */
export async function listBusinessCardsByOwner(ownerUid: string): Promise<BusinessCardListRow[]> {
  const q = query(collection(db, 'businessCards'), where('ownerUid', '==', ownerUid));
  const snap = await getDocs(q);
  const rows: BusinessCardListRow[] = snap.docs.map((d) => {
    const data = d.data() as {
      businessName?: string;
      ownerName?: string;
      businessLogo?: string;
      themeId?: string;
      vaultLinkIds?: unknown;
      isFavorite?: boolean;
      holdersCount?: number;
      totalRatings?: number;
      averageRating?: number;
      createdAt?: Timestamp | Date | { toMillis?: () => number; seconds?: number };
    };
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
      id: d.id,
      businessName: String(data.businessName ?? '').trim() || d.id,
      ownerName: String(data.ownerName ?? '').trim(),
      businessLogo: String(data.businessLogo ?? '').trim(),
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
  ownerUid: string,
  cardId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const cardRef = doc(db, 'businessCards', cardId);
    const snap = await getDoc(cardRef);
    if (!snap.exists()) {
      return { success: false, message: 'Tarjeta no encontrada.' };
    }
    const row = snap.data() as { ownerUid?: string };
    if (String(row.ownerUid) !== ownerUid) {
      return { success: false, message: 'No autorizado.' };
    }
    await deleteDoc(cardRef);
    return { success: true, message: 'OK' };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error' };
  }
}

export async function setBusinessCardFavorite(
  ownerUid: string,
  cardId: string,
  isFavorite: boolean,
): Promise<{ success: boolean; message: string }> {
  try {
    const cardRef = doc(db, 'businessCards', cardId);
    const snap = await getDoc(cardRef);
    if (!snap.exists()) {
      return { success: false, message: 'Tarjeta no encontrada.' };
    }
    const row = snap.data() as { ownerUid?: string };
    if (String(row.ownerUid) !== ownerUid) {
      return { success: false, message: 'No autorizado.' };
    }
    await updateDoc(cardRef, { isFavorite, lastUpdated: new Date() });
    return { success: true, message: 'OK' };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error' };
  }
}

export type BusinessCardUpdatePayload = {
  businessName?: string;
  ownerName?: string;
  vaultLinkIds?: string[];
  themeId?: string;
  keywords?: string[];
  businessLogo?: string;
  physicalAddress?: string;
  latitude?: number;
  longitude?: number;
  locationSource?: string;
};

export async function updateBusinessCard(
  ownerUid: string,
  cardId: string,
  data: BusinessCardUpdatePayload,
): Promise<{ success: boolean; message: string }> {
  try {
    const cardRef = doc(db, 'businessCards', cardId);
    const snap = await getDoc(cardRef);
    if (!snap.exists()) {
      return { success: false, message: 'Tarjeta no encontrada.' };
    }
    const row = snap.data() as { ownerUid?: string };
    if (String(row.ownerUid) !== ownerUid) {
      return { success: false, message: 'No autorizado.' };
    }
    const payload: Record<string, unknown> = { lastUpdated: new Date() };
    if (data.businessName !== undefined) payload.businessName = data.businessName;
    if (data.ownerName !== undefined) payload.ownerName = data.ownerName;
    if (data.vaultLinkIds !== undefined) {
      payload.vaultLinkIds = data.vaultLinkIds
        .slice(0, MAX_BUSINESS_VAULT_DATA_SLOTS)
        .map((id) => String(id));
    }
    if (data.themeId !== undefined) {
      payload.themeId = String(data.themeId).trim() || 'deep_teal';
    }
    if (data.keywords !== undefined) {
      const searchWords = data.keywords.slice(0, 20);
      payload.keywords = searchWords;
      payload.elevatorPitchWords = searchWords;
    }
    if (data.businessLogo !== undefined) payload.businessLogo = data.businessLogo;
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
  ownerUid: string,
  cardId: string,
  status: 'trial' | 'active' | 'dull',
  options?: { subscriptionExpiresAt?: Date | null },
): Promise<{ success: boolean; message: string }> {
  try {
    const cardRef = doc(db, 'businessCards', cardId);
    const snap = await getDoc(cardRef);
    if (!snap.exists()) {
      return { success: false, message: 'Tarjeta no encontrada.' };
    }
    const row = snap.data() as { ownerUid?: string };
    if (String(row.ownerUid) !== ownerUid) {
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
  ownerUid: string,
  cardId: string,
  isPublishedToMarket: boolean,
): Promise<{ success: boolean; message: string }> {
  try {
    const cardRef = doc(db, 'businessCards', cardId);
    const snap = await getDoc(cardRef);
    if (!snap.exists()) {
      return { success: false, message: 'Tarjeta no encontrada.' };
    }
    const data = snap.data() as { ownerUid?: string };
    if (String(data.ownerUid) !== ownerUid) {
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
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting verified business cards:', error);
    return [];
  }
}

/**
 * Incrementar contador de visualizaciones
 */
export async function incrementViewCount(cardId: string): Promise<void> {
  try {
    const cardRef = doc(db, 'businessCards', cardId);
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
  cardId: string,
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

    const cardRef = doc(db, 'businessCards', cardId);

    const cardSnapshot = await getDocs(query(collection(db, 'businessCards'), where('id', '==', cardId)));

    if (cardSnapshot.empty) {
      return {
        success: false,
        message: 'Tarjeta no encontrada.',
      };
    }

    const card = cardSnapshot.docs[0].data();
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
  ownerUid: string,
  linkIds: string[],
): Promise<Map<string, { title?: string; value?: string; type?: string; iconVaultId?: string }>> {
  const map = new Map<string, { title?: string; value?: string; type?: string; iconVaultId?: string }>();
  const unique = [...new Set(linkIds.filter(Boolean))];
  await Promise.all(
    unique.map(async (linkId) => {
      const snap = await getDoc(doc(db, 'users', ownerUid, 'links', linkId));
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
