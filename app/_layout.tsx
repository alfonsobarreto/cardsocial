import 'react-native-get-random-values';

import '@/i18n';
import ErrorBoundary from '@/components/ErrorBoundary';
import { LanguageProvider, useLanguage } from '@/services/language';
import { LookModeProvider } from '@/services/lookMode';
import { NetworkProvider } from '@/services/NetworkProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Stack } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';


export default function RootLayout() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <LookModeProvider>
          <NetworkProvider>
            <RootNavigator />
          </NetworkProvider>
        </LookModeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}


function RootNavigator() {
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const { language } = useLanguage();
  const tr = (es: string, en: string) => (language === 'en' ? en : es);

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

  // UI de bloqueo
  if (isLocked) {
    return (
      <View style={styles.lockScreen}>
        <Image
          source={require('@/assets/images/CSLogo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.lockTitle}>{tr('Búnker Card-Social', 'Card-Social Bunker')}</Text>
        <TouchableOpacity
          style={styles.unlockButton}
          onPress={handleBiometricAuth}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.unlockButtonText}>{tr('Desbloquear Búnker', 'Unlock Bunker')}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // UI normal
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        {/* Forzamos a que la primera pantalla sea el Index (Bienvenida) */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen 
          name="signin" 
          options={{ 
            title: language === 'en' ? 'Sign In' : 'Iniciar sesion',
            headerStyle: { backgroundColor: '#fff' }
          }} 
        />
        <Stack.Screen name="register" options={{ title: language === 'en' ? 'Sign Up' : 'Registro' }} />
        <Stack.Screen name="scan" options={{ title: language === 'en' ? 'Scan Card' : 'Escanear Tarjeta', headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <Toast />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  lockScreen: {
    flex: 1,
    backgroundColor: '#0D4D8A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 32,
  },
  lockTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 32,
  },
  unlockButton: {
    backgroundColor: '#1CB0F6',
    paddingVertical: 18,
    paddingHorizontal: 36,
    borderRadius: 32,
    marginTop: 12,
  },
  unlockButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});