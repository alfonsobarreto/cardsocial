import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { hardLockCheck } from '@/services/biometricAuth';
import { trEsEn, useLanguage } from '@/services/language';

export default function SecurityDemoScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
  const [lastResult, setLastResult] = useState<'pending' | 'allowed' | 'blocked'>('pending');

  const handleSecurityTest = async () => {
    const allowed = await hardLockCheck(tr('acceso a tu Boveda de datos', 'access to your data Vault'));

    if (allowed) {
      setLastResult('allowed');
      Alert.alert(
        tr('Acceso permitido', 'Access granted'),
        tr('Autenticacion valida. El acceso al Vault se habilita.', 'Valid authentication. Vault access has been enabled.')
      );
      return;
    }

    setLastResult('blocked');
    Alert.alert(
      tr('Acceso bloqueado', 'Access blocked'),
      tr('Sin FaceID/huella o sin PIN/contrasena del dispositivo, el Vault queda bloqueado.', 'Without FaceID/fingerprint or device PIN/password, the Vault remains locked.')
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{tr('Demo de Seguridad', 'Security Demo')}</Text>
      <Text style={styles.subtitle}>{tr('Hard Lock del Vault sin bypass', 'Vault hard lock without bypass')}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr('Prueba de acceso', 'Access test')}</Text>
        <Text style={styles.bodyText}>
          {tr(
            'Esta prueba intenta abrir una accion protegida del Vault. Si cancelas FaceID/huella y PIN, el sistema debe bloquear el acceso.',
            'This test tries to open a protected Vault action. If you cancel FaceID/fingerprint and PIN, the system must block access.'
          )}
        </Text>

        <TouchableOpacity style={styles.primaryButton} onPress={handleSecurityTest}>
          <Text style={styles.primaryButtonText}>{tr('Probar bloqueo del Vault', 'Test Vault lock')}</Text>
        </TouchableOpacity>

        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>{tr('Ultimo resultado:', 'Last result:')}</Text>
          <Text style={styles.statusValue}>
            {lastResult === 'pending' && tr('Pendiente', 'Pending')}
            {lastResult === 'allowed' && tr('Permitido', 'Allowed')}
            {lastResult === 'blocked' && tr('Bloqueado', 'Blocked')}
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
        <Text style={styles.secondaryButtonText}>{tr('Volver', 'Back')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0A2540',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#4A4A4A',
    marginBottom: 18,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0A2540',
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 14,
    color: '#4A4A4A',
    lineHeight: 20,
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: '#0A2540',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  statusBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E6E8EB',
    padding: 12,
    backgroundColor: '#FBFCFD',
  },
  statusLabel: {
    color: '#4A4A4A',
    fontSize: 12,
    marginBottom: 4,
  },
  statusValue: {
    color: '#0A2540',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0A2540',
    fontWeight: '700',
  },
});
