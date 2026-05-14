/**
 * Balance de créditos en el menú — sin caja clara; colores desde `palette` / modo.
 */

import { getUserCreditsBalance } from '@/services/creditsService';
import { fetchVoipMinutesSummary, type VoipMinutesSummaryWire } from '@/services/qrApi';
import { trEsEn, useLanguage } from '@/services/language';
import { hasUnlimitedAdminUi } from '@/services/roleService';
import { useLookMode } from '@/services/lookMode';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus, StyleSheet, Text, View } from 'react-native';
import palette from '../app/theme';

interface CreditsIndicatorProps {
  userId: string;
  refreshTrigger?: number;
}

export const CreditsIndicator: React.FC<CreditsIndicatorProps> = ({ userId, refreshTrigger }) => {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const colors = useMemo(
    () => ({
      label: shell.textSecondary,
      balance: shell.ctaAccent,
      icon: shell.ctaAccent,
      hairline: shell.modalBorder,
    }),
    [shell],
  );

  const [creditsBalance, setCreditsBalance] = useState<number>(0);
  const [unlimitedAdmin, setUnlimitedAdmin] = useState(false);
  const [voipSummary, setVoipSummary] = useState<VoipMinutesSummaryWire | null>(null);
  const [foregroundTick, setForegroundTick] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const fetchCredits = async () => {
      try {
        const unlimited = await hasUnlimitedAdminUi(userId);
        setUnlimitedAdmin(unlimited);
        if (unlimited) {
          return;
        }
        const balance = await getUserCreditsBalance(userId);
        setCreditsBalance(balance);
      } catch (error) {
        console.error('Error fetching credits balance:', error);
      }
    };
    void fetchCredits();
  }, [userId, refreshTrigger]);

  useEffect(() => {
    if (!userId || unlimitedAdmin) return;
    const onAppState = (s: AppStateStatus) => {
      if (s === 'active') setForegroundTick((t) => t + 1);
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [userId, unlimitedAdmin]);

  useEffect(() => {
    if (!userId) {
      setVoipSummary(null);
      return;
    }
    if (unlimitedAdmin) {
      setVoipSummary(null);
      return;
    }
    const run = async () => {
      try {
        const s = await fetchVoipMinutesSummary({ uid: userId });
        setVoipSummary(s.ok ? s : null);
      } catch (e) {
        console.warn('VoIP minutes summary:', e);
        setVoipSummary(null);
      }
    };
    void run();
  }, [userId, refreshTrigger, unlimitedAdmin, foregroundTick]);

  const voipUnlimited = unlimitedAdmin || Boolean(voipSummary?.unlimited);
  const voipMainLine =
    voipSummary && voipSummary.ok && !voipSummary.unlimited
      ? `${voipSummary.subscriptionUsedMinutes} / ${voipSummary.subscriptionIncludedMinutes} ${tr('min', 'min')}`
      : null;

  return (
    <View style={[styles.wrap, { borderBottomColor: colors.hairline }]}>
      <View style={styles.row}>
        <MaterialCommunityIcons name="cash" size={22} color={colors.icon} style={styles.icon} />
        <View style={styles.textCol}>
          <Text style={[styles.label, { color: colors.label }]}>{tr('Créditos CS', 'CS Credits')}</Text>
          <Text style={[styles.balance, { color: colors.balance }]}>
            {unlimitedAdmin ? tr('Ilimitado', 'Unlimited') : creditsBalance}
          </Text>
        </View>
      </View>
      {userId && (voipUnlimited || voipMainLine) ? (
        <View style={[styles.row, styles.voipRow, { borderTopColor: colors.hairline }]}>
          <MaterialCommunityIcons name="phone-clock-outline" size={20} color={colors.icon} style={styles.icon} />
          <View style={styles.textCol}>
            <Text style={[styles.label, { color: colors.label }]}>{tr('Minutos llamadas', 'Call minutes')}</Text>
            <Text style={[styles.voipBalance, { color: colors.balance }]}>
              {voipUnlimited ? tr('Ilimitado', 'Unlimited') : voipMainLine}
            </Text>
            {voipSummary && !voipSummary.unlimited && (voipSummary.purchasedMinutesRemaining ?? 0) > 0 ? (
              <Text style={[styles.voipExtra, { color: colors.label }]}>
                {tr('Comprados:', 'Purchased:')} {voipSummary.purchasedMinutesRemaining} {tr('min', 'min')}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 10,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 12,
  },
  textCol: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  balance: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  voipRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  voipBalance: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  voipExtra: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    opacity: 0.92,
  },
});
