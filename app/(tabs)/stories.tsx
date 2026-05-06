import {
    storyTextFontFamily,
    StoryTheaterFullBleedImage,
    StoryTheaterFullBleedVideo,
    StoryTheaterTextCanvas,
    TEXT_STORY_BACKGROUNDS,
    type TextFontRole,
} from '@/components/StoryTheaterStage';
import { isGhostLinkVaultType } from '@/constants/ghostLinkVault';
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import { hasActiveBusinessLicense } from '@/services/businessLicenseService';
import { trackCardAnalyticsFireAndForget } from '@/services/cardAnalytics';
import { getPremiumStoryCost, getUserCreditsBalance, purchasePremiumStoryWithCredits } from '@/services/creditsService';
import { mergeBuiltinGhostLinkIntoVault } from '@/services/ghostLinkVaultBootstrap';
import { intlLocaleTagForAppLanguage, trAction, trEsEn, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { db } from '@/services/firebaseConfig';
import { getMyStoryState, getStoriesHouseAd, listReceivedContacts, listSmartCardsFromDb, setMyStoryState, type HouseAdStory } from '@/services/qrApi';
import { resolveVaultMediaUrlForApp } from '@/services/resolveVaultMediaUrl';
import { readUserAvatarUrl, readUserFullName } from '@/services/userIdentityFields';
import { receivedContactMergeKey } from '@/services/receivedContactsPresentationMerge';
import { fetchVipMarketStorySlots, type VipMarketStorySlot } from '@/services/storiesFeedInjectionService';
import { storyChannelKey } from '@/services/storiesPhase1Logic';
import {
    normalizeStoryPickedImageAuto,
    STORY_VIDEO_MAX_DURATION_SEC,
    validateStoryVideoAsset,
} from '@/services/storyMediaLimits';
import { readSmartCardsJsonWithLegacyMigration, readVaultJsonWithLegacyMigration } from '@/services/userScopedStorage';
import { makeStoriesStyles } from '@/styles/_stories.styles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { doc, getDoc } from 'firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    InteractionManager,
    Linking,
    Modal,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionController } from '../../services/ActionController';
import { normalizeMaterialCommunityIconName } from '../components/iconNameValidation';
import appPalette from '../theme';

type StoryState = 'none' | 'normal' | 'vip';
type StoryDuration = '24h' | '7d' | '30d';
type StoryAssetType = 'image' | 'video' | 'text' | 'document';

type ViewerFeedItem =
  | {
      kind: 'story';
      uid: string;
      displayName: string;
      cardName: string;
      sourceSid: string | null;
      sourceBId: string | null;
      userAvatarUrl: string | null;
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
    }
  | {
      kind: 'market_vip';
      id: string;
      businessCardId: string;
      bcName: string;
      photoUrl: string | null;
      subtitle: string;
      distanceMiles: number | null;
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
  /** Clave de canal en hub: `sid` (smart) o `bId` (negocio). */
  sid: string;
  scName: string;
  itemIds: string[];
  /** Solo tarjetas de negocio: licencia anual para historias 7d/30d. */
  bId?: string | null;
};

type ContactRow = {
  uid: string;
  userFullName: string;
  userNickName: string;
  userAvatarUrl: string | null;
  cardName: string;
  sourceSid: string | null;
  sourceBId: string | null;
  storyState: StoryState;
};

type LocalStory = {
  id: string;
  uid: string;
  ownerName: string;
  ownerUserAvatar: string | null;
  sid: string;
  cardName: string;
  storyType: StoryAssetType;
  /** Imagen/video: URI local. Texto: cuerpo en texto plano. */
  mediaUri: string;
  mediaName: string;
  /** Modo texto: id de `TEXT_STORY_BACKGROUNDS` */
  backgroundKey?: string;
  textFontRole?: TextFontRole;
  ctaVaultItemId: string;
  ctaTitle: string;
  ctaValue: string;
  ctaType: string;
  state: StoryState;
  createdAt: string;
  expiresAt: string;
  /** Solo video: duración en segundos (visor del carrusel). */
  mediaDurationSec?: number;
};

type GridStoryItem = {
  uid: string;
  displayName: string;
  cardName: string;
  sourceSid: string | null;
  sourceBId: string | null;
  userAvatarUrl: string | null;
  storyState: StoryState;
  isFavorite: boolean;
  localStory: LocalStory | null;
  /** Fila «Mi historia» del hub (prioridad en ordenación). */
  isSelf?: boolean;
};

const CONTACT_META_STORAGE_KEY = 'contacts_meta_v2';
const STORIES_STORAGE_PREFIX = 'stories_hub_v1_';

/** Tiempo fijo del segmento en el visor (texto, imagen, video, anuncios). */
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

function getStoriesStorageKey(viewerUid: string) {
  return `${STORIES_STORAGE_PREFIX}${viewerUid}`;
}

/** Misma caché que Mis Tarjetas (`smart_cards:{uid}`); `sid` legado o `id`. Sin duplicados por sid. */
function mapCachedSmartCardsToStoryRows(raw: string): SmartCard[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const rows = parsed
      .map((c: { sid?: string; bId?: string; cardType?: string; scName?: string; itemIds?: unknown } & { id?: string }) => {
        const isBiz = String(c?.cardType || '') === 'business';
        const rawB = c?.bId != null ? String(c.bId).trim() : '';
        const rawS = String(c?.sid || '').trim();
        const sid = isBiz && rawB ? rawB : String(rawS || c?.id || '').trim();
        return {
          sid,
          scName: String(c?.scName ?? '').trim() || trAction('Smart Card', 'Smart Card'),
          itemIds: Array.isArray(c?.itemIds) ? c.itemIds.map((id) => String(id)) : [],
          bId: isBiz && rawB ? rawB : null,
        };
      })
      .filter((row) => row.sid.length > 0);
    const byId = new Map<string, SmartCard>();
    for (const r of rows) {
      if (!byId.has(r.sid)) {
        byId.set(r.sid, r);
      }
    }
    return [...byId.values()];
  } catch {
    return [];
  }
}

/** Ítems del Bunker en el orden de la tarjeta, una sola fila por id (evita keys duplicadas en FlatList). */
function orderedUniqueVaultItemsForCard(itemIds: string[], items: VaultItem[]): VaultItem[] {
  const byId = new Map(items.map((v) => [String(v.id || '').trim(), v]));
  const out: VaultItem[] = [];
  const seen = new Set<string>();
  for (const slotId of itemIds) {
    const id = String(slotId || '').trim();
    if (!id || seen.has(id)) {
      continue;
    }
    const v = byId.get(id);
    if (v) {
      seen.add(id);
      out.push(v);
    }
  }
  return out;
}

function dedupeSmartCardsBySid(cards: SmartCard[]): SmartCard[] {
  const byId = new Map<string, SmartCard>();
  for (const c of cards) {
    const id = String(c.sid || '').trim();
    if (!id || byId.has(id)) {
      continue;
    }
    byId.set(id, c);
  }
  return [...byId.values()];
}

/** Tarjeta cuyo canal de historia debemos consultar en API / hub (no siempre `smartCards[0]`). */
function resolveStoryHubCardId(uid: string, cardsRows: SmartCard[], activeStories: LocalStory[]): string {
  const allowed = new Set(cardsRows.map((c) => c.sid).filter(Boolean));
  const mine = activeStories
    .filter((s) => s.uid === uid && allowed.has(s.sid))
    .slice()
    .sort((a, b) => Date.parse(String(b.createdAt || 0)) - Date.parse(String(a.createdAt || 0)));
  return mine[0]?.sid || cardsRows[0]?.sid || '';
}

export default function StoriesPage() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const shell = appPalette[isNight ? 'dark' : 'light'];
  const styles = useMemo(() => makeStoriesStyles(shell), [shell]);
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const modalFooterBottomPad = useModalFooterBottomPad();
  const routeParams = useLocalSearchParams<{ openStory?: string | string[]; openMarketVip?: string | string[] }>();
  const openStoryParam = useMemo(() => {
    const v = routeParams.openStory;
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === 'string' ? s.trim() : '';
  }, [routeParams.openStory]);
  const openMarketVipParam = useMemo(() => {
    const v = routeParams.openMarketVip;
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === 'string' ? s.trim() : '';
  }, [routeParams.openMarketVip]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<StoryState>('none');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [viewerUid, setViewerUid] = useState('');
  const [ownerName, setOwnerName] = useState('Mi Story');
  const [ownerUserAvatar, setOwnerUserAvatar] = useState<string | null>(null);

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [favoritesByUid, setFavoritesByUid] = useState<Record<string, boolean>>({});
  const [localStories, setLocalStories] = useState<LocalStory[]>([]);

  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [smartCards, setSmartCards] = useState<SmartCard[]>([]);
  const [houseAd, setHouseAd] = useState<HouseAdStory>(FALLBACK_HOUSE_AD);
  const [vipMarketSlots, setVipMarketSlots] = useState<VipMarketStorySlot[]>([]);

  const [cardPickerVisible, setCardPickerVisible] = useState(false);
  const [vaultMirrorVisible, setVaultMirrorVisible] = useState(false);
  const [vaultMirrorSelectionId, setVaultMirrorSelectionId] = useState('');
  const [createVisible, setCreateVisible] = useState(false);
  const [textComposerVisible, setTextComposerVisible] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const exposureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Duración del último video elegido (publicación). */
  const storyPickedVideoDurationSecRef = useRef<number | null>(null);
  /** Cierra "Crear historia" mientras el lienzo fullscreen está arriba (evita modales apilados rotos en iOS/Android). */
  const resumeCreateAfterTextComposerRef = useRef(false);
  const [segmentProgress, setSegmentProgress] = useState(0);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);

  const hubGridListRef = useRef<FlatList<GridStoryItem>>(null);
  const hubGridScrollYRef = useRef(0);
  const viewerFeedRef = useRef<ViewerFeedItem[]>([]);
  const selectedViewerItemRef = useRef<ViewerFeedItem | null>(null);
  const openCtaRef = useRef<(story: LocalStory | null) => Promise<void>>(async () => {});
  const openHouseAdRef = useRef<(item: Extract<ViewerFeedItem, { kind: 'ad' }>) => Promise<void>>(async () => {});
  const openMarketVipRef = useRef<(item: Extract<ViewerFeedItem, { kind: 'market_vip' }>) => Promise<void>>(async () => {});

  const viewerTranslateX = useSharedValue(0);
  const viewerScreenWidth = useSharedValue(windowWidth);

  const [selectedType, setSelectedType] = useState<StoryAssetType>('image');
  const [selectedCardId, setSelectedCardId] = useState('');
  const [selectedCtaItemId, setSelectedCtaItemId] = useState('');
  const [selectedDuration, setSelectedDuration] = useState<StoryDuration>('24h');
  const [selectedMediaUri, setSelectedMediaUri] = useState('');
  const [selectedMediaName, setSelectedMediaName] = useState('');
  const [textDraft, setTextDraft] = useState('');
  const [textBgIndex, setTextBgIndex] = useState(0);
  const [textFontRole, setTextFontRole] = useState<TextFontRole>('serif');
  const [committedTextBgId, setCommittedTextBgId] = useState('');
  const [committedTextFont, setCommittedTextFont] = useState<TextFontRole>('serif');

  const selectedCard = useMemo(() => smartCards.find((c) => c.sid === selectedCardId) || null, [smartCards, selectedCardId]);

  /** Orden de slots de la tarjeta, sin ids repetidos (evita crash de React por keys duplicadas). */
  const vaultItemsOnSelectedCard = useMemo(() => {
    if (!selectedCard) {
      return [] as VaultItem[];
    }
    return orderedUniqueVaultItemsForCard(selectedCard.itemIds, vaultItems);
  }, [selectedCard, vaultItems]);

  const cardCtaOptions = vaultItemsOnSelectedCard;

  const selectedCtaItem = useMemo(
    () => cardCtaOptions.find((item) => item.id === selectedCtaItemId) || null,
    [cardCtaOptions, selectedCtaItemId]
  );

  const vaultMirrorItems = vaultItemsOnSelectedCard;

  const storyHubCardId = useMemo(
    () => resolveStoryHubCardId(viewerUid, smartCards, localStories),
    [viewerUid, smartCards, localStories],
  );

  const effectiveHubState = useMemo((): StoryState => {
    if (state !== 'none') {
      return state;
    }
    if (!viewerUid || !storyHubCardId) {
      return 'none';
    }
    const now = Date.now();
    const row = localStories.find(
      (s) =>
        s.uid === viewerUid &&
        s.sid === storyHubCardId &&
        Number.isFinite(Date.parse(String(s.expiresAt || ''))) &&
        Date.parse(String(s.expiresAt)) > now,
    );
    if (!row) {
      return 'none';
    }
    return row.state === 'vip' ? 'vip' : 'normal';
  }, [state, viewerUid, storyHubCardId, localStories]);

  const effectiveExpiresAt = useMemo(() => {
    if (expiresAt) {
      return expiresAt;
    }
    if (!viewerUid || !storyHubCardId) {
      return null;
    }
    const now = Date.now();
    const row = localStories.find(
      (s) =>
        s.uid === viewerUid &&
        s.sid === storyHubCardId &&
        Number.isFinite(Date.parse(String(s.expiresAt || ''))) &&
        Date.parse(String(s.expiresAt)) > now,
    );
    return row?.expiresAt ?? null;
  }, [expiresAt, viewerUid, storyHubCardId, localStories]);

  const cost7 = getPremiumStoryCost('7d');
  const cost30 = getPremiumStoryCost('30d');
  const shortOnCredits =
    creditsBalance !== null &&
    ((selectedDuration === '7d' && creditsBalance < cost7) || (selectedDuration === '30d' && creditsBalance < cost30));

  const gridItems = useMemo(() => {
    const localByOwnerCard = new Map<string, LocalStory>();
    localStories.forEach((s) => {
      localByOwnerCard.set(storyChannelKey(s.uid, s.sid), s);
    });
    const hubCardId = storyHubCardId;
    const selfChannelKey = viewerUid && hubCardId ? storyChannelKey(viewerUid, hubCardId) : '';
    const localSelfStory = selfChannelKey ? localByOwnerCard.get(selfChannelKey) ?? null : null;
    const hubCardRow = hubCardId ? smartCards.find((c) => c.sid === hubCardId) ?? null : null;

    const rows: GridStoryItem[] = contacts.map((row) => {
      const linkCh = String(row.sourceBId || row.sourceSid || '').trim();
      const key = linkCh ? storyChannelKey(row.uid, linkCh) : '';
      const localStory = key ? localByOwnerCard.get(key) ?? null : null;
      let storyState = row.storyState;
      if (storyState === 'none' && localStory) {
        const exp = Date.parse(String(localStory.expiresAt || ''));
        if (Number.isFinite(exp) && exp > Date.now()) {
          storyState = localStory.state === 'vip' ? 'vip' : 'normal';
        }
      }
      return {
        uid: row.uid,
        displayName: row.userFullName,
        cardName: row.cardName,
        sourceSid: row.sourceSid,
        sourceBId: row.sourceBId,
        userAvatarUrl: row.userAvatarUrl,
        storyState,
        isFavorite: Boolean(
          favoritesByUid[receivedContactMergeKey({ uid: row.uid, sid: row.sourceSid, bId: row.sourceBId })] ||
            favoritesByUid[row.uid],
        ),
        localStory,
      };
    });

    const hasSelfInContacts = selfChannelKey
      ? rows.some((r) => storyChannelKey(r.uid, String(r.sourceBId || r.sourceSid || '').trim()) === selfChannelKey)
      : true;
    if (selfChannelKey && viewerUid && hubCardId && (hubCardRow || localSelfStory) && !hasSelfInContacts) {
      const effectiveSelfState: StoryState =
        effectiveHubState !== 'none' ? effectiveHubState : localSelfStory ? 'normal' : 'none';
      rows.push({
        uid: viewerUid,
        displayName: ownerName,
        cardName: hubCardRow?.scName ?? localSelfStory?.cardName ?? tr('Mi tarjeta', 'My card'),
        sourceSid: hubCardId,
        sourceBId: null,
        userAvatarUrl: ownerUserAvatar,
        storyState: effectiveSelfState,
        isFavorite: false,
        localStory: localSelfStory,
        isSelf: true,
      });
    }

    rows.sort((a, b) => {
      const selfDiff = Number(Boolean(b.isSelf)) - Number(Boolean(a.isSelf));
      if (selfDiff !== 0) {
        return selfDiff;
      }
      const vipDiff = Number(b.storyState === 'vip') - Number(a.storyState === 'vip');
      if (vipDiff !== 0) {
        return vipDiff;
      }
      const favDiff = Number(b.isFavorite) - Number(a.isFavorite);
      if (favDiff !== 0) {
        return favDiff;
      }
      return String(a.cardName).localeCompare(String(b.cardName), language === 'es' ? 'es' : language === 'de' ? 'de' : 'en', {
        sensitivity: 'base',
      });
    });

    return rows;
  }, [
    contacts,
    effectiveHubState,
    favoritesByUid,
    language,
    localStories,
    ownerName,
    ownerUserAvatar,
    viewerUid,
    smartCards,
    storyHubCardId,
  ]);

  const selfHubItem = useMemo(() => {
    const flagged = gridItems.find((g) => g.isSelf);
    if (flagged) {
      return flagged;
    }
    if (!viewerUid || !storyHubCardId) {
      return null;
    }
    const key = storyChannelKey(viewerUid, storyHubCardId);
    return gridItems.find((g) => storyChannelKey(g.uid, String(g.sourceBId || g.sourceSid || '').trim()) === key) ?? null;
  }, [gridItems, viewerUid, storyHubCardId]);

  const viewerFeed = useMemo<ViewerFeedItem[]>(() => {
    const now = Date.now();
    const storyItems: ViewerFeedItem[] = gridItems
      .filter((item) => {
        if (item.storyState !== 'none') {
          return true;
        }
        const exp = Date.parse(String(item.localStory?.expiresAt || ''));
        return Boolean(item.localStory) && Number.isFinite(exp) && exp > now;
      })
      .map((item) => {
        let storyState = item.storyState;
        if (storyState === 'none' && item.localStory) {
          const exp = Date.parse(String(item.localStory.expiresAt || ''));
          if (Number.isFinite(exp) && exp > now) {
            storyState = item.localStory.state === 'vip' ? 'vip' : 'normal';
          }
        }
        return {
          kind: 'story' as const,
          uid: item.uid,
          displayName: item.displayName,
          cardName: item.cardName,
          sourceSid: item.sourceSid,
          sourceBId: item.sourceBId,
          userAvatarUrl: item.userAvatarUrl,
          storyState,
          isFavorite: item.isFavorite,
          localStory: item.localStory,
        };
      });

    const feed: ViewerFeedItem[] = [];
    let vipCursor = 0;
    const vipList = vipMarketSlots;

    for (let i = 0; i < storyItems.length; i += 1) {
      feed.push(storyItems[i]);
      if ((i + 1) % 3 === 0) {
        const vip = vipList.length > 0 ? vipList[vipCursor % vipList.length] : null;
        if (vip) {
          vipCursor += 1;
          feed.push({
            kind: 'market_vip',
            id: vip.id,
            businessCardId: vip.businessCardId,
            bcName: vip.bcName,
            photoUrl: vip.photoUrl,
            subtitle: vip.subtitle,
            distanceMiles: vip.distanceMiles,
            ctaLabel: vip.ctaLabel,
            ctaUrl: vip.ctaUrl,
          });
        } else {
          feed.push({
            kind: 'ad',
            id: `house-${Math.floor((i + 1) / 3)}`,
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
    }
    return feed;
  }, [gridItems, houseAd, vipMarketSlots]);

  const viewerFeedOpenSignature = useMemo(
    () =>
      viewerFeed
        .map((f) =>
          f.kind === 'story'
            ? `s:${storyChannelKey(f.uid, String(f.sourceBId || f.sourceSid || '').trim())}`
            : f.kind === 'market_vip'
              ? `m:${f.businessCardId}`
              : `a:${f.id}`,
        )
        .join('|'),
    [viewerFeed],
  );

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!openStoryParam && !openMarketVipParam) {
      return;
    }
    if (!viewerFeed.length) {
      router.setParams({ openStory: undefined, openMarketVip: undefined });
      return;
    }
    let idx = -1;
    if (openStoryParam) {
      idx = viewerFeed.findIndex(
        (f) =>
          f.kind === 'story' &&
          storyChannelKey(f.uid, String(f.sourceBId || f.sourceSid || '').trim()) === openStoryParam,
      );
    } else if (openMarketVipParam) {
      idx = viewerFeed.findIndex((f) => f.kind === 'market_vip' && f.businessCardId === openMarketVipParam);
    }
    if (idx >= 0) {
      setViewerIndex(idx);
      setViewerVisible(true);
    }
    router.setParams({ openStory: undefined, openMarketVip: undefined });
  }, [loading, openStoryParam, openMarketVipParam, viewerFeed, viewerFeedOpenSignature]);

  const selectedViewerItem = useMemo(() => {
    if (!viewerFeed.length) {
      return null;
    }
    return viewerFeed[Math.min(viewerIndex, viewerFeed.length - 1)] || null;
  }, [viewerFeed, viewerIndex]);

  useEffect(() => {
    viewerFeedRef.current = viewerFeed;
  }, [viewerFeed]);

  useEffect(() => {
    selectedViewerItemRef.current = selectedViewerItem;
  }, [selectedViewerItem]);

  useEffect(() => {
    viewerScreenWidth.value = windowWidth;
  }, [windowWidth, viewerScreenWidth]);

  const resetCreateForm = () => {
    setSelectedType('image');
    setSelectedCardId('');
    setSelectedCtaItemId('');
    setVaultMirrorSelectionId('');
    setSelectedDuration('24h');
    setSelectedMediaUri('');
    setSelectedMediaName('');
    setTextDraft('');
    setTextBgIndex(0);
    setTextFontRole('serif');
    setCommittedTextBgId('');
    setCommittedTextFont('serif');
    storyPickedVideoDurationSecRef.current = null;
  };

  const closeTextComposerModal = useCallback(() => {
    setTextComposerVisible(false);
    if (resumeCreateAfterTextComposerRef.current) {
      resumeCreateAfterTextComposerRef.current = false;
      setCreateVisible(true);
    }
  }, []);

  const openCreate = async () => {
    resetCreateForm();
    let effectiveCards = dedupeSmartCardsBySid(smartCards);
    if (effectiveCards.length === 0) {
      const uid = viewerUid || (await getActiveUserId());
      if (uid) {
        try {
          const raw = await readSmartCardsJsonWithLegacyMigration(uid);
          if (raw) {
            const fromCache = mapCachedSmartCardsToStoryRows(raw);
            if (fromCache.length > 0) {
              setSmartCards(fromCache);
              effectiveCards = dedupeSmartCardsBySid(fromCache);
            }
          }
        } catch {
          /* ignore */
        }
      }
    }
    if (!effectiveCards.length) {
      Alert.alert(
        tr('Sin tarjetas', 'No cards'),
        tr('Crea una tarjeta en Mis Tarjetas para publicar historias.', 'Create a card under My Cards to publish stories.'),
        [
          { text: tr('OK', 'OK'), style: 'cancel' },
          { text: tr('Ir a Mis Tarjetas', 'Go to My Cards'), onPress: () => router.push('/(tabs)/cards') },
        ],
      );
      return;
    }
    setSelectedCardId(effectiveCards[0]?.sid || '');
    setCardPickerVisible(true);
  };

  const proceedFromCardPicker = () => {
    const card = smartCards.find((c) => c.sid === selectedCardId);
    if (!card) {
      Alert.alert(tr('Elige tarjeta', 'Pick a card'), tr('Selecciona desde cual tarjeta quieres publicar.', 'Select which card you publish from.'));
      return;
    }
    if (!card.itemIds?.length) {
      Alert.alert(
        tr('Sin iconos en esta tarjeta', 'No icons on this card'),
        tr('Anade datos del Bunker a esta tarjeta en Mis Tarjetas antes de publicar.', 'Add Bunker fields to this card under My Cards first.'),
        [
          { text: tr('OK', 'OK'), style: 'cancel' },
          { text: tr('Ir a Mis Tarjetas', 'Go to My Cards'), onPress: () => router.push('/(tabs)/cards') },
        ],
      );
      return;
    }
    setVaultMirrorSelectionId('');
    setCardPickerVisible(false);
    setVaultMirrorVisible(true);
  };

  const refreshCredits = useCallback(async () => {
    const uid = await getActiveUserId();
    if (!uid) {
      setCreditsBalance(null);
      return;
    }
    const bal = await getUserCreditsBalance(uid);
    setCreditsBalance(bal);
  }, []);

  useEffect(() => {
    if (createVisible) {
      void refreshCredits();
    }
  }, [createVisible, refreshCredits]);

  const loadStoriesHub = async (opts?: { background?: boolean }) => {
    const background = Boolean(opts?.background);
    try {
      if (!background) {
        setLoading(true);
      }
      const uid = await getActiveUserId();
      if (!uid) {
        setState('none');
        setExpiresAt(null);
        setContacts([]);
        setLocalStories([]);
        setVipMarketSlots([]);
        return;
      }

      setViewerUid(uid);
      setOwnerName(tr('Mi Story', 'My Story'));
      setOwnerUserAvatar(null);

      try {
        const cardsCacheRaw = await readSmartCardsJsonWithLegacyMigration(uid);
        if (cardsCacheRaw) {
          const fromCache = mapCachedSmartCardsToStoryRows(cardsCacheRaw);
          if (fromCache.length > 0) {
            setSmartCards(dedupeSmartCardsBySid(fromCache));
          }
        }
      } catch {
        /* misma tolerancia que cards.tsx al leer caché */
      }

      const [contactsResponse, cardsResponse, houseAdResponse] = await Promise.all([
        listReceivedContacts({ uid }),
        listSmartCardsFromDb({ uid }),
        getStoriesHouseAd({ uid }),
      ]);

      const cardsRows = dedupeSmartCardsBySid(
        cardsResponse.cards.map((row) => {
          const isBiz = row.cardType === 'business';
          const sid = isBiz ? String(row.bId || '').trim() : String(row.sid || '').trim();
          return {
            sid,
            scName: String(row.scName ?? trAction('Smart Card', 'Smart Card')),
            itemIds: row.itemIds,
            bId: isBiz ? String(row.bId || '').trim() || null : null,
          };
        }),
      );
      if (cardsRows.length > 0) {
        setSmartCards(cardsRows);
      }

      const loadNow = Date.now();
      const storiesRawEarly = await AsyncStorage.getItem(getStoriesStorageKey(uid));
      const storiesParsedRaw = storiesRawEarly ? (JSON.parse(storiesRawEarly) as unknown[]) : [];
      const storiesParsedEarly = (Array.isArray(storiesParsedRaw) ? storiesParsedRaw : []).map((raw) => {
        const legacy = raw as Record<string, unknown>;
        const LEGACY_UID_KEY = 'owner' + 'Uid';
        const LEGACY_SID_KEY = 'card' + 'Id';
        const uid = String(legacy.uid ?? (legacy as Record<string, unknown>)[LEGACY_UID_KEY] ?? '').trim();
        const sid = String(legacy.sid ?? (legacy as Record<string, unknown>)[LEGACY_SID_KEY] ?? '').trim();
        const s = raw as LocalStory & { ownerPhotoUrl?: string | null; userAvatarUrl?: string | null };
        return {
          ...s,
          uid: uid || s.uid,
          sid: sid || s.sid,
          ownerUserAvatar: s.ownerUserAvatar ?? s.userAvatarUrl ?? s.ownerPhotoUrl ?? null,
        };
      });
      const activeStoriesEarly = storiesParsedEarly.filter((story) => {
        const exp = Date.parse(String(story.expiresAt || ''));
        return Number.isFinite(exp) && exp > loadNow;
      });
      const hubCardId = resolveStoryHubCardId(uid, cardsRows, activeStoriesEarly);

      const stateResponse = await getMyStoryState({
        uid,
        ...(hubCardId ? { sid: hubCardId } : {}),
      });
      setState(stateResponse.state);
      setExpiresAt(stateResponse.expiresAt);

      setContacts(
        contactsResponse.contacts.map((row) => ({
          uid: row.uid,
          userFullName: row.userFullName,
          userNickName: row.userNickName,
          userAvatarUrl: row.userAvatarUrl,
          cardName: row.cardName,
          sourceSid: row.sid ?? null,
          sourceBId: row.bId ?? null,
          storyState: row.storyState || 'none',
        }))
      );

      try {
        const profSnap = await getDoc(doc(db, 'users', uid));
        const pd = profSnap.data() as Record<string, unknown> | undefined;
        if (pd) {
          setOwnerName(readUserFullName(pd));
          const av = readUserAvatarUrl(pd);
          setOwnerUserAvatar(av ? av : null);
        }
      } catch {
        /* perfil opcional */
      }
      setHouseAd(houseAdResponse.ad || FALLBACK_HOUSE_AD);

      let lat: number | null = null;
      let lon: number | null = null;
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        }
      } catch {
        /* sin GPS: igual inyectamos VIP sin filtro de millas */
      }

      const slots = await fetchVipMarketStorySlots({
        viewerUid: uid,
        contactUids: contactsResponse.contacts.map((c) => c.uid),
        userLatitude: lat,
        userLongitude: lon,
        radiusMiles: 15,
      });
      setVipMarketSlots(slots);

      const [metaRaw, vaultRaw] = await Promise.all([
        AsyncStorage.getItem(CONTACT_META_STORAGE_KEY),
        readVaultJsonWithLegacyMigration(uid),
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
      const activeStories = activeStoriesEarly.filter((story) => {
        const exp = Date.parse(String(story.expiresAt || ''));
        return Number.isFinite(exp) && exp > now;
      });
      setLocalStories(activeStories);
      await AsyncStorage.setItem(getStoriesStorageKey(uid), JSON.stringify(activeStories));

    } catch {
      setState('none');
      setExpiresAt(null);
      setHouseAd(FALLBACK_HOUSE_AD);
      setVipMarketSlots([]);
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadStoriesHub();
  }, []);

  useEffect(() => {
    if (viewerUid) {
      setOwnerName(language === 'en' || language === 'de' ? 'My Story' : 'Mi Story');
    }
  }, [language, viewerUid]);

  useEffect(() => {
    if (!viewerVisible || !viewerFeed.length) {
      if (exposureTimerRef.current) {
        clearTimeout(exposureTimerRef.current);
        exposureTimerRef.current = null;
      }
      setSegmentProgress(0);
      return;
    }

    setSegmentProgress(0);
    exposureTimerRef.current = setTimeout(() => {
      setViewerIndex((prev) => {
        if (!viewerFeed.length) {
          return 0;
        }
        return (prev + 1) % viewerFeed.length;
      });
    }, STORY_EXPOSURE_MS);

    const t0 = Date.now();
    const progressId = setInterval(() => {
      setSegmentProgress(Math.min(1, (Date.now() - t0) / STORY_EXPOSURE_MS));
    }, 100);

    return () => {
      clearInterval(progressId);
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
        throw new Error(tr('No se pudo validar tu sesion.', 'Could not validate your session.'));
      }

      const hubCardId = storyHubCardId || smartCards[0]?.sid;
      if (!hubCardId) {
        Alert.alert(
          tr('Tarjeta requerida', 'Card required'),
          tr('Necesitas al menos una tarjeta para sincronizar el estado de Story con el backend.', 'You need at least one card to sync Story state with the backend.'),
        );
        return;
      }
      const response = await setMyStoryState({
        uid,
        state: nextState,
        sid: hubCardId,
      });
      setState(response.state);
      setExpiresAt(response.expiresAt);

      if (nextState === 'vip') {
        Alert.alert(
          tr('Historia VIP activada', 'VIP Story activated'),
          tr('Tu historia premium estará visible 7 días.', 'Your premium Story stays visible for 7 days.'),
        );
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
      quality: 1,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];
    const normalized = await normalizeStoryPickedImageAuto(asset.uri);
    if ('error' in normalized) {
      Alert.alert(
        tr('Imagen demasiado grande', 'Image too large'),
        tr(
          'La foto supera el límite tras comprimir (máx. 5 MB y 1920 px). Prueba otra o recórtala en la galería.',
          'The photo still exceeds limits after compression (max 5 MB and 1920 px). Try another or crop in Photos.',
        ),
      );
      return;
    }
    storyPickedVideoDurationSecRef.current = null;
    setSelectedType('image');
    setSelectedMediaUri(normalized.uri);
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
      allowsEditing: false,
      videoMaxDuration: STORY_VIDEO_MAX_DURATION_SEC,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame1280x720,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];
    const checked = await validateStoryVideoAsset(asset, tr);
    if (!checked.ok) {
      Alert.alert(tr('Video no válido', 'Invalid video'), checked.message);
      return;
    }
    storyPickedVideoDurationSecRef.current = checked.durationSec;
    setSelectedType('video');
    setSelectedMediaUri(asset.uri);
    setSelectedMediaName(asset.fileName || 'story-video.mp4');
  };

  const pickImageFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(tr('Permiso requerido', 'Permission required'), tr('Necesitamos acceso a la camara.', 'We need camera access.'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
    if (result.canceled || !result.assets?.length) {
      return;
    }
    const asset = result.assets[0];
    const normalized = await normalizeStoryPickedImageAuto(asset.uri);
    if ('error' in normalized) {
      Alert.alert(
        tr('Imagen demasiado grande', 'Image too large'),
        tr(
          'La foto supera el límite tras comprimir (máx. 5 MB y 1920 px). Prueba otra.',
          'The photo still exceeds limits after compression (max 5 MB and 1920 px). Try another.',
        ),
      );
      return;
    }
    storyPickedVideoDurationSecRef.current = null;
    setSelectedType('image');
    setSelectedMediaUri(normalized.uri);
    setSelectedMediaName(asset.fileName || 'story-camera.jpg');
  };

  const pickVideoFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(tr('Permiso requerido', 'Permission required'), tr('Necesitamos acceso a la camara.', 'We need camera access.'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      videoMaxDuration: STORY_VIDEO_MAX_DURATION_SEC,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame1280x720,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    });
    if (result.canceled || !result.assets?.length) {
      return;
    }
    const asset = result.assets[0];
    const checked = await validateStoryVideoAsset(asset, tr);
    if (!checked.ok) {
      Alert.alert(tr('Video no válido', 'Invalid video'), checked.message);
      return;
    }
    storyPickedVideoDurationSecRef.current = checked.durationSec;
    setSelectedType('video');
    setSelectedMediaUri(asset.uri);
    setSelectedMediaName(asset.fileName || 'story-camera.mp4');
  };

  const confirmVaultMirrorSelection = () => {
    const card = smartCards.find((c) => c.sid === selectedCardId);
    if (!card) {
      Alert.alert(tr('Tarjeta invalida', 'Invalid card'), tr('Vuelve a elegir la tarjeta emisora.', 'Pick the source card again.'));
      return;
    }
    if (!vaultMirrorSelectionId) {
      Alert.alert(tr('Selecciona un icono', 'Pick an icon'), tr('Elige un unico dato del Bunker como CTA.', 'Choose one vault item as the story CTA.'));
      return;
    }
    if (!card.itemIds.includes(vaultMirrorSelectionId)) {
      Alert.alert(
        tr('CTA no permitido', 'CTA not allowed'),
        tr('Este dato no pertenece a la tarjeta seleccionada.', 'This field is not on the selected card.'),
      );
      return;
    }
    setSelectedCtaItemId(vaultMirrorSelectionId);
    setVaultMirrorVisible(false);
    setCreateVisible(true);
  };

  const applyTextComposer = () => {
    const body = textDraft.trim();
    if (!body) {
      Alert.alert(tr('Texto vacio', 'Empty text'), tr('Escribe algo en el lienzo.', 'Write something on the canvas.'));
      return;
    }
    const bg = TEXT_STORY_BACKGROUNDS[textBgIndex] ?? TEXT_STORY_BACKGROUNDS[0];
    setCommittedTextBgId(bg.id);
    setCommittedTextFont(textFontRole);
    storyPickedVideoDurationSecRef.current = null;
    setSelectedType('text');
    setSelectedMediaUri(body);
    setSelectedMediaName('story-text');
    setTextComposerVisible(false);
    if (resumeCreateAfterTextComposerRef.current) {
      resumeCreateAfterTextComposerRef.current = false;
      setCreateVisible(true);
    }
  };

  const publishStory = async () => {
    try {
      if (!viewerUid) {
        throw new Error(tr('No se pudo validar sesion.', 'Could not validate your session.'));
      }
      if (!selectedCard) {
        Alert.alert(tr('Tarjeta requerida', 'Card required'), tr('Selecciona la tarjeta emisora para la historia.', 'Select the source card for the story.'));
        return;
      }
      const hasMedia =
        selectedType === 'text' ? String(selectedMediaUri || '').trim().length > 0 : Boolean(selectedMediaUri);
      if (!hasMedia) {
        Alert.alert(
          tr('Contenido requerido', 'Content required'),
          tr('Agrega foto, video o texto desde el lienzo.', 'Add a photo, video, or text from the canvas.'),
        );
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
          ? tr('Ver PDF', 'View PDF')
          : ctaTypeLower.includes('map')
            ? tr('Ir a Ubicación', 'Open location')
            : ctaTypeLower.includes('whatsapp')
              ? tr('Contactar WhatsApp', 'Contact on WhatsApp')
              : tr('Contacto Directo', 'Direct contact');

      if (selectedDuration === '7d' || selectedDuration === '30d') {
        const bId = selectedCard.bId && String(selectedCard.bId).trim();
        if (!bId) {
          Alert.alert(
            tr('Tarjeta de negocio requerida', 'Business card required'),
            tr(
              'Las historias de 7 u 30 días solo aplican a tarjetas de negocio. Crea o selecciona una Business Card.',
              '7–30 day stories only apply to business cards. Create or select a Business Card.',
            ),
          );
          return;
        }
        const licensed = await hasActiveBusinessLicense(viewerUid, bId);
        if (!licensed) {
          Alert.alert(
            tr('Licencia anual requerida', 'Annual license required'),
            tr(
              'Solo tarjetas de negocio con anualidad activa pueden publicar historias CTA de 7-30 días.',
              'Only business cards with an active annual subscription can publish 7–30 day CTA stories.',
            ),
          );
          return;
        }
      }

      const story: LocalStory = {
        id: `${now}`,
        uid: viewerUid,
        ownerName,
        ownerUserAvatar,
        sid: selectedCard.sid,
        cardName: selectedCard.scName,
        storyType: selectedType,
        mediaUri: selectedType === 'text' ? String(selectedMediaUri).trim() : selectedMediaUri,
        mediaName:
          selectedMediaName ||
          (selectedType === 'image' ? 'story-image' : selectedType === 'video' ? 'story-video' : selectedType === 'text' ? 'story-text' : 'story-document'),
        ...(selectedType === 'text'
          ? {
              backgroundKey: committedTextBgId || TEXT_STORY_BACKGROUNDS[0].id,
              textFontRole: committedTextFont,
            }
          : {}),
        ctaVaultItemId: selectedCtaItem.id,
        ctaTitle: ctaActionLabel,
        ctaValue: selectedCtaItem.value,
        ctaType: selectedCtaItem.type,
        state: nextState,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlMs).toISOString(),
        ...(selectedType === 'video' && storyPickedVideoDurationSecRef.current != null
          ? { mediaDurationSec: storyPickedVideoDurationSecRef.current }
          : {}),
      };

      const nextStories = [
        story,
        ...localStories.filter((s) => !(s.uid === viewerUid && s.sid === selectedCard.sid)),
      ];
      setLocalStories(nextStories);
      await AsyncStorage.setItem(getStoriesStorageKey(viewerUid), JSON.stringify(nextStories));

      // Deduct credits for premium durations
      if (selectedDuration === '7d' || selectedDuration === '30d') {
        try {
          const creditDeducted = await purchasePremiumStoryWithCredits(viewerUid, selectedDuration);
          if (!creditDeducted) {
            // Revert story if credit deduction failed
            const revertedStories = localStories.filter(
              (s) => !(s.uid === viewerUid && s.sid === selectedCard.sid)
            );
            setLocalStories(revertedStories);
            await AsyncStorage.setItem(getStoriesStorageKey(viewerUid), JSON.stringify(revertedStories));
            const required = getPremiumStoryCost(selectedDuration);
            Alert.alert(tr('Créditos insuficientes', 'Insufficient credits'), tr(`Necesitas ${required} CS para publicar esta Story Premium.`, `You need ${required} CS to publish this Premium Story.`));
            return;
          }
        } catch (creditError: any) {
          Alert.alert(tr('Error de créditos', 'Credits error'), creditError?.message || tr('No se pudo procesar los créditos.', 'Could not process credits.'));
          return;
        }
      }

      const response = await setMyStoryState({
        uid: viewerUid,
        state: nextState,
        sid: selectedCard.sid,
      });
      setState(response.state);
      setExpiresAt(response.expiresAt);

      setCreateVisible(false);
      resetCreateForm();
      Alert.alert(
        tr('Historia publicada', 'Story published'),
        selectedDuration === '30d'
          ? tr('Premium activa por 30 días con CTA.', 'Premium active for 30 days with CTA.')
          : selectedDuration === '7d'
            ? tr('Premium activa por 7 días con CTA.', 'Premium active for 7 days with CTA.')
            : tr('Historia gratuita activa por 24 h.', 'Free story active for 24 hours.'),
      );

      InteractionManager.runAfterInteractions(() => {
        void loadStoriesHub({ background: true }).catch(() => undefined);
      });
    } catch (error: any) {
      Alert.alert(tr('No se pudo publicar', 'Could not publish'), error?.message || tr('Intenta nuevamente.', 'Try again.'));
    }
  };

  const openStoryViewer = (item: GridStoryItem) => {
    const localExp = Date.parse(String(item.localStory?.expiresAt || ''));
    const hasPlayableLocal =
      Boolean(item.localStory) && Number.isFinite(localExp) && localExp > Date.now();
    if (item.storyState === 'none' && !hasPlayableLocal) {
      Alert.alert(tr('Sin Story activa', 'No active Story'), tr('Este perfil no tiene una historia activa en este momento.', 'This profile has no active story at this moment.'));
      return;
    }

    const startIndex = viewerFeed.findIndex(
      (feedItem) =>
        feedItem.kind === 'story' &&
        feedItem.uid === item.uid &&
        feedItem.sourceSid === item.sourceSid &&
        feedItem.sourceBId === item.sourceBId
    );
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
    trackCardAnalyticsFireAndForget({
      sid: story.sid,
      bId: null,
      iconType: String(story.ctaType || 'story_cta'),
      source: 'story',
    });
    const value = String(story.ctaValue || '').trim();
    const type = String(story.ctaType || '').toLowerCase();
    const tNorm = type.normalize('NFD').replace(/\p{M}/gu, '');

    if (isGhostLinkVaultType(story.ctaType)) {
      await ActionController.ActionGhostLinkVaultItem({
        targetUid: story.uid,
        sourceCardName: story.cardName,
        sourceSid: story.sid,
        sourceBId: null,
        userName: story.ownerName || tr('este contacto', 'this contact'),
        cardPhoto: story.ownerUserAvatar,
        peerPhotoUrl: story.ownerUserAvatar,
      });
      return;
    }

    if (tNorm.includes('tel') || type.includes('teléfono') || type.includes('telefono') || type.includes('phone')) {
      await ActionController.ActionGhostLinkVaultItem({
        targetUid: story.uid,
        sourceCardName: story.cardName,
        sourceSid: story.sid,
        sourceBId: null,
        userName: story.ownerName || tr('este contacto', 'this contact'),
        cardPhoto: story.ownerUserAvatar,
        peerPhotoUrl: story.ownerUserAvatar,
      });
      return;
    }

    if (type.includes('email')) {
      ActionController.ActionEmail({ value });
    } else if (type.includes('enlace') || type.includes('link') || type.includes('web')) {
      ActionController.ActionLink({ value, title: story.ctaTitle });
    } else if (type.includes('documento') || type.includes('pdf')) {
      ActionController.ActionDocument({ value });
    } else if (type.includes('texto')) {
      ActionController.ActionText({ value, title: story.ctaTitle });
    } else {
      Alert.alert(tr('CTA disponible', 'CTA available'), `${story.ctaTitle}: ${value}`);
    }
  };

  const openHouseAdCta = async (item: Extract<ViewerFeedItem, { kind: 'ad' }>) => {
    // Hard Lock: Require biometric before opening ad CTA (Nivel 6.6)
    const authenticated = await hardLockCheck(tr('anuncio de propiedad', 'property listing'));
    if (!authenticated) {
      return;
    }

    if (!item.ctaUrl) {
      Alert.alert(
        tr('Mi Sueño Mexicano', 'My Mexican Dream'),
        `${item.priceLabel} \n${item.locationLabel}`,
      );
      return;
    }

    try {
      const url = item.ctaUrl.startsWith('http://') || item.ctaUrl.startsWith('https://') ? item.ctaUrl : `https://${item.ctaUrl}`;
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        tr('No se pudo abrir', 'Could not open'),
        tr('Revisa el enlace del anuncio en el servidor.', 'Check the ad link on the server.'),
      );
    }
  };

  const openMarketVipCta = async (item: Extract<ViewerFeedItem, { kind: 'market_vip' }>) => {
    const authenticated = await hardLockCheck(tr('negocio mercado VIP', 'VIP market business'));
    if (!authenticated) {
      return;
    }
    trackCardAnalyticsFireAndForget({
      sid: null,
      bId: item.businessCardId,
      iconType: 'market_vip_cta',
      source: 'story',
    });
    if (!item.ctaUrl) {
      Alert.alert(item.bcName, item.subtitle || tr('Sin enlace publicado.', 'No link published.'));
      return;
    }
    try {
      const url = item.ctaUrl.startsWith('http://') || item.ctaUrl.startsWith('https://') ? item.ctaUrl : `https://${item.ctaUrl}`;
      await Linking.openURL(url);
    } catch {
      Alert.alert(tr('No se pudo abrir', 'Could not open'), tr('Revisa el enlace del negocio.', 'Check the business link.'));
    }
  };

  openCtaRef.current = openCta;
  openHouseAdRef.current = openHouseAdCta;
  openMarketVipRef.current = openMarketVipCta;

  const restoreHubGridScroll = useCallback(() => {
    requestAnimationFrame(() => {
      hubGridListRef.current?.scrollToOffset({ offset: hubGridScrollYRef.current, animated: false });
    });
  }, []);

  const finishSwipeClose = useCallback(() => {
    setViewerVisible(false);
    viewerTranslateX.value = 0;
    restoreHubGridScroll();
  }, [restoreHubGridScroll, viewerTranslateX]);

  const closeViewer = useCallback(() => {
    setViewerVisible(false);
    viewerTranslateX.value = 0;
    restoreHubGridScroll();
  }, [restoreHubGridScroll, viewerTranslateX]);

  const previousStory = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewerIndex((prev) => {
      const len = viewerFeedRef.current.length;
      if (!len) return 0;
      return prev === 0 ? len - 1 : prev - 1;
    });
  }, []);

  const nextStory = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewerIndex((prev) => {
      const len = viewerFeedRef.current.length;
      if (!len) return 0;
      return (prev + 1) % len;
    });
  }, []);

  const navigateViewerByTapX = useCallback(
    (absoluteX: number) => {
      const half = windowWidth / 2;
      if (absoluteX < half) {
        previousStory();
      } else {
        nextStory();
      }
    },
    [windowWidth, previousStory, nextStory],
  );

  const triggerDoubleTapCtaFromViewer = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const item = selectedViewerItemRef.current;
    if (!item) return;
    if (item.kind === 'ad') {
      void openHouseAdRef.current(item);
    } else if (item.kind === 'market_vip') {
      void openMarketVipRef.current(item);
    } else if (item.kind === 'story') {
      void openCtaRef.current(item.localStory);
    }
  }, []);

  const viewerBodyGesture = useMemo(() => {
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        runOnJS(triggerDoubleTapCtaFromViewer)();
      });

    const singleTap = Gesture.Tap()
      .numberOfTaps(1)
      .onEnd((e) => {
        runOnJS(navigateViewerByTapX)(e.absoluteX);
      });

    const taps = Gesture.Exclusive(doubleTap, singleTap);

    const pan = Gesture.Pan()
      .activeOffsetX(14)
      .failOffsetY([-26, 26])
      .onUpdate((e) => {
        if (e.translationX > 0) {
          viewerTranslateX.value = e.translationX;
        }
      })
      .onEnd((e) => {
        const w = viewerScreenWidth.value;
        const threshold = Math.min(112, w * 0.3);
        const shouldClose = e.translationX > threshold || e.velocityX > 520;
        if (shouldClose) {
          viewerTranslateX.value = withTiming(
            w,
            { duration: 300, easing: Easing.out(Easing.cubic) },
            (finished) => {
              if (finished) {
                runOnJS(finishSwipeClose)();
              }
            },
          );
        } else {
          viewerTranslateX.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
        }
      });

    return Gesture.Simultaneous(pan, taps);
  }, [finishSwipeClose, navigateViewerByTapX, triggerDoubleTapCtaFromViewer, viewerScreenWidth, viewerTranslateX]);

  const viewerPanStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: viewerTranslateX.value }],
  }));

  useEffect(() => {
    if (viewerVisible) {
      viewerTranslateX.value = 0;
    }
  }, [viewerVisible, viewerTranslateX]);

  const statusLabel = useMemo(() => {
    if (effectiveHubState === 'vip') {
      return tr('Premium (VIP Bronce / VIP Gold)', 'Premium (Bronze / Gold VIP)');
    }
    if (effectiveHubState === 'normal') {
      return tr('Normal (24h)', 'Normal (24h)');
    }
    return tr('Sin Story activa', 'No active Story');
  }, [effectiveHubState, language]);

  const expiryLabel = useMemo(() => {
    const prefix = language === 'en' || language === 'de' ? 'Expires: ' : 'Expira: ';
    const empty = `${prefix}—`;
    if (!effectiveExpiresAt) {
      return empty;
    }
    const d = new Date(effectiveExpiresAt);
    if (Number.isNaN(d.getTime())) {
      return empty;
    }
    const locale = intlLocaleTagForAppLanguage(language);
    const f = new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
    return `${prefix}${f}`;
  }, [effectiveExpiresAt, language]);

  const viewerEmitterLabel = useMemo(() => {
    const item = selectedViewerItem;
    if (!item) {
      return '';
    }
    if (item.kind === 'ad') {
      return item.title;
    }
    if (item.kind === 'market_vip') {
      return item.bcName;
    }
    return item.displayName || item.cardName;
  }, [selectedViewerItem]);

  const viewerElapsedLabel = useMemo(() => {
    const totalSec = Math.max(1, Math.round(STORY_EXPOSURE_MS / 1000));
    const curSec = Math.min(totalSec, Math.floor((segmentProgress * STORY_EXPOSURE_MS) / 1000));
    const fmt = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
    return `${fmt(curSec)} / ${fmt(totalSec)}`;
  }, [segmentProgress]);

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
          {item.userAvatarUrl ? (
            <ExpoImage
              source={{
                uri: resolveVaultMediaUrlForApp(item.userAvatarUrl) ?? item.userAvatarUrl,
              }}
              style={styles.gridAvatar}
              cachePolicy="disk"
            />
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
        <Text style={[styles.title, { color: shell.textPrimary }]}>{tr('Centro de historias', 'Stories Hub')}</Text>
        <Text style={[styles.subtitle, { color: shell.textSecondary }]}>
          {tr('VIP primero, luego favoritos, luego general', 'VIP first, then favorites, then everyone else')}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={shell.loaderAccent} size="large" />
        </View>
      ) : (
        <>
          <TouchableOpacity
            activeOpacity={!selfHubItem || selfHubItem.storyState === 'none' ? 1 : 0.92}
            disabled={!selfHubItem || selfHubItem.storyState === 'none'}
            onPress={() => {
              if (!selfHubItem) {
                return;
              }
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openStoryViewer(selfHubItem);
            }}
            accessibilityRole="button"
            accessibilityLabel={tr('Abrir mi historia', 'Open my story')}
          >
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
                    name={effectiveHubState === 'vip' ? 'star-circle' : effectiveHubState === 'normal' ? 'checkbox-marked-circle-outline' : 'circle-off-outline'}
                    size={20}
                    color={effectiveHubState === 'vip' ? shell.ctaAccent : effectiveHubState === 'normal' ? shell.success : shell.textMuted}
                  />
                  <Text style={[styles.statusText, { color: shell.textPrimary }]}>{statusLabel}</Text>
                </View>
                <Text style={[styles.expiryText, { color: shell.textSecondary }]}>{expiryLabel}</Text>
                {selfHubItem && selfHubItem.storyState !== 'none' ? (
                  <Text style={[styles.hintText, { color: shell.textSecondary, marginTop: 6 }]}>
                    {tr('Toca para ver en pantalla completa', 'Tap to view full screen')}
                  </Text>
                ) : null}
              </BlurView>
            </LinearGradient>
          </TouchableOpacity>

          <FlatList
            ref={hubGridListRef}
            data={gridItems}
            keyExtractor={(item) => storyChannelKey(item.uid, String(item.sourceBId || item.sourceSid || '').trim())}
            numColumns={4}
            contentContainerStyle={styles.gridWrap}
            bounces={false}
            overScrollMode="never"
            onScroll={(e) => {
              hubGridScrollYRef.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={32}
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
            <Text style={[styles.actionBtnText, { color: shell.textPrimary }]}>
              {tr('Simular historia normal rápida', 'Simulate quick Normal story')}
            </Text>
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
            <Text style={[styles.actionBtnText, { color: shell.textPrimary }]}>
              {tr('Activar VIP manual (7 días)', 'Turn on VIP manually (7 days)')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: shell.storiesOffBtnBg, borderColor: shell.storiesOffBtnBorder }]}
            onPress={() => publishState('none')}
            disabled={saving}
          >
            <Text style={[styles.actionBtnText, { color: shell.textPrimary }]}>
              {tr('Apagar historia rápida', 'Turn off story quickly')}
            </Text>
          </TouchableOpacity>
        </>
      )}

      <View pointerEvents="none" style={[styles.fabGlowHalo, { backgroundColor: shell.storiesFabHalo, shadowColor: shell.storiesFabBorder }]} />
      <TouchableOpacity
        style={[styles.fabAddStory, { backgroundColor: shell.headerBtnBg, borderColor: shell.storiesFabBorder, shadowColor: shell.storiesFabBorder }]}
        onPress={() => void openCreate()}
        activeOpacity={0.9}
      >
        <MaterialCommunityIcons name="plus" size={28} color={shell.btnPrimaryText} />
      </TouchableOpacity>

      <Modal
        visible={cardPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setCardPickerVisible(false);
        }}
      >
        <View style={[styles.modalOverlay, { backgroundColor: shell.storiesModalOverlayBg }]}>
          <View style={styles.cardPickerCard}>
            <Text style={[styles.cardPickerTitle, { color: shell.modalTitle }]}>{tr('Tarjeta emisora', 'Source card')}</Text>
            <Text style={[styles.cardPickerSubtitle, { color: shell.textSecondary }]}>
              {tr(
                'La historia se ancla a esta tarjeta. Solo quien tenga esa tarjeta verá el canal.',
                'The story is anchored to this card. Only people who have that card will see this channel.',
              )}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              bounces
              contentContainerStyle={styles.cardCarouselRow}
              style={styles.cardPickerCarouselScroll}
            >
              {smartCards.map((c, cardPickIdx) => {
                const active = selectedCardId === c.sid;
                const emptyIcons = !c.itemIds?.length;
                return (
                  <TouchableOpacity
                    key={`story-pick-${c.sid}-${cardPickIdx}`}
                    style={[
                      styles.cardCarouselItem,
                      { width: Math.min(216, Math.max(160, windowWidth * 0.52)) },
                      active && styles.cardCarouselItemActive,
                    ]}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCardId(c.sid);
                    }}
                  >
                    <Text style={[styles.cardCarouselName, { color: shell.textPrimary }]} numberOfLines={2}>
                      {c.scName}
                    </Text>
                    <Text style={[styles.cardCarouselMeta, { color: emptyIcons ? shell.ctaAccent : shell.textSecondary }]}>
                      {emptyIcons
                        ? tr('Sin iconos del Bunker', 'No Bunker icons')
                        : tr(`${c.itemIds.length} icono(s)`, `${c.itemIds.length} icon(s)`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={[styles.vaultMirrorActions, { paddingBottom: modalFooterBottomPad }]}>
              <TouchableOpacity
                style={[styles.cancelBtn, { flex: 1, backgroundColor: shell.storiesCancelBtnBg }]}
                onPress={() => setCardPickerVisible(false)}
              >
                <Text style={[styles.cancelBtnText, { color: shell.textPrimary }]}>{tr('Cancelar', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.publishBtn, { flex: 1, backgroundColor: shell.ctaPrimary }]} onPress={proceedFromCardPicker}>
                <Text style={[styles.publishBtnText, { color: shell.btnPrimaryText }]}>{tr('Siguiente', 'Next')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={vaultMirrorVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setVaultMirrorVisible(false);
          setVaultMirrorSelectionId('');
        }}
      >
        <View style={[styles.modalOverlay, { backgroundColor: shell.storiesModalOverlayBg }]}>
          <View style={styles.vaultMirrorCard}>
            <Text style={[styles.vaultMirrorTitle, { color: shell.modalTitle }]}>{tr('CTA del Bunker', 'Vault CTA')}</Text>
            <Text style={[styles.vaultMirrorSubtitle, { color: shell.textSecondary }]}>
              {selectedCard
                ? tr(
                    `Solo datos ya asignados a «${selectedCard.scName}».`,
                    `Only fields already on «${selectedCard.scName}».`,
                  )
                : tr('Elige un solo icono como CTA.', 'Pick one icon as CTA.')}
            </Text>
            <FlatList
              data={vaultMirrorItems}
              keyExtractor={(item, index) => `vault-cta-${item.id}-${index}`}
              numColumns={4}
              style={styles.vaultMirrorGrid}
              scrollEnabled
              renderItem={({ item }) => {
                const active = vaultMirrorSelectionId === item.id;
                const iconName = normalizeMaterialCommunityIconName(item.icon || item.iconName);
                return (
                  <TouchableOpacity
                    style={styles.vaultMirrorCell}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setVaultMirrorSelectionId(item.id);
                    }}
                  >
                    <View style={[styles.vaultMirrorIconRing, active && styles.vaultMirrorIconRingActive, { borderColor: active ? 'rgba(212,175,55,0.95)' : shell.border }]}>
                      <MaterialCommunityIcons name={iconName as 'help-circle'} size={28} color={shell.ctaAccent} />
                    </View>
                    <Text style={[styles.vaultMirrorLabel, { color: shell.textPrimary }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.emptyCtaText, { color: shell.textMuted }]}>
                  {tr(
                    'No hay iconos en esta tarjeta. Añádelos en Mis Tarjetas.',
                    'No icons on this card. Add them under My Cards.',
                  )}
                </Text>
              }
            />
            <View style={[styles.vaultMirrorActions, { paddingBottom: modalFooterBottomPad }]}>
              <TouchableOpacity
                style={[styles.cancelBtn, { flex: 1, backgroundColor: shell.storiesCancelBtnBg }]}
                onPress={() => {
                  setVaultMirrorVisible(false);
                  setVaultMirrorSelectionId('');
                  setCardPickerVisible(true);
                }}
              >
                <Text style={[styles.cancelBtnText, { color: shell.textPrimary }]}>{tr('Atras', 'Back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.publishBtn, { flex: 1, backgroundColor: shell.ctaPrimary }]} onPress={confirmVaultMirrorSelection}>
                <Text style={[styles.publishBtnText, { color: shell.btnPrimaryText }]}>{tr('Continuar', 'Continue')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={createVisible} transparent animationType="slide" onRequestClose={() => setCreateVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: shell.storiesModalOverlayBg }]}>
          <ScrollView
            style={{ maxHeight: '92%' }}
            contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.createCard, { backgroundColor: shell.storiesCreateCardBg, borderColor: shell.storiesCreateCardBorder }]}>
              <Text style={[styles.modalTitle, { color: shell.modalTitle }]}>{tr('Crear Historia', 'Create Story')}</Text>

              {selectedCard ? (
                <View style={styles.publishingAsRow}>
                  <Text style={[styles.publishingAsLabel, { color: shell.textSecondary }]}>
                    {tr('Publicando como', 'Publishing as')}
                  </Text>
                  <Text style={[styles.publishingAsName, { color: shell.ctaAccent }]}>{selectedCard.scName}</Text>
                  <TouchableOpacity
                    style={styles.changeAnchorBtn}
                    onPress={() => {
                      setCreateVisible(false);
                      resetCreateForm();
                      setSelectedCardId(smartCards[0]?.sid || '');
                      setCardPickerVisible(true);
                    }}
                  >
                    <Text style={[styles.changeAnchorText, { color: shell.ctaAccent }]}>
                      {tr('Cambiar tarjeta e icono', 'Change card & CTA')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={[styles.stepTitle, { color: shell.textSecondary }]}>{tr('CTA seleccionado', 'Selected CTA')}</Text>
              {selectedCtaItem ? (
                <View style={styles.selectedCtaChip}>
                  <MaterialCommunityIcons
                    name={normalizeMaterialCommunityIconName(selectedCtaItem.icon || selectedCtaItem.iconName) as 'help-circle'}
                    size={22}
                    color={shell.ctaAccent}
                  />
                  <Text style={styles.selectedCtaChipText}>{selectedCtaItem.title}</Text>
                </View>
              ) : (
                <Text style={[styles.emptyCtaText, { color: shell.textMuted }]}>{tr('Vuelve a abrir el selector del Bunker.', 'Re-open the vault picker.')}</Text>
              )}

              <Text style={[styles.stepTitle, { color: shell.textSecondary }]}>{tr('1) Contenido', '1) Content')}</Text>
              <View style={styles.rowWrap}>
                <TouchableOpacity style={[styles.pickBtn, { backgroundColor: shell.ctaPrimary }]} onPress={() => void pickImage()}>
                  <Text style={[styles.pickBtnText, { color: shell.btnPrimaryText }]}>{tr('Foto galeria', 'Photo library')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pickBtn, { backgroundColor: shell.ctaPrimary }]} onPress={() => void pickImageFromCamera()}>
                  <Text style={[styles.pickBtnText, { color: shell.btnPrimaryText }]}>{tr('Foto camara', 'Photo camera')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pickBtn, { backgroundColor: shell.ctaPrimary }]} onPress={() => void pickVideo()}>
                  <Text style={[styles.pickBtnText, { color: shell.btnPrimaryText }]}>{tr('Video galeria', 'Video library')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pickBtn, { backgroundColor: shell.ctaPrimary }]} onPress={() => void pickVideoFromCamera()}>
                  <Text style={[styles.pickBtnText, { color: shell.btnPrimaryText }]}>{tr('Video camara', 'Video camera')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pickBtn, { backgroundColor: shell.ctaPrimary }]}
                  onPress={() => {
                    setTextDraft(selectedType === 'text' ? selectedMediaUri : textDraft);
                    resumeCreateAfterTextComposerRef.current = createVisible;
                    if (createVisible) {
                      setCreateVisible(false);
                    }
                    InteractionManager.runAfterInteractions(() => setTextComposerVisible(true));
                  }}
                >
                  <Text style={[styles.pickBtnText, { color: shell.btnPrimaryText }]}>{tr('Lienzo texto', 'Text canvas')}</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.fileNameText, { color: shell.textMuted }]}>
                {selectedType === 'text' && selectedMediaUri
                  ? tr('Texto listo', 'Text ready')
                  : selectedMediaName || tr('Sin archivo / texto', 'No file / text yet')}
              </Text>

              <Text style={[styles.stepTitle, { color: shell.textSecondary }]}>{tr('2) Duracion de exposicion', '2) Exposure duration')}</Text>
              <View style={styles.rowWrap}>
                <TouchableOpacity
                  style={[
                    styles.selectorBtn,
                    selectedDuration === '24h' && styles.selectorBtnActive,
                    {
                      backgroundColor: selectedDuration === '24h' ? shell.storiesControlActiveBg : shell.inputBg,
                      borderColor: selectedDuration === '24h' ? shell.storiesControlActiveBorder : shell.border,
                    },
                  ]}
                  onPress={() => setSelectedDuration('24h')}
                >
                  <Text style={[styles.selectorText, { color: shell.textPrimary }]}>{tr('Normal (24h)', 'Normal (24h)')}</Text>
                  <Text style={[styles.actionBtnSub, { color: shell.textSecondary }]}>{tr('Gratis', 'Free')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.selectorBtn,
                    selectedDuration === '7d' && styles.selectorVipBtn,
                    {
                      backgroundColor: selectedDuration === '7d' ? shell.storiesControlActiveBg : shell.inputBg,
                      borderColor: selectedDuration === '7d' ? shell.storiesControlActiveBorder : shell.border,
                    },
                  ]}
                  onPress={() => setSelectedDuration('7d')}
                >
                  <Text style={[styles.selectorText, { color: shell.textPrimary }]}>{tr('VIP Bronce (7d)', 'VIP Bronze (7d)')}</Text>
                  <Text style={[styles.actionBtnSub, { color: shell.ctaAccent }]}>{cost7} CS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.selectorBtn,
                    selectedDuration === '30d' && styles.selectorVipBtn,
                    {
                      backgroundColor: selectedDuration === '30d' ? shell.storiesControlActiveBg : shell.inputBg,
                      borderColor: selectedDuration === '30d' ? shell.storiesControlActiveBorder : shell.border,
                    },
                  ]}
                  onPress={() => setSelectedDuration('30d')}
                >
                  <Text style={[styles.selectorText, { color: shell.textPrimary }]}>{tr('VIP Gold (30d)', 'VIP Gold (30d)')}</Text>
                  <Text style={[styles.actionBtnSub, { color: shell.ctaAccent }]}>{cost30} CS</Text>
                </TouchableOpacity>
              </View>

              {(selectedDuration === '7d' || selectedDuration === '30d') && (
                <View style={[styles.creditHintRow, { borderColor: shortOnCredits ? 'rgba(255,59,48,0.55)' : 'rgba(212,175,55,0.35)' }]}>
                  <Text style={styles.creditHintText}>
                    {tr('Saldo CS:', 'CS balance:')}
                    {creditsBalance === null ? ' …' : ` ${creditsBalance}`}
                  </Text>
                  <Text style={styles.creditHintSub}>
                    {selectedDuration === '7d'
                      ? tr(`Esta opcion consume ${cost7} CS.`, `This option costs ${cost7} CS.`)
                      : tr(`Esta opcion consume ${cost30} CS.`, `This option costs ${cost30} CS.`)}
                  </Text>
                  {shortOnCredits ? (
                    <Text style={[styles.creditHintSub, { color: 'rgba(255,180,160,0.95)', marginTop: 4 }]}>
                      {tr('Credito insuficiente para publicar.', 'Insufficient credits to publish.')}
                    </Text>
                  ) : null}
                </View>
              )}

              <Text style={[styles.exposureHintText, { color: shell.textMuted }]}>
                {tr(
                  'Carrusel: 30 s por segmento (texto, imagen, video, anuncios). Doble toque ejecuta el CTA.',
                  'Carousel: 30s per segment (text, image, video, ads). Double-tap runs the CTA.',
                )}
              </Text>

              <View style={[styles.modalActions, { paddingBottom: modalFooterBottomPad }]}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { backgroundColor: shell.storiesCancelBtnBg }]}
                  onPress={() => {
                    setCreateVisible(false);
                    resetCreateForm();
                  }}
                >
                  <Text style={[styles.cancelBtnText, { color: shell.textPrimary }]}>{tr('Cancelar', 'Cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.publishBtn,
                    { backgroundColor: shell.ctaPrimary },
                    (!selectedCtaItem ||
                      !selectedCard ||
                      shortOnCredits ||
                      (selectedType === 'text' ? !String(selectedMediaUri || '').trim() : !selectedMediaUri)) && [
                      styles.publishBtnDisabled,
                      { backgroundColor: shell.storiesPublishDisabled },
                    ],
                  ]}
                  onPress={() => {
                    if (selectedCtaItem && selectedCard && !shortOnCredits) {
                      void publishStory();
                    }
                  }}
                  disabled={
                    !selectedCtaItem ||
                    !selectedCard ||
                    Boolean(shortOnCredits) ||
                    (selectedType === 'text' ? !String(selectedMediaUri || '').trim() : !selectedMediaUri)
                  }
                >
                  <Text style={[styles.publishBtnText, { color: shell.btnPrimaryText }]}>{tr('Publicar', 'Publish')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={textComposerVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeTextComposerModal}>
        <View style={styles.textComposerRoot}>
          <LinearGradient colors={[...TEXT_STORY_BACKGROUNDS[textBgIndex]?.colors ?? TEXT_STORY_BACKGROUNDS[0].colors]} style={{ flex: 1 }}>
            <View style={styles.textComposerHeader}>
              <TouchableOpacity onPress={closeTextComposerModal}>
                <Text style={styles.textComposerTitle}>{tr('Cerrar', 'Close')}</Text>
              </TouchableOpacity>
              <Text style={styles.textComposerTitle}>{tr('Lienzo de texto', 'Text canvas')}</Text>
              <TouchableOpacity onPress={applyTextComposer}>
                <Text style={[styles.textComposerTitle, { color: 'rgba(212,175,55,0.95)' }]}>{tr('Guardar', 'Save')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.stepTitle, { color: 'rgba(245,240,230,0.75)', paddingHorizontal: 14, marginBottom: 6 }]}>
              {tr('Fondo', 'Background')}
            </Text>
            <View style={styles.textComposerSwatchRow}>
              {TEXT_STORY_BACKGROUNDS.map((bg, idx) => (
                <TouchableOpacity key={bg.id} onPress={() => setTextBgIndex(idx)} style={styles.textComposerSwatchWrap}>
                  <LinearGradient colors={[...bg.colors]} style={[styles.textComposerSwatch, textBgIndex === idx && styles.textComposerSwatchActive]} />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.stepTitle, { color: 'rgba(245,240,230,0.75)', paddingHorizontal: 14, marginBottom: 6 }]}>
              {tr('Tipografia', 'Typography')}
            </Text>
            <View style={styles.textComposerFontRow}>
              <TouchableOpacity
                style={[styles.selectorBtn, textFontRole === 'serif' && styles.selectorBtnActive, { borderColor: textFontRole === 'serif' ? 'rgba(212,175,55,0.85)' : 'rgba(255,255,255,0.2)' }]}
                onPress={() => setTextFontRole('serif')}
              >
                <Text style={[styles.selectorText, { color: '#F5F0E6', fontFamily: 'Georgia' }]}>{tr('Serif', 'Serif')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectorBtn, textFontRole === 'sans' && styles.selectorBtnActive, { borderColor: textFontRole === 'sans' ? 'rgba(212,175,55,0.85)' : 'rgba(255,255,255,0.2)' }]}
                onPress={() => setTextFontRole('sans')}
              >
                <Text style={[styles.selectorText, { color: '#F5F0E6' }]}>{tr('Sans', 'Sans')}</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.textComposerInput, { fontFamily: storyTextFontFamily(textFontRole) }]}
              multiline
              placeholder={tr('Escribe tu historia...', 'Write your story...')}
              placeholderTextColor="rgba(245,240,230,0.35)"
              value={textDraft}
              onChangeText={setTextDraft}
            />
          </LinearGradient>
        </View>
      </Modal>

      <Modal visible={viewerVisible} transparent animationType="fade" onRequestClose={closeViewer}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
          <Animated.View style={[styles.viewerTheaterRoot, viewerPanStyle]}>
            <View style={[styles.viewerTheaterChrome, { paddingTop: Math.max(insets.top, 6) }]}>
              <View style={styles.viewerProgressRowTheater}>
                {viewerFeed.map((_, i) => {
                  const pct = i < viewerIndex ? 100 : i === viewerIndex ? Math.round(segmentProgress * 100) : 0;
                  return (
                    <View key={`seg-${i}`} style={styles.viewerProgressSegment}>
                      <View style={[styles.viewerProgressFill, { width: `${pct}%` }]} />
                    </View>
                  );
                })}
              </View>
              <View style={styles.viewerHeaderTheaterRow}>
                <View style={styles.viewerHeaderLeft}>
                  <Text style={styles.viewerEmitterName} numberOfLines={1}>
                    {viewerEmitterLabel || '\u00a0'}
                  </Text>
                  <Text style={styles.viewerElapsedText}>
                    {tr('Transcurrido', 'Elapsed')} · {viewerElapsedLabel}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.viewerCloseTheater}
                  onPress={closeViewer}
                  accessibilityLabel={tr('Cerrar', 'Close')}
                >
                  <MaterialCommunityIcons name="close" size={22} color="rgba(212,175,55,0.95)" />
                </TouchableOpacity>
              </View>
            </View>

            <GestureDetector gesture={viewerBodyGesture}>
              <View style={styles.viewerStage} collapsable={false}>
              {selectedViewerItem?.kind === 'market_vip' ? (
                <View style={styles.marketVipRing}>
                  <LinearGradient colors={['#1a1408', '#2c2418', '#3d3220']} style={styles.marketVipPanel}>
                    {selectedViewerItem.photoUrl ? (
                      <ExpoImage
                        source={{ uri: selectedViewerItem.photoUrl }}
                        style={styles.marketVipPhoto}
                        contentFit="cover"
                        cachePolicy="disk"
                      />
                    ) : (
                      <MaterialCommunityIcons name="storefront-outline" size={72} color="rgba(212,175,55,0.95)" />
                    )}
                    <Text style={styles.marketVipTitle}>{selectedViewerItem.bcName}</Text>
                    {selectedViewerItem.subtitle ? (
                      <Text style={styles.marketVipSubtitle} numberOfLines={3}>
                        {selectedViewerItem.subtitle}
                      </Text>
                    ) : null}
                    {selectedViewerItem.distanceMiles != null && selectedViewerItem.distanceMiles > 0 ? (
                      <Text style={styles.marketVipMeta}>
                        {selectedViewerItem.distanceMiles < 1
                          ? tr('< 1 mi', '< 1 mi')
                          : `${selectedViewerItem.distanceMiles.toFixed(1)} mi`}
                      </Text>
                    ) : null}
                    <Text style={styles.marketVipBadge}>{tr('Mercado VIP · Oro', 'VIP Market · Gold')}</Text>
                  </LinearGradient>
                </View>
              ) : selectedViewerItem?.kind === 'ad' ? (
                <LinearGradient colors={[...shell.vipBannerGradient]} style={styles.adPanel}>
                  {selectedViewerItem.photoUrl ? (
                    <ExpoImage source={{ uri: selectedViewerItem.photoUrl }} style={styles.adPhoto} contentFit="cover" cachePolicy="disk" />
                  ) : (
                    <MaterialCommunityIcons name="home-city-outline" size={68} color={shell.ctaAccent} />
                  )}
                  <Text style={styles.adTitle}>
                    {selectedViewerItem.title === FALLBACK_HOUSE_AD.title
                      ? tr('Mi Sueño Mexicano', 'My Mexican Dream')
                      : selectedViewerItem.title}
                  </Text>
                  <Text style={styles.adSubtitle}>
                    {selectedViewerItem.subtitle === FALLBACK_HOUSE_AD.subtitle
                      ? tr(
                          'Placeholder promocional: casa destacada cada 3 historias',
                          'Promo placeholder: featured listing every 3 stories',
                        )
                      : selectedViewerItem.subtitle}
                  </Text>
                  <View style={styles.adMetaRow}>
                    <Text style={styles.adMetaText}>{selectedViewerItem.priceLabel}</Text>
                    <Text style={styles.adMetaDot}>•</Text>
                    <Text style={styles.adMetaText}>{selectedViewerItem.locationLabel}</Text>
                  </View>
                  <Text style={styles.adBadge}>{tr('Anuncio interno', 'In-app ad')}</Text>
                </LinearGradient>
              ) : selectedViewerItem?.localStory?.storyType === 'text' ? (
                <StoryTheaterTextCanvas
                  body={selectedViewerItem.localStory.mediaUri}
                  backgroundKey={selectedViewerItem.localStory.backgroundKey}
                  textFontRole={selectedViewerItem.localStory.textFontRole}
                  textStoryStyle={styles.viewerTextStory}
                  textBodyStyle={styles.viewerTextStoryBody}
                />
              ) : selectedViewerItem?.localStory?.storyType === 'image' ? (
                <StoryTheaterFullBleedImage uri={selectedViewerItem.localStory.mediaUri} style={styles.viewerImage} />
              ) : selectedViewerItem?.localStory?.storyType === 'video' ? (
                <StoryTheaterFullBleedVideo
                  key={selectedViewerItem.localStory.mediaUri}
                  uri={selectedViewerItem.localStory.mediaUri}
                  style={styles.viewerImage}
                />
              ) : (
                <View style={styles.viewerDocWrap}>
                  <MaterialCommunityIcons
                    name={selectedViewerItem?.localStory ? 'file-document-outline' : 'card-account-details-outline'}
                    size={62}
                    color="rgba(212,175,55,0.9)"
                  />
                  <Text style={styles.viewerDocText}>{selectedViewerItem?.localStory?.mediaName || tr('Sin media local', 'No local media')}</Text>
                </View>
              )}
            </View>
          </GestureDetector>

          <View style={[styles.viewerFooter, { paddingBottom: modalFooterBottomPad + 10 }]}>
            <Text style={[styles.viewerTitle, { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } }]}>
              {selectedViewerItem?.kind === 'ad'
                ? selectedViewerItem.title === FALLBACK_HOUSE_AD.title
                  ? tr('Mi Sueño Mexicano', 'My Mexican Dream')
                  : selectedViewerItem.title
                : selectedViewerItem?.kind === 'market_vip'
                  ? selectedViewerItem.bcName
                  : selectedViewerItem?.cardName || tr('Historia', 'Story')}
            </Text>
            {selectedViewerItem?.kind === 'story' ? (
              <TouchableOpacity style={styles.viewerCtaBtn} onPress={() => { void openCta(selectedViewerItem?.localStory || null); }}>
                <Text style={styles.viewerCtaText}>{selectedViewerItem?.localStory?.ctaTitle || tr('CTA', 'CTA')}</Text>
              </TouchableOpacity>
            ) : selectedViewerItem?.kind === 'ad' ? (
              <TouchableOpacity style={styles.viewerCtaBtn} onPress={() => { void openHouseAdCta(selectedViewerItem); }}>
                <Text style={styles.viewerCtaText}>
                  {selectedViewerItem.ctaLabel === FALLBACK_HOUSE_AD.ctaLabel
                    ? tr('Contactar asesor', 'Contact advisor')
                    : selectedViewerItem.ctaLabel || tr('Ver propiedad', 'View listing')}
                </Text>
              </TouchableOpacity>
            ) : selectedViewerItem?.kind === 'market_vip' ? (
              <TouchableOpacity style={styles.viewerCtaBtn} onPress={() => { void openMarketVipCta(selectedViewerItem); }}>
                <Text style={styles.viewerCtaText}>{selectedViewerItem.ctaLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          </Animated.View>
        </GestureHandlerRootView>
      </Modal>
    </LinearGradient>
  );
}
