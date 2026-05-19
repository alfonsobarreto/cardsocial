/**
 * Cuadrícula 2×3 de insignias/medallas (hasta 6 slots) para MedalRatingModal.
 * Layout estático — sin carrusel horizontal.
 */

import type { MedalCounts, MedalDef, MedalKey } from '@/services/medalService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type MedalBadgeGridVariant = 'business' | 'social';

type Props = {
  medals: readonly MedalDef[];
  selectedKey: MedalKey | null;
  counts: MedalCounts;
  votingKey: MedalKey | null;
  onSelect: (key: MedalKey) => void;
  resolveLabel: (medal: MedalDef) => string;
  accent: string;
  surfaceBg: string;
  borderColor: string;
  textPrimary: string;
  mutedColor: string;
  variant?: MedalBadgeGridVariant;
};

export function MedalBadgeSelectionGrid({
  medals,
  selectedKey,
  counts,
  votingKey,
  onSelect,
  resolveLabel,
  accent,
  surfaceBg,
  borderColor,
  textPrimary,
  mutedColor,
  variant = 'social',
}: Props) {
  const isBusiness = variant === 'business';

  return (
    <View style={styles.grid}>
      {medals.map((item) => {
        const isSelected = selectedKey === item.key;
        const isLoading = votingKey === item.key;
        const count = counts[item.key] ?? 0;

        return (
          <TouchableOpacity
            key={item.key}
            style={[
              styles.card,
              isBusiness ? styles.cardBusiness : styles.cardSocial,
              {
                backgroundColor: isSelected ? `${accent}22` : surfaceBg,
                borderColor: isSelected ? accent : borderColor,
              },
            ]}
            onPress={() => onSelect(item.key)}
            activeOpacity={0.75}
            disabled={!!votingKey}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={resolveLabel(item)}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={accent} />
            ) : (
              <MaterialCommunityIcons
                name={item.icon as any}
                size={isBusiness ? 30 : 32}
                color={isSelected ? accent : mutedColor}
              />
            )}
            <Text
              style={[
                styles.label,
                isBusiness ? styles.labelBusiness : styles.labelSocial,
                { color: isSelected ? accent : textPrimary },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {resolveLabel(item)}
            </Text>
            {count > 0 ? (
              <View style={[styles.countBadge, { backgroundColor: isSelected ? accent : mutedColor }]}>
                <Text style={styles.countText}>{count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    position: 'relative',
  },
  cardSocial: {
    width: '46%',
    minHeight: 96,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  cardBusiness: {
    width: '48%',
    minHeight: 100,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  label: {
    width: '100%',
    fontWeight: '600',
    textAlign: 'center',
  },
  labelSocial: {
    fontSize: 13,
    lineHeight: 16,
  },
  labelBusiness: {
    fontSize: 12,
    lineHeight: 15,
  },
  countBadge: {
    position: 'absolute',
    top: 5,
    right: 6,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  countText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '700',
  },
});
