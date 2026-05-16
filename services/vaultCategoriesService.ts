/**
 * Categorías de Bóveda (Fase 7) — campo `vaultCategories` en `users/{uid}`.
 * Claves por defecto en español (canónicas); la UI puede traducir títulos de sección si coinciden.
 */

import { doc, getDoc, updateDoc } from 'firebase/firestore';

import { creationT } from '@/services/creationI18n';
import { db } from '@/services/firebaseConfig';
import type { AppLanguage } from '@/services/language';

export const DEFAULT_VAULT_CATEGORIES = ['Negocios', 'Sociales', 'Personales', 'Destacados'] as const;

type DefaultVaultCategory = (typeof DEFAULT_VAULT_CATEGORIES)[number];

const DEFAULT_LOWER = new Set(DEFAULT_VAULT_CATEGORIES.map((c) => c.toLowerCase()));

/**
 * Lista para UI y escritura — si falta el campo o llega vacío, devuelve la plantilla inicial.
 */
export function mergeVaultCategoriesFromFirestore(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_VAULT_CATEGORIES];
  }
  const cleaned = raw.map((x) => String(x ?? '').trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of cleaned) {
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out.length > 0 ? out : [...DEFAULT_VAULT_CATEGORIES];
}

/** Título visible de sección: defaults conocidos ↔ i18n; categorías propias literal. */
export function vaultCategorySectionTitle(canonicalLabel: string, lang: AppLanguage): string {
  const trimmed = String(canonicalLabel || '').trim();
  if (!trimmed) {
return creationT('form_vault_cat_other', lang);
  }
  const normalized = trimmed.toLowerCase();

  switch (normalized) {
    case 'negocios':
      return creationT('form_vault_cat_business', lang);
    case 'sociales':
      return creationT('form_vault_cat_social', lang);
    case 'personales':
      return creationT('form_vault_cat_personal', lang);
    case 'destacados':
      return creationT('form_vault_cat_featured', lang);
    default:
      return trimmed;
  }
}

export function isDefaultVaultCategoryName(name: string): name is DefaultVaultCategory {
  return DEFAULT_LOWER.has(String(name || '').trim().toLowerCase());
}

/**
 * Persiste nueva categoría al array del usuario si no existe (case-insensitive).
 * Devuelve la lista siguiente (para estado local opcional).
 */
export async function appendVaultCategoryIfNew(uid: string, label: string): Promise<string[]> {
  const u = String(uid || '').trim();
  const trimmed = label.trim().slice(0, 64);
  if (!u || !trimmed) {
    throw new Error('appendVaultCategoryIfNew: uid o nombre vacío');
  }
  const ref = doc(db, 'users', u);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('appendVaultCategoryIfNew: usuario no encontrado');
  }
  const current = mergeVaultCategoriesFromFirestore(snap.data()?.vaultCategories);
  const lower = trimmed.toLowerCase();
  if (current.some((c) => c.toLowerCase() === lower)) {
    return current;
  }
  const next = [...current, trimmed];
  await updateDoc(ref, { vaultCategories: next });
  return next;
}

/**
 * Primera escritura cuando el campo nunca existió — plantilla inicial.
 */
export async function ensureVaultCategoriesSeedOnUser(uid: string): Promise<void> {
  const u = String(uid || '').trim();
  if (!u) return;
  const ref = doc(db, 'users', u);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const raw = snap.data()?.vaultCategories;
  if (raw === undefined || raw === null) {
    await updateDoc(ref, {
      vaultCategories: [...DEFAULT_VAULT_CATEGORIES],
    });
  }
}
