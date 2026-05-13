/**
 * UI FASE 6 — El camino Legacy: barra parametrizada + medallas clicables → modal premium (60‑30‑10 sobre #1C1C1E).
 */

import React, { useCallback, useMemo, useState } from 'react';
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
} from '@/services/legacyPathGoalsConfig';

type Tr = (es: string, en: string) => string;

type LegacyPathGoalsPalette = {
  legacyTitleColor: string;
  legacyBodyColor: string;
  rankTrackBg: string;
  medalLabelColor: string;
  textMuted: string;
};

export type LegacyPathGoalsSectionProps = {
  tr: Tr;
  referralsCurrent: number;
  referralsCeiling: number;
  palette: LegacyPathGoalsPalette;
};

const MODAL_BTN_TEXT_ON_GOLD = '#1C1C1E';

type MaterialCommunityGlyph = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function LegacyGoalsPremiumModal(props: {
  visible: boolean;
  tier: LegacyGoalsTierDefinition | null;
  unlocked: boolean;
  remainingToUnlock: number;
  referralsCurrent: number;
  tr: Tr;
  onClose: () => void;
}) {
  const { visible, tier, unlocked, remainingToUnlock, referralsCurrent, tr, onClose } = props;
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  const title = tier ? `${tr(tier.labelEs, tier.labelEn)} · ${tier.threshold}` : '';
  const body = tier ? tr(tier.copy.bodyEsExact, tier.copy.bodyEn) : '';
  const closeLabel = tr('Entendido', 'Got it');

  const footerHint =
    tier == null
      ? ''
      : unlocked
        ? tr('Nivel activo para tu cuenta.', 'This tier is active for your account.')
        : tr(
            `Te faltan ${remainingToUnlock} referidos para desbloquear este nivel. (Actual: ${referralsCurrent})`,
            `You need ${remainingToUnlock} more referrals to unlock this tier. (Current: ${referralsCurrent})`,
          );

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
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={styles.modalScrollInner}>
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
  const { tr, referralsCurrent, referralsCeiling, palette } = props;
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

  return (
    <>
      <View style={styles.legacyRow}>
        <View style={styles.legacyCopy}>
          <Text style={[styles.legacyHeroTitle, { color: palette.legacyTitleColor }]}>
            {tr(
              `Metas en ${LEGACY_TIER_THRESHOLDS.join(' · ')} referidos. Bóveda de Legado en marcha.`,
              `Milestones at ${LEGACY_TIER_THRESHOLDS.join(' · ')} referrals. Your Legacy vault in motion.`,
            )}
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
            {`${referralsCurrent}/${referralsCeiling} ${tr('alcance', 'reach')}`}
          </Text>
          <Text style={[styles.legacySubtitle, { color: palette.textMuted }]}>
            {tr(`Umbrales: ${LEGACY_TIER_THRESHOLDS.join(' · ')}.`, `Tier gates: ${LEGACY_TIER_THRESHOLDS.join(' · ')}.`)}
          </Text>
        </View>
        <View style={styles.medalRow}>
          {LEGACY_GOALS_TIER_DEFINITIONS.map((tier) => {
            const unlocked = legacyTierUnlocked(referralsCurrent, tier.threshold);
            return (
              <Pressable
                key={tier.key}
                onPress={() => openTierModal(tier)}
                accessibilityRole="button"
                accessibilityLabel={tr(`${tier.labelEs}: detalle`, `${tier.labelEn}: detail`)}
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
                <Text style={[styles.medalLabel, { color: palette.medalLabelColor }]}>
                  {tr(tier.labelEs, tier.labelEn)}
                </Text>
                <Text
                  style={[styles.medalState, unlocked ? styles.medalStateOn : styles.medalStateOff, { opacity: unlocked ? 1 : 0.85 }]}
                >
                  {unlocked ? tr('Desbloqueado', 'Unlocked') : tr('Bloqueado', 'Locked')}
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
        tr={tr}
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
