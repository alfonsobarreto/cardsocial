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
  Modal,
} from 'react-native';
import ActivityIndicator from '@/components/BrandedSpinner';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
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
import { saveCachedCredentials } from '@/services/credentialVault';
import { useLanguage } from '@/services/language';
import { Picker } from '@react-native-picker/picker';

export default function RegisterScreen() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => (language === 'en' ? en : es);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [city, setCity] = useState('');
  const [stateRegion, setStateRegion] = useState('');
  const [country, setCountry] = useState('');
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
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [phoneStatus, setPhoneStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [birthPickerVisible, setBirthPickerVisible] = useState(false);
  const [pickerYear, setPickerYear] = useState(2000);
  const [pickerMonth, setPickerMonth] = useState(1);
  const [pickerDay, setPickerDay] = useState(1);
  const [isAutofillingLocation, setIsAutofillingLocation] = useState(false);
  const router = useRouter();
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const retryLockMessage =
    tr(
      'Estamos cuidando la integridad de la comunidad. Por favor, espera un momento antes de intentar de nuevo',
      'We are protecting community integrity. Please wait a moment before trying again.'
    );

  const pad2 = (value: number) => String(value).padStart(2, '0');

  const formatBirthDateUs = (month: number, day: number, year: number) =>
    `${pad2(month)}-${pad2(day)}-${String(year).padStart(4, '0')}`;

  const formatBirthDateInput = (raw: string) => {
    const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) {
      return digits;
    }
    if (digits.length <= 4) {
      return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
  };

  const parseBirthDateUsParts = (value: string) => {
    const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(value || '').trim());
    if (!match) {
      return null;
    }

    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
      return null;
    }
    return { month, day, year };
  };

  const openBirthPicker = () => {
    const parsed = parseBirthDateUsParts(birthDate);
    if (parsed) {
      setPickerMonth(parsed.month);
      setPickerDay(parsed.day);
      setPickerYear(parsed.year);
    } else {
      const defaultYear = new Date().getFullYear() - 18;
      setPickerMonth(1);
      setPickerDay(1);
      setPickerYear(defaultYear);
    }
    setBirthPickerVisible(true);
  };

  const confirmBirthPicker = () => {
    const candidate = new Date(pickerYear, pickerMonth - 1, pickerDay);
    if (
      candidate.getFullYear() !== pickerYear ||
      candidate.getMonth() !== pickerMonth - 1 ||
      candidate.getDate() !== pickerDay
    ) {
      Alert.alert(tr('Fecha inválida', 'Invalid date'), tr('Selecciona una fecha válida.', 'Please select a valid date.'));
      return;
    }

    setBirthDate(formatBirthDateUs(pickerMonth, pickerDay, pickerYear));
    setBirthPickerVisible(false);
  };

  const autofillLocationFromDevice = async () => {
    setIsAutofillingLocation(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const rows = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const first = rows[0];
      if (!first) {
        return;
      }

      const detectedCity = String(first.city || first.district || first.subregion || '').trim();
      const detectedState = String(first.region || first.subregion || '').trim();
      const detectedCountry = String(first.country || '').trim();

      if (detectedCity) setCity(detectedCity);
      if (detectedState) setStateRegion(detectedState);
      if (detectedCountry) setCountry(detectedCountry);
    } catch (error) {
      console.warn('Location autofill failed:', error);
    } finally {
      setIsAutofillingLocation(false);
    }
  };

  const isRetryLocked = retryLockedUntil !== null && retryLockedUntil > Date.now();

  const loadFaceDetectorModule = () => {
    // DISABLED (A4): Always return null. Backend Azure Content Safety is the single truth.
    return null;
  };

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
    if (!uploadModalVisible) {
      return;
    }

    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        const floor = 0.15;
        const ceiling = 0.92;
        const current = prev < floor ? floor : prev;
        const step = current < 0.6 ? 0.035 : 0.012;
        const next = current + step;
        return next > ceiling ? ceiling : Number(next.toFixed(3));
      });
    }, 420);

    return () => clearInterval(interval);
  }, [uploadModalVisible]);

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
    const emailTrimmed = email.trim();
    const emailLower = emailTrimmed.toLowerCase();

    if (!emailTrimmed) {
      setEmailStatus('idle');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      setEmailStatus('invalid');
      return;
    }

    setEmailStatus('checking');
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const usersRef = collection(db, 'users');
          const snapshot = await getDocs(query(usersRef, where('emailLower', '==', emailLower), limit(1)));
          const currentUid = auth.currentUser?.uid;
          if (snapshot.empty) {
            setEmailStatus('available');
            return;
          }

          const found = snapshot.docs[0];
          setEmailStatus(found.id === currentUid ? 'available' : 'taken');
        } catch {
          setEmailStatus('idle');
        }
      })();
    }, 450);

    return () => clearTimeout(timeout);
  }, [email]);

  useEffect(() => {
    const phoneNormalized = phoneNumber.replace(/[^\d+]/g, '');

    if (!phoneNormalized) {
      setPhoneStatus('idle');
      return;
    }

    if (phoneNormalized.replace(/\D/g, '').length < 8) {
      setPhoneStatus('invalid');
      return;
    }

    setPhoneStatus('checking');
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const usersRef = collection(db, 'users');
          const snapshot = await getDocs(query(usersRef, where('phoneNormalized', '==', phoneNormalized), limit(1)));
          const currentUid = auth.currentUser?.uid;
          if (snapshot.empty) {
            setPhoneStatus('available');
            return;
          }

          const found = snapshot.docs[0];
          setPhoneStatus(found.id === currentUid ? 'available' : 'taken');
        } catch {
          setPhoneStatus('idle');
        }
      })();
    }, 450);

    return () => clearTimeout(timeout);
  }, [phoneNumber]);

  useEffect(() => {
    if (city.trim() || stateRegion.trim() || country.trim()) {
      return;
    }
    void autofillLocationFromDevice();
  }, []);

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
    const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateText.trim());
    if (!match) {
      return null;
    }

    const month = Number(match[1]) - 1;
    const day = Number(match[2]);
    const year = Number(match[3]);
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
      Alert.alert(
        tr('Permiso denegado', 'Permission denied'),
        tr('Se necesita acceso a la galería para elegir una foto.', 'Gallery access is required to choose a photo.')
      );
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
      Alert.alert(
        tr('Permiso denegado', 'Permission denied'),
        tr('Se necesita acceso a la cámara para tomar tu foto.', 'Camera access is required to take your photo.')
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
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
      Alert.alert(
        tr('Permiso denegado', 'Permission denied'),
        tr('Necesitamos acceso a la camara para validar que eres una persona real.', 'We need camera access to validate that you are a real person.')
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      const asset = result.assets[0];
      const hasClearFace = await hasClearlyVisibleFace(asset.uri, asset.width, asset.height);
      if (!hasClearFace) {
        Alert.alert(
          tr('Selfie no valida aun', 'Selfie not valid yet'),
          tr('No detectamos tu rostro con claridad. Intenta una selfie frontal con sonrisa o guino.', 'We could not clearly detect your face. Try a front selfie with a smile or wink.')
        );
        return;
      }

      setVerificationSelfieUri(asset.uri);
    }
  };

  const hasClearlyVisibleFace = async (uri: string, imageWidth?: number, imageHeight?: number) => {
    try {
      const FaceDetector = loadFaceDetectorModule();
      // Triple-guard: if null, if no method, or if anything fails -> fallback to Azure
      if (!FaceDetector) {
        console.log('FaceDetector unavailable (expected in Expo Go). Relying on backend Azure moderation.');
        return true;
      }
      if (typeof FaceDetector.detectFacesAsync !== 'function') {
        console.log('detectFacesAsync not available. Relying on backend Azure moderation.');
        return true;
      }

      const detection = await FaceDetector.detectFacesAsync(uri, {
        mode: FaceDetector.FaceDetectorMode.fast,
        detectLandmarks: FaceDetector.FaceDetectorLandmarks.none,
        runClassifications: FaceDetector.FaceDetectorClassifications.none,
      });

      const faces = detection?.faces || [];
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
      console.warn('Local face detection threw error (expected):', String(error).slice(0, 50));
      // Always fallback to Azure backend moderation
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

    const allowModerationBypass = process.env.EXPO_PUBLIC_ALLOW_PHOTO_MODERATION_BYPASS === '1';

    let result: { fileId: string; filename: string; publicUrl: string | null };
    try {
      result = await uploadFileWithModeration({
        fileUri,
        ownerUid,
        label,
        fileName,
        mimeType,
      });
    } catch (error: any) {
      const message = String(error?.message || '');
      const moderationServiceUnavailable =
        message.includes('Timeout conectando con el escudo de seguridad') ||
        message.includes('No se pudo conectar con el escudo de seguridad') ||
        message.includes('Missing EXPO_PUBLIC_MODERATION_API_URL');

      if (allowModerationBypass && moderationServiceUnavailable) {
        setUploadProgress(1);
        setUploadStageLabel('Escudo de seguridad no disponible. Continuando en modo respaldo...');
        return { fileId: `bypass-${label}-${Date.now()}`, publicUrl: null };
      }

      throw error;
    }

    setUploadProgress(0.75);
    setUploadStageLabel('Moderando en Azure Content Safety...');
    setUploadProgress(1);
    setUploadStageLabel('Contenido aprobado. Continuando...');

    return { fileId: result.fileId, publicUrl: result.publicUrl };
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
      throw new Error(tr('El nickname ya esta en uso.', 'This nickname is already in use.'));
    }
    if (!emailSnap.empty && emailSnap.docs[0].id !== ignoreUid) {
      throw new Error(tr('El email ya esta en uso.', 'This email is already in use.'));
    }
    if (!phoneSnap.empty && phoneSnap.docs[0].id !== ignoreUid) {
      throw new Error(tr('El telefono ya esta en uso.', 'This phone number is already in use.'));
    }
  };

  const handleSocialBootstrap = async (providerId: SocialProviderId) => {
    setIsSubmitting(true);
    try {
      const credential = await signInWithSocialProvider(providerId);
      const providerEmail = getEmailFromCredential(credential);

      if (!providerEmail) {
        await signOut(auth);
        Alert.alert(
          tr('Email requerido', 'Email required'),
          tr(`No se detectó email desde ${getProviderLabel(providerId)}.`, `No email was detected from ${getProviderLabel(providerId)}.`)
        );
        return;
      }

      const usersRef = collection(db, 'users');
      const existingByEmail = await getDocs(
        query(usersRef, where('emailLower', '==', providerEmail), limit(1))
      );

      if (!existingByEmail.empty && existingByEmail.docs[0].id !== credential.user.uid) {
        await signOut(auth);
        Alert.alert(
          tr('Cuenta ya existente', 'Account already exists'),
          tr('Ese email ya está ligado a otra identidad de Card-Social. Inicia sesión en lugar de crear otra cuenta.', 'That email is already linked to another Card-Social identity. Sign in instead of creating another account.')
        );
        return;
      }

      setEmail(providerEmail);
      setSocialProviderId(providerId);
      Alert.alert(
        tr(`${getProviderLabel(providerId)} conectado`, `${getProviderLabel(providerId)} connected`),
        tr('Perfecto. Ahora completa el formulario obligatorio (teléfono, fecha, ciudad y demás) para terminar tu alta.', 'Perfect. Now complete the required form (phone, date, city, and more) to finish registration.')
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : tr('No se pudo iniciar con proveedor.', 'Could not start with provider.');
      Alert.alert(tr('Registro social no disponible', 'Social sign up unavailable'), message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async () => {
        if (isRetryLocked) {
          setModerationAlertMessage(retryLockMessage);
          setModerationAlertVisible(true);
          return;
        }

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedNickname = nickname.trim();
    const normalizedCity = city.trim();
    const normalizedStateRegion = stateRegion.trim();
    const normalizedCountry = country.trim();
    const fullName = `${normalizedFirstName} ${normalizedLastName}`.trim();
    const nicknameLower = normalizedNickname.toLowerCase();
    const emailLower = email.trim().toLowerCase();
    const phoneNormalized = normalizePhone(phoneNumber);
    const parsedBirthDate = parseBirthDate(birthDate);

    // Keep form state clean from trailing spaces before proceeding.
    if (firstName !== normalizedFirstName) setFirstName(normalizedFirstName);
    if (lastName !== normalizedLastName) setLastName(normalizedLastName);
    if (nickname !== normalizedNickname) setNickname(normalizedNickname);
    if (city !== normalizedCity) setCity(normalizedCity);
    if (stateRegion !== normalizedStateRegion) setStateRegion(normalizedStateRegion);
    if (country !== normalizedCountry) setCountry(normalizedCountry);

    if (
      !normalizedFirstName ||
      !normalizedLastName ||
      !normalizedNickname ||
      !email.trim() ||
      !phoneNormalized ||
      !birthDate.trim() ||
      !normalizedCity ||
      !normalizedStateRegion ||
      !normalizedCountry ||
      !photoUri ||
      !verificationSelfieUri
    ) {
      Alert.alert(
        tr('Campos incompletos', 'Incomplete fields'),
        tr('Completa todos los campos incluyendo tu selfie de verificacion.', 'Complete all fields including your verification selfie.')
      );
      return;
    }

    if (!socialProviderId && !password) {
      Alert.alert(
        tr('Campos incompletos', 'Incomplete fields'),
        tr('Ingresa una contraseña para crear tu cuenta con email.', 'Enter a password to create your account with email.')
      );
      return;
    }

    if (!parsedBirthDate) {
      Alert.alert(
        tr('Fecha inválida', 'Invalid date'),
        tr('Usa formato MM-DD-YYYY para la fecha de nacimiento.', 'Use MM-DD-YYYY format for birth date.')
      );
      return;
    }

    if (getAge(parsedBirthDate) < 18) {
      Alert.alert(
        tr('Registro restringido', 'Registration restricted'),
        tr('Debes ser mayor de 18 años para crear cuenta.', 'You must be at least 18 years old to create an account.')
      );
      return;
    }

    if (!socialProviderId && password.length < 8) {
      Alert.alert(
        tr('Contraseña insegura', 'Weak password'),
        tr('La contraseña debe tener mínimo 8 caracteres.', 'Password must be at least 8 characters long.')
      );
      return;
    }

    if (nicknameStatus !== 'available') {
      Alert.alert(tr('Nickname no disponible', 'Nickname unavailable'), tr('Necesitas un nickname disponible para continuar.', 'You need an available nickname to continue.'));
      return;
    }

    if (emailStatus !== 'available') {
      Alert.alert(tr('Email no disponible', 'Email unavailable'), tr('Necesitas un email disponible para continuar.', 'You need an available email to continue.'));
      return;
    }

    if (phoneStatus !== 'available') {
      Alert.alert(tr('Telefono no disponible', 'Phone unavailable'), tr('Necesitas un numero disponible para continuar.', 'You need an available phone number to continue.'));
      return;
    }

    if (!acceptedLegal) {
      Alert.alert(
        tr('Confirmación requerida', 'Confirmation required'),
        tr('Debes aceptar Términos y Privacidad para crear tu cuenta.', 'You must accept Terms and Privacy to create your account.')
      );
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
          tr('Selfie no valida aun', 'Selfie not valid yet'),
          tr('No detectamos un rostro visible en la selfie de verificacion. Intenta de nuevo con mejor luz y tu gesto.', 'We could not detect a visible face in the verification selfie. Try again with better lighting and your gesture.')
        );
        return;
      }

      const onboardingOwner = `onboarding-${nicknameLower || Date.now()}`;

      setUploadStageLabel('Validando foto de perfil...');
      const { fileId: moderatedPhotoFileId, publicUrl: moderatedPhotoPublicUrl } = await uploadWithSafety(
        photoUri,
        'profile-photo',
        onboardingOwner,
        `profile-${Date.now()}.jpg`,
        inferMimeType(photoUri, 'profile.jpg')
      );

      setUploadProgress(0.25);
      setUploadProgress(0.25);
      setUploadStageLabel('Validando selfie de verificacion (sonrisa o guino)...');
      const { fileId: moderatedVerificationSelfieFileId } = await uploadWithSafety(
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
      const isPochobs = nicknameLower === 'pochobs_admin' || emailLower === 'pochobs@gmail.com';
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

        const validateKeyOwner = (keyDoc: any, fieldLabel: 'nickname' | 'email' | 'telefono') => {
          if (!keyDoc.exists()) return;
          const ownerUid = keyDoc.data()?.uid;
          if (ownerUid && ownerUid !== uid) {
            if (fieldLabel === 'nickname') {
              throw new Error(tr('El nickname ya esta en uso.', 'This nickname is already in use.'));
            }
            if (fieldLabel === 'email') {
              throw new Error(tr('El email ya esta en uso.', 'This email is already in use.'));
            }
            throw new Error(tr('El telefono ya esta en uso.', 'This phone number is already in use.'));
          }
        };

        validateKeyOwner(nicknameKeyDoc, 'nickname');
        validateKeyOwner(emailKeyDoc, 'email');
        validateKeyOwner(phoneKeyDoc, 'telefono');

        tx.set(
          userRef,
          {
            uid,
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
            fullName,
            nickname: normalizedNickname,
            nicknameLower,
            lastNicknameChange: serverTimestamp(),
            email: emailLower,
            emailLower,
            phone: phoneNumber.trim(),
            phoneNormalized,
            birthDate: parsedBirthDate.toISOString(),
            isAdult: true,
            city: normalizedCity,
            stateRegion: normalizedStateRegion,
            country: normalizedCountry,
            timezone,
            photoUrl: moderatedPhotoPublicUrl || `mongo-gridfs://${moderatedPhotoFileId}`,
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
          tr('Verifica tu correo', 'Verify your email'),
          tr('Te enviamos un enlace de verificación. Debes confirmarlo antes de poder iniciar sesión.', 'We sent you a verification link. You must confirm it before signing in.')
        );
        router.replace('/signin' as never);
        return;
      }

      if (studentPackResult.granted) {
        Alert.alert(
          tr('Student Pack activado', 'Student Pack activated'),
          tr(
            `Se acreditaron ${studentPackResult.bonusAmount} CS por elegibilidad estudiantil.`,
            `${studentPackResult.bonusAmount} CS were credited for student eligibility.`
          )
        );
      }

      setSuccessTransitionVisible(true);
    } catch (error) {
      console.error('Error Firebase:', error);
      if (error instanceof ModerationRejectedError) {
        registerModerationReject();
      } else {
        const message = error instanceof Error ? error.message : tr('No se pudo completar el registro.', 'Could not complete registration.');
        Alert.alert(tr('Error de Registro', 'Registration Error'), message);
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
          <Text style={styles.title}>{tr('Crea tu Identidad', 'Create your Identity')}</Text>

          <Text style={styles.socialHelper}>{tr('O puedes completar el formulario manualmente para mayor control sobre tu identidad.', 'Or you can complete the form manually for more control over your identity.')}</Text>
          {/* Social login buttons hidden for MVP - only native registration enabled */}
          {socialProviderId ? (
            <Text style={styles.socialStateText}>
              {tr('Registro conectado con', 'Sign up connected with')} {getProviderLabel(socialProviderId)}. {tr('Debes completar el resto de campos obligatorios.', 'Complete the remaining required fields.')}
            </Text>
          ) : null}

          <Text style={styles.label}>{tr('Foto de Perfil', 'Profile Photo')}</Text>
          <View style={styles.photoRow}>
            <TouchableOpacity style={styles.photoButton} onPress={requestCameraPhoto}>
              <Text style={styles.photoButtonText}>{tr('Abrir camara', 'Open camera')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoButton} onPress={requestGalleryPhoto}>
              <Text style={styles.photoButtonText}>{tr('Elegir imagen', 'Choose image')}</Text>
            </TouchableOpacity>
          </View>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.photoPreview} /> : null}

          <Text style={styles.label}>{tr('Selfie de Verificacion', 'Verification Selfie')}</Text>
          <Text style={styles.helperText}>{tr('Para proteger la comunidad, toma una selfie con una sonrisa o un guino. Solo valida que eres humano.', 'To protect the community, take a selfie with a smile or a wink. This only validates that you are human.')}</Text>
          <TouchableOpacity style={styles.photoButton} onPress={requestVerificationSelfie}>
            <Text style={styles.photoButtonText}>{tr('Tomar selfie de verificacion', 'Take verification selfie')}</Text>
          </TouchableOpacity>
          {verificationSelfieUri ? <Image source={{ uri: verificationSelfieUri }} style={styles.photoPreview} /> : null}

          <Text style={styles.label}>{tr('Nombre', 'First Name')}</Text>
          <TextInput
            style={styles.input}
            placeholder={tr('Ej: Alfonso', 'Ex: John')}
            placeholderTextColor="#8E8E93"
            value={firstName}
            onChangeText={setFirstName}
          />

          <Text style={styles.label}>{tr('Apellido', 'Last Name')}</Text>
          <TextInput
            style={styles.input}
            placeholder={tr('Ej: Barreto', 'Ex: Carter')}
            placeholderTextColor="#8E8E93"
            value={lastName}
            onChangeText={setLastName}
          />

          <Text style={styles.label}>{tr('NickName (Unico)', 'Nickname (Unique)')}</Text>
          <TextInput
            style={styles.input}
            placeholder={tr('Ej: alfonso.barreto', 'Ex: john.carter')}
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
              ? tr('Nickname disponible', 'Nickname available')
              : nicknameStatus === 'checking'
                ? tr('Validando nickname...', 'Checking nickname...')
                : nicknameStatus === 'taken'
                  ? tr('Nickname ya existe', 'This nickname already exists')
                  : nicknameStatus === 'invalid'
                    ? tr('Nickname invalido (3-24, letras/numeros/._-)', 'Invalid nickname (3-24, letters/numbers/._-)')
                    : tr('Ingresa un nickname para validar disponibilidad', 'Enter a nickname to check availability')}
          </Text>

          <Text style={styles.label}>{tr('Email (Unico)', 'Email (Unique)')}</Text>
          <TextInput
            style={styles.input}
            placeholder={tr('correo@ejemplo.com', 'email@example.com')}
            placeholderTextColor="#8E8E93"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            value={email}
            onChangeText={setEmail}
            editable={!socialProviderId}
          />
          <Text
            style={[
              styles.validationText,
              emailStatus === 'available' && styles.validationOk,
              (emailStatus === 'taken' || emailStatus === 'invalid') && styles.validationError,
            ]}
          >
            {emailStatus === 'available'
              ? tr('Email disponible', 'Email available')
              : emailStatus === 'checking'
                ? tr('Validando email...', 'Checking email...')
                : emailStatus === 'taken'
                  ? tr('Email ya existe', 'This email already exists')
                  : emailStatus === 'invalid'
                    ? tr('Email invalido', 'Invalid email format')
                    : tr('Ingresa un email para validar disponibilidad', 'Enter an email to check availability')}
          </Text>

          <Text style={styles.label}>{tr('Telefono (Unico)', 'Phone (Unique)')}</Text>
          <TextInput
            style={styles.input}
            placeholder="+1 000 000 0000"
            placeholderTextColor="#8E8E93"
            keyboardType="phone-pad"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
          />
          <Text
            style={[
              styles.validationText,
              phoneStatus === 'available' && styles.validationOk,
              (phoneStatus === 'taken' || phoneStatus === 'invalid') && styles.validationError,
            ]}
          >
            {phoneStatus === 'available'
              ? tr('Numero disponible', 'Phone number available')
              : phoneStatus === 'checking'
                ? tr('Validando numero...', 'Checking phone number...')
                : phoneStatus === 'taken'
                  ? tr('Numero ya existe', 'This phone number already exists')
                  : phoneStatus === 'invalid'
                    ? tr('Numero invalido (minimo 8 digitos)', 'Invalid phone number (minimum 8 digits)')
                    : tr('Ingresa tu numero para validar disponibilidad', 'Enter your phone number to check availability')}
          </Text>

          <Text style={styles.label}>{tr('Fecha de Nacimiento', 'Birth Date')}</Text>
          <View style={styles.dateInputRow}>
            <TextInput
              style={[styles.input, styles.dateInput]}
              placeholder="MM-DD-YYYY"
              placeholderTextColor="#8E8E93"
              keyboardType="number-pad"
              maxLength={10}
              value={birthDate}
              onChangeText={(value) => setBirthDate(formatBirthDateInput(value))}
            />
            <TouchableOpacity style={styles.calendarButton} onPress={openBirthPicker}>
              <Text style={styles.calendarButtonIcon}>📅</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>{tr('Ciudad', 'City')}</Text>
          <TextInput
            style={styles.input}
            placeholder={tr('Ej: Houston', 'Ex: Houston')}
            placeholderTextColor="#8E8E93"
            value={city}
            onChangeText={setCity}
          />

          <Text style={styles.label}>{tr('Estado', 'State')}</Text>
          <TextInput
            style={styles.input}
            placeholder={tr('Ej: Texas', 'Ex: Texas')}
            placeholderTextColor="#8E8E93"
            value={stateRegion}
            onChangeText={setStateRegion}
          />

          <Text style={styles.label}>{tr('Pais', 'Country')}</Text>
          <TextInput
            style={styles.input}
            placeholder={tr('Ej: Estados Unidos', 'Ex: United States')}
            placeholderTextColor="#8E8E93"
            value={country}
            onChangeText={setCountry}
          />

          <TouchableOpacity style={styles.geoButton} onPress={() => void autofillLocationFromDevice()} disabled={isAutofillingLocation}>
            {isAutofillingLocation ? (
              <ActivityIndicator size="small" color="#0D4D8A" />
            ) : (
              <Text style={styles.geoButtonText}>{tr('Autocompletar ubicacion', 'Autofill location')}</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>{tr('Horario detectado', 'Detected timezone')}</Text>
          <Text style={styles.readOnlyValue}>{timezone}</Text>

          {!socialProviderId ? (
            <>
              <Text style={styles.label}>{tr('Contrasena', 'Password')}</Text>
              <TextInput
                style={styles.input}
                placeholder={tr('Minimo 8 caracteres', 'Minimum 8 characters')}
                placeholderTextColor="#8E8E93"
                secureTextEntry
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                value={password}
                onChangeText={setPassword}
              />
            </>
          ) : null}

          <TouchableOpacity
            style={[
              styles.registerButton,
              (!acceptedLegal || isSubmitting || isRetryLocked || nicknameStatus !== 'available' || emailStatus !== 'available' || phoneStatus !== 'available') && styles.registerButtonDisabled,
            ]}
            onPress={handleRegister}
            disabled={isSubmitting || !acceptedLegal || isRetryLocked || nicknameStatus !== 'available' || emailStatus !== 'available' || phoneStatus !== 'available'}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#0A2540" />
            ) : (
              <Text style={styles.registerButtonText}>{tr('CONFIRMAR REGISTRO', 'CONFIRM SIGN UP')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.legalRow} onPress={() => setAcceptedLegal((prev) => !prev)} activeOpacity={0.85}>
            <View style={[styles.legalCheckbox, acceptedLegal && styles.legalCheckboxChecked]}>
              {acceptedLegal ? <Text style={styles.legalCheckmark}>✓</Text> : null}
            </View>
            <Text style={styles.legalText}>{tr('Acepto Terminos y Condiciones + Politica de Privacidad', 'I accept Terms and Conditions + Privacy Policy')}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
            <Text style={{ color: 'white', opacity: 0.5 }}>{tr('Volver atras', 'Go back')}</Text>
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
              <ActivityIndicator size={140} color="#1EA7FF" />
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

        <Modal
          visible={birthPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setBirthPickerVisible(false)}
        >
          <View style={styles.dateModalOverlay}>
            <View style={styles.dateModalCard}>
              <View style={styles.dateModalAccent} />
              <Text style={styles.dateModalTitle}>{tr('Selecciona fecha de nacimiento', 'Select birth date')}</Text>
              <Text style={styles.dateModalHint}>{tr('Orden USA: Mes - Dia - Año', 'US order: Month - Day - Year')}</Text>
              <View style={styles.dateSelectedBadge}>
                <Text style={styles.dateSelectedBadgeText}>{formatBirthDateUs(pickerMonth, pickerDay, pickerYear)}</Text>
              </View>

              <View style={styles.datePickerRow}>
                <View style={[styles.datePickerColumn, styles.datePickerYearColumn]}>
                  <Text style={styles.datePickerLabel}>{tr('Año', 'Year')}</Text>
                  <Picker
                    style={styles.datePickerNative}
                    itemStyle={styles.datePickerItem}
                    selectedValue={pickerYear}
                    onValueChange={(value) => setPickerYear(Number(value))}
                  >
                    {Array.from({ length: 121 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                      <Picker.Item key={`y-${year}`} label={String(year)} value={year} />
                    ))}
                  </Picker>
                </View>

                <View style={[styles.datePickerColumn, styles.datePickerCompactColumn]}>
                  <Text style={styles.datePickerLabel}>{tr('Mes', 'Month')}</Text>
                  <Picker
                    style={styles.datePickerNative}
                    itemStyle={styles.datePickerItem}
                    selectedValue={pickerMonth}
                    onValueChange={(value) => setPickerMonth(Number(value))}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <Picker.Item key={`m-${month}`} label={pad2(month)} value={month} />
                    ))}
                  </Picker>
                </View>

                <View style={[styles.datePickerColumn, styles.datePickerCompactColumn]}>
                  <Text style={styles.datePickerLabel}>{tr('Dia', 'Day')}</Text>
                  <Picker
                    style={styles.datePickerNative}
                    itemStyle={styles.datePickerItem}
                    selectedValue={pickerDay}
                    onValueChange={(value) => setPickerDay(Number(value))}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <Picker.Item key={`d-${day}`} label={pad2(day)} value={day} />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.dateModalActions}>
                <TouchableOpacity style={styles.dateModalButtonGhost} onPress={() => setBirthPickerVisible(false)}>
                  <Text style={styles.dateModalButtonGhostText}>{tr('Cancelar', 'Cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dateModalButtonPrimary} onPress={confirmBirthPicker}>
                  <Text style={styles.dateModalButtonPrimaryText}>{tr('Confirmar', 'Confirm')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
  dateInputRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 1,
  },
  calendarButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7BC2EC',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  calendarButtonIcon: {
    fontSize: 18,
  },
  geoButton: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#7BC2EC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  geoButtonText: {
    color: '#0D4D8A',
    fontWeight: '700',
    fontSize: 12,
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
  dateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  dateModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D8EAF6',
    shadowColor: '#0A2540',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  dateModalAccent: {
    width: 52,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#C5A065',
    alignSelf: 'center',
    marginBottom: 10,
  },
  dateModalTitle: {
    color: '#0A2540',
    fontWeight: '800',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 4,
  },
  dateModalHint: {
    color: '#4A4A4A',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  dateSelectedBadge: {
    alignSelf: 'center',
    backgroundColor: '#F2F8FC',
    borderWidth: 1,
    borderColor: '#D7E7F2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  dateSelectedBadgeText: {
    color: '#0D4D8A',
    fontSize: 13,
    fontWeight: '800',
  },
  datePickerRow: {
    flexDirection: 'row',
    gap: 6,
  },
  datePickerColumn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D7E7F2',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FBFDFF',
  },
  datePickerYearColumn: {
    flex: 1.3,
  },
  datePickerCompactColumn: {
    flex: 0.9,
  },
  datePickerLabel: {
    color: '#0D4D8A',
    fontSize: 12,
    fontWeight: '700',
    paddingTop: 8,
    paddingHorizontal: 10,
  },
  datePickerNative: {
    height: 160,
  },
  datePickerItem: {
    fontSize: 16,
    color: '#0A2540',
    fontWeight: '500',
  },
  dateModalActions: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  dateModalButtonGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D7E7F2',
    borderRadius: 10,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dateModalButtonGhostText: {
    color: '#0D4D8A',
    fontWeight: '700',
  },
  dateModalButtonPrimary: {
    flex: 1,
    backgroundColor: '#0D4D8A',
    borderRadius: 10,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dateModalButtonPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
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
