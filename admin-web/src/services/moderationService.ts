import {
  collection,
  doc,
  getDocs,
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
  reason: string;
  details?: string;
  createdAt?: Date | string | { toDate?: () => Date; seconds?: number } | null;
  reviewedBy?: string;
  reviewedAt?: Date | string | { toDate?: () => Date; seconds?: number } | null;
  banReason?: string;
};

type ReportDocument = Omit<ModerationReport, 'id'>;

function normalizeReport(id: string, data: Partial<ReportDocument>): ModerationReport {
  return {
    id,
    type: data.type || 'support',
    status: data.status || 'pending',
    reportedUserId: data.reportedUserId,
    reporterUserId: data.reporterUserId,
    targetCardId: data.targetCardId,
    reason: data.reason || 'Sin motivo registrado',
    details: data.details,
    createdAt: data.createdAt,
    reviewedBy: data.reviewedBy,
    reviewedAt: data.reviewedAt,
    banReason: data.banReason,
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
  const snapshot = await getDocs(collection(db, 'reports'));

  return snapshot.docs
    .map((item) => normalizeReport(item.id, item.data() as Partial<ReportDocument>))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function markReportReviewed(reportId: string, reviewedBy: string) {
  await updateDoc(doc(db, 'reports', reportId), {
    status: 'reviewed',
    reviewedBy,
    reviewedAt: serverTimestamp(),
  });
}

export async function dismissReport(reportId: string, reviewedBy: string) {
  await updateDoc(doc(db, 'reports', reportId), {
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
  const reportRef = doc(db, 'reports', report.id);
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
