import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { openModerationEvidence, type ModerationEvidenceSealed } from '../lib/moderationReportEvidenceCrypto';

export type ReportStatus = 'pending' | 'resolved_approved' | 'resolved_rejected';

export type ModerationNotificationTemplateId = 'MOD_REPORT_APPROVED' | 'MOD_REPORT_REJECTED';

export type ReportEvidenceStatus = 'present' | 'missing' | 'invalid';

export class ReportAlreadyResolvedError extends Error {
  constructor(message = 'El reporte ya fue resuelto o no está pendiente.') {
    super(message);
    this.name = 'ReportAlreadyResolvedError';
  }
}

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
  reviewedByUid?: string;
  reviewedAt?: Date | string | { toDate?: () => Date; seconds?: number } | null;
  banReason?: string;
  reportedUser?: ModerationUserProfile | null;
  evidenceStatus?: ReportEvidenceStatus;
  evidenceCiphertext?: string;
  evidenceIv?: string;
  evidenceEphemPub?: string;
  evidenceVersion?: number;
  expiresAt?: Date | string | { toDate?: () => Date; seconds?: number } | null;
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
  /** true si el ítem usa `securePayload` E2E: la administración no debe ver plaintext ni ciphertext. */
  isE2eOpaque?: boolean;
  raw: Record<string, unknown>;
};

export type UserInvestigation = {
  profile: ModerationUserProfile | null;
  links: ModerationVaultItem[];
  iconVault: ModerationVaultItem[];
  vault: ModerationVaultItem[];
};

function normalizeEvidenceStatus(raw: unknown): ReportEvidenceStatus {
  if (raw === 'present' || raw === 'missing' || raw === 'invalid') return raw;
  return 'missing';
}

/** Migra estados legacy al modelo Trust & Safety v1. */
function normalizeReportStatus(raw: unknown): ReportStatus {
  const s = typeof raw === 'string' ? raw : 'pending';
  if (s === 'pending' || s === 'resolved_approved' || s === 'resolved_rejected') return s;
  if (s === 'reviewed') return 'resolved_approved';
  if (s === 'dismissed') return 'resolved_rejected';
  return 'pending';
}

function normalizeReport(
  id: string,
  data: Partial<ReportDocument> | LegacyUserReportDocument,
  sourceCollection: 'reports' | 'userReports' = 'reports',
): ModerationReport {
  const legacy = data as LegacyUserReportDocument;

  return {
    id,
    type: sourceCollection === 'userReports' ? 'card' : data.type || 'support',
    status: normalizeReportStatus(data.status),
    reportedUserId: data.reportedUserId || legacy.targetIssuerUid,
    reporterUserId: data.reporterUserId,
    targetCardId: data.targetCardId || legacy.targetSidOrBId,
    sourceCollection,
    reason: data.reason || (sourceCollection === 'userReports' ? 'Reporte de tarjeta' : 'Sin motivo registrado'),
    details: data.details || legacy.text,
    createdAt: data.createdAt,
    reviewedBy: data.reviewedBy,
    reviewedByUid: data.reviewedByUid,
    reviewedAt: data.reviewedAt,
    banReason: data.banReason,
    reportedUser: data.reportedUser,
    evidenceStatus: normalizeEvidenceStatus(data.evidenceStatus),
    evidenceCiphertext: typeof data.evidenceCiphertext === 'string' ? data.evidenceCiphertext : '',
    evidenceIv: typeof data.evidenceIv === 'string' ? data.evidenceIv : '',
    evidenceEphemPub: typeof data.evidenceEphemPub === 'string' ? data.evidenceEphemPub : '',
    evidenceVersion: typeof data.evidenceVersion === 'number' ? data.evidenceVersion : 1,
    expiresAt: data.expiresAt,
  };
}

/** Campos criptográficos / vaul: nunca exponer al panel de moderación (modelo zero-knowledge). */
const VAULT_SENSITIVE_KEYS = new Set([
  'securePayload',
  'secureIv',
  'vaultCipherVersion',
  'secureVersion',
]);

const REDACTED_VAULT_TITLE = '••••••••';
const ACCOUNT_STATUS_DOC_ID = 'account';

function userAccountStatusRef(uid: string) {
  return doc(db, 'users', uid, 'status', ACCOUNT_STATUS_DOC_ID);
}

function reportDocRef(reportId: string, sourceCollection: 'reports' | 'userReports' = 'reports') {
  return doc(db, sourceCollection, reportId.replace(/^userReports:/, ''));
}

function reportCollAndDocId(report: ModerationReport): { coll: 'reports' | 'userReports'; docId: string } {
  const coll = report.sourceCollection === 'userReports' ? 'userReports' : 'reports';
  const docId = report.id.replace(/^userReports:/, '');
  return { coll, docId };
}

function enqueueTemplateNotification(
  transaction: Transaction,
  reporterUid: string,
  templateId: ModerationNotificationTemplateId,
  report: ModerationReport,
  coll: 'reports' | 'userReports',
  docId: string,
): void {
  const notifRef = doc(collection(db, 'users', reporterUid, 'notifications'));
  transaction.set(notifRef, {
    templateId,
    read: false,
    createdAt: serverTimestamp(),
    resolvedAt: serverTimestamp(),
    reportId: docId,
    reportSourceCollection: coll,
    targetCardId: report.targetCardId ?? null,
  });
}

function writeAuditLogEntry(
  transaction: Transaction,
  coll: 'reports' | 'userReports',
  docId: string,
  payload: { actorUid: string; actionTaken: string; reason: string },
): void {
  const auditRef = doc(collection(db, coll, docId, 'auditLog'));
  transaction.set(auditRef, {
    actorUid: payload.actorUid,
    actionTaken: payload.actionTaken,
    timestamp: serverTimestamp(),
    reason: payload.reason,
  });
}

function moderationPrivateKeyBytesFromB64(b64: string): Uint8Array {
  const s = String(b64 || '').trim();
  if (!s) throw new Error('Clave privada vacía.');
  try {
    const binary = atob(s);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    throw new Error('Clave privada Base64 inválida.');
  }
}

export function decryptModerationReportEvidence(privateKeyB64: string, report: ModerationReport): string {
  if (report.evidenceStatus !== 'present') {
    throw new Error('Este reporte no tiene evidencia cifrada presente.');
  }
  const sealed: ModerationEvidenceSealed = {
    evidenceCiphertext: String(report.evidenceCiphertext || '').trim(),
    evidenceIv: String(report.evidenceIv || '').trim(),
    evidenceEphemPub: String(report.evidenceEphemPub || '').trim(),
  };
  if (!sealed.evidenceCiphertext || !sealed.evidenceIv || !sealed.evidenceEphemPub) {
    throw new Error('Faltan campos de evidencia en el reporte.');
  }
  const sk = moderationPrivateKeyBytesFromB64(privateKeyB64);
  return openModerationEvidence(sk, sealed);
}

function stripSensitiveVaultFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (VAULT_SENSITIVE_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function isE2EVaultDocument(data: Record<string, unknown>): boolean {
  const payload = typeof data.securePayload === 'string' ? data.securePayload.trim() : '';
  const iv = typeof data.secureIv === 'string' ? data.secureIv.trim() : '';
  return payload.length > 0 && iv.length > 0;
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
  const e2e = isE2EVaultDocument(data);
  const safeRaw = stripSensitiveVaultFields(data);

  if (e2e) {
    const structuralTitle = pickString(safeRaw, ['title', 'label', 'name', 'displayName']) || id;
    return {
      id,
      source,
      title: structuralTitle.trim() ? structuralTitle : REDACTED_VAULT_TITLE,
      type: pickString(safeRaw, ['type', 'kind', 'category']),
      value: undefined,
      url: undefined,
      imageUrl: undefined,
      isE2eOpaque: true,
      raw: safeRaw,
    };
  }

  return {
    id,
    source,
    title: pickString(safeRaw, ['title', 'label', 'name', 'displayName']) || id,
    type: pickString(safeRaw, ['type', 'kind', 'category']),
    value: pickString(safeRaw, ['value', 'text', 'inputData', 'content', 'description']),
    url: pickString(safeRaw, ['url', 'href', 'link', 'publicUrl']),
    imageUrl: pickString(safeRaw, ['imageUrl', 'photoURL', 'iconUrl', 'thumbnailUrl', 'fileUrl']),
    raw: safeRaw,
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
  ].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

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

/**
 * Aprueba el reporte (cierre fundado): transacción atómica + plantilla MOD_REPORT_APPROVED + auditLog.
 * Idempotente: aborta si el estado en servidor no es exactamente `pending`.
 */
export async function approveReportAction(
  report: ModerationReport,
  actorUid: string,
  actorEmail: string,
  reason: string,
): Promise<void> {
  const { coll, docId } = reportCollAndDocId(report);
  const reportRef = doc(db, coll, docId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(reportRef);
    if (!snap.exists()) throw new Error('Reporte no encontrado.');
    if (snap.data().status !== 'pending') throw new ReportAlreadyResolvedError();

    writeAuditLogEntry(transaction, coll, docId, {
      actorUid,
      actionTaken: 'APPROVE_REPORT',
      reason,
    });

    transaction.update(reportRef, {
      status: 'resolved_approved',
      reviewedBy: actorEmail,
      reviewedByUid: actorUid,
      reviewedAt: serverTimestamp(),
    });

    const reporterUid = report.reporterUserId?.trim();
    if (reporterUid) {
      enqueueTemplateNotification(transaction, reporterUid, 'MOD_REPORT_APPROVED', report, coll, docId);
    }
  });
}

/**
 * Rechaza el reporte (cierre infundado): MOD_REPORT_REJECTED + auditLog.
 */
export async function rejectReportAction(
  report: ModerationReport,
  actorUid: string,
  actorEmail: string,
  reason: string,
): Promise<void> {
  const { coll, docId } = reportCollAndDocId(report);
  const reportRef = doc(db, coll, docId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(reportRef);
    if (!snap.exists()) throw new Error('Reporte no encontrado.');
    if (snap.data().status !== 'pending') throw new ReportAlreadyResolvedError();

    writeAuditLogEntry(transaction, coll, docId, {
      actorUid,
      actionTaken: 'REJECT_REPORT',
      reason,
    });

    transaction.update(reportRef, {
      status: 'resolved_rejected',
      reviewedBy: actorEmail,
      reviewedByUid: actorUid,
      reviewedAt: serverTimestamp(),
    });

    const reporterUid = report.reporterUserId?.trim();
    if (reporterUid) {
      enqueueTemplateNotification(transaction, reporterUid, 'MOD_REPORT_REJECTED', report, coll, docId);
    }
  });
}

/**
 * Borra el link de la bóveda, marca el reporte como resuelto a favor de la política,
 * auditLog y notificación MOD_REPORT_APPROVED — una sola transacción.
 */
export async function deleteVaultLinkAndApproveReport(
  reportedUserUid: string,
  linkId: string,
  report: ModerationReport,
  actorUid: string,
  actorEmail: string,
  reason: string,
): Promise<void> {
  const { coll, docId } = reportCollAndDocId(report);
  const reportRef = doc(db, coll, docId);
  const linkRef = doc(db, 'users', reportedUserUid, 'links', linkId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(reportRef);
    if (!snap.exists()) throw new Error('Reporte no encontrado.');
    if (snap.data().status !== 'pending') throw new ReportAlreadyResolvedError();

    transaction.delete(linkRef);

    writeAuditLogEntry(transaction, coll, docId, {
      actorUid,
      actionTaken: 'DELETE_LINK_AND_APPROVE',
      reason,
    });

    transaction.update(reportRef, {
      status: 'resolved_approved',
      reviewedBy: actorEmail,
      reviewedByUid: actorUid,
      reviewedAt: serverTimestamp(),
      moderationResolution: 'content_removed',
    });

    const reporterUid = report.reporterUserId?.trim();
    if (reporterUid) {
      enqueueTemplateNotification(transaction, reporterUid, 'MOD_REPORT_APPROVED', report, coll, docId);
    }
  });
}

export async function banReportedUser(
  report: ModerationReport,
  actorUid: string,
  actorEmail: string,
  banReason: string,
) {
  if (!report.reportedUserId) {
    throw new Error('Report does not include reportedUserId');
  }
  const targetUid = report.reportedUserId;

  const { coll, docId } = reportCollAndDocId(report);
  const reportRef = reportDocRef(report.id, report.sourceCollection);
  const userRef = doc(db, 'users', targetUid);

  await runTransaction(db, async (transaction) => {
    const reportSnap = await transaction.get(reportRef);
    if (!reportSnap.exists()) throw new Error('Reporte no encontrado.');
    if (reportSnap.data().status !== 'pending') throw new ReportAlreadyResolvedError();

    transaction.update(userRef, {
      isBanned: true,
      bannedAt: serverTimestamp(),
      banReason,
    });

    transaction.set(
      userAccountStatusRef(targetUid),
      {
        suspended: true,
        moderationKind: 'soft_ban',
        updatedAt: serverTimestamp(),
        updatedBy: actorEmail,
        reason: banReason,
      },
      { merge: true },
    );

    writeAuditLogEntry(transaction, coll, docId, {
      actorUid,
      actionTaken: 'SOFT_BAN',
      reason: banReason,
    });

    transaction.update(reportRef, {
      status: 'resolved_approved',
      reviewedBy: actorEmail,
      reviewedByUid: actorUid,
      reviewedAt: serverTimestamp(),
      banReason,
    });

    const reporterUid = report.reporterUserId?.trim();
    if (reporterUid) {
      enqueueTemplateNotification(transaction, reporterUid, 'MOD_REPORT_APPROVED', report, coll, docId);
    }
  });
}

export async function warnReportedUser(
  report: ModerationReport,
  actorUid: string,
  actorEmail: string,
  warningReason: string,
) {
  if (!report.reportedUserId) {
    throw new Error('Report does not include reportedUserId');
  }
  const targetUid = report.reportedUserId;

  const { coll, docId } = reportCollAndDocId(report);
  const reportRef = reportDocRef(report.id, report.sourceCollection);
  const userRef = doc(db, 'users', targetUid);

  await runTransaction(db, async (transaction) => {
    const reportSnap = await transaction.get(reportRef);
    if (!reportSnap.exists()) throw new Error('Reporte no encontrado.');
    if (reportSnap.data().status !== 'pending') throw new ReportAlreadyResolvedError();

    transaction.update(userRef, {
      warnings: increment(1),
      lastWarningReason: warningReason,
      lastWarningAt: serverTimestamp(),
    });

    transaction.set(
      userAccountStatusRef(targetUid),
      {
        lastWarningAt: serverTimestamp(),
        lastWarningBy: actorEmail,
        lastWarningReason: warningReason,
        moderationKind: 'warning',
        updatedAt: serverTimestamp(),
        updatedBy: actorEmail,
      },
      { merge: true },
    );

    writeAuditLogEntry(transaction, coll, docId, {
      actorUid,
      actionTaken: 'WARNING',
      reason: warningReason,
    });

    transaction.update(reportRef, {
      status: 'resolved_approved',
      reviewedBy: actorEmail,
      reviewedByUid: actorUid,
      reviewedAt: serverTimestamp(),
      warningReason,
      moderationAction: 'warning',
    });

    const reporterUid = report.reporterUserId?.trim();
    if (reporterUid) {
      enqueueTemplateNotification(transaction, reporterUid, 'MOD_REPORT_APPROVED', report, coll, docId);
    }
  });
}

export async function hardBanReportedUser(
  report: ModerationReport,
  actorUid: string,
  actorEmail: string,
  banReason: string,
) {
  if (!report.reportedUserId) {
    throw new Error('Report does not include reportedUserId');
  }
  const targetUid = report.reportedUserId;

  const profile = await getUserProfile(targetUid);
  const { coll, docId } = reportCollAndDocId(report);
  const reportRef = reportDocRef(report.id, report.sourceCollection);
  const userRef = doc(db, 'users', targetUid);
  const bannedIdentityRef = doc(db, 'banned_identities', targetUid);

  await runTransaction(db, async (transaction) => {
    const reportSnap = await transaction.get(reportRef);
    if (!reportSnap.exists()) throw new Error('Reporte no encontrado.');
    if (reportSnap.data().status !== 'pending') throw new ReportAlreadyResolvedError();

    transaction.update(userRef, {
      isBanned: true,
      isDeleted: true,
      publicHidden: true,
      hardBannedAt: serverTimestamp(),
      bannedAt: serverTimestamp(),
      banReason,
    });

    transaction.set(
      userAccountStatusRef(targetUid),
      {
        suspended: true,
        hardBanned: true,
        moderationKind: 'hard_ban',
        updatedAt: serverTimestamp(),
        updatedBy: actorEmail,
        reason: banReason,
      },
      { merge: true },
    );

    transaction.set(bannedIdentityRef, {
      uid: targetUid,
      email: profile?.email || null,
      phoneNumber: profile?.phoneNumber || null,
      reason: banReason,
      sourceReportId: docId,
      sourceReportCollection: coll,
      createdBy: actorEmail,
      createdAt: serverTimestamp(),
    });

    writeAuditLogEntry(transaction, coll, docId, {
      actorUid,
      actionTaken: 'HARD_BAN',
      reason: banReason,
    });

    transaction.update(reportRef, {
      status: 'resolved_approved',
      reviewedBy: actorEmail,
      reviewedByUid: actorUid,
      reviewedAt: serverTimestamp(),
      banReason,
      moderationAction: 'hard_ban',
    });

    const reporterUid = report.reporterUserId?.trim();
    if (reporterUid) {
      enqueueTemplateNotification(transaction, reporterUid, 'MOD_REPORT_APPROVED', report, coll, docId);
    }
  });
}

/** @deprecated Prefer deleteVaultLinkAndApproveReport. Eliminación suelta sin cierre de reporte. */
export async function deleteTargetLink(uid: string, linkId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'links', linkId));
}
