/**
 * Account Recovery Screen Component
 */

import React, { useState } from 'react';
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { initiateAccountRecovery, checkRecoveryRequestStatus } from '@/services/accountRecoveryService';
import { useLanguage } from '@/services/language';

type RecoveryStep = 'method-select' | 'email-recovery' | 'ticket-status';

export default function AccountRecoveryScreen({ onClose }: { onClose: () => void }) {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => language === 'en' ? en : es;
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
    const result = await initiateAccountRecovery(email);
    setLoading(false);

    if (result.success) {
      Alert.alert(tr('Éxito', 'Success'), result.message);
      setTimeout(() => onClose(), 2000);
    } else {
      Alert.alert(tr('Error', 'Error'), result.message);
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

    setStatusInfo(result.message);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={28} color="#0A2540" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Recuperar Cuenta</Text>
          <View style={{ width: 28 }} />
        </View>

        {step === 'method-select' && (
          <View style={styles.content}>
            <MaterialCommunityIcons
              name="shield-lock"
              size={64}
              color="#C5A065"
              style={styles.icon}
            />
            <Text style={styles.title}>¿Perdiste acceso a tu cuenta?</Text>
            <Text style={styles.subtitle}>
              Elige cómo deseas recuperar tu cuenta
            </Text>

            {/* Opción 1: Reset por Email */}
            <TouchableOpacity
              style={styles.methodButton}
              onPress={() => setStep('email-recovery')}
            >
              <MaterialCommunityIcons name="email" size={32} color="#C5A065" />
              <View style={styles.methodTextContainer}>
                <Text style={styles.methodTitle}>Récupera por Email</Text>
                <Text style={styles.methodSubtitle}>
                  Recibirás un link para resetear tu contraseña
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#0A2540" />
            </TouchableOpacity>

            {/* Opción 2: Verificación por Documento */}
            <TouchableOpacity
              style={styles.methodButton}
              onPress={() => setStep('ticket-status')}
            >
              <MaterialCommunityIcons name="file-document" size={32} color="#C5A065" />
              <View style={styles.methodTextContainer}>
                <Text style={styles.methodTitle}>Verificación Manual</Text>
                <Text style={styles.methodSubtitle}>
                  Verifica tu identidad con documento
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#0A2540" />
            </TouchableOpacity>
          </View>
        )}

        {step === 'email-recovery' && (
          <View style={styles.content}>
            <TouchableOpacity
              onPress={() => setStep('method-select')}
              style={styles.backButton}
            >
              <MaterialCommunityIcons name="chevron-left" size={24} color="#0A2540" />
              <Text style={styles.backButtonText}>Volver</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Ingresa tu Email</Text>
            <Text style={styles.subtitle}>
              Enviaremos un link a tu email para resetear tu contraseña
            </Text>

            <TextInput
              style={styles.input}
              placeholder="tu@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              editable={!loading}
              placeholderTextColor="#999"
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabled]}
              onPress={handleEmailRecovery}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? 'Enviando...' : 'Enviar Link de Recuperación'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'ticket-status' && (
          <View style={styles.content}>
            <TouchableOpacity
              onPress={() => setStep('method-select')}
              style={styles.backButton}
            >
              <MaterialCommunityIcons name="chevron-left" size={24} color="#0A2540" />
              <Text style={styles.backButtonText}>Volver</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Verfifica tu ID de Ticket</Text>
            <Text style={styles.subtitle}>
              Ingresa el ID de tu solicitud de verificación para ver el estado
            </Text>

            <TextInput
              style={styles.input}
              placeholder="REC-4021-xya2b3c4"
              value={ticketId}
              onChangeText={setTicketId}
              editable={!loading}
              placeholderTextColor="#999"
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabled]}
              onPress={handleCheckTicketStatus}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? 'Verificando...' : 'Verificar Estado'}
              </Text>
            </TouchableOpacity>

            {statusInfo && (
              <View style={styles.statusBox}>
                <Text style={styles.statusText}>{statusInfo}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0A2540',
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
    color: '#0A2540',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  methodTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A2540',
    marginBottom: 4,
  },
  methodSubtitle: {
    fontSize: 12,
    color: '#999',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A2540',
    marginLeft: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0A2540',
    marginBottom: 24,
    backgroundColor: '#F9F9F9',
  },
  primaryButton: {
    backgroundColor: 'linear-gradient(135deg, #0A2540 0%, #1EA7FF 100%)',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  disabled: {
    opacity: 0.6,
  },
  statusBox: {
    marginTop: 24,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 4,
    borderLeftColor: '#2ECC71',
  },
  statusText: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '500',
  },
});
