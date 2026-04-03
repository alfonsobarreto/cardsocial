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
import { useCallback, useEffect, useState } from 'react';

const ACTIVE_THEME_KEY = 'card_social_active_theme';
const UNLOCKED_THEMES_KEY = 'card_social_unlocked_themes';
const DEFAULT_THEME_ID = 'deep_teal';

/** Temas base siempre desbloqueados (sync con persistUnlockedThemes). */
export const FREE_THEME_IDS = new Set(['deep_teal', 'citrus_pop', 'sky_indigo']);

function parseUnlockedFromJson(raw: string | null): Set<string> {
  if (!raw) return new Set(FREE_THEME_IDS);
  try {
    const parsed = JSON.parse(raw) as string[];
    return new Set([...FREE_THEME_IDS, ...parsed]);
  } catch {
    return new Set(FREE_THEME_IDS);
  }
}

/**
 * Trae temas desde Firestore y escribe AsyncStorage (misma fuente que mergeUnlockedThemeIdsFromServer).
 */
export async function syncThemesFromFirestore(): Promise<{
  unlockedIds: Set<string>;
  activeThemeId: string | null;
} | null> {
  try {
    const uid = await getActiveUserId();
    if (!uid) return null;

    const settingsRef = doc(db, 'users', uid, 'settings', 'themes');
    const snap = await getDoc(settingsRef);

    if (!snap.exists()) {
      return null;
    }

    const data = snap.data();
    const firestoreThemeId = data?.activeThemeId as string | undefined;
    const firestoreUnlocked = Array.isArray(data?.unlockedThemeIds)
      ? (data.unlockedThemeIds as string[])
      : [];

    const merged = new Set([...FREE_THEME_IDS, ...firestoreUnlocked]);
    await AsyncStorage.setItem(UNLOCKED_THEMES_KEY, JSON.stringify([...merged]));

    if (firestoreThemeId) {
      await AsyncStorage.setItem(ACTIVE_THEME_KEY, firestoreThemeId);
    }

    return {
      unlockedIds: merged,
      activeThemeId: firestoreThemeId ?? null,
    };
  } catch {
    return null;
  }
}

export function useActiveTheme() {
  const [activeTheme, setActiveTheme] = useState<CardTheme>(
    getThemeById(DEFAULT_THEME_ID) ?? CARD_THEMES[0],
  );
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set(FREE_THEME_IDS));
  const [loading, setLoading] = useState(true);

  const refreshThemes = useCallback(async () => {
    try {
      const [storedId, unlockedRaw] = await Promise.all([
        AsyncStorage.getItem(ACTIVE_THEME_KEY),
        AsyncStorage.getItem(UNLOCKED_THEMES_KEY),
      ]);

      if (storedId) {
        const t = getThemeById(storedId);
        if (t) setActiveTheme(t);
      }
      setUnlockedIds(parseUnlockedFromJson(unlockedRaw));

      const remote = await syncThemesFromFirestore();
      if (remote) {
        setUnlockedIds(remote.unlockedIds);
        if (remote.activeThemeId) {
          const t = getThemeById(remote.activeThemeId);
          if (t) setActiveTheme(t);
        }
      }
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
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
            setUnlockedIds(parseUnlockedFromJson(unlockedRaw));
          }
        }

        const remote = await syncThemesFromFirestore();
        if (!cancelled && remote) {
          setUnlockedIds(remote.unlockedIds);
          if (remote.activeThemeId) {
            const t = getThemeById(remote.activeThemeId);
            if (t) setActiveTheme(t);
          }
        }
      } catch {
        /* offline or first run */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { activeTheme, unlockedIds, loading, refreshThemes };
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
  } catch {
    /* offline — local is still saved */
  }
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
  } catch {
    /* offline */
  }
}

/** Combina temas ya desbloqueados en Firestore con nuevos IDs (p. ej. compra de bundle). */
export async function mergeUnlockedThemeIdsFromServer(userId: string, additionalIds: string[]): Promise<void> {
  const settingsRef = doc(db, 'users', userId, 'settings', 'themes');
  const snap = await getDoc(settingsRef);
  const existing = Array.isArray(snap.data()?.unlockedThemeIds)
    ? (snap.data()!.unlockedThemeIds as string[])
    : [];
  const merged = [...new Set([...FREE_THEME_IDS, ...existing, ...additionalIds])];
  await AsyncStorage.setItem(UNLOCKED_THEMES_KEY, JSON.stringify(merged));
  await setDoc(settingsRef, { unlockedThemeIds: merged }, { merge: true });
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
