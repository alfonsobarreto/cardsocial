import DullModeLock from '@/components/DullModeLock';
import LimitReachedModal from '@/components/LimitReachedModal';
import VerificationBadge from '@/components/VerificationBadge';
import { FREE_TIER_POLICY } from '@/constants/freeTierPolicy';
import { isGhostLinkVaultDeletionProtected, isGhostLinkVaultType } from '@/constants/ghostLinkVault';
import { ActionController } from '@/services/ActionController';
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import { getSearchableStringsFromVaultLikeItem, orderByDeepSearchWithExpandedQuery } from '@/services/deepSearch';
import { db } from '@/services/firebaseConfig';
import { readUserFullName, readUserNickName } from '@/services/userIdentityFields';
import { mergeBuiltinGhostLinkIntoVault } from '@/services/ghostLinkVaultBootstrap';
import { trEsEn, useLanguage } from '@/services/language';
import { listBusinessLicenses } from '@/services/businessLicenseService';
import { isPremiumUser, validateVaultItemCreation } from '@/services/limitService';
import { hasUnlimitedAdminUi } from '@/services/roleService';
import { useLookMode } from '@/services/lookMode';
import { buildExpandedMarketQuery } from '@/services/marketSearchSynonyms';
import { resolveVaultMediaUrlForApp } from '@/services/resolveVaultMediaUrl';
import { isVaultDocumentImage, isVaultDocumentPdf } from '@/services/vaultMimeGuards';
import { presentPremiumDataPanel, dismissPremiumDataPanel } from '@/services/premiumDataPanelController';
import { readVaultJsonWithLegacyMigration, vaultStorageKey } from '@/services/userScopedStorage';
import { buildLinkOpenCandidates, ensureWebUrl } from '@/services/mirrorVaultItemOpenPlan';
import { isClassicPhoneVaultType } from '@/services/vaultItemTypeGuards';
import { presentDetectedQrAlert, scanQrFromImageUri } from '@/services/vaultImageQrScan';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    InteractionManager,
    Keyboard,
    Linking,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';
import NewInfoForm from '../components/NewInfoForm';
import { normalizeMaterialCommunityIconName } from '../components/iconNameValidation';
import appPalette from '../theme';

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
  /** Ghost-Link base: no eliminable desde la UI */
  vaultProtected?: boolean;
  isFavorite: boolean;
  createdAt?: string;
  updatedAt?: string;
  vaultMimeType?: string;
}

function vaultItemUpdatedAtMs(item: Link): number {
  const t = Date.parse(String(item.updatedAt || ''));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Tras guardar en local, `loadVaultData` podía leer la nube antes de que terminara `setDoc`
 * y pisar AsyncStorage con el documento viejo. Por ítem gana la copia con `updatedAt` más reciente.
 */
function mergeVaultLinksPreferNewest(localItems: Link[], cloudItems: Link[]): Link[] {
  const byId = new Map<string, Link>();
  for (const c of cloudItems) {
    const id = String(c?.id || '').trim();
    if (id) byId.set(id, c);
  }
  for (const l of localItems) {
    const id = String(l?.id || '').trim();
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, l);
      continue;
    }
    const tLocal = vaultItemUpdatedAtMs(l);
    const tCloud = vaultItemUpdatedAtMs(existing);
    if (tLocal >= tCloud) {
      byId.set(id, l);
    }
  }
  return Array.from(byId.values());
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

const VaultScreen = () => {
  const router = useRouter();
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
  const isNight = resolvedMode === 'noche';
  const vaultTheme = appPalette[isNight ? 'dark' : 'light'];
  const [links, setLinks] = useState<Link[]>([]);
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [formRenderNonce, setFormRenderNonce] = useState(0);
  const [editingData, setEditingData] = useState<Link | undefined>(undefined);
  const [profileDisplayName, setProfileDisplayName] = useState(() => tr('Usuario', 'User'));
  const [searchQuery, setSearchQuery] = useState('');
  const [isUserVerified, setIsUserVerified] = useState(false);
  const [limitReachedVisible, setLimitReachedVisible] = useState(false);
  const [limitItemCount, setLimitItemCount] = useState(0);
  const [limitMaxItems, setLimitMaxItems] = useState<number>(FREE_TIER_POLICY.vaultItems);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [isDullMode, setIsDullMode] = useState(false);
  const [dullModeLockVisible, setDullModeLockVisible] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerItem, setViewerItem] = useState<Link | null>(null);
  const [isDownloadingViewerFile, setIsDownloadingViewerFile] = useState(false);
  const [viewerQrAnalyzing, setViewerQrAnalyzing] = useState(false);
  const viewerQrScanGenRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuItem, setContextMenuItem] = useState<Link | null>(null);
  /** Misma regla que `validateVaultItemCreation`: premium / super_admin → tope ∞ en UI. */
  const [vaultCapUnlimited, setVaultCapUnlimited] = useState(false);
  const formSheetTranslateY = useRef(new Animated.Value(0)).current;

  const closeFormModal = () => {
    formSheetTranslateY.stopAnimation();
    formSheetTranslateY.setValue(0);
    setFormModalVisible(false);
    setEditingData(undefined);
    setContextMenuVisible(false);
  };

  useEffect(() => {
    if (formModalVisible) {
      formSheetTranslateY.setValue(0);
    }
  }, [formModalVisible, formSheetTranslateY]);

  useEffect(() => {
    if (!viewerVisible) {
      setViewerQrAnalyzing(false);
      viewerQrScanGenRef.current += 1;
    }
  }, [viewerVisible]);

  const sortLinks = (items: Link[]) => {
    return [...items].sort((a, b) => {
      if (a.isFavorite === b.isFavorite) {
        return a.title.localeCompare(b.title);
      }
      return a.isFavorite ? -1 : 1;
    });
  };

  const loadVaultData = async () => {
    const userId = await getActiveUserId();
    if (!userId) {
      setLinks([]);
      setVaultCapUnlimited(false);
      return;
    }

    try {
      const [premium, adminUi] = await Promise.all([isPremiumUser(userId), hasUnlimitedAdminUi(userId)]);
      setVaultCapUnlimited(premium || adminUi);
    } catch {
      setVaultCapUnlimited(false);
    }

    // 1. Lectura optimista: mostrar cache local inmediatamente (cero latencia)
    let cachedJsonForCompare = '';
    let withBuiltinLocal: Link[] = [];
    try {
      const raw = await readVaultJsonWithLegacyMigration(userId);
      const cached = raw ? (JSON.parse(raw) as Link[]) : [];
      withBuiltinLocal = (await mergeBuiltinGhostLinkIntoVault(userId, cached)) as Link[];
      cachedJsonForCompare = JSON.stringify(withBuiltinLocal);
      if (withBuiltinLocal.length > 0) {
        setLinks(sortLinks(withBuiltinLocal));
      }
    } catch { /* ignora — la nube actualiza a continuación */ }

    // 2. Refresco silencioso — actualiza estado solo si los datos cambiaron
    try {
      const cloudSnapshot = await getDocs(collection(db, 'users', userId, 'links'));
      const cloudItems = cloudSnapshot.docs.map((itemDoc) => ({
        id: itemDoc.id,
        ...itemDoc.data(),
      })) as Link[];

      const cloudMerged = (await mergeBuiltinGhostLinkIntoVault(userId, cloudItems)) as Link[];
      const merged = mergeVaultLinksPreferNewest(withBuiltinLocal, cloudMerged);
      const mergedJson = JSON.stringify(merged);
      if (mergedJson !== cachedJsonForCompare) {
        await AsyncStorage.setItem(vaultStorageKey(userId), mergedJson);
        setLinks(sortLinks(merged));
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
    const uid = await getActiveUserId();
    if (uid) {
      await AsyncStorage.setItem(vaultStorageKey(uid), JSON.stringify(items));
    }
    setLinks(sortLinks(items));
  };

  useFocusEffect(
    React.useCallback(() => {
      const verifyAccess = async () => {
        const authenticated = await hardLockCheck(tr('acceso a tu Bóveda de datos', 'access to your Vault'));
        setIsVaultUnlocked(authenticated);
        if (authenticated) {
          InteractionManager.runAfterInteractions(() => {
            void (async () => {
              await evaluateDullMode();
              loadVaultData();
              loadProfileMeta();
            })();
          });
        }
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

      /**
       * Migrado a Mongo: las licencias de business cards ahora viven en
       * `business_card_licenses` y se consultan vía el REST
       * `/api/business-card-licenses/` (ver `services/businessLicenseService.ts`).
       * La regla de dull-mode sigue igual: hay licencia expirada activa.
       */
      const licenses = await listBusinessLicenses(userId);
      const hasExpiredLicense = licenses.some((row) => {
        const expiresTs = Date.parse(String(row.expiresAt || ''));
        return row.isActive && Number.isFinite(expiresTs) && expiresTs <= Date.now();
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
      const userData = userSnapshot.data() as Record<string, unknown>;
      if (!userData) {
        return;
      }

      let displayName = readUserFullName(userData);
      const defaultName = tr('Usuario', 'User');
      if (displayName === 'Usuario' || displayName === 'User' || displayName === defaultName) {
        displayName =
          readUserNickName(userData) || String(userData.firstName || '').trim() || defaultName;
      }
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
      if (isGhostLinkVaultDeletionProtected(link.type) || link.vaultProtected) {
        Alert.alert(
          tr('Protegido', 'Protected'),
          tr(
            'Ghost-Link es un servicio base de Card-Social: no se puede eliminar. Puedes editar el título y el icono.',
            'Ghost-Link is a core Card-Social service: it cannot be deleted. You can edit the title and icon.',
          ),
        );
        return;
      }
      const biometricOk = await hardLockCheck(tr('eliminar datos del Búnker', 'delete Bunker data'));
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
      const biometricOk = await hardLockCheck(tr('marcar favorito en el Búnker', 'toggle Bunker favorite'));
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
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {
      // Silently ignore – Vibration/Haptics may not be available on all devices
    }
  };

  /**
   * Misma secuencia que `buildLinkOpenCandidates` (web / modales) pero aquí
   * intentamos apps nativas primero. En iOS hace falta `LSApplicationQueriesSchemes`
   * (ver app.json) y aun así `openURL` puede fallar (URL mínima, build viejo, etc.):
   * usamos try/catch por candidato y caemos al HTTPS.
   * Los modales usan `ActionController.ActionLink` y abren el enlace `https` desde el
   * panel, por eso no chocaban con `vnd.youtube://` al primer toque.
   */
  const openUrlWithNativeFallback = async (rawUrl: string) => {
    const candidates = buildLinkOpenCandidates(rawUrl);

    for (const candidate of candidates) {
      try {
        const canOpen = await Linking.canOpenURL(candidate);
        if (!canOpen) continue;
        await Linking.openURL(candidate);
        triggerSuccessHaptic();
        return;
      } catch {
        // p. ej. iOS: scheme no declarado, o deep link inválido — probar siguiente
        continue;
      }
    }

    const browserUrl = ensureWebUrl(rawUrl);
    try {
      await Linking.openURL(browserUrl);
      triggerSuccessHaptic();
    } catch {
      Toast.show({
        type: 'error',
        text1: tr('❌ Error', '❌ Error'),
        text2: tr('No se pudo abrir el enlace.', 'Could not open the link.'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    }
  };

  const openNativeEmailComposer = async (email: string) => {
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
      Alert.alert(tr('Correo inválido', 'Invalid email'), tr('No hay un correo válido para abrir.', 'No valid email to open.'));
      return;
    }

    const encodedEmail = encodeURIComponent(normalizedEmail);
    const tryOpen = async (...urls: string[]) => {
      for (const url of urls) {
        try {
          await Linking.openURL(url);
          triggerSuccessHaptic();
          return true;
        } catch (_) {
          // This URL scheme failed – try the next one
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

  const openSovereignTextPanel = (link: Link) => {
    const text = String(link.value || '');
    triggerSuccessHaptic();
    presentPremiumDataPanel({
      presentation: 'sovereign-text',
      title: link.title || tr('Texto', 'Text'),
      body: text || '—',
      icon: 'text-box-outline',
      copyText: text,
      actions: [
        { label: tr('Cerrar', 'Close'), variant: 'secondary', onPress: dismissPremiumDataPanel },
      ],
    });
  };

  /** Opción B: descarga el PDF a caché y lo abre con el visor nativo del sistema. */
  const openPdfWithSystemViewer = async (link: Link) => {
    try {
      Toast.show({
        type: 'info',
        text1: tr('Abriendo PDF…', 'Opening PDF…'),
        text2: tr('Descargando para visualización', 'Downloading for viewing'),
        position: 'bottom',
        visibilityTime: 2000,
        autoHide: true,
      });
      const safeName = `${link.title || tr('documento', 'document')}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, '_');
      const targetUri = `${FileSystem.cacheDirectory}${safeName}.pdf`;
      const fileUrl = resolveVaultMediaUrlForApp(link.value) ?? link.value;
      await FileSystem.downloadAsync(fileUrl, targetUri);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(targetUri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: link.title || tr('Documento PDF', 'PDF document'),
        });
      } else {
        // Fallback: abrir URL directamente en el browser
        const fileUrl = resolveVaultMediaUrlForApp(link.value) ?? link.value;
        await Linking.openURL(fileUrl);
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: tr('Error', 'Error'),
        text2: tr('No se pudo abrir el PDF.', 'Could not open the PDF.'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    }
  };

  const openDocumentViewer = async (link: Link) => {
    const biometricOk = await hardLockCheck(
      tr('abrir el visor de documentos del Búnker', 'open the Bunker document viewer'),
    );
    if (!biometricOk) {
      return;
    }

    if (isVaultDocumentPdf(link.value, link.vaultMimeType)) {
      // PDFs: visor nativo del sistema vía expo-sharing (funciona en Expo Go y builds).
      await openPdfWithSystemViewer(link);
      return;
    }

    // Imágenes y otros: modal in-app con ExpoImage.
    setViewerItem(link);
    setViewerVisible(true);
  };

  const handleLongPressViewerImageQr = React.useCallback(async () => {
    if (!viewerItem?.value || !isVaultDocumentImage(viewerItem.value, viewerItem.vaultMimeType)) {
      return;
    }
    const displayUri = resolveVaultMediaUrlForApp(viewerItem.value) ?? viewerItem.value;
    const session = ++viewerQrScanGenRef.current;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      /* noop */
    }
    setViewerQrAnalyzing(true);
    try {
      const payload = await scanQrFromImageUri(displayUri);
      if (session !== viewerQrScanGenRef.current) {
        return;
      }
      if (payload) {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          /* noop */
        }
        presentDetectedQrAlert(payload, tr, () => {
          Toast.show({
            type: 'success',
            text1: tr('Copiado', 'Copied'),
            position: 'bottom',
            visibilityTime: 1800,
            autoHide: true,
          });
        });
      } else {
        try {
          await Haptics.selectionAsync();
        } catch {
          /* noop */
        }
        Toast.show({
          type: 'info',
          text1: tr('Sin código detectado', 'No code detected'),
          text2: tr('No se encontró un QR en esta imagen.', 'No QR was found in this image.'),
          position: 'bottom',
          visibilityTime: 2200,
          autoHide: true,
        });
      }
    } catch {
      if (session === viewerQrScanGenRef.current) {
        Toast.show({
          type: 'info',
          text1: tr('Sin código detectado', 'No code detected'),
          text2: tr('No se pudo analizar la imagen.', 'Could not analyze the image.'),
          position: 'bottom',
          visibilityTime: 2200,
          autoHide: true,
        });
      }
    } finally {
      if (session === viewerQrScanGenRef.current) {
        setViewerQrAnalyzing(false);
      }
    }
  }, [tr, viewerItem]);

  const handleDownloadFromViewer = async () => {
    if (!viewerItem?.value) {
      return;
    }

    try {
      setIsDownloadingViewerFile(true);
      const fileNameSafe = `${viewerItem.title || tr('archivo', 'file')}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, '_');
      const extension = isVaultDocumentPdf(viewerItem.value, viewerItem.vaultMimeType) ? 'pdf' : 'jpg';
      const targetUri = `${FileSystem.cacheDirectory}${fileNameSafe}.${extension}`;

      const fileUrl = resolveVaultMediaUrlForApp(viewerItem.value) ?? viewerItem.value;
      await FileSystem.downloadAsync(fileUrl, targetUri);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(targetUri, {
          mimeType: isVaultDocumentPdf(viewerItem.value, viewerItem.vaultMimeType)
            ? 'application/pdf'
            : 'image/jpeg',
          dialogTitle: tr('Descargar archivo del Búnker', 'Download Bunker file'),
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

      if (isGhostLinkVaultType(link.type)) {
        Alert.alert(
          tr('Ghost-Link', 'Ghost-Link'),
          tr(
            'Este ítem activa una llamada VoIP privada cuando alguien lo usa en tu tarjeta compartida. No guarda número en el Búnker.',
            'This item starts a private VoIP call when someone uses it on your shared card. It does not store a phone number in the Vault.',
          ),
        );
        return;
      }

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
        isVaultDocumentImage(rawValue, link.vaultMimeType) ||
        isVaultDocumentPdf(rawValue, link.vaultMimeType)
      ) {
        await openDocumentViewer(link);
        triggerSuccessHaptic();
        return;
      }

      if (isClassicPhoneVaultType(link.type) || normalizedType === 'teléfono' || normalizedType === 'telefono') {
        await ActionController.ActionTelefono({ value: rawValue });
        triggerSuccessHaptic();
        return;
      }

      openSovereignTextPanel(link);
    } catch (error) {
      console.error('Error running action:', error);
      Alert.alert(tr('❌ Error', '❌ Error'), tr('No se pudo ejecutar la acción', 'Could not execute the action'));
    }
  };

  // Renderizar icono (URL o icon name)
  const renderIcon = (link: Link) => {
    if (link.icon?.startsWith('http')) {
      return (
        <ExpoImage
          source={{ uri: link.icon }}
          style={styles.favicon}
          cachePolicy="disk"
          transition={150}
        />
      );
    }
    return (
      <MaterialCommunityIcons
        name={normalizeMaterialCommunityIconName(link.icon, 'help-circle') as any}
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

    const biometricOk = await hardLockCheck(tr('editar datos del Búnker', 'edit Bunker data'));
    if (!biometricOk) {
      return;
    }

    setContextMenuVisible(false);
    setEditingData(contextMenuItem);
    setFormRenderNonce((prev) => prev + 1);
    setFormModalVisible(true);
  };

  const TYPE_BADGE_MAP: Record<string, { icon: string; label: string; labelEn: string }> = {
    'enlaces': { icon: 'link-variant', label: 'Enlace', labelEn: 'Link' },
    'email': { icon: 'email-outline', label: 'Email', labelEn: 'Email' },
    'teléfono': { icon: 'phone-lock', label: 'Teléfono', labelEn: 'Phone' },
    'telefono': { icon: 'phone-lock', label: 'Teléfono', labelEn: 'Phone' },
    'texto plain': { icon: 'text-short', label: 'Texto', labelEn: 'Text' },
    'documento': { icon: 'file-document-outline', label: 'Doc', labelEn: 'Doc' },
    'ghost-link': { icon: 'phone-in-talk', label: 'Ghost-Link', labelEn: 'Ghost-Link' },
  };

  const filteredLinks = useMemo(() => {
    if (!searchQuery.trim()) {
      return links;
    }
    const qRaw = searchQuery.trim();
    const qExpanded = buildExpandedMarketQuery(qRaw) || qRaw;
    return orderByDeepSearchWithExpandedQuery(links, qExpanded, (l) =>
      getSearchableStringsFromVaultLikeItem({
        id: l.id,
        title: l.title,
        type: l.type,
        value: l.value,
        iconName: l.iconName,
        icon: l.icon,
      }),
    );
  }, [links, searchQuery]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
        },
        header: {
          alignItems: 'stretch',
          paddingHorizontal: 16,
          paddingTop: 18,
          paddingBottom: 24,
          borderBottomWidth: 1,
          borderBottomColor: vaultTheme.headerDivider,
        },
        headerCenterBlock: {
          alignItems: 'center',
          width: '100%',
          marginTop: 0,
        },
        headerSubtitle: {
          fontSize: 30,
          fontWeight: 'bold',
          marginTop: 2,
        },
        vaultCounterLabel: {
          marginTop: 12,
          width: '100%',
          textAlign: 'center',
          fontSize: 26,
          lineHeight: 32,
          fontWeight: '800',
        },
        progressTrack: {
          width: '100%',
          maxWidth: 330,
          height: 8,
          borderRadius: 999,
          marginTop: 8,
          backgroundColor: vaultTheme.progressTrack,
          overflow: 'hidden',
        },
        progressFill: {
          height: '100%',
          borderRadius: 999,
          backgroundColor: vaultTheme.progressFill,
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
          backgroundColor: vaultTheme.overlay,
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
          backgroundColor: 'transparent',
        },
        formDragHandle: {
          width: 52,
          height: 5,
          borderRadius: 999,
          backgroundColor: vaultTheme.gridCardBorder,
        },
        addButton: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: vaultTheme.refreshAccent,
          justifyContent: 'center',
          alignItems: 'center',
          shadowColor: vaultTheme.subtleShadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
          elevation: 3,
        },
        listContainer: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          paddingBottom: 120,
        },
        gridCell: {
          width: '25%',
          paddingHorizontal: 4,
          paddingVertical: 10,
        },
        gridCard: {
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: '100%',
          backgroundColor: 'transparent',
        },
        cardDullMode: {
          opacity: 0.45,
        },
        iconBox: {
          position: 'relative',
          width: 58,
          height: 58,
          borderRadius: 999,
          justifyContent: 'center',
          alignItems: 'center',
          shadowColor: vaultTheme.subtleShadow,
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
          backgroundColor: vaultTheme.ctaAccent,
          alignItems: 'center',
          justifyContent: 'center',
        },
        vaultProtectedBadge: {
          position: 'absolute',
          bottom: -2,
          left: -2,
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: isNight ? 'rgba(0,0,0,0.88)' : 'rgba(28,28,30,0.92)',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: vaultTheme.gridCardBorder,
        },
        favicon: {
          width: 44,
          height: 44,
          borderRadius: 22,
        },
        gridTitle: {
          marginTop: 8,
          fontSize: 11,
          fontWeight: '300',
          textAlign: 'center',
        },
        emptyContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: 60,
        },
        emptyTitle: {
          fontSize: 18,
          fontWeight: '600',
          marginTop: 16,
          textAlign: 'center',
        },
        emptySubtitle: {
          fontSize: 13,
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
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 5,
        },
        emptyCtaText: {
          fontSize: 16,
          fontWeight: '800',
          letterSpacing: 0.5,
        },
        viewerOverlay: {
          flex: 1,
          backgroundColor: vaultTheme.storiesModalOverlayBg,
        },
        viewerQrScanOverlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          gap: 12,
        },
        viewerQrScanLabel: {
          color: '#fff',
          fontSize: 14,
          fontWeight: '700',
          paddingHorizontal: 20,
          textAlign: 'center',
        },
        viewerTopBar: {
          marginTop: 42,
          paddingHorizontal: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 50,
        },
        viewerDownloadButton: {
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        viewerDownloadText: {
          fontWeight: '700',
          fontSize: 13,
        },
        viewerCloseButton: {
          width: 40,
          height: 40,
          borderRadius: 20,
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
        viewerPdfWrapper: {
          flex: 1,
          width: '100%',
          borderRadius: 12,
          overflow: 'hidden',
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
          fontWeight: '600',
        },
        fabAddButton: {
          position: 'absolute',
          right: 18,
          bottom: 24,
          width: 62,
          height: 62,
          borderRadius: 31,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: vaultTheme.ctaAccent,
          shadowColor: vaultTheme.subtleShadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.24,
          shadowRadius: 8,
          elevation: 7,
        },
        contextOverlay: {
          flex: 1,
          backgroundColor: vaultTheme.overlayScrim,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 20,
        },
        contextMenuCard: {
          width: '100%',
          maxWidth: 320,
          borderWidth: 1,
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
          fontWeight: '700',
          fontSize: 14,
        },
        contextDeleteAction: {
          borderTopWidth: 1,
        },
        contextDeleteText: {
          color: vaultTheme.danger,
        },
        emailClientButton: {
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 12,
          borderWidth: 1,
          marginBottom: 8,
        },
        emailClientText: {
          fontWeight: '700',
          fontSize: 13,
        },
        searchRow: {
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 4,
        },
        searchInputWrap: {
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 12,
          borderWidth: 1,
          paddingHorizontal: 12,
          height: 40,
          gap: 8,
        },
        searchInput: {
          flex: 1,
          fontSize: 14,
          paddingVertical: 0,
        },
        typeBadge: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          marginTop: 4,
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 6,
        },
        typeBadgeText: {
          fontSize: 8,
          fontWeight: '300',
        },
      }),
    [vaultTheme, isNight],
  );

  // Renderizar tarjeta en grid
  const renderCard = ({ item }: { item: Link }) => {
    const badge = TYPE_BADGE_MAP[normalizeType(item.type)];
    return (
    <View style={styles.gridCell}>
      <TouchableOpacity
        style={[
          styles.gridCard,
          isDullMode && styles.cardDullMode,
        ]}
        onPress={() => handleCardAction(item)}
        onLongPress={() => handleIconLongPress(item)}
        delayLongPress={450}
        activeOpacity={0.75}
        accessibilityLabel={`${item.title}, ${badge?.label || item.type}`}
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
          {isGhostLinkVaultType(item.type) || item.vaultProtected ? (
            <View style={styles.vaultProtectedBadge} pointerEvents="none">
              <MaterialCommunityIcons name="shield-check" size={12} color={vaultTheme.ctaAccent} />
            </View>
          ) : null}
        </View>

        <Text style={[styles.gridTitle, { color: vaultTheme.primaryText }]} numberOfLines={2}>
          {item.title}
        </Text>
        {badge ? (
          <View style={[styles.typeBadge, { backgroundColor: vaultTheme.typeBadgeBg }]}>
            <MaterialCommunityIcons name={badge.icon as any} size={9} color={vaultTheme.typeBadgeText} />
            <Text style={[styles.typeBadgeText, { color: vaultTheme.typeBadgeText }]}>{tr(badge.label, badge.labelEn)}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
    );
  };

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
      setFormRenderNonce((prev) => prev + 1);
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

  const renderEmptyVaultOnboarding = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="safe" color={vaultTheme.ctaAccent} size={72} />
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
        style={[styles.emptyCtaButton, { backgroundColor: vaultTheme.emptyCtaBg, shadowColor: vaultTheme.emptyCtaBg }]}
        onPress={openCreateVaultItemForm}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="plus" color={vaultTheme.emptyCtaText} size={22} />
        <Text style={[styles.emptyCtaText, { color: vaultTheme.emptyCtaText }]}>
          {tr('Agregar primer dato', 'Add first item')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderVaultListEmpty = () => {
    if (links.length === 0) {
      return renderEmptyVaultOnboarding();
    }
    if (searchQuery.trim()) {
      return (
        <Pressable onPress={Keyboard.dismiss} style={styles.emptyContainer}>
          <MaterialCommunityIcons name="magnify" color={vaultTheme.searchPlaceholder} size={64} />
          <Text style={[styles.emptyTitle, { color: vaultTheme.primaryText }]}>
            {tr('Sin coincidencias', 'No matches')}
          </Text>
          <Text style={[styles.emptySubtitle, { color: vaultTheme.secondaryText }]}>
            {tr(
              'Prueba con otras palabras o sinónimos. También puedes revisar tu conexión.',
              'Try different words or synonyms. You can also check your connection.',
            )}
          </Text>
        </Pressable>
      );
    }
    return renderEmptyVaultOnboarding();
  };

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
          <Text
            style={[styles.vaultCounterLabel, { color: vaultTheme.counterAccent }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.62}
          >
            {vaultCapUnlimited
              ? tr(`${links.length} · Ilimitado`, `${links.length} · Unlimited`)
              : tr(`${links.length} / ${FREE_TIER_POLICY.vaultItems}`, `${links.length} / ${FREE_TIER_POLICY.vaultItems}`)}
          </Text>
          {/* Barra de progreso: oculta para usuarios 50 */}
          {/* No mostrar barra de progreso para admin pochobs */}
        </View>
      </View>

      {/* Search bar (#5) */}
      {links.length > 0 ? (
        <View style={[styles.searchRow, { backgroundColor: vaultTheme.motherBg }]}>
          <View style={[styles.searchInputWrap, { backgroundColor: vaultTheme.searchBg, borderColor: vaultTheme.searchBorder }]}>
            <MaterialCommunityIcons name="magnify" size={18} color={vaultTheme.searchPlaceholder} />
            <TextInput
              style={[styles.searchInput, { color: vaultTheme.searchText }]}
              placeholder={tr(
                'Buscar en todo el dato (título, tipo, enlace, valor…)',
                'Search all fields (title, type, link, value…)'
              )}
              placeholderTextColor={vaultTheme.searchPlaceholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  setSearchQuery('');
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={tr('Limpiar búsqueda', 'Clear search')}
              >
                <MaterialCommunityIcons name="close-circle" size={16} color={vaultTheme.searchPlaceholder} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Lista de datos */}
      <FlatList
        data={filteredLinks}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        numColumns={4}
        removeClippedSubviews={true}
        scrollEventThrottle={16}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={renderVaultListEmpty}
        contentContainerStyle={styles.listContainer}
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadVaultData();
              setRefreshing(false);
            }}
            tintColor={vaultTheme.refreshTint}
            colors={[vaultTheme.refreshTint]}
          />
        }
      />

      <TouchableOpacity
        style={styles.fabAddButton}
        onPress={openCreateVaultItemForm}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="plus" color={vaultTheme.emptyCtaText} size={30} />
      </TouchableOpacity>

      {/* Modal del formulario */}
      <Modal
        visible={formModalVisible}
        transparent={false}
        animationType="slide"
        presentationStyle="fullScreen"
        hardwareAccelerated
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
          >
            <View style={styles.formDragHandleWrap}>
              <View style={styles.formDragHandle} />
            </View>
            <NewInfoForm
              key={`${formRenderNonce}-${editingData?.id ?? 'create'}`}
              editingData={editingData}
              onClose={() => {
                closeFormModal();
                void loadVaultData();
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
          {viewerQrAnalyzing ? (
            <View style={styles.viewerQrScanOverlay} pointerEvents="auto">
              <ActivityIndicator size="large" color={vaultTheme.ctaAccent} />
              <Text style={styles.viewerQrScanLabel}>
                {tr('Analizando imagen…', 'Analyzing image…')}
              </Text>
            </View>
          ) : null}
          <View style={styles.viewerTopBar}>
<TouchableOpacity
              style={[styles.viewerDownloadButton, { backgroundColor: vaultTheme.viewerDownloadBg }]}
              onPress={handleDownloadFromViewer}
              disabled={isDownloadingViewerFile}
            >
              {isDownloadingViewerFile ? (
                <ActivityIndicator size="small" color={vaultTheme.viewerIconTint} />
              ) : (
                <MaterialCommunityIcons name="download" color={vaultTheme.viewerIconTint} size={18} />
              )}
              <Text style={[styles.viewerDownloadText, { color: vaultTheme.viewerDownloadLabel }]}>
                {tr('Descargar', 'Download')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.viewerCloseButton, { backgroundColor: vaultTheme.viewerCloseButtonBg }]}
              onPress={() => setViewerVisible(false)}
            >
              <MaterialCommunityIcons name="close" color={vaultTheme.viewerCloseTint} size={28} />
            </TouchableOpacity>
          </View>

          <View style={styles.viewerBody}>
            {viewerItem ? (
              isVaultDocumentImage(viewerItem.value, viewerItem.vaultMimeType) ? (
                <TouchableWithoutFeedback
                  onLongPress={() => void handleLongPressViewerImageQr()}
                  delayLongPress={1800}
                >
                  <ScrollView
                    maximumZoomScale={6}
                    minimumZoomScale={1}
                    contentContainerStyle={styles.viewerZoomContainer}
                    centerContent
                    bounces={false}
                    overScrollMode="never"
                    bouncesZoom
                  >
                    <ExpoImage
                      source={{ uri: resolveVaultMediaUrlForApp(viewerItem.value) ?? viewerItem.value }}
                      style={styles.viewerImage}
                      contentFit="contain"
                      cachePolicy="disk"
                      transition={200}
                      accessibilityLabel={tr('Documento imagen', 'Document image')}
                    />
                  </ScrollView>
                </TouchableWithoutFeedback>
              ) : isVaultDocumentPdf(viewerItem.value, viewerItem.vaultMimeType) ? (
                <View style={styles.viewerFallback}>
                  <MaterialCommunityIcons name="file-pdf-box" color={vaultTheme.ctaAccent} size={54} />
                  <Text style={[styles.viewerFallbackText, { color: vaultTheme.viewerFallbackText }]}>
                    {tr('Abre el PDF con el botón Descargar.', 'Open the PDF using the Download button.')}
                  </Text>
                </View>
              ) : (
                <View style={styles.viewerFallback}>
                  <MaterialCommunityIcons name="file-alert-outline" color={vaultTheme.ctaAccent} size={54} />
                  <Text style={[styles.viewerFallbackText, { color: vaultTheme.viewerFallbackText }]}>{tr('No se pudo previsualizar este archivo.', 'Could not preview this file.')}</Text>
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
        itemName={tr('Edición del Búnker', 'Vault Editing')}
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
                  <MaterialCommunityIcons name="star" color={vaultTheme.ctaAccent} size={18} />
                  <Text style={[styles.contextMenuActionText, { color: vaultTheme.contextMenuText }]}>{tr('Favorito', 'Favorite')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.contextMenuAction}
                  onPress={openEditFromContextMenu}
                >
                  <MaterialCommunityIcons name="pencil" color={vaultTheme.refreshAccent} size={18} />
                  <Text style={[styles.contextMenuActionText, { color: vaultTheme.contextMenuText }]}>{tr('Editar', 'Edit')}</Text>
                </TouchableOpacity>

                {contextMenuItem &&
                !isGhostLinkVaultDeletionProtected(contextMenuItem.type) &&
                !contextMenuItem.vaultProtected ? (
                  <TouchableOpacity
                    style={[styles.contextMenuAction, styles.contextDeleteAction, { borderTopColor: vaultTheme.contextDeleteDivider }]}
                    onPress={() => {
                      if (!contextMenuItem) return;
                      setContextMenuVisible(false);
                      Alert.alert(
                        tr('⚠️ Confirmar', '⚠️ Confirm'),
                        tr(`¿Eliminar "${contextMenuItem.title}"?`, `Delete "${contextMenuItem.title}"?`),
                        [
                          { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
                          {
                            text: tr('Eliminar', 'Delete'),
                            style: 'destructive',
                            onPress: () => deleteLink(contextMenuItem),
                          },
                        ],
                      );
                    }}
                  >
                    <MaterialCommunityIcons name="trash-can" color={vaultTheme.danger} size={18} />
                    <Text style={[styles.contextMenuActionText, styles.contextDeleteText]}>{tr('Eliminar', 'Delete')}</Text>
                  </TouchableOpacity>
                ) : null}
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

    </View>
  );
};

export default VaultScreen;