/**
 * Credits Economy Service
 * Gestiona el balance de créditos (CS) del usuario
 * 
 * Conversión: $1 USD = 10 Créditos CS
 * Welcome Bonus: 100 Créditos CS SOLO al confirmar pago (AppStore/PlayStore, no automático)
 * Gasto: 50 Créditos CS por Historia VIP (7 días)
 * Zero-Balance: Nuevo usuario comienza con 0 CS
 */

import { doc, getDoc, updateDoc, increment, serverTimestamp, setDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

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
  '7d': 50,
  '30d': 180,
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

    const WELCOME_BONUS_AMOUNT = 100;

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
 * Deduce crédito por publicar una Historia VIP (50 créditos)
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
 * - VIP Story: deductCredits(userId, 50, 'story_vip_7days')
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
 * Inicializa 3 datos por defecto en Vault: Teléfono, Email, Red Social
 * Free users máximo 10 datos en Vault
 */
export async function createDefaultVaultData(userId: string): Promise<void> {
  try {
    const vaultRef = collection(db, `users/${userId}/vault`);

    const defaultVaultData = [
      {
        type: 'phone',
        nameOfData: 'Teléfono',
        inputData: '', // Usuario lo completa
        icon: 'phone', // MaterialCommunityIcons
        isFavorite: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        type: 'email',
        nameOfData: 'Email',
        inputData: '', // Usuario lo completa
        icon: 'email', // MaterialCommunityIcons
        isFavorite: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        type: 'social',
        nameOfData: 'Red Social',
        inputData: '', // Usuario lo completa
        icon: 'share-social', // MaterialCommunityIcons
        isFavorite: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    ];

    // Crear los 3 datos por defecto
    for (const data of defaultVaultData) {
      await addDoc(vaultRef, data);
    }

    console.log(`✅ Default vault data created for user ${userId}`);
  } catch (error) {
    console.error('Error creating default vault data:', error);
  }
}
