import { db } from '@/services/firebaseConfig';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  increment,
  serverTimestamp,
  Timestamp,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
} from 'firebase/firestore';

export interface QRGift {
  id: string;
  createdBy: string; // Pochobs UID
  creditsPerUse: number;
  monthsPerUse: number;
  maxUses: number;
  isUnlimited: boolean;
  originalCreditsPool: number; // Total deducido del balance de Alfonso
  redeemedUsers: string[]; // UIDs que ya canjearon
  expiresAt: Timestamp | null; // null si infinito
  maxExpiresIn: number; // Máximo 3 meses (90 días en ms)
  createdAt: Timestamp;
  status: 'active' | 'expired' | 'depleted';
  usageCount: number;
  qrCode: string; // La URL encoded del QR
}

export interface RedemptionLog {
  id: string;
  giftId: string; // Referencia al código QR
  redeemedBy: string; // UID del usuario que canjea
  redeemedAt: Timestamp;
  creditsAwarded: number;
  monthsAwarded: number;
  redemptionType: 'app_open' | 'post_registration';
}

/**
 * Genera un QR gift único para Alfonso (Pochobs)
 * Realiza deducción INMEDIATA de su balance
 */
export async function generateQRGift(
  pochobsUid: string,
  creditsPerUse: number,
  monthsPerUse: number,
  maxUses: number,
  expiresInDays: number // Máximo 3 (90 días)
): Promise<QRGift> {
  // Validar límites
  if (monthsPerUse > 3) {
    throw new Error('Máximo 3 meses por regalo');
  }
  if (maxUses > 500) {
    throw new Error('Máximo 500 personas por código');
  }

  // Calcular pool total
  const totalPool = creditsPerUse * maxUses;

  // Verificar balance de Pochobs
  const userDoc = await getDoc(doc(db, 'users', pochobsUid));
  const currentBalance = userDoc.data()?.creditsBalance || 0;

  if (currentBalance < totalPool) {
    throw new Error(`Saldo insuficiente. Tienes ${currentBalance} CS, necesitas ${totalPool}`);
  }

  // Generar ID único para el QR
  const giftId = `gift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Crear objeto QR Gift
  const qrGiftData: QRGift = {
    id: giftId,
    createdBy: pochobsUid,
    creditsPerUse,
    monthsPerUse,
    maxUses,
    isUnlimited: maxUses === 500 && expiresInDays === 90, // Si es máximo, considerarlo "evento"
    originalCreditsPool: totalPool,
    redeemedUsers: [],
    expiresAt: expiresInDays
      ? Timestamp.fromDate(new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000))
      : null,
    maxExpiresIn: expiresInDays * 24 * 60 * 60 * 1000,
    createdAt: serverTimestamp() as Timestamp,
    status: 'active',
    usageCount: 0,
    qrCode: `cardsocial://redeem?code=${giftId}`,
  };

  // Guardar en Firestore
  await setDoc(doc(db, 'qr_gifts', giftId), qrGiftData);

  // DEDUCCIÓN INMEDIATA del balance de Pochobs
  await updateDoc(doc(db, 'users', pochobsUid), {
    creditsBalance: increment(-totalPool),
  });

  // Registrar en Audit Log
  await setDoc(doc(db, 'admin_audit', `audit_${Date.now()}`), {
    action: 'QR_GIFT_CREATED',
    actor: pochobsUid,
    giftId,
    creditsDeducted: totalPool,
    maxUses,
    expiresInDays,
    timestamp: serverTimestamp(),
  });

  return qrGiftData;
}

/**
 * Canjear un código QR regalo
 * Aplica créditos + meses premium al usuario
 */
export async function redeemQRGift(giftId: string, userId: string): Promise<boolean> {
  try {
    // Obtener el documento del regalo
    const giftDoc = await getDoc(doc(db, 'qr_gifts', giftId));
    if (!giftDoc.exists()) {
      throw new Error('Código de regalo inválido');
    }

    const gift = giftDoc.data() as QRGift;

    // Validaciones
    if (gift.status !== 'active') {
      throw new Error('Este código ya no está disponible');
    }

    if (gift.redeemedUsers.includes(userId)) {
      throw new Error('Ya has canjeado este regalo');
    }

    if (gift.usageCount >= gift.maxUses) {
      throw new Error('Este código ha alcanzado su límite de usos');
    }

    if (gift.expiresAt && Timestamp.now() > gift.expiresAt) {
      // Marcar como expirado
      await updateDoc(doc(db, 'qr_gifts', giftId), { status: 'expired' });
      throw new Error('Este código ha expirado');
    }

    // Aplicar créditos y premium al usuario
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error('Usuario no encontrado');
    }

    // Calcular nueva fecha de suscripción
    const now = new Date();
    let newPremiumUntil = userDoc.data()?.premiumUntil
      ? new Date(userDoc.data().premiumUntil)
      : now;

    if (newPremiumUntil < now) {
      newPremiumUntil = now;
    }

    newPremiumUntil.setMonth(newPremiumUntil.getMonth() + gift.monthsPerUse);

    // Actualizar usuario
    await updateDoc(userRef, {
      creditsBalance: increment(gift.creditsPerUse),
      premiumUntil: newPremiumUntil.toISOString(),
      subscriptionStatus: 'active',
    });

    // Actualizar regalo: agregar usuario a redeemedUsers
    const newUsageCount = gift.usageCount + 1;
    const newStatus = newUsageCount >= gift.maxUses ? 'depleted' : 'active';

    await updateDoc(doc(db, 'qr_gifts', giftId), {
      redeemedUsers: arrayUnion(userId),
      usageCount: newUsageCount,
      status: newStatus,
    });

    // Registrar en redemption log
    await setDoc(doc(db, 'redemption_logs', `redemption_${Date.now()}_${userId}`), {
      giftId,
      redeemedBy: userId,
      redeemedAt: serverTimestamp(),
      creditsAwarded: gift.creditsPerUse,
      monthsAwarded: gift.monthsPerUse,
      redemptionType: 'app_open',
    } as RedemptionLog);

    return true;
  } catch (error) {
    console.error('Error redeeming QR gift:', error);
    throw error;
  }
}

/**
 * Obtener historial de QR generados por Pochobs
 */
export async function getQRHistory(pochobsUid: string): Promise<QRGift[]> {
  try {
    const q = query(
      collection(db, 'qr_gifts'),
      where('createdBy', '==', pochobsUid)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as QRGift);
  } catch (error) {
    console.error('Error fetching QR history:', error);
    return [];
  }
}

/**
 * Obtener audit log (solo para super_admin)
 */
export async function getAuditLog(limit: number = 50): Promise<any[]> {
  try {
    const q = query(
      collection(db, 'admin_audit'),
      where('action', '==', 'QR_GIFT_CREATED')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((doc) => doc.data())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    return [];
  }
}
