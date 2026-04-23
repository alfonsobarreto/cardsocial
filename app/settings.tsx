import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
// expo-notifications is imported lazily below to avoid a crash on Android (Expo Go)
// where the module calls addPushTokenListener at module-load time.
import { trEsEn, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { clearLocalCachesForSignOut } from '@/services/userScopedStorage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useMemo } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../services/firebaseConfig';
import palette from './theme';

export default function SettingsScreen() {
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const shell = palette[isDark ? 'dark' : 'light'];
  const { language } = useLanguage();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
  const router = useRouter();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          padding: 20,
          paddingBottom: 40,
          backgroundColor: shell.backgroundSolid,
        },
        section: {
          marginBottom: 28,
        },
        sectionTitle: {
          fontSize: 16,
          fontWeight: '700',
          color: shell.ctaPrimary,
          marginBottom: 10,
        },
        item: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 8,
          borderRadius: 8,
          backgroundColor: shell.surface,
          marginBottom: 8,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: shell.border,
          shadowColor: shell.subtleShadow,
          shadowOpacity: isDark ? 0.35 : 0.06,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        },
        itemText: {
          marginLeft: 12,
          fontSize: 15,
          color: shell.textPrimary,
          flex: 1,
        },
        versionBox: {
          marginTop: 32,
          alignItems: 'center',
        },
        versionText: {
          color: shell.textSecondary,
          fontSize: 13,
          fontWeight: '500',
        },
      }),
    [shell, isDark]
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  const [isNotificationsEnabled, setIsNotificationsEnabled] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [isClearingCache, setIsClearingCache] = React.useState(false);
  const [appLockEnabled, setAppLockEnabled] = React.useState(false);
  const [isLoadingAppLock, setIsLoadingAppLock] = React.useState(true);

  React.useEffect(() => {
    const loadAppLock = async () => {
      try {
        const value = await AsyncStorage.getItem('APP_LOCK_ENABLED');
        setAppLockEnabled(value === 'true');
      } catch {
        setAppLockEnabled(false);
      } finally {
        setIsLoadingAppLock(false);
      }
    };
    loadAppLock();

    const checkNotifications = async () => {
      try {
        const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
        if (isExpoGo) return;
        const Notifications = await import('expo-notifications');
        const { status } = await Notifications.getPermissionsAsync();
        setIsNotificationsEnabled(status === 'granted');
      } catch {}
    };
    checkNotifications();
  }, []);

  const toggleNotifications = async () => {
    const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    if (isExpoGo) {
      Alert.alert(
        tr('No disponible', 'Not available'),
        tr(
          'Las notificaciones push requieren un development build. No están disponibles en Expo Go.',
          'Push notifications require a development build. They are not available in Expo Go.',
        ),
      );
      return;
    }
    if (!isNotificationsEnabled) {
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        setIsNotificationsEnabled(true);
      } else {
        setIsNotificationsEnabled(false);
        Alert.alert(
          tr('Permiso requerido', 'Permission required'),
          tr('Debes habilitar las notificaciones en la configuración de tu dispositivo.', 'Enable notifications in your device settings.'),
        );
      }
    } else {
      Alert.alert(
        tr('Desactivar notificaciones', 'Turn off notifications'),
        tr('Para desactivar las notificaciones, abre Ajustes del dispositivo.', 'To turn off notifications, open your device Settings.'),
        [
          {
            text: tr('Ir a Configuración', 'Open Settings'),
            onPress: () => Linking.openSettings(),
          },
          { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        ],
      );
    }
  };

  const toggleAppLock = async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          tr('No disponible', 'Not available'),
          tr('Tu dispositivo no soporta autenticación biométrica.', 'Your device does not support biometric authentication.'),
        );
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: tr('Autentica para activar el bloqueo de app', 'Authenticate to enable app lock'),
        fallbackLabel: tr('Usar código', 'Use passcode'),
      });
      if (!result.success) {
        Alert.alert(
          tr('Error', 'Error'),
          tr('No se pudo activar el bloqueo de app.', 'Could not enable app lock.'),
        );
        return;
      }
    }
    try {
      await AsyncStorage.setItem('APP_LOCK_ENABLED', value ? 'true' : 'false');
      setAppLockEnabled(value);
      if (!value) {
        Alert.alert(
          tr('Desactivado', 'Disabled'),
          tr('El bloqueo de app ha sido desactivado.', 'App lock has been turned off.'),
        );
      }
    } catch {
      Alert.alert(
        tr('Error', 'Error'),
        tr('No se pudo guardar la configuración.', 'Could not save settings.'),
      );
    }
  };

  const handleSupportPress = async () => {
    try {
      await Linking.openURL('mailto:soporte@card-social.com?subject=Soporte%20Card-Social');
    } catch {
      Alert.alert(
        tr('Error', 'Error'),
        tr('No se encontró una aplicación de correo instalada en este dispositivo.', 'No email app was found on this device.'),
      );
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      tr('¿Limpiar caché?', 'Clear Cache?'),
      tr(
        'Esto borrará todos los datos locales, preferencias e imágenes cacheadas, y cerrará tu sesión.',
        'This will erase all local data, preferences and cached images, and sign you out.',
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        {
          text: tr('Limpiar y salir', 'Clear & Sign out'),
          style: 'destructive',
          onPress: async () => {
            setIsClearingCache(true);
            // Capture uid before any clearing (auth.currentUser could be null after)
            const uid = auth.currentUser?.uid ?? null;
            try {
              // 1. Expo-image: clear disk + memory image caches (best-effort)
              await Promise.allSettled([
                ExpoImage.clearDiskCache(),
                ExpoImage.clearMemoryCache(),
              ]);

              // 2. FileSystem cache directory (best-effort)
              const cacheDir = FileSystem.cacheDirectory;
              if (cacheDir) {
                try {
                  const files = await FileSystem.readDirectoryAsync(cacheDir);
                  await Promise.allSettled(
                    files.map((f) => FileSystem.deleteAsync(cacheDir + f, { idempotent: true }))
                  );
                } catch { /* cacheDir vacío o no accesible */ }
              }

              // 3. AsyncStorage: clear all local preferences + bunker cache (best-effort)
              try { await AsyncStorage.clear(); } catch { /* ignore */ }
            } catch { /* ignore partial failures */ }

            // 4. Sign out — always runs regardless of cache clearing errors
            try {
              await clearLocalCachesForSignOut(uid);
              await signOut(auth);
            } catch (e: any) {
              console.error('Sign out error:', e);
              Alert.alert(
                tr('Error', 'Error'),
                tr('No se pudo cerrar la sesión. Intenta de nuevo.', 'Could not sign out. Try again.'),
              );
            } finally {
              setIsClearingCache(false);
              router.replace('/');
            }
          },
        },
      ]
    );
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('No user');
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (!userDoc.exists()) throw new Error('No data');
      const stringData = JSON.stringify(userDoc.data(), null, 2);
      const fileUri = FileSystem.documentDirectory + 'CardSocial_MisDatos.json';
      await FileSystem.writeAsStringAsync(fileUri, stringData);
      await Sharing.shareAsync(fileUri, { dialogTitle: tr('Tus datos de Card-Social', 'Your Card-Social data') });
    } catch {
      Alert.alert(
        tr('Error', 'Error'),
        tr('No se pudieron exportar los datos.', 'Could not export data.'),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleActiveSessions = () => {
    const marca = Device.brand || tr('Desconocida', 'Unknown');
    const modelo = Device.modelName || tr('Desconocido', 'Unknown');
    const sistema = Device.osName || tr('Desconocido', 'Unknown');
    Alert.alert(
      tr('Sesión actual', 'Current session'),
      tr(
        `Estás conectado de forma segura en este dispositivo:\n\nMarca: ${marca}\nModelo: ${modelo}\nSistema: ${sistema}\n\nPor seguridad, si necesitas desconectar otros dispositivos, te recomendamos cambiar tu contraseña.`,
        `You are securely signed in on this device:\n\nBrand: ${marca}\nModel: ${modelo}\nOS: ${sistema}\n\nFor your security, to disconnect other devices we recommend changing your password.`,
      ),
      [{ text: tr('Entendido', 'OK') }],
    );
  };

  const iconTint = shell.ctaPrimary;
  const switchOnThumb = shell.ctaAccent;
  const switchOffThumb = shell.textMuted;
  const switchTrackOn = shell.typeBadgeBg;
  const switchTrackOff = shell.surfaceMuted;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Section title={tr('Seguridad y privacidad', 'Security & privacy')}>
        <View style={styles.item}>
          <MaterialCommunityIcons name="lock-outline" size={20} color={iconTint} />
          <Text style={styles.itemText}>{tr('Bloqueo de app', 'App lock')}</Text>
          {isLoadingAppLock ? (
            <ActivityIndicator size="small" color={iconTint} style={{ marginLeft: 12 }} />
          ) : (
            <Switch
              value={appLockEnabled}
              onValueChange={toggleAppLock}
              thumbColor={appLockEnabled ? switchOnThumb : switchOffThumb}
              trackColor={{ true: switchTrackOn, false: switchTrackOff }}
            />
          )}
        </View>
        <TouchableOpacity style={styles.item} onPress={handleActiveSessions}>
          <MaterialCommunityIcons name="account-multiple-outline" size={20} color={iconTint} />
          <Text style={styles.itemText}>{tr('Sesiones activas', 'Active sessions')}</Text>
        </TouchableOpacity>
      </Section>

      <Section title={tr('Preferencias', 'Preferences')}>
        <View style={styles.item}>
          <MaterialCommunityIcons name="bell-outline" size={20} color={iconTint} />
          <Text style={styles.itemText}>{tr('Notificaciones', 'Notifications')}</Text>
          <Switch
            value={isNotificationsEnabled}
            onValueChange={toggleNotifications}
            thumbColor={isNotificationsEnabled ? switchOnThumb : switchOffThumb}
            trackColor={{ true: switchTrackOn, false: switchTrackOff }}
          />
        </View>
      </Section>

      <Section title={tr('Datos', 'Data')}>
        <TouchableOpacity style={styles.item} onPress={handleExportData} disabled={isExporting}>
          <MaterialCommunityIcons name="export-variant" size={20} color={iconTint} />
          {isExporting ? (
            <>
              <ActivityIndicator size="small" color={iconTint} style={{ marginLeft: 12, marginRight: 6 }} />
              <Text style={styles.itemText}>{tr('Recopilando datos…', 'Collecting data…')}</Text>
            </>
          ) : (
            <Text style={styles.itemText}>{tr('Exportar mi información', 'Export my data')}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.item} onPress={handleClearCache} disabled={isClearingCache}>
          <MaterialCommunityIcons name="delete-outline" size={20} color={iconTint} />
          {isClearingCache ? (
            <>
              <ActivityIndicator size="small" color={iconTint} style={{ marginLeft: 12, marginRight: 6 }} />
              <Text style={styles.itemText}>{tr('Limpiando…', 'Clearing…')}</Text>
            </>
          ) : (
            <Text style={styles.itemText}>{tr('Limpiar caché', 'Clear cache')}</Text>
          )}
        </TouchableOpacity>
      </Section>

      <Section title={tr('Soporte y legal', 'Support & legal')}>
        <TouchableOpacity style={styles.item} onPress={handleSupportPress}>
          <MaterialCommunityIcons name="lifebuoy" size={20} color={iconTint} />
          <Text style={styles.itemText}>{tr('Soporte', 'Support')}</Text>
        </TouchableOpacity>
      </Section>

      <View style={styles.versionBox}>
        <Text style={styles.versionText}>{tr('Versión 1.0.0', 'Version 1.0.0')}</Text>
      </View>
    </ScrollView>
  );
}
