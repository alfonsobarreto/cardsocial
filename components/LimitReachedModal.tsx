import React, { useRef } from 'react';
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
  const confettiRef = useRef<ConfettiAnimationRef>(null);

  React.useEffect(() => {
    if (visible) {
      // Trigger confetti when modal becomes visible (sad confetti falling down)
      setTimeout(() => {
        confettiRef.current?.trigger();
      }, 300);
    }
  }, [visible]);

  const getTitle = () => {
    return limitType === 'cards' ? 'Tarjetas Llenas' : 'Bóveda Llena';
  };

  const getDescription = () => {
    if (limitType === 'cards') {
      return `Has alcanzado el límite de ${maxLimit} tarjetas en tu cuenta gratuita.`;
    } else {
      return `Has alcanzado el límite de ${maxLimit} datos en tu Bóveda.`;
    }
  };

  const getIconName = () => {
    return limitType === 'cards' ? 'card-multiple' : 'safe';
  };

  const getPremiumBenefits = () => {
    if (limitType === 'cards') {
      return [
        '✓ Tarjetas ilimitadas',
        '✓ 100 Créditos CS de bienvenida',
        '✓ Historias VIP por 7 días',
        '✓ Protección Premium',
      ];
    } else {
      return [
        '✓ Datos ilimitados',
        '✓ 100 Créditos CS de bienvenida',
        '✓ Historias VIP por 7 días',
        '✓ Protección Premium',
      ];
    }
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
              contentContainerStyle={styles.scrollContent}
            >
              {/* Header Icon */}
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons
                  name={getIconName()}
                  size={60}
                  color="#C5A065"
                />
                <Text style={styles.shieldEmoji}>🛡️</Text>
              </View>

              {/* Title */}
              <Text style={styles.title}>¡Búnker al Límite!</Text>

              {/* Progress Bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressLabel}>
                  <Text style={styles.progressText}>
                    {currentCount} de {maxLimit}
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
                  color="#C5A065"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.messageText}>
                  Activa tu suscripción para obtener tarjetas ilimitadas, 100 créditos CS y
                  protección total.
                </Text>
              </View>

              {/* Premium Benefits */}
              <Text style={styles.benefitsTitle}>Ventajas Premium:</Text>
              <View style={styles.benefitsList}>
                {getPremiumBenefits().map((benefit, idx) => (
                  <Text key={idx} style={styles.benefitItem}>
                    {benefit}
                  </Text>
                ))}
              </View>

              {/* Price Tag */}
              <View style={styles.priceContainer}>
                <Text style={styles.priceText}>$4.99 USD / mes</Text>
                <Text style={styles.subtext}>30 días de prueba sin cobro</Text>
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
              >
                <Text style={styles.cancelButtonText}>Más Tarde</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.upgradeButton]}
                onPress={onUpgradePress}
              >
                <MaterialCommunityIcons name="crown" size={18} color="#0A2540" />
                <Text style={styles.upgradeButtonText}>Activar Premium</Text>
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
    color: '#C5A065',
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
    backgroundColor: '#C5A065',
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
    borderLeftColor: '#C5A065',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    color: '#C5A065',
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
    color: '#C5A065',
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
    backgroundColor: '#C5A065',
  },
  upgradeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A2540',
  },
});

export default LimitReachedModal;
