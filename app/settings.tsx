import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Sharing from 'expo-sharing';
import { doc, getDoc } from 'firebase/firestore';
import React, { useMemo } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useLookMode } from '@/services/lookMode';
import { auth, db } from '../services/firebaseConfig';
import palette from './theme';

export default function SettingsScreen() {
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const shell = palette[isDark ? 'dark' : 'light'];

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
        const { status } = await Notifications.getPermissionsAsync();
        setIsNotificationsEnabled(status === 'granted');
      } catch {}
    };
    checkNotifications();
  }, []);

  const toggleNotifications = async () => {
    const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    if (isExpoGo) {
      Alert.alert('No disponible', 'Las notificaciones push requieren un development build. No están disponibles en Expo Go.');
      return;
    }
    if (!isNotificationsEnabled) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        setIsNotificationsEnabled(true);
      } else {
        setIsNotificationsEnabled(false);
        Alert.alert('Permiso requerido', 'Debes habilitar las notificaciones en la configuración de tu dispositivo.');
      }
    } else {
      Alert.alert(
        'Desactivar notificaciones',
        'Para desactivar las notificaciones, por favor ve a la Configuración de tu dispositivo.',
        [
          {
            text: 'Ir a Configuración',
            onPress: () => Linking.openSettings(),
          },
          { text: 'Cancelar', style: 'cancel' },
        ]
      );
    }
  };

  const toggleAppLock = async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        Alert.alert('No disponible', 'Tu dispositivo no soporta autenticación biométrica.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Autentica para activar el bloqueo de app',
        fallbackLabel: 'Usar código',
      });
      if (!result.success) {
        Alert.alert('Error', 'No se pudo activar el bloqueo de app.');
        return;
      }
    }
    try {
      await AsyncStorage.setItem('APP_LOCK_ENABLED', value ? 'true' : 'false');
      setAppLockEnabled(value);
      if (!value) {
        Alert.alert('Desactivado', 'El bloqueo de app ha sido desactivado.');
      }
    } catch {
      Alert.alert('Error', 'No se pudo guardar la configuración.');
    }
  };

  const handleSupportPress = async () => {
    try {
      await Linking.openURL('mailto:soporte@card-social.com?subject=Soporte%20Card-Social');
    } catch {
      Alert.alert('Error', 'No se encontró una aplicación de correo instalada en este dispositivo.');
    }
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      // @ts-expect-error: Propiedad no tipada pero existe en runtime
      const cacheDir = FileSystem.cacheDirectory;
      if (Platform.OS === 'web' || !cacheDir) {
        Alert.alert(
          'No disponible',
          'Limpiar cache solo está disponible en dispositivos nativos (iOS/Android).'
        );
        return;
      }
      const files = await FileSystem.readDirectoryAsync(cacheDir);
      for (const file of files) {
        const fileUri = cacheDir + file;
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      }
      Alert.alert('Éxito', 'El cache se ha limpiado correctamente. Tu aplicación ahora es más rápida.');
    } catch (error) {
      console.error('Error al limpiar cache:', error);
      Alert.alert('Error', 'No se pudo limpiar el cache. Intenta nuevamente.');
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('No user');
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (!userDoc.exists()) throw new Error('No data');
      const stringData = JSON.stringify(userDoc.data(), null, 2);
      // @ts-expect-error: Propiedad no tipada pero existe en runtime
      const fileUri = FileSystem.documentDirectory + 'CardSocial_MisDatos.json';
      await FileSystem.writeAsStringAsync(fileUri, stringData);
      await Sharing.shareAsync(fileUri, { dialogTitle: 'Tus datos de Card-Social' });
    } catch {
      Alert.alert('Error', 'No se pudieron exportar los datos.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleActiveSessions = () => {
    const marca = Device.brand || 'Desconocida';
    const modelo = Device.modelName || 'Desconocido';
    const sistema = Device.osName || 'Desconocido';
    Alert.alert(
      'Sesión Actual',
      `Estás conectado de forma segura en este dispositivo:\n\nMarca: ${marca}\nModelo: ${modelo}\nSistema: ${sistema}\n\nPor seguridad, si necesitas desconectar otros dispositivos, te recomendamos cambiar tu contraseña.`,
      [{ text: 'Entendido' }]
    );
  };

  const iconTint = shell.ctaPrimary;
  const switchOnThumb = shell.ctaAccent;
  const switchOffThumb = shell.textMuted;
  const switchTrackOn = shell.typeBadgeBg;
  const switchTrackOff = shell.surfaceMuted;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Section title="Seguridad y Privacidad">
        <View style={styles.item}>
          <MaterialCommunityIcons name="lock-outline" size={20} color={iconTint} />
          <Text style={styles.itemText}>Bloqueo de App</Text>
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
          <Text style={styles.itemText}>Sesiones Activas</Text>
        </TouchableOpacity>
      </Section>

      <Section title="Preferencias">
        <View style={styles.item}>
          <MaterialCommunityIcons name="bell-outline" size={20} color={iconTint} />
          <Text style={styles.itemText}>Notificaciones</Text>
          <Switch
            value={isNotificationsEnabled}
            onValueChange={toggleNotifications}
            thumbColor={isNotificationsEnabled ? switchOnThumb : switchOffThumb}
            trackColor={{ true: switchTrackOn, false: switchTrackOff }}
          />
        </View>
      </Section>

      <Section title="Datos">
        <TouchableOpacity style={styles.item} onPress={handleExportData} disabled={isExporting}>
          <MaterialCommunityIcons name="export-variant" size={20} color={iconTint} />
          {isExporting ? (
            <>
              <ActivityIndicator size="small" color={iconTint} style={{ marginLeft: 12, marginRight: 6 }} />
              <Text style={styles.itemText}>Recopilando datos...</Text>
            </>
          ) : (
            <Text style={styles.itemText}>Exportar mi informacion</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.item} onPress={handleClearCache} disabled={isClearingCache}>
          <MaterialCommunityIcons name="delete-outline" size={20} color={iconTint} />
          {isClearingCache ? (
            <>
              <ActivityIndicator size="small" color={iconTint} style={{ marginLeft: 12, marginRight: 6 }} />
              <Text style={styles.itemText}>Limpiando...</Text>
            </>
          ) : (
            <Text style={styles.itemText}>Limpiar Cache</Text>
          )}
        </TouchableOpacity>
      </Section>

      <Section title="Soporte y Legal">
        <TouchableOpacity style={styles.item} onPress={handleSupportPress}>
          <MaterialCommunityIcons name="lifebuoy" size={20} color={iconTint} />
          <Text style={styles.itemText}>Soporte</Text>
        </TouchableOpacity>
      </Section>

      <View style={styles.versionBox}>
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </View>
    </ScrollView>
  );
}
