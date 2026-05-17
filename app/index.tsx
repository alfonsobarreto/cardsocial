import { CURRENT_ONBOARDING_VERSION } from '@/constants/onboarding';
import { auth, db } from '@/services/firebaseConfig';
import { ensureOnboardingTourNotification } from '@/services/onboardingTourNotification';
import { readOnboardingDoneFromStorage, writeOnboardingDoneToStorage } from '@/services/onboardingStorage';
import type { FirestoreUserAppFields } from '@/types/firestoreUserDoc';
import { useGlobalSearchParams, Redirect, type Href } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { enforceInactivitySignOutIfNeeded, firebaseUserMayEnterMainApp } from '@/services/sessionInactivity';

type GateTarget = 'loading' | 'signin' | 'main' | 'onboarding';

/**
 * Onboarding híbrido: solo se salta el carrusel si hay finalización explícita
 * (AsyncStorage tras "Comenzar" o onboardingVersion en Firestore).
 * "Recordar más tarde" no escribe flags; el siguiente arranque en frío vuelve a /onboarding.
 */
async function resolvePostAuthDestination(userId: string): Promise<'main' | 'onboarding'> {
  if (await readOnboardingDoneFromStorage()) {
    return 'main';
  }
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    const raw = snap.data() as FirestoreUserAppFields | undefined;
    const v = raw?.onboardingVersion;
    const num = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(num) && num >= CURRENT_ONBOARDING_VERSION) {
      await writeOnboardingDoneToStorage();
      return 'main';
    }
  } catch (e) {
    console.warn('[index] onboarding gate Firestore:', e);
  }
  return 'onboarding';
}

export default function Index() {
  const { code, campaignCode } = useGlobalSearchParams();
  const [target, setTarget] = useState<GateTarget>('loading');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setTarget('signin');
        return;
      }
      if (!firebaseUserMayEnterMainApp(user)) {
        setTarget('signin');
        return;
      }
      const r = await enforceInactivitySignOutIfNeeded();
      if (r === 'signed_out' || !auth.currentUser) {
        setTarget('signin');
        return;
      }
      const active = auth.currentUser;
      if (!active || active.uid !== user.uid) {
        setTarget('signin');
        return;
      }
      try {
        await active.getIdToken();
      } catch (e) {
        console.warn('[index] getIdToken before Firestore:', e);
        setTarget('signin');
        return;
      }
      const dest = await resolvePostAuthDestination(active.uid);
      void ensureOnboardingTourNotification(active.uid).catch((e) =>
        console.warn('[index] ensureOnboardingTourNotification', e),
      );
      setTarget(dest === 'main' ? 'main' : 'onboarding');
    });
    return () => unsub();
  }, []);

  if (code && typeof code === 'string') {
    return <Redirect href={{ pathname: '/redeem', params: { code } }} />;
  }

  if (campaignCode && typeof campaignCode === 'string') {
    return <Redirect href={{ pathname: '/redeem', params: { campaignCode } }} />;
  }

  if (target === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (target === 'main') {
    return <Redirect href="/(tabs)/cards" />;
  }

  if (target === 'onboarding') {
    return <Redirect href={'/onboarding' as Href} />;
  }

  return <Redirect href="/signin" />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
