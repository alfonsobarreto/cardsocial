import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export type RiskUser = {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  isVerified: boolean;
  verifiedAt?: unknown;
};

export type BannedIdentity = {
  id: string;
  email: string;
  phoneNumber: string;
  reason?: string;
  createdBy: string;
  createdAt?: unknown;
};

function pickString(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}

function normalizeUser(uid: string, data: Record<string, unknown>): RiskUser {
  return {
    uid,
    email: pickString(data, ['email', 'userEmail']),
    displayName:
      pickString(data, ['displayName', 'fullName', 'userFullName', 'name', 'userName', 'nickname']) || uid,
    phoneNumber: pickString(data, ['phoneNumber', 'phone', 'mobile']),
    isVerified: Boolean(data.isVerified),
    verifiedAt: data.verifiedAt,
  };
}

function blacklistDocId(email: string) {
  return email.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_') || `identity_${Date.now()}`;
}

export async function findRiskUser(search: string): Promise<RiskUser | null> {
  const term = search.trim();
  if (!term) return null;

  if (!term.includes('@')) {
    const snapshot = await getDoc(doc(db, 'users', term));
    return snapshot.exists() ? normalizeUser(snapshot.id, snapshot.data() as Record<string, unknown>) : null;
  }

  const email = term.toLowerCase();
  const candidates = [
    query(collection(db, 'users'), where('email', '==', email), limit(1)),
    query(collection(db, 'users'), where('userEmail', '==', email), limit(1)),
  ];

  for (const candidate of candidates) {
    const snapshot = await getDocs(candidate);
    if (!snapshot.empty) {
      const match = snapshot.docs[0];
      return normalizeUser(match.id, match.data() as Record<string, unknown>);
    }
  }

  return null;
}

export async function setUserVerification(uid: string, isVerified: boolean, adminEmail: string) {
  await updateDoc(doc(db, 'users', uid), {
    isVerified,
    verifiedAt: isVerified ? serverTimestamp() : null,
    verifiedBy: isVerified ? adminEmail : null,
    verificationRevokedAt: isVerified ? null : serverTimestamp(),
    verificationRevokedBy: isVerified ? null : adminEmail,
  });
}

export async function getBannedIdentities(): Promise<BannedIdentity[]> {
  const snapshot = await getDocs(collection(db, 'banned_identities'));

  return snapshot.docs.map((item) => {
    const data = item.data() as Record<string, unknown>;
    return {
      id: item.id,
      email: pickString(data, ['email']),
      phoneNumber: pickString(data, ['phoneNumber']),
      reason: pickString(data, ['reason']),
      createdBy: pickString(data, ['createdBy', 'executedByAdmin']) || 'unknown-admin',
      createdAt: data.createdAt,
    };
  });
}

export async function addBannedIdentity(params: {
  email: string;
  phoneNumber?: string;
  reason?: string;
  createdBy: string;
}) {
  const email = params.email.trim().toLowerCase();
  if (!email) throw new Error('Email is required');

  await setDoc(doc(db, 'banned_identities', blacklistDocId(email)), {
    email,
    phoneNumber: params.phoneNumber?.trim() || null,
    reason: params.reason?.trim() || 'Proactive blacklist',
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
    source: 'admin_web_identity_risk',
  });
}

export async function removeBannedIdentity(id: string) {
  await deleteDoc(doc(db, 'banned_identities', id));
}
