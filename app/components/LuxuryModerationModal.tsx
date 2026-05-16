import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import { coreTrEsEn } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';

type LuxuryModerationModalProps = {
  visible: boolean;
  title?: string;
  message: string;
  onClose: () => void;
  onRetry?: () => void;
  retryLocked?: boolean;
  retryCountdownSec?: number;
  lockMessage?: string;
};

const formatCountdown = (totalSec: number) => {
  const safe = Math.max(0, totalSec);
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

export default function LuxuryModerationModal({
  visible,
  title,
  message,
  onClose,
  onRetry,
  retryLocked = false,
  retryCountdownSec = 0,
  lockMessage,
}: LuxuryModerationModalProps) {
  const { language } = useLanguage();
  const modalFooterBottomPad = useModalFooterBottomPad();
  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);
  const resolvedTitle = title ?? tr('Acceso Premium Protegido', 'Premium Protected Access');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <BlurView intensity={48} tint="light" style={styles.blurLayer}>
          <LinearGradient
            colors={['rgba(233,195,73,0.22)', '#FFFFFF', 'rgba(242,242,247,0.98)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientBorder}
          >
            <View style={styles.cardInner}>
              <View style={styles.iconWrap}>
                <MaterialCommunityIcons name="shield-crown" size={30} color="#E9C349" />
              </View>

              <Text style={styles.title}>{resolvedTitle}</Text>
              <Text style={styles.message}>{message}</Text>

              {retryLocked ? (
                <View style={styles.lockPanel}>
                  <Text style={styles.lockText}>
                    {lockMessage ||
                      tr('Estamos cuidando la integridad de la comunidad. Por favor, espera un momento antes de intentar de nuevo', 'We are protecting the integrity of the community. Please wait before trying again')}
                  </Text>
                  <Text style={styles.countdown}>{formatCountdown(retryCountdownSec)}</Text>
                </View>
              ) : null}

              <View style={[styles.actionsRow, { paddingBottom: modalFooterBottomPad }]}>
                <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
                  <Text style={styles.secondaryButtonText}>{tr('Cerrar', 'Close')}</Text>
                </TouchableOpacity>

                {onRetry ? (
                  <TouchableOpacity
                    style={[styles.primaryButton, retryLocked && styles.primaryButtonDisabled]}
                    onPress={onRetry}
                    disabled={retryLocked}
                  >
                    <Text style={styles.primaryButtonText}>{tr('Reintentar', 'Retry')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </LinearGradient>
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  blurLayer: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  gradientBorder: {
    padding: 1.6,
    borderRadius: 24,
  },
  cardInner: {
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.68)',
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 12,
  },
  title: {
    color: '#E9C349',
    fontSize: 22,
    fontFamily: 'Georgia',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    color: '#636366',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 14,
  },
  lockPanel: {
    width: '100%',
    backgroundColor: 'rgba(233,195,73,0.12)',
    borderColor: 'rgba(233,195,73,0.35)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  lockText: {
    color: '#636366',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  countdown: {
    color: '#E9C349',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 8,
    letterSpacing: 1,
  },
  actionsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#636366',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#E9C349',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#1C1C1E',
    fontSize: 15,
    fontWeight: '700',
  },
});
