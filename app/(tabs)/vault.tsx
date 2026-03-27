import DullModeLock from '@/components/DullModeLock';
import LimitReachedModal from '@/components/LimitReachedModal';
import VerificationBadge from '@/components/VerificationBadge';
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import { db } from '@/services/firebaseConfig';
import { useLanguage } from '@/services/language';
import { validateVaultItemCreation } from '@/services/limitService';
import { useLookMode } from '@/services/lookMode';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  InteractionManager,
  Linking,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import NewInfoForm from '../components/NewInfoForm';

let PdfComponent: any = null;
try {
  PdfComponent = require('react-native-pdf').default;
} catch {
  PdfComponent = null;
}

interface Link {
  id: string;
  title: string;
  type: string;
  value: string;
  iconName: string;
  icon?: string;
  isFavorite: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const VAULT_STORAGE_KEY = 'vault_data';

const VaultScreen = () => {
  const router = useRouter();
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const tr = (es: string, en: string) => language === 'en' ? en : es;
  const isNight = resolvedMode === 'noche';
  const vaultTheme = {
    motherBg: isNight ? '#0A2540' : '#E3F2FD',
    primaryText: isNight ? '#FFFFFF' : '#002D4B',
    iconColor: isNight ? '#FFFFFF' : '#002D4B',
    headerDivider: '#D4AF37',
    progressTrack: isNight ? 'rgba(255,255,255,0.18)' : 'rgba(0,45,75,0.18)',
    progressFill: isNight ? '#1EA7FF' : '#54C1FB',
    gridCardBg: isNight ? 'rgba(13,58,86,0.45)' : 'rgba(28,91,185,0.18)',
    iconCircleBg: isNight ? '#0A1A2F' : '#E3F2FD',
    gridCardBorder: isNight ? 'rgba(212,175,55,0.16)' : 'rgba(212,175,55,0.55)',
    secondaryText: isNight ? '#8ED4FF' : '#1EA7FF',
    viewerFallbackText: isNight ? '#F1F7FF' : '#002D4B',
    contextMenuBg: isNight ? '#0F2A3D' : '#FFFFFF',
    contextMenuBorder: isNight ? '#1EA7FF' : '#D4AF37',
    contextMenuText: isNight ? '#F1F7FF' : '#002D4B',
    contextDeleteDivider: isNight ? 'rgba(255,255,255,0.1)' : 'rgba(0,45,75,0.1)',
    floatingCardBg: isNight ? '#12324A' : '#FFFFFF',
    floatingCardBorder: isNight ? '#2B6A91' : '#D8EAF9',
    floatingTitle: isNight ? '#F1F7FF' : '#0A2540',
    floatingBody: isNight ? '#D4EAFB' : '#4A4A4A',
    floatingCopyBg: isNight ? '#0E4466' : '#EAF7FF',
    floatingCopyText: isNight ? '#F1F7FF' : '#0A2540',
    floatingCloseBg: isNight ? '#1D4D6F' : '#E3F2FD',
    floatingCloseText: isNight ? '#F1F7FF' : '#002D4B',
    selectedActionBg: isNight ? '#1C5BB9' : '#54C1FB',
    selectedActionText: '#F0F4F8',
    selectedActionGlow: isNight ? '#1C5BB9' : '#54C1FB',
  };
  const [links, setLinks] = useState<Link[]>([]);
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [editingData, setEditingData] = useState<Link | undefined>(undefined);
  const [profileDisplayName, setProfileDisplayName] = useState('Usuario');
  const [isUserVerified, setIsUserVerified] = useState(false);
  const [limitReachedVisible, setLimitReachedVisible] = useState(false);
  const [limitItemCount, setLimitItemCount] = useState(0);
  const [limitMaxItems, setLimitMaxItems] = useState(10);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [isDullMode, setIsDullMode] = useState(false);
  const [dullModeLockVisible, setDullModeLockVisible] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerItem, setViewerItem] = useState<Link | null>(null);
  const [isDownloadingViewerFile, setIsDownloadingViewerFile] = useState(false);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuItem, setContextMenuItem] = useState<Link | null>(null);
  const [textValueModalVisible, setTextValueModalVisible] = useState(false);
  const [activeTextItem, setActiveTextItem] = useState<Link | null>(null);
  const formSheetTranslateY = useRef(new Animated.Value(0)).current;

  const closeFormModal = () => {
    formSheetTranslateY.stopAnimation();
    formSheetTranslateY.setValue(0);
    setFormModalVisible(false);
    setEditingData(undefined);
    setContextMenuVisible(false);
    setTextValueModalVisible(false);
    setActiveTextItem(null);
  };

  const formModalSwipeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) {
          formSheetTranslateY.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 120 || gesture.vy > 1.15) {
          Animated.timing(formSheetTranslateY, {
            toValue: SCREEN_HEIGHT,
            duration: 170,
            useNativeDriver: true,
          }).start(() => {
            formSheetTranslateY.setValue(0);
            closeFormModal();
          });
          return;
        }

        Animated.spring(formSheetTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(formSheetTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (formModalVisible) {
      formSheetTranslateY.setValue(0);
    }
  }, [formModalVisible, formSheetTranslateY]);

  const sortLinks = (items: Link[]) => {
    return [...items].sort((a, b) => {
      if (a.isFavorite === b.isFavorite) {
        return a.title.localeCompare(b.title);
      }
      return a.isFavorite ? -1 : 1;
    });
  };

  const loadVaultData = async () => {
    // 1. Lectura optimista: mostrar cache local inmediatamente (cero latencia)
    let cachedJson = '';
    try {
      const raw = await AsyncStorage.getItem(VAULT_STORAGE_KEY);
      cachedJson = raw || '';
      const cached = raw ? (JSON.parse(raw) as Link[]) : [];
      if (cached.length > 0) setLinks(sortLinks(cached));
    } catch { /* ignora — la nube actualiza a continuación */ }

    // 2. Refresco silencioso — actualiza estado solo si los datos cambiaron
    try {
      const userId = await getActiveUserId();
      if (userId) {
        const cloudSnapshot = await getDocs(collection(db, 'users', userId, 'links'));
        const cloudItems = cloudSnapshot.docs.map((itemDoc) => ({
          id: itemDoc.id,
          ...itemDoc.data(),
        })) as Link[];

        const cloudJson = JSON.stringify(cloudItems);
        if (cloudJson !== cachedJson) {
          await AsyncStorage.setItem(VAULT_STORAGE_KEY, cloudJson);
          setLinks(sortLinks(cloudItems));
        }
      }
    } catch (cloudError) {
      console.warn('Cloud read failed, keeping cached data:', cloudError);
      Toast.show({
        type: 'error',
        text1: tr('Sin conexión — mostrando datos locales', 'Offline — showing local data'),
        text2: tr('Los cambios se sincronizarán al reconectar', 'Changes will sync when back online'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    }
  };

  const saveVaultData = async (items: Link[]) => {
    await AsyncStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(items));
    setLinks(sortLinks(items));
  };

  useFocusEffect(
    React.useCallback(() => {
      const verifyAccess = async () => {
        // const authenticated = await hardLockCheck('acceso a tu Bóveda de datos');
        // setIsVaultUnlocked(authenticated);
        // if (authenticated) {
        //   await evaluateDullMode();
        //   loadVaultData();
        //   loadProfileMeta();
        // }

        // Bypass authentication and unlock vault directly
        setIsVaultUnlocked(true);
        InteractionManager.runAfterInteractions(() => {
          void (async () => {
            await evaluateDullMode();
            loadVaultData();
            loadProfileMeta();
          })();
        });
      };
      verifyAccess();
    }, [])
  );

  const evaluateDullMode = async (): Promise<boolean> => {
    try {
      const userId = await getActiveUserId();
      if (!userId) {
        setIsDullMode(false);
        return false;
      }

      const licensesSnapshot = await getDocs(collection(db, 'users', userId, 'business_card_licenses'));
      const hasExpiredLicense = licensesSnapshot.docs.some((licenseDoc) => {
        const row = licenseDoc.data() as any;
        const isActive = row?.isActive !== false;
        const expiresTs = Date.parse(String(row?.expiresAt || ''));
        return isActive && Number.isFinite(expiresTs) && expiresTs <= Date.now();
      });

      setIsDullMode(hasExpiredLicense);
      return hasExpiredLicense;
    } catch (error) {
      console.warn('Could not evaluate dull mode status:', error);
      setIsDullMode(false);
      return false;
    }
  };

  const loadProfileMeta = async () => {
    try {
      const userId = await getActiveUserId();
      if (!userId) {
        return;
      }

      const userSnapshot = await getDoc(doc(db, 'users', userId));
      const userData = userSnapshot.data() as any;
      if (!userData) {
        return;
      }

      const displayName = userData.fullName || userData.nickname || userData.firstName || 'Usuario';
      const verified = userData.verificationStatus === 'verified' || Boolean(userData.verificationSelfieFileId);
      setProfileDisplayName(displayName);
      setIsUserVerified(verified);
    } catch (error) {
      console.warn('Could not load profile meta:', error);
    }
  };

  // Borrar item
  const deleteLink = async (link: Link) => {
    try {
      const biometricOk = await hardLockCheck('eliminar datos del Búnker');
      if (!biometricOk) {
        return;
      }

      const updated = links.filter((item) => item.id !== link.id);
      await saveVaultData(updated);

      let cloudOk = false;
      try {
        const userId = await getActiveUserId();
        if (userId) {
          await deleteDoc(doc(db, 'users', userId, 'links', link.id));
          await syncVaultDeleteAcrossCards(userId, link.id);
          cloudOk = true;
        }
      } catch (cloudError) {
        console.warn('Cloud delete failed, kept local cache update:', cloudError);
      }

      Toast.show({
        type: 'success',
        text1: tr('🗑️ Eliminado del Búnker', '🗑️ Removed from Vault'),
        text2: cloudOk
          ? tr(`"${link.title}" sincronizado`, `"${link.title}" synced`)
          : tr(`"${link.title}" eliminado localmente`, `"${link.title}" removed locally`),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    } catch (error) {
      console.error('Error deleting link:', error);
      Toast.show({
        type: 'error',
        text1: tr('❌ No se pudo eliminar', '❌ Could not delete'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    }
  };

  // Toggle favorito
  const toggleFavorite = async (link: Link) => {
    try {
      const biometricOk = await hardLockCheck('marcar favorito en el Búnker');
      if (!biometricOk) {
        return;
      }

      const nextFavorite = !link.isFavorite;
      const updated = links.map((item) =>
        item.id === link.id ? { ...item, isFavorite: nextFavorite } : item
      );
      await saveVaultData(updated);

      try {
        const userId = await getActiveUserId();
        if (!userId) {
          return;
        }

        await updateDoc(doc(db, 'users', userId, 'links', link.id), {
          isFavorite: nextFavorite,
          updatedAt: new Date().toISOString(),
        });
        const updatedItem = updated.find((item) => item.id === link.id);
        if (updatedItem) {
          await syncVaultUpdateAcrossCards(userId, updatedItem);
        }
      } catch {
        // Fallback: if the doc does not exist yet in cloud, create it.
        const userId = await getActiveUserId();
        if (!userId) {
          return;
        }

        const updatedItem = updated.find((item) => item.id === link.id);
        if (updatedItem) {
          await setDoc(doc(db, 'users', userId, 'links', link.id), updatedItem);
          await syncVaultUpdateAcrossCards(userId, updatedItem);
        }
      }

      Toast.show({
        type: 'success',
        text1: nextFavorite
          ? tr('⭐ Agregado a favoritos', '⭐ Added to favorites')
          : tr('Favorito eliminado', 'Removed from favorites'),
        text2: link.title,
        position: 'bottom',
        visibilityTime: 2000,
        autoHide: true,
      });
    } catch (error) {
      console.error('Error updating favorite:', error);
      Toast.show({
        type: 'error',
        text1: tr('❌ No se pudo actualizar favorito', '❌ Could not update favorite'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    }
  };

  const normalizeType = (type: string) => String(type || '').trim().toLowerCase();

  const isImageValue = (value: string) => /\.(jpg|jpeg|png|gif|webp|bmp|heic)$/i.test(value) || value.startsWith('file://') && !value.toLowerCase().endsWith('.pdf');
  const isPdfValue = (value: string) => /\.pdf(\?|$)/i.test(value);

  const isLikelyEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  const isLikelyUrl = (value: string) => {
    const raw = String(value || '').trim();
    return /^https?:\/\//i.test(raw) || /^(www\.)/i.test(raw) || /\.[a-z]{2,}(\/|\?|$)/i.test(raw);
  };

  const triggerSuccessHaptic = () => {
    Vibration.vibrate(18);
  };

  const ensureWebUrl = (raw: string) => {
    const value = String(raw || '').trim();
    if (!value) {
      return '';
    }
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    return `https://${value}`;
  };

  const buildDeepLinkCandidates = (url: string) => {
    const list: string[] = [];
    const safeUrl = ensureWebUrl(url);

    try {
      const parsed = new URL(safeUrl);
      const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();

      if (host.includes('instagram.com')) {
        list.push('instagram://app');
      } else if (host.includes('wa.me') || host.includes('whatsapp.com')) {
        list.push('whatsapp://app');
      } else if (host.includes('youtube.com') || host.includes('youtu.be')) {
        list.push('vnd.youtube://');
      } else if (host.includes('linkedin.com')) {
        list.push('linkedin://');
      } else if (host.includes('x.com') || host.includes('twitter.com')) {
        list.push('twitter://');
      }
    } catch {
      // If parsing fails we still try opening the web URL as fallback.
    }

    list.push(safeUrl);
    return list;
  };

  const openUrlWithNativeFallback = async (rawUrl: string) => {
    const candidates = buildDeepLinkCandidates(rawUrl);

    for (const candidate of candidates) {
      const canOpen = await Linking.canOpenURL(candidate);
      if (canOpen) {
        await Linking.openURL(candidate);
        triggerSuccessHaptic();
        return;
      }
    }

    const browserUrl = ensureWebUrl(rawUrl);
    await Linking.openURL(browserUrl);
    triggerSuccessHaptic();
  };

  const openNativeEmailComposer = async (email: string) => {
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
      Alert.alert(tr('Correo inválido', 'Invalid email'), tr('No hay un correo válido para abrir.', 'No valid email to open.'));
      return;
    }

    const encodedEmail = encodeURIComponent(normalizedEmail);
    const tryOpen = async (primary: string, fallback?: string, fallback2?: string) => {
      const canOpenPrimary = await Linking.canOpenURL(primary);
      if (canOpenPrimary) {
        await Linking.openURL(primary);
        triggerSuccessHaptic();
        return true;
      }
      if (fallback) {
        const canOpenFallback = await Linking.canOpenURL(fallback);
        if (canOpenFallback) {
          await Linking.openURL(fallback);
          triggerSuccessHaptic();
          return true;
        }
      }
      if (fallback2) {
        const canOpenFallback2 = await Linking.canOpenURL(fallback2);
        if (canOpenFallback2) {
          await Linking.openURL(fallback2);
          triggerSuccessHaptic();
          return true;
        }
      }
      return false;
    };

    const mailtoTarget = `mailto:${normalizedEmail}`;
    const gmailTarget = `googlegmail://co?to=${encodedEmail}`;
    const outlookTarget = `ms-outlook://compose?to=${encodedEmail}`;
    const yahooTarget = `ymail://mail/compose?to=${encodedEmail}`;

    if (Platform.OS === 'ios') {
      Alert.alert(
        tr('Selecciona app de correo', 'Choose email app'),
        tr('Elige desde qué app quieres enviar este correo.', 'Choose which app you want to use to send this email.'),
        [
          {
            text: 'Mail',
            onPress: () => {
              void tryOpen(mailtoTarget);
            },
          },
          {
            text: 'Gmail',
            onPress: () => {
              void tryOpen(gmailTarget, mailtoTarget);
            },
          },
          {
            text: 'Outlook',
            onPress: () => {
              void tryOpen(outlookTarget, mailtoTarget);
            },
          },
          {
            text: 'Yahoo Mail',
            onPress: () => {
              void tryOpen(yahooTarget, mailtoTarget);
            },
          },
          {
            text: tr('Cancelar', 'Cancel'),
            style: 'cancel',
          },
        ]
      );
      return;
    }

    const opened = await tryOpen(gmailTarget, outlookTarget, mailtoTarget);
    if (!opened) {
      Alert.alert(tr('App no disponible', 'App not available'), tr('No hay una app de correo disponible en este dispositivo.', 'No email app is available on this device.'));
    }
  };

  const openTextValueModal = (link: Link) => {
    setActiveTextItem(link);
    setTextValueModalVisible(true);
    triggerSuccessHaptic();
  };

  const openDocumentViewer = async (link: Link) => {
    const biometricOk = await hardLockCheck('abrir el visor de documentos del Búnker');
    if (!biometricOk) {
      return;
    }

    if (String(link.value || '').startsWith('mongo-gridfs://')) {
      Alert.alert(tr('Archivo protegido', 'Protected file'), tr('Este archivo usa túnel seguro y requiere endpoint de descarga firmado para vista externa.', 'This file uses secure tunnel and requires signed download endpoint for external viewing.'));
      return;
    }

    setViewerItem(link);
    setViewerVisible(true);
  };

  const handleDownloadFromViewer = async () => {
    if (!viewerItem?.value) {
      return;
    }

    if (viewerItem.value.startsWith('mongo-gridfs://')) {
      Alert.alert(tr('Descarga protegida', 'Protected download'), tr('Falta endpoint de descarga firmada para archivos en túnel seguro.', 'Missing signed download endpoint for secure tunnel files.'));
      return;
    }

    try {
      setIsDownloadingViewerFile(true);
      const fileNameSafe = `${viewerItem.title || 'archivo'}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, '_');
      const extension = isPdfValue(viewerItem.value) ? 'pdf' : 'jpg';
      const targetUri = `${FileSystem.cacheDirectory}${fileNameSafe}.${extension}`;

      await FileSystem.downloadAsync(viewerItem.value, targetUri);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(targetUri, {
          mimeType: isPdfValue(viewerItem.value) ? 'application/pdf' : 'image/jpeg',
          dialogTitle: 'Descargar archivo del Búnker',
        });
      }

      Toast.show({
        type: 'success',
        text1: tr('📥 Descarga lista', '📥 Download ready'),
        text2: tr('Archivo preparado en tu dispositivo', 'File ready on your device'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    } catch (error) {
      console.error('Download from viewer failed:', error);
      Toast.show({
        type: 'error',
        text1: tr('❌ No se pudo descargar', '❌ Download failed'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    } finally {
      setIsDownloadingViewerFile(false);
    }
  };

  const handleCardAction = async (link: Link) => {
    try {
      const rawValue = String(link.value || '').trim();
      const normalizedType = normalizeType(link.type || (link as any).dataType || '');

      if (!rawValue) {
        Alert.alert(tr('⚠️ Error', '⚠️ Error'), tr('El dato está vacío', 'The data is empty'));
        return;
      }

      if (normalizedType === 'email' || isLikelyEmail(rawValue)) {
        await openNativeEmailComposer(rawValue);
        return;
      }

      if (normalizedType === 'enlaces' || isLikelyUrl(rawValue)) {
        await openUrlWithNativeFallback(rawValue);
        return;
      }

      if (
        normalizedType === 'documento' ||
        normalizedType === 'imagen' ||
        isImageValue(rawValue) ||
        isPdfValue(rawValue)
      ) {
        await openDocumentViewer(link);
        triggerSuccessHaptic();
        return;
      }

      if (normalizedType === 'teléfono' || normalizedType === 'telefono') {
        Alert.alert(
          'Ghost-Link Activo',
          'Card-Social protege tu número. Usa Calls/Contacts para llamar sin exponer datos sensibles.',
          [
            {
              text: 'Ir a Calls',
              onPress: () => router.push('/(tabs)/calls' as any),
            },
            {
              text: 'Cerrar',
              style: 'cancel',
            },
          ],
        );
        triggerSuccessHaptic();
        return;
      }

      openTextValueModal(link);
    } catch (error) {
      console.error('Error running action:', error);
      Alert.alert(tr('❌ Error', '❌ Error'), tr('No se pudo ejecutar la acción', 'Could not execute the action'));
    }
  };

  // Renderizar icono (URL o icon name)
  const renderIcon = (link: Link) => {
    if (link.icon?.startsWith('http')) {
      return (
        <Image
          source={{ uri: link.icon }}
          style={styles.favicon}
        />
      );
    }
    return (
      <MaterialCommunityIcons
        name={link.icon as any}
        color={vaultTheme.iconColor}
        size={32}
      />
    );
  };

  const syncVaultUpdateAcrossCards = async (userId: string, updatedItem: Link) => {
    try {
      const cardsSnapshot = await getDocs(collection(db, 'users', userId, 'cards'));
      const nowIso = new Date().toISOString();

      for (const cardDoc of cardsSnapshot.docs) {
        const cardData = cardDoc.data() as any;
        const patch: Record<string, any> = {};

        if (Array.isArray(cardData.items)) {
          let touched = false;
          const nextItems = cardData.items.map((entry: any) => {
            const match = entry?.vaultDataId === updatedItem.id || entry?.id === updatedItem.id;
            if (!match) return entry;
            touched = true;
            return {
              ...entry,
              title: updatedItem.title,
              nameOfData: updatedItem.title,
              value: updatedItem.value,
              type: updatedItem.type,
              icon: updatedItem.icon,
              iconName: updatedItem.iconName,
              isFavorite: updatedItem.isFavorite,
              updatedAt: nowIso,
            };
          });
          if (touched) {
            patch.items = nextItems;
          }
        }

        if (Array.isArray(cardData.cardItems)) {
          let touched = false;
          const nextCardItems = cardData.cardItems.map((entry: any) => {
            const match = entry?.vaultDataId === updatedItem.id || entry?.id === updatedItem.id;
            if (!match) return entry;
            touched = true;
            return {
              ...entry,
              title: updatedItem.title,
              nameOfData: updatedItem.title,
              value: updatedItem.value,
              type: updatedItem.type,
              icon: updatedItem.icon,
              iconName: updatedItem.iconName,
              isFavorite: updatedItem.isFavorite,
              updatedAt: nowIso,
            };
          });
          if (touched) {
            patch.cardItems = nextCardItems;
          }
        }

        if (Object.keys(patch).length > 0) {
          patch.updatedAt = nowIso;
          await updateDoc(doc(db, 'users', userId, 'cards', cardDoc.id), patch);
        }
      }
    } catch (error) {
      console.warn('Vault linked-card update sync failed:', error);
    }
  };

  const syncVaultDeleteAcrossCards = async (userId: string, vaultDataId: string) => {
    try {
      const cardsSnapshot = await getDocs(collection(db, 'users', userId, 'cards'));
      const nowIso = new Date().toISOString();

      for (const cardDoc of cardsSnapshot.docs) {
        const cardData = cardDoc.data() as any;
        const patch: Record<string, any> = {};

        if (Array.isArray(cardData.itemIds)) {
          const nextIds = cardData.itemIds.filter((id: string) => id !== vaultDataId);
          if (nextIds.length !== cardData.itemIds.length) {
            patch.itemIds = nextIds;
          }
        }

        if (Array.isArray(cardData.items)) {
          const nextItems = cardData.items.filter(
            (entry: any) => entry?.vaultDataId !== vaultDataId && entry?.id !== vaultDataId,
          );
          if (nextItems.length !== cardData.items.length) {
            patch.items = nextItems;
          }
        }

        if (Array.isArray(cardData.cardItems)) {
          const nextCardItems = cardData.cardItems.filter(
            (entry: any) => entry?.vaultDataId !== vaultDataId && entry?.id !== vaultDataId,
          );
          if (nextCardItems.length !== cardData.cardItems.length) {
            patch.cardItems = nextCardItems;
          }
        }

        if (Object.keys(patch).length > 0) {
          patch.updatedAt = nowIso;
          await updateDoc(doc(db, 'users', userId, 'cards', cardDoc.id), patch);
        }
      }
    } catch (error) {
      console.warn('Vault linked-card delete sync failed:', error);
    }
  };

  const handleIconLongPress = (link: Link) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setContextMenuItem(link);
    setContextMenuVisible(true);
  };

  const openEditFromContextMenu = async () => {
    if (!contextMenuItem) return;
    const expired = await evaluateDullMode();
    if (expired) {
      setDullModeLockVisible(true);
      return;
    }

    const biometricOk = await hardLockCheck('editar datos del Búnker');
    if (!biometricOk) {
      return;
    }

    setContextMenuVisible(false);
    setEditingData(contextMenuItem);
    setFormModalVisible(true);
  };

  // Renderizar tarjeta en grid
  const renderCard = ({ item }: { item: Link }) => (
    <View style={styles.gridCell}>
      <TouchableOpacity
        style={[
          styles.gridCard,
          isDullMode && styles.cardDullMode,
        ]}
        onPress={() => handleCardAction(item)}
        onLongPress={() => handleIconLongPress(item)}
        delayLongPress={800}
        activeOpacity={0.75}
      >
        <View style={[
          styles.iconBox,
          { backgroundColor: vaultTheme.iconCircleBg },
          isDullMode && { backgroundColor: 'rgba(140,140,140,0.18)' },
        ]}>
          {renderIcon(item)}
          {item.isFavorite ? (
            <View style={styles.favoriteBadge}>
              <MaterialCommunityIcons name="star" color={vaultTheme.iconColor} size={10} />
            </View>
          ) : null}
        </View>

        <Text style={[styles.gridTitle, { color: vaultTheme.primaryText }]} numberOfLines={2}>
          {item.title}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const openCreateVaultItemForm = async () => {
    try {
      const expired = await evaluateDullMode();
      if (expired) {
        setDullModeLockVisible(true);
        return;
      }

      const userId = await getActiveUserId();
      if (!userId) {
        Alert.alert(tr('❌ Error', '❌ Error'), tr('No se pudo identificar al usuario', 'Could not identify user'));
        return;
      }

      const { canCreate, currentCount, maxLimit } = await validateVaultItemCreation(userId);
      
      if (!canCreate) {
        setLimitItemCount(currentCount);
        setLimitMaxItems(maxLimit);
        setLimitReachedVisible(true);
        return;
      }

      setEditingData(undefined);
      setFormModalVisible(true);
    } catch (error) {
      console.error('Error validating vault item creation:', error);
      alert('Error al crear nuevo dato');
    }
  };

  const handleUpgradePress = async () => {
    try {
      Alert.alert(
        'Lujo de Acceso Masivo',
        'La app es Free-to-Use. Para capacidades de negocio, activa anualidad por cada Tarjeta de Negocio desde el flujo de creacion de negocio.',
      );
      setLimitReachedVisible(false);
    } catch (error) {
      console.error('Error triggering purchase flow:', error);
      Alert.alert(tr('Error', 'Error'), tr('No se pudo completar la compra', 'Purchase could not be completed'));
    }
  };

  // Header vacío
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="safe" color="#D4AF37" size={72} />
      <Text style={[styles.emptyTitle, { color: vaultTheme.primaryText }]}>
        {tr('Tu Búnker está listo', 'Your Vault is ready')}
      </Text>
      <Text style={[styles.emptySubtitle, { color: vaultTheme.secondaryText }]}>
        {tr(
          'Agrega tus datos: redes sociales, teléfonos, emails, documentos...',
          'Add your data: social links, phones, emails, documents...'
        )}
      </Text>
      <TouchableOpacity
        style={styles.emptyCtaButton}
        onPress={openCreateVaultItemForm}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="plus" color="#0A1A2F" size={22} />
        <Text style={styles.emptyCtaText}>
          {tr('Agregar primer dato', 'Add first item')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const isUnlimitedVault = limitMaxItems === Infinity;
  const usageProgress = isUnlimitedVault ? 1 : Math.min(links.length / limitMaxItems, 1);

  return (
    <View style={[styles.container, { backgroundColor: vaultTheme.motherBg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: 'transparent', borderBottomColor: vaultTheme.headerDivider }]}>
        <View style={styles.headerCenterBlock}>
          <View style={styles.headerUserRowCentered}>
            <Text style={[styles.headerSubtitle, { color: vaultTheme.primaryText }]}>{profileDisplayName}</Text>
            {isUserVerified ? (
              <View style={styles.headerVerificationWrap}>
                <VerificationBadge compact />
              </View>
            ) : null}
          </View>
          <Text style={styles.vaultCounterLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>
            {isUnlimitedVault
              ? `${links.length} / ∞ ${tr('datos', 'items')}`
              : `${links.length} / ${limitMaxItems} ${tr('datos', 'items')}`}
          </Text>
          {/* Barra de progreso: oculta para usuarios ilimitados */}
          {!isUnlimitedVault ? (
            <View style={[styles.progressTrack, { backgroundColor: vaultTheme.progressTrack }]}>
              <View style={[styles.progressFill, { width: `${usageProgress * 100}%`, backgroundColor: vaultTheme.progressFill }]} />
            </View>
          ) : null}
        </View>
      </View>

      {/* Lista de datos */}
      <FlatList
        data={links}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        numColumns={4}
        removeClippedSubviews={true}
        scrollEventThrottle={16}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContainer}
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      />

      <TouchableOpacity
        style={styles.fabAddButton}
        onPress={openCreateVaultItemForm}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="plus" color={vaultTheme.iconColor} size={30} />
      </TouchableOpacity>

      {/* Modal del formulario */}
      <Modal
        visible={formModalVisible}
        transparent
        animationType="slide"
        onDismiss={() => {
          formSheetTranslateY.stopAnimation();
          formSheetTranslateY.setValue(0);
        }}
        onRequestClose={() => {
          closeFormModal();
        }}
      >
        <View style={styles.formOverlay}>
          <Animated.View
            style={[styles.formSheet, { transform: [{ translateY: formSheetTranslateY }] }]}
            {...formModalSwipeResponder.panHandlers}
          >
            <View style={styles.formDragHandleWrap}>
              <View style={styles.formDragHandle} />
            </View>
            <NewInfoForm
              editingData={editingData}
              onClose={() => {
                closeFormModal();
                setTimeout(() => {
                  void loadVaultData();
                }, 0);
              }}
            />
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={viewerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerVisible(false)}
      >
        <View style={styles.viewerOverlay}>
          <View style={styles.viewerTopBar}>
            <TouchableOpacity
              style={styles.viewerDownloadButton}
              onPress={handleDownloadFromViewer}
              disabled={isDownloadingViewerFile}
            >
              {isDownloadingViewerFile ? (
                <ActivityIndicator size="small" color="#0A2540" />
              ) : (
                <MaterialCommunityIcons name="download" color="#0A2540" size={18} />
              )}
              <Text style={styles.viewerDownloadText}>Descargar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.viewerCloseButton} onPress={() => setViewerVisible(false)}>
              <MaterialCommunityIcons name="close" color="#002D4B" size={28} />
            </TouchableOpacity>
          </View>

          <View style={styles.viewerBody}>
            {viewerItem ? (
              isImageValue(viewerItem.value) ? (
                <ScrollView
                  maximumZoomScale={4}
                  minimumZoomScale={1}
                  contentContainerStyle={styles.viewerZoomContainer}
                  centerContent
                  bounces={false}
                  overScrollMode="never"
                >
                  <Image source={{ uri: viewerItem.value }} style={styles.viewerImage} resizeMode="contain" />
                </ScrollView>
              ) : isPdfValue(viewerItem.value) ? (
                PdfComponent ? (
                  <PdfComponent
                    source={{ uri: viewerItem.value }}
                    style={styles.viewerPdf}
                    minScale={1}
                    maxScale={3}
                    trustAllCerts={false}
                  />
                ) : (
                  <View style={styles.viewerFallback}>
                    <MaterialCommunityIcons name="file-pdf-box" color="#C5A065" size={54} />
                    <Text style={[styles.viewerFallbackText, { color: vaultTheme.viewerFallbackText }]}>
                      {tr(
                        'La previsualizacion PDF no esta disponible en Expo Go. Usa un development build para verla.',
                        'PDF preview is not available in Expo Go. Use a development build to view it.'
                      )}
                    </Text>
                  </View>
                )
              ) : (
                <View style={styles.viewerFallback}>
                  <MaterialCommunityIcons name="file-alert-outline" color="#C5A065" size={54} />
                  <Text style={[styles.viewerFallbackText, { color: vaultTheme.viewerFallbackText }]}>No se pudo previsualizar este archivo.</Text>
                </View>
              )
            ) : null}
          </View>
        </View>
      </Modal>

      <DullModeLock
        visible={dullModeLockVisible}
        onClose={() => setDullModeLockVisible(false)}
        onRequestPremium={() => setDullModeLockVisible(false)}
        lockType="feature"
        itemName="Edición del Búnker"
      />

      <Modal
        visible={contextMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContextMenuVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setContextMenuVisible(false)}>
          <View style={styles.contextOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.contextMenuCard, { backgroundColor: vaultTheme.contextMenuBg, borderColor: vaultTheme.contextMenuBorder }]}>
                <TouchableOpacity
                  style={styles.contextMenuAction}
                  onPress={async () => {
                    if (!contextMenuItem) return;
                    setContextMenuVisible(false);
                    await toggleFavorite(contextMenuItem);
                  }}
                >
                  <MaterialCommunityIcons name="star" color="#C5A065" size={18} />
                  <Text style={[styles.contextMenuActionText, { color: vaultTheme.contextMenuText }]}>Favorito</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.contextMenuAction}
                  onPress={openEditFromContextMenu}
                >
                  <MaterialCommunityIcons name="pencil" color="#1EA7FF" size={18} />
                  <Text style={[styles.contextMenuActionText, { color: vaultTheme.contextMenuText }]}>Editar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.contextMenuAction, styles.contextDeleteAction, { borderTopColor: vaultTheme.contextDeleteDivider }]}
                  onPress={() => {
                    if (!contextMenuItem) return;
                    setContextMenuVisible(false);
                    Alert.alert(
                      '⚠️ Confirmar',
                      `¿Eliminar "${contextMenuItem.title}"?`,
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Eliminar',
                          style: 'destructive',
                          onPress: () => deleteLink(contextMenuItem),
                        },
                      ],
                    );
                  }}
                >
                  <MaterialCommunityIcons name="trash-can" color="#FF6B6B" size={18} />
                  <Text style={[styles.contextMenuActionText, styles.contextDeleteText]}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Limit Reached Modal */}
      <LimitReachedModal
        visible={limitReachedVisible}
        limitType="vaultItems"
        currentCount={limitItemCount}
        maxLimit={limitMaxItems}
        onClose={() => setLimitReachedVisible(false)}
        onUpgradePress={handleUpgradePress}
      />

      <Modal
        visible={textValueModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setTextValueModalVisible(false);
          setActiveTextItem(null);
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            setTextValueModalVisible(false);
            setActiveTextItem(null);
          }}
        >
          <View style={styles.floatingOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.floatingModalCard, { backgroundColor: vaultTheme.floatingCardBg, borderColor: vaultTheme.floatingCardBorder }]}>
                <Text style={[styles.floatingModalTitle, { color: vaultTheme.floatingTitle }]}>{activeTextItem?.title || 'Dato'}</Text>
                <Text style={[styles.floatingModalBody, { color: vaultTheme.floatingBody }]}>{activeTextItem?.value || ''}</Text>

                <View style={styles.floatingActionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.floatingCopyButton,
                      {
                        backgroundColor: vaultTheme.selectedActionBg,
                        shadowColor: vaultTheme.selectedActionGlow,
                        shadowOpacity: 0.2,
                        shadowRadius: 6,
                        elevation: 4,
                      },
                    ]}
                    onPress={async () => {
                      await Clipboard.setStringAsync(String(activeTextItem?.value || ''));
                      triggerSuccessHaptic();
                      Toast.show({
                        type: 'success',
                        text1: tr('📋 Copiado al portapapeles', '📋 Copied to clipboard'),
                        text2: activeTextItem?.title,
                        position: 'bottom',
                        visibilityTime: 1500,
                        autoHide: true,
                      });
                    }}
                  >
                    <MaterialCommunityIcons name="content-copy" color={vaultTheme.selectedActionText} size={16} />
                    <Text style={[styles.floatingCopyText, { color: vaultTheme.selectedActionText }]}>Copiar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.floatingCloseButton, { backgroundColor: vaultTheme.floatingCloseBg }]}
                    onPress={() => {
                      setTextValueModalVisible(false);
                      setActiveTextItem(null);
                    }}
                  >
                    <Text style={[styles.floatingCloseText, { color: vaultTheme.floatingCloseText }]}>Cerrar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // HEADER
  header: {
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  headerCenterBlock: {
    alignItems: 'center',
    width: '100%',
    marginTop: 0,
  },
  headerSubtitle: {
    fontSize: 30,
    color: '#002D4B',
    fontWeight: 'bold',
    marginTop: 2,
  },
  vaultCounterLabel: {
    marginTop: 12,
    width: '100%',
    textAlign: 'center',
    fontSize: 26,
    lineHeight: 32,
    color: '#D4AF37',
    fontWeight: '800',
  },
  progressTrack: {
    width: '100%',
    maxWidth: 330,
    height: 8,
    borderRadius: 999,
    marginTop: 8,
    backgroundColor: 'rgba(241,241,241,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  headerUserRowCentered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  headerVerificationWrap: {
    transform: [{ scale: 1.24 }],
  },
  formOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'flex-end',
  },
  formSheet: {
    height: SCREEN_HEIGHT * 0.94,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  formDragHandleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: '#E3F2FD',
  },
  formDragHandle: {
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(241,241,241,0.55)',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1EA7FF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  // LISTA
  listContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: 120,
  },

  // GRID
  gridCell: {
    width: '25%',
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  gridCard: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    // Sin fondo ni borde — el ícono flota solo
    backgroundColor: 'transparent',
  },
  cardDullMode: {
    opacity: 0.45,
  },
  iconBox: {
    width: 58,
    height: 58,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    // Drop shadow flotante
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 6,
  },
  favoriteBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#C5A065',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favicon: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  gridTitle: {
    marginTop: 8,
    color: '#002D4B',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },

  // ESTADO VACÍO
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#002D4B',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#1EA7FF',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: '80%',
  },
  emptyCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  emptyCtaText: {
    color: '#0A1A2F',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  viewerTopBar: {
    marginTop: 42,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewerDownloadButton: {
    backgroundColor: '#C5A065',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewerDownloadText: {
    color: '#0A2540',
    fontWeight: '700',
    fontSize: 13,
  },
  viewerCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBody: {
    flex: 1,
    padding: 16,
  },
  viewerZoomContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.76,
    borderRadius: 12,
  },
  viewerPdf: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  viewerFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  viewerFallbackText: {
    color: '#002D4B',
    fontWeight: '600',
  },
  fabAddButton: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 7,
  },
  contextOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  contextMenuCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#132F45',
    borderWidth: 1,
    borderColor: '#1EA7FF',
    borderRadius: 16,
    paddingVertical: 6,
  },
  contextMenuAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  contextMenuActionText: {
    color: '#002D4B',
    fontWeight: '700',
    fontSize: 14,
  },
  contextDeleteAction: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  contextDeleteText: {
    color: '#FF6B6B',
  },
  floatingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  floatingModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D8EAF9',
  },
  floatingModalTitle: {
    color: '#0A2540',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 8,
  },
  floatingModalBody: {
    color: '#4A4A4A',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  floatingActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  floatingCopyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#EAF7FF',
  },
  floatingCopyText: {
    color: '#0A2540',
    fontWeight: '700',
    fontSize: 12,
  },
  floatingCloseButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#E3F2FD',
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  floatingCloseText: {
    color: '#002D4B',
    fontWeight: '700',
    fontSize: 12,
  },
  emailClientButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CFE6F8',
    backgroundColor: '#F8FCFF',
    marginBottom: 8,
  },
  emailClientText: {
    color: '#0A2540',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default VaultScreen;