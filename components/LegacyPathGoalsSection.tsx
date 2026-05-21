/**
 * UI FASE 6 — El camino Legacy: barra parametrizada + medallas clicables → modal premium (60‑30‑10 sobre #1C1C1E).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  LEGACY_GOALS_TIER_DEFINITIONS,
  LEGACY_MODAL_CANVAS_HEX,
  LEGACY_TIER_THRESHOLDS,
  LEGACY_VIBRANT_GOLD,
  legacyReferralsProgressPercent,
  legacyReferralsRemaining,
  legacyTierUnlocked,
  type LegacyGoalsTierDefinition,
  type LegacyGoalsTierKey,
} from '@/services/legacyPathGoalsConfig';
import type { CoreLocaleKey } from '@/services/coreI18n';
import { useCoreT } from '@/services/coreI18n';

type LegacyPathGoalsPalette = {
  legacyTitleColor: string;
  legacyBodyColor: string;
  rankTrackBg: string;
  medalLabelColor: string;
  textMuted: string;
};

export type LegacyPathGoalsSectionProps = {
  referralsCurrent: number;
  referralsCeiling: number;
  palette: LegacyPathGoalsPalette;
};

function tierLabelKey(k: LegacyGoalsTierKey): CoreLocaleKey {
  const map: Record<LegacyGoalsTierKey, CoreLocaleKey> = {
    plata: 'dashboard_legacy_plata_label',
    oro: 'dashboard_legacy_oro_label',
    platino: 'dashboard_legacy_platino_label',
    diamante: 'dashboard_legacy_diamante_label',
  };
  return map[k];
}

function tierBodyKey(k: LegacyGoalsTierKey): CoreLocaleKey {
  const map: Record<LegacyGoalsTierKey, CoreLocaleKey> = {
    plata: 'dashboard_legacy_plata_body',
    oro: 'dashboard_legacy_oro_body',
    platino: 'dashboard_legacy_platino_body',
    diamante: 'dashboard_legacy_diamante_body',
  };
  return map[k];
}

const MODAL_BTN_TEXT_ON_GOLD = '#1C1C1E';

type MaterialCommunityGlyph = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function LegacyGoalsPremiumModal(props: {
  visible: boolean;
  tier: LegacyGoalsTierDefinition | null;
  unlocked: boolean;
  remainingToUnlock: number;
  referralsCurrent: number;
  onClose: () => void;
}) {
  const { visible, tier, unlocked, remainingToUnlock, referralsCurrent, onClose } = props;
  const tcx = useCoreT();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  const title = tier ? `${tcx(tierLabelKey(tier.key))} · ${tier.threshold}` : '';
  const body = tier ? tcx(tierBodyKey(tier.key)) : '';
  const closeLabel = tcx('dashboard_legacy_modal_got_it');

  const footerHint =
    tier == null
      ? ''
      : unlocked
        ? tcx('dashboard_legacy_tier_active')
        : tcx('dashboard_legacy_tier_need_more', {
            remaining: String(remainingToUnlock),
            current: String(referralsCurrent),
          });

  return (
    <Modal visible={Boolean(visible && tier)} animationType="fade" transparent onRequestClose={onClose}>
      {tier ? (
        <Pressable style={styles.modalBackdrop} onPress={onClose} accessibilityRole="button">
          <Pressable
            style={[
              styles.modalCardOuter,
              {
                paddingBottom: 18 + Math.max(insets.bottom, 10),
                maxHeight: Math.min(520, screenH * 0.88),
                backgroundColor: LEGACY_MODAL_CANVAS_HEX,
              },
            ]}
            onPress={() => {}}
            accessibilityViewIsModal
          >
            <ScrollView showsVerticalScrollIndicator={false} {...verticalScrollInteractionProps} bounces={false} contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.modalScrollInner]}>
              <View style={[styles.modalIconRing, unlocked && styles.modalIconRingActive]}>
                <MaterialCommunityIcons name={tier.modalIconName as MaterialCommunityGlyph} size={40} color={tier.modalIconTint} />
              </View>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalBody}>{body}</Text>
              <Text style={[styles.modalFooterHint, unlocked ? styles.modalFooterHintActive : undefined]}>{footerHint}</Text>
            </ScrollView>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.modalCta, pressed && styles.modalCtaPressed]}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
            >
              <Text style={styles.modalCtaLabel}>{closeLabel}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}
    </Modal>
  );
}

export function LegacyPathGoalsSection(props: LegacyPathGoalsSectionProps) {
  const { referralsCurrent, referralsCeiling, palette } = props;
  const tcx = useCoreT();
  const [activeTierKey, setActiveTierKey] = useState<LegacyGoalsTierDefinition['key'] | null>(null);

  const progressPct = useMemo(
    () => legacyReferralsProgressPercent(referralsCurrent, referralsCeiling),
    [referralsCurrent, referralsCeiling],
  );

  const activeTier = useMemo(() => LEGACY_GOALS_TIER_DEFINITIONS.find((t) => t.key === activeTierKey) ?? null, [activeTierKey]);

  const activeUnlocked = activeTier ? legacyTierUnlocked(referralsCurrent, activeTier.threshold) : false;
  const activeRemaining = activeTier ? legacyReferralsRemaining(activeTier.threshold, referralsCurrent) : 0;

  const openTierModal = useCallback((tier: LegacyGoalsTierDefinition) => {
    setActiveTierKey(tier.key);
  }, []);

  const closeModal = useCallback(() => setActiveTierKey(null), []);

  const thresholdStr = LEGACY_TIER_THRESHOLDS.join(' · ');

  return (
    <>
      <View style={styles.legacyRow}>
        <View style={styles.legacyCopy}>
          <Text style={[styles.legacyHeroTitle, { color: palette.legacyTitleColor }]}>
            {tcx('dashboard_legacy_hero_title', { thresholds: thresholdStr })}
          </Text>
          <View style={[styles.legacyTrack, { backgroundColor: palette.rankTrackBg }]}>
            <LinearGradient
              colors={[LEGACY_VIBRANT_GOLD, `${LEGACY_VIBRANT_GOLD}BB`]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.legacyFill, { width: `${progressPct}%` }]}
            />
          </View>
          <Text style={[styles.legacyProgress, { color: palette.legacyBodyColor }]}>
            {`${referralsCurrent}/${referralsCeiling} ${tcx('dashboard_legacy_reach_word')}`}
          </Text>
          <Text style={[styles.legacySubtitle, { color: palette.textMuted }]}>
            {tcx('dashboard_legacy_tier_gates', { thresholds: thresholdStr })}
          </Text>
        </View>
        <View style={styles.medalRow}>
          {LEGACY_GOALS_TIER_DEFINITIONS.map((tier) => {
            const unlocked = legacyTierUnlocked(referralsCurrent, tier.threshold);
            const label = tcx(tierLabelKey(tier.key));
            return (
              <Pressable
                key={tier.key}
                onPress={() => openTierModal(tier)}
                accessibilityRole="button"
                accessibilityLabel={tcx('dashboard_legacy_a11y_tier_detail', { label })}
                style={({ pressed }) => [styles.medalPressable, pressed && styles.medalPressed]}
              >
                <View style={[styles.medalOrb, unlocked ? styles.medalOrbUnlocked : styles.medalOrbLocked]}>
                  <MaterialCommunityIcons
                    name={tier.modalIconName as MaterialCommunityGlyph}
                    size={18}
                    color={unlocked ? '#FFFFFF' : LEGACY_VIBRANT_GOLD}
                  />
                  {unlocked ? (
                    <View style={styles.unlockedGlow} pointerEvents="none" />
                  ) : null}
                </View>
                <Text style={[styles.medalLabel, { color: palette.medalLabelColor }]}>{label}</Text>
                <Text
                  style={[styles.medalState, unlocked ? styles.medalStateOn : styles.medalStateOff, { opacity: unlocked ? 1 : 0.85 }]}
                >
                  {unlocked ? tcx('dashboard_legacy_unlocked') : tcx('dashboard_legacy_locked')}
                </Text>
                <Text style={[styles.medalThreshold, { color: palette.textMuted }]}>{tier.threshold}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <LegacyGoalsPremiumModal
        visible={activeTier !== null}
        tier={activeTier}
        unlocked={activeUnlocked}
        remainingToUnlock={activeRemaining}
        referralsCurrent={referralsCurrent}
        onClose={closeModal}
      />
    </>
  );
}

const styles = StyleSheet.create({
  legacyRow: {
    gap: 14,
  },
  legacyCopy: {
    gap: 7,
  },
  legacyHeroTitle: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    letterSpacing: 0.2,
  },
  legacyTrack: {
    height: 9,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  legacyFill: {
    height: '100%',
    borderRadius: 999,
    minWidth: 6,
  },
  legacyProgress: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.25,
    marginTop: 2,
  },
  legacySubtitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  medalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
    paddingHorizontal: 2,
    flexWrap: 'nowrap',
  },
  medalPressable: {
    alignItems: 'center',
    minWidth: 72,
    flex: 1,
    maxWidth: 92,
  },
  medalPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  medalOrb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  medalOrbLocked: {
    borderColor: 'rgba(233,195,73,0.45)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  medalOrbUnlocked: {
    borderColor: LEGACY_VIBRANT_GOLD,
    backgroundColor: 'rgba(233,195,73,0.28)',
    shadowColor: LEGACY_VIBRANT_GOLD,
    shadowOpacity: 0.55,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  unlockedGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(233,195,73,0.12)',
    borderRadius: 22,
  },
  medalLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 5,
    textAlign: 'center',
  },
  medalState: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  medalStateOn: {
    color: LEGACY_VIBRANT_GOLD,
  },
  medalStateOff: {
    color: 'rgba(255,255,255,0.48)',
  },
  medalThreshold: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  modalCardOuter: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(233,195,73,0.35)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  modalScrollInner: {
    paddingBottom: 10,
    alignItems: 'center',
    gap: 14,
  },
  modalIconRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modalIconRingActive: {
    borderColor: LEGACY_VIBRANT_GOLD,
    backgroundColor: 'rgba(233,195,73,0.12)',
    shadowColor: LEGACY_VIBRANT_GOLD,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.25,
    textAlign: 'center',
  },
  modalBody: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'center',
  },
  modalFooterHint: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 17,
  },
  modalFooterHintActive: {
    color: LEGACY_VIBRANT_GOLD,
  },
  modalCta: {
    marginTop: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: LEGACY_VIBRANT_GOLD,
  },
  modalCtaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  modalCtaLabel: {
    color: MODAL_BTN_TEXT_ON_GOLD,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
