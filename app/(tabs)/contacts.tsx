import ErrorBoundary from '@/components/ErrorBoundary';
import BunkerContactPremiumGlow from '@/components/BunkerContactPremiumGlow';
import FlexGrid from '@/components/FlexGrid';
import { MyCardsPreviewModal, type MyCardsPayload } from '@/components/MyCards';
import ReceptorScreenModal from '@/components/ReceptorScreenModal';
import { SharedCardSkeletonList } from '@/components/SharedCardRowSkeleton';
import { type WireframeEditSlot } from '@/components/smartCard/IsolatedWireframeCard';
import { ThemedSharedCardSurface } from '@/components/ThemedSharedCardSurface';
import { MEDIA_PLACEHOLDER } from '@/constants/mediaPlaceholders';
import { listScrollInteractionProps } from '@/constants/scrollInteraction';
import { getActiveUserId } from '@/services/authSession';
import { confirmThenRequireBiometric, runPresidentialBiometricGate } from '@/services/biometricAuth';
import { buildMirrorVaultItemsForContact } from '@/services/buildReceiverPreviewVaultItems';
import {
  collectStringsReceivedContact,
  orderByDeepSearchWithExpandedQuery,
  type CardSearchFacet,
} from '@/services/deepSearch';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { useCoreT } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { buildExpandedMarketQuery } from '@/services/marketSearchSynonyms';
import {
    blockRelationship,
    listCardSubscribers,
    listReceivedContacts,
    normalizePublicCardSlotFromApi,
    setSubscriberSelfCardMute,
    type CardSubscriberRow,
    type PublicCardSlotPayload,
} from '@/services/qrApi';
import {
    mergeReceivedContactRows,
    receivedContactMergeKey,
} from '@/services/receivedContactsPresentationMerge';
import { archiveContactToBunker, listAllRelationships } from '@/services/relationshipService';
import {
  preloadAirEvaporationDeleteSound,
  runAirEvaporationDeleteFeedback,
} from '@/services/airEvaporationDeleteFeedback';
import { BUNKER_CONTACT_PREMIUM_GLOW_EVENT } from '@/services/bunkerContactPremiumGlowBus';
import { resolvePillForegroundColor } from '@/services/pillForegroundColor';
import { getCardRowTheme } from '@/services/useActiveTheme';
import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import { makeContactsStyles } from '@/styles/_contacts.styles';
import appPalette from '../theme';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    AppState,
    InteractionManager,
    DeviceEventEmitter,
    Easing,
    Keyboard,
    LayoutAnimation,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    UIManager,
    useWindowDimensions,
    View
} from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { generatePermanentBusinessLink } from '@/services/brandedQrService';
import { resolveVaultMediaUrlForApp } from '@/services/resolveVaultMediaUrl';
import { toRenderableImageUri } from '@/services/userProfilePhoto';
import QRCode from 'react-native-qrcode-svg';

type Contact = {
  uid: string;
  sid?: string | null;
  bId?: string | null;
  userFullName: string;
  userNickName: string;
  userAvatarUrl: string | null;
  /** Cargo del emisor persistido en smart_cards. */
  ownerOccupation?: string | null;
  cardName: string;
  holdersCount: number;
  /** Conexiones en común en el grafo de compartidos (solo número, sin listas). */
  mutualContactsCount?: number;
  /** El receptor silenció notificaciones de esta tarjeta. */
  channelMuted?: boolean;
  themeId?: string;
  layout?: 'vertical' | 'horizontal';
  fontId?: string | null;
  fontName?: string | null;
  fontFamily?: string | null;
  fontTier?: 'free' | 'premium' | null;
  wallpaperId?: string | null;
  wallpaperUrl?: string | null;
  wallpaperThumbUrl?: string | null;
  wallpaperTier?: 'free' | 'premium' | null;
  wallpaperPriceCredits?: number;
  enableParallax?: boolean;
  itemIds?: string[];
  cardUpdatedAt?: string | null;
  /** Slots del emisor (icon URL / iconName) para el wireframe espejo del receptor. */
  publicCardSlots?: PublicCardSlotPayload[];
  /** 'business' para BusinessCard corporativa; 'smart' para tarjeta personal. */
  cardType?: 'business' | 'smart';
  /** Espejo Mongo: imagen en doc tarjeta (logo business en QR / wireframe). */
  ownerPhotoUrl?: string | null;
  /** Nombre comercial (`business_cards.bcName`); solo business — misma verdad que Mis Tarjetas. */
  bcName?: string | null;
  /** Nombre de contacto en tarjeta negocio (`business_cards.bcContactName`); solo business. */
  bcContactName?: string | null;
  /** Logo de marca (`business_cards.bcLogoUrl`); solo business — no usar `userAvatarUrl` del perfil. */
  bcLogoUrl?: string | null;
  /** Fecha de alta en la libreta (API); alimenta `ContactMeta.firstSeenAt` al fusionar metadatos. */
  addedAt?: string | null;
  /** Facetas buscables (vault-like) cuando el backend las incluye en la lista de recibidos. */
  searchFacets?: CardSearchFacet[];
  meta?: {
    group: string;
    isFavorite: boolean;
    firstSeenAt: string;
  };
};

type ContactRow = { type: 'contact'; key: string; contact: Contact };
type HeaderRow = { type: 'header'; key: string; title: string };
type ContactListRow = ContactRow | HeaderRow;

type ContactMeta = {
  group: string;
  isFavorite: boolean;
  /** Ordenación “por fecha” y fusión al importar desde API (`addedAt`). */
  firstSeenAt?: string;
  /** Iconos asociados al contacto (búsqueda profunda por nombre/URL); opcional si no hay caché. */
  icons?: Icon[];
  /** Legacy: ya no pisa `themeId` del API en lista (evita tema congelado al actualizar la tarjeta). */
  scanThemeId?: string;
  /** Avatar visto al aceptar (preview); solo si el API no devolvió userAvatarUrl. */
  seedAvatarUrl?: string;
};

type Icon = {
  name: string;
  url: string;
};

type SortMode = 'name' | 'card' | 'date' | 'groups';

const CONTACT_META_STORAGE_KEY = 'contacts_meta_v2';
const CONTACTS_CACHE_STORAGE_KEY = 'contacts_cache_v1';
const GROUP_FAVORITES_STORAGE_KEY = 'contacts_group_favorites_v1';
const GROUP_DEFAULT = 'Random';
const GROUP_PRESETS = ['Random', 'Family', 'Social', 'Work'];
const RATING_ALERT = 3.5;

/** Orden “por nombre”: negocio = nombre de tarjeta; smart = persona. */
function contactSortPrimaryName(c: Pick<Contact, 'cardType' | 'cardName' | 'bcName' | 'userFullName'>): string {
  if (c.cardType === 'business') {
    const bn = String(c.bcName || '').trim();
    return bn || String(c.cardName || '').trim();
  }
  return String(c.userFullName || '').trim();
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ContactsPage() {
  return (
    <ErrorBoundary>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          <ContactsContent />
        </View>
      </TouchableWithoutFeedback>
    </ErrorBoundary>
  );
}

function ContactsContent() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = useCoreT();
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const shell = appPalette[isNight ? 'dark' : 'light'];
  const styles = useMemo(() => makeContactsStyles(shell), [shell]);
  const modalFooterBottomPad = useModalFooterBottomPad();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [metaMap, setMetaMap] = useState<Record<string, ContactMeta>>({});
  const [groupFavorites, setGroupFavorites] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [sortVisible, setSortVisible] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('groups');

  const { height: windowHeight } = useWindowDimensions();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [floatingVisible, setFloatingVisible] = useState(false);

  const [longPressVisible, setLongPressVisible] = useState(false);
  const [longPressContact, setLongPressContact] = useState<Contact | null>(null);

  const [groupPickerVisible, setGroupPickerVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const [hibernatingUids, setHibernatingUids] = useState<Set<string>>(new Set());

  /* Receptor modal state */
  const [receptorModalVisible, setReceptorModalVisible] = useState(false);
  const [receptorContact, setReceptorContact] = useState<Contact | null>(null);
  const [receptorSubscribers, setReceptorSubscribers] = useState<CardSubscriberRow[]>([]);
  const [receptorLoading, setReceptorLoading] = useState(false);
  const listEntrance = useRef(new Animated.Value(0)).current;
  const swipeableByContactLinkRef = useRef<Map<string, SwipeableMethods>>(new Map());
  const rowPressScaleRef = useRef<Map<string, Animated.Value>>(new Map());
  const [premiumGlowByLinkKey, setPremiumGlowByLinkKey] = useState<Record<string, boolean>>({});

  const closeAllSwipes = useCallback(() => {
    for (const m of swipeableByContactLinkRef.current.values()) {
      m.close();
    }
  }, []);

  const pressScaleForContactLink = (linkKey: string) => {
    let v = rowPressScaleRef.current.get(linkKey);
    if (!v) {
      v = new Animated.Value(1);
      rowPressScaleRef.current.set(linkKey, v);
    }
    return v;
  };

  const animateContactRowPressIn = (linkKey: string) => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      /* haptics opcional */
    }
    Animated.spring(pressScaleForContactLink(linkKey), {
      toValue: 0.98,
      useNativeDriver: true,
      friction: 7,
      tension: 220,
    }).start();
  };

  const animateContactRowPressOut = (linkKey: string) => {
    Animated.spring(pressScaleForContactLink(linkKey), {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
      tension: 220,
    }).start();
  };

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      BUNKER_CONTACT_PREMIUM_GLOW_EVENT,
      (ev: { linkKey?: string }) => {
        const k = String(ev?.linkKey || '').trim();
        if (!k) return;
        setPremiumGlowByLinkKey((prev) => ({ ...prev, [k]: true }));
        setTimeout(() => {
          setPremiumGlowByLinkKey((prev) => {
            const next = { ...prev };
            delete next[k];
            return next;
          });
        }, 2800);
      },
    );
    return () => sub.remove();
  }, []);

  const loadMetaMap = async () => {
    try {
      const raw = await AsyncStorage.getItem(CONTACT_META_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, ContactMeta>) : {};
      setMetaMap(parsed);
      return parsed;
    } catch {
      setMetaMap({});
      return {};
    }
  };

  const loadGroupFavorites = async () => {
    try {
      const raw = await AsyncStorage.getItem(GROUP_FAVORITES_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      setGroupFavorites(parsed);
      return parsed;
    } catch {
      setGroupFavorites({});
      return {};
    }
  };

  const persistGroupFavorites = async (next: Record<string, boolean>) => {
    setGroupFavorites(next);
    await AsyncStorage.setItem(GROUP_FAVORITES_STORAGE_KEY, JSON.stringify(next));
  };

  const getContactsCacheKey = (viewerUid: string) => `${CONTACTS_CACHE_STORAGE_KEY}_${viewerUid}`;

  const persistMetaMap = async (next: Record<string, ContactMeta>) => {
    setMetaMap(next);
    await AsyncStorage.setItem(CONTACT_META_STORAGE_KEY, JSON.stringify(next));
  };

  const normalizeContactRow = (row: Contact): Contact => {
    const slotSource = Array.isArray(row.publicCardSlots) ? row.publicCardSlots : [];
    const publicCardSlots: PublicCardSlotPayload[] = slotSource.map((s) => normalizePublicCardSlotFromApi(s));
    /** Caché antigua podía traer `photoUrl`; la API actual usa `userAvatarUrl`. Business: sin datos de perfil. */
    const legacy = row as Contact & { name?: string; nickname?: string; photoUrl?: string | null };
    const isBiz = row.cardType === 'business';
    const userFullName = isBiz ? '' : String(legacy.userFullName ?? legacy.name ?? '').trim();
    const userNickName = isBiz
      ? ''
      : String(legacy.userNickName ?? legacy.nickname ?? 'user')
          .trim()
          .replace(/^@+/g, '');
    const userAvatarUrl = isBiz
      ? null
      : legacy.userAvatarUrl != null && String(legacy.userAvatarUrl).trim()
        ? String(legacy.userAvatarUrl)
        : legacy.photoUrl != null && String(legacy.photoUrl).trim()
          ? String(legacy.photoUrl)
          : null;
    const sidFromRow = row.sid != null && String(row.sid).trim() ? String(row.sid).trim() : null;
    const bIdFromRow = row.bId != null && String(row.bId).trim() ? String(row.bId).trim() : null;
    const ownerPhotoRaw = (row as Contact & { ownerPhotoUrl?: string | null }).ownerPhotoUrl;
    const ownerPhotoUrl =
      ownerPhotoRaw != null && String(ownerPhotoRaw).trim() ? String(ownerPhotoRaw).trim() : null;
    return {
      ...row,
      sid: sidFromRow,
      bId: bIdFromRow,
      userFullName,
      userNickName,
      userAvatarUrl,
      ownerPhotoUrl,
      ownerOccupation:
        row.ownerOccupation != null && String(row.ownerOccupation).trim()
          ? String(row.ownerOccupation).trim()
          : null,
      bcName:
        row.bcName != null && String(row.bcName).trim() ? String(row.bcName).trim() : null,
      bcContactName:
        row.bcContactName != null && String(row.bcContactName).trim()
          ? String(row.bcContactName).trim()
          : null,
      bcLogoUrl:
        row.bcLogoUrl != null && String(row.bcLogoUrl).trim() ? String(row.bcLogoUrl).trim() : null,
      mutualContactsCount: Number(row.mutualContactsCount ?? 0),
      channelMuted: Boolean(row.channelMuted),
      themeId: String(row.themeId || 'obsidian').trim() || 'obsidian',
      layout: row.layout === 'horizontal' ? 'horizontal' : 'vertical',
      fontId: row.fontId ?? null,
      fontName: row.fontName ?? null,
      fontFamily: row.fontFamily ?? null,
      fontTier: row.fontTier === 'premium' ? 'premium' : row.fontTier === 'free' ? 'free' : null,
      wallpaperId: row.wallpaperId ?? null,
      wallpaperUrl: row.wallpaperUrl ?? null,
      wallpaperThumbUrl: row.wallpaperThumbUrl ?? null,
      wallpaperTier: row.wallpaperTier === 'premium' ? 'premium' : row.wallpaperTier === 'free' ? 'free' : null,
      wallpaperPriceCredits: Number(row.wallpaperPriceCredits ?? 0),
      enableParallax: Boolean(row.enableParallax),
      itemIds: Array.isArray(row.itemIds) ? row.itemIds : [],
      cardUpdatedAt: row.cardUpdatedAt ?? null,
      publicCardSlots,
    };
  };

  /**
   * @param silent Si true, no fuerza pantalla de carga ni parpadeo: fusiona tema/wallpaper según `cardUpdatedAt`.
   */
  const loadContacts = async (silent = false) => {
    let cachedContacts: Contact[] = [];
    try {
      const existingMeta = await loadMetaMap();
      await loadGroupFavorites();
      const viewerUid = await getActiveUserId();
      if (!viewerUid) {
        setContacts([]);
        setLoading(false);
        return;
      }

      const cacheKey = getContactsCacheKey(viewerUid);
      try {
        const cachedRaw = await AsyncStorage.getItem(cacheKey);
        const parsed = cachedRaw ? (JSON.parse(cachedRaw) as Contact[]) : [];
        if (Array.isArray(parsed)) {
          cachedContacts = parsed.map((r) => normalizeContactRow(r as Contact));
        }
      } catch {
        cachedContacts = [];
      }

      if (cachedContacts.length > 0) {
        setContacts((prev) => (prev.length > 0 ? prev : cachedContacts));
        setLoading(false);
      } else if (!silent) {
        setLoading(true);
      }

      let normalized: Contact[] = [];
      try {
        const response = await listReceivedContacts({ uid: viewerUid });
        normalized = (Array.isArray(response.contacts) ? response.contacts : []).map((c) => normalizeContactRow(c as Contact));
        await AsyncStorage.setItem(cacheKey, JSON.stringify(normalized));
      } catch {
        normalized = cachedContacts;
        if (!silent && cachedContacts.length === 0) {
          setContacts([]);
        }
      }

      const nowIso = new Date().toISOString();
      const mergedMeta: Record<string, ContactMeta> = { ...existingMeta };
      for (const row of normalized) {
        const linkKey = receivedContactMergeKey(row);
        if (!mergedMeta[linkKey]) {
          const legacy = mergedMeta[row.uid];
          mergedMeta[linkKey] = legacy
            ? {
                ...legacy,
                firstSeenAt: row.addedAt || legacy.firstSeenAt || nowIso,
              }
            : {
                group: GROUP_DEFAULT,
                isFavorite: false,
                firstSeenAt: row.addedAt || nowIso,
              };
        }
      }

      await persistMetaMap(mergedMeta);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setContacts((prev) => {
        const base = prev.length > 0 ? prev : cachedContacts;
        if (base.length > 0) {
          return mergeReceivedContactRows<Contact>(base, normalized);
        }
        return normalized;
      });
    } catch {
      if (!silent) {
        setContacts([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      InteractionManager.runAfterInteractions(() => {
        void preloadAirEvaporationDeleteSound();
      });
      void loadContacts(true);
      void (async () => {
        try {
          const viewerUid = await getActiveUserId();
          if (!viewerUid) {
            setHibernatingUids(new Set());
            return;
          }
          const rows = await listAllRelationships(viewerUid);
          setHibernatingUids(
            new Set(rows.filter((r) => r.status === 'hibernating').map((r) => r.uid)),
          );
        } catch {
          setHibernatingUids(new Set());
        }
      })();
    }, [])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('cardSocialHibernatingUidsRefresh', () => {
      void (async () => {
        try {
          const viewerUid = await getActiveUserId();
          if (!viewerUid) {
            setHibernatingUids(new Set());
            return;
          }
          const rows = await listAllRelationships(viewerUid);
          setHibernatingUids(
            new Set(rows.filter((r) => r.status === 'hibernating').map((r) => r.uid)),
          );
        } catch {
          setHibernatingUids(new Set());
        }
      })();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void loadContacts(true);
        void (async () => {
          try {
            const viewerUid = await getActiveUserId();
            if (!viewerUid) {
              setHibernatingUids(new Set());
              return;
            }
            const rows = await listAllRelationships(viewerUid);
            setHibernatingUids(
              new Set(rows.filter((r) => r.status === 'hibernating').map((r) => r.uid)),
            );
          } catch {
            setHibernatingUids(new Set());
          }
        })();
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  const mirrorVaultItems = useMemo(() => {
    if (!selectedContact) {
      return [];
    }
    return buildMirrorVaultItemsForContact(selectedContact);
  }, [selectedContact]);

  const mirrorPreviewSlots = useMemo<WireframeEditSlot[]>(() => {
    return mirrorVaultItems.map((item, index) => ({
      id: `rx-${item.id}-${index}`,
      index,
      item,
    }));
  }, [mirrorVaultItems]);

  const contactPayload = useMemo<MyCardsPayload | null>(() => {
    if (!selectedContact) return null;
    const c = selectedContact;
    const isBusiness = c.cardType === 'business';
    const nick = String(c.userNickName || 'user').trim() || 'user';
    const cardNm = String(c.cardName || '').trim();
    const bcNameBiz = String(c.bcName || '').trim();
    const bcContact = String(c.bcContactName || '').trim();
    const logoUrl = String(c.bcLogoUrl || '').trim();
    // Business: solo datos guardados en la tarjeta (sin @, sin perfil). Smart: subtítulo @nickname.
    const subtitle = isBusiness ? bcContact : nick.startsWith('@') ? nick : `@${nick}`;
    /** Smart: `ownerOccupation` solo en doc tarjeta (facetas); business: no leer ese campo. */
    const cardTitle = isBusiness
      ? bcNameBiz || cardNm
      : (() => {
          const person = String(c.userFullName || '').trim();
          const occ = String(c.ownerOccupation || '').trim();
          return (cardNm || person || occ || t('label_social_card')).trim();
        })();
    return {
      cardName: cardTitle,
      subtitle,
      avatarUrl: isBusiness ? (logoUrl || null) : c.userAvatarUrl,
      noAvatarIcon: isBusiness ? 'storefront-outline' : undefined,
      themeId: c.themeId || '',
      wallpaperUrl: isBusiness ? undefined : c.wallpaperUrl ?? undefined,
      layout: c.layout === 'horizontal' ? 'horizontal' : 'vertical',
      holdersCount: Math.max(0, Math.floor(Number(c.holdersCount ?? 0))),
      enableParallax: Boolean(c.enableParallax),
      slots: mirrorPreviewSlots,
    };
  }, [selectedContact, mirrorPreviewSlots, t]);

  const allGroups = useMemo(() => {
    const dynamic = Object.values(metaMap)
      .map((item) => String(item.group || GROUP_DEFAULT).trim())
      .filter(Boolean);
    const unique = Array.from(new Set([...GROUP_PRESETS, ...dynamic]));
    unique.sort((a, b) => {
      const favDiff = Number(Boolean(groupFavorites[b])) - Number(Boolean(groupFavorites[a]));
      if (favDiff !== 0) {
        return favDiff;
      }
      return String(a).localeCompare(String(b), 'es', { sensitivity: 'base' });
    });
    return unique;
  }, [metaMap, groupFavorites]);

  const normalizedContacts = useMemo(() => {
    const qRaw = searchValue.trim();

    const visibleContacts = contacts.filter((contact) => !hibernatingUids.has(contact.uid));

    const withMeta = visibleContacts.map((contact) => {
      const linkKey = receivedContactMergeKey(contact);
      const meta =
        metaMap[linkKey] ||
        metaMap[contact.uid] || {
          group: GROUP_DEFAULT,
          isFavorite: false,
          firstSeenAt: contact.addedAt || new Date().toISOString(),
        };
      const apiAvatar =
        contact.userAvatarUrl != null && String(contact.userAvatarUrl).trim()
          ? String(contact.userAvatarUrl).trim()
          : '';
      const seedAv =
        meta.seedAvatarUrl != null && String(meta.seedAvatarUrl).trim()
          ? String(meta.seedAvatarUrl).trim()
          : '';
      const isBusiness = contact.cardType === 'business';
      /** Negocio: sin foto de perfil en lista (solo `bcLogoUrl` en el render). Smart: API + seed si hace falta. */
      const userAvatarUrl = isBusiness ? null : (apiAvatar || seedAv) || null;
      return {
        ...contact,
        userAvatarUrl,
        meta,
      };
    });

    if (!qRaw) {
      return withMeta;
    }

    const qExpanded = buildExpandedMarketQuery(qRaw) || qRaw;

    return orderByDeepSearchWithExpandedQuery(withMeta, qExpanded, (row) =>
      collectStringsReceivedContact(
        {
          uid: row.uid,
          sid: row.sid ?? null,
          bId: row.bId ?? null,
          userFullName: row.userFullName,
          userNickName: row.userNickName,
          cardName: row.cardName,
          ownerOccupation: row.ownerOccupation ?? null,
          bcName: row.bcName ?? null,
          bcContactName: row.bcContactName ?? null,
          bcLogoUrl: row.bcLogoUrl ?? null,
          searchFacets: row.searchFacets,
        },
        row.meta.group,
        row.meta.icons,
      ),
    );
  }, [contacts, metaMap, searchValue, hibernatingUids]);

  const sortedContacts = useMemo(() => {
    const rows = [...normalizedContacts];

    const byFavoriteFirst = (a: any, b: any) => Number(Boolean(b.meta.isFavorite)) - Number(Boolean(a.meta.isFavorite));

    if (sortMode === 'date') {
      rows.sort((a, b) => {
        const favDiff = byFavoriteFirst(a, b);
        if (favDiff !== 0) {
          return favDiff;
        }
        const tb = new Date(String(b.meta.firstSeenAt || '').trim() || '1970-01-01T00:00:00Z').getTime();
        const ta = new Date(String(a.meta.firstSeenAt || '').trim() || '1970-01-01T00:00:00Z').getTime();
        return tb - ta;
      });
      return rows;
    }

    if (sortMode === 'card') {
      rows.sort((a, b) => {
        const favDiff = byFavoriteFirst(a, b);
        if (favDiff !== 0) {
          return favDiff;
        }
        return String(a.cardName).localeCompare(String(b.cardName), 'es', { sensitivity: 'base' });
      });
      return rows;
    }

    if (sortMode === 'groups') {
      rows.sort((a, b) => {
        const groupFavDiff = Number(Boolean(groupFavorites[b.meta.group])) - Number(Boolean(groupFavorites[a.meta.group]));
        if (groupFavDiff !== 0) {
          return groupFavDiff;
        }
        const groupDiff = String(a.meta.group).localeCompare(String(b.meta.group), 'es', { sensitivity: 'base' });
        if (groupDiff !== 0) {
          return groupDiff;
        }
        const favDiff = byFavoriteFirst(a, b);
        if (favDiff !== 0) {
          return favDiff;
        }
        return contactSortPrimaryName(a).localeCompare(contactSortPrimaryName(b), 'es', { sensitivity: 'base' });
      });
      return rows;
    }

    rows.sort((a, b) => {
      const favDiff = byFavoriteFirst(a, b);
      if (favDiff !== 0) {
        return favDiff;
      }
      return contactSortPrimaryName(a).localeCompare(contactSortPrimaryName(b), 'es', { sensitivity: 'base' });
    });

    return rows;
  }, [normalizedContacts, sortMode, groupFavorites]);

  const toggleGroupFavorite = async (groupName: string) => {
    const key = String(groupName || '').trim();
    if (!key) {
      return;
    }
    const next = {
      ...groupFavorites,
      [key]: !Boolean(groupFavorites[key]),
    };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await persistGroupFavorites(next);
  };

  const rowsWithHeaders = useMemo(() => {
    if (sortMode !== 'groups') {
      return sortedContacts.map((row) => ({
        type: 'contact' as const,
        key: receivedContactMergeKey(row),
        contact: row,
      }));
    }

    const result: Array<{ type: 'header' | 'contact'; key: string; title?: string; contact?: any }> = [];
    let lastGroup = '';
    for (const row of sortedContacts) {
      const groupName = row.meta.group || GROUP_DEFAULT;
      if (groupName !== lastGroup) {
        result.push({
          type: 'header',
          key: `header-${groupName}`,
          title: groupName,
        });
        lastGroup = groupName;
      }
      result.push({ type: 'contact', key: receivedContactMergeKey(row), contact: row });
    }
    return result;
  }, [sortedContacts, sortMode]);

  useEffect(() => {
    if (loading) {
      return;
    }
    listEntrance.setValue(0);
    Animated.timing(listEntrance, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [loading, rowsWithHeaders.length, listEntrance]);

  const contactsListScrollContentStyle = useMemo(() => {
    if (loading && contacts.length === 0) {
      return { flexGrow: 1 as const };
    }
    if (rowsWithHeaders.length === 0) {
      return { flexGrow: 1 as const, minHeight: Math.max(420, windowHeight * 0.58) };
    }
    return { flexGrow: 1 as const, paddingBottom: 130 };
  }, [loading, contacts.length, rowsWithHeaders.length, windowHeight]);

  const initialsFromDisplayName = (name: string) => {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase() || '?';
  };

  const updateContactMeta = async (contact: Contact, updater: (prev: ContactMeta) => ContactMeta) => {
    const linkKey = receivedContactMergeKey(contact);
    const base =
      metaMap[linkKey] ||
      metaMap[contact.uid] || {
        group: GROUP_DEFAULT,
        isFavorite: false,
        firstSeenAt: new Date().toISOString(),
      };
    const next = {
      ...metaMap,
      [linkKey]: updater(base),
    };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await persistMetaMap(next);
  };

  const persistContactsCache = async (nextContacts: Contact[]) => {
    try {
      const viewerUid = await getActiveUserId();
      if (!viewerUid) {
        return;
      }
      await AsyncStorage.setItem(getContactsCacheKey(viewerUid), JSON.stringify(nextContacts));
    } catch {
      /* cache best-effort */
    }
  };

  /** Quita una sola tarjeta recibida (mismo emisor puede seguir con otras filas). */
  const purgeReceivedCardLinkFromUi = async (contact: Contact) => {
    const linkKey = receivedContactMergeKey(contact);
    let nextContacts: Contact[] = [];
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setContacts((prev) => {
      nextContacts = prev.filter((row) => receivedContactMergeKey(row) !== linkKey);
      void persistContactsCache(nextContacts);
      return nextContacts;
    });
    const nextMeta = { ...metaMap };
    delete nextMeta[linkKey];
    const stillSameIssuer = nextContacts.some((c) => c.uid === contact.uid);
    if (!stillSameIssuer) {
      delete nextMeta[contact.uid];
    }
    await persistMetaMap(nextMeta);
    if (selectedContact && receivedContactMergeKey(selectedContact) === linkKey) {
      setFloatingVisible(false);
      setSelectedContact(null);
    }
    setLongPressVisible(false);
    setLongPressContact(null);
    swipeableByContactLinkRef.current.delete(linkKey);
  };

  /** Tras bloquear: quitar todas las tarjetas recibidas de ese emisor en UI. */
  const purgeAllReceivedFromIssuerInUi = async (issuerUid: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setContacts((prev) => {
      const next = prev.filter((row) => row.uid !== issuerUid);
      void persistContactsCache(next);
      return next;
    });
    const nextMeta = { ...metaMap };
    for (const k of Object.keys(nextMeta)) {
      if (k === issuerUid || k.startsWith(`${issuerUid}::`)) {
        delete nextMeta[k];
      }
    }
    await persistMetaMap(nextMeta);
    if (selectedContact?.uid === issuerUid) {
      setFloatingVisible(false);
      setSelectedContact(null);
    }
    setLongPressVisible(false);
    setLongPressContact(null);
    for (const k of [...swipeableByContactLinkRef.current.keys()]) {
      if (k === issuerUid || k.startsWith(`${issuerUid}::`)) {
        swipeableByContactLinkRef.current.delete(k);
      }
    }
  };

  const handleDeleteContact = async (contact: Contact) => {
    try {
      const viewerUid = await getActiveUserId();
      if (!viewerUid) {
        return;
      }
      await archiveContactToBunker(viewerUid, {
        uid: contact.uid,
        userFullName: contact.userFullName,
        userNickName: contact.userNickName,
        userAvatarUrl: contact.userAvatarUrl,
        sid: contact.sid ?? null,
        bId: contact.bId ?? null,
        cardType:
          contact.cardType ??
          (contact.bId != null && String(contact.bId).trim() ? ('business' as const) : ('smart' as const)),
        themeId: contact.themeId ?? null,
      });
      setHibernatingUids((prev) => new Set(prev).add(contact.uid));
      try {
        await runAirEvaporationDeleteFeedback();
      } catch {}
      await purgeReceivedCardLinkFromUi(contact);
      Toast.show({
        type: 'info',
        text1: t('contacts_card_removed_title'),
        text2: t('contacts_card_removed_body'),
        position: 'bottom',
        visibilityTime: 4000,
      });
    } catch (error: any) {
      Alert.alert(
        t('contacts_delete_failed'),
        userFacingAlertMessage(error, language, t('common_try_again')),
      );
    }
  };

  const promptDeleteContact = (contact: Contact) => {
    void confirmThenRequireBiometric({
      title: t('contacts_delete_confirm_title'),
      message: t('contacts_delete_confirm_body', { name: contact.userFullName || contact.cardName || '' }),
      biometricReason: t('biometric_reason_vault_delete_item'),
      destructive: true,
    }).then((ok) => {
      if (ok) void handleDeleteContact(contact);
    });
  };

  const handleBlockContact = async (uid: string) => {
    try {
      const viewerUid = await getActiveUserId();
      if (!viewerUid) {
        return;
      }
      await blockRelationship({ uid: viewerUid, targetUid: uid });
      await purgeAllReceivedFromIssuerInUi(uid);
      Toast.show({
        type: 'info',
        text1: t('contacts_user_blocked_title'),
        text2: t('contacts_user_blocked_body'),
        position: 'bottom',
        visibilityTime: 4500,
      });
    } catch (error: any) {
      Alert.alert(
        t('contacts_block_failed'),
        userFacingAlertMessage(error, language, t('common_try_again')),
      );
    }
  };

  const promptBlockContact = (uid: string) => {
    Alert.alert(
      t('contacts_block_title'),
      t('contacts_block_body'),
      [
        { text: t('common_cancel'), style: 'cancel' },
        {
          text: t('common_block'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const gated = await runPresidentialBiometricGate(t('biometric_reason_contacts_swipe'));
              if (!gated) {
                return;
              }
              void handleBlockContact(uid);
            })();
          },
        },
      ],
    );
  };

  const promptToggleChannelMute = (contact: Contact) => {
    const nextMuted = !contact.channelMuted;
    if (nextMuted) {
      Alert.alert(
        t('contacts_mute_confirm_title'),
        t('contacts_mute_confirm_body', { name: contact.userFullName || contact.cardName || '' }),
        [
          { text: t('common_cancel'), style: 'cancel' },
          {
            text: t('common_mute'),
            onPress: () => {
              void (async () => {
                const gated = await runPresidentialBiometricGate(t('biometric_reason_contacts_swipe'));
                if (!gated) return;
                void handleToggleChannelMute(contact);
              })();
            },
          },
        ],
      );
      return;
    }
    void (async () => {
      const gated = await runPresidentialBiometricGate(t('biometric_reason_contacts_swipe'));
      if (!gated) return;
      void handleToggleChannelMute(contact);
    })();
  };

  const handleToggleChannelMute = async (contact: Contact) => {
    const viewerUid = await getActiveUserId();
    if (!viewerUid) {
      return;
    }
    const cardRef =
      (contact.bId != null && String(contact.bId).trim() ? String(contact.bId).trim() : '') ||
      (contact.sid != null && String(contact.sid).trim() ? String(contact.sid).trim() : '');
    if (!cardRef) {
      Alert.alert(
        t('contacts_mute_impossible_title'),
        t('contacts_mute_impossible_body'),
      );
      return;
    }
    const nextMuted = !contact.channelMuted;
    try {
      await setSubscriberSelfCardMute({
        viewerUid,
        issuerUid: contact.uid,
        cardRef,
        muted: nextMuted,
      });
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const linkKey = receivedContactMergeKey(contact);
      setContacts((prev) => {
        const next = prev.map((row) =>
          receivedContactMergeKey(row) === linkKey ? { ...row, channelMuted: nextMuted } : row,
        );
        void persistContactsCache(next);
        return next;
      });
      Toast.show({
        type: 'success',
        text1: nextMuted ? t('contacts_channel_muted') : t('contacts_channel_active'),
        text2: nextMuted
          ? t('contacts_mute_detail_on')
          : t('contacts_mute_detail_off'),
        position: 'bottom',
        visibilityTime: 2800,
      });
    } catch (error: any) {
      Alert.alert(
        t('common_error'),
        userFacingAlertMessage(error, language, t('common_try_again')),
      );
    }
  };

  const openFloatingCard = async (contact: Contact) => {
    setSelectedContact(contact);
    setFloatingVisible(true);
  };

  const openReceptorModal = async (contact: Contact) => {
    const ref =
      (contact.bId != null && String(contact.bId).trim() ? String(contact.bId).trim() : '') ||
      (contact.sid != null && String(contact.sid).trim() ? String(contact.sid).trim() : '');
    if (!contact.uid || !ref) return;
    setReceptorContact(contact);
    setReceptorModalVisible(true);
    setReceptorLoading(true);
    try {
      const response = await listCardSubscribers({ uid: contact.uid, cardRef: ref });
      setReceptorSubscribers(response.subscribers);
    } catch {
      setReceptorSubscribers([]);
    } finally {
      setReceptorLoading(false);
    }
  };

  const closeFloatingCard = () => {
    Keyboard.dismiss();
    setFloatingVisible(false);
    setSelectedContact(null);
  };

  const onLongPressRow = (contact: Contact) => {
    setLongPressContact(contact);
    setLongPressVisible(true);
  };

  return (
    <>
    <LinearGradient colors={[...shell.tabShellGradient]} style={styles.container}>
      {/* Header with title and Sort button */}
      <View style={styles.headerBar}>
        <Text style={[styles.headerTitle, { color: shell.textPrimary }]}>{t('contacts_title')}</Text>
        <TouchableOpacity
          style={[styles.sortBtn, { backgroundColor: shell.utilBtnBg, borderColor: shell.utilBtnBorder }]} onPress={() => setSortVisible(true)} activeOpacity={0.86}>
          <Text style={[styles.sortBtnText, { color: shell.textPrimary }]}>{t('contacts_sort')}</Text>
        </TouchableOpacity>
      </View>

      {/* Active sort pill */}
      <View style={styles.activeSortPillWrap}>
        <Text style={[styles.activeSortPill, { color: shell.textPrimary, backgroundColor: shell.filterPillBg }]}>
          {t('contacts_filter_active')}{' '}
          {sortMode === 'name'
            ? t('contacts_filter_name')
            : sortMode === 'card'
              ? t('contacts_filter_card_name')
              : sortMode === 'date'
                ? t('contacts_filter_date')
                : t('contacts_filter_groups')}
        </Text>
      </View>

      {/* Scrollable contacts list */}
      <View style={{ flex: 1, position: 'relative' }}>
        <Animated.View
          style={[
            styles.listAnimatedWrap,
            {
              opacity: listEntrance,
              transform: [
                {
                  translateY: listEntrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={contactsListScrollContentStyle}
            {...listScrollInteractionProps}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            onScrollBeginDrag={closeAllSwipes}
          >
            {loading && contacts.length === 0 ? (
              <View style={styles.skeletonListWrap}>
                <SharedCardSkeletonList count={6} isDark={isNight} avatarSize={81} />
              </View>
            ) : rowsWithHeaders.length === 0 ? (
              <Pressable onPress={Keyboard.dismiss} style={styles.emptyListRoot}>
                <MaterialCommunityIcons name="magnify" size={64} color={shell.searchPlaceholder} />
                {contacts.length === 0 && !searchValue.trim() ? (
                  <>
                    <Text style={[styles.emptyListTitle, { color: shell.textPrimary }]}>
                      {t('contacts_empty_title')}
                    </Text>
                    <Text style={[styles.emptyListSubtitle, { color: shell.textSecondary }]}>
                      {t('contacts_empty_subtitle')}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.emptyListTitle, { color: shell.textPrimary }]}>
                      {t('contacts_no_matches')}
                    </Text>
                    <Text style={[styles.emptyListSubtitle, { color: shell.textSecondary }]}>
                      {t('contacts_no_matches_sub')}
                    </Text>
                  </>
                )}
              </Pressable>
            ) : (
              <FlexGrid
                listMode
                style={styles.listContainer}
                items={rowsWithHeaders as ContactListRow[]}
                getKey={(item) => item.key}
                renderItem={(item: ContactListRow, _index, _ui) => {
                if (item.type === 'header') {
                  return (
                    <View style={styles.groupHeaderWrap}>
                      <Text style={[styles.groupHeaderText, { color: shell.textPrimary }]}>{item.title}</Text>
                    </View>
                  );
                }
                const row = item.contact;
                const rowLinkKey = receivedContactMergeKey(row);
                const holders = row.holdersCount ?? 0;
                const chest = getCardRowTheme(row.themeId);
                const lightChipFg = resolvePillForegroundColor({
                  cardGradient: chest.gradient,
                  pillBackground: 'rgba(255,255,255,0.72)',
                  preferredColor: chest.iconColor,
                });
                const issuerFont = row.fontFamily ? { fontFamily: row.fontFamily } : null;
                const bizLogoUri =
                  row.cardType === 'business' && row.bcLogoUrl
                    ? toRenderableImageUri(row.bcLogoUrl) ?? row.bcLogoUrl
                    : null;
                const closeRowSwipe = () => {
                  swipeableByContactLinkRef.current.get(rowLinkKey)?.close();
                };
                return (
                  <Swipeable
                    containerStyle={styles.contactSwipeRow}
                    overshootRight={false}
                    rightThreshold={36}
                    friction={1.8}
                    renderLeftActions={(_progress, _translation, methods) => {
                      swipeableByContactLinkRef.current.set(rowLinkKey, methods);
                      return null;
                    }}
                    onSwipeableWillOpen={() => {
                      /* Close any other open swipe before opening this one */
                      for (const [k, m] of swipeableByContactLinkRef.current) {
                        if (k !== rowLinkKey) m.close();
                      }
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }}
                    renderRightActions={() => (
                        <View style={styles.swipeActionsRow}>
                          <TouchableOpacity
                            style={[styles.swipeActionCol, styles.swipeActionColMute]}
                            onPress={() => {
                              closeRowSwipe();
                              void promptToggleChannelMute(row);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={
                              row.channelMuted ? t('contacts_unmute') : t('contacts_mute')
                            }
                          >
                            <MaterialCommunityIcons name={row.channelMuted ? 'volume-high' : 'volume-off'} size={20} color="#FFFFFF" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.swipeActionCol, styles.swipeActionColBlock]}
                            onPress={() => {
                              closeRowSwipe();
                              promptBlockContact(row.uid);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={t('common_block')}
                          >
                            <MaterialCommunityIcons name="cancel" size={20} color="#FFFFFF" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.swipeActionCol, styles.swipeActionColDanger]}
                            onPress={() => {
                              closeRowSwipe();
                              void promptDeleteContact(row);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={t('common_delete')}
                          >
                            <MaterialCommunityIcons name="trash-can-outline" size={20} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                    )}
                  >
                    <Animated.View style={{ transform: [{ scale: pressScaleForContactLink(rowLinkKey) }] }}>
                    <BunkerContactPremiumGlow
                      visible={Boolean(premiumGlowByLinkKey[rowLinkKey])}
                      accentColor={shell.ctaAccent}
                    >
                    <ThemedSharedCardSurface
                      themeId={row.themeId}
                      wallpaperUrl={row.wallpaperUrl || undefined}
                      borderRadius={16}
                      style={[styles.contactThemedSurface, row.channelMuted ? styles.contactCardMuted : null]}
                    >
                      <Pressable
                        style={styles.contactCardInnerThemed}
                        onPress={() => {
                          closeAllSwipes();
                          void openFloatingCard(row);
                        }}
                        onLongPress={() => {
                          closeRowSwipe();
                          onLongPressRow(row);
                        }}
                        delayLongPress={400}
                        onPressIn={() => animateContactRowPressIn(rowLinkKey)}
                        onPressOut={() => animateContactRowPressOut(rowLinkKey)}
                      >
                        {row.channelMuted ? (
                          <View
                            style={[
                              styles.channelMutedBadge,
                              { backgroundColor: 'rgba(255,255,255,0.82)', borderColor: chest.borderColor },
                            ]}
                            accessibilityLabel={t('contacts_blocked_a11y')}
                          >
                            <MaterialCommunityIcons name="volume-off" size={12} color={chest.titleColor} />
                            <Text style={[styles.channelMutedBadgeText, { color: chest.metaColor }]}>
                              {t('contacts_muted_label')}
                            </Text>
                          </View>
                        ) : null}
                        <View style={[styles.avatarRingLg, styles.avatarRingNone]}>
                          {row.cardType === 'business' && bizLogoUri ? (
                            <ExpoImage
                              source={{ uri: resolveVaultMediaUrlForApp(bizLogoUri) ?? bizLogoUri }}
                              style={styles.avatarLg}
                              cachePolicy="disk"
                            />
                          ) : row.cardType === 'business' ? (
                            <View
                              style={[
                                styles.avatarFallbackLg,
                                {
                                  backgroundColor: MEDIA_PLACEHOLDER.personBgLight,
                                  borderColor: MEDIA_PLACEHOLDER.personBorderLight,
                                },
                              ]}
                            >
                              <Text
                                style={[styles.avatarInitials, { color: MEDIA_PLACEHOLDER.personIconLight }]}
                                numberOfLines={1}
                              >
                                {initialsFromDisplayName(
                                  String(row.bcName || '').trim() || String(row.cardName || '').trim(),
                                )}
                              </Text>
                            </View>
                          ) : row.userAvatarUrl ? (
                            <ExpoImage
                              source={{ uri: resolveVaultMediaUrlForApp(row.userAvatarUrl) ?? row.userAvatarUrl }}
                              style={styles.avatarLg}
                              cachePolicy="disk"
                            />
                          ) : (
                            <View
                              style={[
                                styles.avatarFallbackLg,
                                {
                                  backgroundColor: MEDIA_PLACEHOLDER.personBgLight,
                                  borderColor: MEDIA_PLACEHOLDER.personBorderLight,
                                },
                              ]}
                            >
                              <Text
                                style={[styles.avatarInitials, { color: MEDIA_PLACEHOLDER.personIconLight }]}
                                numberOfLines={1}
                              >
                                {initialsFromDisplayName(row.userFullName)}
                              </Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.contactCardBody}>
                          {row.cardType === 'business' ? (
                            <>
                              <Text
                                style={[
                                  styles.contactTitleName,
                                  {
                                    color: chest.titleColor,
                                    fontWeight: chest.titleFontWeight,
                                    fontStyle: chest.titleFontStyle,
                                  },
                                  issuerFont,
                                ]}
                                numberOfLines={2}
                              >
                                {String(row.bcName || '').trim() || row.cardName}
                              </Text>
                              {row.bcContactName ? (
                                <Text
                                  style={[
                                    styles.contactSubtitleCardName,
                                    {
                                      color: chest.metaColor,
                                      fontWeight: chest.subtitleFontWeight,
                                      fontStyle: chest.subtitleFontStyle,
                                    },
                                    issuerFont,
                                  ]}
                                  numberOfLines={2}
                                >
                                  {String(row.bcContactName).trim()}
                                </Text>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <Text
                                style={[
                                  styles.contactTitleName,
                                  {
                                    color: chest.titleColor,
                                    fontWeight: chest.titleFontWeight,
                                    fontStyle: chest.titleFontStyle,
                                  },
                                  issuerFont,
                                ]}
                                numberOfLines={2}
                              >
                                {row.userFullName}
                              </Text>
                              {row.ownerOccupation ? (
                                <Text
                                  style={[
                                    styles.contactOccupationLine,
                                    {
                                      color: chest.extraColor,
                                      fontSize: chest.extraFontSize,
                                      fontWeight: chest.extraFontWeight,
                                      fontStyle: chest.extraFontStyle,
                                    },
                                    issuerFont,
                                  ]}
                                  numberOfLines={2}
                                >
                                  {row.ownerOccupation}
                                </Text>
                              ) : null}
                              <Text
                                style={[
                                  styles.contactSubtitleCardName,
                                  {
                                    color: chest.metaColor,
                                    fontWeight: chest.subtitleFontWeight,
                                    fontStyle: chest.subtitleFontStyle,
                                  },
                                  issuerFont,
                                ]}
                                numberOfLines={1}
                              >
                                {row.cardName}
                              </Text>
                            </>
                          )}
                          <View style={styles.contactRowStatsRow}>
                            <TouchableOpacity
                              style={[
                                styles.mutualCountPill,
                                { backgroundColor: 'rgba(255,255,255,0.72)', borderColor: chest.borderColor },
                              ]}
                              onPress={() => { void openReceptorModal(row); }}
                              activeOpacity={0.7}
                              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            >
                              <MaterialCommunityIcons name="account-group-outline" size={11} color={lightChipFg} />
                              <Text style={[styles.mutualCountPillText, { color: lightChipFg }]}>{holders}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        {row.cardType === 'business' && row.bId ? (
                          <View style={styles.contactBusinessQrWrap} pointerEvents="none">
                            <QRCode
                              value={generatePermanentBusinessLink(
                                String(row.bId).trim(),
                                String(row.uid).trim(),
                              )}
                              size={64}
                              color="#0A2540"
                              backgroundColor="#FFFFFF"
                              ecl="H"
                              {...(bizLogoUri
                                ? {
                                    logo: { uri: bizLogoUri },
                                    logoSize: 16,
                                    logoMargin: 2,
                                    logoBackgroundColor: '#FFFFFF',
                                  }
                                : {})}
                            />
                          </View>
                        ) : null}
                      </Pressable>
                    </ThemedSharedCardSurface>
                    </BunkerContactPremiumGlow>
                    </Animated.View>
                  </Swipeable>
                );
              }}
            />
            )}
            <Pressable onPress={closeAllSwipes} style={{ flexGrow: 1, minHeight: 80 }} />
          </ScrollView>
        </Animated.View>
      </View>

      <View
        style={[
          styles.contactSearchWrap,
          { backgroundColor: shell.inputBg, borderColor: shell.searchBorder },
        ]}
        pointerEvents="auto"
      >
        <MaterialCommunityIcons name="magnify" size={18} color={shell.sectionLabel} />
        <TextInput
          style={[styles.contactSearchInput, { color: shell.inputText }]}
          placeholder={t('contacts_search_placeholder')}
          placeholderTextColor={shell.sectionLabel}
          value={searchValue}
          onChangeText={setSearchValue}
          returnKeyType="search"
          onSubmitEditing={Keyboard.dismiss}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchValue.length > 0 ? (
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              setSearchValue('');
            }}
            accessibilityLabel={t('contacts_clear_search_a11y')}
          >
            <MaterialCommunityIcons name="close-circle" size={16} color={shell.sectionLabel} />
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.floatingScanButton, { backgroundColor: shell.scanFabBg }]}
        onPress={() => router.push('/scan' as any)}
        activeOpacity={0.82}
      >
        <MaterialCommunityIcons name="qrcode-scan" size={22} color={shell.scanFabIcon} />
      </TouchableOpacity>

      <Modal visible={sortVisible} transparent animationType="slide" onRequestClose={() => setSortVisible(false)}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: shell.overlayScrim }]} onPress={() => setSortVisible(false)}>
          <Pressable style={[styles.sortModalCard, { backgroundColor: shell.modalBg, borderColor: shell.modalBorder, paddingBottom: modalFooterBottomPad }]}>
            <Text style={[styles.sortModalTitle, { color: shell.textPrimary }]}>
              {t('contacts_sort_title')}
            </Text>
            {[
              { key: 'name', label: t('contacts_sort_name') },
              { key: 'card', label: t('contacts_sort_card') },
              { key: 'date', label: t('contacts_sort_date') },
              { key: 'groups', label: t('contacts_sort_groups') }].map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.sortOptionRow,
                  sortMode === option.key && styles.sortOptionRowActive,
                  {
                    backgroundColor: sortMode === option.key ? (isNight ? 'rgba(233,195,73,0.18)' : shell.modalRowBg) : shell.modalRowBg,
                    borderColor: sortMode === option.key ? shell.ctaAccent : shell.modalRowBorder,
                  },
                ]}
                onPress={() => {
                  setSortMode(option.key as SortMode);
                  setSortVisible(false);
                }}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.sortOptionText,
                    sortMode === option.key && styles.sortOptionTextActive,
                    { color: sortMode === option.key ? shell.textPrimary : shell.textSecondary },
                  ]}
                >
                  {option.label}
                </Text>
                {sortMode === option.key ? <MaterialCommunityIcons name="check-circle" size={17} color={shell.ctaAccent} /> : null}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={longPressVisible} transparent animationType="fade" onRequestClose={() => setLongPressVisible(false)}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: shell.overlayScrim }]} onPress={() => setLongPressVisible(false)}>
          <Pressable onPress={() => {}} style={[styles.actionModalCard, { backgroundColor: shell.modalBg, borderColor: shell.modalBorder, paddingBottom: modalFooterBottomPad }]}>
            <Text style={[styles.actionModalTitle, { color: shell.textPrimary }]}>
              {longPressContact?.cardType === 'business'
                ? String(longPressContact.bcName || '').trim() ||
                  longPressContact.cardName ||
                  t('contacts_sheet_contact')
                : longPressContact?.userFullName || t('contacts_sheet_contact')}
            </Text>
            {longPressContact?.cardType === 'business' ? (
              longPressContact.bcContactName ? (
                <Text
                  style={[styles.contactSubtitleCardName, { color: shell.textSecondary, marginBottom: 8, textAlign: 'center' }]}
                  numberOfLines={2}
                >
                  {longPressContact.bcContactName}
                </Text>
              ) : null
            ) : longPressContact?.cardName ? (
              <Text style={[styles.contactSubtitleCardName, { color: shell.textSecondary, marginBottom: 8, textAlign: 'center' }]} numberOfLines={2}>
                {longPressContact.cardName}
              </Text>
            ) : null}
            <TouchableOpacity
              style={[styles.actionRow, { backgroundColor: shell.modalRowBg, borderColor: shell.modalRowBorder }]}
              activeOpacity={0.85}
              onPress={() => {
                const c = longPressContact;
                if (!c) {
                  return;
                }
                void updateContactMeta(c, (prev) => ({
                  ...prev,
                  isFavorite: !prev.isFavorite,
                }));
                setLongPressVisible(false);
                setLongPressContact(null);
              }}
            >
              <MaterialCommunityIcons
                name={
                  longPressContact && (metaMap[receivedContactMergeKey(longPressContact)] || metaMap[longPressContact.uid])?.isFavorite
                    ? 'star'
                    : 'star-outline'
                }
                size={18}
                color={shell.iconColor}
              />
              <Text style={[styles.actionText, { color: shell.textSecondary }]}>
                {t('contacts_favorite_a11y')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionRow, { backgroundColor: shell.modalRowBg, borderColor: shell.modalRowBorder }]}
              activeOpacity={0.85}
              onPress={() => {
                setLongPressVisible(false);
                setGroupPickerVisible(true);
              }}
            >
              <MaterialCommunityIcons name="folder-move-outline" size={18} color={shell.iconColor} />
              <Text style={[styles.actionText, { color: shell.textSecondary }]}>
                {t('contacts_move_group')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionRow, { backgroundColor: shell.modalRowBg, borderColor: shell.modalRowBorder }]}
              activeOpacity={0.85}
              onPress={() => {
                const c = longPressContact;
                if (!c) {
                  return;
                }
                setLongPressVisible(false);
                setLongPressContact(null);
                void promptDeleteContact(c);
              }}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={shell.iconColor} />
              <Text style={[styles.actionText, { color: shell.textSecondary }]}>{t('common_delete')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionRowDanger, { backgroundColor: shell.danger, borderColor: shell.danger }]}
              activeOpacity={0.85}
              onPress={() => {
                const uid = longPressContact?.uid;
                if (!uid) {
                  return;
                }
                setLongPressVisible(false);
                setLongPressContact(null);
                promptBlockContact(uid);
              }}
            >
              <MaterialCommunityIcons name="cancel" size={18} color={shell.fabText} />
              <Text style={[styles.actionTextDanger, { color: shell.fabText }]}>{t('common_block')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={groupPickerVisible} transparent animationType="fade" onRequestClose={() => setGroupPickerVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: shell.overlayScrim }]}>
          <View style={[styles.groupPickerCard, { backgroundColor: shell.modalBg, borderColor: shell.border, paddingBottom: modalFooterBottomPad }]}>
            <Text style={[styles.sortModalTitle, { color: shell.textPrimary }]}>
              {t('contacts_select_group')}
            </Text>
            {allGroups.map((groupName) => (
              <View key={groupName} style={styles.groupRowWrap}>
                <TouchableOpacity
                  style={[styles.sortOptionRow, styles.groupSelectRow, { backgroundColor: shell.modalRowBg, borderColor: shell.modalRowBorder }]}
                  onPress={() => {
                    const c = longPressContact;
                    if (!c) {
                      return;
                    }
                    void updateContactMeta(c, (prev) => ({
                      ...prev,
                      group: groupName,
                    }));
                    setGroupPickerVisible(false);
                  }}
                >                  <Text style={[styles.sortOptionText, { color: shell.textSecondary }]}>{groupName}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.groupFavBtn, Boolean(groupFavorites[groupName]) && styles.groupFavBtnActive]}
                  onPress={() => {
                    void toggleGroupFavorite(groupName);
                  }}
                >
                  <MaterialCommunityIcons
                    name={Boolean(groupFavorites[groupName]) ? 'star' : 'star-outline'}
                    size={16}
                    color={Boolean(groupFavorites[groupName]) ? shell.ctaAccent : shell.iconColor}
                  />
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.newGroupWrap}>
              <TextInput
                style={[styles.newGroupInput, { backgroundColor: shell.modalRowBg, borderColor: shell.modalRowBorder, color: shell.searchText }]}
                placeholder={t('contacts_placeholder_new_group')}
                placeholderTextColor={shell.searchPlaceholder}
                value={newGroupName}
                onChangeText={setNewGroupName}
              />
              <TouchableOpacity
                style={[styles.newGroupBtn, { backgroundColor: shell.ctaPrimary }]}
                onPress={() => {
                  const name = String(newGroupName || '').trim();
                  const c = longPressContact;
                  if (!c || !name) {
                    return;
                  }
                  void updateContactMeta(c, (prev) => ({
                    ...prev,
                    group: name,
                  }));
                  setNewGroupName('');
                  setGroupPickerVisible(false);
                }}
              >
                <MaterialCommunityIcons name="plus" size={16} color={shell.btnPrimaryText} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <MyCardsPreviewModal
        key={floatingVisible && selectedContact ? `contacts-mirror-${selectedContact.uid}` : 'contacts-mirror-closed'}
        visible={Boolean(floatingVisible && selectedContact)}
        onClose={closeFloatingCard}
        variant="receiver"
        payload={contactPayload}
        ghostTargetUid={selectedContact?.uid}
        sourceSid={selectedContact?.sid ?? null}
        sourceBId={selectedContact?.bId ?? null}
        sourceCardName={selectedContact?.cardName}
        ghostCardContactName={
          selectedContact?.cardType === 'business'
            ? (selectedContact.bcContactName != null && String(selectedContact.bcContactName).trim()
                ? String(selectedContact.bcContactName).trim()
                : null)
            : null
        }
        peerDisplayName={
          selectedContact?.cardType === 'business'
            ? String(selectedContact.bcName || '').trim() ||
              selectedContact.cardName ||
              selectedContact.bcContactName ||
              '—'
            : selectedContact?.userNickName || selectedContact?.userFullName || 'contacto'
        }
        ratingCardType={selectedContact?.cardType ?? 'smart'}
        medalRatingUseNativeAndroidModal={Platform.OS === 'android'}
      />
    </LinearGradient>

      <ReceptorScreenModal
        visible={receptorModalVisible}
        onClose={() => {
          setReceptorModalVisible(false);
          setReceptorContact(null);
          setReceptorSubscribers([]);
        }}
        owner={
          receptorContact?.cardType === 'business'
            ? {
                displayName:
                  String(receptorContact.bcName || '').trim() || receptorContact.cardName || '',
                occupation: String(receptorContact.bcContactName || '').trim(),
                userAvatarUrl: null,
                brandLogoUrl: receptorContact.bcLogoUrl ?? null,
              }
            : {
                displayName: receptorContact?.userFullName || '',
                occupation: receptorContact?.ownerOccupation || receptorContact?.cardName || '',
                userAvatarUrl: receptorContact?.userAvatarUrl ?? null,
              }
        }
        subscribers={receptorSubscribers}
        totalCount={receptorContact?.holdersCount ?? receptorSubscribers.length}
        loading={receptorLoading}
        isDark={isNight}
        onBlockExternal={(targetUid, name) => {
          Alert.alert(
            t('contacts_block_user_title'),
            t('contacts_block_user_body', { name }),
            [
              { text: t('common_cancel'), style: 'cancel' },
              {
                text: t('common_block'),
                style: 'destructive',
                onPress: async () => {
                  const gated = await runPresidentialBiometricGate(t('biometric_reason_contacts_swipe'));
                  if (!gated) return;
                  try {
                    const viewerUid = await getActiveUserId();
                    if (!viewerUid) return;
                    await blockRelationship({ uid: viewerUid, targetUid });
                    setReceptorSubscribers((prev) => prev.filter((r) => r.uid !== targetUid));
                  } catch (e: any) {
                    Alert.alert(
                      t('common_error'),
                      userFacingAlertMessage(e, language, t('contacts_block_failed_msg')),
                    );
                  }
                },
              },
            ],
          );
        }}
      />
    </>
  );
}
