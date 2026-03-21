import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Progress from 'react-native-progress';
import { LinearGradient } from 'expo-linear-gradient';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth';
import { auth, db } from '../services/firebaseConfig';
import { collection, doc, getDocs, limit, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { ModerationRejectedError, uploadFileWithModeration } from '@/services/moderationApi';
import LuxuryModerationModal from './components/LuxuryModerationModal';
import PremiumSuccessTransition from './components/PremiumSuccessTransition';
import { initializeUserCredits, createDefaultCards, createDefaultVaultData } from '@/services/creditsService';
import { Apple, Chrome, Github } from 'lucide-react-native';
import { SocialProviderId } from '@/services/socialAuth';
import { getEmailFromCredential, getProviderLabel, signInWithSocialProvider } from '@/services/socialAuth';
import { FREE_TIER_POLICY } from '@/constants/freeTierPolicy';
import { grantStudentPackCreditsIfEligible } from '@/services/studentPackService';
import { hardLockCheck } from '@/services/biometricAuth';
import { getCachedCredentials, saveCachedCredentials } from '@/services/credentialVault';
import { expireEmailOtp, sendEmailOtp, verifyEmailOtp } from '@/services/emailOtpApi';

export default function RegisterScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [city, setCity] = useState('');
  const [password, setPassword] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [verificationSelfieUri, setVerificationSelfieUri] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStageLabel, setUploadStageLabel] = useState('Iniciando...');
  const [moderationAlertVisible, setModerationAlertVisible] = useState(false);
  const [moderationAlertMessage, setModerationAlertMessage] = useState('');
  const [rejectionAttempts, setRejectionAttempts] = useState(0);
  const [retryLockedUntil, setRetryLockedUntil] = useState<number | null>(null);
  const [retryCountdownSec, setRetryCountdownSec] = useState(0);
  const [successTransitionVisible, setSuccessTransitionVisible] = useState(false);
  const [socialProviderId, setSocialProviderId] = useState<SocialProviderId | null>(null);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [biometricAutofillDone, setBiometricAutofillDone] = useState(false);
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [otpSessionId, setOtpSessionId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpExpiresAtMs, setOtpExpiresAtMs] = useState<number | null>(null);
  const [otpRemainingSec, setOtpRemainingSec] = useState(0);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const router = useRouter();
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const retryLockMessage =
    'Estamos cuidando la integridad de la comunidad. Por favor, espera un momento antes de intentar de nuevo';

  const isRetryLocked = retryLockedUntil !== null && retryLockedUntil > Date.now();

  useEffect(() => {
    if (!retryLockedUntil) {
      setRetryCountdownSec(0);
      return;
    }

    const tick = () => {
      const remaining = Math.ceil((retryLockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setRetryLockedUntil(null);
        setRetryCountdownSec(0);
        return;
      }
      setRetryCountdownSec(remaining);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [retryLockedUntil]);

  useEffect(() => {
    setOtpVerified(false);
    setOtpCode('');
    setOtpSessionId('');
    setOtpExpiresAtMs(null);
    setOtpRemainingSec(0);
  }, [email]);

  useEffect(() => {
    const nicknameTrimmed = nickname.trim();
    const nicknameLower = nicknameTrimmed.toLowerCase();

    if (!nicknameTrimmed) {
      setNicknameStatus('idle');
      return;
    }

    if (!/^[a-z0-9._-]{3,24}$/i.test(nicknameTrimmed)) {
      setNicknameStatus('invalid');
      return;
    }

    setNicknameStatus('checking');
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const usersRef = collection(db, 'users');
          const snapshot = await getDocs(query(usersRef, where('nicknameLower', '==', nicknameLower), limit(1)));
          const currentUid = auth.currentUser?.uid;
          if (snapshot.empty) {
            setNicknameStatus('available');
            return;
          }

          const found = snapshot.docs[0];
          setNicknameStatus(found.id === currentUid ? 'available' : 'taken');
        } catch {
          setNicknameStatus('idle');
        }
      })();
    }, 450);

    return () => clearTimeout(timeout);
  }, [nickname]);

  useEffect(() => {
    if (!otpExpiresAtMs || otpVerified) {
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((otpExpiresAtMs - Date.now()) / 1000));
      setOtpRemainingSec(remaining);
      if (remaining === 0) {
        const normalizedEmail = email.trim().toLowerCase();
        const currentSessionId = otpSessionId;
        setOtpSessionId('');
        setOtpCode('');
        setOtpExpiresAtMs(null);
        setOtpVerified(false);
        if (normalizedEmail && currentSessionId) {
          void expireEmailOtp({ email: normalizedEmail, sessionId: currentSessionId }).catch(() => null);
        }
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [email, otpExpiresAtMs, otpSessionId, otpVerified]);

  const registerModerationReject = () => {
    const attempts = rejectionAttempts + 1;
    if (attempts >= 3) {
      setRetryLockedUntil(Date.now() + 5 * 60 * 1000);
      setRejectionAttempts(0);
      setModerationAlertMessage(retryLockMessage);
      setModerationAlertVisible(true);
      return;
    }

    setRejectionAttempts(attempts);
    setModerationAlertMessage(
      'Parece que tu sonrisa no se ve clara. Intenta de nuevo para asegurar tu acceso premium.'
    );
    setModerationAlertVisible(true);
  };

  const normalizePhone = (value: string) => value.replace(/[^\d+]/g, '');

  const parseBirthDate = (dateText: string): Date | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const parsed = new Date(year, month, day);

    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month ||
      parsed.getDate() !== day
    ) {
      return null;
    }

    return parsed;
  };

  const getAge = (date: Date) => {
    const now = new Date();
    let age = now.getFullYear() - date.getFullYear();
    const monthDiff = now.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
      age -= 1;
    }
    return age;
  };

  const requestGalleryPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se necesita acceso a la galería para elegir una foto.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const requestCameraPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se necesita acceso a la cámara para tomar tu foto.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const requestVerificationSelfie = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la camara para validar que eres una persona real.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      const asset = result.assets[0];
      const hasClearFace = await hasClearlyVisibleFace(asset.uri, asset.width, asset.height);
      if (!hasClearFace) {
        Alert.alert(
          'Selfie no valida aun',
          'No detectamos tu rostro con claridad. Intenta una selfie frontal con sonrisa o guino.'
        );
        return;
      }

      setVerificationSelfieUri(asset.uri);
    }
  };

  const hasClearlyVisibleFace = async (uri: string, imageWidth?: number, imageHeight?: number) => {
    try {
      // Load face detector at runtime to avoid crashing in Expo Go when native module is unavailable.
      const FaceDetector = await import('expo-face-detector');

      const detection = await FaceDetector.detectFacesAsync(uri, {
        mode: FaceDetector.FaceDetectorMode.fast,
        detectLandmarks: FaceDetector.FaceDetectorLandmarks.none,
        runClassifications: FaceDetector.FaceDetectorClassifications.none,
      });

      const faces = detection.faces || [];
      if (faces.length === 0) {
        return false;
      }

      if (!imageWidth || !imageHeight) {
        return true;
      }

      const imageArea = imageWidth * imageHeight;
      return faces.some((face: any) => {
        const faceWidth = Number(face.bounds?.size?.width || 0);
        const faceHeight = Number(face.bounds?.size?.height || 0);
        const faceArea = faceWidth * faceHeight;
        return faceArea / imageArea >= 0.08;
      });
    } catch (error) {
      console.warn('Face detection failed:', error);
      // Fallback: rely on backend moderation if local detector is not present in current runtime.
      return true;
    }
  };

  const inferMimeType = (uri: string, fallbackName?: string) => {
    const probe = `${fallbackName || ''} ${uri}`.toLowerCase();
    if (probe.includes('.pdf')) return 'application/pdf';
    if (probe.includes('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (probe.includes('.doc')) return 'application/msword';
    if (probe.includes('.png')) return 'image/png';
    if (probe.includes('.heic')) return 'image/heic';
    if (probe.includes('.webp')) return 'image/webp';
    if (probe.includes('.jpg') || probe.includes('.jpeg')) return 'image/jpeg';
    return 'application/octet-stream';
  };

  const uploadWithSafety = async (
    fileUri: string,
    label: string,
    ownerUid: string,
    fileName: string,
    mimeType: string
  ) => {
    setUploadProgress(0.15);
    setUploadStageLabel('Enviando al escudo de seguridad...');
    setUploadModalVisible(true);

    const result = await uploadFileWithModeration({
      fileUri,
      ownerUid,
      label,
      fileName,
      mimeType,
    });

    setUploadProgress(0.75);
    setUploadStageLabel('Moderando en Azure Content Safety...');
    setUploadProgress(1);
    setUploadStageLabel('Contenido aprobado. Continuando...');

    return result.fileId;
  };

  const checkUniqueness = async (
    nicknameLower: string,
    emailLower: string,
    phoneNormalized: string,
    ignoreUid?: string
  ) => {
    const usersRef = collection(db, 'users');

    const [nicknameSnap, emailSnap, phoneSnap] = await Promise.all([
      getDocs(query(usersRef, where('nicknameLower', '==', nicknameLower), limit(1))),
      getDocs(query(usersRef, where('emailLower', '==', emailLower), limit(1))),
      getDocs(query(usersRef, where('phoneNormalized', '==', phoneNormalized), limit(1))),
    ]);

    if (!nicknameSnap.empty && nicknameSnap.docs[0].id !== ignoreUid) {
      throw new Error('El nickname ya está en uso.');
    }
    if (!emailSnap.empty && emailSnap.docs[0].id !== ignoreUid) {
      throw new Error('El email ya está en uso.');
    }
    if (!phoneSnap.empty && phoneSnap.docs[0].id !== ignoreUid) {
      throw new Error('El teléfono ya está en uso.');
    }
  };

  const handleSocialBootstrap = async (providerId: SocialProviderId) => {
    setIsSubmitting(true);
    try {
      const credential = await signInWithSocialProvider(providerId);
      const providerEmail = getEmailFromCredential(credential);

      if (!providerEmail) {
        await signOut(auth);
        Alert.alert('Email requerido', `No se detectó email desde ${getProviderLabel(providerId)}.`);
        return;
      }

      const usersRef = collection(db, 'users');
      const existingByEmail = await getDocs(
        query(usersRef, where('emailLower', '==', providerEmail), limit(1))
      );

      if (!existingByEmail.empty && existingByEmail.docs[0].id !== credential.user.uid) {
        await signOut(auth);
        Alert.alert(
          'Cuenta ya existente',
          'Ese email ya está ligado a otra identidad de Card-Social. Inicia sesión en lugar de crear otra cuenta.'
        );
        return;
      }

      setEmail(providerEmail);
      setSocialProviderId(providerId);
      Alert.alert(
        `${getProviderLabel(providerId)} conectado`,
        'Perfecto. Ahora completa el formulario obligatorio (teléfono, fecha, ciudad y demás) para terminar tu alta.'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar con proveedor.';
      Alert.alert('Registro social no disponible', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBiometricAutofill = async () => {
    if (biometricAutofillDone) {
      return;
    }

    const unlocked = await hardLockCheck('autocompletar credenciales en registro');
    if (!unlocked) {
      return;
    }

    const cached = await getCachedCredentials();
    if (!cached) {
      return;
    }

    setEmail(cached.email);
    if (!socialProviderId) {
      setPassword(cached.password);
    }
    setBiometricAutofillDone(true);
  };

  const handleSendEmailOtp = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert('Email requerido', 'Ingresa tu email antes de solicitar OTP.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Alert.alert('Email inválido', 'Usa un correo válido para recibir el código OTP.');
      return;
    }

    setOtpSending(true);
    try {
      const response = await sendEmailOtp(normalizedEmail);
      const expiresAt = new Date(response.expiresAt).getTime();
      setOtpSessionId(response.sessionId);
      setOtpExpiresAtMs(expiresAt);
      setOtpRemainingSec(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
      setOtpCode('');
      setOtpVerified(false);
      Alert.alert('OTP enviado', 'Revisa tu email. El código expira en 3 minutos.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo enviar OTP por email.';
      Alert.alert('Error OTP', message);
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !otpSessionId) {
      Alert.alert('OTP inválido', 'Primero solicita un código OTP por email.');
      return;
    }
    if (!otpCode.trim()) {
      Alert.alert('Código requerido', 'Ingresa el código OTP de 6 dígitos.');
      return;
    }
    if (otpRemainingSec <= 0) {
      Alert.alert('OTP expirado', 'El código venció. Solicita uno nuevo.');
      return;
    }

    setOtpVerifying(true);
    try {
      await verifyEmailOtp({
        email: normalizedEmail,
        code: otpCode.trim(),
        sessionId: otpSessionId,
      });
      setOtpVerified(true);
      Alert.alert('Email verificado', 'OTP válido. Puedes completar tu registro.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo validar el OTP.';
      setOtpVerified(false);
      Alert.alert('OTP inválido', message);
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleRegister = async () => {
        if (isRetryLocked) {
          setModerationAlertMessage(retryLockMessage);
          setModerationAlertVisible(true);
          return;
        }

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const nicknameLower = nickname.trim().toLowerCase();
    const emailLower = email.trim().toLowerCase();
    const phoneNormalized = normalizePhone(phoneNumber);
    const parsedBirthDate = parseBirthDate(birthDate);

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !nickname.trim() ||
      !email.trim() ||
      !phoneNormalized ||
      !birthDate.trim() ||
      !city.trim() ||
      !photoUri ||
      !verificationSelfieUri
    ) {
      Alert.alert('Campos incompletos', 'Completa todos los campos incluyendo tu selfie de verificacion.');
      return;
    }

    if (!socialProviderId && !password) {
      Alert.alert('Campos incompletos', 'Ingresa una contraseña para crear tu cuenta con email.');
      return;
    }

    if (!parsedBirthDate) {
      Alert.alert('Fecha inválida', 'Usa formato YYYY-MM-DD para la fecha de nacimiento.');
      return;
    }

    if (getAge(parsedBirthDate) < 18) {
      Alert.alert('Registro restringido', 'Debes ser mayor de 18 años para crear cuenta.');
      return;
    }

    if (!socialProviderId && password.length < 8) {
      Alert.alert('Contraseña insegura', 'La contraseña debe tener mínimo 8 caracteres.');
      return;
    }

    if (nicknameStatus !== 'available') {
      Alert.alert('Nickname no disponible', 'Necesitas un nickname disponible para continuar.');
      return;
    }

    if (!otpVerified) {
      Alert.alert('Verificación pendiente', 'Debes verificar tu email con OTP de 3 minutos antes de registrarte.');
      return;
    }

    if (!acceptedLegal) {
      Alert.alert('Confirmación requerida', 'Debes aceptar Términos y Privacidad para crear tu cuenta.');
      return;
    }

    setIsSubmitting(true);
    setUploadModalVisible(false);
    setUploadProgress(0);
    setUploadStageLabel('Iniciando...');
    try {
      await checkUniqueness(nicknameLower, emailLower, phoneNormalized, auth.currentUser?.uid);

      const selfieLooksValid = await hasClearlyVisibleFace(verificationSelfieUri);
      if (!selfieLooksValid) {
        Alert.alert(
          'Selfie no valida aun',
          'No detectamos un rostro visible en la selfie de verificacion. Intenta de nuevo con mejor luz y tu gesto.'
        );
        return;
      }

      const onboardingOwner = `onboarding-${nicknameLower || Date.now()}`;

      setUploadStageLabel('Validando foto de perfil...');
      const moderatedPhotoFileId = await uploadWithSafety(
        photoUri,
        'profile-photo',
        onboardingOwner,
        `profile-${Date.now()}.jpg`,
        inferMimeType(photoUri, 'profile.jpg')
      );

      setUploadProgress(0.25);
      setUploadProgress(0.25);
      setUploadStageLabel('Validando selfie de verificacion (sonrisa o guino)...');
      const moderatedVerificationSelfieFileId = await uploadWithSafety(
        verificationSelfieUri,
        'verification-selfie',
        onboardingOwner,
        `verification-selfie-${Date.now()}.jpg`,
        inferMimeType(verificationSelfieUri, 'verification-selfie.jpg')
      );

      let uid = auth.currentUser?.uid;
      if (!socialProviderId) {
        const authResult = await createUserWithEmailAndPassword(auth, emailLower, password);
        uid = authResult.user.uid;
        await saveCachedCredentials(emailLower, password);
      }

      if (!uid) {
        throw new Error('No se pudo establecer una sesión válida para completar el registro.');
      }

      // 🏆 AUTO-PROMOCIÓN: Si el email es pochobs@gmail.com, automáticamente es super_admin
      const isPochobs = emailLower === 'pochobs@gmail.com';
      const userRole = isPochobs ? 'super_admin' : 'user';
      const creditsBalance = isPochobs ? 999999999 : 0; // Pochobs tiene 999M de CS
      const premiumUntil = isPochobs ? '2099-12-31T23:59:59Z' : null;
      const isPremium = isPochobs ? true : false;

      const userRef = doc(db, 'users', uid);
      const nicknameKeyRef = doc(db, 'unique_user_keys', `nickname:${nicknameLower}`);
      const emailKeyRef = doc(db, 'unique_user_keys', `email:${emailLower}`);
      const phoneKeyRef = doc(db, 'unique_user_keys', `phone:${phoneNormalized}`);

      await runTransaction(db, async (tx) => {
        const [nicknameKeyDoc, emailKeyDoc, phoneKeyDoc] = await Promise.all([
          tx.get(nicknameKeyRef),
          tx.get(emailKeyRef),
          tx.get(phoneKeyRef),
        ]);

        const validateKeyOwner = (keyDoc: any, fieldLabel: 'nickname' | 'email' | 'teléfono') => {
          if (!keyDoc.exists()) return;
          const ownerUid = keyDoc.data()?.uid;
          if (ownerUid && ownerUid !== uid) {
            throw new Error(`El ${fieldLabel} ya está en uso.`);
          }
        };

        validateKeyOwner(nicknameKeyDoc, 'nickname');
        validateKeyOwner(emailKeyDoc, 'email');
        validateKeyOwner(phoneKeyDoc, 'teléfono');

        tx.set(
          userRef,
          {
            uid,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            fullName,
            nickname: nickname.trim(),
            nicknameLower,
            lastNicknameChange: serverTimestamp(),
            email: emailLower,
            emailLower,
            phone: phoneNumber.trim(),
            phoneNormalized,
            birthDate: parsedBirthDate.toISOString(),
            isAdult: true,
            city: city.trim(),
            timezone,
            photoUrl: `mongo-gridfs://${moderatedPhotoFileId}`,
            profilePhotoFileId: moderatedPhotoFileId,
            verificationSelfieFileId: moderatedVerificationSelfieFileId,
            verificationStatus: 'verified',
            verificationApprovedAt: serverTimestamp(),
            authProvider: socialProviderId || 'password',
            role: userRole,
            creditsBalance,
            subscriptionPlan: isPochobs ? 'premium-infinite' : 'free',
            subscriptionStatus: 'active',
            subscriptionStartedAt: serverTimestamp(),
            subscriptionMarkedAt: serverTimestamp(),
            subscriptionExpiresAt: premiumUntil ? new Date(premiumUntil) : null,
            isPremium,
            premiumUntil,
            freeTierLimits: {
              cards: FREE_TIER_POLICY.cards,
              vaultItems: FREE_TIER_POLICY.vaultItems,
            },
            biometricEnabled: false,
            biometricPreferenceAsked: false,
            revenueCatSubscriptionId: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: false }
        );

        tx.set(nicknameKeyRef, { uid, type: 'nickname', value: nicknameLower, updatedAt: serverTimestamp() }, { merge: true });
        tx.set(emailKeyRef, { uid, type: 'email', value: emailLower, updatedAt: serverTimestamp() }, { merge: true });
        tx.set(phoneKeyRef, { uid, type: 'phone', value: phoneNormalized, updatedAt: serverTimestamp() }, { merge: true });
      });

      // Initialize zero-balance credits (100 CS only on payment confirmation)
      await initializeUserCredits(uid);

      const authProvider = socialProviderId || 'password';
      const studentPackResult = await grantStudentPackCreditsIfEligible({
        uid,
        emailLower,
        authProvider,
      });
      
      // Create 3 default cards: Personal, Trabajo, Social
      await createDefaultCards(uid);
      
      // Create 3 default vault data: Teléfono, Email, Red Social
      await createDefaultVaultData(uid);

      if (!socialProviderId) {
        if (auth.currentUser) {
          await sendEmailVerification(auth.currentUser);
        }
        await signOut(auth);
        Alert.alert(
          'Verifica tu correo',
          'Te enviamos un enlace de verificación. Debes confirmarlo antes de poder iniciar sesión.'
        );
        router.replace('/signin' as never);
        return;
      }

      if (studentPackResult.granted) {
        Alert.alert('Student Pack activado', `Se acreditaron ${studentPackResult.bonusAmount} CS por elegibilidad estudiantil.`);
      }

      setSuccessTransitionVisible(true);
    } catch (error) {
      console.error('Error Firebase:', error);
      if (error instanceof ModerationRejectedError) {
        registerModerationReject();
      } else {
        const message = error instanceof Error ? error.message : 'No se pudo completar el registro.';
        Alert.alert('Error de Registro', message);
      }
    } finally {
      setUploadModalVisible(false);
      setIsSubmitting(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <LinearGradient
          colors={['#EAF7FF', '#CDEFFF', '#B8E7FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        >
          <ScrollView
            contentContainerStyle={styles.inner}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <Text style={styles.title}>Crea tu Identidad</Text>

          <Text style={styles.socialHelper}>Tambien puedes comenzar con Apple, Google o GitHub (acceso instantaneo)</Text>
          <View style={styles.socialRow}>
            <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialBootstrap('apple.com')}>
              <Apple color="#0A2540" size={16} />
              <Text style={styles.socialButtonText}>Apple</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialBootstrap('google.com')}>
              <Chrome color="#0A2540" size={16} />
              <Text style={styles.socialButtonText}>Google</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialButton} onPress={() => handleSocialBootstrap('github.com')}>
              <Github color="#0A2540" size={16} />
              <Text style={styles.socialButtonText}>GitHub</Text>
            </TouchableOpacity>
          </View>
          {socialProviderId ? (
            <Text style={styles.socialStateText}>
              Registro conectado con {getProviderLabel(socialProviderId)}. Debes completar el resto de campos obligatorios.
            </Text>
          ) : null}

          <Text style={styles.label}>Foto de Perfil</Text>
          <View style={styles.photoRow}>
            <TouchableOpacity style={styles.photoButton} onPress={requestCameraPhoto}>
              <Text style={styles.photoButtonText}>Abrir camara</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoButton} onPress={requestGalleryPhoto}>
              <Text style={styles.photoButtonText}>Elegir imagen</Text>
            </TouchableOpacity>
          </View>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.photoPreview} /> : null}

          <Text style={styles.label}>Selfie de Verificacion</Text>
          <Text style={styles.helperText}>Para proteger la comunidad, toma una selfie con una sonrisa o un guino. Solo valida que eres humano.</Text>
          <TouchableOpacity style={styles.photoButton} onPress={requestVerificationSelfie}>
            <Text style={styles.photoButtonText}>Tomar selfie de verificacion</Text>
          </TouchableOpacity>
          {verificationSelfieUri ? <Image source={{ uri: verificationSelfieUri }} style={styles.photoPreview} /> : null}

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Alfonso"
            placeholderTextColor="#8E8E93"
            value={firstName}
            onChangeText={setFirstName}
          />

          <Text style={styles.label}>Apellido</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Barreto"
            placeholderTextColor="#8E8E93"
            value={lastName}
            onChangeText={setLastName}
          />

          <Text style={styles.label}>NickName (Unico)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: alfonso.barreto"
            placeholderTextColor="#8E8E93"
            autoCapitalize="none"
            value={nickname}
            onChangeText={setNickname}
          />
          <Text
            style={[
              styles.validationText,
              nicknameStatus === 'available' && styles.validationOk,
              (nicknameStatus === 'taken' || nicknameStatus === 'invalid') && styles.validationError,
            ]}
          >
            {nicknameStatus === 'available'
              ? 'Nickname disponible'
              : nicknameStatus === 'checking'
                ? 'Validando nickname...'
                : nicknameStatus === 'taken'
                  ? 'Nickname ocupado'
                  : nicknameStatus === 'invalid'
                    ? 'Nickname inválido (3-24, letras/números/._-)'
                    : 'Ingresa un nickname para validar disponibilidad'}
          </Text>

          <Text style={styles.label}>Email (Unico)</Text>
          <TextInput
            style={styles.input}
            placeholder="correo@ejemplo.com"
            placeholderTextColor="#8E8E93"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            editable={!socialProviderId}
            onFocus={() => {
              void handleBiometricAutofill();
            }}
          />

          <View style={styles.otpCard}>
            <Text style={styles.otpTitle}>Verificación OTP por Email (180s)</Text>
            <TouchableOpacity style={styles.otpSendBtn} onPress={() => { void handleSendEmailOtp(); }} disabled={otpSending}>
              {otpSending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.otpSendBtnText}>Enviar OTP</Text>}
            </TouchableOpacity>
            <Text style={[styles.otpTimer, otpRemainingSec <= 20 && otpRemainingSec > 0 ? styles.otpTimerWarn : null]}>
              {otpRemainingSec > 0 ? `Tiempo restante: ${Math.floor(otpRemainingSec / 60)}:${String(otpRemainingSec % 60).padStart(2, '0')}` : 'OTP no activo'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Código OTP de 6 dígitos"
              placeholderTextColor="#8E8E93"
              keyboardType="number-pad"
              value={otpCode}
              onChangeText={setOtpCode}
              maxLength={6}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
            />
            <TouchableOpacity
              style={[styles.otpVerifyBtn, otpVerified && styles.otpVerifyBtnOk]}
              onPress={() => {
                void handleVerifyEmailOtp();
              }}
              disabled={otpVerifying || otpVerified}
            >
              {otpVerifying ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.otpVerifyBtnText}>{otpVerified ? 'Email verificado' : 'Validar OTP'}</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Telefono (Unico)</Text>
          <TextInput
            style={styles.input}
            placeholder="+1 000 000 0000"
            placeholderTextColor="#8E8E93"
            keyboardType="phone-pad"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />

          <Text style={styles.label}>Fecha de Nacimiento</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#8E8E93"
            value={birthDate}
            onChangeText={setBirthDate}
          />

          <Text style={styles.label}>Ciudad</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Houston"
            placeholderTextColor="#8E8E93"
            value={city}
            onChangeText={setCity}
          />

          <Text style={styles.label}>Horario detectado</Text>
          <Text style={styles.readOnlyValue}>{timezone}</Text>

          {!socialProviderId ? (
            <>
              <Text style={styles.label}>Contrasena</Text>
              <TextInput
                style={styles.input}
                placeholder="Minimo 8 caracteres"
                placeholderTextColor="#8E8E93"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onFocus={() => {
                  void handleBiometricAutofill();
                }}
              />
            </>
          ) : null}

          <TouchableOpacity
            style={[
              styles.registerButton,
              (!acceptedLegal || isSubmitting || isRetryLocked || nicknameStatus !== 'available' || !otpVerified) && styles.registerButtonDisabled,
            ]}
            onPress={handleRegister}
            disabled={isSubmitting || !acceptedLegal || isRetryLocked || nicknameStatus !== 'available' || !otpVerified}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#0A2540" />
            ) : (
              <Text style={styles.registerButtonText}>CONFIRMAR REGISTRO</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.legalRow} onPress={() => setAcceptedLegal((prev) => !prev)} activeOpacity={0.85}>
            <View style={[styles.legalCheckbox, acceptedLegal && styles.legalCheckboxChecked]}>
              {acceptedLegal ? <Text style={styles.legalCheckmark}>✓</Text> : null}
            </View>
            <Text style={styles.legalText}>Acepto Términos y Condiciones + Política de Privacidad</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
            <Text style={{ color: 'white', opacity: 0.5 }}>Volver atrás</Text>
          </TouchableOpacity>
          </ScrollView>
        </LinearGradient>

        <Modal
          visible={uploadModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={styles.progressOverlay}>
            <View style={styles.progressContainer}>
              <Progress.Circle
                size={140}
                progress={uploadProgress}
                color="#1EA7FF"
                unfilledColor="#0D3A56"
                borderWidth={3}
                thickness={8}
              />
              <Text style={styles.uploadPercentage}>{Math.round(uploadProgress * 100)}%</Text>
              <Text style={styles.uploadLabel}>{uploadStageLabel}</Text>
            </View>
          </View>
        </Modal>

        <LuxuryModerationModal
          visible={moderationAlertVisible}
          title="Exclusividad de Seguridad"
          message={moderationAlertMessage}
          onClose={() => setModerationAlertVisible(false)}
          onRetry={() => setModerationAlertVisible(false)}
          retryLocked={isRetryLocked}
          retryCountdownSec={retryCountdownSec}
          lockMessage={retryLockMessage}
        />

        <PremiumSuccessTransition
          visible={successTransitionVisible}
          durationMs={1800}
          onDone={() => {
            setSuccessTransitionVisible(false);
            router.replace('/(tabs)/vault');
          }}
        />
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientBg: {
    flex: 1,
  },
  inner: {
    paddingTop: 40,
    paddingBottom: 40,
    padding: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0D4D8A',
    marginBottom: 24,
    alignSelf: 'center',
  },
  socialHelper: {
    color: '#2A6B97',
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 12,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  socialButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7BC2EC',
    backgroundColor: 'rgba(255,255,255,0.65)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  socialButtonText: {
    color: '#0A2540',
    fontWeight: '700',
    fontSize: 12,
  },
  socialStateText: {
    color: '#0A2540',
    fontSize: 12,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  label: {
    alignSelf: 'flex-start',
    color: '#0D4D8A',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 5,
    marginLeft: 5,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  photoButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.62)',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#7BC2EC',
    alignItems: 'center',
  },
  photoButtonText: {
    color: '#0D4D8A',
    fontWeight: '700',
  },
  photoPreview: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignSelf: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#7BC2EC',
  },
  uploadedFileText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 16,
    opacity: 0.9,
  },
  helperText: {
    color: '#2A6B97',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  validationText: {
    marginTop: -12,
    marginBottom: 14,
    marginLeft: 4,
    fontSize: 12,
    color: '#4A4A4A',
    fontWeight: '600',
  },
  validationOk: {
    color: '#1F9D55',
  },
  validationError: {
    color: '#C0392B',
  },
  otpCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7BC2EC',
    padding: 12,
    marginBottom: 14,
  },
  otpTitle: {
    color: '#0A2540',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 8,
  },
  otpSendBtn: {
    backgroundColor: '#0A2540',
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  otpSendBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  otpTimer: {
    color: '#0A2540',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 10,
  },
  otpTimerWarn: {
    color: '#C0392B',
  },
  otpVerifyBtn: {
    marginTop: 2,
    backgroundColor: '#1E88E5',
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpVerifyBtnOk: {
    backgroundColor: '#1F9D55',
  },
  otpVerifyBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  input: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
    color: '#0A2540',
    fontSize: 16,
  },
  readOnlyValue: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#0D4D8A',
    borderColor: '#7BC2EC',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  registerButton: {
    backgroundColor: '#0D4D8A',
    paddingVertical: 18,
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  registerButtonDisabled: {
    opacity: 0.55,
  },
  legalRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legalCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0A2540',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  legalCheckboxChecked: {
    backgroundColor: '#0A2540',
    borderColor: '#0A2540',
  },
  legalCheckmark: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 16,
  },
  legalText: {
    flex: 1,
    color: '#0A2540',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  progressOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#7BC2EC',
  },
  uploadPercentage: {
    color: '#0D4D8A',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 20,
  },
  uploadLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
});
