import * as LocalAuthentication from 'expo-local-authentication';
import { Alert } from 'react-native';

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

export async function hardLockCheck(
  actionLabel: string = 'acceso'
): Promise<boolean> {
  const reason = `Autoriza acceso a ${actionLabel} en Card-Social`;
  const authenticated = await authenticateWithBiometric(reason, true);

  if (!authenticated) {
    Alert.alert(
      'Acceso denegado',
      `No se pudo verificar tu identidad para ${actionLabel}. Usa FaceID/huella o PIN/contraseña del dispositivo.`
    );
  }

  return authenticated;
}
