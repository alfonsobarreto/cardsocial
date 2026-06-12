import 'react-native-get-random-values';

import '@/i18n';
import BiometricResumeOverlay from '@/components/BiometricResumeOverlay';
import ErrorBoundary from '@/components/ErrorBoundary';
import PremiumDataPanelHost from '@/components/PremiumDataPanelHost';
import { PendingBunkerRedeemGate } from '@/components/PendingBunkerRedeemGate';
import { useAppLanguage } from '@/services/coreI18n';
import { LanguageProvider } from '@/services/language';
import { LookModeProvider } from '@/services/lookMode';
import { NetworkProvider } from '@/services/NetworkProvider';
import { GhostLinkCallProvider } from '@/services/GhostLinkCallProvider';
import GhostLinkCallOverlay from '@/components/GhostLinkCallOverlay';
import { installGhostLinkNotificationOpenHandlers, registerPushToken } from '@/services/pushRegistration';
import { initRevenueCatOnce } from '@/services/revenueCatInit';
import { loadBrandFonts } from '@/services/brandFontService';
import { applyAndroidNavigationBarChrome, installAndroidNavigationBarImmersiveGuard } from '@/services/androidNavigationChrome';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { checkInactivitySignOutWithoutTouch, enforceInactivitySignOutIfNeeded } from '@/services/sessionInactivity';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import Toast from 'react-native-toast-message';
import { useLookMode } from '@/services/lookMode';
import BrandNodesBackground from '@/components/BrandNodesBackground';
import palette from './theme';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <LanguageProvider>
            <LookModeProvider>
              <NetworkProvider>
                <RootNavigator />
              </NetworkProvider>
            </LookModeProvider>
          </LanguageProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

function RootNavigator() {
  const router = useRouter();
  /** Oculta la UI en app switcher / transiciones del sistema (inactive/background). */
  const [privacyOverlayVisible, setPrivacyOverlayVisible] = useState(false);
  const appState = useRef(AppState.currentState);
  const isMounted = useRef(true);
  const inactivityRedirectChainRef = useRef(Promise.resolve());
  const language = useAppLanguage();

  const routerRef = useRef(router);
  routerRef.current = router;

  /** Encola comprobaciones de inactividad y como máximo una sustitución a /signin por tanda (sin paralelismo). */
  const enqueueInactivitySignOutReplace = useCallback((probe: () => Promise<'ok' | 'signed_out'>): Promise<void> => {
    const next = inactivityRedirectChainRef.current
      .catch(() => {})
      .then(async () => {
        const r = await probe();
        if (r === 'signed_out') {
          routerRef.current.replace('/signin');
        }
      });
    inactivityRedirectChainRef.current = next;
    return next;
  }, []);

  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const shell = palette[isDark ? 'dark' : 'light'];

  const rootStackScreenOptions = useMemo(
    () => ({
      contentStyle: { backgroundColor: 'transparent' },
      animation: 'default' as const,
    }),
    [shell.backgroundSolid],
  );

  const privacyOverlayStyle = useMemo(
    () => [
      StyleSheet.absoluteFill,
      {
        backgroundColor: shell.backgroundSolid,
        zIndex: 1_000_000,
      },
    ],
    [shell.backgroundSolid]
  );

  useEffect(() => {
    isMounted.current = true;

    const probeInactivity = () => {
      void enqueueInactivitySignOutReplace(() => enforceInactivitySignOutIfNeeded());
    };

    probeInactivity();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        setPrivacyOverlayVisible(true);
      } else if (nextState === 'active') {
        setPrivacyOverlayVisible(false);
      }

      if (
        (appState.current === 'background' || appState.current === 'inactive') &&
        nextState === 'active'
      ) {
        probeInactivity();
      }
      appState.current = nextState;
    });

    return () => {
      isMounted.current = false;
      sub.remove();
    };
  }, [enqueueInactivitySignOutReplace]);

  /** Android: intenta mantener ◀ ● □ en modo inmersivo y con contraste correcto. */
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const darkBg = isDark;
    void applyAndroidNavigationBarChrome(darkBg);
    return installAndroidNavigationBarImmersiveGuard(darkBg);
  }, [isDark]);

  useEffect(() => {
    initRevenueCatOnce();
  }, []);

  useEffect(() => {
    void loadBrandFonts();
  }, []);

  useEffect(() => {
    void registerPushToken();
  }, []);

  useEffect(() => {
    return installGhostLinkNotificationOpenHandlers();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      if (!isMounted.current) return;
      void (async () => {
        try {
          await enqueueInactivitySignOutReplace(() => checkInactivitySignOutWithoutTouch());
        } catch {
          /* ignore */
        }
      })();
    }, 180_000);
    return () => clearInterval(id);
  }, [enqueueInactivitySignOutReplace]);

  return (
    <View style={styles.rootShell}>
      <BrandNodesBackground mode={isDark ? 'night' : 'day'} />
      <View style={styles.appContent}>
      <GhostLinkCallProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} translucent backgroundColor="transparent" />
        <Stack screenOptions={rootStackScreenOptions}>
          {/* Forzamos a que la primera pantalla sea el Index (Bienvenida) */}
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="signin"
            options={{
              title: language === 'en' || language === 'de' ? 'Sign In' : 'Iniciar sesión',
              headerStyle: { backgroundColor: '#fff' },
            }}
          />
          <Stack.Screen
            name="register"
            options={{ title: language === 'en' || language === 'de' ? 'Sign Up' : 'Registro' }}
          />
          <Stack.Screen
            name="onboarding"
            options={{
              headerShown: false,
              gestureEnabled: false,
              animation: 'fade',
            }}
          />
          <Stack.Screen
            name="scan"
            options={{ title: language === 'en' || language === 'de' ? 'Scan Card' : 'Escanear Tarjeta', headerShown: false }}
          />
          <Stack.Screen name="nfc" options={{ headerShown: false }} />
          <Stack.Screen name="vault_store" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="u" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <GhostLinkCallOverlay />
        <PendingBunkerRedeemGate />
        <PremiumDataPanelHost />
        <Toast />
      </GhostLinkCallProvider>
      <BiometricResumeOverlay />
      {privacyOverlayVisible ? (
        <View style={privacyOverlayStyle} pointerEvents="none" />
      ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootShell: {
    flex: 1,
    position: 'relative',
  },
  appContent: {
    flex: 1,
    zIndex: 1,
    elevation: 1,
  },
});
