/**
 * softDelete.ts
 * Soft-delete utility — marks documents with deletedAt instead of removing them.
 * Items stay in a "trash" state for 30 days, then can be permanently purged.
 */

import { deleteDoc, doc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Mark a Firestore document as soft-deleted.
 * Sets `deletedAt` to server timestamp and an optional `deletedReason`.
 */
export async function markDeleted(
  collectionPath: string,
  docId: string,
  reason?: string,
): Promise<void> {
  const ref = doc(db, collectionPath, docId);
  await updateDoc(ref, {
    deletedAt: serverTimestamp(),
    ...(reason ? { deletedReason: reason } : {}),
  });
}

/**
 * Restore a soft-deleted document (remove deletedAt flag).
 */
export async function restoreDeleted(collectionPath: string, docId: string): Promise<void> {
  const ref = doc(db, collectionPath, docId);
  await updateDoc(ref, {
    deletedAt: null,
    deletedReason: null,
  });
}

/**
 * Check if a document's deletedAt timestamp is within the retention window.
 * Returns true if the item is soft-deleted and still recoverable.
 */
export function isInTrash(deletedAt: Timestamp | Date | string | null | undefined): boolean {
  if (!deletedAt) return false;
  const ts =
    deletedAt instanceof Timestamp
      ? deletedAt.toDate()
      : deletedAt instanceof Date
        ? deletedAt
        : new Date(deletedAt);
  if (isNaN(ts.getTime())) return false;
  return Date.now() - ts.getTime() < TRASH_RETENTION_MS;
}

/**
 * Check if a document's soft-delete has expired (past 30 days).
 */
export function isExpiredTrash(deletedAt: Timestamp | Date | string | null | undefined): boolean {
  if (!deletedAt) return false;
  const ts =
    deletedAt instanceof Timestamp
      ? deletedAt.toDate()
      : deletedAt instanceof Date
        ? deletedAt
        : new Date(deletedAt);
  if (isNaN(ts.getTime())) return false;
  return Date.now() - ts.getTime() >= TRASH_RETENTION_MS;
}

/**
 * Permanently delete a document (hard delete).
 * Use only after retention period has passed or user confirms.
 */
export async function purgeDocument(collectionPath: string, docId: string): Promise<void> {
  await deleteDoc(doc(db, collectionPath, docId));
}

/**
 * Helper to filter out soft-deleted items from a list.
 */
export function filterActive<T extends { deletedAt?: any }>(items: T[]): T[] {
  return items.filter((item) => !item.deletedAt);
}

/**
 * Helper to get only items in trash (soft-deleted, within 30 days).
 */
export function filterTrash<T extends { deletedAt?: any }>(items: T[]): T[] {
  return items.filter((item) => isInTrash(item.deletedAt));
}

/**
 * Days remaining until permanent deletion.
 */
export function trashDaysRemaining(deletedAt: Timestamp | Date | string | null | undefined): number {
  if (!deletedAt) return 0;
  const ts =
    deletedAt instanceof Timestamp
      ? deletedAt.toDate()
      : deletedAt instanceof Date
        ? deletedAt
        : new Date(deletedAt);
  if (isNaN(ts.getTime())) return 0;
  const elapsed = Date.now() - ts.getTime();
  const remaining = TRASH_RETENTION_MS - elapsed;
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}
