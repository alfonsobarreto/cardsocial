/**
 * useActiveTheme — hook that provides the user's currently selected card theme.
 *
 * Reads from AsyncStorage (fast, offline) and syncs with Firestore (cross-device).
 * Returns the full CardTheme object + helpers.
 */

import { CARD_THEMES, getThemeById, type CardTheme } from '@/constants/themeChest';
import { getActiveUserId } from '@/services/authSession';
import { db } from '@/services/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';

const ACTIVE_THEME_KEY = 'card_social_active_theme';
const UNLOCKED_THEMES_KEY = 'card_social_unlocked_themes';
const DEFAULT_THEME_ID = 'deep_teal';

// Free themes that are always unlocked
const FREE_THEME_IDS = new Set(['deep_teal', 'citrus_pop', 'sky_indigo']);

export function useActiveTheme() {
  const [activeTheme, setActiveTheme] = useState<CardTheme>(
    getThemeById(DEFAULT_THEME_ID) ?? CARD_THEMES[0],
  );
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set(FREE_THEME_IDS));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1. Fast: load from AsyncStorage
        const [storedId, unlockedRaw] = await Promise.all([
          AsyncStorage.getItem(ACTIVE_THEME_KEY),
          AsyncStorage.getItem(UNLOCKED_THEMES_KEY),
        ]);

        if (!cancelled) {
          if (storedId) {
            const t = getThemeById(storedId);
            if (t) setActiveTheme(t);
          }
          if (unlockedRaw) {
            const parsed = JSON.parse(unlockedRaw) as string[];
            setUnlockedIds(new Set([...FREE_THEME_IDS, ...parsed]));
          }
        }

        // 2. Sync with Firestore (cross-device truth)
        const uid = await getActiveUserId();
        if (!uid || cancelled) { setLoading(false); return; }

        const settingsRef = doc(db, 'users', uid, 'settings', 'themes');
        const snap = await getDoc(settingsRef);

        if (snap.exists() && !cancelled) {
          const data = snap.data();
          const firestoreThemeId = data?.activeThemeId;
          const firestoreUnlocked = Array.isArray(data?.unlockedThemeIds)
            ? data.unlockedThemeIds as string[]
            : [];

          // Firestore wins if it has data
          if (firestoreThemeId) {
            const t = getThemeById(firestoreThemeId);
            if (t) {
              setActiveTheme(t);
              await AsyncStorage.setItem(ACTIVE_THEME_KEY, firestoreThemeId);
            }
          }
          if (firestoreUnlocked.length > 0) {
            const merged = new Set([...FREE_THEME_IDS, ...firestoreUnlocked]);
            setUnlockedIds(merged);
            await AsyncStorage.setItem(UNLOCKED_THEMES_KEY, JSON.stringify([...merged]));
          }
        }
      } catch { /* offline or first run */ }
      finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { activeTheme, unlockedIds, loading };
}

/**
 * Persist theme selection to both AsyncStorage and Firestore.
 */
export async function setActiveThemeId(themeId: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_THEME_KEY, themeId);
  try {
    const uid = await getActiveUserId();
    if (uid) {
      const settingsRef = doc(db, 'users', uid, 'settings', 'themes');
      await setDoc(settingsRef, { activeThemeId: themeId }, { merge: true });
    }
  } catch { /* offline — local is still saved */ }
}

/**
 * Persist unlocked themes to both AsyncStorage and Firestore.
 */
export async function persistUnlockedThemes(ids: string[]): Promise<void> {
  const allIds = [...new Set([...FREE_THEME_IDS, ...ids])];
  await AsyncStorage.setItem(UNLOCKED_THEMES_KEY, JSON.stringify(allIds));
  try {
    const uid = await getActiveUserId();
    if (uid) {
      const settingsRef = doc(db, 'users', uid, 'settings', 'themes');
      await setDoc(settingsRef, { unlockedThemeIds: allIds }, { merge: true });
    }
  } catch { /* offline */ }
}

/**
 * Get theme gradient colors for a card — maps chest theme IDs to [color, color] tuples
 * for backwards compat with existing cards.tsx LinearGradient.
 */
export function getThemeGradient(themeId: string | undefined): [string, string] {
  const t = getThemeById(themeId ?? DEFAULT_THEME_ID);
  if (!t) return ['#EAF7FF', '#CDEFFF']; // fallback sky-glass
  return [t.background[0], t.background[2]];
}

/**
 * Get full theme style for a card row.
 */
export function getCardRowTheme(themeId: string | undefined) {
  const t = getThemeById(themeId ?? DEFAULT_THEME_ID);
  if (!t) {
    return {
      gradient: ['#EAF7FF', '#CDEFFF'] as [string, string],
      borderColor: 'rgba(13,77,138,0.2)',
      borderWidth: 1,
      titleColor: '#0D4D8A',
      metaColor: '#497499',
    };
  }
  return {
    gradient: [t.background[0], t.background[2]] as [string, string],
    borderColor: t.border.color,
    borderWidth: t.border.width,
    titleColor: t.title.color,
    metaColor: t.subtitle.color,
  };
}
