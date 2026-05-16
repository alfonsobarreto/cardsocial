import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { APP_LOCK_ENABLED_STORAGE_KEY } from '@/services/sessionPolicyKeys';

/** Keychain/Keystore: accesible solo con dispositivo desbloqueado; no sincroniza entre dispositivos. */
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const NATIVE_READ_RETRIES = 3;
const RETRY_DELAY_MS = 80;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Intentos escalonados ante fallos efímeros del bridge nativo (sin leer AsyncStorage en texto plano).
 */
async function secureGetItemWithRetry(): Promise<string | null> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < NATIVE_READ_RETRIES; attempt++) {
    try {
      return await SecureStore.getItemAsync(APP_LOCK_ENABLED_STORAGE_KEY, SECURE_OPTIONS);
    } catch (e) {
      lastErr = e;
      if (attempt < NATIVE_READ_RETRIES - 1) {
        await delay(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('SecureStore.getItemAsync failed');
}

/**
 * Migra valor legado desde AsyncStorage una sola vez. Si el almacén seguro no acepta escritura,
 * se revierte sin borrar el legado (evita abrir la app en falso al perder el estado).
 */
async function migrateLegacyAsyncValueToSecureStore(): Promise<string | null> {
  const legacy = await AsyncStorage.getItem(APP_LOCK_ENABLED_STORAGE_KEY);
  if (legacy == null) return null;
  await SecureStore.setItemAsync(APP_LOCK_ENABLED_STORAGE_KEY, legacy, SECURE_OPTIONS);
  await AsyncStorage.removeItem(APP_LOCK_ENABLED_STORAGE_KEY);
  return legacy;
}

/**
 * Lee el flag del candado (`'true'` | `'false'` | null).
 * - iOS/Android: solo SecureStore tras migración; sin fallback a lectura en claro en errores (fail-closed vía `catch` en quien llama si se propaga la excepción).
 * - Web: AsyncStorage (sin Keystore en navegador).
 */
export async function getAppLockEnabledRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(APP_LOCK_ENABLED_STORAGE_KEY);
  }
  let v = await secureGetItemWithRetry();
  if (v == null) {
    v = await migrateLegacyAsyncValueToSecureStore();
  }
  return v;
}

export async function setAppLockEnabledRaw(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(APP_LOCK_ENABLED_STORAGE_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(APP_LOCK_ENABLED_STORAGE_KEY, value, SECURE_OPTIONS);
  await AsyncStorage.removeItem(APP_LOCK_ENABLED_STORAGE_KEY);
}

export async function removeAppLockEnabled(): Promise<void> {
  await AsyncStorage.removeItem(APP_LOCK_ENABLED_STORAGE_KEY);
  if (Platform.OS === 'web') {
    return;
  }
  try {
    await SecureStore.deleteItemAsync(APP_LOCK_ENABLED_STORAGE_KEY, SECURE_OPTIONS);
  } catch {
    /* entrada ausente o almacén no disponible */
  }
}
