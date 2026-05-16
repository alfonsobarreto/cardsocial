import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
// expo-notifications is imported lazily below to avoid a crash on Android (Expo Go)
// where the module calls addPushTokenListener at module-load time.
import { shareExportedUserProfileJson } from '@/services/exportUserProfileJson';
import { useCoreT } from '@/services/coreI18n';
import { useLookMode } from '@/services/lookMode';
import { clearLocalCachesForSignOut } from '@/services/userScopedStorage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import React, { useMemo } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAppLockEnabledRaw, setAppLockEnabledRaw } from '@/services/appLockSecureStorage';
import { auth } from '../services/firebaseConfig';
import palette from './theme';

export default function SettingsScreen() {
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const shell = palette[isDark ? 'dark' : 'light'];
  const t = useCoreT();
  const insets = useSafeAreaInsets();
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
        const value = await getAppLockEnabledRaw();
        setAppLockEnabled(value === 'true');
      } catch {
        /** Fail-closed coherente con el layout: si el almacén seguro falla, mostramos candado activo. */
        setAppLockEnabled(true);
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
        t('common_not_available'),
        t('settings_expo_push_body'),
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
          t('settings_permission_required'),
          t('settings_notifications_denied_body'),
        );
      }
    } else {
      Alert.alert(
        t('settings_notifications_disable_title'),
        t('settings_notifications_disable_body'),
        [
          {
            text: t('settings_open_device_settings'),
            onPress: () => Linking.openSettings(),
          },
          { text: t('common_cancel'), style: 'cancel' },
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
          t('common_not_available'),
          t('settings_biometric_unavailable_body'),
        );
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('settings_app_lock_prompt'),
        fallbackLabel: t('settings_use_passcode'),
      });
      if (!result.success) {
        Alert.alert(
          t('common_error'),
          t('settings_app_lock_enable_fail'),
        );
        return;
      }
    }
    try {
      await setAppLockEnabledRaw(value ? 'true' : 'false');
      setAppLockEnabled(value);
      if (!value) {
        Alert.alert(
          t('settings_app_lock_disabled_title'),
          t('settings_app_lock_disabled_body'),
        );
      }
    } catch {
      Alert.alert(
        t('common_error'),
        t('settings_save_fail'),
      );
    }
  };

  const handleSupportPress = async () => {
    try {
      await Linking.openURL('mailto:support@cardsocial.me?subject=Soporte%20Card-Social');
    } catch {
      Alert.alert(
        t('common_error'),
        t('settings_mail_app_missing'),
      );
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      t('settings_clear_cache_title'),
      t('settings_clear_cache_body'),
      [
        { text: t('common_cancel'), style: 'cancel' },
        {
          text: t('settings_clear_and_signout'),
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
            } catch (e: unknown) {
              console.error('Sign out error:', e);
              Alert.alert(
                t('common_error'),
                t('settings_sign_out_fail'),
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
      await shareExportedUserProfileJson(t('settings_export_subject'));
    } catch {
      Alert.alert(
        t('common_error'),
        t('settings_export_fail'),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleActiveSessions = () => {
    const marca = Device.brand || t('settings_device_unknown_brand');
    const modelo = Device.modelName || t('settings_device_unknown_model');
    const sistema = Device.osName || t('settings_device_unknown_model');
    Alert.alert(
      t('settings_session_title'),
      t('settings_session_body', { brand: marca, model: modelo, os: sistema }),
      [{ text: t('settings_understood') }],
    );
  };

  const iconTint = shell.ctaPrimary;
  const switchOnThumb = shell.ctaAccent;
  const switchOffThumb = shell.textMuted;
  const switchTrackOn = shell.typeBadgeBg;
  const switchTrackOff = shell.surfaceMuted;

  const appVersion =
    Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '1.0.0';

  return (
    <View style={{ flex: 1, backgroundColor: shell.backgroundSolid }}>
      {/* Header with back button */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: shell.border,
        }}
      >
        <TouchableOpacity
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.06)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: shell.border,
          }}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common_back')}
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color={shell.ctaPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: '700', color: shell.textPrimary, marginLeft: 12 }}>
          {t('settings_header_title')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.container}>
      <Section title={t('settings_section_security')}>
        <View style={styles.item}>
          <MaterialCommunityIcons name="lock-outline" size={20} color={iconTint} />
          <Text style={styles.itemText}>{t('settings_app_lock_label')}</Text>
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
          <Text style={styles.itemText}>{t('settings_active_sessions')}</Text>
        </TouchableOpacity>
      </Section>

      <Section title={t('settings_section_prefs')}>
        <View style={styles.item}>
          <MaterialCommunityIcons name="bell-outline" size={20} color={iconTint} />
          <Text style={styles.itemText}>{t('settings_notifications_label')}</Text>
          <Switch
            value={isNotificationsEnabled}
            onValueChange={toggleNotifications}
            thumbColor={isNotificationsEnabled ? switchOnThumb : switchOffThumb}
            trackColor={{ true: switchTrackOn, false: switchTrackOff }}
          />
        </View>
      </Section>

      <Section title={t('settings_section_data')}>
        <TouchableOpacity style={styles.item} onPress={handleExportData} disabled={isExporting}>
          <MaterialCommunityIcons name="export-variant" size={20} color={iconTint} />
          {isExporting ? (
            <>
              <ActivityIndicator size="small" color={iconTint} style={{ marginLeft: 12, marginRight: 6 }} />
              <Text style={styles.itemText}>{t('settings_collecting_data')}</Text>
            </>
          ) : (
            <Text style={styles.itemText}>{t('settings_export_label')}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.item} onPress={handleClearCache} disabled={isClearingCache}>
          <MaterialCommunityIcons name="delete-outline" size={20} color={iconTint} />
          {isClearingCache ? (
            <>
              <ActivityIndicator size="small" color={iconTint} style={{ marginLeft: 12, marginRight: 6 }} />
              <Text style={styles.itemText}>{t('settings_clearing')}</Text>
            </>
          ) : (
            <Text style={styles.itemText}>{t('settings_clear_cache_label')}</Text>
          )}
        </TouchableOpacity>
      </Section>

      <Section title={t('settings_section_support')}>
        <TouchableOpacity style={styles.item} onPress={handleSupportPress}>
          <MaterialCommunityIcons name="lifebuoy" size={20} color={iconTint} />
          <Text style={styles.itemText}>{t('settings_support_label')}</Text>
        </TouchableOpacity>
      </Section>

      <View style={styles.versionBox}>
        <Text style={styles.versionText}>{t('settings_version_label', { version: appVersion })}</Text>
      </View>
    </ScrollView>
    </View>
  );
}
