import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth } from '@/services/firebaseConfig';
import { getActiveUserId } from '@/services/authSession';
import AdminDashboard from '@/components/AdminDashboard';
import { validateAdminAccess, getAdminPremiumStatus } from '@/services/adminAuthGuard';
import { LinearGradient } from 'expo-linear-gradient';
import { coreTrEsEn } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';

/**
 * Admin Dashboard (Protected Route)
 *
 * 🔐 SEGURIDAD:
 * 1. Verifica que el usuario sea super_admin (Pochobs)
 * 2. Requiere autenticación biométrica (FaceID/Huella OBLIGATORIA)
 * 3. Expulsa al Home si no tiene permisos
 *
 * URL: /admin/dashboard
 * Acceso: Solo para users con role === 'super_admin'
 * Biometric: HARD LOCK - Sin excepciones
 */

export default function AdminDashboardScreen() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [premiumStatus, setPremiumStatus] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    validateAccess();
  }, []);

  const validateAccess = async () => {
    try {
      setLoading(true);

      // Paso 1: Obtener usuario actual
      const currentUserId = await getActiveUserId();
      if (!currentUserId) {
        console.error('[AdminGuard] No authenticated user found');
        Alert.alert(
          tr('Error', 'Error'),
          tr('Sesión no válida. Por favor, inicia sesión nuevamente.', 'Invalid session. Please sign in again.'),
        );
        router.replace('/');
        return;
      }

      setUserId(currentUserId);

      // Paso 2: Validar acceso (rol + biometría)
      const accessResult = await validateAdminAccess(currentUserId);

      if (!accessResult.allowed) {
        console.warn('[AdminGuard] Access denied:', accessResult.reason);

        if (!accessResult.isSuperAdmin) {
          Alert.alert(
            tr('❌ Acceso denegado', '❌ Access denied'),
            tr(
              'Solo los administradores pueden acceder al panel de control.',
              'Only administrators can access the control panel.',
            ),
            [{ text: tr('OK', 'OK'), onPress: () => router.replace('/') }],
          );
        } else if (!accessResult.biometricAuthorized) {
          Alert.alert(
            tr('🔐 Verificación requerida', '🔐 Verification required'),
            tr(
              'La verificación biométrica es obligatoria. Por favor, inténtalo nuevamente.',
              'Biometric verification is required. Please try again.',
            ),
            [
              { text: tr('Reintentar', 'Retry'), onPress: validateAccess },
              { text: tr('Cancelar', 'Cancel'), onPress: () => router.back() },
            ],
          );
        }
        return;
      }

      // Paso 3: Obtener estado premium
      const status = await getAdminPremiumStatus(currentUserId);
      setPremiumStatus(status);

      // ✅ AUTORIZADO
      setAuthorized(true);
    } catch (error) {
      console.error('[AdminGuard] Validation error:', error);
      Alert.alert(
        tr('Error', 'Error'),
        tr('Hubo un error al validar el acceso.', 'There was an error validating access.'),
      );
      router.replace('/');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={['#F8F9FA', '#E8F0F8']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#070226" />
          <Text style={styles.loadingText}>{tr('Validando acceso…', 'Validating access…')}</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!authorized || !userId) {
    return (
      <LinearGradient colors={['#F8F9FA', '#E8F0F8']} style={styles.container}>
        <View style={styles.deniedContainer}>
          <Text style={styles.deniedTitle}>
            {tr('❌ Acceso denegado', '❌ Access denied')}
          </Text>
          <Text style={styles.deniedMessage}>
            {tr('No tienes permisos para acceder a este panel.', "You don't have access to this panel.")}
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.container}>
      {/* Admin Dashboard con acceso validado */}
      <AdminDashboard onClose={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#070226',
    fontWeight: '500',
  },
  deniedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  deniedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E74C3C',
  },
  deniedMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
