import ActivityIndicator from '@/components/BrandedSpinner';
import { AuthSpinnerWell } from '@/components/AuthSpinnerWell';
import CountryDialPickerModal from '@/components/CountryDialPickerModal';
import { registerFormLook } from '@/constants/authPremiumLook';
import { LEGAL_CONSENT_BUNDLE_VERSION } from '@/constants/legalConsent';
import { FREE_TIER_POLICY } from '@/constants/freeTierPolicy';
import {
  buildE164,
  getNationalDigitBounds,
  sanitizeNationalDigits,
} from '@/constants/countryDialCodes';
import { requestVerificationEmailViaBackend } from '@/services/requestVerificationEmail';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { saveCachedCredentials } from '@/services/credentialVault';
import { createDefaultCards, createDefaultVaultData, initializeUserCredits } from '@/services/creditsService';
import { useLanguageOptional } from '@/services/language';
import { useAuthT, type AuthLocaleKey } from '@/services/authI18n';
import { useLookMode } from '@/services/lookMode';
import { ModerationRejectedError, uploadFileWithModeration } from '@/services/moderationApi';
import { getEmailFromCredential, getProviderLabel, signInWithSocialProvider, SocialProviderId } from '@/services/socialAuth';
import { grantStudentPackCreditsIfEligible } from '@/services/studentPackService';
import { upsertSuccessfulReferralAttribution } from '@/services/referralsFirestoreService';
import { fetchSignupFieldAvailability } from '@/services/studioAuthPublicApi';
import { firestoreFirstUserDocByNickLower, firestoreUserAvatarUrlWrite } from '@/services/userIdentityFields';
import { clearLocalCachesForSignOut } from '@/services/userScopedStorage';
import { setPresidentialSecurityEnabled } from '@/services/biometricAuth';
import { Picker } from '@react-native-picker/picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, getDocs, limit, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Image,
    InteractionManager,
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
import { auth, db } from '../services/firebaseConfig';
import CircularPhotoCropper from './components/CircularPhotoCropper';
import LegalSignupReviewModal from './components/LegalSignupReviewModal';
import LuxuryModerationModal from './components/LuxuryModerationModal';
import PremiumSuccessTransition from './components/PremiumSuccessTransition';

// ─── Photo optimization helpers (porta misma lógica que NewInfoForm/Vault) ────
const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB

const REGISTER_FIELD_ERROR_BORDER = '#E53935';
const REGISTER_FIELD_ERROR_TEXT = '#E53935';

type AvailabilityUiStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error_network';

type RegisterFieldKey =
  | 'firstName'
  | 'lastName'
  | 'nickname'
  | 'email'
  | 'phone'
  | 'password'
  | 'birthDate'
  | 'city'
  | 'stateRegion'
  | 'country'
  | 'photo'
  | 'legal';

async function getFileSizeForPhoto(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true } as any);
    if ((info as any)?.size) return Number((info as any).size);
  } catch { /* fallback to fetch */ }
  const blob = await fetch(uri).then((r) => r.blob());
  return blob.size;
}

async function optimizePhotoForUpload(uri: string): Promise<string> {
  const initialSize = await getFileSizeForPhoto(uri);
  if (initialSize <= MAX_PROFILE_PHOTO_BYTES) return uri;

  const attempts = [
    { width: 1920, compress: 0.72 },
    { width: 1440, compress: 0.62 },
    { width: 1080, compress: 0.52 },
    { width: 840, compress: 0.45 },
    { width: 640, compress: 0.38 },
  ];

  let bestUri = uri;
  for (const attempt of attempts) {
    const result = await ImageManipulator.manipulateAsync(
      bestUri,
      [{ resize: { width: attempt.width } }],
      { compress: attempt.compress, format: ImageManipulator.SaveFormat.JPEG }
    );
    const newSize = await getFileSizeForPhoto(result.uri);
    bestUri = result.uri;
    if (newSize <= MAX_PROFILE_PHOTO_BYTES) return bestUri;
  }

  // Modo emergencia: 480px calidad 0.2
  const emergency = await ImageManipulator.manipulateAsync(
    bestUri,
    [{ resize: { width: 480 } }],
    { compress: 0.2, format: ImageManipulator.SaveFormat.JPEG }
  );
  return emergency.uri;
}
// ─────────────────────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const langCtx = useLanguageOptional();
  const language = langCtx?.language ?? 'en';
  const t = useAuthT();
  const modalFooterBottomPad = useModalFooterBottomPad();
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const look = useMemo(() => registerFormLook(isNight), [isNight]);
  const legalModalPalette = useMemo(
    () => ({
      modalBg: isNight ? '#161618' : 'rgba(255,255,255,0.99)',
      overlay: 'rgba(0,0,0,0.55)',
      titleColor: look.label,
      bodyMuted: look.validationMuted,
      bodyText: look.legalText,
      chipBg: look.legalCheckboxBg,
      chipBgActive: look.legalCheckedBg,
      chipBorder: look.legalBorder,
      chipText: look.helper,
      chipTextActive: look.registerBtnText,
      primaryBtnBg: look.registerBtnBg,
      primaryBtnText: look.registerBtnText,
      secondaryText: look.helper,
      confirmRowBg: look.readOnlyBg,
      confirmBorder: look.legalBorder,
    }),
    [isNight, look],
  );
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [phoneDialCode, setPhoneDialCode] = useState('+1');
  const [phoneNational, setPhoneNational] = useState('');
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const phoneNumber = useMemo(() => buildE164(phoneDialCode, phoneNational), [phoneDialCode, phoneNational]);
  const [birthDate, setBirthDate] = useState('');
  const [city, setCity] = useState('');
  const [stateRegion, setStateRegion] = useState('');
  const [country, setCountry] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  /** Android: confirmar foto de perfil en modal antes de aplicar. */
  const [androidPhotoPending, setAndroidPhotoPending] = useState<null | { kind: 'profile'; uri: string }>(null);
  const [photoUri, setPhotoUri] = useState('');
  const [cropperVisible, setCropperVisible] = useState(false);
  const [rawPhotoUri, setRawPhotoUri] = useState('');
  const [rawPhotoWidth, setRawPhotoWidth] = useState(1080);
  const [rawPhotoHeight, setRawPhotoHeight] = useState(1080);
  const cropperRetryFnRef = React.useRef<() => void>(() => {});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStageKey, setUploadStageKey] = useState<AuthLocaleKey>('register_upload_starting');
  const [moderationAlertVisible, setModerationAlertVisible] = useState(false);
  const [moderationAlertMessage, setModerationAlertMessage] = useState('');
  const [rejectionAttempts, setRejectionAttempts] = useState(0);
  const [retryLockedUntil, setRetryLockedUntil] = useState<number | null>(null);
  const [retryCountdownSec, setRetryCountdownSec] = useState(0);
  const [successTransitionVisible, setSuccessTransitionVisible] = useState(false);
  const [socialProviderId, setSocialProviderId] = useState<SocialProviderId | null>(null);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [legalReviewOpen, setLegalReviewOpen] = useState(false);
  const [presidentialSecurity, setPresidentialSecurity] = useState(false);
  const [nicknameStatus, setNicknameStatus] = useState<AvailabilityUiStatus>('idle');
  const [emailStatus, setEmailStatus] = useState<AvailabilityUiStatus>('idle');
  const [phoneStatus, setPhoneStatus] = useState<AvailabilityUiStatus>('idle');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegisterFieldKey, string>>>({});
  const scrollViewRef = useRef<React.ComponentRef<typeof KeyboardAwareScrollView>>(null);
  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);
  const nicknameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneNationalRef = useRef<TextInput>(null);
  const birthDateRef = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const stateRegionRef = useRef<TextInput>(null);
  const countryRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const clearFieldError = (key: RegisterFieldKey) => {
    setFieldErrors((prev) => {
      if (prev[key] == null) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const focusFirstRegisterError = (next: Partial<Record<RegisterFieldKey, string>>) => {
    const order: RegisterFieldKey[] = [
      'firstName',
      'lastName',
      'nickname',
      'email',
      'phone',
      'birthDate',
      'password',
      'city',
      'stateRegion',
      'country',
      'photo',
      'legal',
    ];
    for (const k of order) {
      if (!next[k]) continue;
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          switch (k) {
            case 'firstName':
              firstNameRef.current?.focus();
              break;
            case 'lastName':
              lastNameRef.current?.focus();
              break;
            case 'nickname':
              nicknameRef.current?.focus();
              break;
            case 'email':
              emailRef.current?.focus();
              break;
            case 'phone':
              phoneNationalRef.current?.focus();
              break;
            case 'birthDate':
              birthDateRef.current?.focus();
              break;
            case 'password':
              passwordRef.current?.focus();
              break;
            case 'city':
              cityRef.current?.focus();
              break;
            case 'stateRegion':
              stateRegionRef.current?.focus();
              break;
            case 'country':
              countryRef.current?.focus();
              break;
            case 'photo':
              scrollViewRef.current?.scrollTo({ y: 0, animated: true });
              Keyboard.dismiss();
              break;
            case 'legal':
              scrollViewRef.current?.scrollToEnd({ animated: true });
              Keyboard.dismiss();
              break;
            default:
              break;
          }
        });
      });
      break;
    }
  };

  const [birthPickerVisible, setBirthPickerVisible] = useState(false);
  const [pickerYear, setPickerYear] = useState(2000);
  const [pickerMonth, setPickerMonth] = useState(1);
  const [pickerDay, setPickerDay] = useState(1);
  const [isAutofillingLocation, setIsAutofillingLocation] = useState(false);
  const router = useRouter();
  const signupParams = useLocalSearchParams<{ invite?: string | string[] }>();
  const inviteReferrerUid = useMemo(() => {
    const raw = signupParams.invite;
    const single = Array.isArray(raw) ? raw[0] : raw;
    return String(single || '').trim();
  }, [signupParams.invite]);
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const retryLockMessage = t('register_retry_lock_message');

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
      Alert.alert(t('register_alert_invalid_date_title'), t('register_alert_invalid_date_select'));
      return;
    }

    setBirthDate(formatBirthDateUs(pickerMonth, pickerDay, pickerYear));
    setBirthPickerVisible(false);
    clearFieldError('birthDate');
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

  const canPressRegister = useMemo(() => {
    if (isRetryLocked) return false;
    const phoneBounds = getNationalDigitBounds(phoneDialCode);
    const national = sanitizeNationalDigits(phoneNational);
    const phoneLenOk = national.length >= phoneBounds.min && national.length <= phoneBounds.max;
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      nickname.trim().length > 0 &&
      email.trim().length > 0 &&
      phoneLenOk &&
      birthDate.trim().length > 0 &&
      city.trim().length > 0 &&
      stateRegion.trim().length > 0 &&
      country.trim().length > 0 &&
      (socialProviderId != null || password.trim().length > 0)
    );
  }, [
    isRetryLocked,
    firstName,
    lastName,
    nickname,
    email,
    phoneDialCode,
    phoneNational,
    birthDate,
    city,
    stateRegion,
    country,
    socialProviderId,
    password,
  ]);

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
          const map = await fetchSignupFieldAvailability({
            nickname: nicknameTrimmed,
            ignoreUid: auth.currentUser?.uid,
          });
          if (!map?.nickname) {
            setNicknameStatus('error_network');
            return;
          }
          setNicknameStatus(map.nickname === 'taken' ? 'taken' : 'available');
        } catch {
          setNicknameStatus('error_network');
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
          const map = await fetchSignupFieldAvailability({
            emailLower,
            ignoreUid: auth.currentUser?.uid,
          });
          if (!map?.email) {
            setEmailStatus('error_network');
            return;
          }
          setEmailStatus(map.email === 'taken' ? 'taken' : 'available');
        } catch {
          setEmailStatus('error_network');
        }
      })();
    }, 450);

    return () => clearTimeout(timeout);
  }, [email]);

  useEffect(() => {
    const phoneNormalized = phoneNumber.replace(/[^\d+]/g, '');
    const national = sanitizeNationalDigits(phoneNational);
    const { min, max } = getNationalDigitBounds(phoneDialCode);

    if (!national) {
      setPhoneStatus('idle');
      return;
    }

    if (national.length < min || national.length > max) {
      setPhoneStatus('invalid');
      return;
    }

    setPhoneStatus('checking');
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const map = await fetchSignupFieldAvailability({
            phoneNormalized,
            ignoreUid: auth.currentUser?.uid,
          });
          if (!map?.phone) {
            setPhoneStatus('error_network');
            return;
          }
          setPhoneStatus(map.phone === 'taken' ? 'taken' : 'available');
        } catch {
          setPhoneStatus('error_network');
        }
      })();
    }, 450);

    return () => clearTimeout(timeout);
  }, [phoneNumber, phoneDialCode, phoneNational]);

  useEffect(() => {
    if (city.trim() || stateRegion.trim() || country.trim()) {
      return;
    }
    void autofillLocationFromDevice();
  }, []);

  const registerModerationReject = () => {
    const attempts = rejectionAttempts + 1;
    if (attempts >= 3) {
      setRetryLockedUntil(Date.now() + 2 * 60 * 1000);
      setRejectionAttempts(0);
      setModerationAlertMessage(retryLockMessage);
      setModerationAlertVisible(true);
      return;
    }

    setRejectionAttempts(attempts);
    setModerationAlertMessage(
      t('register_moderation_reject_message'),
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
        t('register_alert_permission_denied'),
        t('register_alert_gallery_needed')
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: Platform.OS !== 'android',
      ...(Platform.OS !== 'android' ? { aspect: [1, 1] as [number, number] } : {}),
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      const uri = result.assets[0].uri;
      if (Platform.OS === 'android') {
        setAndroidPhotoPending({ kind: 'profile', uri });
      } else {
        setPhotoUri(uri);
        clearFieldError('photo');
      }
    }
  };

  const requestCameraPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(
        t('register_alert_permission_denied'),
        t('register_alert_camera_needed')
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: Platform.OS !== 'android',
      ...(Platform.OS !== 'android' ? { aspect: [1, 1] as [number, number] } : {}),
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      const uri = result.assets[0].uri;
      if (Platform.OS === 'android') {
        setAndroidPhotoPending({ kind: 'profile', uri });
      } else {
        setPhotoUri(uri);
        clearFieldError('photo');
      }
    }
  };

  const cancelAndroidPhotoPending = () => {
    setAndroidPhotoPending(null);
  };

  const confirmAndroidPhotoPending = async () => {
    const pending = androidPhotoPending;
    if (!pending || pending.kind !== 'profile') return;
    setPhotoUri(pending.uri);
    cancelAndroidPhotoPending();
    clearFieldError('photo');
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
    uid: string,
    fileName: string,
    mimeType: string
  ) => {
    setUploadProgress(0.15);
    setUploadStageKey('register_upload_shield_sending');
    setUploadModalVisible(true);

    // Comprimir si es imagen y excede 2 MB (misma lógica que NewInfoForm/Vault)
    let activeUri = fileUri;
    if (mimeType.startsWith('image/')) {
      setUploadStageKey('register_upload_optimizing');
      activeUri = await optimizePhotoForUpload(fileUri);
    }

    const allowModerationBypass = process.env.EXPO_PUBLIC_ALLOW_PHOTO_MODERATION_BYPASS === '1';

    let result: { fileId: string; filename: string; publicUrl: string | null; mimeType: string | null };
    try {
      result = await uploadFileWithModeration({
        fileUri: activeUri,
        uid,
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
        setUploadStageKey('register_upload_shield_fallback');
        return { fileId: `bypass-${label}-${Date.now()}`, publicUrl: null, mimeType: null };
      }

      throw error;
    }

    setUploadProgress(0.75);
    setUploadStageKey('register_upload_moderating_azure');
    setUploadProgress(1);
    setUploadStageKey('register_upload_content_approved');

    return { fileId: result.fileId, publicUrl: result.publicUrl, mimeType: result.mimeType };
  };

  const checkUniqueness = async (
    normalizedNicknameForCheck: string,
    emailLower: string,
    phoneNormalized: string,
    ignoreUid?: string
  ) => {
    const fromApi = await fetchSignupFieldAvailability({
      nickname: normalizedNicknameForCheck,
      emailLower,
      phoneNormalized,
      ignoreUid,
    });
    if (
      fromApi?.nickname &&
      fromApi?.email &&
      fromApi?.phone
    ) {
      if (fromApi.nickname === 'taken') {
        throw new Error(t('register_err_nickname_in_use'));
      }
      if (fromApi.email === 'taken') {
        throw new Error(t('register_err_email_in_use'));
      }
      if (fromApi.phone === 'taken') {
        throw new Error(t('register_err_phone_in_use'));
      }
      return;
    }

    const usersRef = collection(db, 'users');
    const nicknameLower = normalizedNicknameForCheck.toLowerCase();
    const [nickDoc, emailSnap, phoneSnap] = await Promise.all([
      firestoreFirstUserDocByNickLower(db, nicknameLower),
      getDocs(query(usersRef, where('emailLower', '==', emailLower), limit(1))),
      getDocs(query(usersRef, where('phoneNormalized', '==', phoneNormalized), limit(1))),
    ]);

    if (nickDoc && nickDoc.id !== ignoreUid) {
      throw new Error(t('register_err_nickname_in_use'));
    }
    if (!emailSnap.empty && emailSnap.docs[0].id !== ignoreUid) {
      throw new Error(t('register_err_email_in_use'));
    }
    if (!phoneSnap.empty && phoneSnap.docs[0].id !== ignoreUid) {
      throw new Error(t('register_err_phone_in_use'));
    }
  };

  const handleSocialBootstrap = async (providerId: SocialProviderId) => {
    setIsSubmitting(true);
    try {
      const credential = await signInWithSocialProvider(providerId);
      const providerEmail = getEmailFromCredential(credential);

      if (!providerEmail) {
        await clearLocalCachesForSignOut(credential.user.uid);
        await signOut(auth);
        Alert.alert(
          t('register_alert_social_no_email_title'),
          t('register_alert_social_no_email_body', { provider: getProviderLabel(providerId) })
        );
        return;
      }

      const emailLowerProbe = providerEmail.trim().toLowerCase();
      const map = await fetchSignupFieldAvailability({
        emailLower: emailLowerProbe,
        ignoreUid: credential.user.uid,
      });

      let takenByOther = map?.email === 'taken';
      if (!takenByOther && map?.email == null) {
        try {
          const usersRef = collection(db, 'users');
          const existingByEmail = await getDocs(
            query(usersRef, where('emailLower', '==', emailLowerProbe), limit(1))
          );
          takenByOther =
            !existingByEmail.empty && existingByEmail.docs[0].id !== credential.user.uid;
        } catch {
          /* Firestore puede denegar; en producción el Studio API cubre la comprobación. */
        }
      }

      if (takenByOther) {
        await clearLocalCachesForSignOut(credential.user.uid);
        await signOut(auth);
        Alert.alert(
          t('register_alert_account_exists_title'),
          t('register_alert_account_exists_body')
        );
        return;
      }

      setEmail(providerEmail);
      setSocialProviderId(providerId);
      Alert.alert(
        t('register_alert_provider_connected_title', { provider: getProviderLabel(providerId) }),
        t('register_alert_provider_connected_body')
      );
    } catch (error) {
      Alert.alert(
        t('register_alert_social_signup_fail_title'),
        userFacingAlertMessage(
          error,
          language,
          t('register_alert_social_signup_fallback'),
        ),
      );
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
    const nicknameLower = normalizedNickname.toLowerCase();
    const emailLower = email.trim().toLowerCase();
    const phoneNationalClean = sanitizeNationalDigits(phoneNational);
    const phoneBounds = getNationalDigitBounds(phoneDialCode);
    const phoneComplete =
      phoneNationalClean.length >= phoneBounds.min && phoneNationalClean.length <= phoneBounds.max;
    const phoneNormalized = normalizePhone(phoneNumber);
    const parsedBirthDate = parseBirthDate(birthDate);

    if (firstName !== normalizedFirstName) setFirstName(normalizedFirstName);
    if (lastName !== normalizedLastName) setLastName(normalizedLastName);
    if (nickname !== normalizedNickname) setNickname(normalizedNickname);
    if (city !== normalizedCity) setCity(normalizedCity);
    if (stateRegion !== normalizedStateRegion) setStateRegion(normalizedStateRegion);
    if (country !== normalizedCountry) setCountry(normalizedCountry);

    const next: Partial<Record<RegisterFieldKey, string>> = {};

    if (!normalizedFirstName) next.firstName = t('register_field_error_required_first_name');
    if (!normalizedLastName) next.lastName = t('register_field_error_required_last_name');
    if (!normalizedNickname) {
      next.nickname = t('register_field_error_required_nickname');
    } else if (!/^[a-z0-9._-]{3,24}$/i.test(normalizedNickname)) {
      next.nickname = t('register_field_error_nickname_format');
    }

    if (!email.trim()) {
      next.email = t('register_field_error_required_email');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      next.email = t('register_field_error_email_format');
    }

    if (!phoneNationalClean) {
      next.phone = t('register_field_error_required_phone');
    } else if (!phoneComplete) {
      next.phone = t('register_field_error_phone_length', { min: phoneBounds.min, max: phoneBounds.max });
    }

    if (!birthDate.trim()) {
      next.birthDate = t('register_field_error_birth_required');
    } else if (!parsedBirthDate) {
      next.birthDate = t('register_field_error_birth_invalid');
    } else if (getAge(parsedBirthDate) < 18) {
      next.birthDate = t('register_field_error_age');
    }

    if (!socialProviderId) {
      if (!password) {
        next.password = t('register_field_error_password_required');
      } else if (password.length < 8) {
        next.password = t('register_field_error_password_short');
      }
    }

    if (!normalizedCity) next.city = t('register_field_error_city');
    if (!normalizedStateRegion) next.stateRegion = t('register_field_error_state');
    if (!normalizedCountry) next.country = t('register_field_error_country');
    if (!photoUri) next.photo = t('register_field_error_photo');
    if (!acceptedLegal) next.legal = t('register_field_error_legal');

    const nickFormatOk = /^[a-z0-9._-]{3,24}$/i.test(normalizedNickname);
    const emailFormatOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower);

    if (!next.nickname && !next.email && !next.phone && nickFormatOk && emailFormatOk && phoneComplete) {
      try {
        const map = await fetchSignupFieldAvailability({
          nickname: normalizedNickname,
          emailLower,
          phoneNormalized,
          ignoreUid: auth.currentUser?.uid,
        });
        if (!map) {
          next.nickname = t('register_validation_network_nickname');
          next.email = t('register_validation_network_email');
          next.phone = t('register_validation_network_phone');
        } else {
          if (map.nickname === 'taken') {
            next.nickname = t('register_field_error_nickname_taken');
          } else if (map.nickname !== 'available') {
            next.nickname = t('register_validation_network_nickname');
          }
          if (map.email === 'taken') {
            next.email = t('register_field_error_email_taken');
          } else if (map.email !== 'available') {
            next.email = t('register_validation_network_email');
          }
          if (map.phone === 'taken') {
            next.phone = t('register_field_error_phone_taken');
          } else if (map.phone !== 'available') {
            next.phone = t('register_validation_network_phone');
          }
        }
      } catch {
        if (!next.nickname) next.nickname = t('register_validation_network_nickname');
        if (!next.email) next.email = t('register_validation_network_email');
        if (!next.phone) next.phone = t('register_validation_network_phone');
      }
    }

    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      try {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {
        /* haptics opcional */
      }
      focusFirstRegisterError(next);
      return;
    }

    setFieldErrors({});
    const fullName = `${normalizedFirstName} ${normalizedLastName}`.trim();

    setIsSubmitting(true);
    setUploadModalVisible(false);
    setUploadProgress(0);
    setUploadStageKey('register_upload_starting');
    try {
      await checkUniqueness(normalizedNickname, emailLower, phoneNormalized, auth.currentUser?.uid);

      const onboardingOwner = `onboarding-${nicknameLower || Date.now()}`;

      setUploadStageKey('register_upload_validating_photo');
      const { fileId: moderatedPhotoFileId, publicUrl: moderatedPhotoPublicUrl } = await uploadWithSafety(
        photoUri,
        'profile-photo',
        onboardingOwner,
        `profile-${Date.now()}.jpg`,
        inferMimeType(photoUri, 'profile.jpg')
      );

      setUploadProgress(0.25);

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
          const keyHolderUid = keyDoc.data()?.uid;
          if (keyHolderUid && keyHolderUid !== uid) {
            if (fieldLabel === 'nickname') {
              throw new Error(t('register_err_nickname_in_use'));
            }
            if (fieldLabel === 'email') {
              throw new Error(t('register_err_email_in_use'));
            }
            throw new Error(t('register_err_phone_in_use'));
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
            userFullName: fullName,
            userNickName: normalizedNickname,
            userNickNameLower: nicknameLower,
            fullName,
            nickname: normalizedNickname,
            nicknameLower,
            lastNicknameChange: serverTimestamp(),
            email: emailLower,
            emailLower,
            phone: phoneNumber.trim(),
            phoneNormalized,
            birthDate: parsedBirthDate!.toISOString(),
            isAdult: true,
            city: normalizedCity,
            stateRegion: normalizedStateRegion,
            country: normalizedCountry,
            language,
            appLanguage: language,
            timezone,
            ...firestoreUserAvatarUrlWrite(moderatedPhotoPublicUrl?.trim() || null),
            profilePhotoFileId: moderatedPhotoFileId,
            verificationSelfieFileId: null,
            verificationStatus: 'unverified',
            authProvider: socialProviderId || 'password',
            role: userRole,
            creditsBalance,
            ...(acceptedLegal && {
              termsAcceptedAt: serverTimestamp(),
              tosAcceptedAt: serverTimestamp(),
              privacyAcceptedAt: serverTimestamp(),
              acceptableUseAcceptedAt: serverTimestamp(),
              legalConsentBundleVersion: LEGAL_CONSENT_BUNDLE_VERSION,
            }),
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
          // `firestoreUserAvatarUrlWrite` usa `deleteField()` para claves legacy; Firestore exige merge:true en ese caso.
          { merge: true }
        );

        tx.set(nicknameKeyRef, { uid, type: 'nickname', value: nicknameLower, updatedAt: serverTimestamp() }, { merge: true });
        tx.set(emailKeyRef, { uid, type: 'email', value: emailLower, updatedAt: serverTimestamp() }, { merge: true });
        tx.set(phoneKeyRef, { uid, type: 'phone', value: phoneNormalized, updatedAt: serverTimestamp() }, { merge: true });
      });

      // Zero-balance inicial; bono bienvenida: `system_config/cs_economy` al confirmar pago.
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

      if (inviteReferrerUid) {
        try {
          await upsertSuccessfulReferralAttribution({ referredUid: uid, referrerUid: inviteReferrerUid });
        } catch {
          /* Atribución de referido: mejor esfuerzo — no debe bloquear el alta */
        }
      }

      if (!socialProviderId) {
        if (auth.currentUser) {
          try {
            const idToken = await auth.currentUser.getIdToken(true);
            await requestVerificationEmailViaBackend(idToken, language === 'es' ? 'es' : 'en');
          } catch (verifyMailErr) {
            console.warn('Verification email (Resend) failed:', verifyMailErr);
            Alert.alert(
              t('register_alert_created_verify_failed_title'),
              t('register_alert_created_verify_failed_body'),
            );
          }
        }
        await clearLocalCachesForSignOut(auth.currentUser?.uid ?? uid);
        await signOut(auth);
        setUploadModalVisible(false);
        setIsSubmitting(false);
        await setPresidentialSecurityEnabled(presidentialSecurity);
        Alert.alert(
          t('register_alert_verify_email_title'),
          t('register_alert_verify_email_body')
        );
        router.replace('/signin' as never);
        return;
      }

      await setPresidentialSecurityEnabled(presidentialSecurity);

      if (studentPackResult.granted) {
        Alert.alert(
          t('register_alert_student_pack_title'),
          t('register_alert_student_pack_body', { amount: studentPackResult.bonusAmount })
        );
      }

      setSuccessTransitionVisible(true);
      setUploadModalVisible(false);
      setIsSubmitting(false);
    } catch (error) {
      console.error('Error Firebase:', error);
      setUploadModalVisible(false);
      setIsSubmitting(false);

      if (error instanceof ModerationRejectedError) {
        registerModerationReject();
      } else {
        Alert.alert(
          t('register_alert_registration_error_title'),
          userFacingAlertMessage(
            error,
            language,
            t('register_alert_registration_error_fallback'),
          ),
        );
      }
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <LinearGradient
          colors={[...look.gradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        >
          <KeyboardAwareScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.inner}
            bottomOffset={42}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
          <Text style={[styles.title, { color: look.title }]}>{t('register_title')}</Text>

          {/* Social login buttons hidden for MVP - only native registration enabled */}
          {socialProviderId ? (
            <Text style={[styles.socialStateText, { color: look.socialState }]}>
              {t('register_social_state_a')} {getProviderLabel(socialProviderId)}. {t('register_social_state_b')}
            </Text>
          ) : null}

          <Text style={[styles.label, { color: look.label }]}>{t('register_label_profile_photo')}</Text>
          <Text style={[styles.helperText, { color: look.helper }]}>{t('register_helper_profile_photo')}</Text>
          <View
            style={fieldErrors.photo ? { borderWidth: 1, borderColor: REGISTER_FIELD_ERROR_BORDER, borderRadius: 12, padding: 8, marginBottom: 8 } : null}
          >
            <View style={styles.photoRow}>
              <TouchableOpacity style={[styles.photoButton, { backgroundColor: look.photoBtnBg, borderColor: look.photoBtnBorder }]} onPress={requestCameraPhoto}>
                <Text style={[styles.photoButtonText, { color: look.photoBtnText }]}>{t('register_photo_open_camera')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.photoButton, { backgroundColor: look.photoBtnBg, borderColor: look.photoBtnBorder }]} onPress={requestGalleryPhoto}>
                <Text style={[styles.photoButtonText, { color: look.photoBtnText }]}>{t('register_photo_choose_image')}</Text>
              </TouchableOpacity>
            </View>
            {photoUri ? <Image source={{ uri: photoUri }} style={[styles.photoPreview, { borderColor: look.photoBtnBorder }]} /> : null}
          </View>
          {fieldErrors.photo ? (
            <Text style={[styles.fieldErrorText, { color: REGISTER_FIELD_ERROR_TEXT }]}>{fieldErrors.photo}</Text>
          ) : null}

          {/* Circular photo cropper */}
          <CircularPhotoCropper
            visible={cropperVisible}
            uri={rawPhotoUri}
            imageWidth={rawPhotoWidth}
            imageHeight={rawPhotoHeight}
            onConfirm={(croppedUri) => {
              setPhotoUri(croppedUri);
              setCropperVisible(false);
              clearFieldError('photo');
            }}
            onChooseAgain={() => {
              setCropperVisible(false);
              setTimeout(() => cropperRetryFnRef.current?.(), 350);
            }}
            onClose={() => setCropperVisible(false)}
          />

          <Text style={[styles.label, { color: look.label }]}>{t('register_label_first_name')}</Text>
          <TextInput
            ref={firstNameRef}
            style={[
              styles.input,
              {
                backgroundColor: look.inputBg,
                borderColor: fieldErrors.firstName ? REGISTER_FIELD_ERROR_BORDER : look.inputBorder,
                borderWidth: 1,
                color: look.inputText,
              },
            ]}
            placeholder={t('register_placeholder_first_name')}
            placeholderTextColor={look.placeholderColor}
            value={firstName}
            onChangeText={(v) => {
              setFirstName(v);
              clearFieldError('firstName');
            }}
          />
          {fieldErrors.firstName ? (
            <Text style={[styles.fieldErrorText, { color: REGISTER_FIELD_ERROR_TEXT }]}>{fieldErrors.firstName}</Text>
          ) : null}

          <Text style={[styles.label, { color: look.label }]}>{t('register_label_last_name')}</Text>
          <TextInput
            ref={lastNameRef}
            style={[
              styles.input,
              {
                backgroundColor: look.inputBg,
                borderColor: fieldErrors.lastName ? REGISTER_FIELD_ERROR_BORDER : look.inputBorder,
                borderWidth: 1,
                color: look.inputText,
              },
            ]}
            placeholder={t('register_placeholder_last_name')}
            placeholderTextColor={look.placeholderColor}
            value={lastName}
            onChangeText={(v) => {
              setLastName(v);
              clearFieldError('lastName');
            }}
          />
          {fieldErrors.lastName ? (
            <Text style={[styles.fieldErrorText, { color: REGISTER_FIELD_ERROR_TEXT }]}>{fieldErrors.lastName}</Text>
          ) : null}

          <Text style={[styles.label, { color: look.label }]}>{t('register_label_nickname')}</Text>
          <TextInput
            ref={nicknameRef}
            style={[
              styles.input,
              {
                backgroundColor: look.inputBg,
                borderColor: fieldErrors.nickname ? REGISTER_FIELD_ERROR_BORDER : look.inputBorder,
                borderWidth: 1,
                color: look.inputText,
              },
            ]}
            placeholder={t('register_placeholder_nickname')}
            placeholderTextColor={look.placeholderColor}
            autoCapitalize="none"
            value={nickname}
            onChangeText={(v) => {
              setNickname(v);
              clearFieldError('nickname');
            }}
          />
          {fieldErrors.nickname ? (
            <Text style={[styles.fieldErrorText, { color: REGISTER_FIELD_ERROR_TEXT }]}>{fieldErrors.nickname}</Text>
          ) : (
            <Text
              style={[
                styles.validationText,
                { color: look.validationMuted },
                nicknameStatus === 'available' && styles.validationOk,
                (nicknameStatus === 'taken' || nicknameStatus === 'invalid' || nicknameStatus === 'error_network') &&
                  styles.validationError,
              ]}
            >
              {nicknameStatus === 'available'
                ? t('register_nick_available')
                : nicknameStatus === 'checking'
                  ? t('register_nick_checking')
                  : nicknameStatus === 'taken'
                    ? t('register_nick_taken')
                    : nicknameStatus === 'invalid'
                      ? t('register_nick_invalid')
                      : nicknameStatus === 'error_network'
                        ? t('register_nick_error_network')
                        : t('register_nick_hint')}
            </Text>
          )}

          <Text style={[styles.label, { color: look.label }]}>{t('register_label_email')}</Text>
          <TextInput
            ref={emailRef}
            style={[
              styles.input,
              {
                backgroundColor: look.inputBg,
                borderColor: fieldErrors.email ? REGISTER_FIELD_ERROR_BORDER : look.inputBorder,
                borderWidth: 1,
                color: look.inputText,
              },
            ]}
            placeholder={t('register_placeholder_email')}
            placeholderTextColor={look.placeholderColor}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              clearFieldError('email');
            }}
            editable={!socialProviderId}
          />
          {fieldErrors.email ? (
            <Text style={[styles.fieldErrorText, { color: REGISTER_FIELD_ERROR_TEXT }]}>{fieldErrors.email}</Text>
          ) : (
            <Text
              style={[
                styles.validationText,
                { color: look.validationMuted },
                emailStatus === 'available' && styles.validationOk,
                (emailStatus === 'taken' || emailStatus === 'invalid' || emailStatus === 'error_network') &&
                  styles.validationError,
              ]}
            >
              {emailStatus === 'available'
                ? t('register_email_available')
                : emailStatus === 'checking'
                  ? t('register_email_checking')
                  : emailStatus === 'taken'
                    ? t('register_email_taken')
                    : emailStatus === 'invalid'
                      ? t('register_email_invalid')
                      : emailStatus === 'error_network'
                        ? t('register_email_error_network')
                        : t('register_email_hint')}
            </Text>
          )}

          <Text style={[styles.label, { color: look.label }]}>{t('register_label_phone')}</Text>
          <View
            style={[
              styles.phoneRow,
              fieldErrors.phone ? { borderWidth: 1, borderColor: REGISTER_FIELD_ERROR_BORDER, borderRadius: 12, padding: 6 } : null,
            ]}
          >
            <TouchableOpacity
              style={[styles.phoneDialButton, { backgroundColor: look.phoneDialBg, borderColor: look.phoneDialBorder }]}
              onPress={() => {
                Keyboard.dismiss();
                InteractionManager.runAfterInteractions(() => {
                  setCountryPickerVisible(true);
                });
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.phoneDialText, { color: look.phoneDialText }]}>{phoneDialCode}</Text>
              <Text style={[styles.phoneDialChevron, { color: look.phoneChevron }]}>▼</Text>
            </TouchableOpacity>
            <TextInput
              ref={phoneNationalRef}
              style={[
                styles.input,
                styles.phoneNationalInput,
                {
                  backgroundColor: look.inputBg,
                  borderColor: fieldErrors.phone ? REGISTER_FIELD_ERROR_BORDER : look.inputBorder,
                  borderWidth: 1,
                  color: look.inputText,
                },
              ]}
              placeholder={(() => {
                const { min, max } = getNationalDigitBounds(phoneDialCode);
                return t('register_phone_digits_range', { min, max });
              })()}
              placeholderTextColor={look.placeholderColor}
              keyboardType="phone-pad"
              value={phoneNational}
              onChangeText={(txt) => {
                setPhoneNational(sanitizeNationalDigits(txt).slice(0, getNationalDigitBounds(phoneDialCode).max));
                clearFieldError('phone');
              }}
              maxLength={getNationalDigitBounds(phoneDialCode).max}
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
            />
          </View>
          {fieldErrors.phone ? (
            <Text style={[styles.fieldErrorText, { color: REGISTER_FIELD_ERROR_TEXT }]}>{fieldErrors.phone}</Text>
          ) : (
            <Text
              style={[
                styles.validationText,
                { color: look.validationMuted },
                phoneStatus === 'available' && styles.validationOk,
                (phoneStatus === 'taken' || phoneStatus === 'invalid' || phoneStatus === 'error_network') &&
                  styles.validationError,
              ]}
            >
              {phoneStatus === 'available'
                ? t('register_phone_available')
                : phoneStatus === 'checking'
                  ? t('register_phone_checking')
                  : phoneStatus === 'taken'
                    ? t('register_phone_taken')
                    : phoneStatus === 'invalid'
                      ? t('register_phone_invalid_prefix')
                      : phoneStatus === 'error_network'
                        ? t('register_phone_error_network')
                        : t('register_phone_hint')}
            </Text>
          )}

          <Text style={[styles.label, { color: look.label }]}>{t('register_label_birth')}</Text>
          <View style={styles.dateInputRow}>
            <TextInput
              ref={birthDateRef}
              style={[
                styles.input,
                styles.dateInput,
                {
                  backgroundColor: look.inputBg,
                  borderColor: fieldErrors.birthDate ? REGISTER_FIELD_ERROR_BORDER : look.inputBorder,
                  borderWidth: 1,
                  color: look.inputText,
                },
              ]}
              placeholder={t('register_placeholder_birth')}
              placeholderTextColor={look.placeholderColor}
              keyboardType="number-pad"
              maxLength={10}
              value={birthDate}
              onChangeText={(value) => {
                setBirthDate(formatBirthDateInput(value));
                clearFieldError('birthDate');
              }}
            />
            <TouchableOpacity
              style={[
                styles.calendarButton,
                {
                  backgroundColor: look.calendarBg,
                  borderColor: fieldErrors.birthDate ? REGISTER_FIELD_ERROR_BORDER : look.calendarBorder,
                },
              ]}
              onPress={openBirthPicker}
            >
              <Text style={styles.calendarButtonIcon}>📅</Text>
            </TouchableOpacity>
          </View>
          {fieldErrors.birthDate ? (
            <Text style={[styles.fieldErrorText, { color: REGISTER_FIELD_ERROR_TEXT }]}>{fieldErrors.birthDate}</Text>
          ) : null}

          <Text style={[styles.label, { color: look.label }]}>{t('register_label_city')}</Text>
          <TextInput
            ref={cityRef}
            style={[
              styles.input,
              {
                backgroundColor: look.inputBg,
                borderColor: fieldErrors.city ? REGISTER_FIELD_ERROR_BORDER : look.inputBorder,
                borderWidth: 1,
                color: look.inputText,
              },
            ]}
            placeholder={t('register_placeholder_city')}
            placeholderTextColor={look.placeholderColor}
            value={city}
            onChangeText={(v) => {
              setCity(v);
              clearFieldError('city');
            }}
          />
          {fieldErrors.city ? (
            <Text style={[styles.fieldErrorText, { color: REGISTER_FIELD_ERROR_TEXT }]}>{fieldErrors.city}</Text>
          ) : null}

          <Text style={[styles.label, { color: look.label }]}>{t('register_label_state')}</Text>
          <TextInput
            ref={stateRegionRef}
            style={[
              styles.input,
              {
                backgroundColor: look.inputBg,
                borderColor: fieldErrors.stateRegion ? REGISTER_FIELD_ERROR_BORDER : look.inputBorder,
                borderWidth: 1,
                color: look.inputText,
              },
            ]}
            placeholder={t('register_placeholder_state')}
            placeholderTextColor={look.placeholderColor}
            value={stateRegion}
            onChangeText={(v) => {
              setStateRegion(v);
              clearFieldError('stateRegion');
            }}
          />
          {fieldErrors.stateRegion ? (
            <Text style={[styles.fieldErrorText, { color: REGISTER_FIELD_ERROR_TEXT }]}>{fieldErrors.stateRegion}</Text>
          ) : null}

          <Text style={[styles.label, { color: look.label }]}>{t('register_label_country')}</Text>
          <TextInput
            ref={countryRef}
            style={[
              styles.input,
              {
                backgroundColor: look.inputBg,
                borderColor: fieldErrors.country ? REGISTER_FIELD_ERROR_BORDER : look.inputBorder,
                borderWidth: 1,
                color: look.inputText,
              },
            ]}
            placeholder={t('register_placeholder_country')}
            placeholderTextColor={look.placeholderColor}
            value={country}
            onChangeText={(v) => {
              setCountry(v);
              clearFieldError('country');
            }}
          />
          {fieldErrors.country ? (
            <Text style={[styles.fieldErrorText, { color: REGISTER_FIELD_ERROR_TEXT }]}>{fieldErrors.country}</Text>
          ) : null}

          <TouchableOpacity style={[styles.geoButton, { backgroundColor: look.geoBtnBg, borderColor: look.geoBtnBorder }]} onPress={() => void autofillLocationFromDevice()} disabled={isAutofillingLocation}>
            {isAutofillingLocation ? (
              <AuthSpinnerWell wellBg={look.spinnerWellBg} wellBorder={look.spinnerWellBorder} preset="inline">
                <ActivityIndicator size="small" color={look.spinnerColor} />
              </AuthSpinnerWell>
            ) : (
              <Text style={[styles.geoButtonText, { color: look.geoBtnText }]}>{t('register_autofill_location')}</Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.label, { color: look.label }]}>{t('register_label_timezone')}</Text>
          <Text style={[styles.readOnlyValue, { backgroundColor: look.readOnlyBg, borderColor: look.readOnlyBorder, color: look.readOnlyText }]}>{timezone}</Text>

          {!socialProviderId ? (
            <>
              <Text style={[styles.label, { color: look.label }]}>{t('register_label_password')}</Text>
              <View
                style={[
                  styles.passwordRow,
                  { backgroundColor: look.passwordRowBg, borderWidth: 1 },
                  { borderColor: fieldErrors.password ? REGISTER_FIELD_ERROR_BORDER : look.passwordRowBorder },
                ]}
              >
                <TextInput
                  ref={passwordRef}
                  style={[styles.passwordInput, { color: look.inputText }]}
                  placeholder={t('register_placeholder_password')}
                  placeholderTextColor={look.placeholderColor}
                  secureTextEntry={!passwordVisible}
                  autoComplete="off"
                  textContentType="none"
                  importantForAutofill="no"
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    clearFieldError('password');
                  }}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setPasswordVisible((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    passwordVisible
                      ? t('register_a11y_hide_password')
                      : t('register_a11y_show_password')
                  }
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <MaterialCommunityIcons
                    name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                    size={24}
                    color={look.eyeIcon}
                  />
                </TouchableOpacity>
              </View>
              {fieldErrors.password ? (
                <Text style={[styles.fieldErrorText, { color: REGISTER_FIELD_ERROR_TEXT }]}>{fieldErrors.password}</Text>
              ) : null}
            </>
          ) : null}

          <TouchableOpacity
            style={[
              styles.legalRow,
              fieldErrors.legal ? { borderWidth: 1, borderColor: REGISTER_FIELD_ERROR_BORDER, borderRadius: 10, padding: 8 } : null,
            ]}
            onPress={() => {
              if (acceptedLegal) {
                setAcceptedLegal(false);
                clearFieldError('legal');
                return;
              }
              clearFieldError('legal');
              setLegalReviewOpen(true);
            }}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.legalCheckbox,
                { backgroundColor: look.legalCheckboxBg, borderColor: look.legalBorder },
                acceptedLegal && { backgroundColor: look.legalCheckedBg, borderColor: look.legalCheckedBorder },
              ]}
            >
              {acceptedLegal ? <Text style={styles.legalCheckmark}>✓</Text> : null}
            </View>
            <Text style={[styles.legalText, { color: look.legalText }]}>{t('register_legal_checkbox')}</Text>
          </TouchableOpacity>
          {fieldErrors.legal ? (
            <Text style={[styles.fieldErrorText, { color: REGISTER_FIELD_ERROR_TEXT }]}>
              {fieldErrors.legal}
              {' \u2014 '}
              {t('register_legal_unchecked_hint')}
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => setPresidentialSecurity((prev) => !prev)}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.legalCheckbox,
                { backgroundColor: look.legalCheckboxBg, borderColor: look.legalBorder },
                presidentialSecurity && {
                  backgroundColor: look.legalCheckedBg,
                  borderColor: look.legalCheckedBorder,
                },
              ]}
            >
              {presidentialSecurity ? <Text style={styles.legalCheckmark}>✓</Text> : null}
            </View>
            <Text style={[styles.legalText, { color: look.legalText }]}>
              {t('register_presidential_security_label')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.registerButton,
              { backgroundColor: look.registerBtnBg },
              (isSubmitting || isRetryLocked) && styles.registerButtonDisabled,
            ]}
            onPress={handleRegister}
            disabled={isSubmitting || isRetryLocked}
          >
            {isSubmitting ? (
              <AuthSpinnerWell wellBg={look.spinnerWellBg} wellBorder={look.spinnerWellBorder} preset="cta">
                <ActivityIndicator color={look.spinnerColor} />
              </AuthSpinnerWell>
            ) : (
              <Text style={[styles.registerButtonText, { color: look.registerBtnText }]}>{t('register_cta_confirm')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
            <Text style={{ color: look.secondaryLink, opacity: 0.75 }}>{t('register_go_back')}</Text>
          </TouchableOpacity>
          </KeyboardAwareScrollView>
        </LinearGradient>

        <Modal
          visible={uploadModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={styles.progressOverlay}>
            <View style={[styles.progressContainer, { backgroundColor: look.progressCardBg, borderColor: look.progressCardBorder }]}>
              <AuthSpinnerWell
                wellBg={look.spinnerWellBg}
                wellBorder={look.spinnerWellBorder}
                preset="registerUpload"
              >
                <ActivityIndicator size={140} color={look.spinnerColor} />
              </AuthSpinnerWell>
              <Text style={[styles.uploadLabel, { color: look.progressLabel }]}>{t(uploadStageKey)}</Text>
            </View>
          </View>
        </Modal>

        <Modal
          visible={Platform.OS === 'android' && androidPhotoPending != null}
          transparent
          animationType="fade"
          onRequestClose={cancelAndroidPhotoPending}
        >
          <View style={styles.androidPhotoConfirmOverlay}>
            <View style={styles.androidPhotoConfirmCard}>
              <Text style={styles.androidPhotoConfirmTitle}>
                {t('register_android_photo_title')}
              </Text>
              <Text style={styles.androidPhotoConfirmHint}>
                {t('register_android_photo_hint')}
              </Text>
              {androidPhotoPending ? (
                <Image
                  source={{ uri: androidPhotoPending.uri }}
                  style={styles.androidPhotoConfirmPreview}
                  resizeMode="contain"
                />
              ) : null}
              <View style={styles.androidPhotoConfirmActions}>
                <TouchableOpacity
                  style={[styles.androidPhotoConfirmButton, styles.androidPhotoConfirmButtonSecondary]}
                  onPress={cancelAndroidPhotoPending}
                >
                  <Text style={styles.androidPhotoConfirmButtonSecondaryText}>
                    {t('common_cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.androidPhotoConfirmButton, styles.androidPhotoConfirmButtonPrimary]}
                  onPress={() => void confirmAndroidPhotoPending()}
                >
                  <Text style={styles.androidPhotoConfirmButtonPrimaryText}>
                    {t('common_accept')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <LuxuryModerationModal
          visible={moderationAlertVisible}
          title={t('register_moderation_modal_title')}
          message={moderationAlertMessage}
          onClose={() => setModerationAlertVisible(false)}
          onRetry={() => setModerationAlertVisible(false)}
          retryLocked={isRetryLocked}
          retryCountdownSec={retryCountdownSec}
          lockMessage={retryLockMessage}
        />

        <LegalSignupReviewModal
          visible={legalReviewOpen}
          palette={legalModalPalette}
          language={language}
          t={t}
          onClose={() => setLegalReviewOpen(false)}
          onConfirm={() => {
            setAcceptedLegal(true);
            clearFieldError('legal');
            setLegalReviewOpen(false);
          }}
        />

        <PremiumSuccessTransition
          visible={successTransitionVisible}
          durationMs={1800}
          onDone={() => {
            setSuccessTransitionVisible(false);
            router.replace('/');
          }}
        />

        <CountryDialPickerModal
          visible={countryPickerVisible}
          onClose={() => setCountryPickerVisible(false)}
          onSelect={(entry) => {
            setPhoneDialCode(entry.code);
            setPhoneNational((prev) => sanitizeNationalDigits(prev).slice(0, entry.maxDigits));
            clearFieldError('phone');
          }}
          title={t('register_country_picker_title')}
          topSectionTitle={t('register_country_picker_top')}
          restSectionTitle={t('register_country_picker_all')}
          searchPlaceholder={t('register_country_picker_search')}
          surfaceBg={look.countryPickerSurface}
          textPrimary={look.countryPickerTextPrimary}
          textSecondary="#8E8E93"
          border={look.countryPickerBorder}
          inputBg={look.countryPickerInputBg}
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
              <Text style={styles.dateModalTitle}>{t('register_birth_modal_title')}</Text>
              <Text style={styles.dateModalHint}>{t('register_birth_modal_hint')}</Text>
              <View style={styles.dateSelectedBadge}>
                <Text style={styles.dateSelectedBadgeText}>{formatBirthDateUs(pickerMonth, pickerDay, pickerYear)}</Text>
              </View>

              <View style={styles.datePickerRow}>
                <View style={[styles.datePickerColumn, styles.datePickerYearColumn]}>
                  <Text style={styles.datePickerLabel}>{t('register_birth_year')}</Text>
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
                  <Text style={styles.datePickerLabel}>{t('register_birth_month')}</Text>
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
                  <Text style={styles.datePickerLabel}>{t('register_birth_day')}</Text>
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

              <View style={[styles.dateModalActions, { paddingBottom: modalFooterBottomPad }]}>
                <TouchableOpacity style={styles.dateModalButtonGhost} onPress={() => setBirthPickerVisible(false)}>
                  <Text style={styles.dateModalButtonGhostText}>{t('common_cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dateModalButtonPrimary} onPress={confirmBirthPicker}>
                  <Text style={styles.dateModalButtonPrimaryText}>{t('register_confirm')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
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
    color: '#E9C349',
    marginBottom: 24,
    alignSelf: 'center',
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
    color: '#E9C349',
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
    color: '#E9C349',
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
  androidPhotoConfirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  androidPhotoConfirmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#D8EAF6',
    maxHeight: '88%',
  },
  androidPhotoConfirmTitle: {
    color: '#0A2540',
    fontWeight: '800',
    fontSize: 17,
    textAlign: 'center',
    marginBottom: 6,
  },
  androidPhotoConfirmHint: {
    color: '#4A4A4A',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  androidPhotoConfirmPreview: {
    width: '100%',
    height: 280,
    borderRadius: 12,
    backgroundColor: '#EEF6FC',
    marginBottom: 16,
  },
  androidPhotoConfirmActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  androidPhotoConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  androidPhotoConfirmButtonSecondary: {
    backgroundColor: 'rgba(13,77,138,0.08)',
    borderWidth: 1,
    borderColor: '#7BC2EC',
  },
  androidPhotoConfirmButtonSecondaryText: {
    color: '#E9C349',
    fontWeight: '700',
    fontSize: 15,
  },
  androidPhotoConfirmButtonPrimary: {
    backgroundColor: '#E9C349',
  },
  androidPhotoConfirmButtonPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
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
  fieldErrorText: {
    marginTop: -14,
    marginBottom: 14,
    marginLeft: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
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
  phoneRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  phoneDialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 18,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7BC2EC',
    gap: 6,
  },
  phoneDialText: {
    color: '#0A2540',
    fontWeight: '700',
    fontSize: 16,
  },
  phoneDialChevron: {
    color: '#E9C349',
    fontSize: 10,
  },
  phoneNationalInput: {
    flex: 1,
    marginBottom: 0,
  },
  passwordRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 20,
    paddingRight: 6,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 18,
    paddingLeft: 18,
    paddingRight: 8,
    color: '#0A2540',
    fontSize: 16,
  },
  passwordToggle: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
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
    color: '#E9C349',
    fontWeight: '700',
    fontSize: 12,
  },
  readOnlyValue: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#E9C349',
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
    color: '#E9C349',
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
    color: '#E9C349',
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
    color: '#E9C349',
    fontWeight: '700',
  },
  dateModalButtonPrimary: {
    flex: 1,
    backgroundColor: '#E9C349',
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
    backgroundColor: '#E9C349',
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
    color: '#E9C349',
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
