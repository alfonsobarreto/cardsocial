import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export type ComplianceUser = {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  nickname?: string;
  createdAt?: unknown;
  tosAcceptedAt?: unknown;
  privacyAcceptedAt?: unknown;
  termsAcceptedAt?: unknown;
  acceptableUseAcceptedAt?: unknown;
  legalConsentBundleVersion?: string;
  isDeleted?: boolean;
  raw: Record<string, unknown>;
};

export type LegalConsentEvent = {
  id: string;
  eventType: string;
  uid: string;
  acceptedAt?: unknown;
  createdAt?: unknown;
  legalConsentBundleVersion?: string;
  locale?: string;
  appLanguage?: string;
  timezone?: string;
  platform?: string;
  source?: string;
  hashAlgorithm?: string;
  canonicalization?: string;
  termsHash?: string;
  privacyHash?: string;
  usageHash?: string;
  bundleHash?: string;
  legalTextSnapshot?: Record<string, unknown>;
  acceptedDocuments?: Record<string, unknown>;
  raw: Record<string, unknown>;
};

function pickString(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}

function normalizeUser(uid: string, data: Record<string, unknown>): ComplianceUser {
  const nickname = pickString(data, ['userNickName', 'nickname']);
  return {
    uid,
    email: pickString(data, ['emailLower', 'email', 'userEmail']),
    displayName: pickString(data, ['userFullName', 'fullName', 'displayName', 'name']) || nickname || uid,
    phoneNumber: pickString(data, ['phoneNumber', 'phone', 'phoneNormalized', 'mobile']),
    nickname: nickname || undefined,
    createdAt: data.createdAt,
    tosAcceptedAt: data.tosAcceptedAt,
    privacyAcceptedAt: data.privacyAcceptedAt,
    termsAcceptedAt: data.termsAcceptedAt,
    acceptableUseAcceptedAt: data.acceptableUseAcceptedAt,
    legalConsentBundleVersion:
      typeof data.legalConsentBundleVersion === 'string' ? data.legalConsentBundleVersion.trim() || undefined : undefined,
    isDeleted: Boolean(data.isDeleted),
    raw: data,
  };
}

function normalizeLegalConsentEvent(id: string, data: Record<string, unknown>): LegalConsentEvent {
  return {
    id,
    eventType: pickString(data, ['eventType']) || 'LEGAL_CONSENT_ACCEPTED',
    uid: pickString(data, ['uid']),
    acceptedAt: data.acceptedAt,
    createdAt: data.createdAt,
    legalConsentBundleVersion:
      typeof data.legalConsentBundleVersion === 'string' ? data.legalConsentBundleVersion.trim() || undefined : undefined,
    locale: pickString(data, ['locale']),
    appLanguage: pickString(data, ['appLanguage']),
    timezone: pickString(data, ['timezone']),
    platform: pickString(data, ['platform']),
    source: pickString(data, ['source']),
    hashAlgorithm: pickString(data, ['hashAlgorithm']),
    canonicalization: pickString(data, ['canonicalization']),
    termsHash: pickString(data, ['termsHash']),
    privacyHash: pickString(data, ['privacyHash']),
    usageHash: pickString(data, ['usageHash']),
    bundleHash: pickString(data, ['bundleHash']),
    legalTextSnapshot:
      data.legalTextSnapshot && typeof data.legalTextSnapshot === 'object'
        ? (data.legalTextSnapshot as Record<string, unknown>)
        : undefined,
    acceptedDocuments:
      data.acceptedDocuments && typeof data.acceptedDocuments === 'object'
        ? (data.acceptedDocuments as Record<string, unknown>)
        : undefined,
    raw: data,
  };
}

export async function findComplianceUser(search: string): Promise<ComplianceUser | null> {
  const termRaw = search.trim();
  if (!termRaw) return null;

  const term = termRaw.replace(/^@+/, '');
  const lower = term.toLowerCase();

  if (lower.includes('@')) {
    const exactEmail = lower;
    const candidates = [
      query(collection(db, 'users'), where('email', '==', exactEmail), limit(1)),
      query(collection(db, 'users'), where('emailLower', '==', exactEmail), limit(1)),
      query(collection(db, 'users'), where('userEmail', '==', exactEmail), limit(1)),
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

  /** Posible UID de Firebase (nick nunca llega a 20+, pero evitamos colisión rara comprobando documento primero). */
  const uidLike = /^[A-Za-z0-9]{20,}$/.test(termRaw) && termRaw.length <= 128;
  if (uidLike) {
    const uidSnap = await getDoc(doc(db, 'users', termRaw));
    if (uidSnap.exists()) return normalizeUser(uidSnap.id, uidSnap.data() as Record<string, unknown>);
  }

  const nicknameQueries = [
    query(collection(db, 'users'), where('nicknameLower', '==', lower), limit(1)),
    query(collection(db, 'users'), where('userNickNameLower', '==', lower), limit(1)),
  ];

  for (const q of nicknameQueries) {
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const match = snapshot.docs[0];
      return normalizeUser(match.id, match.data() as Record<string, unknown>);
    }
  }

  return null;
}

export async function getUserExportData(uid: string) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    throw new Error('Usuario no encontrado');
  }

  const legalConsentEvents = await listLegalConsentEvents(uid);

  return {
    exportedAt: new Date().toISOString(),
    uid,
    user: snap.data(),
    legalConsentEvents,
  };
}

export async function listLegalConsentEvents(uid: string): Promise<LegalConsentEvent[]> {
  const snapshot = await getDocs(collection(db, 'users', uid, 'legalConsentEvents'));
  return snapshot.docs
    .map((eventDoc) => normalizeLegalConsentEvent(eventDoc.id, eventDoc.data() as Record<string, unknown>))
    .sort((a, b) => {
      const aMs = valueToMs(a.acceptedAt || a.createdAt);
      const bMs = valueToMs(b.acceptedAt || b.createdAt);
      return bMs - aMs;
    });
}

function valueToMs(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  if (typeof value === 'object' && value && 'seconds' in value && typeof value.seconds === 'number') {
    return value.seconds * 1000;
  }
  return 0;
}

export function downloadUserDataJson(uid: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `card-social-user-export-${uid}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function executeLegalDeletion(params: {
  uid: string;
  requestedByEmail: string;
  executedByAdmin: string;
}) {
  const userRef = doc(db, 'users', params.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    throw new Error('Usuario no encontrado');
  }

  const userData = userSnap.data() as Record<string, unknown>;
  const requestedByEmail =
    params.requestedByEmail || pickString(userData, ['email', 'userEmail']) || 'unknown-requester';
  const auditRef = doc(collection(db, 'legal_audit_logs'));
  const batch = writeBatch(db);

  batch.set(auditRef, {
    action: 'LEGAL_DELETION_GDPR_CCPA',
    deletedUid: params.uid,
    requestedByEmail,
    executedByAdmin: params.executedByAdmin,
    previousEmail: pickString(userData, ['email', 'userEmail']) || null,
    previousPhoneNumber: pickString(userData, ['phoneNumber', 'phone', 'mobile']) || null,
    timestamp: serverTimestamp(),
  });

  batch.set(
    userRef,
    {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      deletedByAdmin: params.executedByAdmin,
      legalDeletionRequestedByEmail: requestedByEmail,
      email: null,
      userEmail: null,
      phoneNumber: null,
      phone: null,
      displayName: 'Deleted User',
      fullName: null,
      userFullName: null,
      photoURL: null,
      avatarUrl: null,
      bio: null,
      publicHidden: true,
      anonymizedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
}
