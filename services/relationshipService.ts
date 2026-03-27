/**
 * relationshipService.ts
 * Client-side relationship management: Mute / Restrict / Block
 *
 * - Block goes through backend API (already exists in qrApi.ts)
 * - Mute & Restrict are stored in Firestore subcollection:
 *   users/{ownerUid}/relationships/{targetUid} → { status, updatedAt }
 */

import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    Timestamp,
    where,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { blockRelationship, unblockRelationship } from './qrApi';

export type RelationshipStatus = 'muted' | 'restricted' | 'blocked';

export type RelationshipEntry = {
  uid: string;
  name: string;
  photoUrl: string | null;
  status: RelationshipStatus;
  updatedAt: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────

function relDocRef(ownerUid: string, targetUid: string) {
  return doc(db, 'users', ownerUid, 'relationships', targetUid);
}

function relCollectionRef(ownerUid: string) {
  return collection(db, 'users', ownerUid, 'relationships');
}

// ── Mute ─────────────────────────────────────────────────────────────────

export async function muteUser(
  ownerUid: string,
  target: { uid: string; name: string; photoUrl: string | null },
): Promise<void> {
  await setDoc(relDocRef(ownerUid, target.uid), {
    status: 'muted',
    name: target.name,
    photoUrl: target.photoUrl ?? null,
    updatedAt: serverTimestamp(),
  });
}

// ── Restrict ─────────────────────────────────────────────────────────────

export async function restrictUser(
  ownerUid: string,
  target: { uid: string; name: string; photoUrl: string | null },
): Promise<void> {
  await setDoc(relDocRef(ownerUid, target.uid), {
    status: 'restricted',
    name: target.name,
    photoUrl: target.photoUrl ?? null,
    updatedAt: serverTimestamp(),
  });
}

// ── Block (delegates to backend API) ─────────────────────────────────────

export async function blockUser(
  ownerUid: string,
  target: { uid: string; name: string; photoUrl: string | null },
): Promise<void> {
  // Backend handles severing links
  await blockRelationship({ ownerUid, targetUid: target.uid });
  // Also persist in local subcollection for unified queries
  await setDoc(relDocRef(ownerUid, target.uid), {
    status: 'blocked',
    name: target.name,
    photoUrl: target.photoUrl ?? null,
    updatedAt: serverTimestamp(),
  });
}

// ── Remove relationship (restore) ────────────────────────────────────────

export async function removeRelationship(
  ownerUid: string,
  targetUid: string,
  currentStatus: RelationshipStatus,
): Promise<void> {
  if (currentStatus === 'blocked') {
    await unblockRelationship({ ownerUid, targetUid });
  }
  await deleteDoc(relDocRef(ownerUid, targetUid));
}

// ── Change tier (e.g. muted → restricted → blocked) ─────────────────────

export async function changeRelationshipTier(
  ownerUid: string,
  target: { uid: string; name: string; photoUrl: string | null },
  newStatus: RelationshipStatus,
): Promise<void> {
  if (newStatus === 'blocked') {
    await blockUser(ownerUid, target);
  } else {
    // If was blocked, unblock via backend first
    const existing = await getRelationshipStatus(ownerUid, target.uid);
    if (existing === 'blocked') {
      await unblockRelationship({ ownerUid, targetUid: target.uid });
    }
    await setDoc(relDocRef(ownerUid, target.uid), {
      status: newStatus,
      name: target.name,
      photoUrl: target.photoUrl ?? null,
      updatedAt: serverTimestamp(),
    });
  }
}

// ── List by status ───────────────────────────────────────────────────────

export async function listRelationshipsByStatus(
  ownerUid: string,
  status: RelationshipStatus,
): Promise<RelationshipEntry[]> {
  const q = query(relCollectionRef(ownerUid), where('status', '==', status));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    const ts = data.updatedAt as Timestamp | null;
    return {
      uid: d.id,
      name: String(data.name || ''),
      photoUrl: data.photoUrl ? String(data.photoUrl) : null,
      status: data.status as RelationshipStatus,
      updatedAt: ts?.toDate?.()?.toISOString?.() ?? null,
    };
  });
}

// ── List all relationships ───────────────────────────────────────────────

export async function listAllRelationships(
  ownerUid: string,
): Promise<RelationshipEntry[]> {
  const snap = await getDocs(relCollectionRef(ownerUid));
  return snap.docs.map((d) => {
    const data = d.data();
    const ts = data.updatedAt as Timestamp | null;
    return {
      uid: d.id,
      name: String(data.name || ''),
      photoUrl: data.photoUrl ? String(data.photoUrl) : null,
      status: data.status as RelationshipStatus,
      updatedAt: ts?.toDate?.()?.toISOString?.() ?? null,
    };
  });
}

// ── Quick check ──────────────────────────────────────────────────────────

export async function getRelationshipStatus(
  ownerUid: string,
  targetUid: string,
): Promise<RelationshipStatus | null> {
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(relDocRef(ownerUid, targetUid));
  if (!snap.exists()) return null;
  return (snap.data().status as RelationshipStatus) ?? null;
}

// ── Check helpers for UI filtering ───────────────────────────────────────

export async function isMuted(ownerUid: string, targetUid: string): Promise<boolean> {
  return (await getRelationshipStatus(ownerUid, targetUid)) === 'muted';
}

export async function isRestricted(ownerUid: string, targetUid: string): Promise<boolean> {
  return (await getRelationshipStatus(ownerUid, targetUid)) === 'restricted';
}

export async function isBlocked(ownerUid: string, targetUid: string): Promise<boolean> {
  return (await getRelationshipStatus(ownerUid, targetUid)) === 'blocked';
}
