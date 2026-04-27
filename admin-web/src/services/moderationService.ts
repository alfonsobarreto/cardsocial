import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

export type ModerationReport = {
  id: string;
  type: 'card' | 'profile' | 'support' | string;
  status: ReportStatus;
  reportedUserId?: string;
  reporterUserId?: string;
  targetCardId?: string;
  sourceCollection?: 'reports' | 'userReports';
  reason: string;
  details?: string;
  createdAt?: Date | string | { toDate?: () => Date; seconds?: number } | null;
  reviewedBy?: string;
  reviewedAt?: Date | string | { toDate?: () => Date; seconds?: number } | null;
  banReason?: string;
  reportedUser?: ModerationUserProfile | null;
};

type ReportDocument = Omit<ModerationReport, 'id'>;
type LegacyUserReportDocument = Partial<ReportDocument> & {
  targetIssuerUid?: string;
  targetSidOrBId?: string;
  text?: string;
};

export type ModerationUserProfile = {
  uid: string;
  displayName: string;
  email: string;
  phoneNumber: string;
  photoURL?: string;
  isBanned?: boolean;
  isDeleted?: boolean;
  warnings?: number;
  raw: Record<string, unknown>;
};

export type ModerationVaultItem = {
  id: string;
  source: string;
  title: string;
  type?: string;
  value?: string;
  url?: string;
  imageUrl?: string;
  raw: Record<string, unknown>;
};

export type UserInvestigation = {
  profile: ModerationUserProfile | null;
  links: ModerationVaultItem[];
  iconVault: ModerationVaultItem[];
  vault: ModerationVaultItem[];
};

function normalizeReport(
  id: string,
  data: Partial<ReportDocument> | LegacyUserReportDocument,
  sourceCollection: 'reports' | 'userReports' = 'reports',
): ModerationReport {
  const legacy = data as LegacyUserReportDocument;

  return {
    id,
    type: sourceCollection === 'userReports' ? 'card' : data.type || 'support',
    status: data.status || 'pending',
    reportedUserId: data.reportedUserId || legacy.targetIssuerUid,
    reporterUserId: data.reporterUserId,
    targetCardId: data.targetCardId || legacy.targetSidOrBId,
    sourceCollection,
    reason: data.reason || (sourceCollection === 'userReports' ? 'Reporte de tarjeta' : 'Sin motivo registrado'),
    details: data.details || legacy.text,
    createdAt: data.createdAt,
    reviewedBy: data.reviewedBy,
    reviewedAt: data.reviewedAt,
    banReason: data.banReason,
    reportedUser: data.reportedUser,
  };
}

function pickString(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}

function normalizeUserProfile(uid: string, data: Record<string, unknown>): ModerationUserProfile {
  return {
    uid,
    displayName:
      pickString(data, ['displayName', 'fullName', 'userFullName', 'name', 'userName', 'nickname']) || uid,
    email: pickString(data, ['email', 'userEmail']),
    phoneNumber: pickString(data, ['phoneNumber', 'phone', 'mobile']),
    photoURL: pickString(data, ['photoURL', 'avatarUrl', 'profileImageUrl']),
    isBanned: Boolean(data.isBanned),
    isDeleted: Boolean(data.isDeleted),
    warnings: Number(data.warnings || 0),
    raw: data,
  };
}

function normalizeVaultItem(id: string, source: string, data: Record<string, unknown>): ModerationVaultItem {
  return {
    id,
    source,
    title: pickString(data, ['title', 'label', 'name', 'displayName']) || id,
    type: pickString(data, ['type', 'kind', 'category']),
    value: pickString(data, ['value', 'text', 'inputData', 'content', 'description']),
    url: pickString(data, ['url', 'href', 'link', 'publicUrl']),
    imageUrl: pickString(data, ['imageUrl', 'photoURL', 'iconUrl', 'thumbnailUrl', 'fileUrl']),
    raw: data,
  };
}

function toMillis(value: ModerationReport['createdAt']) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

export async function listReports(): Promise<ModerationReport[]> {
  const [reportsSnapshot, legacyReportsSnapshot] = await Promise.all([
    getDocs(collection(db, 'reports')),
    getDocs(collection(db, 'userReports')),
  ]);

  const reports = [
    ...reportsSnapshot.docs.map((item) =>
      normalizeReport(item.id, item.data() as Partial<ReportDocument>, 'reports'),
    ),
    ...legacyReportsSnapshot.docs.map((item) =>
      normalizeReport(`userReports:${item.id}`, item.data() as LegacyUserReportDocument, 'userReports'),
    ),
  ]
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

  const userIds = Array.from(new Set(reports.map((report) => report.reportedUserId).filter(Boolean)));
  const usersById = new Map<string, ModerationUserProfile | null>();

  await Promise.all(
    userIds.map(async (uid) => {
      if (!uid) return;
      usersById.set(uid, await getUserProfile(uid));
    }),
  );

  return reports.map((report) => ({
    ...report,
    reportedUser: report.reportedUserId ? usersById.get(report.reportedUserId) ?? null : null,
  }));
}

export async function getUserProfile(uid: string): Promise<ModerationUserProfile | null> {
  const snapshot = await getDoc(doc(db, 'users', uid));
  if (!snapshot.exists()) return null;
  return normalizeUserProfile(uid, snapshot.data() as Record<string, unknown>);
}

async function listUserSubcollection(uid: string, source: string): Promise<ModerationVaultItem[]> {
  try {
    const snapshot = await getDocs(collection(db, 'users', uid, source));
    return snapshot.docs.map((item) =>
      normalizeVaultItem(item.id, source, item.data() as Record<string, unknown>),
    );
  } catch (error) {
    console.warn(`[moderationService] Could not read users/${uid}/${source}:`, error);
    return [];
  }
}

export async function investigateUser(uid: string): Promise<UserInvestigation> {
  const [profile, links, iconVault, vault] = await Promise.all([
    getUserProfile(uid),
    listUserSubcollection(uid, 'links'),
    listUserSubcollection(uid, 'icon_vault'),
    listUserSubcollection(uid, 'vault'),
  ]);

  return { profile, links, iconVault, vault };
}

function reportDocRef(reportId: string, sourceCollection: 'reports' | 'userReports' = 'reports') {
  return doc(db, sourceCollection, reportId.replace(/^userReports:/, ''));
}

export async function markReportReviewed(
  reportId: string,
  reviewedBy: string,
  sourceCollection: 'reports' | 'userReports' = 'reports',
) {
  await updateDoc(reportDocRef(reportId, sourceCollection), {
    status: 'reviewed',
    reviewedBy,
    reviewedAt: serverTimestamp(),
  });
}

export async function dismissReport(
  reportId: string,
  reviewedBy: string,
  sourceCollection: 'reports' | 'userReports' = 'reports',
) {
  await updateDoc(reportDocRef(reportId, sourceCollection), {
    status: 'dismissed',
    reviewedBy,
    reviewedAt: serverTimestamp(),
  });
}

export async function banReportedUser(report: ModerationReport, reviewedBy: string, banReason: string) {
  if (!report.reportedUserId) {
    throw new Error('Report does not include reportedUserId');
  }

  const batch = writeBatch(db);
  const reportRef = reportDocRef(report.id, report.sourceCollection);
  const userRef = doc(db, 'users', report.reportedUserId);

  batch.update(userRef, {
    isBanned: true,
    bannedAt: serverTimestamp(),
    banReason,
  });

  batch.update(reportRef, {
    status: 'reviewed',
    reviewedBy,
    reviewedAt: serverTimestamp(),
    banReason,
  });

  await batch.commit();
}

export async function warnReportedUser(report: ModerationReport, reviewedBy: string, warningReason: string) {
  if (!report.reportedUserId) {
    throw new Error('Report does not include reportedUserId');
  }

  const batch = writeBatch(db);
  const reportRef = reportDocRef(report.id, report.sourceCollection);
  const userRef = doc(db, 'users', report.reportedUserId);

  batch.update(userRef, {
    warnings: increment(1),
    lastWarningReason: warningReason,
    lastWarningAt: serverTimestamp(),
  });

  batch.update(reportRef, {
    status: 'reviewed',
    reviewedBy,
    reviewedAt: serverTimestamp(),
    warningReason,
    moderationAction: 'warning',
  });

  await batch.commit();
}

export async function hardBanReportedUser(report: ModerationReport, reviewedBy: string, banReason: string) {
  if (!report.reportedUserId) {
    throw new Error('Report does not include reportedUserId');
  }

  const profile = await getUserProfile(report.reportedUserId);
  const batch = writeBatch(db);
  const reportRef = reportDocRef(report.id, report.sourceCollection);
  const userRef = doc(db, 'users', report.reportedUserId);
  const bannedIdentityRef = doc(db, 'banned_identities', report.reportedUserId);

  batch.update(userRef, {
    isBanned: true,
    isDeleted: true,
    publicHidden: true,
    hardBannedAt: serverTimestamp(),
    bannedAt: serverTimestamp(),
    banReason,
  });

  batch.set(bannedIdentityRef, {
    uid: report.reportedUserId,
    email: profile?.email || null,
    phoneNumber: profile?.phoneNumber || null,
    reason: banReason,
    sourceReportId: report.id,
    createdBy: reviewedBy,
    createdAt: serverTimestamp(),
  });

  batch.update(reportRef, {
    status: 'reviewed',
    reviewedBy,
    reviewedAt: serverTimestamp(),
    banReason,
    moderationAction: 'hard_ban',
  });

  await batch.commit();
}
