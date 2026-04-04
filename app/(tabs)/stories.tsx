import { getActiveUserId } from '@/services/authSession';
import { mergeBuiltinGhostLinkIntoVault } from '@/services/ghostLinkVaultBootstrap';
import { readVaultJsonWithLegacyMigration } from '@/services/userScopedStorage';
import { hardLockCheck } from '@/services/biometricAuth';
import { hasActiveBusinessLicense } from '@/services/businessLicenseService';
import { getPremiumStoryCost, purchasePremiumStoryWithCredits } from '@/services/creditsService';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import appPalette from '../theme';
import { makeStoriesStyles } from './stories.styles';
import { getMyStoryState, getStoriesHouseAd, listReceivedContacts, listSmartCardsFromDb, setMyStoryState, type HouseAdStory } from '@/services/qrApi';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    Modal,
    RefreshControl,
    Text,
    TouchableOpacity,
    View,
    type ViewStyle,
} from 'react-native';
import { ActionController } from '../../services/ActionController';

type StoryState = 'none' | 'normal' | 'vip';
type StoryDuration = '24h' | '7d' | '30d';
type StoryAssetType = 'image' | 'video' | 'document';

type ViewerFeedItem =
  | {
      kind: 'story';
      uid: string;
      displayName: string;
      cardName: string;
      photoUrl: string | null;
      storyState: StoryState;
      isFavorite: boolean;
      localStory: LocalStory | null;
    }
  | {
      kind: 'ad';
      id: string;
      title: string;
      subtitle: string;
      priceLabel: string;
      locationLabel: string;
      photoUrl: string | null;
      ctaLabel: string;
      ctaUrl: string | null;
    };

type VaultItem = {
  id: string;
  title: string;
  type: string;
  value: string;
  iconName?: string;
  icon?: string;
};

type SmartCard = {
  cardId: string;
  name: string;
  itemIds: string[];
};

type ContactRow = {
  uid: string;
  name: string;
  nickname: string;
  photoUrl: string | null;
  cardName: string;
  storyState: StoryState;
};

type LocalStory = {
  id: string;
  ownerUid: string;
  ownerName: string;
  ownerPhotoUrl: string | null;
  cardId: string;
  cardName: string;
  storyType: StoryAssetType;
  mediaUri: string;
  mediaName: string;
  ctaVaultItemId: string;
  ctaTitle: string;
  ctaValue: string;
  ctaType: string;
  state: StoryState;
  createdAt: string;
  expiresAt: string;
};

type GridStoryItem = {
  uid: string;
  displayName: string;
  cardName: string;
  photoUrl: string | null;
  storyState: StoryState;
  isFavorite: boolean;
  localStory: LocalStory | null;
};

const CONTACT_META_STORAGE_KEY = 'contacts_meta_v2';
const STORIES_STORAGE_PREFIX = 'stories_hub_v1_';
const STORY_EXPOSURE_MS = 30_000;
const FALLBACK_HOUSE_AD: HouseAdStory = {
  title: 'Mi Sueno Mexicano',
  subtitle: 'Placeholder promocional: casa destacada cada 3 historias',
  priceLabel: '$4,450,000 MXN',
  locationLabel: 'Merida, Yucatan',
  photoUrl: null,
  ctaLabel: 'Contactar asesor',
  ctaUrl: null,
  updatedAt: new Date().toISOString(),
};

function StoryVideo({ uri, videoStyle }: { uri: string; videoStyle: ViewStyle }) {
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = false;
    instance.currentTime = 0;
    instance.play();
  });

  return <VideoView style={videoStyle} player={player} allowsFullscreen allowsPictureInPicture={false} />;
}

function getStoriesStorageKey(ownerUid: string) {
  return `${STORIES_STORAGE_PREFIX}${ownerUid}`;
}

export default function StoriesPage() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => language === 'en' ? en : es;
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const shell = appPalette[isNight ? 'dark' : 'light'];
  const styles = useMemo(() => makeStoriesStyles(shell), [shell]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<StoryState>('none');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [ownerUid, setOwnerUid] = useState('');
  const [ownerName, setOwnerName] = useState('Mi Story');
  const [ownerPhotoUrl, setOwnerPhotoUrl] = useState<string | null>(null);

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [favoritesByUid, setFavoritesByUid] = useState<Record<string, boolean>>({});
  const [localStories, setLocalStories] = useState<LocalStory[]>([]);

  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [smartCards, setSmartCards] = useState<SmartCard[]>([]);
  const [houseAd, setHouseAd] = useState<HouseAdStory>(FALLBACK_HOUSE_AD);

  const [createVisible, setCreateVisible] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const exposureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedType, setSelectedType] = useState<StoryAssetType>('image');
  const [selectedCardId, setSelectedCardId] = useState('');
  const [selectedCtaItemId, setSelectedCtaItemId] = useState('');
  const [selectedDuration, setSelectedDuration] = useState<StoryDuration>('24h');
  const [selectedMediaUri, setSelectedMediaUri] = useState('');
  const [selectedMediaName, setSelectedMediaName] = useState('');

  const selectedCard = useMemo(() => smartCards.find((c) => c.cardId === selectedCardId) || null, [smartCards, selectedCardId]);
  const cardCtaOptions = useMemo(() => {
    if (!selectedCard) {
      return [] as VaultItem[];
    }
    const allowed = new Set(selectedCard.itemIds);
    return vaultItems.filter((item) => allowed.has(item.id));
  }, [selectedCard, vaultItems]);

  const selectedCtaItem = useMemo(
    () => cardCtaOptions.find((item) => item.id === selectedCtaItemId) || null,
    [cardCtaOptions, selectedCtaItemId]
  );

  const gridItems = useMemo(() => {
    const storiesByUid = new Map(localStories.map((s) => [s.ownerUid, s]));
    const rows: GridStoryItem[] = contacts.map((row) => ({
      uid: row.uid,
      displayName: row.name,
      cardName: row.cardName,
      photoUrl: row.photoUrl,
      storyState: row.storyState,
      isFavorite: Boolean(favoritesByUid[row.uid]),
      localStory: storiesByUid.get(row.uid) || null,
    }));

    rows.sort((a, b) => {
      const vipDiff = Number(b.storyState === 'vip') - Number(a.storyState === 'vip');
      if (vipDiff !== 0) {
        return vipDiff;
      }
      const favDiff = Number(b.isFavorite) - Number(a.isFavorite);
      if (favDiff !== 0) {
        return favDiff;
      }
      return String(a.cardName).localeCompare(String(b.cardName), 'es', { sensitivity: 'base' });
    });

    return rows;
  }, [contacts, favoritesByUid, localStories]);

  const viewerFeed = useMemo<ViewerFeedItem[]>(() => {
    const storyItems: ViewerFeedItem[] = gridItems
      .filter((item) => item.storyState !== 'none')
      .map((item) => ({
        kind: 'story',
        uid: item.uid,
        displayName: item.displayName,
        cardName: item.cardName,
        photoUrl: item.photoUrl,
        storyState: item.storyState,
        isFavorite: item.isFavorite,
        localStory: item.localStory,
      }));

    const feed: ViewerFeedItem[] = [];
    for (let i = 0; i < storyItems.length; i += 1) {
      feed.push(storyItems[i]);
      if ((i + 1) % 3 === 0) {
        feed.push({
          kind: 'ad',
          id: `mism-${Math.floor((i + 1) / 3)}`,
          title: houseAd.title,
          subtitle: houseAd.subtitle,
          priceLabel: houseAd.priceLabel,
          locationLabel: houseAd.locationLabel,
          photoUrl: houseAd.photoUrl,
          ctaLabel: houseAd.ctaLabel,
          ctaUrl: houseAd.ctaUrl,
        });
      }
    }
    return feed;
  }, [gridItems, houseAd]);

  const selectedViewerItem = useMemo(() => {
    if (!viewerFeed.length) {
      return null;
    }
    return viewerFeed[Math.min(viewerIndex, viewerFeed.length - 1)] || null;
  }, [viewerFeed, viewerIndex]);

  const resetCreateForm = () => {
    setSelectedType('image');
    setSelectedCardId('');
    setSelectedCtaItemId('');
    setSelectedDuration('24h');
    setSelectedMediaUri('');
    setSelectedMediaName('');
  };

  const openCreate = () => {
    resetCreateForm();
    setCreateVisible(true);
  };

  const loadStoriesHub = async () => {
    try {
      setLoading(true);
      const uid = await getActiveUserId();
      if (!uid) {
        setState('none');
        setExpiresAt(null);
        setContacts([]);
        setLocalStories([]);
        return;
      }

      setOwnerUid(uid);
      setOwnerName('Mi Story');
      setOwnerPhotoUrl(null);

      const [contactsResponse, cardsResponse, houseAdResponse] = await Promise.all([
        listReceivedContacts({ ownerUid: uid }),
        listSmartCardsFromDb({ ownerUid: uid }),
        getStoriesHouseAd({ ownerUid: uid }),
      ]);

      const cardsRows = cardsResponse.cards.map((row) => ({
        cardId: row.cardId,
        name: row.name,
        itemIds: row.itemIds,
      }));
      setSmartCards(cardsRows);

      const hubCardId = cardsRows[0]?.cardId;
      const stateResponse = await getMyStoryState({
        ownerUid: uid,
        ...(hubCardId ? { cardId: hubCardId } : {}),
      });
      setState(stateResponse.state);
      setExpiresAt(stateResponse.expiresAt);

      setContacts(
        contactsResponse.contacts.map((row) => ({
          uid: row.uid,
          name: row.name,
          nickname: row.nickname,
          photoUrl: row.photoUrl,
          cardName: row.cardName,
          storyState: row.storyState || 'none',
        }))
      );
      setHouseAd(houseAdResponse.ad || FALLBACK_HOUSE_AD);

      const [metaRaw, vaultRaw, storiesRaw] = await Promise.all([
        AsyncStorage.getItem(CONTACT_META_STORAGE_KEY),
        readVaultJsonWithLegacyMigration(uid),
        AsyncStorage.getItem(getStoriesStorageKey(uid)),
      ]);

      const metaParsed = metaRaw ? (JSON.parse(metaRaw) as Record<string, { isFavorite?: boolean }>) : {};
      const favMap: Record<string, boolean> = {};
      Object.keys(metaParsed).forEach((k) => {
        favMap[k] = Boolean(metaParsed[k]?.isFavorite);
      });
      setFavoritesByUid(favMap);

      const vaultParsed = vaultRaw ? (JSON.parse(vaultRaw) as VaultItem[]) : [];
      const vaultMerged = await mergeBuiltinGhostLinkIntoVault(uid, Array.isArray(vaultParsed) ? vaultParsed : []);
      setVaultItems(Array.isArray(vaultMerged) ? vaultMerged : []);

      const now = Date.now();
      const storiesParsed = storiesRaw ? (JSON.parse(storiesRaw) as LocalStory[]) : [];
      const activeStories = (Array.isArray(storiesParsed) ? storiesParsed : []).filter((story) => {
        const exp = Date.parse(String(story.expiresAt || ''));
        return Number.isFinite(exp) && exp > now;
      });
      setLocalStories(activeStories);
      await AsyncStorage.setItem(getStoriesStorageKey(uid), JSON.stringify(activeStories));

    } catch {
      setState('none');
      setExpiresAt(null);
      setHouseAd(FALLBACK_HOUSE_AD);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStoriesHub();
  }, []);

  useEffect(() => {
    if (!viewerVisible || !viewerFeed.length) {
      if (exposureTimerRef.current) {
        clearTimeout(exposureTimerRef.current);
        exposureTimerRef.current = null;
      }
      return;
    }

    exposureTimerRef.current = setTimeout(() => {
      setViewerIndex((prev) => {
        if (!viewerFeed.length) {
          return 0;
        }
        return (prev + 1) % viewerFeed.length;
      });
    }, STORY_EXPOSURE_MS);

    return () => {
      if (exposureTimerRef.current) {
        clearTimeout(exposureTimerRef.current);
        exposureTimerRef.current = null;
      }
    };
  }, [viewerVisible, viewerIndex, viewerFeed]);

  const publishState = async (nextState: StoryState) => {
    try {
      setSaving(true);
      const uid = await getActiveUserId();
      if (!uid) {
        throw new Error('No se pudo validar tu sesion.');
      }

      const hubCardId = smartCards[0]?.cardId;
      const response = await setMyStoryState({
        ownerUid: uid,
        state: nextState,
        ...(hubCardId ? { cardId: hubCardId } : {}),
      });
      setState(response.state);
      setExpiresAt(response.expiresAt);

      if (nextState === 'vip') {
        Alert.alert(tr('Story VIP activada', 'VIP Story activated'), tr('Tu Story premium estara visible por 7 dias.', 'Your premium Story will be visible for 7 days.'));
      }
    } catch (error: any) {
      Alert.alert(tr('No se pudo actualizar Story', 'Could not update Story'), error?.message || tr('Intenta de nuevo.', 'Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(tr('Permiso requerido', 'Permission required'), tr('Necesitamos acceso a galeria para agregar imagen.', 'We need gallery access to add image.'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];
    setSelectedMediaUri(asset.uri);
    setSelectedMediaName(asset.fileName || 'story-image.jpg');
  };

  const pickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(tr('Permiso requerido', 'Permission required'), tr('Necesitamos acceso a galeria para agregar video.', 'We need gallery access to add video.'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];
    setSelectedMediaUri(asset.uri);
    setSelectedMediaName(asset.fileName || 'story-video.mp4');
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const doc = result.assets[0];
    setSelectedMediaUri(doc.uri);
    setSelectedMediaName(doc.name || 'story-doc');
  };

  const publishStory = async () => {
    try {
      if (!ownerUid) {
        throw new Error('No se pudo validar sesion.');
      }
      if (!selectedCard) {
        Alert.alert(tr('Tarjeta requerida', 'Card required'), tr('Selecciona la tarjeta emisora para la historia.', 'Select the source card for the story.'));
        return;
      }
      if (!selectedMediaUri) {
        Alert.alert(tr('Contenido requerido', 'Content required'), tr('Debes agregar imagen o documento.', 'You must add image or document.'));
        return;
      }
      if (!selectedCtaItem) {
        Alert.alert(tr('CTA requerido', 'CTA required'), tr('Selecciona un CTA de los datos de esa tarjeta.', 'Select a CTA from that card data.'));
        return;
      }

      const now = Date.now();
      const ttlMs =
        selectedDuration === '30d'
          ? 30 * 24 * 60 * 60 * 1000
          : selectedDuration === '7d'
            ? 7 * 24 * 60 * 60 * 1000
            : 24 * 60 * 60 * 1000;
      const nextState: StoryState = selectedDuration === '24h' ? 'normal' : 'vip';
      const ctaTypeLower = String(selectedCtaItem.type || '').toLowerCase();
      const ctaActionLabel =
        ctaTypeLower.includes('pdf') || ctaTypeLower.includes('documento')
          ? 'Ver PDF'
          : ctaTypeLower.includes('map')
            ? 'Ir a Ubicación'
            : ctaTypeLower.includes('whatsapp')
              ? 'Contactar WhatsApp'
              : 'Contacto Directo';

      if (selectedDuration === '7d' || selectedDuration === '30d') {
        const licensed = await hasActiveBusinessLicense(ownerUid, selectedCard.cardId);
        if (!licensed) {
          Alert.alert(
            'Licencia anual requerida',
            'Solo tarjetas de negocio con anualidad activa pueden publicar historias CTA de 7-30 dias.',
          );
          return;
        }
      }

      const story: LocalStory = {
        id: `${now}`,
        ownerUid,
        ownerName,
        ownerPhotoUrl,
        cardId: selectedCard.cardId,
        cardName: selectedCard.name,
        storyType: selectedType,
        mediaUri: selectedMediaUri,
        mediaName:
          selectedMediaName ||
          (selectedType === 'image' ? 'story-image' : selectedType === 'video' ? 'story-video' : 'story-document'),
        ctaVaultItemId: selectedCtaItem.id,
        ctaTitle: ctaActionLabel,
        ctaValue: selectedCtaItem.value,
        ctaType: selectedCtaItem.type,
        state: nextState,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlMs).toISOString(),
      };

      const nextStories = [story, ...localStories.filter((s) => s.ownerUid !== ownerUid)];
      setLocalStories(nextStories);
      await AsyncStorage.setItem(getStoriesStorageKey(ownerUid), JSON.stringify(nextStories));

      // Deduct credits for premium durations
      if (selectedDuration === '7d' || selectedDuration === '30d') {
        try {
          const creditDeducted = await purchasePremiumStoryWithCredits(ownerUid, selectedDuration);
          if (!creditDeducted) {
            // Revert story if credit deduction failed
            const revertedStories = localStories.filter((s) => s.ownerUid !== ownerUid);
            setLocalStories(revertedStories);
            await AsyncStorage.setItem(getStoriesStorageKey(ownerUid), JSON.stringify(revertedStories));
            const required = getPremiumStoryCost(selectedDuration);
            Alert.alert(tr('Créditos insuficientes', 'Insufficient credits'), tr(`Necesitas ${required} CS para publicar esta Story Premium.`, `You need ${required} CS to publish this Premium Story.`));
            return;
          }
        } catch (creditError: any) {
          Alert.alert(tr('Error de créditos', 'Credits error'), creditError?.message || tr('No se pudo procesar los créditos.', 'Could not process credits.'));
          return;
        }
      }

      const response = await setMyStoryState({ ownerUid, state: nextState, cardId: selectedCard.cardId });
      setState(response.state);
      setExpiresAt(response.expiresAt);

      setCreateVisible(false);
      resetCreateForm();
      Alert.alert(
        'Story publicada',
        selectedDuration === '30d'
          ? 'Premium activa por 30 días con CTA.'
          : selectedDuration === '7d'
            ? 'Premium activa por 7 días con CTA.'
            : 'Story gratis activa por 24h.'
      );

      await loadStoriesHub();
    } catch (error: any) {
      Alert.alert(tr('No se pudo publicar', 'Could not publish'), error?.message || tr('Intenta nuevamente.', 'Try again.'));
    }
  };

  const openStoryViewer = (item: GridStoryItem) => {
    if (item.storyState === 'none') {
      Alert.alert(tr('Sin Story activa', 'No active Story'), tr('Este perfil no tiene una historia activa en este momento.', 'This profile has no active story at this moment.'));
      return;
    }

    const startIndex = viewerFeed.findIndex((feedItem) => feedItem.kind === 'story' && feedItem.uid === item.uid);
    if (startIndex < 0) {
      Alert.alert(tr('Sin Story sincronizada', 'Story not synced'), tr('Este perfil tiene Story activa, pero aun no cargo contenido en cache local.', 'This profile has an active Story, but content not yet cached locally.'));
      return;
    }

    setViewerIndex(startIndex);
    setViewerVisible(true);
  };

  const openCta = async (story: LocalStory | null) => {
    if (!story) {
      Alert.alert(tr('CTA no disponible', 'CTA not available'), tr('Esta historia no comparte CTA directo en este demo.', 'This story does not share direct CTA in this demo.'));
      return;
    }
    const value = String(story.ctaValue || '').trim();
    const type = String(story.ctaType || '').toLowerCase();
    if (type.includes('email')) {
      ActionController.ActionEmail({ value });
    } else if (type.includes('tel')) {
      ActionController.ActionTelefono({
        value,
        userName: story.cardName || 'este contacto',
        cardName: story.ctaTitle || '',
        fallbackToCallsTab: true,
      });
    } else if (type.includes('enlace') || type.includes('link') || type.includes('web')) {
      ActionController.ActionLink({ value, title: story.ctaTitle });
    } else if (type.includes('documento') || type.includes('pdf')) {
      ActionController.ActionDocument({ value });
    } else if (type.includes('texto')) {
      ActionController.ActionText({ value, title: story.ctaTitle });
    } else {
      Alert.alert('CTA disponible', `${story.ctaTitle}: ${value}`);
    }
  };

  const openHouseAdCta = async (item: Extract<ViewerFeedItem, { kind: 'ad' }>) => {
    // Hard Lock: Require biometric before opening ad CTA (Nivel 6.6)
    const authenticated = await hardLockCheck('anuncio de propiedad');
    if (!authenticated) {
      return;
    }

    if (!item.ctaUrl) {
      Alert.alert('Mi Sueno Mexicano', `${item.priceLabel} \n${item.locationLabel}`);
      return;
    }

    try {
      const url = item.ctaUrl.startsWith('http://') || item.ctaUrl.startsWith('https://') ? item.ctaUrl : `https://${item.ctaUrl}`;
      await Linking.openURL(url);
    } catch {
      Alert.alert('No se pudo abrir', 'Revisa el enlace del anuncio en backend.');
    }
  };

  const statusLabel = useMemo(() => {
    if (state === 'vip') {
      return 'Premium (7/30 dias)';
    }
    if (state === 'normal') {
      return 'Normal (24h)';
    }
    return 'Sin Story activa';
  }, [state]);

  const expiryLabel = useMemo(() => {
    if (!expiresAt) {
      return 'Expiracion: --';
    }
    const d = new Date(expiresAt);
    if (Number.isNaN(d.getTime())) {
      return 'Expiracion: --';
    }
    const f = new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
    return `Expiracion: ${f}`;
  }, [expiresAt]);

  const renderGridItem = ({ item }: { item: GridStoryItem }) => {
    const ringStyle =
      item.storyState === 'vip'
        ? {
            borderWidth: 2.8,
            borderColor: shell.ctaAccent,
            backgroundColor: isNight ? 'rgba(212,175,55,0.2)' : 'rgba(212,175,55,0.14)',
            shadowColor: shell.ctaAccent,
            shadowOpacity: 0.45,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
            elevation: 5,
          }
        : item.storyState === 'normal'
          ? {
              borderWidth: 2.6,
              borderColor: shell.success,
              backgroundColor: isNight ? 'rgba(48,209,88,0.12)' : 'rgba(52,199,89,0.1)',
              shadowColor: shell.success,
              shadowOpacity: 0.2,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 2,
            }
          : {
              borderWidth: 1.2,
              borderColor: shell.border,
              backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)',
            };
    return (
      <TouchableOpacity style={styles.gridItem} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openStoryViewer(item); }}>
        <View style={[styles.gridAvatarRing, ringStyle]}>
          {item.photoUrl ? (
            <ExpoImage source={{ uri: item.photoUrl }} style={styles.gridAvatar} cachePolicy="disk" />
          ) : (
            <View style={[styles.gridAvatarFallback, { backgroundColor: shell.avatarFallbackBg, borderColor: shell.avatarFallbackBorder }]}>
              <MaterialCommunityIcons name="account" size={20} color={shell.iconColor} />
            </View>
          )}
        </View>
        <Text style={[styles.gridCardName, { color: shell.sectionLabel }]} numberOfLines={1}>{item.cardName}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient
      colors={[...shell.tabShellGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.headerWrap}>
        <Text style={[styles.title, { color: shell.textPrimary }]}>Stories Hub</Text>
        <Text style={[styles.subtitle, { color: shell.textSecondary }]}>VIP primero, luego favoritos, luego general</Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={shell.loaderAccent} size="large" />
        </View>
      ) : (
        <>
          <LinearGradient
            colors={[...shell.storiesGlowGradient]}
            style={[styles.premiumGlowCard, { shadowColor: shell.storiesFabBorder }]}
          >
            <BlurView
              intensity={45}
              tint={isNight ? 'dark' : 'light'}
              style={[
                styles.premiumGlowInner,
                { backgroundColor: shell.storiesGlowInnerBg, borderColor: shell.storiesGlowInnerBorder },
              ]}
            >
              <View style={styles.statusRow}>
                <MaterialCommunityIcons
                  name={state === 'vip' ? 'star-circle' : state === 'normal' ? 'checkbox-marked-circle-outline' : 'circle-off-outline'}
                  size={20}
                  color={state === 'vip' ? shell.ctaAccent : state === 'normal' ? shell.success : shell.textMuted}
                />
                <Text style={[styles.statusText, { color: shell.textPrimary }]}>{statusLabel}</Text>
              </View>
              <Text style={[styles.expiryText, { color: shell.textSecondary }]}>{expiryLabel}</Text>
            </BlurView>
          </LinearGradient>

          <FlatList
            data={gridItems}
            keyExtractor={(item) => item.uid}
            numColumns={4}
            contentContainerStyle={styles.gridWrap}
            bounces={false}
            overScrollMode="never"
            renderItem={renderGridItem}
            ListEmptyComponent={<Text style={[styles.emptyText, { color: shell.textMuted }]}>{tr('No hay historias activas en tu red.', 'No active stories in your network.')}</Text>}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => { void loadStoriesHub(); }}
                tintColor={shell.refreshTint}
                colors={[shell.refreshTint]}
              />
            }
          />

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: shell.storiesNormalBtnBg, borderColor: shell.storiesNormalBtnBorder }]}
            onPress={() => publishState('normal')}
            disabled={saving}
          >
            <Text style={[styles.actionBtnText, { color: shell.textPrimary }]}>Simular Story Normal Rapida</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.vipBtn,
              {
                borderColor: shell.ctaAccent,
                shadowColor: shell.ctaAccent,
                backgroundColor: isNight ? 'rgba(212,175,55,0.14)' : shell.storiesNormalBtnBg,
              },
            ]}
            onPress={() => publishState('vip')}
            disabled={saving}
          >
            <Text style={[styles.actionBtnText, { color: shell.textPrimary }]}>Activar VIP Manual (7 dias)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: shell.storiesOffBtnBg, borderColor: shell.storiesOffBtnBorder }]}
            onPress={() => publishState('none')}
            disabled={saving}
          >
            <Text style={[styles.actionBtnText, { color: shell.textPrimary }]}>Apagar Story Rapida</Text>
          </TouchableOpacity>
        </>
      )}

      <View pointerEvents="none" style={[styles.fabGlowHalo, { backgroundColor: shell.storiesFabHalo, shadowColor: shell.storiesFabBorder }]} />
      <TouchableOpacity
        style={[styles.fabAddStory, { backgroundColor: shell.headerBtnBg, borderColor: shell.storiesFabBorder, shadowColor: shell.storiesFabBorder }]}
        onPress={openCreate}
        activeOpacity={0.9}
      >
        <MaterialCommunityIcons name="plus" size={28} color={shell.btnPrimaryText} />
      </TouchableOpacity>

      <Modal visible={createVisible} transparent animationType="slide" onRequestClose={() => setCreateVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: shell.storiesModalOverlayBg }]}>
          <View style={[styles.createCard, { backgroundColor: shell.storiesCreateCardBg, borderColor: shell.storiesCreateCardBorder }]}>
            <Text style={[styles.modalTitle, { color: shell.modalTitle }]}>Crear Historia</Text>

            <Text style={[styles.stepTitle, { color: shell.textSecondary }]}>1) Tipo de contenido</Text>
            <View style={styles.rowWrap}>
              <TouchableOpacity
                style={[styles.selectorBtn, selectedType === 'image' && styles.selectorBtnActive, { backgroundColor: selectedType === 'image' ? shell.storiesControlActiveBg : shell.inputBg, borderColor: selectedType === 'image' ? shell.storiesControlActiveBorder : shell.border }]}
                onPress={() => setSelectedType('image')}
              >
                <Text style={[styles.selectorText, { color: shell.textPrimary }]}>Imagen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectorBtn, selectedType === 'video' && styles.selectorBtnActive, { backgroundColor: selectedType === 'video' ? shell.storiesControlActiveBg : shell.inputBg, borderColor: selectedType === 'video' ? shell.storiesControlActiveBorder : shell.border }]}
                onPress={() => setSelectedType('video')}
              >
                <Text style={[styles.selectorText, { color: shell.textPrimary }]}>Video</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectorBtn, selectedType === 'document' && styles.selectorBtnActive, { backgroundColor: selectedType === 'document' ? shell.storiesControlActiveBg : shell.inputBg, borderColor: selectedType === 'document' ? shell.storiesControlActiveBorder : shell.border }]}
                onPress={() => setSelectedType('document')}
              >
                <Text style={[styles.selectorText, { color: shell.textPrimary }]}>Documento</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickBtn, { backgroundColor: shell.ctaPrimary }]}
                onPress={() => {
                  if (selectedType === 'image') {
                    void pickImage();
                  } else if (selectedType === 'video') {
                    void pickVideo();
                  } else {
                    void pickDocument();
                  }
                }}
              >
                <Text style={[styles.pickBtnText, { color: shell.btnPrimaryText }]}>Agregar</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.fileNameText, { color: shell.textMuted }]}>{selectedMediaName || 'Sin archivo seleccionado'}</Text>

            <Text style={[styles.stepTitle, { color: shell.textSecondary }]}>2) Tarjeta emisora</Text>
            <View style={styles.selectorListWrap}>
              {smartCards.map((card) => (
                <TouchableOpacity
                  key={card.cardId}
                  style={[styles.listOption, selectedCardId === card.cardId && styles.listOptionActive, { backgroundColor: selectedCardId === card.cardId ? shell.storiesControlActiveBg : shell.inputBg, borderColor: selectedCardId === card.cardId ? shell.storiesControlActiveBorder : shell.modalRowBorder }]}
                  onPress={() => {
                    setSelectedCardId(card.cardId);
                    setSelectedCtaItemId('');
                  }}
                >
                  <Text style={[styles.listOptionText, { color: shell.textPrimary }]}>{card.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.stepTitle, { color: shell.textSecondary }]}>3) CTA (icono/dato de la tarjeta)</Text>
            <View style={styles.selectorListWrap}>
              {cardCtaOptions.length === 0 ? (
                <Text style={[styles.emptyCtaText, { color: shell.textMuted }]}>Selecciona una tarjeta para ver CTA disponibles.</Text>
              ) : (
                cardCtaOptions.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.listOption, selectedCtaItemId === item.id && styles.listOptionActive, { backgroundColor: selectedCtaItemId === item.id ? shell.storiesControlActiveBg : shell.inputBg, borderColor: selectedCtaItemId === item.id ? shell.storiesControlActiveBorder : shell.modalRowBorder }]}
                    onPress={() => setSelectedCtaItemId(item.id)}
                  >
                    <Text style={[styles.listOptionText, { color: shell.textPrimary }]}>{item.title}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <Text style={[styles.stepTitle, { color: shell.textSecondary }]}>4) Tiempo de historia</Text>
            <View style={styles.rowWrap}>
              <TouchableOpacity
                style={[styles.selectorBtn, selectedDuration === '24h' && styles.selectorBtnActive, { backgroundColor: selectedDuration === '24h' ? shell.storiesControlActiveBg : shell.inputBg, borderColor: selectedDuration === '24h' ? shell.storiesControlActiveBorder : shell.border }]}
                onPress={() => setSelectedDuration('24h')}
              >
                <Text style={[styles.selectorText, { color: shell.textPrimary }]}>24 horas (Gratis)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectorBtn, selectedDuration === '7d' && styles.selectorVipBtn, { backgroundColor: selectedDuration === '7d' ? shell.storiesControlActiveBg : shell.inputBg, borderColor: selectedDuration === '7d' ? shell.storiesControlActiveBorder : shell.border }]}
                onPress={() => setSelectedDuration('7d')}
              >
                <Text style={[styles.selectorText, { color: shell.textPrimary }]}>7 dias Premium ({getPremiumStoryCost('7d')} CS)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectorBtn, selectedDuration === '30d' && styles.selectorVipBtn, { backgroundColor: selectedDuration === '30d' ? shell.storiesControlActiveBg : shell.inputBg, borderColor: selectedDuration === '30d' ? shell.storiesControlActiveBorder : shell.border }]}
                onPress={() => setSelectedDuration('30d')}
              >
                <Text style={[styles.selectorText, { color: shell.textPrimary }]}>30 dias Premium ({getPremiumStoryCost('30d')} CS)</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.exposureHintText, { color: shell.textMuted }]}>Exposicion en carrusel: 30 segundos por historia.</Text>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: shell.storiesCancelBtnBg }]} onPress={() => setCreateVisible(false)}>
                <Text style={[styles.cancelBtnText, { color: shell.textPrimary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.publishBtn,
                  { backgroundColor: shell.ctaPrimary },
                  !selectedCtaItem && [styles.publishBtnDisabled, { backgroundColor: shell.storiesPublishDisabled }],
                ]}
                onPress={() => {
                  if (selectedCtaItem) {
                    void publishStory();
                  }
                }}
                disabled={!selectedCtaItem}
              >
                <Text style={[styles.publishBtnText, { color: shell.btnPrimaryText }]}>Publicar Story</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={viewerVisible} transparent animationType="fade" onRequestClose={() => setViewerVisible(false)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerVisible(false)} accessibilityLabel={tr('Cerrar', 'Close')}>
            <MaterialCommunityIcons name="close" size={24} color={shell.ghostLinkOnGradient} />
          </TouchableOpacity>

          <View style={styles.viewerTopMeta}>
            <Text style={styles.viewerMetaText}>Slot {Math.min(viewerIndex + 1, Math.max(1, viewerFeed.length))}/{Math.max(1, viewerFeed.length)}</Text>
            <Text style={styles.viewerMetaText}>Auto avance: 30s</Text>
          </View>

          {selectedViewerItem?.kind === 'ad' ? (
            <LinearGradient colors={[...shell.vipBannerGradient]} style={styles.adPanel}>
              {selectedViewerItem.photoUrl ? (
                <ExpoImage source={{ uri: selectedViewerItem.photoUrl }} style={styles.adPhoto} contentFit="cover" cachePolicy="disk" />
              ) : (
                <MaterialCommunityIcons name="home-city-outline" size={68} color={shell.ctaAccent} />
              )}
              <Text style={styles.adTitle}>{selectedViewerItem.title}</Text>
              <Text style={styles.adSubtitle}>{selectedViewerItem.subtitle}</Text>
              <View style={styles.adMetaRow}>
                <Text style={styles.adMetaText}>{selectedViewerItem.priceLabel}</Text>
                <Text style={styles.adMetaDot}>•</Text>
                <Text style={styles.adMetaText}>{selectedViewerItem.locationLabel}</Text>
              </View>
              <Text style={styles.adBadge}>AD Slot interno</Text>
            </LinearGradient>
          ) : selectedViewerItem?.localStory?.storyType === 'image' ? (
            <ExpoImage source={{ uri: selectedViewerItem.localStory.mediaUri }} style={styles.viewerImage} contentFit="cover" cachePolicy="disk" />
          ) : selectedViewerItem?.localStory?.storyType === 'video' ? (
            <StoryVideo uri={selectedViewerItem.localStory.mediaUri} videoStyle={styles.viewerImage} />
          ) : (
            <View style={styles.viewerDocWrap}>
              <MaterialCommunityIcons
                name={selectedViewerItem?.localStory ? 'file-document-outline' : 'card-account-details-outline'}
                size={62}
                color={shell.ghostLinkOnGradient}
              />
              <Text style={styles.viewerDocText}>{selectedViewerItem?.localStory?.mediaName || 'Historia sin media sincronizada'}</Text>
            </View>
          )}

          <View style={styles.viewerFooter}>
            <Text style={styles.viewerTitle}>
              {selectedViewerItem?.kind === 'ad' ? 'Mi Sueno Mexicano' : selectedViewerItem?.cardName || 'Story'}
            </Text>
            {selectedViewerItem?.kind === 'story' ? (
              <TouchableOpacity style={styles.viewerCtaBtn} onPress={() => { void openCta(selectedViewerItem?.localStory || null); }}>
                <Text style={styles.viewerCtaText}>{selectedViewerItem?.localStory?.ctaTitle || 'CTA'}</Text>
              </TouchableOpacity>
            ) : selectedViewerItem?.kind === 'ad' ? (
              <TouchableOpacity style={styles.viewerCtaBtn} onPress={() => { void openHouseAdCta(selectedViewerItem); }}>
                <Text style={styles.viewerCtaText}>{selectedViewerItem.ctaLabel || 'Ver propiedad'}</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.viewerNavRow}>
              <TouchableOpacity
                style={styles.viewerNavBtn}
                onPress={() => {
                  setViewerIndex((prev) => {
                    if (!viewerFeed.length) {
                      return 0;
                    }
                    return prev === 0 ? viewerFeed.length - 1 : prev - 1;
                  });
                }}
              >
                <Text style={styles.viewerNavText}>Anterior</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewerNavBtn}
                onPress={() => {
                  setViewerIndex((prev) => {
                    if (!viewerFeed.length) {
                      return 0;
                    }
                    return (prev + 1) % viewerFeed.length;
                  });
                }}
              >
                <Text style={styles.viewerNavText}>Siguiente</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}
