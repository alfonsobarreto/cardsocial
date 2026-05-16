import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';

import { db } from '../config/firebase';

export const SYSTEM_BROADCAST_TEMPLATE_IDS = ['SYS_GLOBAL_MAINTENANCE', 'SYS_GLOBAL_PROMO'] as const;

export type SystemBroadcastTemplateId = (typeof SYSTEM_BROADCAST_TEMPLATE_IDS)[number];

export type SystemBroadcast = {
  id: string;
  templateId: string;
  isActive: boolean;
  createdAt: Date | null;
  expiresAt: Date | null;
};

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof (v as Timestamp).toDate === 'function') {
    try {
      return (v as Timestamp).toDate();
    } catch {
      return null;
    }
  }
  if (typeof v === 'object' && v !== null && 'seconds' in v && typeof (v as { seconds: unknown }).seconds === 'number') {
    return new Date((v as { seconds: number; nanoseconds?: number }).seconds * 1000);
  }
  return null;
}

function normalizeBroadcast(id: string, data: Record<string, unknown>): SystemBroadcast {
  return {
    id,
    templateId: String(data.templateId || ''),
    isActive: Boolean(data.isActive),
    createdAt: toDate(data.createdAt),
    expiresAt: data.expiresAt == null ? null : toDate(data.expiresAt),
  };
}

export async function createSystemBroadcast(input: {
  templateId: SystemBroadcastTemplateId;
  expiresAt?: Date | null;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'system_broadcasts'), {
    templateId: input.templateId,
    isActive: true,
    createdAt: serverTimestamp(),
    expiresAt: input.expiresAt ?? null,
  });
  return ref.id;
}

export async function listSystemBroadcasts(): Promise<SystemBroadcast[]> {
  const q = query(collection(db, 'system_broadcasts'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeBroadcast(d.id, d.data() as Record<string, unknown>));
}

export async function deactivateSystemBroadcast(broadcastId: string): Promise<void> {
  await updateDoc(doc(db, 'system_broadcasts', broadcastId), { isActive: false });
}
