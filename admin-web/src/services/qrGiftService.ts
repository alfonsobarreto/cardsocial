import {
  Timestamp,
  collection,
  getDocs,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export type QRGiftStatus = 'active' | 'expired' | 'depleted';

export type QRGift = {
  id: string;
  createdBy: string;
  createdByEmail?: string;
  creditsPerUse: number;
  monthsPerUse: number;
  maxUses: number;
  isUnlimited: boolean;
  originalCreditsPool: number;
  redeemedUsers: string[];
  expiresAt: Timestamp | null;
  maxExpiresIn: number;
  createdAt?: Timestamp | Date | { toDate?: () => Date; seconds?: number } | null;
  status: QRGiftStatus;
  usageCount: number;
  qrCode: string;
};

export type CreateQRGiftInput = {
  createdBy: string;
  createdByEmail?: string | null;
  creditsPerUse: number;
  monthsPerUse: number;
  maxUses: number;
  expiresInDays: number;
};

const QR_GIFTS_COLLECTION = collection(db, 'qr_gifts');

function randomGiftId(): string {
  const suffix =
    globalThis.crypto?.randomUUID?.().slice(0, 8) ??
    Math.random().toString(36).slice(2, 10);

  return `gift_${Date.now()}_${suffix}`;
}

function toMillis(value: QRGift['createdAt']) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function normalizeGift(id: string, data: Partial<QRGift>): QRGift {
  return {
    id,
    createdBy: String(data.createdBy ?? ''),
    createdByEmail: data.createdByEmail ? String(data.createdByEmail) : undefined,
    creditsPerUse: Math.max(0, Number(data.creditsPerUse) || 0),
    monthsPerUse: Math.max(0, Number(data.monthsPerUse) || 0),
    maxUses: Math.max(0, Number(data.maxUses) || 0),
    isUnlimited: data.isUnlimited === true,
    originalCreditsPool: Math.max(0, Number(data.originalCreditsPool) || 0),
    redeemedUsers: Array.isArray(data.redeemedUsers) ? data.redeemedUsers.map(String) : [],
    expiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt : null,
    maxExpiresIn: Math.max(0, Number(data.maxExpiresIn) || 0),
    createdAt: data.createdAt,
    status: data.status === 'expired' || data.status === 'depleted' ? data.status : 'active',
    usageCount: Math.max(0, Number(data.usageCount) || 0),
    qrCode: String(data.qrCode ?? `cardsocial://redeem?code=${id}`),
  };
}

export async function getQRGifts(): Promise<QRGift[]> {
  const snapshot = await getDocs(QR_GIFTS_COLLECTION);

  return snapshot.docs
    .map((item) => normalizeGift(item.id, item.data() as Partial<QRGift>))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function createQRGift(input: CreateQRGiftInput): Promise<QRGift> {
  if (input.monthsPerUse > 3) {
    throw new Error('Máximo 3 meses por regalo');
  }

  if (input.maxUses > 500) {
    throw new Error('Máximo 500 personas por código');
  }

  if (input.expiresInDays > 90) {
    throw new Error('Máximo 90 días de vigencia');
  }

  const giftId = randomGiftId();
  const creditsPerUse = Math.max(0, Math.floor(input.creditsPerUse));
  const monthsPerUse = Math.max(0, Math.floor(input.monthsPerUse));
  const maxUses = Math.max(1, Math.floor(input.maxUses));
  const expiresInDays = Math.max(0, Math.floor(input.expiresInDays));
  const originalCreditsPool = creditsPerUse * maxUses;
  const expiresAt = expiresInDays
    ? Timestamp.fromDate(new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000))
    : null;

  const gift: QRGift = {
    id: giftId,
    createdBy: input.createdBy,
    createdByEmail: input.createdByEmail ?? undefined,
    creditsPerUse,
    monthsPerUse,
    maxUses,
    isUnlimited: maxUses === 500 && expiresInDays === 90,
    originalCreditsPool,
    redeemedUsers: [],
    expiresAt,
    maxExpiresIn: expiresInDays * 24 * 60 * 60 * 1000,
    createdAt: serverTimestamp() as QRGift['createdAt'],
    status: 'active',
    usageCount: 0,
    qrCode: `cardsocial://redeem?code=${giftId}`,
  };

  await setDoc(doc(db, 'qr_gifts', giftId), gift);

  await setDoc(doc(db, 'admin_audit', `audit_${Date.now()}_${giftId}`), {
    action: 'QR_GIFT_CREATED',
    actor: input.createdBy,
    actorEmail: input.createdByEmail ?? null,
    giftId,
    creditsPerUse,
    creditsPool: originalCreditsPool,
    creditsDeducted: 0,
    noBalanceDeduction: true,
    monthsPerUse,
    maxUses,
    expiresInDays,
    timestamp: serverTimestamp(),
  });

  return gift;
}
