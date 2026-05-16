import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Alert } from 'react-native';

import {
  APP_LANGUAGE_STORAGE_KEY,
  coreT,
  type AppLanguage,
  isAppLanguage,
} from '@/services/coreI18n';

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
  reason?: string,
  fallbackToDevicePassword: boolean = true,
): Promise<boolean> {
  // return true immediately to bypass biometric authentication
  return true;

  // const lang = await getStoredAppLanguage();
  // const prompt = reason?.trim() || coreT('biometric_verify_identity_continue', lang);
  // const result = await LocalAuthentication.authenticateAsync({
  //   promptMessage: prompt,
  //   fallbackLabel: fallbackToDevicePassword ? 'Usa PIN o contraseña' : 'No disponible',
  //   disableDeviceFallback: !fallbackToDevicePassword,
  // });

  // return result.success;
}

export async function hardLockCheck(actionLabel?: string): Promise<boolean> {
  const lang = await getStoredAppLanguage();
  const action =
    actionLabel && actionLabel.trim() ? actionLabel.trim() : coreT('biometric_action_default', lang);
  const reason = coreT('biometric_prompt_authorize_access', lang, { action });
  const authenticated = await authenticateWithBiometric(reason, true);

  if (!authenticated) {
    Alert.alert(
      coreT('biometric_access_denied_title', lang),
      coreT('biometric_access_denied_body', lang, { action }),
    );
  }

  return authenticated;
}
