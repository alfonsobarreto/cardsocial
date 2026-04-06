/**
 * Balance de créditos en el menú — sin caja clara; colores desde `palette` / modo.
 */

import palette from '../app/theme';
import { getUserCreditsBalance } from '@/services/creditsService';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface CreditsIndicatorProps {
  userId: string;
  refreshTrigger?: number;
}

export const CreditsIndicator: React.FC<CreditsIndicatorProps> = ({ userId, refreshTrigger }) => {
  const { language } = useLanguage ? useLanguage() : { language: 'es' };
  const tr = (es: string, en: string) => (language === 'en' ? en : es);
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

  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const balance = await getUserCreditsBalance(userId);
        setCreditsBalance(balance);
      } catch (error) {
        console.error('Error fetching credits balance:', error);
      }
    };
    void fetchCredits();
  }, [userId, refreshTrigger]);

  return (
    <View style={[styles.wrap, { borderBottomColor: colors.hairline }]}>
      <View style={styles.row}>
        <MaterialCommunityIcons name="cash" size={22} color={colors.icon} style={styles.icon} />
        <View style={styles.textCol}>
          <Text style={[styles.label, { color: colors.label }]}>{tr('Créditos CS', 'CS Credits')}</Text>
          <Text style={[styles.balance, { color: colors.balance }]}>{creditsBalance}</Text>
        </View>
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
