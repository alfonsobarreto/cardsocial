import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Alert } from 'react-native';

import {
  APP_LANGUAGE_STORAGE_KEY,
  coreT,
  type AppLanguage,
  isAppLanguage,
} from '@/services/coreI18n';
import { beginBiometricResumeSuppression } from '@/services/biometricResumeSuppression';

const PRESIDENTIAL_SECURITY_STORAGE_KEY = '@cs_presidential_security';

export async function getPresidentialSecurityEnabled(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(PRESIDENTIAL_SECURITY_STORAGE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

export async function setPresidentialSecurityEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PRESIDENTIAL_SECURITY_STORAGE_KEY, String(enabled));
  } catch (error) {
    console.warn('Error saving presidential security state:', error);
  }
}

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
  const endSuppression = beginBiometricResumeSuppression();
  try {
    const lang = await getStoredAppLanguage();
    const prompt = reason?.trim() || coreT('biometric_verify_identity_continue', lang);

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      fallbackLabel: fallbackToDevicePassword ? 'Usa PIN o contraseña' : 'No disponible',
      disableDeviceFallback: !fallbackToDevicePassword,
    });

    return result.success;
  } finally {
    endSuppression();
  }
}

/**
 * Biometría del sistema sin alertas extra al fallar/cancelar.
 * Respeta Seguridad Presidencial: si está off, devuelve true.
 */
export async function runPresidentialBiometricGate(actionLabel?: string): Promise<boolean> {
  const policyOn = await getPresidentialSecurityEnabled();
  if (!policyOn) {
    return true;
  }

  const lang = await getStoredAppLanguage();
  const action =
    actionLabel && actionLabel.trim() ? actionLabel.trim() : coreT('biometric_action_default', lang);
  const reason = coreT('biometric_prompt_authorize_access', lang, { action });
  return authenticateWithBiometric(reason, true);
}

export type ConfirmBiometricParams = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** Etiqueta para el prompt biométrico del sistema. */
  biometricReason?: string;
  destructive?: boolean;
};

/**
 * Flujo estándar para acciones sensibles:
 * 1) Alert de confirmación
 * 2) Si el usuario confirma → biometría automática (Face ID / huella / PIN del sistema)
 * 3) Resuelve true solo si confirmó y pasó biometría (o política desactivada)
 */
export function confirmThenRequireBiometric(params: ConfirmBiometricParams): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    void (async () => {
      const lang = await getStoredAppLanguage();
      Alert.alert(
        params.title,
        params.message,
        [
          {
            text: params.cancelText || coreT('common_cancel', lang),
            style: 'cancel',
            onPress: () => finish(false),
          },
          {
            text: params.confirmText || coreT('common_confirm', lang),
            style: params.destructive ? 'destructive' : 'default',
            onPress: () => {
              void (async () => {
                const ok = await runPresidentialBiometricGate(params.biometricReason);
                finish(ok);
              })();
            },
          },
        ],
        { cancelable: true, onDismiss: () => finish(false) },
      );
    })();
  });
}

/** @deprecated Prefer {@link runPresidentialBiometricGate} — no muestra alertas al fallar. */
export async function hardLockCheck(actionLabel?: string): Promise<boolean> {
  return runPresidentialBiometricGate(actionLabel);
}

/**
 * Único gate de producto para pantallas no destructivas (p. ej. abrir Gestión de Relaciones).
 */
export async function requireBiometricIfPolicyEnabled(actionLabel?: string): Promise<boolean> {
  return runPresidentialBiometricGate(actionLabel);
}
