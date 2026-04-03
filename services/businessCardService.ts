/**
 * Business Card Service
 * Maneja creación, búsqueda y gestión de tarjetas de negocio
 */

import { db } from '@/services/firebaseConfig';
import { newEntityId } from '@/services/newEntityId';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  where,
  updateDoc,
  increment,
} from 'firebase/firestore';

export interface BusinessCardCreateInput {
  ownerUid: string;
  /** IDs en users/{ownerUid}/links — la app puede resolver texto desde la bóveda sin duplicar */
  vaultLinkIds?: string[];
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  physicalAddress: string;
  calendlyLink: string;
  elevatorPitchWords?: string[];
  keywords?: string[];
  permanent_business_link?: string;
  mapsLink?: string;
  contractPdfUrl?: string;
  businessLogo?: string;
  kycDocumentUrl: string;
  kycTermsAccepted: boolean;
}

/**
 * Crear tarjeta de negocio
 * Backend: geocodificación + validación
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

    const searchWords = (data.elevatorPitchWords && data.elevatorPitchWords.length > 0)
      ? data.elevatorPitchWords.slice(0, 20)
      : (data.keywords || []).slice(0, 20);

    const businessCardData = {
      id: cardId,
      ownerUid: data.ownerUid,
      ...(Array.isArray(data.vaultLinkIds) && data.vaultLinkIds.length > 0
        ? { vaultLinkIds: data.vaultLinkIds.map((id) => String(id)) }
        : {}),
      type: 'business',
      businessName: data.businessName,
      ownerName: data.ownerName,
      ownerEmail: data.ownerEmail,
      ownerPhone: data.ownerPhone,
      physicalAddress: data.physicalAddress,
      calendlyLink: data.calendlyLink,
      keywords: searchWords,
      elevatorPitchWords: searchWords,
      permanent_business_link: data.permanent_business_link || '',
      mapsLink: data.mapsLink || '',
      professionalVault: {
        contractsPdf: data.contractPdfUrl || '',
      },
      businessLogo: data.businessLogo || '',
      // GPS (será geocodificada en backend)
      latitude: 0,
      longitude: 0,
      city: 'Pending Geocoding',
      postalCode: '',
      // KYC
      kycDocumentUrl: data.kycDocumentUrl,
      kycVerified: false,
      kycApprovedAt: null,
      kycTermsAccepted: data.kycTermsAccepted,
      // Stats
      averageRating: 5,
      totalRatings: 0,
      negativeRatingsCount: 0,
      // Metadata
      isActive: true,
      isPublishedToMarket: false,
      createdAt: new Date(),
      publishedAt: null,
      viewCount: 0,
      searchRankScore: 0,
    };

    await setDoc(businessCardRef, businessCardData);

    return {
      success: true,
      cardId,
      message: 'Tarjeta de negocio creada. Espera validación KYC (24-48 horas).',
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creando tarjeta: ${error.message}`,
    };
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
      where('isActive', '==', true)
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
  rating: number // 1-5 stars
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

    // Obtener tarjeta actual
    const cardSnapshot = await getDocs(
      query(collection(db, 'businessCards'), where('id', '==', cardId))
    );

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

    // Aplicar shadowban si llega a 15 ratings negativos
    let updateData: any = {
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
  linkIds: string[]
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
    })
  );
  return map;
}
