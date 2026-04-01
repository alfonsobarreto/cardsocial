/**
 * Business Card Service
 * Maneja creación, búsqueda y gestión de tarjetas de negocio
 */

import { db } from '@/services/firebaseConfig';
import { collection, doc, setDoc, getDocs, query, where, updateDoc, increment } from 'firebase/firestore';
import {
  BUSINESS_CARD_PAYMENTS_QUARANTINED,
  BUSINESS_CARD_TRIAL_DAYS,
} from '@/services/businessCardLifecycleService';

export interface BusinessCardCreateInput {
  ownerUid: string;
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

export interface BusinessCardUpdateInput {
  cardId: string;
  ownerUid: string;
  businessName: string;
  physicalAddress: string;
  calendlyLink: string;
  elevatorPitchWords: string[];
  mapsLink?: string;
  businessLogo?: string;
  kycTermsAccepted: boolean;
}

export interface UpdateBusinessCardPermanentLinkInput {
  cardId: string;
  ownerUid: string;
  permanentBusinessLink: string;
}

const FORBIDDEN_KEYWORD_FRAGMENTS = [
  'porn',
  'xxx',
  'sex',
  'hentai',
  'gore',
  'blood',
  'drugs',
  'cocaine',
  'meth',
  'weapon',
  'gun',
  'hate',
  'racist',
  'casino',
  'bet',
  'gambling',
];

export function normalizeBusinessKeywords(raw: string[]): string[] {
  const normalized = raw
    .map((word) => String(word || '').trim().toLowerCase())
    .filter(Boolean)
    .map((word) => word.replace(/\s+/g, ' '))
    .slice(0, 20);
  return [...new Set(normalized)];
}

export function findForbiddenBusinessKeyword(words: string[]): string | null {
  for (const word of words) {
    const normalized = word.toLowerCase();
    for (const fragment of FORBIDDEN_KEYWORD_FRAGMENTS) {
      if (normalized.includes(fragment)) {
        return word;
      }
    }
  }
  return null;
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
    const cardId = `bcard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const nowIso = now.toISOString();
    const trialEndsIso = new Date(now.getTime() + BUSINESS_CARD_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const businessCardRef = doc(db, 'businessCards', cardId);

    const searchWords = normalizeBusinessKeywords(
      (data.elevatorPitchWords && data.elevatorPitchWords.length > 0)
        ? data.elevatorPitchWords
        : (data.keywords || []),
    );
    const forbiddenKeyword = findForbiddenBusinessKeyword(searchWords);
    if (forbiddenKeyword) {
      return {
        success: false,
        message: `Keyword bloqueada por política: ${forbiddenKeyword}`,
      };
    }

    const ownerCardsSnapshot = await getDocs(
      query(
        collection(db, 'businessCards'),
        where('ownerUid', '==', data.ownerUid),
        where('type', '==', 'business'),
      ),
    );
    const ownerAlreadyUsedTrial = ownerCardsSnapshot.docs.some((row) => {
      const card = row.data() as any;
      return Boolean(
        card?.trialConsumedOwner ||
        card?.trialStartedAt ||
        card?.trialEndsAt ||
        card?.lifecycleState === 'trial_active' ||
        card?.lifecycleState === 'active_paid' ||
        card?.lifecycleState === 'dull' ||
        card?.lifecycleState === 'purged',
      );
    });

    const businessCardData = {
      id: cardId,
      ownerUid: data.ownerUid,
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
      createdAt: now,
      publishedAt: null,
      viewCount: 0,
      searchRankScore: 0,
      // Lifecycle v1
      lifecycleVersion: 'v1',
      lifecycleState: ownerAlreadyUsedTrial ? 'draft' : 'trial_active',
      paymentsQuarantined: BUSINESS_CARD_PAYMENTS_QUARANTINED,
      autopayEnabled: true,
      trialConsumedOwner: true,
      trialStartedAt: ownerAlreadyUsedTrial ? null : nowIso,
      trialEndsAt: ownerAlreadyUsedTrial ? null : trialEndsIso,
      annualContractStartedAt: null,
      annualContractEndsAt: null,
      dullStartedAt: null,
      purgeAt: null,
      lastQrUpdate: nowIso,
      nextQrUpdateAllowedAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      subscriptionExpires: null,
      lastUpdated: nowIso,
    };

    await setDoc(businessCardRef, businessCardData);

    return {
      success: true,
      cardId,
      message: ownerAlreadyUsedTrial
        ? 'Tarjeta de negocio creada. Requiere activación comercial para pasar a estado activo.'
        : 'Tarjeta de negocio creada en modo trial. Completa validación KYC y método de pago.',
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creando tarjeta: ${error.message}`,
    };
  }
}

export async function updateBusinessCard(
  data: BusinessCardUpdateInput
): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const cardRef = doc(db, 'businessCards', data.cardId);
    const cardSnapshot = await getDocs(
      query(collection(db, 'businessCards'), where('id', '==', data.cardId)),
    );
    if (cardSnapshot.empty) {
      return { success: false, message: 'Tarjeta de negocio no encontrada.' };
    }

    const card = cardSnapshot.docs[0].data() as any;
    if (String(card.ownerUid || '') !== data.ownerUid) {
      return { success: false, message: 'No autorizado para editar esta tarjeta.' };
    }

    if (!data.kycTermsAccepted) {
      return { success: false, message: 'Debes aceptar términos para actualizar la tarjeta.' };
    }

    const keywords = normalizeBusinessKeywords(data.elevatorPitchWords || []);
    if (keywords.length === 0) {
      return { success: false, message: 'Agrega al menos 1 keyword para Social Market.' };
    }

    const forbiddenKeyword = findForbiddenBusinessKeyword(keywords);
    if (forbiddenKeyword) {
      return { success: false, message: `Keyword bloqueada por política: ${forbiddenKeyword}` };
    }

    await updateDoc(cardRef, {
      businessName: data.businessName.trim(),
      physicalAddress: data.physicalAddress.trim(),
      calendlyLink: data.calendlyLink.trim(),
      elevatorPitchWords: keywords,
      keywords,
      mapsLink: String(data.mapsLink || '').trim(),
      businessLogo: String(data.businessLogo || '').trim(),
      kycTermsAccepted: true,
      lastUpdated: new Date().toISOString(),
    });

    return {
      success: true,
      message: 'Tarjeta de negocio actualizada correctamente.',
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error actualizando tarjeta: ${error.message}`,
    };
  }
}

export async function updateBusinessCardPermanentLink(
  input: UpdateBusinessCardPermanentLinkInput
): Promise<{
  success: boolean;
  message: string;
  nextAllowedAt?: string;
}> {
  try {
    const cardSnapshot = await getDocs(
      query(collection(db, 'businessCards'), where('id', '==', input.cardId)),
    );
    if (cardSnapshot.empty) {
      return { success: false, message: 'Tarjeta de negocio no encontrada.' };
    }

    const row = cardSnapshot.docs[0];
    const card = row.data() as any;
    if (String(card.ownerUid || '') !== input.ownerUid) {
      return { success: false, message: 'No autorizado para actualizar el link.' };
    }

    const now = Date.now();
    const nextAllowedAtRaw = card.nextQrUpdateAllowedAt || null;
    const nextAllowedAt = nextAllowedAtRaw ? Date.parse(String(nextAllowedAtRaw)) : NaN;
    if (Number.isFinite(nextAllowedAt) && nextAllowedAt > now) {
      const nextIso = new Date(nextAllowedAt).toISOString();
      const remainingDays = Math.ceil((nextAllowedAt - now) / (24 * 60 * 60 * 1000));
      return {
        success: false,
        message: `Podrás actualizar tu link permanente en ${remainingDays} días.`,
        nextAllowedAt: nextIso,
      };
    }

    const nowIso = new Date(now).toISOString();
    const nextAllowedIso = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    await updateDoc(doc(db, 'businessCards', row.id), {
      permanent_business_link: input.permanentBusinessLink.trim(),
      lastQrUpdate: nowIso,
      nextQrUpdateAllowedAt: nextAllowedIso,
      lastUpdated: nowIso,
    });

    return {
      success: true,
      message: 'Link permanente actualizado correctamente.',
      nextAllowedAt: nextAllowedIso,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error actualizando link permanente: ${error?.message || 'Unknown error'}`,
    };
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
