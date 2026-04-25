import {
  BUILTIN_GHOST_LINK_ITEM_ID,
  GHOST_LINK_VAULT_TYPE,
  GHOST_LINK_VAULT_VALUE,
  isGhostLinkVaultType,
} from '@card-social/constants/ghostLinkVault';
import { collection, doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getStudioDb } from '@/lib/studioFirebase';
import type { StudioVaultLink } from '@/lib/studioVaultTypes';

function sortVault(items: StudioVaultLink[]): StudioVaultLink[] {
  return [...items].sort((a, b) => {
    if (a.isFavorite === b.isFavorite) {
      return String(a.title || '').localeCompare(String(b.title || ''));
    }
    return a.isFavorite ? -1 : 1;
  });
}

function buildBuiltinGhost(): StudioVaultLink {
  const now = new Date().toISOString();
  return {
    id: BUILTIN_GHOST_LINK_ITEM_ID,
    title: 'Llamada privada',
    type: GHOST_LINK_VAULT_TYPE,
    value: GHOST_LINK_VAULT_VALUE,
    iconName: 'Llamada',
    icon: 'phone-in-talk',
    isFavorite: false,
    vaultProtected: true,
    createdAt: now,
    updatedAt: now,
  };
}

/** Si no hay Ghost-Link en la lista, lo antepone (y opcionalmente persiste en Firestore). */
export function mergeBuiltinGhostPlaceholders(items: StudioVaultLink[]): StudioVaultLink[] {
  const arr = Array.isArray(items) ? [...items] : [];
  if (arr.some((x) => isGhostLinkVaultType(x?.type))) {
    return arr;
  }
  return [buildBuiltinGhost(), ...arr];
}

export async function persistBuiltinGhostIfMissing(uid: string): Promise<void> {
  const db = getStudioDb();
  const built = buildBuiltinGhost();
  try {
    await setDoc(doc(db, 'users', uid, 'links', BUILTIN_GHOST_LINK_ITEM_ID), built as Record<string, unknown>, {
      merge: true,
    });
  } catch {
    /* offline / permisos */
  }
}

export function subscribeVaultLinks(uid: string, onData: (items: StudioVaultLink[]) => void): Unsubscribe {
  const db = getStudioDb();
  const col = collection(db, 'users', uid, 'links');
  return onSnapshot(
    col,
    (snap) => {
      const raw = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          ...data,
        } as StudioVaultLink;
      });
      const merged = mergeBuiltinGhostPlaceholders(raw);
      if (merged.length > 0 && !raw.some((x) => isGhostLinkVaultType(x?.type))) {
        void persistBuiltinGhostIfMissing(uid);
      }
      onData(sortVault(merged));
    },
    (err) => {
      console.error('[studio vault]', err);
      onData([]);
    },
  );
}

export async function saveVaultLink(uid: string, payload: StudioVaultLink): Promise<void> {
  const db = getStudioDb();
  await setDoc(doc(db, 'users', uid, 'links', payload.id), { ...payload } as Record<string, unknown>, { merge: true });
}

export function newStudioItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cs_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
