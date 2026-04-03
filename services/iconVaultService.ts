/**
 * Icon Vault — iconos comprados / tier gratuito (Firestore).
 * Colección: users/{uid}/icon_vault/{stableKey}
 *
 * Modelo boutique: todos los usuarios ven el catálogo completo; solo se desbloquean
 * iconos con compra (CS) o pack/tema. No hay gate global "premium" sobre el vault.
 */

import { db } from '@/services/firebaseConfig';
import { deductCredits } from '@/services/creditsService';
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

export type CatalogIconSeed = {
  id: string;
  icon: string;
  label: string;
  labelEn: string;
};

export type IconVaultEntry = {
  materialIconName: string;
  label: string;
  labelEn: string;
  legacyCatalogId?: string;
  source: 'default' | 'pack' | 'premium_all' | 'purchase' | 'theme';
  packId?: string | null;
  grantedAt?: unknown;
};

/** Firestore-safe id derived from material icon + English label (stable across sessions). */
export function stableIconVaultDocumentId(materialIconName: string, labelEn: string): string {
  const raw = `${materialIconName}__${labelEn}`.replace(/[#$/\[\]\s.]+/g, '_');
  const trimmed = raw.slice(0, 600);
  return trimmed || 'icon_unknown';
}

export function stableKeyForCatalogIcon(item: Pick<CatalogIconSeed, 'icon' | 'labelEn'>): string {
  return stableIconVaultDocumentId(item.icon, item.labelEn);
}

/** Subconjunto inicial incluido en todas las cuentas (sin gasto de CS). */
export const FREE_STARTER_CATALOG_SEEDS: CatalogIconSeed[] = [
  { id: 'free-1', icon: 'linkedin', label: 'LinkedIn', labelEn: 'LinkedIn' },
  { id: 'free-2', icon: 'instagram', label: 'Instagram', labelEn: 'Instagram' },
  { id: 'free-3', icon: 'facebook', label: 'Facebook', labelEn: 'Facebook' },
  { id: 'free-4', icon: 'link-variant', label: 'Enlace', labelEn: 'Link' },
  { id: 'free-5', icon: 'phone', label: 'Teléfono', labelEn: 'Phone' },
  { id: 'free-6', icon: 'email-outline', label: 'Email', labelEn: 'Email' },
];

const FREE_STARTER_KEY_SET = new Set(
  FREE_STARTER_CATALOG_SEEDS.map((s) => stableKeyForCatalogIcon(s)),
);

export function isFreeStarterIconKey(stableKey: string): boolean {
  return FREE_STARTER_KEY_SET.has(stableKey);
}

/**
 * Garantiza documentos `default` solo para el tier gratuito (no semilla masiva del catálogo).
 */
export async function ensureFreeStarterIconVault(userId: string): Promise<void> {
  const col = collection(db, 'users', userId, 'icon_vault');
  await Promise.all(
    FREE_STARTER_CATALOG_SEEDS.map((item) => {
      const key = stableKeyForCatalogIcon(item);
      return setDoc(
        doc(col, key),
        {
          materialIconName: item.icon,
          label: item.label,
          labelEn: item.labelEn,
          legacyCatalogId: item.id,
          source: 'default',
          packId: null,
          grantedAt: serverTimestamp(),
        } satisfies IconVaultEntry,
        { merge: true },
      );
    }),
  );
}

/**
 * @deprecated No usar en producción: otorgaba todo el catálogo. Mantener solo migraciones legacy.
 */
export async function ensureUserIconVaultSeeded(userId: string, gallery: CatalogIconSeed[]): Promise<void> {
  const col = collection(db, 'users', userId, 'icon_vault');
  await Promise.all(
    gallery.map((item) => {
      const key = stableKeyForCatalogIcon(item);
      return setDoc(
        doc(col, key),
        {
          materialIconName: item.icon,
          label: item.label,
          labelEn: item.labelEn,
          legacyCatalogId: item.id,
          source: 'default',
          packId: null,
          grantedAt: serverTimestamp(),
        } satisfies IconVaultEntry,
        { merge: true },
      );
    }),
  );
}

export async function grantIconVaultCatalogItems(
  userId: string,
  items: CatalogIconSeed[],
  source: IconVaultEntry['source'],
  packId?: string | null,
): Promise<void> {
  if (!items.length) return;
  const col = collection(db, 'users', userId, 'icon_vault');
  await Promise.all(
    items.map((item) => {
      const key = stableKeyForCatalogIcon(item);
      return setDoc(
        doc(col, key.slice(0, 600)),
        {
          materialIconName: item.icon,
          label: item.label,
          labelEn: item.labelEn,
          legacyCatalogId: item.id,
          source,
          packId: packId ?? null,
          grantedAt: serverTimestamp(),
        } satisfies IconVaultEntry,
        { merge: true },
      );
    }),
  );
}

/**
 * Refuerza/otorga entradas tras comprar un pack (solo metadatos parciales si no hay seed).
 */
export async function grantIconVaultKeys(
  userId: string,
  stableKeys: string[],
  source: IconVaultEntry['source'],
  packId?: string | null,
): Promise<void> {
  if (!stableKeys.length) return;
  const col = collection(db, 'users', userId, 'icon_vault');
  await Promise.all(
    stableKeys.map((key) =>
      setDoc(
        doc(col, key.slice(0, 600)),
        {
          source,
          packId: packId ?? null,
          grantedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  );
}

export type IconVaultAllowance =
  | { mode: 'all' }
  | { mode: 'keys'; keys: Set<string> };

/** Claves presentes en icon_vault (compras, packs, tier gratuito, etc.). */
export async function getOwnedIconVaultKeySet(userId: string): Promise<Set<string>> {
  const snap = await getDocs(collection(db, 'users', userId, 'icon_vault'));
  return new Set(snap.docs.map((d) => d.id));
}

/**
 * Compat: antes premium implicaba `mode: 'all'`. Ahora siempre lista de claves poseídas;
 * la UI del Studio muestra el catálogo completo con candado fuera de esas claves + tier gratuito.
 */
export async function getUserIconVaultAllowance(
  userId: string,
  _gallery?: CatalogIconSeed[],
): Promise<IconVaultAllowance> {
  const keys = await getOwnedIconVaultKeySet(userId);
  return { mode: 'keys', keys };
}

/** Mapa estableKey -> entrada (para resolver icono en UI). */
export async function getUserIconVaultMap(userId: string): Promise<Map<string, IconVaultEntry>> {
  const snap = await getDocs(collection(db, 'users', userId, 'icon_vault'));
  const map = new Map<string, IconVaultEntry>();
  snap.docs.forEach((d) => {
    map.set(d.id, d.data() as IconVaultEntry);
  });
  return map;
}

export async function purchaseStudioIconUnlock(
  userId: string,
  item: CatalogIconSeed,
  priceCredits: number,
): Promise<boolean> {
  const key = stableKeyForCatalogIcon(item);
  if (isFreeStarterIconKey(key)) {
    return true;
  }
  const owned = await getOwnedIconVaultKeySet(userId);
  if (owned.has(key)) {
    return true;
  }
  const ok = await deductCredits(userId, priceCredits, `studio_icon:${key}`);
  if (!ok) {
    return false;
  }
  await grantIconVaultCatalogItems(userId, [item], 'purchase', null);
  return true;
}
