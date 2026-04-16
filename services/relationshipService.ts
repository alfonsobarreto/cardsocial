/**
 * relationshipService.ts
 * Client-side relationship management: Mute / Restrict / Block
 *
 * - Block goes through backend API (already exists in qrApi.ts)
 * - Mute & Restrict are stored in Firestore subcollection:
 *   users/{uid}/relationships/{targetUid} → { status, updatedAt }
 */

import {
    collection,
    deleteDoc,
    deleteField,
    doc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    Timestamp,
    where,
} from 'firebase/firestore';
import { readUserAvatarUrl } from '@/services/userIdentityFields';
import { db } from './firebaseConfig';
import { blockRelationship, unblockRelationship } from './qrApi';

export type RelationshipStatus = 'muted' | 'restricted' | 'blocked';

export type RelationshipEntry = {
  uid: string;
  name: string;
  userAvatarUrl: string | null;
  status: RelationshipStatus;
  updatedAt: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────

function relDocRef(uid: string, targetUid: string) {
  return doc(db, 'users', uid, 'relationships', targetUid);
}

function relCollectionRef(uid: string) {
  return collection(db, 'users', uid, 'relationships');
}

// ── Mute ─────────────────────────────────────────────────────────────────

export async function muteUser(
  uid: string,
  target: { uid: string; name: string; userAvatarUrl: string | null },
): Promise<void> {
  await setDoc(relDocRef(uid, target.uid), {
    status: 'muted',
    name: target.name,
    userAvatarUrl: target.userAvatarUrl ?? null,
    photoUrl: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

// ── Restrict ─────────────────────────────────────────────────────────────

export async function restrictUser(
  uid: string,
  target: { uid: string; name: string; userAvatarUrl: string | null },
): Promise<void> {
  await setDoc(relDocRef(uid, target.uid), {
    status: 'restricted',
    name: target.name,
    userAvatarUrl: target.userAvatarUrl ?? null,
    photoUrl: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

// ── Block (delegates to backend API) ─────────────────────────────────────

export async function blockUser(
  uid: string,
  target: { uid: string; name: string; userAvatarUrl: string | null },
): Promise<void> {
  // Backend handles severing links
  await blockRelationship({ uid, targetUid: target.uid });
  // Also persist in local subcollection for unified queries
  await setDoc(relDocRef(uid, target.uid), {
    status: 'blocked',
    name: target.name,
    userAvatarUrl: target.userAvatarUrl ?? null,
    photoUrl: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

// ── Remove relationship (restore) ────────────────────────────────────────

export async function removeRelationship(
  uid: string,
  targetUid: string,
  currentStatus: RelationshipStatus,
): Promise<void> {
  if (currentStatus === 'blocked') {
    await unblockRelationship({ uid, targetUid });
  }
  await deleteDoc(relDocRef(uid, targetUid));
}

// ── Change tier (e.g. muted → restricted → blocked) ─────────────────────

export async function changeRelationshipTier(
  uid: string,
  target: { uid: string; name: string; userAvatarUrl: string | null },
  newStatus: RelationshipStatus,
): Promise<void> {
  if (newStatus === 'blocked') {
    await blockUser(uid, target);
  } else {
    // If was blocked, unblock via backend first
    const existing = await getRelationshipStatus(uid, target.uid);
    if (existing === 'blocked') {
      await unblockRelationship({ uid, targetUid: target.uid });
    }
    await setDoc(relDocRef(uid, target.uid), {
      status: newStatus,
      name: target.name,
      userAvatarUrl: target.userAvatarUrl ?? null,
      photoUrl: deleteField(),
      updatedAt: serverTimestamp(),
    });
  }
}

// ── List by status ───────────────────────────────────────────────────────

export async function listRelationshipsByStatus(
  uid: string,
  status: RelationshipStatus,
): Promise<RelationshipEntry[]> {
  const q = query(relCollectionRef(uid), where('status', '==', status));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    const ts = data.updatedAt as Timestamp | null;
    return {
      uid: d.id,
      name: String(data.name || ''),
      userAvatarUrl: readUserAvatarUrl(data as Record<string, unknown>) || null,
      status: data.status as RelationshipStatus,
      updatedAt: ts?.toDate?.()?.toISOString?.() ?? null,
    };
  });
}

// ── List all relationships ───────────────────────────────────────────────

export async function listAllRelationships(
  uid: string,
): Promise<RelationshipEntry[]> {
  const snap = await getDocs(relCollectionRef(uid));
  return snap.docs.map((d) => {
    const data = d.data();
    const ts = data.updatedAt as Timestamp | null;
    return {
      uid: d.id,
      name: String(data.name || ''),
      userAvatarUrl: readUserAvatarUrl(data as Record<string, unknown>) || null,
      status: data.status as RelationshipStatus,
      updatedAt: ts?.toDate?.()?.toISOString?.() ?? null,
    };
  });
}

// ── Quick check ──────────────────────────────────────────────────────────

export async function getRelationshipStatus(
  uid: string,
  targetUid: string,
): Promise<RelationshipStatus | null> {
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(relDocRef(uid, targetUid));
  if (!snap.exists()) return null;
  return (snap.data().status as RelationshipStatus) ?? null;
}

// ── Check helpers for UI filtering ───────────────────────────────────────

export async function isMuted(uid: string, targetUid: string): Promise<boolean> {
  return (await getRelationshipStatus(uid, targetUid)) === 'muted';
}

export async function isRestricted(uid: string, targetUid: string): Promise<boolean> {
  return (await getRelationshipStatus(uid, targetUid)) === 'restricted';
}

export async function isBlocked(uid: string, targetUid: string): Promise<boolean> {
  return (await getRelationshipStatus(uid, targetUid)) === 'blocked';
}
