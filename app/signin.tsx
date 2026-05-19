import ActivityIndicator from '@/components/BrandedSpinner';
import { AuthSpinnerWell } from '@/components/AuthSpinnerWell';
import { authScreenLook, AUTH_GOLD } from '@/constants/authPremiumLook';
import { brandCsIconLogoBgTransparent } from '@/constants/brandAssets';
import { initiateAccountRecovery, requestUsernameRecoveryByPhone } from '@/services/accountRecoveryService';
import { saveCachedCredentials } from '@/services/credentialVault';
import { requestVerificationEmailViaBackend } from '@/services/requestVerificationEmail';
import { syncWaitlistOnAppVerified } from '@/services/syncWaitlistOnAppVerified';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { auth, db } from '@/services/firebaseConfig';
import { useLanguageOptional } from '@/services/language';
import { useAuthT, type AuthLocaleKey } from '@/services/authI18n';
import { getEmailFromCredential, getProviderLabel, signInWithSocialProvider, SocialProviderId } from '@/services/socialAuth';
import { useLookMode } from '@/services/lookMode';
import {
  enforceInactivitySignOutIfNeeded,
  firebaseUserMayEnterMainApp,
  setTrustedDeviceSession,
} from '@/services/sessionInactivity';
import { resolveEmailCandidatesForSignIn, SIGN_IN_EMAIL_LIKE } from '@/services/studioAuthPublicApi';
import { clearLocalCachesForSignOut } from '@/services/userScopedStorage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword, signOut, type UserCredential } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Check, Eye, EyeOff, Lock, Mail, User } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
    Alert,
    Image,
    Keyboard,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authSignInUserMessage(error: unknown, t: (k: AuthLocaleKey) => string): string {
  const code = String((error as { code?: string })?.code || '');
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return t('signin_err_wrong_password');
  }
  if (code === 'auth/user-disabled') {
    return t('signin_err_user_disabled');
  }
  if (code === 'auth/too-many-requests') {
    return t('signin_err_too_many_requests');
  }
  if (code === 'auth/network-request-failed') {
    return t('signin_err_network');
  }
  const msg = error instanceof Error ? error.message : '';
  if (/auth\/|Firebase/i.test(msg)) {
    return t('signin_err_firebase_generic');
  }
  return msg || t('signin_err_generic');
}

export default function SignInScreen() {
  const router = useRouter();
  const langCtx = useLanguageOptional();
  const language = langCtx?.language ?? 'en';
  const t = useAuthT();
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const look = useMemo(() => authScreenLook(isNight), [isNight]);
  const [identifierMode, setIdentifierMode] = useState<'username' | 'email'>('username');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [isRecoveringUsername, setIsRecoveringUsername] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [recoveryMode, setRecoveryMode] = useState<'password' | 'username' | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [maskedRecoveryEmail, setMaskedRecoveryEmail] = useState('');
  const [trustThisDevice, setTrustThisDevice] = useState(false);

  const welcomeTitle = useMemo(() => t('signin_welcome_title'), [language, t]);

  const maskEmail = (email: string) => {
    const [localRaw, domainRaw] = email.split('@');
    const local = localRaw || '';
    const domain = domainRaw || '';
    const first = local.slice(0, 1);
    const last = local.length > 2 ? local.slice(-1) : '';
    const domainParts = domain.split('.');
    const tld = domainParts.length > 1 ? domainParts.pop() : '';
    return `${first}${'*'.repeat(Math.max(4, local.length - 2))}${last}@${'*'.repeat(Math.max(5, domainParts.join('.').length))}${tld ? `.${tld}` : ''}`;
  };

  const resolveSignInEmails = async (rawTrimmed: string): Promise<string[]> => {
    if (identifierMode === 'email') {
      const lower = rawTrimmed.toLowerCase();
      if (!SIGN_IN_EMAIL_LIKE.test(lower)) return [];
      return [lower];
    }
    const list = await resolveEmailCandidatesForSignIn(rawTrimmed);
    return list?.length ? list : [];
  };

  const handleSignIn = async () => {
    const normalizedIdentifier = username.trim();
    const normalizedPassword = password;

    if (!normalizedPassword) {
      Alert.alert(t('signin_alert_password_required_title'), t('signin_alert_password_required_body'));
      return;
    }

    setIsSubmitting(true);
    try {
      if (!normalizedIdentifier) {
        setIsSubmitting(false);
        Alert.alert(t('signin_alert_username_required_title'), t('signin_alert_username_required_body'));
        return;
      }

      if (identifierMode === 'email' && !SIGN_IN_EMAIL_LIKE.test(normalizedIdentifier.toLowerCase())) {
        setIsSubmitting(false);
        Alert.alert(t('signin_alert_access_error_title'), t('signin_alert_email_invalid'));
        return;
      }

      const candidates = await resolveSignInEmails(normalizedIdentifier);
      if (!candidates?.length) {
        setIsSubmitting(false);
        Alert.alert(
          identifierMode === 'email'
            ? t('signin_alert_access_error_title')
            : t('signin_alert_user_not_found_title'),
          identifierMode === 'email'
            ? t('signin_alert_email_invalid')
            : t('signin_alert_user_not_found_body'),
        );
        return;
      }

      let credential: UserCredential | null = null;
      let lastError: unknown = null;
      for (let i = 0; i < candidates.length; i++) {
        const emailTry = candidates[i];
        try {
          credential = await signInWithEmailAndPassword(auth, emailTry, normalizedPassword);
          break;
        } catch (e) {
          lastError = e;
          const code = String((e as { code?: string })?.code || '');
          const tryNext =
            (code === 'auth/invalid-credential' || code === 'auth/wrong-password') && i < candidates.length - 1;
          if (!tryNext) {
            setIsSubmitting(false);
            Alert.alert(t('signin_alert_access_error_title'), authSignInUserMessage(e, t));
            return;
          }
        }
      }
      if (!credential) {
        setIsSubmitting(false);
        Alert.alert(t('signin_alert_access_error_title'), authSignInUserMessage(lastError, t));
        return;
      }

      try {
        await credential.user.reload();
        const authEmail = String(credential.user.email || '').trim().toLowerCase();
        if (authEmail) {
          const userDocRef = doc(db, 'users', credential.user.uid);
          const snap = await getDoc(userDocRef);
          if (snap.exists()) {
            const data = snap.data() as Record<string, unknown>;
            const storedEmail = String(data.emailLower || data.email || '').trim().toLowerCase();
            if (authEmail !== storedEmail) {
              await updateDoc(userDocRef, {
                email: authEmail,
                emailLower: authEmail,
                pendingEmail: null,
                pendingEmailLower: null,
                emailChangedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          }
        }
      } catch {
        /* best-effort reconcile Firestore with Auth */
      }

      const sessionEmail = String(credential.user.email || '').trim().toLowerCase();

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
                t('signin_alert_account_restored_title'),
                t('signin_alert_account_restored_body')
              );
            } else {
              // El periodo de gracia expiró, bloquear acceso
              setIsSubmitting(false);
              Alert.alert(
                t('signin_alert_account_deleted_title'),
                t('signin_alert_account_deleted_body'),
              );
              await clearLocalCachesForSignOut(auth.currentUser?.uid ?? null);
              await signOut(auth);
              return;
            }
          }
        }
      } catch (restoreError) {
        // Si hay error, continuar con el flujo normal
      }
      // --- END SOFT DELETE RESTORE LOGIC ---

      try {
        const userDocRef = doc(db, 'users', credential.user.uid);
        await updateDoc(userDocRef, {
          language,
          appLanguage: language,
          updatedAt: serverTimestamp(),
        });
      } catch {
        /* ignore language sync */
      }

      if (!firebaseUserMayEnterMainApp(credential.user)) {
        setPendingVerificationEmail(sessionEmail);
        setIsSubmitting(false);
        Alert.alert(
          t('signin_alert_verification_pending_title'),
          t('signin_alert_verification_pending_body'),
        );
        return;
      }

      try {
        const idTok = await credential.user.getIdToken();
        void syncWaitlistOnAppVerified(idTok);
      } catch {
        /* non-blocking */
      }

      await setTrustedDeviceSession(credential.user.uid, trustThisDevice);
      await saveCachedCredentials(sessionEmail, normalizedPassword);

      setIsSubmitting(false);
      router.replace('/');
      return;
    } catch (error) {
      setIsSubmitting(false);
      Alert.alert(t('signin_alert_access_error_title'), authSignInUserMessage(error, t));
    }
  };

  const handleForgotPassword = async () => {
    const normalizedIdentifier = username.trim();
    setRecoveryEmail('');
    setMaskedRecoveryEmail('');
    if (normalizedIdentifier) {
      if (identifierMode === 'email' && SIGN_IN_EMAIL_LIKE.test(normalizedIdentifier.toLowerCase())) {
        setMaskedRecoveryEmail(maskEmail(normalizedIdentifier.toLowerCase()));
      } else if (identifierMode === 'username') {
        const list = await resolveEmailCandidatesForSignIn(normalizedIdentifier).catch(() => null);
        if (list?.length) setMaskedRecoveryEmail(maskEmail(list[0]));
      }
    }
    setRecoveryMode('password');
  };

  const submitForgotPassword = async () => {
    const email = recoveryEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert(t('signin_alert_email_required_title'), t('signin_alert_email_required_body'));
      return;
    }
    setIsRecoveringPassword(true);
    try {
      const response = await initiateAccountRecovery(email, language === 'es' ? 'es' : 'en');
      setRecoveryMode(null);
      Alert.alert(
        t('signin_alert_check_email_title'),
        response.success ? t('signin_recovery_email_fallback') : t('signin_recovery_service_unavailable'),
      );
    } finally {
      setIsRecoveringPassword(false);
    }
  };

  const openForgotUsername = () => {
    setRecoveryPhone('');
    setRecoveryMode('username');
  };

  const submitForgotUsername = async () => {
    const phone = recoveryPhone.trim();
    if (phone.replace(/[^\d]/g, '').length < 8) {
      Alert.alert(t('signin_alert_phone_required_title'), t('signin_alert_phone_required_body'));
      return;
    }
    setIsRecoveringUsername(true);
    try {
      const response = await requestUsernameRecoveryByPhone(phone);
      setRecoveryMode(null);
      Alert.alert(
        t('signin_alert_check_email_title'),
        response.success ? t('signin_recovery_phone_fallback') : t('signin_recovery_service_unavailable'),
      );
    } finally {
      setIsRecoveringUsername(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    const normalizedIdentifier = username.trim();
    const normalizedPassword = password;

    const fromPending = pendingVerificationEmail.trim().toLowerCase();
    const candidates =
      fromPending && EMAIL_LIKE.test(fromPending)
        ? [fromPending]
        : identifierMode === 'email' &&
            normalizedIdentifier &&
            SIGN_IN_EMAIL_LIKE.test(normalizedIdentifier.toLowerCase())
          ? [normalizedIdentifier.trim().toLowerCase()]
          : ((await resolveSignInEmails(normalizedIdentifier)) || []);

    if (!candidates.length) {
      Alert.alert(
        identifierMode === 'email'
          ? t('signin_alert_access_error_title')
          : t('signin_alert_username_resend_title'),
        identifierMode === 'email' ? t('signin_alert_email_invalid') : t('signin_alert_username_resend_body'),
      );
      return;
    }

    setIsResendingVerification(true);
    try {
      let user = auth.currentUser;
      const authEmail = String(user?.email || '').trim().toLowerCase();
      const alreadyMatches = authEmail && candidates.includes(authEmail);
      if (!alreadyMatches) {
        if (!normalizedPassword) {
          Alert.alert(t('signin_alert_password_resend_title'), t('signin_alert_password_resend_body'));
          return;
        }
        let credential: UserCredential | null = null;
        let lastErr: unknown = null;
        for (let i = 0; i < candidates.length; i++) {
          try {
            credential = await signInWithEmailAndPassword(auth, candidates[i], normalizedPassword);
            break;
          } catch (e) {
            lastErr = e;
            const code = String((e as { code?: string })?.code || '');
            const tryNext =
              (code === 'auth/invalid-credential' || code === 'auth/wrong-password') && i < candidates.length - 1;
            if (!tryNext) {
              Alert.alert(t('signin_alert_resend_unavailable_title'), authSignInUserMessage(e, t));
              return;
            }
          }
        }
        if (!credential) {
          Alert.alert(t('signin_alert_resend_unavailable_title'), authSignInUserMessage(lastErr, t));
          return;
        }
        user = credential.user;
      }

      if (!user) {
        Alert.alert(t('signin_alert_resend_unavailable_title'), t('signin_alert_session_unavailable_body'));
        return;
      }

      await user.reload().catch(() => null);
      if (user.emailVerified) {
        Alert.alert(t('signin_alert_account_verified_title'), t('signin_alert_account_verified_body'));
        setPendingVerificationEmail('');
        return;
      }

      const idToken = await user.getIdToken(true);
      await requestVerificationEmailViaBackend(idToken, language === 'es' ? 'es' : 'en');
      await clearLocalCachesForSignOut(user.uid);
      await signOut(auth).catch(() => null);
      Alert.alert(
        t('signin_alert_verification_resent_title'),
        t('signin_alert_verification_resent_body')
      );
    } catch (error) {
      Alert.alert(t('signin_alert_resend_unavailable_title'), authSignInUserMessage(error, t));
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
        const providerName = getProviderLabel(providerId);
        Alert.alert(
          t('signin_alert_email_required_title'),
          t('signin_alert_social_no_email_body', { provider: providerName })
        );
        return;
      }

      try {
        const uid = credential.user.uid;
        if (uid) {
          const userDocRef = doc(db, 'users', uid);
          await updateDoc(userDocRef, {
            language,
            appLanguage: language,
            updatedAt: serverTimestamp(),
          });
        }
      } catch {
        /* ignore language sync */
      }

      await setTrustedDeviceSession(credential.user.uid, trustThisDevice);
      if (credential.user.emailVerified) {
        try {
          const idTok = await credential.user.getIdToken();
          void syncWaitlistOnAppVerified(idTok);
        } catch {
          /* non-blocking */
        }
      }
      router.replace('/');
    } catch (error) {
      Alert.alert(
        t('signin_alert_social_unavailable_title'),
        userFacingAlertMessage(
          error,
          language,
          t('signin_alert_social_unavailable_fallback'),
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <LinearGradient colors={[...look.gradient]} style={styles.gradient}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.content}
            bottomOffset={42}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.heroIconWrap,
                {
                  backgroundColor: '#FFFFFF',
                  borderColor: 'rgba(10, 37, 64, 0.14)',
                  shadowColor: isNight ? AUTH_GOLD : '#0A2540',
                },
              ]}
            >
              <Image source={brandCsIconLogoBgTransparent} style={styles.heroLogo} resizeMode="contain" />
            </View>
            <Text style={[styles.title, { color: look.title }]}>{welcomeTitle}</Text>
            <Text style={[styles.subtitle, { color: look.subtitle }]}>{t('signin_subtitle')}</Text>

            {/* Social login buttons hidden for MVP - only native username/password enabled */}

            <Text style={[styles.socialTitle, { color: look.socialTitle }]}>{t('signin_section_password')}</Text>

            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[
                  styles.modeChip,
                  { borderColor: look.inputWrapBorder, backgroundColor: look.inputWrapBg },
                  identifierMode === 'username' && { borderColor: look.primaryBtnBg, backgroundColor: 'rgba(251,208,122,0.18)' },
                ]}
                onPress={() => {
                  setIdentifierMode('username');
                }}
              >
                <User size={15} color={look.iconColor} />
                <Text style={[styles.modeChipText, { color: identifierMode === 'username' ? look.primaryBtnBg : look.inputText }]}>
                  {t('signin_mode_username')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeChip,
                  { borderColor: look.inputWrapBorder, backgroundColor: look.inputWrapBg },
                  identifierMode === 'email' && { borderColor: look.primaryBtnBg, backgroundColor: 'rgba(251,208,122,0.18)' },
                ]}
                onPress={() => {
                  setIdentifierMode('email');
                }}
              >
                <Mail size={15} color={look.iconColor} />
                <Text style={[styles.modeChipText, { color: identifierMode === 'email' ? look.primaryBtnBg : look.inputText }]}>
                  {t('signin_mode_email')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.inputWrap, { backgroundColor: look.inputWrapBg, borderColor: look.inputWrapBorder }]}>
              {identifierMode === 'email' ? <Mail size={16} color={look.iconColor} /> : <User size={16} color={look.iconColor} />}
              <TextInput
                style={[styles.input, { color: look.inputText }]}
                placeholder={identifierMode === 'email' ? t('signin_placeholder_email') : t('signin_placeholder_username')}
                placeholderTextColor={look.placeholderColor}
                keyboardType={identifierMode === 'email' ? 'email-address' : 'default'}
                autoCapitalize="none"
                autoComplete="off"
                textContentType={identifierMode === 'email' ? 'emailAddress' : 'username'}
                importantForAutofill="no"
                value={username}
                onChangeText={setUsername}
              />
            </View>

            <View style={[styles.inputWrap, { backgroundColor: look.inputWrapBg, borderColor: look.inputWrapBorder }]}>
              <Lock size={16} color={look.iconColor} />
              <TextInput
                style={[styles.input, { color: look.inputText }]}
                placeholder={t('signin_placeholder_password')}
                placeholderTextColor={look.placeholderColor}
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
                {showPassword ? <EyeOff size={18} color={look.iconColor} /> : <Eye size={18} color={look.iconColor} />}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setTrustThisDevice((v) => !v)}
              style={styles.trustRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: trustThisDevice }}
            >
              <View style={[styles.trustBox, { borderColor: look.inputWrapBorder }, trustThisDevice && { backgroundColor: look.primaryBtnBg, borderColor: look.primaryBtnBg }]}>
                {trustThisDevice ? <Check size={16} color={look.primaryBtnText} strokeWidth={3} /> : null}
              </View>
              <View style={styles.trustTextCol}>
                <Text style={[styles.trustTitle, { color: look.title }]}>{t('signin_trust_title')}</Text>
                <Text style={[styles.trustHint, { color: look.subtitle }]}>
                  {t('signin_trust_hint')}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: look.primaryBtnBg }]} onPress={handleSignIn} disabled={isSubmitting}>
              <Text style={[styles.primaryButtonText, { color: look.primaryBtnText }]}>{t('signin_cta')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                void handleForgotPassword();
              }}
              style={styles.secondaryLinkWrap}
              disabled={isRecoveringPassword}
            >
              {isRecoveringPassword ? (
                <ActivityIndicator size="small" color={look.spinnerColor} />
              ) : (
                <Text style={[styles.secondaryLink, { color: look.secondaryLink }]}>{t('signin_forgot_password')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={openForgotUsername}
              style={styles.secondaryLinkWrap}
              disabled={isRecoveringUsername}
            >
              {isRecoveringUsername ? (
                <ActivityIndicator size="small" color={look.spinnerColor} />
              ) : (
                <Text style={[styles.secondaryLink, { color: look.secondaryLink }]}>{t('signin_forgot_username')}</Text>
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
                  <ActivityIndicator size="small" color={look.spinnerColor} />
                ) : (
                  <Text style={[styles.secondaryLink, { color: look.secondaryLink }]}>{t('signin_resend_verification')}</Text>
                )}
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity onPress={() => router.push('/register')} style={styles.footerLinkWrap}>
              <Text style={[styles.footerLink, { color: look.footerLink }]}>{t('signin_footer_signup')}</Text>
            </TouchableOpacity>
          </KeyboardAwareScrollView>
        </LinearGradient>

        <Modal
          visible={isSubmitting}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={[styles.submitOverlay, { backgroundColor: look.submitOverlay }]}>
            <View style={[styles.submitOverlayCard, { backgroundColor: look.submitCardBg, borderColor: look.submitCardBorder }]}>
              <AuthSpinnerWell
                wellBg={look.spinnerWellBg}
                wellBorder={look.spinnerWellBorder}
                preset="signinModal"
              >
                <ActivityIndicator size={120} color={look.spinnerColor} />
              </AuthSpinnerWell>
              <Text style={[styles.submitOverlayText, { color: look.submitText }]}>{t('signin_modal_validating')}</Text>
            </View>
          </View>
        </Modal>

        <Modal
          visible={recoveryMode !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setRecoveryMode(null)}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={[styles.submitOverlay, { backgroundColor: look.submitOverlay }]}>
              <KeyboardAwareScrollView
                contentContainerStyle={[styles.recoveryCard, { backgroundColor: look.recoveryCardBg, borderColor: look.recoveryCardBorder }]}
                bottomOffset={42}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.recoveryTitle, { color: look.recoveryTitle }]}>
                  {recoveryMode === 'password'
                    ? t('signin_recovery_title_password')
                    : t('signin_recovery_title_username')}
                </Text>
                <Text style={[styles.recoveryBody, { color: look.recoveryBody }]}>
                  {recoveryMode === 'password'
                    ? maskedRecoveryEmail
                      ? t('signin_recovery_body_password_masked', { masked: maskedRecoveryEmail })
                      : t('signin_recovery_body_password')
                    : t('signin_recovery_body_username')}
                </Text>
                <View style={[styles.recoveryInputWrap, { backgroundColor: look.recoveryInputWrapBg, borderColor: look.recoveryInputWrapBorder }]}>
                  <TextInput
                    style={[styles.recoveryInput, { color: look.recoveryInputText }]}
                    value={recoveryMode === 'password' ? recoveryEmail : recoveryPhone}
                    onChangeText={recoveryMode === 'password' ? setRecoveryEmail : setRecoveryPhone}
                    placeholder={recoveryMode === 'password' ? t('signin_recovery_placeholder_email') : t('signin_recovery_placeholder_phone')}
                    placeholderTextColor={look.placeholderColor}
                    keyboardType={recoveryMode === 'password' ? 'email-address' : 'phone-pad'}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: look.primaryBtnBg }]}
                  onPress={() => {
                    if (recoveryMode === 'password') void submitForgotPassword();
                    else void submitForgotUsername();
                  }}
                  disabled={isRecoveringPassword || isRecoveringUsername}
                >
                  <Text style={[styles.primaryButtonText, { color: look.primaryBtnText }]}>
                    {isRecoveringPassword || isRecoveringUsername
                      ? t('common_sending')
                      : t('common_continue')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryLinkWrap} onPress={() => setRecoveryMode(null)}>
                  <Text style={[styles.secondaryLink, { color: look.secondaryLink }]}>{t('common_cancel')}</Text>
                </TouchableOpacity>
              </KeyboardAwareScrollView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
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
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 4,
    marginBottom: 10,
    paddingVertical: 4,
  },
  trustBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  trustTextCol: {
    flex: 1,
  },
  trustTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  trustHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    opacity: 0.92,
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
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 12,
    marginTop: -2,
    flexWrap: 'wrap',
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 116,
    justifyContent: 'center',
  },
  modeChipText: {
    fontSize: 13,
    fontWeight: '800',
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
  recoveryCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBE7F8',
    padding: 20,
  },
  recoveryTitle: {
    color: '#0A2540',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  recoveryBody: {
    marginTop: 10,
    color: '#4A4A4A',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  recoveryInputWrap: {
    marginTop: 16,
    backgroundColor: '#F8FBFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE9F2',
    minHeight: 50,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  recoveryInput: {
    color: '#0A2540',
    fontSize: 15,
  },
});
