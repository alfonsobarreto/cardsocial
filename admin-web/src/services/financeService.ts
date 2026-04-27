import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export type ActiveSubscription = {
  id: string;
  email: string;
  tier: string;
  premiumUntil?: unknown;
};

export type FinanceSummary = {
  activeSubscriptionsCount: number;
};

export type CsLedgerEvent = {
  id: string;
  date?: unknown;
  action: string;
  amountCs: number;
  actor: string;
};

function pickString(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}

function toMillis(value: unknown) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  if (typeof value === 'object' && value && 'seconds' in value && typeof value.seconds === 'number') {
    return value.seconds * 1000;
  }
  return 0;
}

export async function getFinanceSummary(): Promise<FinanceSummary> {
  const activeQuery = query(collection(db, 'users'), where('subscriptionStatus', '==', 'active'));
  const snapshot = await getCountFromServer(activeQuery);

  return {
    activeSubscriptionsCount: snapshot.data().count,
  };
}

export async function getActiveSubscriptions(): Promise<ActiveSubscription[]> {
  const snapshot = await getDocs(query(collection(db, 'users'), where('subscriptionStatus', '==', 'active')));

  return snapshot.docs.map((item) => {
    const data = item.data() as Record<string, unknown>;
    return {
      id: item.id,
      email: pickString(data, ['email', 'userEmail']) || item.id,
      tier: pickString(data, ['tier', 'currentTier', 'subscriptionTier', 'plan']) || 'active',
      premiumUntil: data.premiumUntil ?? data.subscriptionExpiresAt ?? null,
    };
  });
}

export async function getCsLedgerEvents(): Promise<CsLedgerEvent[]> {
  const [auditSnapshot, redemptionSnapshot] = await Promise.all([
    getDocs(query(collection(db, 'admin_audit'), orderBy('timestamp', 'desc'), limit(20))),
    getDocs(query(collection(db, 'redemption_logs'), orderBy('redeemedAt', 'desc'), limit(20))),
  ]);

  const auditEvents: CsLedgerEvent[] = auditSnapshot.docs.map((item) => {
    const data = item.data() as Record<string, unknown>;
    const amount = Number(data.creditsPool ?? data.creditsDeducted ?? data.creditsPerUse ?? 0) || 0;
    return {
      id: item.id,
      date: data.timestamp,
      action: 'QR Creado',
      amountCs: amount,
      actor: pickString(data, ['actorEmail', 'actor', 'createdBy']) || 'admin',
    };
  });

  const redemptionEvents: CsLedgerEvent[] = redemptionSnapshot.docs.map((item) => {
    const data = item.data() as Record<string, unknown>;
    return {
      id: item.id,
      date: data.redeemedAt,
      action: 'QR Canjeado',
      amountCs: Number(data.creditsAwarded || 0) || 0,
      actor: pickString(data, ['redeemedBy', 'userId']) || 'usuario',
    };
  });

  return [...auditEvents, ...redemptionEvents]
    .sort((a, b) => toMillis(b.date) - toMillis(a.date))
    .slice(0, 20);
}
