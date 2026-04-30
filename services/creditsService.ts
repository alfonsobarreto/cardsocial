/**
 * Credits Economy Service
 * Gestiona el balance de créditos (CS) del usuario
 *
 * Conversión oficial: 100 Créditos CS = 1 USD (`constants/csEconomy.ts`).
 * Welcome Bonus: al confirmar pago (AppStore/PlayStore).
 * Gasto VIP Story: ver `PREMIUM_STORY_COST_CS`.
 * Zero-Balance: nuevo usuario comienza con 0 CS
 */

import { PREMIUM_STORY_COST_CS, WELCOME_BONUS_CS } from '@/constants/csEconomy';
import { db } from '@/services/firebaseConfig';
import { addDoc, collection, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

export interface UserCreditsState {
  userId: string;
  creditsBalance: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
  welcomeBonusUsed: boolean;
  lastUpdated: string;
  createdAt: string;
}

export interface CreditTransaction {
  type: 'earn' | 'spend';
  amount: number;
  reason: string; // 'welcome_bonus', 'story_vip', 'refund', etc.
  timestamp: string;
}

export type PremiumStoryDuration = '7d' | '30d';

const PREMIUM_STORY_COSTS: Record<PremiumStoryDuration, number> = {
  '7d': PREMIUM_STORY_COST_CS['7d'],
  '30d': PREMIUM_STORY_COST_CS['30d'],
};

export function getPremiumStoryCost(duration: PremiumStoryDuration): number {
  return PREMIUM_STORY_COSTS[duration];
}

/**
 * Inicializa el balance de créditos para un usuario nuevo (ZERO-BALANCE)
 * Se llama en el registration flow, balance comienza en 0
 * Los créditos SOLO se generan cuando se confirma pago en AppStore/PlayStore
 */
export async function initializeUserCredits(userId: string): Promise<void> {
  try {
    const userCreditsRef = doc(db, `users/${userId}/credits/balance`);
    const snapshot = await getDoc(userCreditsRef);

    if (!snapshot.exists()) {
      // Zero-balance inicial - solo 100 CS al confirmar pago
      await setDoc(userCreditsRef, {
        userId,
        creditsBalance: 0, // ZERO-BALANCE: Sin créditos hasta confirmar pago
        totalCreditsEarned: 0,
        totalCreditsSpent: 0,
        welcomeBonusUsed: false,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('Error initializing user credits:', error);
  }
}

/**
 * Obtiene el balance actual de créditos del usuario
 */
export async function getUserCreditsBalance(userId: string): Promise<number> {
  try {
    if (!userId) return 0;
    const userCreditsRef = doc(db, `users/${userId}/credits/balance`);
    const snapshot = await getDoc(userCreditsRef);

    if (snapshot.exists()) {
      return snapshot.data().creditsBalance || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error getting user credits balance:', error);
    return 0;
  }
}

/**
 * Obtiene el estado completo de créditos del usuario
 */
export async function getUserCreditsState(userId: string): Promise<UserCreditsState | null> {
  try {
    const userCreditsRef = doc(db, `users/${userId}/credits/balance`);
    const snapshot = await getDoc(userCreditsRef);

    if (snapshot.exists()) {
      return snapshot.data() as UserCreditsState;
    }
    return null;
  } catch (error) {
    console.error('Error getting user credits state:', error);
    return null;
  }
}

/**
 * Aplica el Welcome Bonus (100 créditos CS)
 * ⚠️ CRITICAL: Solo se puede aplicar UNA VEZ por usuario
 * ⚠️ CRITICAL: Se llama SOLO después de confirmar pago en AppStore/PlayStore
 * ⚠️ CRITICAL: NO se aplica automáticamente al registrarse (zero-balance inicial)
 * 
 * Flujo correcto:
 * 1. Usuario registra → creditsBalance = 0
 * 2. Usuario confirma pago trial → applyWelcomeBonus() → creditsBalance = 100
 */
export async function applyWelcomeBonus(userId: string): Promise<boolean> {
  try {
    const userCreditsRef = doc(db, `users/${userId}/credits/balance`);
    const snapshot = await getDoc(userCreditsRef);

    if (!snapshot.exists() || snapshot.data().welcomeBonusUsed === true) {
      console.log(`Welcome bonus already used or not found for user ${userId}`);
      return false; // Ya fue usado
    }

    const WELCOME_BONUS_AMOUNT = WELCOME_BONUS_CS;

    // Actualizar balance (SOLO después de confirmar pago)
    await updateDoc(userCreditsRef, {
      creditsBalance: increment(WELCOME_BONUS_AMOUNT),
      totalCreditsEarned: increment(WELCOME_BONUS_AMOUNT),
      welcomeBonusUsed: true,
      lastUpdated: serverTimestamp(),
    });

    // Registrar transacción
    await recordCreditTransaction(userId, 'earn', WELCOME_BONUS_AMOUNT, 'welcome_bonus_payment_confirmed');

    console.log(`✅ Welcome bonus applied: ${userId} received ${WELCOME_BONUS_AMOUNT} CS`);
    return true;
  } catch (error) {
    console.error('Error applying welcome bonus:', error);
    return false;
  }
}

/**
 * Deduce crédito por publicar una Historia VIP (coste según `PREMIUM_STORY_COST_CS`).
 */
export async function deductCreditsForVipStory(userId: string): Promise<boolean> {
  try {
    return await purchasePremiumStoryWithCredits(userId, '7d');
  } catch (error) {
    console.error('Error deducting credits for VIP story:', error);
    return false;
  }
}

export async function purchasePremiumStoryWithCredits(
  userId: string,
  duration: PremiumStoryDuration,
): Promise<boolean> {
  const cost = getPremiumStoryCost(duration);
  const reason = duration === '30d' ? 'story_premium_30days' : 'story_vip_7days';
  return deductCredits(userId, cost, reason);
}

/**
 * Suma créditos manualmente (para reembolsos u otras razones)
 */
export async function addCredits(
  userId: string,
  amount: number,
  reason: string
): Promise<void> {
  try {
    const userCreditsRef = doc(db, `users/${userId}/credits/balance`);

    await updateDoc(userCreditsRef, {
      creditsBalance: increment(amount),
      totalCreditsEarned: increment(amount),
      lastUpdated: serverTimestamp(),
    });

    await recordCreditTransaction(userId, 'earn', amount, reason);
  } catch (error) {
    console.error('Error adding credits:', error);
  }
}

/**
 * Deduce créditos de forma genérica (para cualquier compra/gasto)
 * 
 * Uso:
 * - Icon Pack purchase: deductCredits(userId, 75, `icon_pack_purchase:packId`)
 * - VIP Story: deductCredits(userId, getPremiumStoryCost('7d'), 'story_vip_7days')
 * - Otros gastos futuros
 */
export async function deductCredits(
  userId: string,
  amount: number,
  reason: string
): Promise<boolean> {
  try {
    const userCreditsRef = doc(db, `users/${userId}/credits/balance`);
    const snapshot = await getDoc(userCreditsRef);

    if (!snapshot.exists()) {
      console.error('❌ Credits record not found for user');
      return false;
    }

    const currentBalance = snapshot.data().creditsBalance || 0;

    if (currentBalance < amount) {
      console.error(`❌ Insufficient credits. Need ${amount}, have ${currentBalance}`);
      return false;
    }

    // Actualizar balance
    await updateDoc(userCreditsRef, {
      creditsBalance: increment(-amount),
      totalCreditsSpent: increment(amount),
      lastUpdated: serverTimestamp(),
    });

    // Registrar transacción
    await recordCreditTransaction(userId, 'spend', amount, reason);

    console.log(`✅ Créditos deducidos: ${amount} CS | Razón: ${reason}`);
    return true;
  } catch (error) {
    console.error('Error deducting credits:', error);
    return false;
  }
}

/**
 * Registra una transacción de créditos en el historial
 */
export async function recordCreditTransaction(
  userId: string,
  type: 'earn' | 'spend',
  amount: number,
  reason: string
): Promise<void> {
  try {
    const transactionRef = doc(db, `users/${userId}/credits/transactions/${Date.now()}`);

    await setDoc(transactionRef, {
      type,
      amount,
      reason,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error recording credit transaction:', error);
  }
}

/**
 * Obtiene el historial de transacciones de créditos del usuario
 */
export async function getCreditTransactionHistory(userId: string): Promise<CreditTransaction[]> {
  try {
    const transactionsRef = doc(db, `users/${userId}/credits/transactions`);
    const snapshot = await getDoc(transactionsRef);

    if (snapshot.exists()) {
      return Object.values(snapshot.data()) as CreditTransaction[];
    }
    return [];
  } catch (error) {
    console.error('Error getting credit transaction history:', error);
    return [];
  }
}

/**
 * ======================================
 * DEFAULT CARDS & VAULT DATA INITIALIZATION
 * ======================================
 * Crea 3 tarjetas por defecto y 3 datos en Vault
 * para nuevos usuarios (Dull Mode / Free tier)
 */

/**
 * Inicializa 3 tarjetas por defecto: Personal, Trabajo, Social
 * Free users máximo 5 tarjetas, deben ser borrables
 */
export async function createDefaultCards(userId: string): Promise<void> {
  try {
    const cardsRef = collection(db, `users/${userId}/cards`);
    
    const defaultCards = [
      {
        name: 'Personal',
        type: 'personal',
        order: 1,
        isActive: true,
        itemIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        name: 'Trabajo',
        type: 'work',
        order: 2,
        isActive: true,
        itemIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        name: 'Social',
        type: 'social',
        order: 3,
        isActive: true,
        itemIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    ];

    // Crear las 3 tarjetas por defecto
    for (const card of defaultCards) {
      await addDoc(cardsRef, card);
    }

    console.log(`✅ Default cards created for user ${userId}`);
  } catch (error) {
    console.error('Error creating default cards:', error);
  }
}

/**
 * DEPRECATED: Antes sembraba 3 docs en `users/{uid}/vault` (phone/email/social)
 * con `inputData: ''`. Eran los "3 items fantasma vacíos" que aparecían en
 * Firebase sin que el usuario hubiera escrito nada. La bóveda real vive en
 * `users/{uid}/links` (que pronto migrará a Mongo `vault_slots`); sembrar
 * placeholders vacíos en otra colección sólo contaminaba la consola.
 *
 * La función se conserva como no-op para mantener la firma de `register.tsx`
 * sin cambios; cuando se migre el vault a Mongo podrá eliminarse del todo.
 */
export async function createDefaultVaultData(userId: string): Promise<void> {
  console.log('[creditsService] createDefaultVaultData is a no-op (vault seed removed) for', userId);
}
