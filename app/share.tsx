import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import palette from './theme';

export default function ShareScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => language === 'en' ? en : es;
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const shell = palette[isDark ? 'dark' : 'light'];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        },
        card: {
          width: '100%',
          maxWidth: 420,
          borderRadius: 18,
          backgroundColor: shell.surface,
          borderWidth: 1,
          borderColor: shell.border,
          padding: 18,
          alignItems: 'center',
        },
        title: {
          color: shell.ctaPrimary,
          fontSize: 24,
          fontWeight: '700',
        },
        subtitle: {
          marginTop: 4,
          color: shell.textSecondary,
          fontSize: 13,
        },
        noticeBox: {
          marginTop: 14,
          width: '100%',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: shell.border,
          backgroundColor: shell.surfaceMuted,
          paddingHorizontal: 12,
          paddingVertical: 10,
        },
        noticeText: {
          color: shell.textSecondary,
          fontSize: 13,
          textAlign: 'center',
          fontWeight: '600',
        },
        actionsRow: {
          marginTop: 16,
          width: '100%',
          flexDirection: 'row',
          gap: 10,
        },
        ghostBtn: {
          flex: 1,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: shell.border,
          backgroundColor: shell.surfaceMuted,
          paddingVertical: 11,
          alignItems: 'center',
        },
        ghostBtnText: {
          color: shell.ctaPrimary,
          fontWeight: '700',
        },
        primaryBtn: {
          flex: 1,
          borderRadius: 10,
          backgroundColor: shell.ctaPrimary,
          paddingVertical: 11,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
        },
        primaryBtnText: {
          color: shell.btnPrimaryText,
          fontWeight: '700',
        },
      }),
    [shell]
  );

  return (
    <LinearGradient colors={[...shell.tabShellGradient]} style={styles.container}>
      <View style={styles.card}>
        <MaterialCommunityIcons name="shield-lock-outline" size={44} color={shell.ctaPrimary} />
        <Text style={styles.title}>{tr('Flujo Legacy Deshabilitado', 'Legacy Flow Disabled')}</Text>
        <Text style={styles.subtitle}>
          {tr(
            'Por privacidad, los QR ahora se generan solo desde una tarjeta específica en Cards.',
            'For privacy, QR codes are now generated only from a specific card in Cards.'
          )}
        </Text>
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            {tr(
              'Comparte acceso por tarjeta (cardId), no datos directos.',
              'Share card-scoped access (cardId), not raw data.'
            )}
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => router.replace('/(tabs)/cards' as any)}>
            <Text style={styles.ghostBtnText}>{tr('Ir a Tarjetas', 'Go to Cards')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={16} color={shell.btnPrimaryText} />
            <Text style={styles.primaryBtnText}>{tr('Volver', 'Back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}
