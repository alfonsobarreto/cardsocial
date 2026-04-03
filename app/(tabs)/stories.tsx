import { getActiveUserId } from '@/services/authSession';
import { mergeBuiltinGhostLinkIntoVault } from '@/services/ghostLinkVaultBootstrap';
import { readVaultJsonWithLegacyMigration } from '@/services/userScopedStorage';
import { hardLockCheck } from '@/services/biometricAuth';
import { hasActiveBusinessLicense } from '@/services/businessLicenseService';
import { getPremiumStoryCost, purchasePremiumStoryWithCredits } from '@/services/creditsService';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
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
    StyleSheet,
    Text,
    TouchableOpacity,
    View
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

const SKY_PREMIUM = '#7ED7FF';
const SKY_BRIGHT = '#57C6FF';
const SKY_DEEP = '#2FAFEA';
const STORY_RING_NORMAL = '#2ECC71';
const STORY_RING_VIP = '#C5A065';
const VIP_GLOW = '#E9C98A';
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

function StoryVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = false;
    instance.currentTime = 0;
    instance.play();
  });

  return <VideoView style={styles.viewerImage} player={player} allowsFullscreen allowsPictureInPicture={false} />;
}

function getStoriesStorageKey(ownerUid: string) {
  return `${STORIES_STORAGE_PREFIX}${ownerUid}`;
}

export default function StoriesPage() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => language === 'en' ? en : es;
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const storiesTheme = {
    glowCardGradient: isNight
      ? (['rgba(28,91,185,0.45)', 'rgba(21,68,139,0.30)', 'rgba(15,44,80,0.25)'] as const)
      : (['rgba(126,215,255,0.45)', 'rgba(87,198,255,0.28)', 'rgba(47,175,234,0.24)'] as const),
    glowInnerBg: isNight ? 'rgba(10,35,60,0.88)' : 'rgba(255,255,255,0.66)',
    glowInnerBorder: isNight ? 'rgba(212,175,55,0.35)' : 'rgba(47,175,234,0.35)',
    statusText: isNight ? '#F0F4F8' : '#0D4D8A',
    expiryText: isNight ? '#87C8E8' : '#2E668C',
    avatarFallbackBg: isNight ? '#0D2E40' : '#EAF7FF',
    avatarFallbackBorder: isNight ? 'rgba(212,175,55,0.22)' : '#C7E8FF',
    iconColor: isNight ? '#87C8E8' : '#0D4D8A',
    gridCardName: isNight ? '#87C8E8' : '#0D4D8A',
    emptyText: isNight ? '#87A9C2' : '#3A7093',
    normalBtnBg: isNight ? 'rgba(46,204,113,0.12)' : '#EFFFF5',
    normalBtnBorder: isNight ? 'rgba(46,204,113,0.35)' : '#B9EFD0',
    offBtnBg: isNight ? 'rgba(10,37,64,0.60)' : '#FFFFFF',
    offBtnBorder: isNight ? 'rgba(212,175,55,0.22)' : '#D5EAF7',
    actionBtnText: isNight ? '#87C8E8' : '#0D4D8A',
    createCardBg: isNight ? '#071A32' : '#F5FCFF',
    createCardBorder: isNight ? 'rgba(212,175,55,0.22)' : 'rgba(13,77,138,0.18)',
    modalTitle: isNight ? '#F0F4F8' : '#0D4D8A',
    stepTitle: isNight ? '#87C8E8' : '#2E668C',
    selectorBtnBg: isNight ? '#0D2E40' : '#FFFFFF',
    selectorBtnBorder: isNight ? 'rgba(212,175,55,0.22)' : '#CFE8F7',
    selectorBtnActiveBg: isNight ? 'rgba(28,91,185,0.35)' : '#EAF7FF',
    selectorBtnActiveBorder: isNight ? '#1C5BB9' : '#0D4D8A',
    selectorText: isNight ? '#87C8E8' : '#0D4D8A',
    listOptionBg: isNight ? '#0D2E40' : '#FFFFFF',
    listOptionBorder: isNight ? 'rgba(212,175,55,0.15)' : '#D6EBF8',
    listOptionActiveBg: isNight ? 'rgba(28,91,185,0.35)' : '#EAF7FF',
    listOptionActiveBorder: isNight ? '#1C5BB9' : '#0D4D8A',
    cancelBtnBg: isNight ? '#0D2E40' : '#E5F2FA',
    fileNameText: isNight ? '#87A9C2' : '#3E7395',
    emptyCtaText: isNight ? '#87A9C2' : '#4F7D9B',
    exposureHint: isNight ? '#7AB9D8' : '#5A7A90',
  };
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
    const ringStyle = item.storyState === 'vip' ? styles.ringVip : item.storyState === 'normal' ? styles.ringNormal : styles.ringIdle;
    const ringBgOverride = item.storyState === 'none' ? { backgroundColor: isNight ? 'rgba(10,37,64,0.64)' : 'rgba(255,255,255,0.64)' } : undefined;
    return (
      <TouchableOpacity style={styles.gridItem} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openStoryViewer(item); }}>
        <View style={[styles.gridAvatarRing, ringStyle, ringBgOverride]}>
          {item.photoUrl ? (
            <ExpoImage source={{ uri: item.photoUrl }} style={styles.gridAvatar} cachePolicy="disk" />
          ) : (
            <View style={[styles.gridAvatarFallback, { backgroundColor: storiesTheme.avatarFallbackBg, borderColor: storiesTheme.avatarFallbackBorder }]}>
              <MaterialCommunityIcons name="account" size={20} color={storiesTheme.iconColor} />
            </View>
          )}
        </View>
        <Text style={[styles.gridCardName, { color: storiesTheme.gridCardName }]} numberOfLines={1}>{item.cardName}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient
      colors={isNight ? ['#071A32', '#0A2540', '#0F2C50'] : ['#EAF7FF', '#CDEFFF', '#B8E7FF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Stories Hub</Text>
        <Text style={styles.subtitle}>VIP primero, luego favoritos, luego general</Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#0D4D8A" size="large" />
        </View>
      ) : (
        <>
          <LinearGradient
            colors={storiesTheme.glowCardGradient}
            style={styles.premiumGlowCard}
          >
            <BlurView intensity={45} tint={isNight ? 'dark' : 'light'} style={styles.premiumGlowInner}>
              <View style={styles.statusRow}>
                <MaterialCommunityIcons
                  name={state === 'vip' ? 'star-circle' : state === 'normal' ? 'checkbox-marked-circle-outline' : 'circle-off-outline'}
                  size={20}
                  color={state === 'vip' ? '#C5A065' : state === 'normal' ? '#2ECC71' : '#4B88AF'}
                />
                <Text style={[styles.statusText, { color: storiesTheme.statusText }]}>{statusLabel}</Text>
              </View>
              <Text style={[styles.expiryText, { color: storiesTheme.expiryText }]}>{expiryLabel}</Text>
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
            ListEmptyComponent={<Text style={[styles.emptyText, { color: storiesTheme.emptyText }]}>{tr('No hay historias activas en tu red.', 'No active stories in your network.')}</Text>}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => { void loadStoriesHub(); }}
                tintColor="#C5A065"
                colors={['#C5A065']}
              />
            }
          />

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: storiesTheme.normalBtnBg, borderColor: storiesTheme.normalBtnBorder }]}
            onPress={() => publishState('normal')}
            disabled={saving}
          >
            <Text style={[styles.actionBtnText, { color: storiesTheme.actionBtnText }]}>Simular Story Normal Rapida</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.vipBtn]}
            onPress={() => publishState('vip')}
            disabled={saving}
          >
            <Text style={[styles.actionBtnText, { color: storiesTheme.actionBtnText }]}>Activar VIP Manual (7 dias)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: storiesTheme.offBtnBg, borderColor: storiesTheme.offBtnBorder }]}
            onPress={() => publishState('none')}
            disabled={saving}
          >
            <Text style={[styles.actionBtnText, { color: storiesTheme.actionBtnText }]}>Apagar Story Rapida</Text>
          </TouchableOpacity>
        </>
      )}

      <View pointerEvents="none" style={styles.fabGlowHalo} />
      <TouchableOpacity style={styles.fabAddStory} onPress={openCreate} activeOpacity={0.9}>
        <MaterialCommunityIcons name="plus" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={createVisible} transparent animationType="slide" onRequestClose={() => setCreateVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.createCard, { backgroundColor: storiesTheme.createCardBg, borderColor: storiesTheme.createCardBorder }]}>
            <Text style={[styles.modalTitle, { color: storiesTheme.modalTitle }]}>Crear Historia</Text>

            <Text style={[styles.stepTitle, { color: storiesTheme.stepTitle }]}>1) Tipo de contenido</Text>
            <View style={styles.rowWrap}>
              <TouchableOpacity
                style={[styles.selectorBtn, selectedType === 'image' && styles.selectorBtnActive, { backgroundColor: selectedType === 'image' ? storiesTheme.selectorBtnActiveBg : storiesTheme.selectorBtnBg, borderColor: selectedType === 'image' ? storiesTheme.selectorBtnActiveBorder : storiesTheme.selectorBtnBorder }]}
                onPress={() => setSelectedType('image')}
              >
                <Text style={[styles.selectorText, { color: storiesTheme.selectorText }]}>Imagen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectorBtn, selectedType === 'video' && styles.selectorBtnActive, { backgroundColor: selectedType === 'video' ? storiesTheme.selectorBtnActiveBg : storiesTheme.selectorBtnBg, borderColor: selectedType === 'video' ? storiesTheme.selectorBtnActiveBorder : storiesTheme.selectorBtnBorder }]}
                onPress={() => setSelectedType('video')}
              >
                <Text style={[styles.selectorText, { color: storiesTheme.selectorText }]}>Video</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectorBtn, selectedType === 'document' && styles.selectorBtnActive, { backgroundColor: selectedType === 'document' ? storiesTheme.selectorBtnActiveBg : storiesTheme.selectorBtnBg, borderColor: selectedType === 'document' ? storiesTheme.selectorBtnActiveBorder : storiesTheme.selectorBtnBorder }]}
                onPress={() => setSelectedType('document')}
              >
                <Text style={[styles.selectorText, { color: storiesTheme.selectorText }]}>Documento</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pickBtn}
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
                <Text style={styles.pickBtnText}>Agregar</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.fileNameText, { color: storiesTheme.fileNameText }]}>{selectedMediaName || 'Sin archivo seleccionado'}</Text>

            <Text style={[styles.stepTitle, { color: storiesTheme.stepTitle }]}>2) Tarjeta emisora</Text>
            <View style={styles.selectorListWrap}>
              {smartCards.map((card) => (
                <TouchableOpacity
                  key={card.cardId}
                  style={[styles.listOption, selectedCardId === card.cardId && styles.listOptionActive, { backgroundColor: selectedCardId === card.cardId ? storiesTheme.listOptionActiveBg : storiesTheme.listOptionBg, borderColor: selectedCardId === card.cardId ? storiesTheme.listOptionActiveBorder : storiesTheme.listOptionBorder }]}
                  onPress={() => {
                    setSelectedCardId(card.cardId);
                    setSelectedCtaItemId('');
                  }}
                >
                  <Text style={[styles.listOptionText, { color: storiesTheme.selectorText }]}>{card.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.stepTitle, { color: storiesTheme.stepTitle }]}>3) CTA (icono/dato de la tarjeta)</Text>
            <View style={styles.selectorListWrap}>
              {cardCtaOptions.length === 0 ? (
                <Text style={[styles.emptyCtaText, { color: storiesTheme.emptyCtaText }]}>Selecciona una tarjeta para ver CTA disponibles.</Text>
              ) : (
                cardCtaOptions.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.listOption, selectedCtaItemId === item.id && styles.listOptionActive, { backgroundColor: selectedCtaItemId === item.id ? storiesTheme.listOptionActiveBg : storiesTheme.listOptionBg, borderColor: selectedCtaItemId === item.id ? storiesTheme.listOptionActiveBorder : storiesTheme.listOptionBorder }]}
                    onPress={() => setSelectedCtaItemId(item.id)}
                  >
                    <Text style={[styles.listOptionText, { color: storiesTheme.selectorText }]}>{item.title}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <Text style={[styles.stepTitle, { color: storiesTheme.stepTitle }]}>4) Tiempo de historia</Text>
            <View style={styles.rowWrap}>
              <TouchableOpacity
                style={[styles.selectorBtn, selectedDuration === '24h' && styles.selectorBtnActive, { backgroundColor: selectedDuration === '24h' ? storiesTheme.selectorBtnActiveBg : storiesTheme.selectorBtnBg, borderColor: selectedDuration === '24h' ? storiesTheme.selectorBtnActiveBorder : storiesTheme.selectorBtnBorder }]}
                onPress={() => setSelectedDuration('24h')}
              >
                <Text style={[styles.selectorText, { color: storiesTheme.selectorText }]}>24 horas (Gratis)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectorBtn, selectedDuration === '7d' && styles.selectorVipBtn, { backgroundColor: selectedDuration === '7d' ? storiesTheme.selectorBtnActiveBg : storiesTheme.selectorBtnBg, borderColor: selectedDuration === '7d' ? storiesTheme.selectorBtnActiveBorder : storiesTheme.selectorBtnBorder }]}
                onPress={() => setSelectedDuration('7d')}
              >
                <Text style={[styles.selectorText, { color: storiesTheme.selectorText }]}>7 dias Premium ({getPremiumStoryCost('7d')} CS)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectorBtn, selectedDuration === '30d' && styles.selectorVipBtn, { backgroundColor: selectedDuration === '30d' ? storiesTheme.selectorBtnActiveBg : storiesTheme.selectorBtnBg, borderColor: selectedDuration === '30d' ? storiesTheme.selectorBtnActiveBorder : storiesTheme.selectorBtnBorder }]}
                onPress={() => setSelectedDuration('30d')}
              >
                <Text style={[styles.selectorText, { color: storiesTheme.selectorText }]}>30 dias Premium ({getPremiumStoryCost('30d')} CS)</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.exposureHintText, { color: storiesTheme.exposureHint }]}>Exposicion en carrusel: 30 segundos por historia.</Text>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: storiesTheme.cancelBtnBg }]} onPress={() => setCreateVisible(false)}>
                <Text style={[styles.cancelBtnText, { color: storiesTheme.selectorText }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.publishBtn, !selectedCtaItem && styles.publishBtnDisabled]}
                onPress={() => {
                  if (selectedCtaItem) {
                    void publishStory();
                  }
                }}
                disabled={!selectedCtaItem}
              >
                <Text style={styles.publishBtnText}>Publicar Story</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={viewerVisible} transparent animationType="fade" onRequestClose={() => setViewerVisible(false)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerVisible(false)} accessibilityLabel={tr('Cerrar', 'Close')}>
            <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.viewerTopMeta}>
            <Text style={styles.viewerMetaText}>Slot {Math.min(viewerIndex + 1, Math.max(1, viewerFeed.length))}/{Math.max(1, viewerFeed.length)}</Text>
            <Text style={styles.viewerMetaText}>Auto avance: 30s</Text>
          </View>

          {selectedViewerItem?.kind === 'ad' ? (
            <LinearGradient colors={['#0A2540', '#123B61', '#0E2D49']} style={styles.adPanel}>
              {selectedViewerItem.photoUrl ? (
                <ExpoImage source={{ uri: selectedViewerItem.photoUrl }} style={styles.adPhoto} contentFit="cover" cachePolicy="disk" />
              ) : (
                <MaterialCommunityIcons name="home-city-outline" size={68} color="#C5A065" />
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
            <StoryVideo uri={selectedViewerItem.localStory.mediaUri} />
          ) : (
            <View style={styles.viewerDocWrap}>
              <MaterialCommunityIcons
                name={selectedViewerItem?.localStory ? 'file-document-outline' : 'card-account-details-outline'}
                size={62}
                color="#FFFFFF"
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  headerWrap: {
    marginBottom: 10,
  },
  title: {
    color: '#0A2540',
    fontSize: 24,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 3,
    color: '#346B8E',
    fontSize: 12,
    fontWeight: '600',
  },
  premiumGlowCard: {
    borderRadius: 18,
    padding: 1.2,
    shadowColor: SKY_BRIGHT,
    shadowOpacity: 0.36,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  premiumGlowInner: {
    borderRadius: 17,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1,
    borderColor: 'rgba(47,175,234,0.35)',
    padding: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    color: '#0D4D8A',
    fontSize: 15,
    fontWeight: '800',
  },
  expiryText: {
    marginTop: 6,
    color: '#2E668C',
    fontSize: 12,
    fontWeight: '600',
  },
  hintText: {
    marginTop: 8,
    color: '#4C7C9D',
    fontSize: 11,
    lineHeight: 17,
  },
  gridWrap: {
    paddingTop: 14,
    paddingBottom: 96,
  },
  gridItem: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 16,
  },
  gridAvatarRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringIdle: {
    borderWidth: 1.2,
    borderColor: 'rgba(13,77,138,0.16)',
    backgroundColor: 'rgba(255,255,255,0.64)',
  },
  ringNormal: {
    borderWidth: 2.6,
    borderColor: STORY_RING_NORMAL,
    backgroundColor: 'rgba(46,204,113,0.09)',
    shadowColor: STORY_RING_NORMAL,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  ringVip: {
    borderWidth: 2.8,
    borderColor: STORY_RING_VIP,
    backgroundColor: 'rgba(233,201,138,0.20)',
    shadowColor: VIP_GLOW,
    shadowOpacity: 0.52,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  gridAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  gridAvatarFallback: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF7FF',
    borderWidth: 1,
    borderColor: '#C7E8FF',
  },
  gridCardName: {
    marginTop: 6,
    color: '#0D4D8A',
    fontSize: 10,
    fontWeight: '700',
    maxWidth: 84,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#3A7093',
    fontSize: 12,
    marginTop: 18,
  },
  fabAddStory: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D4D8A',
    borderWidth: 1,
    borderColor: '#57C6FF',
    shadowColor: SKY_BRIGHT,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabGlowHalo: {
    position: 'absolute',
    right: 10,
    bottom: 14,
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(87,198,255,0.30)',
    shadowColor: '#7ED7FF',
    shadowOpacity: 0.65,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsWrap: {
    marginTop: 12,
    gap: 10,
  },
  actionBtn: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  normalBtn: {
    backgroundColor: '#EFFFF5',
    borderColor: '#B9EFD0',
  },
  vipBtn: {
    backgroundColor: '#EBF8FF',
    borderColor: SKY_DEEP,
    shadowColor: SKY_PREMIUM,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  offBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D5EAF7',
  },
  actionBtnText: {
    color: '#0D4D8A',
    fontSize: 13,
    fontWeight: '800',
  },
  actionBtnSub: {
    marginTop: 2,
    color: '#407797',
    fontSize: 11,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6,26,42,0.42)',
    justifyContent: 'flex-end',
  },
  createCard: {
    maxHeight: '90%',
    backgroundColor: '#F5FCFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.18)',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
  },
  modalTitle: {
    color: '#0D4D8A',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  stepTitle: {
    color: '#2E668C',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 7,
    marginBottom: 5,
  },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  selectorBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CFE8F7',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectorBtnActive: {
    borderColor: '#0D4D8A',
    backgroundColor: '#EAF7FF',
  },
  selectorVipBtn: {
    borderColor: STORY_RING_VIP,
    backgroundColor: 'rgba(233,201,138,0.22)',
  },
  exposureHintText: {
    marginTop: 7,
    color: '#5A7A90',
    fontSize: 11,
    fontWeight: '600',
  },
  selectorText: {
    color: '#0D4D8A',
    fontSize: 12,
    fontWeight: '700',
  },
  pickBtn: {
    borderRadius: 10,
    backgroundColor: '#0D4D8A',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  pickBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  fileNameText: {
    marginTop: 5,
    color: '#3E7395',
    fontSize: 11,
  },
  selectorListWrap: {
    maxHeight: 110,
    marginBottom: 2,
  },
  listOption: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#D6EBF8',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  listOptionActive: {
    borderColor: '#0D4D8A',
    backgroundColor: '#EAF7FF',
  },
  listOptionText: {
    color: '#0D4D8A',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCtaText: {
    color: '#4F7D9B',
    fontSize: 11,
    marginBottom: 6,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#E5F2FA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: '#0D4D8A',
    fontSize: 13,
    fontWeight: '700',
  },
  publishBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#0D4D8A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  publishBtnDisabled: {
    backgroundColor: '#9EABBA',
  },
  publishBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 42,
    right: 16,
    zIndex: 10,
  },
  viewerTopMeta: {
    position: 'absolute',
    top: 44,
    left: 12,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  viewerMetaText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  adPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  adPhoto: {
    width: 240,
    height: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(197,160,101,0.75)',
  },
  adTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontFamily: 'Georgia',
    fontWeight: '700',
    textAlign: 'center',
  },
  adSubtitle: {
    color: '#EAF7FF',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  adMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  adMetaText: {
    color: '#F4E8D4',
    fontSize: 12,
    fontWeight: '700',
  },
  adMetaDot: {
    color: '#C5A065',
    fontSize: 12,
    fontWeight: '900',
  },
  adBadge: {
    marginTop: 4,
    color: '#C5A065',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerDocWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  viewerDocText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    maxWidth: '85%',
    textAlign: 'center',
  },
  viewerFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 16,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  viewerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  viewerCtaBtn: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: '#0D4D8A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#66C7FF',
  },
  viewerCtaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  viewerNavRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  viewerNavBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
  },
  viewerNavText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});