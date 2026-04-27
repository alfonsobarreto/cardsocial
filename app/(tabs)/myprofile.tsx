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
import { trEsEn, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { ModerationRejectedError, uploadFileWithModeration } from '@/services/moderationApi';
import { listReceivedContacts, listSmartCardsFromDb, syncProfileAvatarUrlToMongo } from '@/services/qrApi';
import { propagateUserIdentityAcrossSmartCards } from '@/services/smartCardsRepo';
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
    KeyboardAvoidingView,
    Linking,
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
import palette from '../theme';

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
  const tr = (es: string, en: string) => trEsEn(es, en, language);
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

  const scrollRef = useRef<ScrollView>(null);

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
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || tr('No se pudo cargar el perfil.', 'Could not load profile.'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      tr('Confirmar Eliminación', 'Confirm Delete'),
      tr(
        'Tu cuenta será desactivada inmediatamente y eliminada de forma permanente en 30 días. Si inicias sesión antes, la eliminación se cancelará. ¿Deseas continuar?',
        'Your account will be deactivated immediately and permanently deleted in 30 days. If you log in before then, deletion will be cancelled. Continue?'
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        {
          text: tr('Sí, eliminar cuenta', 'Yes, delete account'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (!profile) throw new Error('No user');
              const uid = profile.uid;
              const now = new Date();
              const deadline = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
              await updateDoc(doc(db, 'users', uid), {
                pendingDeletion: true,
                deletionRequestedAt: now,
                deletionDeadline: deadline,
              });
              await clearLocalCachesForSignOut(uid);
              await signOut(auth);
            } catch (e) {
              Alert.alert(tr('Error', 'Error'), tr('No se pudo marcar la cuenta para eliminación.', 'Could not mark account for deletion.'));
            }
          },
        },
      ]
    );
  };

  // ── Photo picker ────────────────────────────────────────────────────────────
  const pickPhoto = async () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            tr('Cancelar', 'Cancel'),
            tr('Galería', 'Gallery'),
            tr('Cámara (selfie)', 'Camera (selfie)'),
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
        tr('Cambiar foto', 'Change photo'),
        '',
        [
          { text: tr('Galería', 'Gallery'), onPress: pickFromGallery },
          { text: tr('Cámara', 'Camera'), onPress: pickFromCamera },
          { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        ]
      );
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(tr('Permiso requerido', 'Permission required'), tr('Activa acceso a fotos en Configuración.', 'Enable photo access in Settings.'));
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
      Alert.alert(tr('Permiso requerido', 'Permission required'), tr('Activa acceso a la cámara en Configuración.', 'Enable camera access in Settings.'));
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
        Alert.alert(tr('Foto actualizada', 'Photo updated'), tr('Tu foto de perfil fue guardada correctamente.', 'Your profile photo was saved successfully.'));
      } else {
        Alert.alert(
          tr('Foto subida con pendiente', 'Photo uploaded with pending publish'),
          tr('Se guardo tu archivo, pero aun no hay URL publica para mostrarlo en la app.', 'Your file was stored, but no public URL is available yet for in-app display.')
        );
      }
    } catch (e: any) {
      setLocalPhotoUri(null);
      if (e instanceof ModerationRejectedError) {
        Alert.alert(
          tr('Foto rechazada', 'Photo rejected'),
          tr('La imagen no cumple las políticas de contenido de Card-Social.', 'The image does not meet Card-Social content policies.')
        );
      } else {
        Alert.alert(tr('Error subiendo foto', 'Error uploading photo'), e?.message || tr('Inténtalo de nuevo.', 'Please try again.'));
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
      Alert.alert(tr('Nombre requerido', 'Name required'), tr('El nombre no puede estar vacío.', 'Name cannot be empty.'));
      return;
    }
    if (next === profile.userFullName) {
      Alert.alert(tr('Aviso', 'Notice'), tr('No hay cambios.', 'No changes.'));
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
      Alert.alert(tr('Nombre actualizado', 'Name updated'), tr('Cambios guardados.', 'Changes saved.'));
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || tr('Inténtalo de nuevo.', 'Please try again.'));
    } finally {
      setSavingName(false);
    }
  };

  // ── Save nickname ───────────────────────────────────────────────────────────
  const saveNickname = async () => {
    if (!profile) return;
    const next = editNickname.trim();
    if (!next) {
      Alert.alert(tr('Nickname requerido', 'Nickname required'), tr('Ingresa un nickname.', 'Enter a nickname.'));
      return;
    }
    if (next.toLowerCase() === profile.userNickNameLower) {
      Alert.alert(tr('Aviso', 'Notice'), tr('No hay cambios.', 'No changes.'));
      return;
    }
    if (!/^[a-z0-9._-]{3,24}$/i.test(next)) {
      Alert.alert(
        tr('Nickname inválido', 'Invalid nickname'),
        tr('Solo letras, números, punto, guion. Entre 3 y 24 caracteres.', 'Letters, numbers, dot, dash only. 3–24 chars.')
      );
      return;
    }

    // Check cooldown
    const unlock = nicknameUnlockDate(profile.lastNicknameChange);
    if (unlock && unlock > new Date()) {
      Alert.alert(
        tr('Cambio bloqueado', 'Change locked'),
        tr(`Podrás cambiar tu nickname el ${formatDate(unlock)}.`, `You can change your nickname on ${formatDate(unlock)}.`)
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
        const msg: string = (body as any)?.error || '';
        if (msg.toLowerCase().includes('cooldown')) {
          Alert.alert(tr('Cooldown activo', 'Cooldown active'), tr('Espera hasta la fecha indicada.', 'Wait until the indicated date.'));
        } else if (msg.toLowerCase().includes('taken')) {
          Alert.alert(tr('Nickname en uso', 'Nickname taken'), tr('Ese nickname ya pertenece a otro usuario.', 'That nickname belongs to another user.'));
        } else {
          Alert.alert(tr('No se pudo cambiar', 'Could not change'), msg || tr('Inténtalo de nuevo.', 'Please try again.'));
        }
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
      Alert.alert(tr('Nickname actualizado', 'Nickname updated'), tr('Cambios guardados.', 'Changes saved.'));
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || tr('Inténtalo de nuevo.', 'Please try again.'));
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
      Alert.alert(tr('Listo', 'Done'), tr('Bio actualizada.', 'Bio updated.'));
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || tr('No se pudo guardar.', 'Could not save.'));
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
      Alert.alert(tr('Email inválido', 'Invalid email'), tr('Escribe un email válido.', 'Enter a valid email.'));
      return;
    }
    if (next === current) {
      Alert.alert(tr('Aviso', 'Notice'), tr('Ese ya es tu email actual.', 'That is already your current email.'));
      return;
    }
    if (!emailPw) {
      Alert.alert(tr('Contraseña requerida', 'Password required'), tr('Escribe tu contraseña actual para confirmar.', 'Enter your current password to confirm.'));
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
        tr('Verifica tu nuevo email', 'Verify your new email'),
        tr(
          'Te enviamos un enlace al nuevo correo. El cambio se aplicará cuando confirmes ese enlace.',
          'We sent a link to the new email. The change will apply after you confirm that link.',
        ),
      );
    } catch (e: any) {
      const code = String(e?.code || '');
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        Alert.alert(tr('Contraseña incorrecta', 'Wrong password'), tr('La contraseña actual es incorrecta.', 'Current password is incorrect.'));
      } else if (code === 'auth/email-already-in-use') {
        Alert.alert(tr('Email en uso', 'Email in use'), tr('Ese email ya pertenece a otra cuenta.', 'That email already belongs to another account.'));
      } else if (code === 'auth/requires-recent-login') {
        Alert.alert(tr('Sesión expirada', 'Session expired'), tr('Cierra sesión y vuelve a entrar.', 'Sign out and sign back in.'));
      } else {
        Alert.alert(tr('No se pudo enviar verificación', 'Could not send verification'), e?.message || tr('Inténtalo de nuevo.', 'Please try again.'));
      }
    } finally {
      setSavingEmail(false);
    }
  };

  const openPhoneSupportTicket = async () => {
    const subject = encodeURIComponent('Cambio de teléfono - Card-Social');
    const body = encodeURIComponent(
      `Hola soporte Card-Social,\n\nQuiero solicitar cambio de teléfono en mi cuenta.\n\nUID: ${profile?.uid || ''}\nEmail: ${profile?.email || ''}\nTeléfono actual: ${profile?.phone || ''}\n\nEntiendo que el ticket se resuelve en máximo 3 días hábiles.\n`,
    );
    const url = `mailto:support@cardsocial.me?subject=${subject}&body=${body}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) throw new Error('No mail client');
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        tr('Abrir ticket', 'Open ticket'),
        tr(
          'Escríbenos a support@cardsocial.me. Los cambios de teléfono se resuelven en máximo 3 días hábiles.',
          'Email us at support@cardsocial.me. Phone change requests are resolved within 3 business days.',
        ),
      );
    }
  };

  // ── Change password ─────────────────────────────────────────────────────────
  const changePassword = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) return;

    if (!currentPw || !newPw || !confirmPw) {
      Alert.alert(tr('Campos requeridos', 'Required fields'), tr('Completa todos los campos de contraseña.', 'Fill all password fields.'));
      return;
    }
    if (newPw.length < 8) {
      Alert.alert(tr('Contraseña corta', 'Password too short'), tr('Mínimo 8 caracteres.', 'At least 8 characters.'));
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert(tr('No coincide', 'Mismatch'), tr('Las contraseñas nuevas no coinciden.', 'New passwords do not match.'));
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
      Alert.alert(tr('Contraseña cambiada', 'Password changed'), tr('Tu contraseña fue actualizada correctamente.', 'Your password was updated successfully.'));
    } catch (e: any) {
      const code: string = e?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        Alert.alert(tr('Contraseña incorrecta', 'Wrong password'), tr('La contraseña actual es incorrecta.', 'Current password is incorrect.'));
      } else if (code === 'auth/requires-recent-login') {
        Alert.alert(tr('Sesión expirada', 'Session expired'), tr('Cierra sesión y vuelve a entrar.', 'Sign out and sign back in.'));
      } else {
        Alert.alert(tr('Error', 'Error'), e?.message || tr('Inténtalo de nuevo.', 'Please try again.'));
      }
    } finally {
      setSavingPw(false);
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
        <Text style={[styles.loadingText, { color: textSecondary }]}>{tr('Cargando perfil…', 'Loading profile…')}</Text>
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
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <LinearGradient colors={[...shell.tabShellGradient]} style={{ flex: 1 }}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={tr('Volver', 'Go back')}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={accent} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: textPrimary }]}>{tr('Mi Perfil', 'My Profile')}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.scroll,
              {
                // Separación cómoda entre "Eliminar cuenta" y el tab bar.
                paddingBottom: 56,
              },
            ]}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >

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

              <Text style={[styles.avatarName, { color: textPrimary }]}>{profile?.userFullName || '—'}</Text>
              <Text style={[styles.avatarHandle, { color: textSecondary }]}>@{profile?.userNickName || '—'}</Text>

              {profile?.verificationStatus === 'verified' && (
                <View
                  style={[
                    styles.verifiedBadge,
                    { backgroundColor: shell.marketCtaPressedBg, borderColor: shell.refreshAccent },
                  ]}
                >
                  <MaterialCommunityIcons name="check-decagram" size={14} color={shell.refreshAccent} />
                  <Text style={[styles.verifiedText, { color: shell.refreshAccent }]}>{tr('Verificado', 'Verified')}</Text>
                </View>
              )}
            </View>

            {/* ── Stats row ──────────────────────────────────────────────────── */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: textPrimary }]}>{statsCards}</Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>{tr('Tarjetas', 'Cards')}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: textPrimary }]}>{statsContacts}</Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>{tr('Contactos', 'Contacts')}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: textPrimary }]}>{creditsBalance}</Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>{tr('Créditos CS', 'CS credits')}</Text>
              </View>
            </View>

            {/* ── Bio ────────────────────────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="text-short" size={18} color={accent} />
                <Text style={[styles.cardTitle, { color: textPrimary }]}>{tr('Bio', 'Bio')}</Text>
                <Text style={[styles.bioCounter, { color: textSecondary }]}>{editBio.length}/150</Text>
              </View>
              <TextInput
                style={[styles.bioInput, { backgroundColor: inputBg, color: textPrimary, borderColor: border }]}
                value={editBio}
                onChangeText={(t) => setEditBio(t.slice(0, 150))}
                placeholder={tr('Cuéntale al mundo algo sobre ti…', 'Tell the world something about you…')}
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
                <Text style={[styles.saveBtnText, { color: shell.emptyCtaText }]}>{savingBio ? tr('Guardando…', 'Saving…') : tr('Guardar bio', 'Save bio')}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Nombre completo ─────────────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="account-edit-outline" size={18} color={accent} />
                <Text style={[styles.cardTitle, { color: textPrimary }]}>{tr('Nombre completo', 'Full name')}</Text>
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor: border }]}
                value={editName}
                onChangeText={setEditName}
                placeholder={tr('Tu nombre completo', 'Your full name')}
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
                <Text style={[styles.saveBtnText, { color: shell.emptyCtaText }]}>{savingName ? tr('Guardando…', 'Saving…') : tr('Guardar nombre', 'Save name')}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Nickname ──────────────────────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="at" size={18} color={accent} />
                <Text style={[styles.cardTitle, { color: textPrimary }]}>{tr('Nickname único', 'Unique nickname')}</Text>
                {nicknameLocked && (
                  <View
                    style={[
                      styles.lockChip,
                      { backgroundColor: isDark ? shell.dangerBannerBgDark : shell.dangerBannerBg, borderColor: shell.danger },
                    ]}
                  >
                    <MaterialCommunityIcons name="lock-clock" size={12} color={shell.danger} />
                    <Text style={[styles.lockChipText, { color: shell.danger }]}>{tr('Bloqueado', 'Locked')}</Text>
                  </View>
                )}
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor: border, opacity: nicknameLocked ? 0.5 : 1 }]}
                value={editNickname}
                onChangeText={setEditNickname}
                placeholder={tr('tu_nickname', 'your_nickname')}
                placeholderTextColor={textSecondary}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                editable={!nicknameLocked}
              />
              {nicknameLocked && unlock ? (
                <Text style={[styles.hintText, { color: shell.danger }]}>
                  {tr(`Disponible el ${formatDate(unlock)}`, `Available on ${formatDate(unlock)}`)}
                </Text>
              ) : (
                <Text style={[styles.hintText, { color: textSecondary }]}>
                  {tr(`Cambio permitido cada ${NICKNAME_COOLDOWN_DAYS} días. Solo letras, números, guión, punto.`, `Changes allowed every ${NICKNAME_COOLDOWN_DAYS} days. Letters, numbers, dash, dot only.`)}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: nicknameLocked ? textSecondary : accent }, savingNickname && styles.saveBtnDisabled]}
                onPress={saveNickname}
                disabled={savingNickname || nicknameLocked}
                activeOpacity={0.82}
              >
                <Text style={[styles.saveBtnText, { color: shell.emptyCtaText }]}>{savingNickname ? tr('Guardando…', 'Saving…') : tr('Guardar nickname', 'Save nickname')}</Text>
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
                <Text style={[styles.cardTitle, { color: textPrimary }]}>{tr('Correo electrónico', 'Email')}</Text>
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
                    <Text style={[styles.roChipText, { color: textSecondary }]}>{tr('Social', 'Social')}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={[styles.readonlyField, { backgroundColor: inputBg, borderColor: border }]}>
                <Text style={[styles.readonlyText, { color: textSecondary }]}>{profile?.email || tr('No disponible', 'Not available')}</Text>
              </View>
              <Text style={[styles.hintText, { color: textSecondary }]}>
                {isPasswordUser
                  ? tr('El cambio requiere tu contraseña y confirmar un enlace enviado al nuevo email.', 'Changing email requires your password and confirming a link sent to the new email.')
                  : tr('Tu email se gestiona desde tu proveedor social.', 'Your email is managed by your social provider.')}
              </Text>
              {isPasswordUser && emailSection && (
                <View style={styles.pwForm}>
                  <Text style={[styles.inputLabel, { color: textSecondary }]}>{tr('Nuevo email', 'New email')}</Text>
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
                  <Text style={[styles.inputLabel, { color: textSecondary }]}>{tr('Contraseña actual', 'Current password')}</Text>
                  <View style={[styles.pwInputWrap, { backgroundColor: inputBg, borderColor: border }]}>
                    <TextInput
                      style={[styles.pwInput, { color: textPrimary }]}
                      value={emailPw}
                      onChangeText={setEmailPw}
                      secureTextEntry={!showEmailPw}
                      placeholder="••••••••"
                      placeholderTextColor={textSecondary}
                    />
                    <TouchableOpacity onPress={() => setShowEmailPw((s) => !s)} accessibilityLabel={tr('Mostrar contraseña', 'Toggle password visibility')}>
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
                      {savingEmail ? tr('Enviando…', 'Sending…') : tr('Enviar verificación', 'Send verification')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ── Teléfono — solo lectura ───────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="phone-outline" size={18} color={accent} />
                <Text style={[styles.cardTitle, { color: textPrimary }]}>{tr('Teléfono', 'Phone')}</Text>
                <View style={[styles.roChip, { backgroundColor: shell.gridCardBg, borderColor: border }]}>
                  <MaterialCommunityIcons name="lock-outline" size={11} color={textSecondary} />
                  <Text style={[styles.roChipText, { color: textSecondary }]}>{tr('Solo lectura', 'Read only')}</Text>
                </View>
              </View>
              <View style={[styles.readonlyField, { backgroundColor: inputBg, borderColor: border }]}>
                <Text style={[styles.readonlyText, { color: textSecondary }]}>{profile?.phone || tr('No disponible', 'Not available')}</Text>
              </View>
              <Text style={[styles.hintText, { color: textSecondary }]}>
                {tr('Para cambiar tu teléfono abre un ticket. Se resuelve en máximo 3 días hábiles.', 'To change your phone, open a ticket. It is resolved within 3 business days.')}
              </Text>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: accent }]}
                onPress={openPhoneSupportTicket}
                activeOpacity={0.82}
              >
                <MaterialCommunityIcons name="lifebuoy" size={16} color={shell.emptyCtaText} />
                <Text style={[styles.saveBtnText, { color: shell.emptyCtaText }]}>{tr('Abrir ticket', 'Open ticket')}</Text>
              </TouchableOpacity>
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
                  <Text style={[styles.cardTitle, { color: textPrimary }]}>{tr('Cambiar contraseña', 'Change password')}</Text>
                  <MaterialCommunityIcons
                    name={pwSection ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={textSecondary}
                    style={{ marginLeft: 'auto' }}
                  />
                </TouchableOpacity>

                {pwSection && (
                  <View style={styles.pwForm}>
                    <Text style={[styles.inputLabel, { color: textSecondary }]}>{tr('Contraseña actual', 'Current password')}</Text>
                    <View style={[styles.pwInputWrap, { backgroundColor: inputBg, borderColor: border }]}>
                      <TextInput
                        style={[styles.pwInput, { color: textPrimary }]}
                        value={currentPw}
                        onChangeText={setCurrentPw}
                        secureTextEntry={!showCurrentPw}
                        placeholder="••••••••"
                        placeholderTextColor={textSecondary}
                      />
                      <TouchableOpacity onPress={() => setShowCurrentPw((s) => !s)} accessibilityLabel={tr('Mostrar contraseña', 'Toggle password visibility')}>
                        <MaterialCommunityIcons name={showCurrentPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={textSecondary} />
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.inputLabel, { color: textSecondary }]}>{tr('Nueva contraseña', 'New password')}</Text>
                    <View style={[styles.pwInputWrap, { backgroundColor: inputBg, borderColor: border }]}>
                      <TextInput
                        style={[styles.pwInput, { color: textPrimary }]}
                        value={newPw}
                        onChangeText={setNewPw}
                        secureTextEntry={!showNewPw}
                        placeholder="••••••••"
                        placeholderTextColor={textSecondary}
                      />
                      <TouchableOpacity onPress={() => setShowNewPw((s) => !s)} accessibilityLabel={tr('Mostrar contraseña', 'Toggle password visibility')}>
                        <MaterialCommunityIcons name={showNewPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={textSecondary} />
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.inputLabel, { color: textSecondary }]}>{tr('Confirmar nueva contraseña', 'Confirm new password')}</Text>
                    <View style={[styles.pwInputWrap, { backgroundColor: inputBg, borderColor: border }]}>
                      <TextInput
                        style={[styles.pwInput, { color: textPrimary }]}
                        value={confirmPw}
                        onChangeText={setConfirmPw}
                        secureTextEntry={!showConfirmPw}
                        placeholder="••••••••"
                        placeholderTextColor={textSecondary}
                      />
                      <TouchableOpacity onPress={() => setShowConfirmPw((s) => !s)} accessibilityLabel={tr('Mostrar contraseña', 'Toggle password visibility')}>
                        <MaterialCommunityIcons name={showConfirmPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={textSecondary} />
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.hintText, { color: textSecondary }]}>
                      {tr('Mínimo 8 caracteres. Usa una combinación de letras, números y símbolos.', 'At least 8 characters. Use a mix of letters, numbers and symbols.')}
                    </Text>

                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: accent }, savingPw && styles.saveBtnDisabled]}
                      onPress={changePassword}
                      disabled={savingPw}
                      activeOpacity={0.82}
                    >
                      <MaterialCommunityIcons name="lock-check-outline" size={16} color={shell.emptyCtaText} />
                      <Text style={[styles.saveBtnText, { color: shell.emptyCtaText }]}>{savingPw ? tr('Cambiando…', 'Changing…') : tr('Cambiar contraseña', 'Change password')}</Text>
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
                  <Text style={[styles.cardTitle, { color: textPrimary }]}>{tr('Cuenta social', 'Social account')}</Text>
                </View>
                <Text style={[styles.hintText, { color: textSecondary }]}>
                  {tr(
                    `Tu cuenta usa ${profile?.authProvider || 'un proveedor social'}. La contraseña se gestiona desde ese proveedor.`,
                    `Your account uses ${profile?.authProvider || 'a social provider'}. Password is managed by that provider.`
                  )}
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
                {tr('Zona de Peligro', 'Danger Zone')}
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
                  {tr('Eliminar Cuenta', 'Delete Account')}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </LinearGradient>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>

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
              {tr('Vista previa', 'Preview')}
            </Text>
            <Text style={[styles.photoPreviewSubtitle, { color: textSecondary }]}>
              {tr('¿Quieres usar esta foto de perfil?', 'Use this as your profile photo?')}
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
                  {tr('Cancelar', 'Cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.photoPreviewBtnPrimary, { backgroundColor: accent }]}
                onPress={confirmAndroidPhotoPreview}
                disabled={uploadingPhoto}
                activeOpacity={0.85}
              >
                <Text style={[styles.photoPreviewBtnPrimaryText, { color: shell.emptyCtaText }]}>
                  {tr('Aceptar', 'Accept')}
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
    gap: 24,
    paddingVertical: 8,
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
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
