import ActivityIndicator from '@/components/BrandedSpinner';
import { brandCsIconLogoBgTransparent } from '@/constants/brandAssets';
import { initiateAccountRecovery } from '@/services/accountRecoveryService';
import { saveCachedCredentials } from '@/services/credentialVault';
import { auth, db } from '@/services/firebaseConfig';
import { firestoreFirstUserDocByNickLower } from '@/services/userIdentityFields';
import { trEsEn, useLanguageOptional } from '@/services/language';
import { getEmailFromCredential, getProviderLabel, signInWithSocialProvider, SocialProviderId } from '@/services/socialAuth';
import { clearLocalCachesForSignOut } from '@/services/userScopedStorage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { sendEmailVerification, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { Eye, EyeOff, Lock, User } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
    Alert,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

export default function SignInScreen() {
  const router = useRouter();
  const langCtx = useLanguageOptional();
  const language = langCtx?.language ?? 'en';
  const tr = (es: string, en: string) => trEsEn(es, en, language);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');

  const welcomeTitle = useMemo(
    () => tr('Card-Social, donde tus datos son solo tuyos', 'Card-Social, your data stays yours'),
    [language]
  );

  const resolveEmailFromUsername = async (rawUsername: string) => {
    const normalizedUsername = rawUsername.trim().toLowerCase();
    if (!normalizedUsername) {
      return null;
    }

    const usersRef = collection(db, 'users');
    const byLowerDoc = await firestoreFirstUserDocByNickLower(db, normalizedUsername);
    if (byLowerDoc) {
      const userData = byLowerDoc.data() as { email?: string; emailLower?: string };
      return String(userData.emailLower || userData.email || '').trim().toLowerCase() || null;
    }

    const byNickname = await getDocs(
      query(usersRef, where('nickname', '==', rawUsername.trim()), limit(1))
    );
    if (!byNickname.empty) {
      const userData = byNickname.docs[0].data() as { email?: string; emailLower?: string };
      return String(userData.emailLower || userData.email || '').trim().toLowerCase() || null;
    }

    const byUserNick = await getDocs(
      query(usersRef, where('userNickName', '==', rawUsername.trim()), limit(1))
    );
    if (!byUserNick.empty) {
      const userData = byUserNick.docs[0].data() as { email?: string; emailLower?: string };
      return String(userData.emailLower || userData.email || '').trim().toLowerCase() || null;
    }

    return null;
  };

  const handleSignIn = async () => {
    const normalizedUsername = username.trim();
    const normalizedPassword = password;

    if (!normalizedPassword) {
      Alert.alert(tr('Falta contrasena', 'Password required'), tr('Ingresa tu contrasena para continuar.', 'Enter your password to continue.'));
      return;
    }

    setIsSubmitting(true);
    try {
      if (!normalizedUsername) {
        Alert.alert(tr('Falta usuario', 'Username required'), tr('Ingresa tu usuario para iniciar sesion.', 'Enter your username to sign in.'));
        return;
      }

      const resolvedEmail = await resolveEmailFromUsername(normalizedUsername);
      if (!resolvedEmail) {
        Alert.alert(tr('Usuario no encontrado', 'Username not found'), tr('No encontramos una cuenta con ese usuario.', 'We could not find an account with that username.'));
        return;
      }

      const credential = await signInWithEmailAndPassword(auth, resolvedEmail, normalizedPassword);

      // --- SOFT DELETE RESTORE LOGIC ---
      // Revisar si el usuario tiene pendingDeletion y si está dentro del periodo de gracia
      try {
        const userDocRef = (await import('firebase/firestore')).doc(db, 'users', credential.user.uid);
        const userDocSnap = await (await import('firebase/firestore')).getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          if (userData.pendingDeletion && userData.deletionDeadline) {
            const now = Date.now();
            const deadline = typeof userData.deletionDeadline === 'number' ? userData.deletionDeadline : new Date(userData.deletionDeadline).getTime();
            if (now < deadline) {
              // Restaurar cuenta: limpiar flags de borrado
              await (await import('firebase/firestore')).updateDoc(userDocRef, {
                pendingDeletion: false,
                deletionRequestedAt: null,
                deletionDeadline: null,
              });
              Alert.alert(
                tr('Cuenta restaurada', 'Account restored'),
                tr('Tu cuenta fue restaurada exitosamente. ¡Bienvenido de nuevo!', 'Your account has been successfully restored. Welcome back!')
              );
            } else {
              // El periodo de gracia expiró, bloquear acceso
              Alert.alert(
                tr('Cuenta eliminada', 'Account deleted'),
                tr('El periodo de restauración expiró. Tu cuenta ha sido eliminada permanentemente.', 'The restoration period has expired. Your account has been permanently deleted.')
              );
              await clearLocalCachesForSignOut(auth.currentUser?.uid ?? null);
              await signOut(auth);
              setIsSubmitting(false);
              return;
            }
          }
        }
      } catch (restoreError) {
        // Si hay error, continuar con el flujo normal
      }
      // --- END SOFT DELETE RESTORE LOGIC ---

      if (!credential.user.emailVerified) {
        setPendingVerificationEmail(resolvedEmail);
        Alert.alert(
          tr('Verificacion pendiente', 'Verification pending'),
          tr(
            'Revisa tu correo y confirma el enlace de verificacion antes de iniciar sesion. Si no lo recibiste, usa el boton para reenviarlo.',
            'Check your inbox and confirm your verification link before signing in. If you did not receive it, use the resend button.'
          )
        );
        return;
      }

      await saveCachedCredentials(resolvedEmail, normalizedPassword);

      router.replace('/(tabs)/cards');
    } catch (error) {
      const message = error instanceof Error ? error.message : tr('No se pudo iniciar sesion.', 'Could not sign in.');
      Alert.alert(tr('Error de acceso', 'Access error'), message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      Alert.alert(tr('Usuario requerido', 'Username required'), tr('Escribe tu usuario para enviarte el enlace de recuperacion.', 'Enter your username to receive a recovery link.'));
      return;
    }

    const resolvedEmail = await resolveEmailFromUsername(normalizedUsername);
    if (!resolvedEmail) {
      Alert.alert(tr('Usuario no encontrado', 'Username not found'), tr('No encontramos una cuenta con ese usuario.', 'We could not find an account with that username.'));
      return;
    }

    setIsRecoveringPassword(true);
    try {
      const response = await initiateAccountRecovery(resolvedEmail);
      Alert.alert(response.success ? tr('Recuperacion enviada', 'Recovery email sent') : tr('No se pudo iniciar recuperacion', 'Could not start recovery'), response.message);
    } finally {
      setIsRecoveringPassword(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    const normalizedUsername = username.trim();
    const normalizedEmail = pendingVerificationEmail || (await resolveEmailFromUsername(normalizedUsername)) || '';
    const normalizedPassword = password;

    if (!normalizedEmail) {
      Alert.alert(tr('Usuario requerido', 'Username required'), tr('Escribe tu usuario para reenviar verificacion.', 'Enter your username to resend verification.'));
      return;
    }

    setIsResendingVerification(true);
    try {
      let user = auth.currentUser;
      if (!user || String(user.email || '').trim().toLowerCase() !== normalizedEmail) {
        if (!normalizedPassword) {
          Alert.alert(tr('Contrasena requerida', 'Password required'), tr('Ingresa tu contrasena para reenviar el email de verificacion.', 'Enter your password to resend verification email.'));
          return;
        }
        const credential = await signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword);
        user = credential.user;
      }

      await user.reload().catch(() => null);
      if (user.emailVerified) {
        Alert.alert(tr('Cuenta verificada', 'Account verified'), tr('Tu correo ya esta verificado. Ya puedes iniciar sesion.', 'Your email is already verified. You can now sign in.'));
        setPendingVerificationEmail('');
        return;
      }

      await sendEmailVerification(user);
      await clearLocalCachesForSignOut(user.uid);
      await signOut(auth).catch(() => null);
      Alert.alert(tr('Email reenviado', 'Verification resent'), tr('Te enviamos un nuevo enlace de verificacion. Revisa tambien spam/promociones.', 'A new verification link was sent. Check spam/promotions too.'));
    } catch (error) {
      const message = error instanceof Error ? error.message : tr('No se pudo reenviar el email de verificacion.', 'Could not resend verification email.');
      Alert.alert(tr('Reenvio no disponible', 'Resend unavailable'), message);
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
          tr('Email requerido', 'Email required'),
          tr(
            `Tu cuenta de ${getProviderLabel(providerId)} no devolvio email. Usa otro metodo.`,
            `Your ${getProviderLabel(providerId)} account did not provide an email. Use another method.`
          )
        );
        return;
      }

      router.replace('/(tabs)/cards');
    } catch (error) {
      const message = error instanceof Error ? error.message : tr('No se pudo iniciar sesion con proveedor.', 'Could not sign in with provider.');
      Alert.alert(tr('Acceso social no disponible', 'Social sign-in unavailable'), message);
    } finally {
      setIsSubmitting(false);
    }
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
              <Image source={brandCsIconLogoBgTransparent} style={styles.heroLogo} resizeMode="contain" />
            </View>
            <Text style={styles.title}>{welcomeTitle}</Text>
            <Text style={styles.subtitle}>{tr('Inicia como prefieras, pero siempre con control total de tu identidad.', 'Sign in your way, always with full control of your identity.')}</Text>

            {/* Social login buttons hidden for MVP - only native username/password enabled */}

            <Text style={styles.socialTitle}>{tr('Inicia con usuario y contrasena', 'Sign in with username and password')}</Text>

            <View style={styles.inputWrap}>
              <User size={16} color="#4A4A4A" />
              <TextInput
                style={styles.input}
                placeholder={tr('Usuario', 'Username')}
                keyboardType="default"
                autoCapitalize="none"
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                value={username}
                onChangeText={setUsername}
              />
            </View>

            <View style={styles.inputWrap}>
              <Lock size={16} color="#4A4A4A" />
              <TextInput
                style={styles.input}
                placeholder={tr('Contrasena', 'Password')}
                secureTextEntry={!showPassword}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                style={styles.eyeButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showPassword ? <EyeOff size={18} color="#4A4A4A" /> : <Eye size={18} color="#4A4A4A" />}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={handleSignIn} disabled={isSubmitting}>
              <Text style={styles.primaryButtonText}>{tr('Iniciar sesion', 'Sign In')}</Text>
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
                <Text style={styles.secondaryLink}>{tr('Olvide mi contrasena', 'Forgot my password')}</Text>
              )}
            </TouchableOpacity>

            {(pendingVerificationEmail || username.trim()) ? (
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
                  <Text style={styles.secondaryLink}>{tr('Reenviar email de verificacion', 'Resend verification email')}</Text>
                )}
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity onPress={() => router.push('/register')} style={styles.footerLinkWrap}>
              <Text style={styles.footerLink}>{tr('No tengo cuenta / Sign up', "Don't have an account? Sign up")}</Text>
            </TouchableOpacity>
          </ScrollView>
        </LinearGradient>

        <Modal
          visible={isSubmitting}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={styles.submitOverlay}>
            <View style={styles.submitOverlayCard}>
              <ActivityIndicator size={120} color="#1EA7FF" />
              <Text style={styles.submitOverlayText}>{tr('Validando acceso seguro...', 'Validating secure access...')}</Text>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  content: { padding: 24, paddingTop: 54, paddingBottom: 36 },
  heroIconWrap: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE9F2',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
    shadowColor: '#0A2540',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  heroLogo: {
    width: 62,
    height: 62,
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
  eyeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
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
  submitOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 37, 64, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  submitOverlayCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#CBE7F8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  submitOverlayText: {
    marginTop: 14,
    color: '#0A2540',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
});
