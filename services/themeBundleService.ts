/**
 * Bundles temáticos del Card-Studio: un pago desbloquea N variantes de color + pack de iconos vinculado.
 */

import {
  TEXAS_LONGHORNS_BUNDLE_ID,
  TEXAS_LONGHORNS_ICON_SEEDS,
} from '@/constants/texasLonghornsPack';
import { db } from '@/services/firebaseConfig';
import { deductCredits } from '@/services/creditsService';
import {
  grantIconVaultCatalogItems,
  stableKeyForCatalogIcon,
  type CatalogIconSeed,
} from '@/services/iconVaultService';
import { mergeUnlockedThemeIdsFromServer } from '@/services/useActiveTheme';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

export type ThemeBundleDefinition = {
  id: string;
  nameEs: string;
  nameEn: string;
  creditsPrice: number;
  /** IDs en constants/themeChest.ts */
  themeIds: string[];
  iconSeeds: CatalogIconSeed[];
};

export const THEME_BUNDLES: ThemeBundleDefinition[] = [
  {
    id: TEXAS_LONGHORNS_BUNDLE_ID,
    nameEs: 'Texas Longhorns',
    nameEn: 'Texas Longhorns',
    creditsPrice: 320,
    themeIds: ['texas_burnt_orange', 'texas_whiteout', 'texas_night_game'],
    iconSeeds: TEXAS_LONGHORNS_ICON_SEEDS,
  },
];

export function getThemeBundleById(id: string): ThemeBundleDefinition | undefined {
  return THEME_BUNDLES.find((b) => b.id === id);
}

export async function userOwnsThemeBundle(userId: string, bundleId: string): Promise<boolean> {
  const ref = doc(db, 'users', userId, 'purchased_theme_bundles', bundleId);
  const snap = await getDoc(ref);
  return snap.exists();
}

/**
 * Compra un bundle: deduce CS, marca propiedad, desbloquea temas y otorga iconos en icon_vault.
 */
export async function purchaseThemeBundle(userId: string, bundleId: string): Promise<boolean> {
  const bundle = getThemeBundleById(bundleId);
  if (!bundle) {
    return false;
  }
  if (await userOwnsThemeBundle(userId, bundleId)) {
    return true;
  }
  const ok = await deductCredits(userId, bundle.creditsPrice, `theme_bundle:${bundleId}`);
  if (!ok) {
    return false;
  }
  await setDoc(
    doc(db, 'users', userId, 'purchased_theme_bundles', bundleId),
    {
      bundleId,
      purchasedAt: serverTimestamp(),
      themeIds: bundle.themeIds,
      iconKeys: bundle.iconSeeds.map((s) => stableKeyForCatalogIcon(s)),
    },
    { merge: true },
  );
  await mergeUnlockedThemeIdsFromServer(userId, bundle.themeIds);
  await grantIconVaultCatalogItems(userId, bundle.iconSeeds, 'theme', bundleId);
  return true;
}
