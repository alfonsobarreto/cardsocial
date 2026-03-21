/**
 * Limit Validation Service
 * Controla los límites base del ecosistema:
 * - 30 tarjetas sociales/personales
 * - 50 datos en Vault (bunker)
 *
 * Las tarjetas de negocio usan licencia anual por tarjeta y no dependen de este tope.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { FREE_TIER_POLICY } from '@/constants/freeTierPolicy';

export interface LimitValidationResult {
  canCreate: boolean;
  currentCount: number;
  maxLimit: number;
  isFreeUser: boolean;
  message: string;
}

// Límites por tier
const LIMITS = {
  FREE: {
    cards: FREE_TIER_POLICY.cards,
    vaultItems: FREE_TIER_POLICY.vaultItems,
  },
  PREMIUM: {
    cards: Infinity,
    vaultItems: Infinity,
  },
};

/**
 * Valida si el usuario es Premium o Free
 * Retorna true si es Premium (puede crear ilimitado)
 */
export async function isPremiumUser(userId: string): Promise<boolean> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('uid', '==', userId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return false; // Usuario no encontrado, asumir free
    }

    const userData = querySnapshot.docs[0].data();
    return userData?.isPremium === true || userData?.subscriptionStatus === 'active';
  } catch (error) {
    console.error('Error validating premium status:', error);
    return false; // En caso de error, asumir free (conservative)
  }
}

/**
 * Cuenta las tarjetas activas del usuario
 */
export async function countUserCards(userId: string): Promise<number> {
  try {
    const cardsRef = collection(db, `users/${userId}/cards`);
    const querySnapshot = await getDocs(cardsRef);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error counting cards:', error);
    return 0;
  }
}

/**
 * Cuenta los datos del Vault del usuario
 */
export async function countVaultItems(userId: string): Promise<number> {
  try {
    const vaultRef = collection(db, `users/${userId}/links`);
    const querySnapshot = await getDocs(vaultRef);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error counting vault items:', error);
    return 0;
  }
}

/**
 * VALIDACIÓN PRINCIPAL: ¿Puede crear una nueva tarjeta?
 */
export async function validateCardCreation(userId: string): Promise<LimitValidationResult> {
  try {
    const isPremium = await isPremiumUser(userId);
    const currentCount = await countUserCards(userId);
    const maxLimit = isPremium ? LIMITS.PREMIUM.cards : LIMITS.FREE.cards;

    const canCreate = currentCount < maxLimit;

    return {
      canCreate,
      currentCount,
      maxLimit,
      isFreeUser: !isPremium,
      message: canCreate
        ? `✅ Tarjeta #${currentCount + 1} de ${maxLimit >= Infinity ? '∞' : maxLimit} disponible`
        : `🛑 Límite alcanzado: ${currentCount}/${maxLimit} tarjetas sociales/personales.`,
    };
  } catch (error) {
    console.error('Error validating card creation:', error);
    return {
      canCreate: false,
      currentCount: 0,
      maxLimit: 0,
      isFreeUser: true,
      message: 'Error al validar disponibilidad. Intenta de nuevo.',
    };
  }
}

/**
 * VALIDACIÓN PRINCIPAL: ¿Puede crear un nuevo dato en Vault?
 */
export async function validateVaultItemCreation(userId: string): Promise<LimitValidationResult> {
  try {
    const isPremium = await isPremiumUser(userId);
    const currentCount = await countVaultItems(userId);
    const maxLimit = isPremium ? LIMITS.PREMIUM.vaultItems : LIMITS.FREE.vaultItems;

    const canCreate = currentCount < maxLimit;

    return {
      canCreate,
      currentCount,
      maxLimit,
      isFreeUser: !isPremium,
      message: canCreate
        ? `✅ Dato #${currentCount + 1} de ${maxLimit >= Infinity ? '∞' : maxLimit} disponible`
        : `🛑 Límite alcanzado: ${currentCount}/${maxLimit} datos del bunker.`
    };
  } catch (error) {
    console.error('Error validating vault item creation:', error);
    return {
      canCreate: false,
      currentCount: 0,
      maxLimit: 0,
      isFreeUser: true,
      message: 'Error al validar disponibilidad. Intenta de nuevo.',
    };
  }
}

/**
 * Obtiene información de límites del usuario (para UI)
 */
export async function getUserLimitInfo(userId: string) {
  try {
    const [cardsValidation, vaultValidation, isPremium] = await Promise.all([
      validateCardCreation(userId),
      validateVaultItemCreation(userId),
      isPremiumUser(userId),
    ]);

    return {
      isPremium,
      cards: {
        current: cardsValidation.currentCount,
        max: cardsValidation.maxLimit,
        remaining: Math.max(0, cardsValidation.maxLimit - cardsValidation.currentCount),
        canCreate: cardsValidation.canCreate,
      },
      vault: {
        current: vaultValidation.currentCount,
        max: vaultValidation.maxLimit,
        remaining: Math.max(0, vaultValidation.maxLimit - vaultValidation.currentCount),
        canCreate: vaultValidation.canCreate,
      },
    };
  } catch (error) {
    console.error('Error getting user limit info:', error);
    return null;
  }
}
