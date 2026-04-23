import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import { trEsEn, useLanguage } from '@/services/language';
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface DullModeLockProps {
  visible: boolean;
  onClose: () => void;
  onRequestPremium: () => void;
  lockType: 'pdf' | 'extra_card' | 'feature' | 'icon';
  itemName?: string;
}

/**
 * DullModeLock - Lock visual para estado de expiración comercial.
 * Dull Mode se activa cuando la anualidad de una tarjeta de negocio no está activa.
 */
const DullModeLock: React.FC<DullModeLockProps> = ({
  visible,
  onClose,
  onRequestPremium,
  lockType,
  itemName,
}) => {
  const { language } = useLanguage();
  const config = useMemo(() => {
    const tr = (es: string, en: string) => trEsEn(es, en, language);
    const trimmed = (itemName || '').trim();
    const featEs = trimmed || 'Esta función';
    const featEn = trimmed || 'This feature';
    const resEs = trimmed || 'Este recurso';
    const resEn = trimmed || 'This item';
    const lockMessages = {
      pdf: {
        title: tr('📄 Documento bloqueado', '📄 Document locked'),
        subtitle: tr('Dull Mode activo por anualidad pendiente', 'Dull Mode: subscription pending'),
        description: tr(
          'Activa o renueva la anualidad de la tarjeta para recuperar archivos, diseño completo y funciones visuales.',
          'Activate or renew your business card subscription to restore files, full design, and visual features.',
        ),
      },
      extra_card: {
        title: tr('🎯 Tarjeta en Dull Mode', '🎯 Card in Dull Mode'),
        subtitle: tr('La anualidad de esta tarjeta de negocio expiró', 'This business card subscription expired'),
        description: tr(
          'El QR permanente sigue funcionando, pero el estilo queda en escala de grises hasta renovar la anualidad.',
          'Your permanent QR still works, but the style stays grayscale until you renew.',
        ),
      },
      feature: {
        title: tr('⭐ Función en pausa visual', '⭐ Visual feature paused'),
        subtitle: tr(
          `${featEs} depende de anualidad activa`,
          `${featEn} requires an active subscription`,
        ),
        description: tr(
          'Renueva la tarjeta de negocio para salir de Dull Mode y restaurar efectos visuales.',
          'Renew your business card to exit Dull Mode and restore visual effects.',
        ),
      },
      icon: {
        title: tr('🎨 Estilo desactivado', '🎨 Style disabled'),
        subtitle: tr(`${resEs} está en Dull Mode`, `${resEn} is in Dull Mode`),
        description: tr(
          'Con anualidad vencida, la tarjeta se muestra minimalista en gris y sin efectos hasta renovar.',
          'With an expired subscription, the card shows in minimal gray with no effects until you renew.',
        ),
      },
    };
    return lockMessages[lockType];
  }, [lockType, itemName, language]);
  const modalFooterBottomPad = useModalFooterBottomPad();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Blur background */}
        <View style={styles.blurBackground} />

        <View style={styles.lockContainer}>
          {/* Icono de candado animado */}
          <View style={styles.lockIconWrapper}>
            <MaterialCommunityIcons
              name="lock"
              size={80}
              color="#C5A065" // Dorado
            />
          </View>

          {/* Título */}
          <Text style={styles.lockTitle}>{config.title}</Text>

          {/* Subtítulo */}
          <Text style={styles.lockSubtitle}>{config.subtitle}</Text>

          {/* Descripción */}
          <Text style={styles.lockDescription}>{config.description}</Text>

          {/* CTA Buttons */}
          <View style={[styles.buttonsContainer, { paddingBottom: modalFooterBottomPad }]}>
            {/* Botón Premium (Gradient Azul/Dorado) */}
            <LinearGradient
              colors={['#0A2540', '#1a3a5a']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.premiumButtonGradient}
            >
              <TouchableOpacity style={styles.premiumButton} onPress={onRequestPremium}>
                <MaterialCommunityIcons
                  name="star"
                  size={20}
                  color="#C5A065"
                  style={styles.buttonIcon}
                />
                <Text style={styles.premiumButtonText}>
                  {trEsEn('Renovar anualidad', 'Renew subscription', language)}
                </Text>
              </TouchableOpacity>
            </LinearGradient>

            {/* Botón Cerrar (Gris) */}
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>
                {trEsEn('No, gracias', 'No thanks', language)}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer con garantía */}
          <View style={styles.footer}>
            <MaterialCommunityIcons name="shield-check" size={16} color="#2ECC71" />
            <Text style={styles.footerText}>
              {trEsEn(
                'QR permanente activo · Estilo completo al renovar',
                'Permanent QR stays active · Full style when you renew',
                language,
              )}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  lockContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  lockIconWrapper: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 50,
    backgroundColor: 'rgba(197, 160, 101, 0.1)',
  },
  lockTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0A2540',
    marginBottom: 8,
    textAlign: 'center',
  },
  lockSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A4A4A',
    marginBottom: 12,
    textAlign: 'center',
  },
  lockDescription: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
    marginBottom: 28,
    textAlign: 'center',
  },
  buttonsContainer: {
    width: '100%',
    gap: 12,
  },
  premiumButtonGradient: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  premiumButton: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },
  premiumButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  footer: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#999999',
  },
});

export default DullModeLock;
