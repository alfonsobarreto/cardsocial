import 'react-native-get-random-values';

import '@/i18n';
import ErrorBoundary from '@/components/ErrorBoundary';
import PremiumDataPanelHost from '@/components/PremiumDataPanelHost';
import { PendingBunkerRedeemGate } from '@/components/PendingBunkerRedeemGate';
import { coreT, useAppLanguage } from '@/services/coreI18n';
import { LanguageProvider } from '@/services/language';
import { LookModeProvider } from '@/services/lookMode';
import { NetworkProvider } from '@/services/NetworkProvider';
import { GhostLinkCallProvider } from '@/services/GhostLinkCallProvider';
import GhostLinkCallOverlay from '@/components/GhostLinkCallOverlay';
import { registerPushToken } from '@/services/pushRegistration';
import { initRevenueCatOnce } from '@/services/revenueCatInit';
import * as LocalAuthentication from 'expo-local-authentication';
import { Stack, useRouter } from 'expo-router';
import { checkInactivitySignOutWithoutTouch, enforceInactivitySignOutIfNeeded } from '@/services/sessionInactivity';
import { getAppLockEnabledRaw } from '@/services/appLockSecureStorage';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import { useLookMode } from '@/services/lookMode';
import palette from './theme';
import { brandCsLogo } from '@/constants/brandAssets';


export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <LanguageProvider>
          <LookModeProvider>
            <NetworkProvider>
              <RootNavigator />
            </NetworkProvider>
          </LookModeProvider>
        </LanguageProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}


function RootNavigator() {
  const router = useRouter();
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  /** Oculta la UI en app switcher / transiciones del sistema (inactive/background). */
  const [privacyOverlayVisible, setPrivacyOverlayVisible] = useState(false);
  const appState = useRef(AppState.currentState);
  const isAuthenticatingBiometrics = useRef(false);
  const isMounted = useRef(true);
  const inactivityRedirectChainRef = useRef<Promise<unknown>>(Promise.resolve());
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
  }, [router]);
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const shell = palette[isDark ? 'dark' : 'light'];
  const lockStyles = useMemo(
    () =>
      StyleSheet.create({
        lockScreen: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        logo: {
          width: 120,
          height: 120,
          marginBottom: 32,
        },
        lockTitle: {
          color: shell.fabText,
          fontSize: 22,
          fontWeight: 'bold',
          marginBottom: 32,
        },
        unlockButton: {
          backgroundColor: shell.refreshAccent,
          paddingVertical: 18,
          paddingHorizontal: 36,
          borderRadius: 32,
          marginTop: 12,
        },
        unlockButtonText: {
          color: shell.fabText,
          fontSize: 18,
          fontWeight: 'bold',
        },
      }),
    [shell]
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

  const handleBiometricAuth = useCallback(async () => {
    setIsLoading(true);
    try {
      isAuthenticatingBiometrics.current = true;
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: coreT('misc_lock_bunker_biometric_prompt', language),
        fallbackLabel: coreT('misc_lock_use_passcode', language),
      });
      if (result.success) {
        setIsLocked(false);
        try {
          await enqueueInactivitySignOutReplace(() => enforceInactivitySignOutIfNeeded());
        } catch {
          /* ignore */
        }
      } else {
        setIsLocked(true);
      }
    } catch {
      setIsLocked(true);
    } finally {
      isAuthenticatingBiometrics.current = false;
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [language, enqueueInactivitySignOutReplace]);

  const handleBiometricAuthRef = useRef(handleBiometricAuth);
  handleBiometricAuthRef.current = handleBiometricAuth;

  useEffect(() => {
    isMounted.current = true;

    const checkLock = async () => {
      try {
        const enabled = await getAppLockEnabledRaw();
        if (enabled === 'true') {
          setIsLocked(true);
          await handleBiometricAuthRef.current();
        } else if (enabled == null || enabled === '' || enabled === 'false') {
          setIsLocked(false);
          try {
            await enqueueInactivitySignOutReplace(() => enforceInactivitySignOutIfNeeded());
          } catch {
            /* ignore */
          }
        } else {
          setIsLocked(true);
          await handleBiometricAuthRef.current();
        }
      } catch {
        setIsLocked(true);
        await handleBiometricAuthRef.current();
      }
    };

    void checkLock();

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
        // Si regresamos a 'active' pero estábamos en medio de nuestro propio prompt de biometría, NO ejecutamos checkLock
        if (!isAuthenticatingBiometrics.current) {
          void checkLock();
        }
      }
      appState.current = nextState;
    });

    return () => {
      isMounted.current = false;
      sub.remove();
    };
  }, [enqueueInactivitySignOutReplace]);

  useEffect(() => {
    initRevenueCatOnce();
  }, []);

  useEffect(() => {
    if (!isLocked) {
      void registerPushToken();
    }
  }, [isLocked]);

  useEffect(() => {
    if (isLocked) return;
    /** 3 min: menos lecturas AsyncStorage / menos presión en JS mientras la app está abierta. */
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
  }, [isLocked, enqueueInactivitySignOutReplace]);

  const mainContent = isLocked ? (
    <LinearGradient colors={[...shell.vipBannerGradient]} style={lockStyles.lockScreen}>
      <Image source={brandCsLogo} style={lockStyles.logo} resizeMode="contain" />
      <Text style={lockStyles.lockTitle}>{coreT('misc_lock_bunker_title', language)}</Text>
      <TouchableOpacity
        style={lockStyles.unlockButton}
        onPress={handleBiometricAuth}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={shell.fabText} />
        ) : (
          <Text style={lockStyles.unlockButtonText}>{coreT('misc_lock_unlock_bunker', language)}</Text>
        )}
      </TouchableOpacity>
    </LinearGradient>
  ) : (
    <GhostLinkCallProvider>
      <Stack>
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
  );

  return (
    <View style={styles.rootShell}>
      {mainContent}
      {privacyOverlayVisible ? (
        <View style={privacyOverlayStyle} pointerEvents="none" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rootShell: {
    flex: 1,
  },
});
