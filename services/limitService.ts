/**
 * Limit Validation Service
 * Controla los límites base del ecosistema:
 * - 30 tarjetas sociales/personales
 * - 50 datos en Vault (bunker)
 *
 * Las tarjetas de negocio usan licencia anual por tarjeta y no dependen de este tope.
 */

import { FREE_TIER_POLICY } from '@/constants/freeTierPolicy';
import { db } from '@/services/firebaseConfig';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { isSuperAdmin } from '@/services/roleService';
import { effectiveTierKeyFromUserData, getTiersConfig } from '@/services/tiersConfigService';
import { readUserNickNameLower } from '@/services/userIdentityFields';

const PRIVILEGED_NICKNAMES = new Set(['pochobs_admin']);

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
    // Ruta principal: documento directo por UID (patrón estándar del proyecto)
    const directRef = doc(db, 'users', userId);
    const directSnap = await getDoc(directRef);

    let userData: any = null;
    if (directSnap.exists()) {
      userData = directSnap.data();
    } else {
      // Fallback legacy: algunas instalaciones guardan uid como campo
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('uid', '==', userId));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        return false; // Usuario no encontrado, asumir free
      }
      userData = querySnapshot.docs[0].data();
    }

    const nicknameLower = readUserNickNameLower(userData as Record<string, unknown>);
    const role = String(userData?.role || '').trim().toLowerCase();
    const emailLower = String(userData?.emailLower ?? userData?.email ?? '').trim().toLowerCase();

    if (
      PRIVILEGED_NICKNAMES.has(nicknameLower) ||
      role === 'super_admin' ||
      emailLower === 'pochobs@gmail.com'
    ) {
      return true;
    }

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
 * Tope = `system_config/tiers` + tier efectivo; solo `super_admin` tiene cupo ilimitado.
 */
export async function validateVaultItemCreation(userId: string): Promise<LimitValidationResult> {
  try {
    const uid = String(userId || '').trim();
    const currentCount = await countVaultItems(uid);

    if (await isSuperAdmin(uid)) {
      const maxLimit = LIMITS.PREMIUM.vaultItems;
      return {
        canCreate: true,
        currentCount,
        maxLimit,
        isFreeUser: false,
        message: `✅ Dato #${currentCount + 1} de ∞ disponible`,
      };
    }

    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {};
    const tiers = await getTiersConfig();
    const tier = effectiveTierKeyFromUserData(userData);
    const maxLimit = Math.max(0, tiers[tier].iconDataLimit);
    const canCreate = currentCount < maxLimit;

    return {
      canCreate,
      currentCount,
      maxLimit,
      isFreeUser: tier === 'free',
      message: canCreate
        ? `✅ Dato #${currentCount + 1} de ${maxLimit} disponible`
        : `🛑 Límite alcanzado: ${currentCount}/${maxLimit} datos del bunker.`,
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
        remaining: Number.isFinite(vaultValidation.maxLimit)
          ? Math.max(0, vaultValidation.maxLimit - vaultValidation.currentCount)
          : Number.MAX_SAFE_INTEGER,
        canCreate: vaultValidation.canCreate,
      },
    };
  } catch (error) {
    console.error('Error getting user limit info:', error);
    return null;
  }
}
