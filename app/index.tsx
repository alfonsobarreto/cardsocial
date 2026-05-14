import { useGlobalSearchParams, Redirect } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { auth } from '@/services/firebaseConfig';
import { enforceInactivitySignOutIfNeeded, firebaseUserMayEnterMainApp } from '@/services/sessionInactivity';

type GateTarget = 'loading' | 'signin' | 'main';

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
      setTarget('main');
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

  return <Redirect href="/signin" />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
