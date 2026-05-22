import { coreT, type AppLanguage } from '@/services/coreI18n';
import { contactSavesFromSummary } from '@/services/dashboardAnalytics';
import type { CardAnalyticsPeriodSummary } from '@/services/qrApi';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  analytics: CardAnalyticsPeriodSummary | undefined;
  language: AppLanguage;
  isNight: boolean;
};

/**
 * “Guardaron tu tarjeta en Card-Social” vs “guardaron .vcf en el teléfono”.
 */
export function ContactSavesMetricStrip({ analytics, language, isNight }: Props) {
  const { app: appCount, phone: phoneCount } = useMemo(
    () => contactSavesFromSummary(analytics),
    [analytics],
  );

  return (
    <View style={styles.row}>
      <View style={[styles.cardWrap, isNight ? styles.cardShadowNight : styles.cardShadowDay]}>
        <LinearGradient
          colors={isNight ? ['#4F46E5', '#6D28D9', '#5B21B6'] : ['#6366F1', '#7C3AED', '#6D28D9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.iconBadge}>
            <MaterialCommunityIcons name="card-account-details-star" size={26} color="rgba(255,255,255,0.98)" />
          </View>
          <Text style={styles.kicker}>{coreT('misc_contact_save_kicker_app', language)}</Text>
          <Text style={styles.bigNumber}>{appCount}</Text>
          <Text style={styles.subtitle} numberOfLines={3}>
            {coreT('misc_contact_save_subtitle_app', language)}
          </Text>
        </LinearGradient>
      </View>

      <View style={[styles.cardWrap, isNight ? styles.cardShadowNight : styles.cardShadowDay]}>
        <LinearGradient
          colors={isNight ? ['#22C55E', '#16A34A', '#15803D'] : ['#34D759', '#22C55E', '#16A34A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.iconBadge}>
            <MaterialCommunityIcons name="cellphone-arrow-down" size={26} color="rgba(255,255,255,0.98)" />
          </View>
          <Text style={styles.kicker}>{coreT('misc_contact_save_kicker_phone', language)}</Text>
          <Text style={styles.bigNumber}>{phoneCount}</Text>
          <Text style={styles.subtitle} numberOfLines={3}>
            {coreT('misc_contact_save_subtitle_phone', language)}
          </Text>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 2,
  },
  cardWrap: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardShadowDay: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  cardShadowNight: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  gradient: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    minHeight: 148,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
    color: 'rgba(255,255,255,0.85)',
  },
  bigNumber: {
    fontSize: 32,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    marginBottom: 6,
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    color: 'rgba(255,255,255,0.88)',
  },
});
