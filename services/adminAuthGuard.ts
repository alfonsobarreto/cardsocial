import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Admin Auth Guard - Protege el acceso al Admin Dashboard
 * 
 * 1. Verifica que el usuario tenga rol 'super_admin'
 * 2. Requiere FaceID/Huella obligatoriamente
 * 3. No permi permite acceso sin ambas validaciones
 */

export interface AdminAccessResult {
  allowed: boolean;
  reason?: string;
  isSuperAdmin?: boolean;
  biometricAuthorized?: boolean;
}

/**
 * Verifica si el usuario actual es super_admin (Pochobs)
 */
export const checkAdminRole = async (userId: string): Promise<boolean> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      console.error('User document not found');
      return false;
    }
    const role = userDoc.data().role || 'user';
    return role === 'super_admin';
  } catch (error) {
    console.error('Error checking admin role:', error);
    return false;
  }
};

/**
 * Realiza validación biométrica (FaceID para iOS, Fingerprint para Android)
 * HARD LOCK: No se puede circumventar
 */
export const validateAdminBiometric = async (): Promise<boolean> => {
  try {
    // Verificar disponibilidad de biometría
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) {
      console.warn('Biometric hardware not available');
      return false;
    }

    // Verificar que haya biometría configurada
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      console.warn('No biometric enrolled');
      return false;
    }

    // Ejecutar autenticación biométrica (FaceID en iOS, Fingerprint en Android)
    const result = await LocalAuthentication.authenticateAsync();

    return result.success;
  } catch (error) {
    console.error('Biometric validation error:', error);
    return false;
  }
};

/**
 * Validación completa para acceso al Admin Dashboard
 * Requiere AMBAS condiciones:
 * 1. Usuario es super_admin
 * 2. Biometría válida
 */
export const validateAdminAccess = async (userId: string): Promise<AdminAccessResult> => {
  // Step 1: Verificar rol
  const isSuperAdmin = await checkAdminRole(userId);
  if (!isSuperAdmin) {
    return {
      allowed: false,
      reason: 'Usuario no tiene permisos de administrador',
      isSuperAdmin: false,
      biometricAuthorized: false,
    };
  }

  // Step 2: Verificar biometría (HARD LOCK - no se puede skipear)
  const biometricAuthorized = await validateAdminBiometric();
  if (!biometricAuthorized) {
    return {
      allowed: false,
      reason: 'Verificación biométrica fallida',
      isSuperAdmin: true,
      biometricAuthorized: false,
    };
  }

  // ✅ AMBAS validaciones pasadas
  return {
    allowed: true,
    reason: 'Acceso autorizado',
    isSuperAdmin: true,
    biometricAuthorized: true,
  };
};

/**
 * Verifica si el usuario tiene credenciales infinitas (Pochobs)
 */
export const hasInfiniteCredits = async (userId: string): Promise<boolean> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return false;

    const data = userDoc.data();
    // Pochobs tiene 999M de créditos
    return (data.creditsBalance || 0) >= 999999999;
  } catch (error) {
    console.error('Error checking infinite credits:', error);
    return false;
  }
};

/**
 * Obtiene el estado premium completo de Pochobs
 */
export const getAdminPremiumStatus = async (userId: string): Promise<{
  isPremium: boolean;
  premiumUntil: string | null;
  hasInfinite: boolean;
  creditsBalance: number;
}> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return {
        isPremium: false,
        premiumUntil: null,
        hasInfinite: false,
        creditsBalance: 0,
      };
    }

    const data = userDoc.data();
    const creditsBalance = data.creditsBalance || 0;

    return {
      isPremium: data.isPremium || false,
      premiumUntil: data.premiumUntil || null,
      hasInfinite: creditsBalance >= 999999999,
      creditsBalance,
    };
  } catch (error) {
    console.error('Error getting admin premium status:', error);
    return {
      isPremium: false,
      premiumUntil: null,
      hasInfinite: false,
      creditsBalance: 0,
    };
  }
};
