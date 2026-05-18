import { CURRENT_ONBOARDING_VERSION } from '@/constants/onboarding';
import { auth, db } from '@/services/firebaseConfig';
import { ensureOnboardingTourNotification } from '@/services/onboardingTourNotification';
import { readOnboardingDoneFromStorage, writeOnboardingDoneToStorage } from '@/services/onboardingStorage';
import type { FirestoreUserAppFields } from '@/types/firestoreUserDoc';
import { useGlobalSearchParams, usePathname, useRouter, type Href } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { enforceInactivitySignOutIfNeeded, firebaseUserMayEnterMainApp } from '@/services/sessionInactivity';

type GateTarget = 'loading' | 'signin' | 'main' | 'onboarding';

/** Lee users/{uid} para versión de onboarding; propaga error de red/SDK al caller. */
async function readOnboardingFromUserDoc(userId: string): Promise<'main' | 'onboarding'> {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) {
    return 'onboarding';
  }
  const raw = snap.data() as FirestoreUserAppFields | undefined;
  const v = raw?.onboardingVersion;
  const num = typeof v === 'number' ? v : Number(v);
  if (Number.isFinite(num) && num >= CURRENT_ONBOARDING_VERSION) {
    await writeOnboardingDoneToStorage();
    return 'main';
  }
  return 'onboarding';
}

/**
 * Onboarding híbrido: solo se salta el carrusel si hay finalización explícita
 * (AsyncStorage tras "Comenzar" o onboardingVersion en Firestore).
 * Reintento tras 500 ms ante fallo (red, token, permisos transitorios); si falla el bucle sin
 * flag local de finalización, devolvemos `onboarding` para no enviar a un panel principal vacío.
 */
async function resolvePostAuthDestination(userId: string): Promise<'main' | 'onboarding'> {
  if (await readOnboardingDoneFromStorage()) {
    return 'main';
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 500));
    }
    try {
      return await readOnboardingFromUserDoc(userId);
    } catch (e) {
      console.warn(`[index] onboarding gate Firestore (attempt ${attempt + 1}):`, e);
    }
  }
  if (await readOnboardingDoneFromStorage()) {
    return 'main';
  }
  console.warn(
    '[index] onboarding gate: Firestore still unavailable after retry; defaulting to onboarding (no local completion flag).',
  );
  return 'onboarding';
}

export default function Index() {
  const router = useRouter();
  const pathname = usePathname();
  const { code, campaignCode } = useGlobalSearchParams();
  const [target, setTarget] = useState<GateTarget>('loading');
  const authGenerationRef = useRef(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      const gen = ++authGenerationRef.current;

      if (!user) {
        if (gen === authGenerationRef.current) setTarget('signin');
        return;
      }
      if (!firebaseUserMayEnterMainApp(user)) {
        try {
          await signOut(auth);
        } catch (e) {
          console.warn('[index] signOut (gate: cannot enter main app, e.g. unverified email):', e);
        }
        if (gen === authGenerationRef.current) {
          setTarget('signin');
        }
        return;
      }
      const r = await enforceInactivitySignOutIfNeeded();
      if (r === 'signed_out' || !auth.currentUser) {
        if (gen === authGenerationRef.current) setTarget('signin');
        return;
      }
      const active = auth.currentUser;
      if (!active || active.uid !== user.uid) {
        if (gen === authGenerationRef.current) setTarget('signin');
        return;
      }

      void active.getIdToken().catch((e) => {
        console.warn(
          '[AUTH GATE] Token refresh failed (non-blocking); proceeding with local session.',
          e,
        );
      });

      const dest = await resolvePostAuthDestination(active.uid);
      void ensureOnboardingTourNotification(active.uid).catch((e) =>
        console.warn('[index] ensureOnboardingTourNotification', e),
      );

      if (gen !== authGenerationRef.current) {
        return;
      }
      setTarget(dest === 'main' ? 'main' : 'onboarding');
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (code && typeof code === 'string') {
      router.replace({ pathname: '/redeem', params: { code } } as Href);
      return;
    }
    if (campaignCode && typeof campaignCode === 'string') {
      router.replace({ pathname: '/redeem', params: { campaignCode } } as Href);
    }
  }, [code, campaignCode, router]);

  useEffect(() => {
    if (code && typeof code === 'string') return;
    if (campaignCode && typeof campaignCode === 'string') return;
    if (target === 'loading') return;

    if (target === 'signin') {
      if (pathname !== '/signin') {
        router.replace('/signin' as Href);
      }
    } else if (target === 'main') {
      router.replace('/(tabs)/cards' as Href);
    } else if (target === 'onboarding') {
      router.replace('/onboarding' as Href);
    }
  }, [target, code, campaignCode, router, pathname]);

  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
