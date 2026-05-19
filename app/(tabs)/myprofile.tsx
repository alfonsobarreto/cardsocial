/**
 * MyProfile — pantalla completa de perfil del usuario autenticado.
 *
 * Secciones:
 *  1. Foto de perfil — selector galería/cámara + optimización + upload con moderación
 *  2. Nombre completo — editable, se refleja en Firestore
 *  3. Nickname único — cooldown de 28 días, validación global, backend call
 *  4. Email — solo lectura (requiere re-autenticación para cambiar → sección dedicada)
 *  5. Teléfono — solo lectura (cambio vía soporte)
 *  6. Contraseña — cambio con re-auth (solo usuarios password, no Social)
 *  7. Verificación del usuario
 */

import { getActiveUserId } from '@/services/authSession';
import { getPresidentialSecurityEnabled, setPresidentialSecurityEnabled } from '@/services/biometricAuth';
import { getUserCreditsBalance } from '@/services/creditsService';
import { clearLocalCachesForSignOut } from '@/services/userScopedStorage';
import { auth, db } from '@/services/firebaseConfig';
import {
  firestoreUserAvatarUrlWrite,
  firestoreUserFullNameWrite,
  firestoreUserNickNameWrite,
  readUserAvatarUrl,
  readUserFullName,
  readUserNickName,
  readUserNickNameLower,
} from '@/services/userIdentityFields';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { useAuthT } from '@/services/authI18n';
import { useCoreT } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import {
  computeScheduledDeletionDeadline,
  formatDeletionDeadlineDisplay,
  markAccountPendingDeletionInFirestore,
} from '@/services/accountDeletionClient';
import { ModerationRejectedError, uploadFileWithModeration } from '@/services/moderationApi';
import { listReceivedContacts, listSmartCardsFromDb, syncProfileAvatarUrlToMongo } from '@/services/qrApi';
import { propagateUserIdentityAcrossSmartCards } from '@/services/smartCardsRepo';
import { tierMeetsSilver, parseLegacyTier } from '@/services/legacyPathEngine';
import { toRenderableImageUri } from '@/services/userProfilePhoto';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    signOut,
    updatePassword,
    verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActionSheetIOS,
    Alert,
    InteractionManager,
    Keyboard,
    Linking,
    Modal,
    Platform,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import palette from '../theme';
import { PartnerBadge } from '@/components/PartnerBadge';
import { VoipAirTimeBadge } from '@/components/VoipAirTimeBadge';

// ─── Photo helpers ─────────────────────────────────────────────────────────────
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

async function getFileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true } as any);
    if ((info as any)?.size) return Number((info as any).size);
  } catch { /* fallback */ }
  const blob = await fetch(uri).then((r) => r.blob());
  return blob.size;
}

async function optimizePhoto(uri: string): Promise<string> {
  const initialSize = await getFileSize(uri);
  if (initialSize <= MAX_PHOTO_BYTES) return uri;

  const attempts = [
    { width: 1920, compress: 0.72 },
    { width: 1440, compress: 0.62 },
    { width: 1080, compress: 0.52 },
    { width: 840, compress: 0.45 },
    { width: 640, compress: 0.38 },
  ];

  let best = uri;
  for (const a of attempts) {
    const r = await ImageManipulator.manipulateAsync(
      best,
      [{ resize: { width: a.width } }],
      { compress: a.compress, format: ImageManipulator.SaveFormat.JPEG }
    );
    const size = await getFileSize(r.uri);
    best = r.uri;
    if (size <= MAX_PHOTO_BYTES) return best;
  }

  const emergency = await ImageManipulator.manipulateAsync(
    best,
    [{ resize: { width: 480 } }],
    { compress: 0.2, format: ImageManipulator.SaveFormat.JPEG }
  );
  return emergency.uri;
}
// ───────────────────────────────────────────────────────────────────────────────

type UserProfile = {
  uid: string;
  userFullName: string;
  firstName: string;
  lastName: string;
  userNickName: string;
  userNickNameLower: string;
  email: string;
  phone: string;
  userAvatarUrl: string | null;
  verificationStatus: string;
  authProvider: string;
  lastNicknameChange: string | null;
  bio: string;
  /** Legacy Path ≥ Silver — insignia de socio en cabecera. */
  partnerBadgeEligible: boolean;
};

const NICKNAME_COOLDOWN_DAYS = 28;

function nicknameUnlockDate(lastChange: string | null): Date | null {
  if (!lastChange) return null;
  const d = new Date(lastChange);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + NICKNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

export default function MyProfileScreen() {
  const { language } = useLanguage();
  const t = useAuthT();
  const tcx = useCoreT();
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const router = useRouter();
  const shell = palette[isDark ? 'dark' : 'light'];

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [editName, setEditName] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingNickname, setSavingNickname] = useState(false);

  // Photo upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  /** Android: vista previa antes de subir (evita recorte nativo roto + confirma con Aceptar). */
  const [androidPhotoPreviewUri, setAndroidPhotoPreviewUri] = useState<string | null>(null);

  // Password change
  const [pwSection, setPwSection] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Email change
  const [emailSection, setEmailSection] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [showEmailPw, setShowEmailPw] = useState(false);

  // Bio
  const [editBio, setEditBio] = useState('');
  const [savingBio, setSavingBio] = useState(false);

  // Stats
  const [statsCards, setStatsCards] = useState(0);
  const [statsContacts, setStatsContacts] = useState(0);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [presidentialSecEnabled, setPresidentialSecEnabled] = useState(false);

  const scrollRef = useRef<React.ComponentRef<typeof KeyboardAwareScrollView>>(null);

  // ── Load profile ────────────────────────────────────────────────────────────
  useEffect(() => {
    void loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const uid = await getActiveUserId();
      if (!uid) return;

      const userDocRef = doc(db, 'users', uid);
      const snap = await getDoc(userDocRef);
      const data = snap.data() as any;
      if (!data) return;
      try {
        await auth.currentUser?.reload();
        const authEmail = String(auth.currentUser?.email || '').trim().toLowerCase();
        const storedEmail = String(data.emailLower || data.email || '').trim().toLowerCase();
        if (authEmail && authEmail !== storedEmail) {
          await updateDoc(userDocRef, {
            email: authEmail,
            emailLower: authEmail,
            pendingEmail: null,
            pendingEmailLower: null,
            emailChangedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          data.email = authEmail;
          data.emailLower = authEmail;
        }
      } catch {
        /* Email sync is best-effort; profile still loads. */
      }

      const lastName = String(data.lastName || '').trim();
      const firstName = String(data.firstName || '').trim();
      const userFullName = readUserFullName(data as Record<string, unknown>);
      const userNickName = readUserNickName(data as Record<string, unknown>);
      const userNickNameLower = readUserNickNameLower(data as Record<string, unknown>);
      const lastNicknameChangeRaw = data.lastNicknameChange || data.nicknameChangedAt;
      const lastNicknameChange = lastNicknameChangeRaw?.toDate
        ? lastNicknameChangeRaw.toDate().toISOString()
        : lastNicknameChangeRaw ? String(lastNicknameChangeRaw) : null;

      const p: UserProfile = {
        uid,
        userFullName,
        firstName,
        lastName,
        userNickName,
        userNickNameLower,
        email: String(data.email || auth.currentUser?.email || ''),
        phone: String(data.phone || ''),
        userAvatarUrl:
          toRenderableImageUri(readUserAvatarUrl(data as Record<string, unknown>)) ||
          toRenderableImageUri(auth.currentUser?.photoURL) ||
          null,
        verificationStatus: String(data.verificationStatus || 'unverified'),
        authProvider: String(data.authProvider || 'password'),
        lastNicknameChange,
        bio: String(data.bio || ''),
        partnerBadgeEligible: tierMeetsSilver(parseLegacyTier(data?.legacyTier)),
      };

      setProfile(p);
      setEditName(p.userFullName);
      setEditNickname(p.userNickName);
      setEditBio(p.bio);

      // Load stats — tarjetas y contactos reales están en Mongo (API /api/qr/...), no en subcolecciones Firestore.
      try {
        const [cardsDb, contactsDb] = await Promise.all([
          listSmartCardsFromDb({ uid }),
          listReceivedContacts({ uid }),
        ]);
        setStatsCards(cardsDb.cards.length);
        setStatsContacts(contactsDb.contacts.length);
      } catch {
        try {
          const cardsSnap = await getDocs(collection(db, 'users', uid, 'smartCards'));
          setStatsCards(cardsSnap.size);
          const contactsSnap = await getDocs(collection(db, 'users', uid, 'contacts'));
          setStatsContacts(contactsSnap.size);
        } catch {
          /* legacy fallback failed */
        }
      }

      try {
        const ledgerCs = await getUserCreditsBalance(uid);
        const rootCs = Number(data.creditsBalance ?? 0);
        setCreditsBalance(Math.max(ledgerCs, rootCs));
      } catch {
        setCreditsBalance(Number(data.creditsBalance ?? 0));
      }

      try {
        const isPresSecEnabled = await getPresidentialSecurityEnabled();
        setPresidentialSecEnabled(isPresSecEnabled);
      } catch {
        /* best-effort: preferencia local */
      }
    } catch (e: any) {
      Alert.alert(
        tcx('common_error'),
        userFacingAlertMessage(e, language, tcx('profile_load_failed')),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile_sec_delete_confirm_title'),
      t('profile_sec_delete_confirm_body'),
      [
        { text: t('common_cancel'), style: 'cancel' },
        {
          text: t('profile_sec_yes_continue'),
          style: 'destructive',
          onPress: () => {
            const u = auth.currentUser;
            if (!profile || !u) return;
            const scheduledDeadline = computeScheduledDeletionDeadline();
            const deadlineStr = formatDeletionDeadlineDisplay(scheduledDeadline, language);
            Alert.alert(
              t('profile_sec_delete_step2_title'),
              t('profile_sec_delete_step2_body', { date: deadlineStr }),
              [
                { text: t('common_cancel'), style: 'cancel' },
                {
                  text: t('profile_sec_yes_delete'),
                  style: 'destructive',
                  onPress: () => {
                    void (async () => {
                      try {
                        const uid = profile.uid;
                        await markAccountPendingDeletionInFirestore({
                          uid,
                          language,
                          firstNameForEmail: profile.userFullName,
                          deadlineDate: scheduledDeadline,
                        });
                        Alert.alert(
                          t('profile_sec_delete_marked_title'),
                          t('profile_sec_delete_marked_body', { date: deadlineStr }),
                          [
                            {
                              text: t('common_ok'),
                              onPress: () => {
                                void (async () => {
                                  await clearLocalCachesForSignOut(uid);
                                  await signOut(auth);
                                  router.replace('/signin');
                                })();
                              },
                            },
                          ],
                        );
                      } catch (e) {
                        Alert.alert(
                          t('common_error'),
                          t('profile_sec_delete_error'),
                        );
                      }
                    })();
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  // ── Photo picker ────────────────────────────────────────────────────────────
  const pickPhoto = async () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            t('common_cancel'),
            t('profile_sec_gallery'),
            t('profile_sec_camera_selfie'),
          ],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) pickFromGallery();
          if (idx === 2) pickFromCamera();
        }
      );
    } else {
      Alert.alert(
        t('profile_sec_change_photo_title'),
        '',
        [
          { text: t('profile_sec_gallery'), onPress: pickFromGallery },
          { text: t('profile_sec_camera'), onPress: pickFromCamera },
          { text: t('common_cancel'), style: 'cancel' },
        ]
      );
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('profile_sec_permission_title'), t('profile_sec_permission_photos'));
      return;
    }
    if (Platform.OS === 'android') {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setAndroidPhotoPreviewUri(result.assets[0].uri);
      }
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      await handlePhotoSelected(result.assets[0].uri);
    }
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('profile_sec_permission_title'), t('profile_sec_permission_camera'));
      return;
    }
    if (Platform.OS === 'android') {
      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: false,
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setAndroidPhotoPreviewUri(result.assets[0].uri);
      }
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      await handlePhotoSelected(result.assets[0].uri);
    }
  };

  const confirmAndroidPhotoPreview = () => {
    const uri = androidPhotoPreviewUri;
    setAndroidPhotoPreviewUri(null);
    if (uri) {
      void handlePhotoSelected(uri);
    }
  };

  const cancelAndroidPhotoPreview = () => {
    setAndroidPhotoPreviewUri(null);
  };

  const handlePhotoSelected = async (uri: string) => {
    if (!profile) return;
    setUploadingPhoto(true);
    setLocalPhotoUri(uri);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Defer heavy work (compress + upload) until UI animations settle
    InteractionManager.runAfterInteractions(async () => {
      try {
        const optimized = await optimizePhoto(uri);
        const result = await uploadFileWithModeration({
          fileUri: optimized,
          uid: profile.uid,
          label: 'profile_photo',
          fileName: `profile_${profile.uid}_${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
        });

      const newPhotoUrl = toRenderableImageUri(result.publicUrl);

      await updateDoc(doc(db, 'users', profile.uid), {
        ...firestoreUserAvatarUrlWrite(newPhotoUrl),
        profilePhotoFileId: result.fileId,
        updatedAt: serverTimestamp(),
      });

      if (newPhotoUrl && /^https?:\/\//i.test(String(newPhotoUrl))) {
        try {
          await syncProfileAvatarUrlToMongo({ uid: profile.uid, userAvatarUrl: newPhotoUrl });
          await propagateUserIdentityAcrossSmartCards(profile.uid);
        } catch (syncErr) {
          if (__DEV__) {
            console.warn('[myprofile] Mongo avatar sync / smart-cards propagate failed', syncErr);
          }
        }
      }

      const freshSnap = await getDoc(doc(db, 'users', profile.uid));
      const freshData = freshSnap.data() as Record<string, unknown> | undefined;
      const avatarFromDb = toRenderableImageUri(
        freshData ? readUserAvatarUrl(freshData) || null : null,
      );
      const avatar =
        avatarFromDb || toRenderableImageUri(auth.currentUser?.photoURL) || null;
      setProfile((prev) => (prev ? { ...prev, userAvatarUrl: avatar } : prev));
      setLocalPhotoUri(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (newPhotoUrl) {
        Alert.alert(t('profile_sec_photo_updated_title'), t('profile_sec_photo_updated_body'));
      } else {
        Alert.alert(
          t('profile_sec_photo_pending_title'),
          t('profile_sec_photo_pending_body'),
        );
      }
    } catch (e: any) {
      setLocalPhotoUri(null);
      if (e instanceof ModerationRejectedError) {
        Alert.alert(
          t('profile_sec_photo_rejected_title'),
          t('profile_sec_photo_rejected_body'),
        );
      } else {
        Alert.alert(
          t('profile_sec_photo_upload_error_title'),
          userFacingAlertMessage(e, language, t('profile_sec_try_again')),
        );
      }
    } finally {
      setUploadingPhoto(false);
    }
    }); // InteractionManager
  };

  // ── Save full name ──────────────────────────────────────────────────────────
  const saveName = async () => {
    if (!profile) return;
    const next = editName.trim();
    if (!next) {
      Alert.alert(tcx('profile_name_required'), tcx('profile_name_empty'));
      return;
    }
    if (next === profile.userFullName) {
      Alert.alert(tcx('profile_notice'), tcx('profile_no_changes'));
      return;
    }
    try {
      setSavingName(true);
      const parts = next.split(/\s+/).filter(Boolean);
      const firstName = parts[0] || profile.firstName;
      const lastName = parts.slice(1).join(' ') || profile.lastName;
      await updateDoc(doc(db, 'users', profile.uid), {
        ...firestoreUserFullNameWrite(next),
        firstName,
        lastName,
        updatedAt: serverTimestamp(),
      });
      setProfile((prev) => prev ? { ...prev, userFullName: next, firstName, lastName } : prev);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(tcx('profile_name_updated'), tcx('profile_changes_saved'));
    } catch (e: any) {
      Alert.alert(
        tcx('common_error'),
        userFacingAlertMessage(e, language, tcx('common_try_again')),
      );
    } finally {
      setSavingName(false);
    }
  };

  // ── Save nickname ───────────────────────────────────────────────────────────
  const saveNickname = async () => {
    if (!profile) return;
    const next = editNickname.trim();
    if (!next) {
      Alert.alert(tcx('profile_nickname_required'), tcx('profile_nickname_enter'));
      return;
    }
    if (next.toLowerCase() === profile.userNickNameLower) {
      Alert.alert(tcx('profile_notice'), tcx('profile_no_changes'));
      return;
    }
    if (!/^[a-z0-9._-]{3,24}$/i.test(next)) {
      Alert.alert(
        tcx('profile_nickname_invalid'),
        tcx('profile_nickname_rules')
      );
      return;
    }

    // Check cooldown
    const unlock = nicknameUnlockDate(profile.lastNicknameChange);
    if (unlock && unlock > new Date()) {
      Alert.alert(
        tcx('profile_nickname_locked_title'),
        tcx('profile_nickname_unlock_on', { date: formatDate(unlock) })
      );
      return;
    }

    try {
      setSavingNickname(true);
      const apiBase = process.env.EXPO_PUBLIC_MODERATION_API_URL?.trim().replace(/\/+$/, '');
      if (!apiBase) throw new Error('Backend URL not configured.');

      const resp = await fetch(`${apiBase}/api/users/${profile.uid}/nickname`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: next }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        const pseudoErr = { response: { status: resp.status, data: body } };
        Alert.alert(
          tcx('profile_nickname_change_failed'),
          userFacingAlertMessage(pseudoErr, language, tcx('common_try_again')),
        );
        return;
      }

      const now = new Date().toISOString();
      await updateDoc(doc(db, 'users', profile.uid), {
        ...firestoreUserNickNameWrite(next),
        lastNicknameChange: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              userNickName: next,
              userNickNameLower: next.toLowerCase(),
              lastNicknameChange: now,
            }
          : prev
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(tcx('profile_nickname_updated'), tcx('profile_changes_saved'));
    } catch (e: any) {
      Alert.alert(
        tcx('common_error'),
        userFacingAlertMessage(e, language, tcx('common_try_again')),
      );
    } finally {
      setSavingNickname(false);
    }
  };

  // ── Save bio ────────────────────────────────────────────────────────────────
  const saveBio = async () => {
    if (!profile) return;
    const trimmed = editBio.trim().slice(0, 150);
    setSavingBio(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), { bio: trimmed, updatedAt: serverTimestamp() });
      setProfile((prev) => prev ? { ...prev, bio: trimmed } : prev);
      setEditBio(trimmed);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert(tcx('common_done'), tcx('profile_bio_updated'));
    } catch (e: any) {
      Alert.alert(
        tcx('common_error'),
        userFacingAlertMessage(e, language, tcx('profile_save_failed')),
      );
    } finally {
      setSavingBio(false);
    }
  };

  // ── Change email ────────────────────────────────────────────────────────────
  const requestEmailChange = async () => {
    const user = auth.currentUser;
    if (!profile || !user || !user.email) return;
    const next = newEmail.trim().toLowerCase();
    const current = String(user.email || profile.email || '').trim().toLowerCase();
    if (!next || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      Alert.alert(t('profile_sec_invalid_email_title'), t('profile_sec_invalid_email_body'));
      return;
    }
    if (next === current) {
      Alert.alert(t('profile_sec_notice_title'), t('profile_sec_email_unchanged'));
      return;
    }
    if (!emailPw) {
      Alert.alert(t('profile_sec_password_required_email_title'), t('profile_sec_password_required_email_body'));
      return;
    }
    try {
      setSavingEmail(true);
      const credential = EmailAuthProvider.credential(user.email, emailPw);
      await reauthenticateWithCredential(user, credential);
      await verifyBeforeUpdateEmail(user, next);
      await updateDoc(doc(db, 'users', profile.uid), {
        pendingEmail: next,
        pendingEmailLower: next,
        emailChangeRequestedAt: serverTimestamp(),
        emailChangeRequestedFrom: 'mobile',
        updatedAt: serverTimestamp(),
      });
      setNewEmail('');
      setEmailPw('');
      setEmailSection(false);
      Alert.alert(
        t('profile_sec_verify_new_email_title'),
        t('profile_sec_verify_new_email_body'),
      );
    } catch (e: any) {
      const code = String(e?.code || '');
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        Alert.alert(t('profile_sec_wrong_password_title'), t('profile_sec_wrong_password_body'));
      } else if (code === 'auth/email-already-in-use') {
        Alert.alert(t('profile_sec_email_in_use_title'), t('profile_sec_email_in_use_body'));
      } else if (code === 'auth/requires-recent-login') {
        Alert.alert(t('profile_sec_session_expired_title'), t('profile_sec_session_expired_body'));
      } else {
        Alert.alert(
          t('profile_sec_verify_send_fail_title'),
          userFacingAlertMessage(e, language, t('profile_sec_try_again')),
        );
      }
    } finally {
      setSavingEmail(false);
    }
  };

  const openPhoneSupportTicket = async () => {
    const subject = encodeURIComponent(t('profile_sec_mail_subject'));
    const body = encodeURIComponent(
      t('profile_sec_mail_body', {
        uid: profile?.uid || '',
        email: profile?.email || '',
        phone: profile?.phone || '',
      }),
    );
    const url = `mailto:support@cardsocial.me?subject=${subject}&body=${body}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) throw new Error('No mail client');
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        t('profile_sec_open_ticket'),
        t('profile_sec_ticket_fallback_body'),
      );
    }
  };

  // ── Change password ─────────────────────────────────────────────────────────
  const changePassword = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) return;

    if (!currentPw || !newPw || !confirmPw) {
      Alert.alert(t('profile_sec_password_fields_required_title'), t('profile_sec_password_fields_required_body'));
      return;
    }
    if (newPw.length < 8) {
      Alert.alert(t('profile_sec_password_short_title'), t('profile_sec_password_short_body'));
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert(t('profile_sec_password_mismatch_title'), t('profile_sec_password_mismatch_body'));
      return;
    }

    try {
      setSavingPw(true);
      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPw);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwSection(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('profile_sec_password_changed_title'), t('profile_sec_password_changed_body'));
    } catch (e: any) {
      const code: string = e?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        Alert.alert(t('profile_sec_wrong_password_title'), t('profile_sec_wrong_password_body'));
      } else if (code === 'auth/requires-recent-login') {
        Alert.alert(t('profile_sec_session_expired_title'), t('profile_sec_session_expired_body'));
      } else {
        Alert.alert(
          t('common_error'),
          userFacingAlertMessage(e, language, t('profile_sec_try_again')),
        );
      }
    } finally {
      setSavingPw(false);
    }
  };

  const togglePresidentialSecurity = async (value: boolean) => {
    setPresidentialSecEnabled(value);
    await setPresidentialSecurityEnabled(value);
    if (value) {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        /* ignore */
      }
      Alert.alert(tcx('common_done') || 'Hecho', 'Seguridad Presidencial activada.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  const bg = shell.backgroundSolid;
  const card = shell.surface;
  const textPrimary = shell.textPrimary;
  const textSecondary = shell.textSecondary;
  const border = shell.border;
  const inputBg = shell.inputBg;
  const accent = shell.ctaAccent;

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: bg }]}>
        <MaterialCommunityIcons name="account-circle-outline" size={48} color={accent} />
        <Text style={[styles.loadingText, { color: textSecondary }]}>{tcx('profile_loading')}</Text>
      </View>
    );
  }

  const displayPhoto = localPhotoUri || profile?.userAvatarUrl;
  const isPasswordUser = (profile?.authProvider || 'password') === 'password';
  const unlock = nicknameUnlockDate(profile?.lastNicknameChange ?? null);
  const nicknameLocked = unlock !== null && unlock > new Date();

  const photoPickerBusy = uploadingPhoto || Boolean(androidPhotoPreviewUri);

  return (
    <>
      <KeyboardAwareScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={[
          styles.scroll,
          {
            flexGrow: 1,
            backgroundColor: bg,
            paddingBottom: 56,
          },
        ]}
        bottomOffset={42}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <LinearGradient colors={[...shell.tabShellGradient]} style={{ flexGrow: 1, backgroundColor: bg }}>
          <View style={[styles.header, { borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={tcx('scan_back')}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={accent} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: textPrimary }]}>{tcx('profile_screen_title')}</Text>
            <View style={{ width: 24 }} />
          </View>

            {/* ── Avatar ─────────────────────────────────────────────────────── */}
            <View style={styles.avatarSection}>
              <TouchableOpacity onPress={pickPhoto} disabled={photoPickerBusy} activeOpacity={0.8}>
                <View style={[styles.avatarRing, { borderColor: accent }]}>
                  {displayPhoto ? (
                    <ExpoImage
                      key={displayPhoto}
                      source={{ uri: displayPhoto }}
                      style={styles.avatarImg}
                      cachePolicy="none"
                      transition={200}
                    />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: inputBg }]}>
                      <MaterialCommunityIcons name="account" size={56} color={accent} />
                    </View>
                  )}

                  {uploadingPhoto ? (
                    <View style={styles.avatarOverlay}>
                      <MaterialCommunityIcons name="loading" size={28} color={shell.fabText} />
                    </View>
                  ) : (
                    <View style={[styles.avatarEditBadge, { backgroundColor: accent }]}>
                      <MaterialCommunityIcons name="camera-outline" size={14} color={shell.fabText} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                  paddingHorizontal: 8,
                }}
              >
                <Text style={[styles.avatarName, { color: textPrimary }]}>{profile?.userFullName || '—'}</Text>
                {profile?.partnerBadgeEligible ? (
                  <PartnerBadge
                    size={22}
                    accessibilityLabel={tcx('profile_partner_badge_a11y')}
                  />
                ) : null}
              </View>
              <Text style={[styles.avatarHandle, { color: textSecondary }]}>@{profile?.userNickName || '—'}</Text>

              {profile?.verificationStatus === 'verified' && (
                <View
                  style={[
                    styles.verifiedBadge,
                    { backgroundColor: shell.marketCtaPressedBg, borderColor: shell.refreshAccent },
                  ]}
                >
                  <MaterialCommunityIcons name="check-decagram" size={14} color={shell.refreshAccent} />
                  <Text style={[styles.verifiedText, { color: shell.refreshAccent }]}>{tcx('vault_verified_label')}</Text>
                </View>
              )}
            </View>

            {/* ── Stats row ──────────────────────────────────────────────────── */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: textPrimary }]}>{statsCards}</Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>{tcx('profile_stat_cards')}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: textPrimary }]}>{statsContacts}</Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>{tcx('profile_stat_contacts')}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: textPrimary }]}>{creditsBalance}</Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>{tcx('profile_stat_credits_cs')}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: border }]} />
              <View style={[styles.statItem, styles.statItemAirTime]}>
                <VoipAirTimeBadge userId={profile?.uid ?? ''} layout="profile" />
              </View>
            </View>

            {/* ── Bio ────────────────────────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="text-short" size={18} color={accent} />
                <Text style={[styles.cardTitle, { color: textPrimary }]}>{tcx('profile_bio_title')}</Text>
                <Text style={[styles.bioCounter, { color: textSecondary }]}>{editBio.length}/150</Text>
              </View>
              <TextInput
                style={[styles.bioInput, { backgroundColor: inputBg, color: textPrimary, borderColor: border }]}
                value={editBio}
                onChangeText={(t) => setEditBio(t.slice(0, 150))}
                placeholder={tcx('profile_bio_placeholder')}
                placeholderTextColor={textSecondary}
                multiline
                maxLength={150}
                textAlignVertical="top"
                returnKeyType="default"
              />
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: accent }, savingBio && styles.saveBtnDisabled]}
                onPress={saveBio}
                disabled={savingBio}
                activeOpacity={0.82}
              >
                <Text style={[styles.saveBtnText, { color: shell.emptyCtaText }]}>{savingBio ? tcx('common_saving') : tcx('profile_save_bio')}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Nombre completo ─────────────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="account-edit-outline" size={18} color={accent} />
                <Text style={[styles.cardTitle, { color: textPrimary }]}>{tcx('profile_full_name_title')}</Text>
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor: border }]}
                value={editName}
                onChangeText={setEditName}
                placeholder={tcx('profile_full_name_placeholder')}
                placeholderTextColor={textSecondary}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: accent }, savingName && styles.saveBtnDisabled]}
                onPress={saveName}
                disabled={savingName}
                activeOpacity={0.82}
              >
                <Text style={[styles.saveBtnText, { color: shell.emptyCtaText }]}>{savingName ? tcx('common_saving') : tcx('profile_save_name')}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Nickname ──────────────────────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="at" size={18} color={accent} />
                <Text style={[styles.cardTitle, { color: textPrimary }]}>{tcx('profile_nickname_title')}</Text>
                {nicknameLocked && (
                  <View
                    style={[
                      styles.lockChip,
                      { backgroundColor: isDark ? shell.dangerBannerBgDark : shell.dangerBannerBg, borderColor: shell.danger },
                    ]}
                  >
                    <MaterialCommunityIcons name="lock-clock" size={12} color={shell.danger} />
                    <Text style={[styles.lockChipText, { color: shell.danger }]}>{tcx('profile_nickname_locked')}</Text>
                  </View>
                )}
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor: border, opacity: nicknameLocked ? 0.5 : 1 }]}
                value={editNickname}
                onChangeText={setEditNickname}
                placeholder={tcx('profile_nickname_placeholder')}
                placeholderTextColor={textSecondary}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                editable={!nicknameLocked}
              />
              {nicknameLocked && unlock ? (
                <Text style={[styles.hintText, { color: shell.danger }]}>
                  {tcx('profile_nickname_available_on', { date: formatDate(unlock) })}
                </Text>
              ) : (
                <Text style={[styles.hintText, { color: textSecondary }]}>
                  {tcx('profile_nickname_cooldown_hint', { days: String(NICKNAME_COOLDOWN_DAYS) })}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: nicknameLocked ? textSecondary : accent }, savingNickname && styles.saveBtnDisabled]}
                onPress={saveNickname}
                disabled={savingNickname || nicknameLocked}
                activeOpacity={0.82}
              >
                <Text style={[styles.saveBtnText, { color: shell.emptyCtaText }]}>{savingNickname ? tcx('common_saving') : tcx('profile_save_nickname')}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Email — cambio verificado ─────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => {
                  if (isPasswordUser) setEmailSection((s) => !s);
                }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="email-outline" size={18} color={accent} />
                <Text style={[styles.cardTitle, { color: textPrimary }]}>{t('profile_sec_email_title')}</Text>
                {isPasswordUser ? (
                  <MaterialCommunityIcons
                    name={emailSection ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={textSecondary}
                    style={{ marginLeft: 'auto' }}
                  />
                ) : (
                  <View style={[styles.roChip, { backgroundColor: shell.gridCardBg, borderColor: border }]}>
                    <MaterialCommunityIcons name="lock-outline" size={11} color={textSecondary} />
                    <Text style={[styles.roChipText, { color: textSecondary }]}>{t('profile_sec_social_badge')}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={[styles.readonlyField, { backgroundColor: inputBg, borderColor: border }]}>
                <Text style={[styles.readonlyText, { color: textSecondary }]}>{profile?.email || t('profile_sec_not_available')}</Text>
              </View>
              <Text style={[styles.hintText, { color: textSecondary }]}>
                {isPasswordUser
                  ? t('profile_sec_email_hint_password')
                  : t('profile_sec_email_hint_social')}
              </Text>
              {isPasswordUser && emailSection && (
                <View style={styles.pwForm}>
                  <Text style={[styles.inputLabel, { color: textSecondary }]}>{t('profile_sec_new_email')}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor: border }]}
                    value={newEmail}
                    onChangeText={setNewEmail}
                    placeholder="name@example.com"
                    placeholderTextColor={textSecondary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={[styles.inputLabel, { color: textSecondary }]}>{t('profile_sec_current_password')}</Text>
                  <View style={[styles.pwInputWrap, { backgroundColor: inputBg, borderColor: border }]}>
                    <TextInput
                      style={[styles.pwInput, { color: textPrimary }]}
                      value={emailPw}
                      onChangeText={setEmailPw}
                      secureTextEntry={!showEmailPw}
                      placeholder="••••••••"
                      placeholderTextColor={textSecondary}
                    />
                    <TouchableOpacity onPress={() => setShowEmailPw((s) => !s)} accessibilityLabel={t('profile_sec_a11y_toggle_password')}>
                      <MaterialCommunityIcons name={showEmailPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: accent }, savingEmail && styles.saveBtnDisabled]}
                    onPress={requestEmailChange}
                    disabled={savingEmail}
                    activeOpacity={0.82}
                  >
                    <MaterialCommunityIcons name="email-check-outline" size={16} color={shell.emptyCtaText} />
                    <Text style={[styles.saveBtnText, { color: shell.emptyCtaText }]}>
                      {savingEmail ? t('profile_sec_sending') : t('profile_sec_send_verification')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ── Teléfono — solo lectura ───────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="phone-outline" size={18} color={accent} />
                <Text style={[styles.cardTitle, { color: textPrimary }]}>{t('profile_sec_phone_title')}</Text>
                <View style={[styles.roChip, { backgroundColor: shell.gridCardBg, borderColor: border }]}>
                  <MaterialCommunityIcons name="lock-outline" size={11} color={textSecondary} />
                  <Text style={[styles.roChipText, { color: textSecondary }]}>{t('profile_sec_readonly')}</Text>
                </View>
              </View>
              <View style={[styles.readonlyField, { backgroundColor: inputBg, borderColor: border }]}>
                <Text style={[styles.readonlyText, { color: textSecondary }]}>{profile?.phone || t('profile_sec_not_available')}</Text>
              </View>
              <Text style={[styles.hintText, { color: textSecondary }]}>
                {t('profile_sec_phone_ticket_hint')}
              </Text>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: accent }]}
                onPress={openPhoneSupportTicket}
                activeOpacity={0.82}
              >
                <MaterialCommunityIcons name="lifebuoy" size={16} color={shell.emptyCtaText} />
                <Text style={[styles.saveBtnText, { color: shell.emptyCtaText }]}>{t('profile_sec_open_ticket')}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Seguridad Presidencial ────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
              <View style={[styles.cardHeader, { justifyContent: 'space-between' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialCommunityIcons name="shield-lock-outline" size={18} color={accent} />
                  <Text style={[styles.cardTitle, { color: textPrimary }]}>Seguridad Presidencial</Text>
                </View>
                <Switch
                  value={presidentialSecEnabled}
                  onValueChange={togglePresidentialSecurity}
                  trackColor={{ false: border, true: accent }}
                  thumbColor={
                    Platform.OS === 'android'
                      ? presidentialSecEnabled
                        ? shell.emptyCtaText
                        : '#f4f3f4'
                      : undefined
                  }
                />
              </View>
              <Text style={[styles.hintText, { color: textSecondary }]}>
                Protege tu cuenta con biometría (FaceID/Huella) al minimizar la aplicación. Evita bloqueos
                repetitivos mientras navegas dentro de tu cuenta.
              </Text>
            </View>

            {/* ── Contraseña (solo usuarios password) ──────────────────────────── */}
            {isPasswordUser && (
              <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
                <TouchableOpacity
                  style={styles.cardHeader}
                  onPress={() => {
                    setPwSection((s) => !s);
                    if (!pwSection) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="lock-reset" size={18} color={accent} />
                  <Text style={[styles.cardTitle, { color: textPrimary }]}>{t('profile_sec_change_password_section')}</Text>
                  <MaterialCommunityIcons
                    name={pwSection ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={textSecondary}
                    style={{ marginLeft: 'auto' }}
                  />
                </TouchableOpacity>

                {pwSection && (
                  <View style={styles.pwForm}>
                    <Text style={[styles.inputLabel, { color: textSecondary }]}>{t('profile_sec_current_password')}</Text>
                    <View style={[styles.pwInputWrap, { backgroundColor: inputBg, borderColor: border }]}>
                      <TextInput
                        style={[styles.pwInput, { color: textPrimary }]}
                        value={currentPw}
                        onChangeText={setCurrentPw}
                        secureTextEntry={!showCurrentPw}
                        placeholder="••••••••"
                        placeholderTextColor={textSecondary}
                      />
                      <TouchableOpacity onPress={() => setShowCurrentPw((s) => !s)} accessibilityLabel={t('profile_sec_a11y_toggle_password')}>
                        <MaterialCommunityIcons name={showCurrentPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={textSecondary} />
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.inputLabel, { color: textSecondary }]}>{t('profile_sec_new_password')}</Text>
                    <View style={[styles.pwInputWrap, { backgroundColor: inputBg, borderColor: border }]}>
                      <TextInput
                        style={[styles.pwInput, { color: textPrimary }]}
                        value={newPw}
                        onChangeText={setNewPw}
                        secureTextEntry={!showNewPw}
                        placeholder="••••••••"
                        placeholderTextColor={textSecondary}
                      />
                      <TouchableOpacity onPress={() => setShowNewPw((s) => !s)} accessibilityLabel={t('profile_sec_a11y_toggle_password')}>
                        <MaterialCommunityIcons name={showNewPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={textSecondary} />
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.inputLabel, { color: textSecondary }]}>{t('profile_sec_confirm_password')}</Text>
                    <View style={[styles.pwInputWrap, { backgroundColor: inputBg, borderColor: border }]}>
                      <TextInput
                        style={[styles.pwInput, { color: textPrimary }]}
                        value={confirmPw}
                        onChangeText={setConfirmPw}
                        secureTextEntry={!showConfirmPw}
                        placeholder="••••••••"
                        placeholderTextColor={textSecondary}
                      />
                      <TouchableOpacity onPress={() => setShowConfirmPw((s) => !s)} accessibilityLabel={t('profile_sec_a11y_toggle_password')}>
                        <MaterialCommunityIcons name={showConfirmPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={textSecondary} />
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.hintText, { color: textSecondary }]}>
                      {t('profile_sec_password_hint')}
                    </Text>

                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: accent }, savingPw && styles.saveBtnDisabled]}
                      onPress={changePassword}
                      disabled={savingPw}
                      activeOpacity={0.82}
                    >
                      <MaterialCommunityIcons name="lock-check-outline" size={16} color={shell.emptyCtaText} />
                      <Text style={[styles.saveBtnText, { color: shell.emptyCtaText }]}>{savingPw ? t('profile_sec_changing') : t('profile_sec_change_password_section')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Social login note */}
            {!isPasswordUser && (
              <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="google" size={18} color={accent} />
                  <Text style={[styles.cardTitle, { color: textPrimary }]}>{t('profile_sec_social_account_title')}</Text>
                </View>
                <Text style={[styles.hintText, { color: textSecondary }]}>
                  {t('profile_sec_social_account_body', {
                    provider: profile?.authProvider || t('profile_sec_social_provider_fallback'),
                  })}
                </Text>
              </View>
            )}

            {/* Zona de Peligro: Eliminar Cuenta */}
            <View
              style={{
                borderTopWidth: 1,
                borderColor: shell.dangerBannerBorder,
                marginTop: 14,
                paddingTop: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: shell.danger, fontWeight: 'bold', marginBottom: 10, fontSize: 15 }}>
                {t('profile_sec_danger_zone')}
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: shell.danger,
                  borderRadius: 10,
                  paddingVertical: 14,
                  paddingHorizontal: 32,
                  marginTop: 4,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
                onPress={handleDeleteAccount}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="delete" size={18} color={shell.fabText} />
                <Text style={{ color: shell.fabText, fontWeight: 'bold', fontSize: 15 }}>
                  {t('profile_sec_delete_account')}
                </Text>
              </TouchableOpacity>
            </View>
        </LinearGradient>
      </KeyboardAwareScrollView>

    {Platform.OS === 'android' && (
      <Modal
        visible={Boolean(androidPhotoPreviewUri)}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={cancelAndroidPhotoPreview}
      >
        <View style={[styles.photoPreviewBackdrop, { backgroundColor: shell.overlayScrim }]}>
          <View style={[styles.photoPreviewCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.photoPreviewTitle, { color: textPrimary }]}>
              {t('profile_sec_preview_title')}
            </Text>
            <Text style={[styles.photoPreviewSubtitle, { color: textSecondary }]}>
              {t('profile_sec_preview_question')}
            </Text>
            {androidPhotoPreviewUri ? (
              <ExpoImage
                source={{ uri: androidPhotoPreviewUri }}
                style={styles.photoPreviewImage}
                contentFit="contain"
                cachePolicy="none"
              />
            ) : null}
            <View style={styles.photoPreviewActions}>
              <TouchableOpacity
                style={[styles.photoPreviewBtnSecondary, { borderColor: border }]}
                onPress={cancelAndroidPhotoPreview}
                disabled={uploadingPhoto}
                activeOpacity={0.85}
              >
                <Text style={[styles.photoPreviewBtnSecondaryText, { color: textSecondary }]}>
                  {t('common_cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.photoPreviewBtnPrimary, { backgroundColor: accent }]}
                onPress={confirmAndroidPhotoPreview}
                disabled={uploadingPhoto}
                activeOpacity={0.85}
              >
                <Text style={[styles.photoPreviewBtnPrimaryText, { color: shell.emptyCtaText }]}>
                  {t('common_accept')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: {
    fontSize: 15,
  },
  photoPreviewBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  photoPreviewCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  photoPreviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  photoPreviewSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  photoPreviewImage: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 320,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  photoPreviewActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  photoPreviewBtnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPreviewBtnSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
  photoPreviewBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPreviewBtnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 14,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  avatarRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    position: 'relative',
    marginBottom: 4,
  },
  avatarImg: {
    width: 104,
    height: 104,
    borderRadius: 52,
    margin: 3,
  },
  avatarFallback: {
    width: 104,
    height: 104,
    borderRadius: 52,
    margin: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlay: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    margin: 3,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  avatarName: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  avatarHandle: {
    fontSize: 14,
    fontWeight: '500',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 4,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  lockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  lockChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  roChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  roChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  readonlyField: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  readonlyText: {
    fontSize: 15,
  },
  hintText: {
    fontSize: 12,
    lineHeight: 17,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  saveBtnDisabled: {
    opacity: 0.55,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  pwForm: {
    gap: 8,
    marginTop: 6,
  },
  pwInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  pwInput: {
    flex: 1,
    fontSize: 15,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 16,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statItemAirTime: {
    minWidth: 72,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 28,
    borderRadius: 1,
  },
  bioInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  bioCounter: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 'auto',
  },
});
