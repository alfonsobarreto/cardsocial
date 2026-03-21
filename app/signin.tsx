import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Apple, Chrome, Github, Lock, Mail, Sparkles } from 'lucide-react-native';
import { sendEmailVerification, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '@/services/firebaseConfig';
import { SocialProviderId } from '@/services/socialAuth';
import { getEmailFromCredential, getProviderLabel, signInWithSocialProvider } from '@/services/socialAuth';
import { initiateAccountRecovery } from '@/services/accountRecoveryService';
import { hardLockCheck } from '@/services/biometricAuth';
import { getCachedCredentials, saveCachedCredentials } from '@/services/credentialVault';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [biometricAutofillDone, setBiometricAutofillDone] = useState(false);

  const welcomeTitle = useMemo(() => 'Card-Social, donde tus datos son solo tuyos', []);

  const handleSignIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password;

    if (!normalizedPassword) {
      Alert.alert('Falta contraseña', 'Ingresa tu contraseña para continuar.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!normalizedEmail) {
        Alert.alert('Falta email', 'Ingresa tu email para iniciar sesión.');
        return;
      }

      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword);

      if (!credential.user.emailVerified) {
        setPendingVerificationEmail(normalizedEmail);
        Alert.alert(
          'Verificación pendiente',
          'Revisa tu correo y confirma el enlace de verificación antes de iniciar sesión. Si no lo recibiste, usa el botón para reenviarlo.'
        );
        return;
      }

      await saveCachedCredentials(normalizedEmail, normalizedPassword);

      router.replace('/(tabs)/vault');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
      Alert.alert('Error de acceso', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert('Email requerido', 'Escribe tu email para enviarte el enlace de recuperación.');
      return;
    }

    setIsRecoveringPassword(true);
    try {
      const response = await initiateAccountRecovery(normalizedEmail);
      Alert.alert(response.success ? 'Recuperación enviada' : 'No se pudo iniciar recuperación', response.message);
    } finally {
      setIsRecoveringPassword(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    const normalizedEmail = (pendingVerificationEmail || email).trim().toLowerCase();
    const normalizedPassword = password;

    if (!normalizedEmail) {
      Alert.alert('Email requerido', 'Escribe tu email para reenviar verificación.');
      return;
    }

    setIsResendingVerification(true);
    try {
      let user = auth.currentUser;
      if (!user || String(user.email || '').trim().toLowerCase() !== normalizedEmail) {
        if (!normalizedPassword) {
          Alert.alert('Contraseña requerida', 'Ingresa tu contraseña para reenviar el email de verificación.');
          return;
        }
        const credential = await signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword);
        user = credential.user;
      }

      await user.reload().catch(() => null);
      if (user.emailVerified) {
        Alert.alert('Cuenta verificada', 'Tu correo ya está verificado. Ya puedes iniciar sesión.');
        setPendingVerificationEmail('');
        return;
      }

      await sendEmailVerification(user);
      await signOut(auth).catch(() => null);
      Alert.alert('Email reenviado', 'Te enviamos un nuevo enlace de verificación. Revisa también spam/promociones.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo reenviar el email de verificación.';
      Alert.alert('Reenvío no disponible', message);
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleProviderSignIn = async (providerId: SocialProviderId) => {
    setIsSubmitting(true);
    try {
      const credential = await signInWithSocialProvider(providerId);
      const resolvedEmail = getEmailFromCredential(credential);

      if (!resolvedEmail) {
        Alert.alert(
          'Email requerido',
          `Tu cuenta de ${getProviderLabel(providerId)} no devolvió email. Usa otro método.`
        );
        return;
      }

      router.replace('/(tabs)/vault');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión con proveedor.';
      Alert.alert('Acceso social no disponible', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBiometricAutofill = async () => {
    if (biometricAutofillDone) {
      return;
    }

    const unlocked = await hardLockCheck('autocompletar tus credenciales de acceso');
    if (!unlocked) {
      return;
    }

    const cached = await getCachedCredentials();
    if (!cached) {
      Alert.alert('Sin datos guardados', 'Aún no hay credenciales guardadas para autocompletar.');
      return;
    }

    setEmail(cached.email);
    setPassword(cached.password);
    setBiometricAutofillDone(true);
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <LinearGradient colors={['#F8FBFF', '#E9F6FF', '#D6EEFF']} style={styles.gradient}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroIconWrap}>
              <Sparkles color="#C5A065" size={30} />
            </View>
            <Text style={styles.title}>{welcomeTitle}</Text>
            <Text style={styles.subtitle}>Inicia como prefieras, pero siempre con control total de tu identidad.</Text>

            <Text style={styles.socialTitle}>Acceso instantáneo</Text>
            <View style={styles.socialGrid}>
              <TouchableOpacity style={styles.socialButton} onPress={() => handleProviderSignIn('apple.com')}>
                <Apple color="#0A2540" size={18} />
                <Text style={styles.socialText}>Apple</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialButton} onPress={() => handleProviderSignIn('google.com')}>
                <Chrome color="#0A2540" size={18} />
                <Text style={styles.socialText}>Google</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialButton} onPress={() => handleProviderSignIn('github.com')}>
                <Github color="#0A2540" size={18} />
                <Text style={styles.socialText}>GitHub</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.socialTitle}>O con email y contraseña</Text>

            <View style={styles.inputWrap}>
              <Mail size={16} color="#4A4A4A" />
              <TextInput
                style={styles.input}
                placeholder="correo@ejemplo.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                onFocus={() => {
                  void handleBiometricAutofill();
                }}
              />
            </View>

            <View style={styles.inputWrap}>
              <Lock size={16} color="#4A4A4A" />
              <TextInput
                style={styles.input}
                placeholder="Contraseña"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onFocus={() => {
                  void handleBiometricAutofill();
                }}
              />
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={handleSignIn} disabled={isSubmitting}>
              {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Iniciar sesión</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                void handleForgotPassword();
              }}
              style={styles.secondaryLinkWrap}
              disabled={isRecoveringPassword}
            >
              {isRecoveringPassword ? (
                <ActivityIndicator size="small" color="#0A2540" />
              ) : (
                <Text style={styles.secondaryLink}>Olvidé mi contraseña</Text>
              )}
            </TouchableOpacity>

            {(pendingVerificationEmail || email.trim()) ? (
              <TouchableOpacity
                onPress={() => {
                  void handleResendVerificationEmail();
                }}
                style={styles.secondaryLinkWrap}
                disabled={isResendingVerification}
              >
                {isResendingVerification ? (
                  <ActivityIndicator size="small" color="#0A2540" />
                ) : (
                  <Text style={styles.secondaryLink}>Reenviar email de verificación</Text>
                )}
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity onPress={() => router.push('/register')} style={styles.footerLinkWrap}>
              <Text style={styles.footerLink}>¿No tienes cuenta? Crear cuenta</Text>
            </TouchableOpacity>
          </ScrollView>
        </LinearGradient>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  content: { padding: 24, paddingTop: 54, paddingBottom: 36 },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(197, 160, 101, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#0A2540',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    color: '#4A4A4A',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
  },
  inputWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE9F2',
    minHeight: 50,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    color: '#0A2540',
    fontSize: 15,
  },
  primaryButton: {
    marginTop: 8,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#0A2540',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  socialTitle: {
    marginTop: 18,
    marginBottom: 10,
    color: '#4A4A4A',
    textAlign: 'center',
    fontWeight: '600',
  },
  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  socialButton: {
    minWidth: '31%',
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE9F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  socialText: {
    color: '#0A2540',
    fontWeight: '700',
    fontSize: 13,
  },
  footerLinkWrap: {
    marginTop: 18,
    alignItems: 'center',
  },
  footerLink: {
    color: '#0A2540',
    textDecorationLine: 'underline',
    opacity: 0.8,
  },
  secondaryLinkWrap: {
    marginTop: 12,
    alignItems: 'center',
  },
  secondaryLink: {
    color: '#0A2540',
    textDecorationLine: 'underline',
    opacity: 0.85,
    fontWeight: '600',
  },
});
