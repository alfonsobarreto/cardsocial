import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export type GlobalAnnouncement = {
  title: string;
  message: string;
  targetUrl: string;
  isActive: boolean;
  updatedAt?: unknown;
};

export type Affiliate = {
  id: string;
  creatorEmail: string;
  referralCode: string;
  commissionPercent: number;
  clicks: number;
  signups: number;
  createdAt?: Date | { toDate?: () => Date; seconds?: number } | null;
};

export type CreateAffiliateInput = {
  creatorEmail: string;
  referralCode: string;
  commissionPercent: number;
};

const MAIN_CONFIG_REF = doc(db, 'system_config', 'main');
const AFFILIATES = collection(db, 'affiliates');

function normalizeReferralCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
}

function toMillis(value: Affiliate['createdAt']) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

export async function getGlobalAnnouncement(): Promise<GlobalAnnouncement> {
  const snapshot = await getDoc(MAIN_CONFIG_REF);
  const data = snapshot.exists() ? snapshot.data() : {};
  const announcement = (data.globalAnnouncement || data.announcement || {}) as Partial<GlobalAnnouncement>;

  return {
    title: String(announcement.title || data.announcementTitle || ''),
    message: String(announcement.message || data.announcementMessage || ''),
    targetUrl: String(announcement.targetUrl || data.announcementTargetUrl || ''),
    isActive: Boolean(announcement.isActive ?? data.showAnnouncement ?? false),
    updatedAt: announcement.updatedAt || data.updatedAt,
  };
}

export async function updateGlobalAnnouncement(input: GlobalAnnouncement): Promise<void> {
  await setDoc(
    MAIN_CONFIG_REF,
    {
      globalAnnouncement: {
        title: input.title.trim(),
        message: input.message.trim(),
        targetUrl: input.targetUrl.trim(),
        isActive: input.isActive,
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function normalizeAffiliate(id: string, data: Partial<Affiliate>): Affiliate {
  return {
    id,
    creatorEmail: String(data.creatorEmail || ''),
    referralCode: String(data.referralCode || ''),
    commissionPercent: Math.max(0, Number(data.commissionPercent) || 0),
    clicks: Math.max(0, Number(data.clicks) || 0),
    signups: Math.max(0, Number(data.signups) || 0),
    createdAt: data.createdAt,
  };
}

export async function getAffiliates(): Promise<Affiliate[]> {
  const snapshot = await getDocs(AFFILIATES);

  return snapshot.docs
    .map((item) => normalizeAffiliate(item.id, item.data() as Partial<Affiliate>))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function createAffiliate(input: CreateAffiliateInput): Promise<string> {
  const referralCode = normalizeReferralCode(input.referralCode);
  if (!referralCode) {
    throw new Error('Referral code is required');
  }

  const docRef = await addDoc(AFFILIATES, {
    creatorEmail: input.creatorEmail.trim().toLowerCase(),
    referralCode,
    commissionPercent: Math.max(0, Number(input.commissionPercent) || 0),
    clicks: 0,
    signups: 0,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}
