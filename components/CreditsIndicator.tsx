/**
 * Balance de créditos en el menú — sin caja clara; colores desde `palette` / modo.
 * AirTime (minutos llamadas privadas) al costado vía `VoipAirTimeBadge`.
 */

import { VoipAirTimeBadge } from '@/components/VoipAirTimeBadge';
import { getUserCreditsBalance } from '@/services/creditsService';
import { coreTrEsEn } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';
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
  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);
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
      if (s === 'active') {
        void getUserCreditsBalance(userId)
          .then(setCreditsBalance)
          .catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [userId, unlimitedAdmin]);

  return (
    <View style={[styles.wrap, { borderBottomColor: colors.hairline }]}>
      <View style={styles.topRow}>
        <View style={[styles.row, styles.csSide]}>
          <MaterialCommunityIcons name="cash" size={22} color={colors.icon} style={styles.icon} />
          <View style={styles.textCol}>
            <Text style={[styles.label, { color: colors.label }]}>{tr('Créditos CS', 'CS Credits')}</Text>
            <Text style={[styles.balance, { color: colors.balance }]}>
              {unlimitedAdmin ? tr('Ilimitado', 'Unlimited') : creditsBalance}
            </Text>
          </View>
        </View>
        <VoipAirTimeBadge userId={userId} refreshTrigger={refreshTrigger} layout="compact" />
      </View>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  csSide: {
    flex: 1,
    minWidth: 0,
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
});
