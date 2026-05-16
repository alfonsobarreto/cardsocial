/**
 * Account Recovery Screen Component
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { initiateAccountRecovery, checkRecoveryRequestStatus } from '@/services/accountRecoveryService';
import { useAuthT } from '@/services/authI18n';
import { trEsEn, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import palette from '../theme';

type RecoveryStep = 'method-select' | 'email-recovery' | 'ticket-status';

export default function AccountRecoveryScreen({ onClose }: { onClose: () => void }) {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
  const t = useAuthT();
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const shell = palette[isDark ? 'dark' : 'light'];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: shell.backgroundSolid,
        },
        scrollContent: {
          flexGrow: 1,
          paddingBottom: 32,
        },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: 16,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: shell.border,
        },
        headerTitle: {
          fontSize: 18,
          fontWeight: '700',
          color: shell.textPrimary,
        },
        content: {
          flex: 1,
          paddingHorizontal: 16,
          paddingVertical: 32,
        },
        icon: {
          alignSelf: 'center',
          marginBottom: 24,
        },
        title: {
          fontSize: 22,
          fontWeight: '700',
          color: shell.textPrimary,
          marginBottom: 8,
          textAlign: 'center',
        },
        subtitle: {
          fontSize: 14,
          color: shell.textSecondary,
          textAlign: 'center',
          marginBottom: 32,
        },
        methodButton: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 16,
          borderRadius: 12,
          backgroundColor: shell.surface,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: shell.border,
        },
        methodTextContainer: {
          flex: 1,
          marginLeft: 12,
        },
        methodTitle: {
          fontSize: 16,
          fontWeight: '600',
          color: shell.textPrimary,
          marginBottom: 4,
        },
        methodSubtitle: {
          fontSize: 12,
          color: shell.textSecondary,
        },
        backButton: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 24,
        },
        backButtonText: {
          fontSize: 14,
          fontWeight: '600',
          color: shell.textPrimary,
          marginLeft: 4,
        },
        input: {
          borderWidth: 1,
          borderColor: shell.border,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 12,
          fontSize: 14,
          color: shell.textPrimary,
          marginBottom: 24,
          backgroundColor: shell.inputBg,
        },
        primaryButton: {
          borderRadius: 8,
          overflow: 'hidden',
        },
        primaryButtonInner: {
          paddingVertical: 14,
          alignItems: 'center',
        },
        primaryButtonText: {
          fontSize: 14,
          fontWeight: '700',
          color: shell.btnPrimaryText,
        },
        disabled: {
          opacity: 0.6,
        },
        statusBox: {
          marginTop: 24,
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderRadius: 8,
          backgroundColor: isDark ? 'rgba(48,209,88,0.14)' : 'rgba(52,199,89,0.12)',
          borderLeftWidth: 4,
          borderLeftColor: shell.success,
        },
        statusText: {
          fontSize: 13,
          color: shell.success,
          fontWeight: '500',
        },
      }),
    [shell, isDark]
  );

  const [step, setStep] = useState<RecoveryStep>('method-select');
  const [email, setEmail] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusInfo, setStatusInfo] = useState<string>('');

  const handleEmailRecovery = async () => {
    if (!email.trim()) {
      Alert.alert(tr('Error', 'Error'), tr('Por favor ingresa tu email.', 'Please enter your email.'));
      return;
    }

    setLoading(true);
    const result = await initiateAccountRecovery(email, language === 'es' ? 'es' : 'en');
    setLoading(false);

    if (result.success) {
      Alert.alert(t('signin_alert_check_email_title'), t('signin_recovery_email_fallback'));
      setTimeout(() => onClose(), 2000);
    } else {
      Alert.alert(tr('Error', 'Error'), t('signin_recovery_service_unavailable'));
    }
  };

  const handleCheckTicketStatus = async () => {
    if (!ticketId.trim()) {
      Alert.alert(tr('Error', 'Error'), tr('Por favor ingresa tu ID de ticket.', 'Please enter your ticket ID.'));
      return;
    }

    setLoading(true);
    const result = await checkRecoveryRequestStatus(ticketId);
    setLoading(false);

    const statusInfoText =
      result.status === 'not_found'
        ? t('signin_recovery_ticket_not_found')
        : result.status === 'pending'
          ? t('signin_recovery_ticket_pending')
          : result.status === 'verified'
            ? t('signin_recovery_ticket_verified')
            : result.status === 'rejected'
              ? t('signin_recovery_ticket_rejected')
              : t('signin_recovery_ticket_status_error');
    setStatusInfo(statusInfoText);
  };

  const accent = shell.ctaAccent;
  const chevronColor = shell.textPrimary;

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={28} color={chevronColor} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{tr('Recuperar cuenta', 'Recover account')}</Text>
          <View style={{ width: 28 }} />
        </View>

        {step === 'method-select' && (
          <View style={styles.content}>
            <MaterialCommunityIcons name="shield-lock" size={64} color={accent} style={styles.icon} />
            <Text style={styles.title}>{tr('¿Perdiste acceso a tu cuenta?', 'Lost access to your account?')}</Text>
            <Text style={styles.subtitle}>
              {tr('Elige cómo deseas recuperar tu cuenta', 'Choose how you want to recover your account')}
            </Text>

            <TouchableOpacity style={styles.methodButton} onPress={() => setStep('email-recovery')}>
              <MaterialCommunityIcons name="email" size={32} color={accent} />
              <View style={styles.methodTextContainer}>
                <Text style={styles.methodTitle}>{tr('Recupera por email', 'Recover by email')}</Text>
                <Text style={styles.methodSubtitle}>
                  {tr('Recibirás un enlace para restablecer tu contraseña', "You'll get a link to reset your password")}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={chevronColor} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.methodButton} onPress={() => setStep('ticket-status')}>
              <MaterialCommunityIcons name="file-document" size={32} color={accent} />
              <View style={styles.methodTextContainer}>
                <Text style={styles.methodTitle}>{tr('Verificación manual', 'Manual verification')}</Text>
                <Text style={styles.methodSubtitle}>
                  {tr('Verifica tu identidad con un documento', 'Verify your identity with a document')}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={chevronColor} />
            </TouchableOpacity>
          </View>
        )}

        {step === 'email-recovery' && (
          <View style={styles.content}>
            <TouchableOpacity onPress={() => setStep('method-select')} style={styles.backButton}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={chevronColor} />
              <Text style={styles.backButtonText}>{tr('Volver', 'Back')}</Text>
            </TouchableOpacity>

            <Text style={styles.title}>{tr('Ingresa tu email', 'Enter your email')}</Text>
            <Text style={styles.subtitle}>
              {tr('Enviaremos un enlace a tu email para restablecer tu contraseña', "We'll email you a link to reset your password")}
            </Text>

            <TextInput
              style={styles.input}
              placeholder={tr('tu@email.com', 'you@email.com')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              editable={!loading}
              placeholderTextColor={shell.textMuted}
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabled]}
              onPress={handleEmailRecovery}
              disabled={loading}
            >
              <LinearGradient colors={[shell.ctaPrimary, shell.refreshAccent]} style={styles.primaryButtonInner}>
                <Text style={styles.primaryButtonText}>
                  {loading
                    ? tr('Enviando…', 'Sending…')
                    : tr('Enviar enlace de recuperación', 'Send recovery link')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {step === 'ticket-status' && (
          <View style={styles.content}>
            <TouchableOpacity onPress={() => setStep('method-select')} style={styles.backButton}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={chevronColor} />
              <Text style={styles.backButtonText}>{tr('Volver', 'Back')}</Text>
            </TouchableOpacity>

            <Text style={styles.title}>{tr('Verifica tu ID de ticket', 'Verify your ticket ID')}</Text>
            <Text style={styles.subtitle}>
              {tr(
                'Ingresa el ID de tu solicitud de verificación para ver el estado',
                'Enter your verification request ID to check the status',
              )}
            </Text>

            <TextInput
              style={styles.input}
              placeholder={tr('REC-4021-xya2b3c4', 'REC-4021-xya2b3c4')}
              value={ticketId}
              onChangeText={setTicketId}
              editable={!loading}
              placeholderTextColor={shell.textMuted}
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabled]}
              onPress={handleCheckTicketStatus}
              disabled={loading}
            >
              <LinearGradient colors={[shell.ctaPrimary, shell.refreshAccent]} style={styles.primaryButtonInner}>
                <Text style={styles.primaryButtonText}>
                  {loading ? tr('Verificando…', 'Verifying…') : tr('Verificar estado', 'Check status')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {statusInfo ? (
              <View style={styles.statusBox}>
                <Text style={styles.statusText}>{statusInfo}</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
