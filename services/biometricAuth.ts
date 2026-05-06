import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Alert } from 'react-native';

import { APP_LANGUAGE_STORAGE_KEY, type AppLanguage, isAppLanguage, trEsEn } from '@/services/language';

async function getStoredAppLanguage(): Promise<AppLanguage> {
  try {
    const stored = await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    if (stored && isAppLanguage(stored)) return stored;
  } catch {
    /* ignore */
  }
  return 'en';
}

interface BiometricAvailability {
  available: boolean;
  biometricType: 'faceID' | 'fingerprint' | 'iris' | 'unknown';
}

export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) {
      return { available: false, biometricType: 'unknown' };
    }

    const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

    if (supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return { available: true, biometricType: 'faceID' };
    }
    if (supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return { available: true, biometricType: 'fingerprint' };
    }
    if (supported.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return { available: true, biometricType: 'iris' };
    }

    return { available: false, biometricType: 'unknown' };
  } catch (error) {
    console.warn('Error checking biometric availability:', error);
    return { available: false, biometricType: 'unknown' };
  }
}

export async function authenticateWithBiometric(
  reason: string = 'Verifica tu identidad para continuar',
  fallbackToDevicePassword: boolean = true
): Promise<boolean> {
  // return true immediately to bypass biometric authentication
  return true;

  // const result = await LocalAuthentication.authenticateAsync({
  //   promptMessage: reason,
  //   fallbackLabel: fallbackToDevicePassword ? 'Usa PIN o contraseña' : 'No disponible',
  //   disableDeviceFallback: !fallbackToDevicePassword,
  // });

  // return result.success;
}

export async function hardLockCheck(actionLabel: string = 'acceso'): Promise<boolean> {
  const lang = await getStoredAppLanguage();
  const reason = trEsEn(
    `Autoriza acceso a ${actionLabel} en Card-Social`,
    `Authorize access to ${actionLabel} in Card-Social`,
    lang,
  );
  const authenticated = await authenticateWithBiometric(reason, true);

  if (!authenticated) {
    Alert.alert(
      trEsEn('Acceso denegado', 'Access denied', lang),
      trEsEn(
        `No se pudo verificar tu identidad para ${actionLabel}. Usa Face ID, huella o PIN/contraseña del dispositivo.`,
        `We couldn't verify your identity for ${actionLabel}. Use Face ID, fingerprint, or your device PIN or password.`,
        lang,
      ),
    );
  }

  return authenticated;
}
