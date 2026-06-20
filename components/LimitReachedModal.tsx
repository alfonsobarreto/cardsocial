import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ConfettiAnimation, ConfettiAnimationRef } from '@/components/ConfettiAnimation';
import { useLanguage, intlLocaleTagForAppLanguage } from '@/services/language';
import { coreTrEsEn } from '@/services/coreI18n';
import { getCsEconomyConfig } from '@/services/csEconomyConfigService';
import { getTiersConfig } from '@/services/tiersConfigService';
import { useUserCsBalance } from '@/hooks/useUserCsBalance';
import {
  formatCsPaymentPriceLine,
  formatUsdPriceLine,
  joinPriceSegments,
  normalizePricePair,
} from '@/services/subscriptionPriceVisibility';

export interface LimitReachedModalProps {
  visible: boolean;
  limitType: 'cards' | 'vaultItems'; // Tipo de límite alcanzado
  currentCount: number;
  maxLimit: number;
  onClose: () => void;
  onUpgradePress: () => void; // CTA al paywall
}

export const LimitReachedModal: React.FC<LimitReachedModalProps> = ({
  visible,
  limitType,
  currentCount,
  maxLimit,
  onClose,
  onUpgradePress,
}) => {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);
  const modalFooterBottomPad = useModalFooterBottomPad();
  const confettiRef = useRef<ConfettiAnimationRef>(null);
  const [welcomeBonusCs, setWelcomeBonusCs] = useState(0);
  const [monthlyUsd, setMonthlyUsd] = useState(0);
  const [monthlyCs, setMonthlyCs] = useState(0);
  const [trialDays, setTrialDays] = useState(0);
  const { balance: userCsBalance } = useUserCsBalance(visible);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const [econ, tiers] = await Promise.all([getCsEconomyConfig(), getTiersConfig()]);
      if (cancelled) return;
      setWelcomeBonusCs(Math.max(0, Math.floor(econ.welcomeBonusCs)));
      if (tiers) {
        setMonthlyUsd(Math.max(0, tiers.influencer.monthlyPriceUsd));
        setMonthlyCs(Math.max(0, Math.floor(tiers.influencer.monthlyEquivalentCs)));
        setTrialDays(Math.max(0, Math.floor(tiers.influencer.annualTrialDays)));
      } else {
        setMonthlyUsd(0);
        setMonthlyCs(0);
        setTrialDays(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  React.useEffect(() => {
    if (visible) {
      // Trigger confetti when modal becomes visible (sad confetti falling down)
      setTimeout(() => {
        confettiRef.current?.trigger();
      }, 300);
    }
  }, [visible]);

  const getDescription = () => {
    if (limitType === 'cards') {
      return tr(
        `Has alcanzado el límite de ${maxLimit} tarjetas en tu cuenta gratuita.`,
        `You have reached the limit of ${maxLimit} cards on your free account.`,
      );
    }
    return tr(
      `Has alcanzado el límite de ${maxLimit} datos en tu Bóveda.`,
      `You have reached the limit of ${maxLimit} items in your Vault.`,
    );
  };

  const getIconName = () => {
    return limitType === 'cards' ? 'card-multiple' : 'safe';
  };

  const getPremiumBenefits = () => {
    const welcomeLine =
      welcomeBonusCs > 0
        ? tr(
            `✓ ${welcomeBonusCs.toLocaleString()} créditos CS de bienvenida`,
            `✓ ${welcomeBonusCs.toLocaleString()} welcome CS credits`,
          )
        : tr(
            '✓ Créditos CS de bienvenida con tu membresía',
            '✓ Welcome CS credits with your membership',
          );
    if (limitType === 'cards') {
      return [
        tr('✓ Tarjetas ilimitadas', '✓ Unlimited cards'),
        welcomeLine,
        tr('✓ Herramientas Premium adicionales', '✓ Extra Premium perks'),
        tr('✓ Protección Premium', '✓ Premium protection'),
      ];
    }
    return [
      tr('✓ Datos ilimitados', '✓ Unlimited data'),
      welcomeLine,
      tr('✓ Herramientas Premium adicionales', '✓ Extra Premium perks'),
      tr('✓ Protección Premium', '✓ Premium protection'),
    ];
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <BlurView intensity={90} tint="dark">
        <View style={styles.overlay}>
          <LinearGradient
            colors={['rgba(10, 37, 64, 0.95)', 'rgba(15, 50, 85, 0.95)', 'rgba(10, 37, 64, 0.95)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modal}
          >
            <ConfettiAnimation ref={confettiRef} />

            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
              {...verticalScrollInteractionProps}
              contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.scrollContent]}
            >
              {/* Header Icon */}
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons
                  name={getIconName()}
                  size={60}
                  color="#7A42FF"
                />
                <Text style={styles.shieldEmoji}>🛡️</Text>
              </View>

              {/* Title */}
              <Text style={styles.title}>{tr('¡Búnker al límite!', 'Vault at the limit!')}</Text>

              {/* Progress Bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressLabel}>
                  <Text style={styles.progressText}>
                    {currentCount} {tr('de', 'of')} {maxLimit}
                  </Text>
                </View>
                <View style={styles.progressBarOuter}>
                  <View
                    style={[
                      styles.progressBarInner,
                      { width: `${(currentCount / maxLimit) * 100}%` },
                    ]}
                  />
                </View>
              </View>

              {/* Description */}
              <Text style={styles.description}>
                {getDescription()}
              </Text>

              {/* Message Box */}
              <View style={styles.messageBox}>
                <MaterialCommunityIcons
                  name="information"
                  size={20}
                  color="#7A42FF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.messageText}>
                  {welcomeBonusCs > 0
                    ? tr(
                        `Activa tu suscripción para obtener tarjetas ilimitadas, ${welcomeBonusCs.toLocaleString()} créditos CS y protección total.`,
                        `Activate your subscription for unlimited cards, ${welcomeBonusCs.toLocaleString()} CS credits, and full protection.`,
                      )
                    : tr(
                        'Activa tu suscripción para tarjetas ilimitadas, créditos de bienvenida y protección total.',
                        'Activate your subscription for unlimited cards, welcome credits, and full protection.',
                      )}
                </Text>
              </View>

              {/* Premium Benefits */}
              <Text style={styles.benefitsTitle}>{tr('Ventajas Premium:', 'Premium benefits:')}</Text>
              <View style={styles.benefitsList}>
                {getPremiumBenefits().map((benefit, idx) => (
                  <Text key={idx} style={styles.benefitItem}>
                    {benefit}
                  </Text>
                ))}
              </View>

              {/* Price Tag */}
              <View style={styles.priceContainer}>
                <Text style={styles.priceText}>
                  {(() => {
                    const pair = normalizePricePair(monthlyUsd, monthlyCs);
                    const line = joinPriceSegments([
                      formatUsdPriceLine(pair, {
                        formatUsd: (n) =>
                          new Intl.NumberFormat(intlLocaleTagForAppLanguage(language), {
                            style: 'currency',
                            currency: 'USD',
                          }).format(n),
                        suffix: tr(' / mes', ' / mo'),
                      }),
                      formatCsPaymentPriceLine(pair, userCsBalance),
                    ]);
                    return (
                      line ||
                      tr('Consulta tarifas del plan Influencer en la app.', 'See Influencer plan rates in the app.')
                    );
                  })()}
                </Text>
                <Text style={styles.subtext}>
                  {trialDays > 0
                    ? tr(`${trialDays} días de prueba incluidos`, `${trialDays}-day trial included`)
                    : tr('Periodo de prueba según tu tienda', 'Trial period per store listing')}
                </Text>
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={[styles.buttonContainer, { paddingBottom: modalFooterBottomPad }]}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
              >
                <Text style={styles.cancelButtonText}>{tr('Más tarde', 'Maybe later')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.upgradeButton]}
                onPress={onUpgradePress}
              >
                <MaterialCommunityIcons name="crown" size={18} color="#071226" />
                <Text style={styles.upgradeButtonText}>{tr('Activar Premium', 'Activate Premium')}</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modal: {
    borderRadius: 20,
    maxHeight: '90%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(197, 160, 101, 0.3)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 12,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  shieldEmoji: {
    position: 'absolute',
    fontSize: 40,
    top: -8,
    right: -8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#7A42FF',
    textAlign: 'center',
    marginBottom: 20,
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressLabel: {
    marginBottom: 8,
  },
  progressText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarOuter: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarInner: {
    height: '100%',
    backgroundColor: '#7A42FF',
    borderRadius: 3,
  },
  description: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  messageBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(197, 160, 101, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#7A42FF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    color: '#7A42FF',
    fontWeight: '500',
    lineHeight: 18,
  },
  benefitsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  benefitsList: {
    marginBottom: 20,
  },
  benefitItem: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8,
    lineHeight: 18,
  },
  priceContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(197, 160, 101, 0.2)',
  },
  priceText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#7A42FF',
    marginBottom: 4,
  },
  subtext: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  upgradeButton: {
    backgroundColor: '#7A42FF',
  },
  upgradeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#071226',
  },
});

export default LimitReachedModal;
