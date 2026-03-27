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
import { auth, db } from '@/services/firebaseConfig';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { ModerationRejectedError, uploadFileWithModeration } from '@/services/moderationApi';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActionSheetIOS,
    Alert,
    Image,
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
  fullName: string;
  firstName: string;
  lastName: string;
  nickname: string;
  nicknameLower: string;
  email: string;
  phone: string;
  photoUrl: string | null;
  verificationStatus: string;
  authProvider: string;
  lastNicknameChange: string | null;
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

function toRenderableImageUri(value: string | null | undefined): string | null {
  const uri = String(value || '').trim();
  if (!uri) return null;
  if (uri.startsWith('https://') || uri.startsWith('http://')) return uri;
  if (uri.startsWith('file://')) return uri;
  if (uri.startsWith('data:image/')) return uri;
  return null;
}

export default function MyProfileScreen() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => (language === 'en' ? en : es);
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const router = useRouter();
  const theme = palette[isDark ? 'dark' : 'light'] as any;

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

  // Password change
  const [pwSection, setPwSection] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

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

      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.data() as any;
      if (!data) return;

      const lastName = String(data.lastName || '').trim();
      const firstName = String(data.firstName || '').trim();
      const fullName = String(data.fullName || `${firstName} ${lastName}`.trim() || 'Usuario').trim();
      const nickname = String(data.nickname || '').trim();
      const lastNicknameChangeRaw = data.lastNicknameChange || data.nicknameChangedAt;
      const lastNicknameChange = lastNicknameChangeRaw?.toDate
        ? lastNicknameChangeRaw.toDate().toISOString()
        : lastNicknameChangeRaw ? String(lastNicknameChangeRaw) : null;

      const p: UserProfile = {
        uid,
        fullName,
        firstName,
        lastName,
        nickname,
        nicknameLower: String(data.nicknameLower || nickname.toLowerCase()),
        email: String(data.email || auth.currentUser?.email || ''),
        phone: String(data.phone || ''),
        photoUrl: toRenderableImageUri(data.photoUrl) || toRenderableImageUri(auth.currentUser?.photoURL) || null,
        verificationStatus: String(data.verificationStatus || 'unverified'),
        authProvider: String(data.authProvider || 'password'),
        lastNicknameChange,
      };

      setProfile(p);
      setEditName(p.fullName);
      setEditNickname(p.nickname);
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || 'No se pudo cargar el perfil.');
    } finally {
      setLoading(false);
    }
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

  const handlePhotoSelected = async (uri: string) => {
    if (!profile) return;
    try {
      setUploadingPhoto(true);
      setLocalPhotoUri(uri);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const optimized = await optimizePhoto(uri);
      const result = await uploadFileWithModeration({
        fileUri: optimized,
        ownerUid: profile.uid,
        label: 'profile_photo',
        fileName: `profile_${profile.uid}_${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      });

      const newPhotoUrl = toRenderableImageUri(result.publicUrl);

      await updateDoc(doc(db, 'users', profile.uid), {
        photoUrl: newPhotoUrl,
        profilePhotoFileId: result.fileId,
        updatedAt: serverTimestamp(),
      });

      setProfile((prev) => prev ? { ...prev, photoUrl: newPhotoUrl } : prev);
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
        Alert.alert(tr('Error subiendo foto', 'Error uploading photo'), e?.message || '');
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Save full name ──────────────────────────────────────────────────────────
  const saveName = async () => {
    if (!profile) return;
    const next = editName.trim();
    if (!next) {
      Alert.alert(tr('Nombre requerido', 'Name required'), tr('El nombre no puede estar vacío.', 'Name cannot be empty.'));
      return;
    }
    if (next === profile.fullName) {
      Alert.alert('', tr('No hay cambios.', 'No changes.'));
      return;
    }
    try {
      setSavingName(true);
      const parts = next.split(/\s+/).filter(Boolean);
      const firstName = parts[0] || profile.firstName;
      const lastName = parts.slice(1).join(' ') || profile.lastName;
      await updateDoc(doc(db, 'users', profile.uid), {
        fullName: next,
        firstName,
        lastName,
        updatedAt: serverTimestamp(),
      });
      setProfile((prev) => prev ? { ...prev, fullName: next, firstName, lastName } : prev);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(tr('Nombre actualizado', 'Name updated'), '');
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || '');
    } finally {
      setSavingName(false);
    }
  };

  // ── Save nickname ───────────────────────────────────────────────────────────
  const saveNickname = async () => {
    if (!profile) return;
    const next = editNickname.trim();
    if (!next) {
      Alert.alert(tr('Nickname requerido', 'Nickname required'), '');
      return;
    }
    if (next.toLowerCase() === profile.nicknameLower) {
      Alert.alert('', tr('No hay cambios.', 'No changes.'));
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
      setProfile((prev) =>
        prev ? { ...prev, nickname: next, nicknameLower: next.toLowerCase(), lastNicknameChange: now } : prev
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(tr('Nickname actualizado', 'Nickname updated'), '');
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || '');
    } finally {
      setSavingNickname(false);
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
        Alert.alert(tr('Error', 'Error'), e?.message || '');
      }
    } finally {
      setSavingPw(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  const bg = isDark ? '#08121E' : '#EAF7FF';
  const card = isDark ? '#0F1E30' : '#FFFFFF';
  const textPrimary = isDark ? '#E8F4FF' : '#0A2540';
  const textSecondary = isDark ? '#7EB5D6' : '#4F7799';
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(13,77,138,0.12)';
  const inputBg = isDark ? '#152030' : '#F5FAFF';
  const accent = '#C5A065';

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: bg }]}>
        <MaterialCommunityIcons name="account-circle-outline" size={48} color={accent} />
        <Text style={[styles.loadingText, { color: textSecondary }]}>{tr('Cargando perfil…', 'Loading profile…')}</Text>
      </View>
    );
  }

  const displayPhoto = localPhotoUri || profile?.photoUrl;
  const isPasswordUser = (profile?.authProvider || 'password') === 'password';
  const unlock = nicknameUnlockDate(profile?.lastNicknameChange ?? null);
  const nicknameLocked = unlock !== null && unlock > new Date();

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <LinearGradient
          colors={isDark ? ['#08121E', '#0D1F33', '#08121E'] : ['#EAF7FF', '#CDEFFF', '#EAF7FF']}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={accent} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: textPrimary }]}>{tr('Mi Perfil', 'My Profile')}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={styles.scroll}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* ── Avatar ─────────────────────────────────────────────────────── */}
            <View style={styles.avatarSection}>
              <TouchableOpacity onPress={pickPhoto} disabled={uploadingPhoto} activeOpacity={0.8}>
                <View style={[styles.avatarRing, { borderColor: accent }]}>
                  {displayPhoto ? (
                    <Image source={{ uri: displayPhoto }} style={styles.avatarImg} />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: inputBg }]}>
                      <MaterialCommunityIcons name="account" size={56} color={accent} />
                    </View>
                  )}

                  {uploadingPhoto ? (
                    <View style={styles.avatarOverlay}>
                      <MaterialCommunityIcons name="loading" size={28} color="#FFFFFF" />
                    </View>
                  ) : (
                    <View style={[styles.avatarEditBadge, { backgroundColor: accent }]}>
                      <MaterialCommunityIcons name="camera-outline" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              <Text style={[styles.avatarName, { color: textPrimary }]}>{profile?.fullName || '—'}</Text>
              <Text style={[styles.avatarHandle, { color: textSecondary }]}>@{profile?.nickname || '—'}</Text>

              {profile?.verificationStatus === 'verified' && (
                <View style={[styles.verifiedBadge, { backgroundColor: isDark ? 'rgba(84,193,251,0.15)' : '#EAF7FF', borderColor: '#54C1FB' }]}>
                  <MaterialCommunityIcons name="check-decagram" size={14} color="#54C1FB" />
                  <Text style={[styles.verifiedText, { color: '#54C1FB' }]}>{tr('Verificado', 'Verified')}</Text>
                </View>
              )}
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
                <Text style={styles.saveBtnText}>{savingName ? tr('Guardando…', 'Saving…') : tr('Guardar nombre', 'Save name')}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Nickname ──────────────────────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="at" size={18} color={accent} />
                <Text style={[styles.cardTitle, { color: textPrimary }]}>{tr('Nickname único', 'Unique nickname')}</Text>
                {nicknameLocked && (
                  <View style={[styles.lockChip, { backgroundColor: isDark ? 'rgba(196,75,85,0.2)' : '#FFF2F3', borderColor: '#C44B55' }]}>
                    <MaterialCommunityIcons name="lock-clock" size={12} color="#C44B55" />
                    <Text style={styles.lockChipText}>{tr('Bloqueado', 'Locked')}</Text>
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
                <Text style={[styles.hintText, { color: '#C44B55' }]}>
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
                <Text style={styles.saveBtnText}>{savingNickname ? tr('Guardando…', 'Saving…') : tr('Guardar nickname', 'Save nickname')}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Email — solo lectura ──────────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="email-outline" size={18} color={accent} />
                <Text style={[styles.cardTitle, { color: textPrimary }]}>{tr('Correo electrónico', 'Email')}</Text>
                <View style={[styles.roChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F0F0F0', borderColor: border }]}>
                  <MaterialCommunityIcons name="lock-outline" size={11} color={textSecondary} />
                  <Text style={[styles.roChipText, { color: textSecondary }]}>{tr('Solo lectura', 'Read only')}</Text>
                </View>
              </View>
              <View style={[styles.readonlyField, { backgroundColor: inputBg, borderColor: border }]}>
                <Text style={[styles.readonlyText, { color: textSecondary }]}>{profile?.email || tr('No disponible', 'Not available')}</Text>
              </View>
              <Text style={[styles.hintText, { color: textSecondary }]}>
                {tr('Para cambiar tu email contacta soporte desde Configuración.', 'To change your email contact support from Settings.')}
              </Text>
            </View>

            {/* ── Teléfono — solo lectura ───────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="phone-outline" size={18} color={accent} />
                <Text style={[styles.cardTitle, { color: textPrimary }]}>{tr('Teléfono', 'Phone')}</Text>
                <View style={[styles.roChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F0F0F0', borderColor: border }]}>
                  <MaterialCommunityIcons name="lock-outline" size={11} color={textSecondary} />
                  <Text style={[styles.roChipText, { color: textSecondary }]}>{tr('Solo lectura', 'Read only')}</Text>
                </View>
              </View>
              <View style={[styles.readonlyField, { backgroundColor: inputBg, borderColor: border }]}>
                <Text style={[styles.readonlyText, { color: textSecondary }]}>{profile?.phone || tr('No disponible', 'Not available')}</Text>
              </View>
              <Text style={[styles.hintText, { color: textSecondary }]}>
                {tr('El teléfono está ligado a tu verificación de identidad y no puede cambiarse.', 'Phone is tied to your identity verification and cannot be changed.')}
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
                      <TouchableOpacity onPress={() => setShowCurrentPw((s) => !s)}>
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
                      <TouchableOpacity onPress={() => setShowNewPw((s) => !s)}>
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
                      <TouchableOpacity onPress={() => setShowConfirmPw((s) => !s)}>
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
                      <MaterialCommunityIcons name="lock-check-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.saveBtnText}>{savingPw ? tr('Cambiando…', 'Changing…') : tr('Cambiar contraseña', 'Change password')}</Text>
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

            <View style={{ height: 60 }} />
          </ScrollView>
        </LinearGradient>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
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
    borderColor: '#FFFFFF',
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
    color: '#C44B55',
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
    color: '#FFFFFF',
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
});
