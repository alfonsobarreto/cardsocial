/**
 * Credits Economy Service
 * Gestiona el balance de créditos (CS) del usuario
 * 
 * Conversión: $1 USD = 10 Créditos CS
 * Welcome Bonus: 100 Créditos CS SOLO al confirmar pago (AppStore/PlayStore, no automático)
 * Gasto: 50 Créditos CS por Historia VIP (7 días)
 * Zero-Balance: Nuevo usuario comienza con 0 CS
 */

import { doc, getDoc, getDocs, updateDoc, increment, serverTimestamp, setDoc, collection, addDoc, query, where } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

export type CreditWalletSource = 'subscription_revocable' | 'iap_permanent';

export interface UserCreditsState {
  userId: string;
  /**
   * Legacy field kept for backwards compatibility with existing consumers.
   * Source of truth is wallet split below.
   */
  creditsBalance: number;
  creditsSubscriptionRevocable: number;
  creditsIapPermanent: number;
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
  walletSource?: CreditWalletSource;
  status?: 'active' | 'dull' | 'revoked';
  linkedBusinessCardId?: string;
  linkedAssetKind?: 'icon_pack' | 'story' | 'theme' | 'other';
  linkedAssetId?: string;
  timestamp: string;
}

export interface WalletBreakdown {
  subscriptionRevocable: number;
  iapPermanent: number;
  total: number;
}

export interface CreditMutationOptions {
  source?: CreditWalletSource;
  linkedBusinessCardId?: string;
  linkedAssetKind?: 'icon_pack' | 'story' | 'theme' | 'other';
  linkedAssetId?: string;
}

export interface DeductCreditsOptions extends CreditMutationOptions {
  /**
   * If true and no explicit source is provided, picks ONE wallet with enough balance.
   * Never mixes wallets in a single purchase.
   */
  allowAutoSelectSingleWallet?: boolean;
}

export type PremiumStoryDuration = '7d' | '30d';

const PREMIUM_STORY_COSTS: Record<PremiumStoryDuration, number> = {
  '7d': 50,
  '30d': 180,
};

const DEFAULT_WALLET_PRIORITY: CreditWalletSource[] = ['iap_permanent', 'subscription_revocable'];

function toSafeNumber(value: unknown): number {
  const num = Number(value || 0);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

function normalizeCreditsState(raw: Record<string, any> | undefined, userId: string): {
  state: UserCreditsState;
  needsRepair: boolean;
} {
  const legacyBalance = toSafeNumber(raw?.creditsBalance);
  let subscriptionRevocable = toSafeNumber(raw?.creditsSubscriptionRevocable);
  let iapPermanent = toSafeNumber(raw?.creditsIapPermanent);
  let needsRepair = false;

  if (!raw || (!('creditsSubscriptionRevocable' in raw) && !('creditsIapPermanent' in raw))) {
    iapPermanent = legacyBalance;
    subscriptionRevocable = 0;
    needsRepair = true;
  }

  const walletTotal = subscriptionRevocable + iapPermanent;
  if (legacyBalance > walletTotal) {
    iapPermanent += legacyBalance - walletTotal;
    needsRepair = true;
  }

  const finalTotal = subscriptionRevocable + iapPermanent;
  if (legacyBalance !== finalTotal) {
    needsRepair = true;
  }

  const state: UserCreditsState = {
    userId,
    creditsBalance: finalTotal,
    creditsSubscriptionRevocable: subscriptionRevocable,
    creditsIapPermanent: iapPermanent,
    totalCreditsEarned: toSafeNumber(raw?.totalCreditsEarned),
    totalCreditsSpent: toSafeNumber(raw?.totalCreditsSpent),
    welcomeBonusUsed: Boolean(raw?.welcomeBonusUsed),
    createdAt: String(raw?.createdAt || new Date().toISOString()),
    lastUpdated: String(raw?.lastUpdated || new Date().toISOString()),
  };

  return { state, needsRepair };
}

async function ensureCreditsWalletState(userId: string): Promise<UserCreditsState> {
  const userCreditsRef = doc(db, `users/${userId}/credits/balance`);
  const snapshot = await getDoc(userCreditsRef);
  if (!snapshot.exists()) {
    const nowIso = new Date().toISOString();
    const initial: UserCreditsState = {
      userId,
      creditsBalance: 0,
      creditsSubscriptionRevocable: 0,
      creditsIapPermanent: 0,
      totalCreditsEarned: 0,
      totalCreditsSpent: 0,
      welcomeBonusUsed: false,
      createdAt: nowIso,
      lastUpdated: nowIso,
    };
    await setDoc(userCreditsRef, initial);
    return initial;
  }

  const { state, needsRepair } = normalizeCreditsState(snapshot.data() as Record<string, any>, userId);
  if (needsRepair) {
    await updateDoc(userCreditsRef, {
      creditsBalance: state.creditsBalance,
      creditsSubscriptionRevocable: state.creditsSubscriptionRevocable,
      creditsIapPermanent: state.creditsIapPermanent,
      totalCreditsEarned: state.totalCreditsEarned,
      totalCreditsSpent: state.totalCreditsSpent,
      welcomeBonusUsed: state.welcomeBonusUsed,
      lastUpdated: serverTimestamp(),
    });
  }

  return state;
}

function getWalletAmount(state: UserCreditsState, source: CreditWalletSource): number {
  return source === 'subscription_revocable'
    ? state.creditsSubscriptionRevocable
    : state.creditsIapPermanent;
}

function resolveWalletForSpend(
  state: UserCreditsState,
  amount: number,
  options?: DeductCreditsOptions,
): CreditWalletSource | null {
  const explicitSource = options?.source;
  if (explicitSource) {
    return getWalletAmount(state, explicitSource) >= amount ? explicitSource : null;
  }

  if (options?.allowAutoSelectSingleWallet === false) {
    return null;
  }

  for (const source of DEFAULT_WALLET_PRIORITY) {
    if (getWalletAmount(state, source) >= amount) {
      return source;
    }
  }

  return null;
}

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
        creditsSubscriptionRevocable: 0,
        creditsIapPermanent: 0,
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
    const state = await ensureCreditsWalletState(userId);
    return state.creditsBalance;
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
    return await ensureCreditsWalletState(userId);
  } catch (error) {
    console.error('Error getting user credits state:', error);
    return null;
  }
}

export async function getUserCreditsWalletBreakdown(userId: string): Promise<WalletBreakdown> {
  const state = await ensureCreditsWalletState(userId);
  return {
    subscriptionRevocable: state.creditsSubscriptionRevocable,
    iapPermanent: state.creditsIapPermanent,
    total: state.creditsBalance,
  };
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
    const state = await ensureCreditsWalletState(userId);
    if (state.welcomeBonusUsed === true) {
      console.log(`Welcome bonus already used or not found for user ${userId}`);
      return false; // Ya fue usado
    }

    const WELCOME_BONUS_AMOUNT = 100;

    // Actualizar balance (SOLO después de confirmar pago)
    await updateDoc(userCreditsRef, {
      creditsBalance: increment(WELCOME_BONUS_AMOUNT),
      creditsIapPermanent: increment(WELCOME_BONUS_AMOUNT),
      totalCreditsEarned: increment(WELCOME_BONUS_AMOUNT),
      welcomeBonusUsed: true,
      lastUpdated: serverTimestamp(),
    });

    // Registrar transacción
    await recordCreditTransaction(userId, 'earn', WELCOME_BONUS_AMOUNT, 'welcome_bonus_payment_confirmed', {
      source: 'iap_permanent',
    });

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
  options?: DeductCreditsOptions,
): Promise<boolean> {
  const cost = getPremiumStoryCost(duration);
  const reason = duration === '30d' ? 'story_premium_30days' : 'story_vip_7days';
  return deductCredits(userId, cost, reason, options);
}

/**
 * Suma créditos manualmente (para reembolsos u otras razones)
 */
export async function addCredits(
  userId: string,
  amount: number,
  reason: string,
  options?: CreditMutationOptions,
): Promise<void> {
  try {
    const userCreditsRef = doc(db, `users/${userId}/credits/balance`);
    const state = await ensureCreditsWalletState(userId);
    const source: CreditWalletSource = options?.source || 'iap_permanent';
    const walletField =
      source === 'subscription_revocable'
        ? 'creditsSubscriptionRevocable'
        : 'creditsIapPermanent';

    await updateDoc(userCreditsRef, {
      creditsBalance: state.creditsBalance + amount,
      [walletField]: getWalletAmount(state, source) + amount,
      totalCreditsEarned: state.totalCreditsEarned + amount,
      lastUpdated: serverTimestamp(),
    });

    await recordCreditTransaction(userId, 'earn', amount, reason, options);
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
  reason: string,
  options?: DeductCreditsOptions,
): Promise<boolean> {
  try {
    const userCreditsRef = doc(db, `users/${userId}/credits/balance`);
    const state = await ensureCreditsWalletState(userId);
    const selectedWallet = resolveWalletForSpend(state, amount, options);
    if (!selectedWallet) {
      console.error(
        `❌ Insufficient credits in a single wallet. Need ${amount}. ` +
          `subscription_revocable=${state.creditsSubscriptionRevocable}, iap_permanent=${state.creditsIapPermanent}`,
      );
      return false;
    }

    const walletField =
      selectedWallet === 'subscription_revocable'
        ? 'creditsSubscriptionRevocable'
        : 'creditsIapPermanent';
    const currentWalletAmount = getWalletAmount(state, selectedWallet);

    // Actualizar balance
    await updateDoc(userCreditsRef, {
      creditsBalance: state.creditsBalance - amount,
      [walletField]: currentWalletAmount - amount,
      totalCreditsSpent: state.totalCreditsSpent + amount,
      lastUpdated: serverTimestamp(),
    });

    // Registrar transacción
    await recordCreditTransaction(userId, 'spend', amount, reason, {
      ...options,
      source: selectedWallet,
    });

    console.log(`✅ Créditos deducidos (${selectedWallet}): ${amount} CS | Razón: ${reason}`);
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
  reason: string,
  options?: CreditMutationOptions,
): Promise<void> {
  try {
    const transactionRef = doc(db, `users/${userId}/credits/transactions/${Date.now()}`);

    await setDoc(transactionRef, {
      type,
      amount,
      reason,
      walletSource: options?.source,
      status: 'active',
      linkedBusinessCardId: options?.linkedBusinessCardId || null,
      linkedAssetKind: options?.linkedAssetKind || null,
      linkedAssetId: options?.linkedAssetId || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error recording credit transaction:', error);
  }
}

export interface BusinessRevocableReconcileResult {
  restoredToSubscription: number;
  revokedAmount: number;
  affectedTransactions: number;
}

/**
 * Mueve transacciones revocables ligadas a una Business Card a estado `dull`.
 * No altera créditos IAP permanentes.
 */
export async function markBusinessLinkedRevocableTransactionsAsDull(
  userId: string,
  businessCardId: string,
): Promise<number> {
  if (!userId || !businessCardId) {
    return 0;
  }

  const txCollectionRef = collection(db, `users/${userId}/credits/transactions`);
  const snapshot = await getDocs(
    query(
      txCollectionRef,
      where('linkedBusinessCardId', '==', businessCardId),
      where('walletSource', '==', 'subscription_revocable'),
      where('status', '==', 'active'),
    ),
  );

  let affected = 0;
  for (const row of snapshot.docs) {
    await updateDoc(doc(db, `users/${userId}/credits/transactions/${row.id}`), {
      status: 'dull',
      dullAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
    });
    affected += 1;
  }

  return affected;
}

/**
 * Reconciliación de créditos revocables al entrar/salir de Dull:
 * - revoke=true: remueve saldo revocable disponible y lo registra como hold.
 * - revoke=false: restaura hold al wallet revocable.
 */
export async function reconcileBusinessRevocableCreditsForDull(params: {
  userId: string;
  businessCardId: string;
  revoke: boolean;
}): Promise<BusinessRevocableReconcileResult> {
  const { userId, businessCardId, revoke } = params;
  if (!userId || !businessCardId) {
    return { restoredToSubscription: 0, revokedAmount: 0, affectedTransactions: 0 };
  }

  const state = await ensureCreditsWalletState(userId);
  const holdRef = doc(db, `users/${userId}/credits/revocable_holds/${businessCardId}`);
  const holdSnap = await getDoc(holdRef);
  const heldAmount = holdSnap.exists() ? toSafeNumber((holdSnap.data() as any).amount) : 0;

  if (revoke) {
    const revokeAmount = state.creditsSubscriptionRevocable;
    const affected = await markBusinessLinkedRevocableTransactionsAsDull(userId, businessCardId);
    if (revokeAmount > 0) {
      await updateDoc(doc(db, `users/${userId}/credits/balance`), {
        creditsSubscriptionRevocable: state.creditsSubscriptionRevocable - revokeAmount,
        creditsBalance: state.creditsBalance - revokeAmount,
        lastUpdated: serverTimestamp(),
      });
    }
    await setDoc(holdRef, {
      businessCardId,
      amount: heldAmount + revokeAmount,
      status: 'held',
      updatedAt: serverTimestamp(),
      createdAt: holdSnap.exists() ? (holdSnap.data() as any).createdAt || serverTimestamp() : serverTimestamp(),
    }, { merge: true });

    return {
      restoredToSubscription: 0,
      revokedAmount: revokeAmount,
      affectedTransactions: affected,
    };
  }

  if (heldAmount <= 0) {
    return { restoredToSubscription: 0, revokedAmount: 0, affectedTransactions: 0 };
  }

  const txCollectionRef = collection(db, `users/${userId}/credits/transactions`);
  const dullSnapshot = await getDocs(
    query(
      txCollectionRef,
      where('linkedBusinessCardId', '==', businessCardId),
      where('walletSource', '==', 'subscription_revocable'),
      where('status', '==', 'dull'),
    ),
  );
  let affected = 0;
  for (const row of dullSnapshot.docs) {
    await updateDoc(doc(db, `users/${userId}/credits/transactions/${row.id}`), {
      status: 'active',
      restoredAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
    });
    affected += 1;
  }

  await updateDoc(doc(db, `users/${userId}/credits/balance`), {
    creditsSubscriptionRevocable: state.creditsSubscriptionRevocable + heldAmount,
    creditsBalance: state.creditsBalance + heldAmount,
    lastUpdated: serverTimestamp(),
  });
  await setDoc(holdRef, {
    status: 'released',
    amount: 0,
    releasedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return {
    restoredToSubscription: heldAmount,
    revokedAmount: 0,
    affectedTransactions: affected,
  };
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
