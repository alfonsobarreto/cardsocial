import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  Alert,
  Image,
  Linking,
  Dimensions,
  Platform,
  ScrollView,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LongPressGestureHandler, State } from 'react-native-gesture-handler';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { db } from '@/services/firebaseConfig';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { getActiveUserId } from '@/services/authSession';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import NewInfoForm from '../components/NewInfoForm';
import VerificationBadge from '@/components/VerificationBadge';
import { hardLockCheck } from '@/services/biometricAuth';
import LimitReachedModal from '@/components/LimitReachedModal';
import { validateVaultItemCreation } from '@/services/limitService';
import DullModeLock from '@/components/DullModeLock';
import Pdf from 'react-native-pdf';

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
  const [emailPickerVisible, setEmailPickerVisible] = useState(false);
  const [activeEmailItem, setActiveEmailItem] = useState<Link | null>(null);

  const sortLinks = (items: Link[]) => {
    return [...items].sort((a, b) => {
      if (a.isFavorite === b.isFavorite) {
        return a.title.localeCompare(b.title);
      }
      return a.isFavorite ? -1 : 1;
    });
  };

  const loadVaultData = async () => {
    try {
      const userId = await getActiveUserId();
      if (userId) {
        const cloudSnapshot = await getDocs(collection(db, 'users', userId, 'links'));
        const cloudItems = cloudSnapshot.docs.map((itemDoc) => ({
          id: itemDoc.id,
          ...itemDoc.data(),
        })) as Link[];

        await AsyncStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(cloudItems));
        setLinks(sortLinks(cloudItems));
        return;
      }
    } catch (cloudError) {
      console.warn('Cloud read failed, using cache fallback:', cloudError);
    }

    try {
      const raw = await AsyncStorage.getItem(VAULT_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Link[]) : [];
      setLinks(sortLinks(parsed));
    } catch (error) {
      console.error('Error loading vault data:', error);
      Alert.alert('Error', 'No se pudo cargar el Vault');
    }
  };

  const saveVaultData = async (items: Link[]) => {
    await AsyncStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(items));
    setLinks(sortLinks(items));
  };

  useFocusEffect(
    React.useCallback(() => {
      const verifyAccess = async () => {
        const authenticated = await hardLockCheck('acceso a tu Bóveda de datos');
        setIsVaultUnlocked(authenticated);
        if (authenticated) {
          await evaluateDullMode();
          loadVaultData();
          loadProfileMeta();
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

      try {
        const userId = await getActiveUserId();
        if (userId) {
          await deleteDoc(doc(db, 'users', userId, 'links', link.id));
          await syncVaultDeleteAcrossCards(userId, link.id);
        }
      } catch (cloudError) {
        console.warn('Cloud delete failed, kept local cache update:', cloudError);
      }

      Alert.alert('✅ Eliminado', `"${link.title}" fue removido del Vault`);
    } catch (error) {
      console.error('Error deleting link:', error);
      Alert.alert('❌ Error', 'No se pudo eliminar el elemento');
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
    } catch (error) {
      console.error('Error updating favorite:', error);
      Alert.alert('❌ Error', 'No se pudo actualizar favorito');
    }
  };

  const sanitizePhone = (rawPhone: string) => rawPhone.replace(/[^\d+]/g, '');

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

  const openEmailComposerByClient = async (client: 'gmail' | 'outlook' | 'default', email: string) => {
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
      Alert.alert('Correo inválido', 'No hay un correo válido para abrir.');
      return;
    }

    const target =
      client === 'gmail'
        ? `googlegmail://co?to=${encodeURIComponent(normalizedEmail)}`
        : client === 'outlook'
          ? `ms-outlook://compose?to=${encodeURIComponent(normalizedEmail)}`
          : `mailto:${normalizedEmail}`;

    const canOpen = await Linking.canOpenURL(target);
    if (!canOpen) {
      Alert.alert('App no disponible', 'Ese cliente de correo no está instalado en este dispositivo.');
      return;
    }

    await Linking.openURL(target);
    triggerSuccessHaptic();
    setEmailPickerVisible(false);
    setActiveEmailItem(null);
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
      Alert.alert('Archivo protegido', 'Este archivo usa túnel seguro y requiere endpoint de descarga firmado para vista externa.');
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
      Alert.alert('Descarga protegida', 'Falta endpoint de descarga firmada para archivos en túnel seguro.');
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

      Alert.alert('Descarga lista', 'Archivo preparado para guardar en tu dispositivo.');
    } catch (error) {
      console.error('Download from viewer failed:', error);
      Alert.alert('Error', 'No se pudo descargar el archivo.');
    } finally {
      setIsDownloadingViewerFile(false);
    }
  };

  const handleCardAction = async (link: Link) => {
    try {
      const rawValue = String(link.value || '').trim();
      const normalizedType = normalizeType(link.type);

      if (!rawValue) {
        Alert.alert('⚠️ Error', 'El dato está vacío');
        return;
      }

      if (normalizedType === 'enlaces' || isLikelyUrl(rawValue)) {
        await openUrlWithNativeFallback(rawValue);
        return;
      }

      if (normalizedType === 'email' || isLikelyEmail(rawValue)) {
        setActiveEmailItem(link);
        setEmailPickerVisible(true);
        triggerSuccessHaptic();
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
        const phone = sanitizePhone(rawValue);
        Alert.alert(
          'Ghost-Link Activo',
          `Card-Social protege el número (${phone || 'oculto'}). Usa Calls/Contacts para llamar sin exponerlo.`,
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
      Alert.alert('❌ Error', 'No se pudo ejecutar la acción');
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
        color="#1EA7FF"
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

  const handleIconLongPress = (event: any, link: Link) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      Vibration.vibrate(45);
      setContextMenuItem(link);
      setContextMenuVisible(true);
    }
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
        style={[styles.gridCard, isDullMode && styles.cardDullMode]}
        onPress={() => handleCardAction(item)}
        activeOpacity={0.75}
      >
        <LongPressGestureHandler
          minDurationMs={1500}
          onHandlerStateChange={(event) => handleIconLongPress(event, item)}
        >
          <View style={styles.iconBox}>
            {renderIcon(item)}
            {item.isFavorite ? (
              <View style={styles.favoriteBadge}>
                <MaterialCommunityIcons name="star" color="#FFFFFF" size={10} />
              </View>
            ) : null}
          </View>
        </LongPressGestureHandler>

        <Text style={styles.gridTitle} numberOfLines={2}>
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
        Alert.alert('❌ Error', 'No se pudo identificar al usuario');
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
      Alert.alert('Error', 'No se pudo completar la compra');
    }
  };

  // Header vacío
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="folder-outline" color="#1EA7FF" size={64} />
      <Text style={styles.emptyTitle}>Tu Vault está vacío</Text>
      <Text style={styles.emptySubtitle}>
        Toca el botón + para agregar tu primer dato
      </Text>
    </View>
  );

  const usageProgress = Math.min(links.length / 50, 1);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerCenterBlock}>
          <Image source={require('../../assets/images/CS Icon Logo.png')} style={styles.headerLogo} />
          <View style={styles.headerUserRow}>
            <Text style={styles.headerSubtitle}>{profileDisplayName}</Text>
            {isUserVerified ? <VerificationBadge compact /> : null}
          </View>
          <Text style={styles.vaultCounterLabel}>[{links.length}] / 50 DATOS UTILIZADOS</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${usageProgress * 100}%` }]} />
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.scanButton} onPress={() => router.push('/scan' as any)}>
            <MaterialCommunityIcons name="qrcode-scan" color="#0A2540" size={18} />
            <Text style={styles.scanButtonText}>Escanear Nueva Tarjeta</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lista de datos */}
      <FlatList
        data={links}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        numColumns={4}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContainer}
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={styles.fabAddButton}
        onPress={openCreateVaultItemForm}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="plus" color="#0A2540" size={30} />
      </TouchableOpacity>

      {/* Modal del formulario */}
      <Modal
        visible={formModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setFormModalVisible(false);
          setEditingData(undefined);
        }}
      >
        <NewInfoForm
          editingData={editingData}
          onClose={() => {
            setFormModalVisible(false);
            setEditingData(undefined);
            loadVaultData();
          }}
        />
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
              <MaterialCommunityIcons name="close" color="#FFFFFF" size={28} />
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
                >
                  <Image source={{ uri: viewerItem.value }} style={styles.viewerImage} resizeMode="contain" />
                </ScrollView>
              ) : isPdfValue(viewerItem.value) ? (
                <Pdf
                  source={{ uri: viewerItem.value }}
                  style={styles.viewerPdf}
                  minScale={1}
                  maxScale={3}
                  trustAllCerts={false}
                />
              ) : (
                <View style={styles.viewerFallback}>
                  <MaterialCommunityIcons name="file-alert-outline" color="#C5A065" size={54} />
                  <Text style={styles.viewerFallbackText}>No se pudo previsualizar este archivo.</Text>
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
              <View style={styles.contextMenuCard}>
                <TouchableOpacity
                  style={styles.contextMenuAction}
                  onPress={async () => {
                    if (!contextMenuItem) return;
                    setContextMenuVisible(false);
                    await toggleFavorite(contextMenuItem);
                  }}
                >
                  <MaterialCommunityIcons name="star" color="#C5A065" size={18} />
                  <Text style={styles.contextMenuActionText}>Favorito</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.contextMenuAction}
                  onPress={openEditFromContextMenu}
                >
                  <MaterialCommunityIcons name="pencil" color="#1EA7FF" size={18} />
                  <Text style={styles.contextMenuActionText}>Editar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.contextMenuAction, styles.contextDeleteAction]}
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
              <View style={styles.floatingModalCard}>
                <Text style={styles.floatingModalTitle}>{activeTextItem?.title || 'Dato'}</Text>
                <Text style={styles.floatingModalBody}>{activeTextItem?.value || ''}</Text>

                <View style={styles.floatingActionsRow}>
                  <TouchableOpacity
                    style={styles.floatingCopyButton}
                    onPress={async () => {
                      await Clipboard.setStringAsync(String(activeTextItem?.value || ''));
                      triggerSuccessHaptic();
                      Alert.alert('Copiado', 'El contenido fue copiado al portapapeles.');
                    }}
                  >
                    <MaterialCommunityIcons name="content-copy" color="#0A2540" size={16} />
                    <Text style={styles.floatingCopyText}>Copiar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.floatingCloseButton}
                    onPress={() => {
                      setTextValueModalVisible(false);
                      setActiveTextItem(null);
                    }}
                  >
                    <Text style={styles.floatingCloseText}>Cerrar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={emailPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setEmailPickerVisible(false);
          setActiveEmailItem(null);
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            setEmailPickerVisible(false);
            setActiveEmailItem(null);
          }}
        >
          <View style={styles.floatingOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.floatingModalCard}>
                <Text style={styles.floatingModalTitle}>Selecciona app de correo</Text>
                <Text style={styles.floatingModalBody}>{activeEmailItem?.value || ''}</Text>

                <TouchableOpacity
                  style={styles.emailClientButton}
                  onPress={() => void openEmailComposerByClient('gmail', String(activeEmailItem?.value || ''))}
                >
                  <Text style={styles.emailClientText}>Gmail</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.emailClientButton}
                  onPress={() => void openEmailComposerByClient('outlook', String(activeEmailItem?.value || ''))}
                >
                  <Text style={styles.emailClientText}>Outlook</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.emailClientButton}
                  onPress={() => void openEmailComposerByClient('default', String(activeEmailItem?.value || ''))}
                >
                  <Text style={styles.emailClientText}>Mail por defecto</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.floatingCloseButton}
                  onPress={() => {
                    setEmailPickerVisible(false);
                    setActiveEmailItem(null);
                  }}
                >
                  <Text style={styles.floatingCloseText}>Cancelar</Text>
                </TouchableOpacity>
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
    backgroundColor: '#0A2540',
  },

  // HEADER
  header: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
    backgroundColor: '#0A2540',
    borderBottomWidth: 1,
    borderBottomColor: '#1EA7FF',
  },
  headerCenterBlock: {
    alignItems: 'center',
    width: '100%',
  },
  headerLogo: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#1EA7FF',
    marginTop: 4,
  },
  vaultCounterLabel: {
    marginTop: 6,
    fontSize: 12,
    color: '#C5A065',
    fontWeight: '700',
  },
  progressTrack: {
    width: '100%',
    maxWidth: 330,
    height: 8,
    borderRadius: 999,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#C5A065',
  },
  headerUserRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  headerActions: {
    marginTop: 12,
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1EA7FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  scanButtonText: {
    color: '#0A2540',
    fontSize: 11,
    fontWeight: '700',
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
    paddingVertical: 6,
  },
  gridCard: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: 'rgba(197,160,101,0.08)',
    minHeight: 132,
    paddingHorizontal: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1EA7FF',
  },
  cardDullMode: {
    backgroundColor: 'rgba(140,140,140,0.18)',
    borderColor: '#8C8C8C',
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#1EA7FF',
    backgroundColor: 'rgba(10,37,64,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#1EA7FF',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: '80%',
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
    color: '#FFFFFF',
    fontWeight: '600',
  },
  fabAddButton: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#C5A065',
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
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  contextDeleteAction: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
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
    backgroundColor: '#0A2540',
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  floatingCloseText: {
    color: '#FFFFFF',
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