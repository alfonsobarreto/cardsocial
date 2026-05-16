/**
 * AirTime — saldo de minutos para llamadas privadas Ghost-Link (API `/api/qr/voip/minutes-summary`).
 * UI compacta junto a créditos CS o formato estadística en perfil.
 */

import palette from '@/app/theme';
import { trEsEn, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { fetchVoipMinutesSummary, type VoipMinutesSummaryWire } from '@/services/qrApi';
import { hasUnlimitedAdminUi } from '@/services/roleService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus, StyleSheet, Text, View } from 'react-native';

export type VoipAirTimeBadgeLayout = 'compact' | 'profile';

type VoipAirTimeBadgeProps = {
  userId: string;
  refreshTrigger?: number;
  layout?: VoipAirTimeBadgeLayout;
};

export function VoipAirTimeBadge({
  userId,
  refreshTrigger = 0,
  layout = 'compact',
}: VoipAirTimeBadgeProps) {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];

  const [unlimitedAdmin, setUnlimitedAdmin] = useState(false);
  const [summary, setSummary] = useState<VoipMinutesSummaryWire | null>(null);
  const [foregroundTick, setForegroundTick] = useState(0);

  useEffect(() => {
    if (!userId) {
      setUnlimitedAdmin(false);
      return;
    }
    void (async () => {
      try {
        setUnlimitedAdmin(await hasUnlimitedAdminUi(userId));
      } catch {
        setUnlimitedAdmin(false);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setSummary(null);
      return;
    }
    if (unlimitedAdmin) {
      setSummary(null);
      return;
    }
    const run = async () => {
      try {
        const s = await fetchVoipMinutesSummary({ uid: userId });
        setSummary(s.ok ? s : null);
      } catch {
        setSummary(null);
      }
    };
    void run();
  }, [userId, refreshTrigger, unlimitedAdmin, foregroundTick]);

  useEffect(() => {
    if (!userId || unlimitedAdmin) return;
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') setForegroundTick((t) => t + 1);
    });
    return () => sub.remove();
  }, [userId, unlimitedAdmin]);

  const colors = useMemo(
    () => ({
      label: shell.textSecondary,
      value: shell.ctaAccent,
      icon: shell.ctaAccent,
    }),
    [shell],
  );

  if (!userId) {
    return null;
  }

  const brandLabel = 'AirTime';

  const renderUnlimited = () =>
    layout === 'profile' ? (
      <View style={styles.profileCol}>
        <Text style={[styles.profileValue, { color: colors.value }]}>∞</Text>
        <Text style={[styles.profileLabel, { color: colors.label }]}>{brandLabel}</Text>
      </View>
    ) : (
      <View style={[styles.compactRow, styles.compactRowEnd]}>
        <MaterialCommunityIcons name="phone-in-talk" size={20} color={colors.icon} style={styles.icon} />
        <View style={styles.compactText}>
          <Text style={[styles.compactLabel, { color: colors.label }]}>{brandLabel}</Text>
          <Text style={[styles.compactValue, { color: colors.value }]}>
            {tr('Ilimitado', 'Unlimited')}
          </Text>
        </View>
      </View>
    );

  if (unlimitedAdmin) {
    return renderUnlimited();
  }

  if (!summary) {
    return layout === 'profile' ? (
      <View style={styles.profileCol}>
        <Text style={[styles.profileValue, { color: colors.value }]}>…</Text>
        <Text style={[styles.profileLabel, { color: colors.label }]}>{brandLabel}</Text>
      </View>
    ) : (
      <View style={[styles.compactRow, styles.compactRowEnd]}>
        <MaterialCommunityIcons name="phone-in-talk" size={20} color={colors.icon} style={styles.icon} />
        <View style={styles.compactText}>
          <Text style={[styles.compactLabel, { color: colors.label }]}>{brandLabel}</Text>
          <Text style={[styles.compactValue, { color: colors.value }]}>…</Text>
        </View>
      </View>
    );
  }

  if (summary.unlimited) {
    return renderUnlimited();
  }

  const available = Math.max(0, Math.floor(Number(summary.totalAvailableMinutes ?? 0)));
  const extra =
    (summary.purchasedMinutesRemaining ?? 0) > 0
      ? `${tr('Extra', 'Extra')}: ${summary.purchasedMinutesRemaining} ${tr('min', 'min')}`
      : null;

  if (layout === 'profile') {
    return (
      <View style={styles.profileCol}>
        <Text style={[styles.profileValue, { color: colors.value }]}>{available}</Text>
        <Text style={[styles.profileLabel, { color: colors.label }]}>{brandLabel}</Text>
        {extra ? (
          <Text style={[styles.profileExtra, { color: colors.label }]} numberOfLines={1}>
            {extra}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.compactRow, styles.compactRowEnd]}>
      <MaterialCommunityIcons name="phone-in-talk" size={20} color={colors.icon} style={styles.icon} />
      <View style={styles.compactText}>
        <Text style={[styles.compactLabel, { color: colors.label }]}>{brandLabel}</Text>
        <Text style={[styles.compactValue, { color: colors.value }]}>
          {available} {tr('min', 'min')}
        </Text>
        {extra ? (
          <Text style={[styles.compactExtra, { color: colors.label }]} numberOfLines={1}>
            {extra}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactRowEnd: {
    justifyContent: 'flex-end',
    flex: 1,
  },
  icon: {
    marginRight: 8,
  },
  compactText: {
    flexShrink: 1,
    alignItems: 'flex-end',
  },
  compactLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  compactValue: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  compactExtra: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    opacity: 0.9,
  },
  profileCol: {
    alignItems: 'center',
    gap: 2,
    maxWidth: 88,
  },
  profileValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  profileLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  profileExtra: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
});
