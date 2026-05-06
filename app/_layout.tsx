import 'react-native-get-random-values';

import '@/i18n';
import ErrorBoundary from '@/components/ErrorBoundary';
import PremiumDataPanelHost from '@/components/PremiumDataPanelHost';
import { PendingBunkerRedeemGate } from '@/components/PendingBunkerRedeemGate';
import { LanguageProvider, trEsEn, useLanguage } from '@/services/language';
import { LookModeProvider } from '@/services/lookMode';
import { NetworkProvider } from '@/services/NetworkProvider';
import { GhostLinkCallProvider } from '@/services/GhostLinkCallProvider';
import GhostLinkCallOverlay from '@/components/GhostLinkCallOverlay';
import { registerPushToken } from '@/services/pushRegistration';
import { initRevenueCatOnce } from '@/services/revenueCatInit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const { language } = useLanguage();
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
  const tr = (es: string, en: string) => trEsEn(es, en, language);

  // Función para lanzar biometría
  const handleBiometricAuth = async () => {
    setIsLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: tr('Búnker Card-Social: Identidad requerida', 'Card-Social Bunker: Identity required'),
        fallbackLabel: tr('Usar código', 'Use passcode'),
      });
      if (result.success) {
        setIsLocked(false);
      } else {
        setIsLocked(true);
      }
    } catch {
      setIsLocked(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Vigilante de AppState
  useEffect(() => {
    const checkLock = async () => {
      const enabled = await AsyncStorage.getItem('@app_lock_enabled');
      if (enabled === 'true') {
        setIsLocked(true);
        await handleBiometricAuth();
      } else {
        setIsLocked(false);
      }
    };

    // Al montar
    checkLock();

    // Al cambiar AppState
    const sub = AppState.addEventListener('change', (nextState) => {
      if (
        (appState.current === 'background' || appState.current === 'inactive') &&
        nextState === 'active'
      ) {
        checkLock();
      }
      appState.current = nextState;
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    initRevenueCatOnce();
  }, []);

  useEffect(() => {
    if (!isLocked) {
      void registerPushToken();
    }
  }, [isLocked]);

  // UI de bloqueo
  if (isLocked) {
    return (
      <LinearGradient colors={[...shell.vipBannerGradient]} style={lockStyles.lockScreen}>
        <Image source={brandCsLogo} style={lockStyles.logo} resizeMode="contain" />
        <Text style={lockStyles.lockTitle}>{tr('Búnker Card-Social', 'Card-Social Bunker')}</Text>
        <TouchableOpacity
          style={lockStyles.unlockButton}
          onPress={handleBiometricAuth}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={shell.fabText} />
          ) : (
            <Text style={lockStyles.unlockButtonText}>{tr('Desbloquear Búnker', 'Unlock Bunker')}</Text>
          )}
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  // UI normal (gestos: raíz en RootLayout → GestureHandlerRootView)
  return (
    <GhostLinkCallProvider>
      <Stack>
        {/* Forzamos a que la primera pantalla sea el Index (Bienvenida) */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="signin"
          options={{
            title: language === 'en' || language === 'de' ? 'Sign In' : 'Iniciar sesion',
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
        <Stack.Screen name="u" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <GhostLinkCallOverlay />
      <PendingBunkerRedeemGate />
      <PremiumDataPanelHost />
      <Toast />
    </GhostLinkCallProvider>
  );
}
