import { coreTrEsEn } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type VerificationBadgeProps = {
  compact?: boolean;
};

export default function VerificationBadge({ compact = false }: VerificationBadgeProps) {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);
  return (
    <View style={[styles.badge, compact && styles.badgeCompact]}>
      <MaterialCommunityIcons name="shield-check" size={compact ? 14 : 16} color="#FFFFFF" />
      {!compact ? <Text style={styles.text}>{tr('Verificado', 'Verified')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1EA7FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
    borderWidth: 1,
    borderColor: '#CDEFFF',
  },
  badgeCompact: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    gap: 4,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
