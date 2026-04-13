import ErrorBoundary from '@/components/ErrorBoundary';
import FlexGrid from '@/components/FlexGrid';
import { MyCardsPreviewModal, type MyCardsPayload } from '@/components/MyCards';
import ReceptorScreenModal from '@/components/ReceptorScreenModal';
import { SharedCardSkeletonList } from '@/components/SharedCardRowSkeleton';
import { type WireframeEditSlot } from '@/components/smartCard/IsolatedWireframeCard';
import { ThemedSharedCardSurface } from '@/components/ThemedSharedCardSurface';
import { brandCsIconLogoBgTransparent } from '@/constants/brandAssets';
import { MEDIA_PLACEHOLDER } from '@/constants/mediaPlaceholders';
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import { buildMirrorVaultItemsForContact } from '@/services/buildReceiverPreviewVaultItems';
import { collectStringsReceivedContact, orderByDeepSearchWithExpandedQuery } from '@/services/deepSearch';
import {
    joinGhostLinkAgoraSession,
    leaveGhostLinkAgoraSession,
    setGhostLinkAgoraMuted,
    setGhostLinkAgoraSpeaker,
} from '@/services/ghostLinkAgoraSession';
import {
    getIncomingGhostLinkInvite,
    respondGhostLinkInvite,
    type GhostLinkAgoraRtc,
    type GhostLinkIncomingInvite,
} from '@/services/ghostLinkVoip';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { buildExpandedMarketQuery } from '@/services/marketSearchSynonyms';
import {
    blockRelationship,
    createCallLog,
    listCardSubscribers,
    listReceivedContacts,
    removeRelationship,
    setSubscriberSelfCardMute,
    type CardSubscriberRow,
    type PublicCardSlotPayload,
} from '@/services/qrApi';
import {
    mergeReceivedContactRows,
    receivedContactMergeKey,
} from '@/services/receivedContactsPresentationMerge';
import { getCardRowTheme } from '@/services/useActiveTheme';
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
    Easing,
    Keyboard,
    LayoutAnimation,
    Modal,
    Platform,
    Pressable,
    ScrollView,
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

type Contact = {
  uid: string;
  cardId?: string | null;
  name: string;
  nickname: string;
  photoUrl: string | null;
  /** Cargo del emisor persistido en smart_cards. */
  ownerOccupation?: string | null;
  ratingAvg: number;
  cardName: string;
  holdersCount: number;
  /** Conexiones en común en el grafo de compartidos (solo número, sin listas). */
  mutualContactsCount?: number;
  totalRatings?: number;
  /** El receptor silenció historias de esta tarjeta. */
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
  addedAt: string | null;
  storyState?: 'none' | 'normal' | 'vip';
  searchFacets?: Array<{ type: string; label: string; value: string }>;
  /** Slots del emisor (icon URL / iconName) para el wireframe espejo del receptor. */
  publicCardSlots?: PublicCardSlotPayload[];
  /** 'business' para BusinessCard corporativa; 'smart' para tarjeta personal. */
  cardType?: 'business' | 'smart';
  meta?: {
    group: string;
    isFavorite: boolean;
    firstSeenAt: string;
    storyState: 'none' | 'normal' | 'vip';
  };
};

type ContactRow = { type: 'contact'; key: string; contact: Contact };
type HeaderRow = { type: 'header'; key: string; title: string };
type ContactListRow = ContactRow | HeaderRow;

type ContactMeta = {
  group: string;
  isFavorite: boolean;
  firstSeenAt: string;
  storyState?: 'none' | 'normal' | 'vip';
  icons?: Icon[]; // Add icons property to support icon search
  /** Tema capturado al aceptar por QR (prioridad sobre default del API si faltó smart_cards). */
  scanThemeId?: string;
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

type ActiveGhostCallView = {
  inviteId?: string;
  sessionId: string;
  sourceCardName: string;
  peerName: string;
  peerNickname: string;
  peerPhotoUrl: string | null;
  direction: 'incoming' | 'outgoing';
  agora?: GhostLinkAgoraRtc;
};

type IncomingGhostCallView = {
  inviteId: string;
  sessionId: string;
  sourceCardName: string;
  callerUid: string;
  callerName: string;
  callerNickname: string;
  callerPhotoUrl: string | null;
  agora?: GhostLinkAgoraRtc;
};

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
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const shell = appPalette[isNight ? 'dark' : 'light'];
  const styles = useMemo(() => makeContactsStyles(shell), [shell]);
  const tr = (es: string, en: string) => language === 'en' ? en : es;
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

  const [activeGhostCall, setActiveGhostCall] = useState<ActiveGhostCallView | null>(null);
  const [incomingGhostCall, setIncomingGhostCall] = useState<IncomingGhostCallView | null>(null);
  const [ghostCallMuted, setGhostCallMuted] = useState(false);
  const [ghostCallSpeaker, setGhostCallSpeaker] = useState(false);

  /* Receptor modal state */
  const [receptorModalVisible, setReceptorModalVisible] = useState(false);
  const [receptorContact, setReceptorContact] = useState<Contact | null>(null);
  const [receptorSubscribers, setReceptorSubscribers] = useState<CardSubscriberRow[]>([]);
  const [receptorLoading, setReceptorLoading] = useState(false);
  const listEntrance = useRef(new Animated.Value(0)).current;
  const swipeableByContactLinkRef = useRef<Map<string, SwipeableMethods>>(new Map());
  const rowPressScaleRef = useRef<Map<string, Animated.Value>>(new Map());

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
    if (!activeGhostCall?.agora) {
      return;
    }
    setGhostLinkAgoraMuted(ghostCallMuted);
  }, [activeGhostCall?.agora, ghostCallMuted]);

  useEffect(() => {
    if (!activeGhostCall?.agora) {
      return;
    }
    setGhostLinkAgoraSpeaker(ghostCallSpeaker);
  }, [activeGhostCall?.agora, ghostCallSpeaker]);

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

  const getContactsCacheKey = (ownerUid: string) => `${CONTACTS_CACHE_STORAGE_KEY}_${ownerUid}`;

  const persistMetaMap = async (next: Record<string, ContactMeta>) => {
    setMetaMap(next);
    await AsyncStorage.setItem(CONTACT_META_STORAGE_KEY, JSON.stringify(next));
  };

  const normalizeContactRow = (row: Contact): Contact => {
    const slotSource = Array.isArray(row.publicCardSlots) ? row.publicCardSlots : [];
    const publicCardSlots: PublicCardSlotPayload[] = slotSource.map((s) => {
      const iconRaw = s?.icon != null ? String(s.icon).trim() : '';
      const icon = /^https?:\/\//i.test(iconRaw) ? iconRaw : undefined;
      const iconName = s?.iconName != null ? String(s.iconName).trim() : '';
      const vm = s?.vaultMimeType != null ? String(s.vaultMimeType).trim() : '';
      return {
        itemId: String(s?.itemId || ''),
        type: String(s?.type || 'link'),
        label: String(s?.label || ''),
        value: String(s?.value || ''),
        ...(icon ? { icon } : {}),
        ...(iconName ? { iconName } : {}),
        ...(vm ? { vaultMimeType: vm.slice(0, 120) } : {}),
      };
    });
    return {
      ...row,
      ownerOccupation:
        row.ownerOccupation != null && String(row.ownerOccupation).trim()
          ? String(row.ownerOccupation).trim()
          : null,
      mutualContactsCount: Number(row.mutualContactsCount ?? 0),
      totalRatings: Number(row.totalRatings ?? 0),
      channelMuted: Boolean(row.channelMuted),
      themeId: String(row.themeId || 'deep_teal').trim() || 'deep_teal',
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
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        setContacts([]);
        setLoading(false);
        return;
      }

      const cacheKey = getContactsCacheKey(ownerUid);
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
        const response = await listReceivedContacts({ ownerUid });
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
                storyState: row.storyState || legacy.storyState || 'none',
                firstSeenAt: row.addedAt || legacy.firstSeenAt || nowIso,
              }
            : {
                group: GROUP_DEFAULT,
                isFavorite: false,
                firstSeenAt: row.addedAt || nowIso,
                storyState: row.storyState || 'none',
              };
        } else if (!mergedMeta[linkKey].storyState) {
          mergedMeta[linkKey].storyState = row.storyState || 'none';
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
      void loadContacts(true);
    }, [])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void loadContacts(true);
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const normalizeIncomingInvite = (invite: GhostLinkIncomingInvite): IncomingGhostCallView | null => {
      const inviteId = String(invite?.inviteId || '').trim();
      const sessionId = String(invite?.sessionId || '').trim();
      const callerUid = String(invite?.ownerUid || '').trim();
      if (!inviteId || !sessionId || !callerUid) {
        return null;
      }

      return {
        inviteId,
        sessionId,
        sourceCardName: String(invite?.sourceCardName || 'Tarjeta Social').trim(),
        callerUid,
        callerName: String(invite?.callerDisplay?.name || 'Contacto').trim(),
        callerNickname: String(invite?.callerDisplay?.nickname || 'user').trim(),
        callerPhotoUrl: invite?.callerDisplay?.photoUrl ? String(invite.callerDisplay.photoUrl) : null,
        agora: invite.agora,
      };
    };

    const pollIncomingGhostLink = async () => {
      try {
        if (cancelled || Boolean(activeGhostCall)) {
          return;
        }

        const ownerUid = await getActiveUserId();
        if (!ownerUid) {
          return;
        }

        const invite = await getIncomingGhostLinkInvite({ ownerUid });
        if (cancelled) {
          return;
        }

        if (!invite) {
          setIncomingGhostCall(null);
          return;
        }

        const normalized = normalizeIncomingInvite(invite);
        if (!normalized) {
          return;
        }

        setIncomingGhostCall((prev) => {
          if (prev?.inviteId === normalized.inviteId) {
            return prev;
          }
          return normalized;
        });
      } catch {
        // Silent polling error: non-blocking for core contacts UX.
      }
    };

    void pollIncomingGhostLink();
    const timer = setInterval(() => {
      void pollIncomingGhostLink();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeGhostCall]);

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
    const nick = String(c.nickname || 'user').trim() || 'user';
    const cardNm = String(c.cardName || '').trim();
    const person = String(c.name || '').trim();
    const occ = String(c.ownerOccupation || '').trim();
    // Business cards: subtitle = ownerName (no @ prefix). Personal: @nickname.
    const subtitle = isBusiness
      ? person || occ || ''
      : nick.startsWith('@') ? nick : `@${nick}`;
    return {
      cardName: (cardNm || person || occ || tr('Tarjeta Social', 'Social Card')).trim(),
      subtitle,
      avatarUrl: c.photoUrl,
      themeId: c.themeId || '',
      wallpaperUrl: c.wallpaperUrl ?? undefined,
      layout: c.layout === 'horizontal' ? 'horizontal' : 'vertical',
      holdersCount: Math.max(0, Math.floor(Number(c.holdersCount ?? 0))),
      ratingAvg: Number(c.ratingAvg),
      totalRatings: Math.max(0, Math.floor(Number(c.totalRatings ?? 0))),
      enableParallax: Boolean(c.enableParallax),
      slots: mirrorPreviewSlots,
    };
  }, [selectedContact, mirrorPreviewSlots, tr]);

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

    const withMeta = contacts.map((contact) => {
      const linkKey = receivedContactMergeKey(contact);
      const meta =
        metaMap[linkKey] ||
        metaMap[contact.uid] || {
          group: GROUP_DEFAULT,
          isFavorite: false,
          firstSeenAt: contact.addedAt || new Date().toISOString(),
        };
      const scanTheme = meta.scanThemeId && String(meta.scanThemeId).trim();
      return {
        ...contact,
        ...(scanTheme ? { themeId: scanTheme } : {}),
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
          cardId: row.cardId ?? null,
          name: row.name,
          nickname: row.nickname,
          cardName: row.cardName,
          ownerOccupation: row.ownerOccupation ?? null,
          searchFacets: row.searchFacets,
        },
        row.meta.group,
        row.meta.icons,
      ),
    );
  }, [contacts, metaMap, searchValue]);

  const sortedContacts = useMemo(() => {
    const rows = [...normalizedContacts];

    const byFavoriteFirst = (a: any, b: any) => Number(Boolean(b.meta.isFavorite)) - Number(Boolean(a.meta.isFavorite));

    if (sortMode === 'date') {
      rows.sort((a, b) => {
        const favDiff = byFavoriteFirst(a, b);
        if (favDiff !== 0) {
          return favDiff;
        }
        return new Date(b.meta.firstSeenAt).getTime() - new Date(a.meta.firstSeenAt).getTime();
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
        return String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' });
      });
      return rows;
    }

    rows.sort((a, b) => {
      const favDiff = byFavoriteFirst(a, b);
      if (favDiff !== 0) {
        return favDiff;
      }
      return String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' });
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
    return { flexGrow: 1 as const, paddingBottom: 36 };
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

  const renderGhostLinkBrandLogo = () => (
    <View style={styles.ghostBrandLogoWrap} accessibilityRole="image" accessibilityLabel={tr('Card Social', 'Card Social')}>
      <ExpoImage
        source={brandCsIconLogoBgTransparent}
        style={styles.ghostBrandLogoImage}
        contentFit="contain"
      />
    </View>
  );

  const renderGhostAvatarGlowing = (uri: string | null) => (
    <View style={styles.ghostAvatarGlowOuter}>
      <View style={styles.ghostAvatarGlowInner}>
        {uri ? (
          <ExpoImage source={{ uri }} style={styles.ghostAvatarImage} cachePolicy="disk" />
        ) : (
          <View style={styles.ghostAvatarImageFallback}>
            <MaterialCommunityIcons name="account" size={40} color={shell.ghostLinkOnGradient} />
          </View>
        )}
      </View>
    </View>
  );

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
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        return;
      }
      await AsyncStorage.setItem(getContactsCacheKey(ownerUid), JSON.stringify(nextContacts));
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
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        return;
      }
      const scopedCardId = contact.cardId != null && String(contact.cardId).trim() ? String(contact.cardId).trim() : '';
      await removeRelationship({
        ownerUid,
        targetUid: contact.uid,
        ...(scopedCardId ? { cardId: scopedCardId } : {}),
      });
      await purgeReceivedCardLinkFromUi(contact);
      Toast.show({
        type: 'info',
        text1: tr('Tarjeta quitada', 'Card removed'),
        text2: tr(
          'Esta tarjeta ya no está en tu lista. Puedes volver a agregarla con un QR.',
          'This card is no longer in your list. You can add it again with a QR code.',
        ),
        position: 'bottom',
        visibilityTime: 4000,
      });
    } catch (error: any) {
      Alert.alert(tr('No se pudo eliminar', 'Could not delete'), error?.message || tr('Intenta de nuevo.', 'Try again.'));
    }
  };

  const promptDeleteContact = (contact: Contact) => {
    Alert.alert(
      tr('Quitar tarjeta recibida', 'Remove received card'),
      tr(
        'Esta tarjeta dejará de aparecer en tu lista. Si la persona te compartió otras tarjetas, esas se mantienen.',
        'This card will disappear from your list. If they shared other cards with you, those stay.',
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        {
          text: tr('Eliminar', 'Delete'),
          style: 'destructive',
          onPress: () => {
            void handleDeleteContact(contact);
          },
        },
      ],
    );
  };

  const handleBlockContact = async (uid: string) => {
    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        return;
      }
      await blockRelationship({ ownerUid, targetUid: uid });
      await purgeAllReceivedFromIssuerInUi(uid);
      Toast.show({
        type: 'info',
        text1: tr('Usuario bloqueado', 'User blocked'),
        text2: tr(
          'Ya no podrá interactuar contigo en la app hasta que lo desbloquees desde ajustes de relaciones.',
          'They can no longer interact with you in the app until you unblock them in relationship settings.',
        ),
        position: 'bottom',
        visibilityTime: 4500,
      });
    } catch (error: any) {
      Alert.alert(tr('No se pudo bloquear', 'Could not block'), error?.message || tr('Intenta de nuevo.', 'Try again.'));
    }
  };

  const promptBlockContact = (uid: string) => {
    Alert.alert(
      tr('Bloquear contacto', 'Block contact'),
      tr(
        'Esta persona dejará de aparecer en contactos y no podrá compartir ni comunicarse contigo por la app. Puedes desbloquearla más tarde en la lista de bloqueados.',
        'They will no longer appear in contacts and cannot share or reach you through the app. You can unblock them later from blocked users.',
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        {
          text: tr('Bloquear', 'Block'),
          style: 'destructive',
          onPress: () => {
            void handleBlockContact(uid);
          },
        },
      ],
    );
  };

  const handleToggleChannelMute = async (contact: Contact) => {
    const viewerUid = await getActiveUserId();
    if (!viewerUid) {
      return;
    }
    const cardId = contact.cardId ? String(contact.cardId).trim() : '';
    if (!cardId) {
      Alert.alert(
        tr('No se puede silenciar', 'Cannot mute'),
        tr('No hay una tarjeta vinculada a este contacto.', 'There is no card linked to this contact.'),
      );
      return;
    }
    const nextMuted = !contact.channelMuted;
    try {
      await setSubscriberSelfCardMute({
        viewerUid,
        issuerUid: contact.uid,
        cardId,
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
        text1: nextMuted ? tr('Canal silenciado', 'Channel muted') : tr('Canal activo', 'Channel unmuted'),
        text2: nextMuted
          ? tr('No verás historias de esta tarjeta hasta que reactives el canal.', 'You will not see stories from this card until you unmute the channel.')
          : tr('Volverás a ver historias de esta tarjeta.', 'You will see stories from this card again.'),
        position: 'bottom',
        visibilityTime: 2800,
      });
    } catch (error: any) {
      Alert.alert(tr('Error', 'Error'), error?.message || tr('Intenta de nuevo.', 'Try again.'));
    }
  };

  const openFloatingCard = async (contact: Contact) => {
    // Hard Lock: Require biometric before viewing contact details
    const authenticated = await hardLockCheck('ver detalles del contacto');
    if (!authenticated) {
      return; // User cancelled or auth failed
    }

    setSelectedContact(contact);
    setFloatingVisible(true);
  };

  const openReceptorModal = async (contact: Contact) => {
    if (!contact.uid || !contact.cardId) return;
    setReceptorContact(contact);
    setReceptorModalVisible(true);
    setReceptorLoading(true);
    try {
      const response = await listCardSubscribers({ ownerUid: contact.uid, cardId: contact.cardId });
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

  const endActiveGhostCall = () => {
    void leaveGhostLinkAgoraSession();
    void (async () => {
      try {
        const inviteId = String(activeGhostCall?.inviteId || '').trim();
        if (inviteId) {
          const ownerUid = await getActiveUserId();
          if (ownerUid) {
            await respondGhostLinkInvite({
              ownerUid,
              inviteId,
              action: 'end',
            });
          }
        }
      } catch {
        // End-call control is best-effort; local teardown still proceeds.
      }
    })();

    setActiveGhostCall(null);
    setGhostCallMuted(false);
    setGhostCallSpeaker(false);
  };

  const rejectIncomingGhostCall = () => {
    void (async () => {
      try {
        if (!incomingGhostCall) {
          return;
        }

        const ownerUid = await getActiveUserId();
        if (!ownerUid) {
          return;
        }

        await respondGhostLinkInvite({
          ownerUid,
          inviteId: incomingGhostCall.inviteId,
          action: 'reject',
        });

        await createCallLog({
          ownerUid,
          peerUid: incomingGhostCall.callerUid,
          direction: 'incoming',
          status: 'rejected',
          durationSec: 0,
          tags: ['Ghost-Link'],
          sourceCardName: incomingGhostCall.sourceCardName,
          sourceCardId: null,
          callChannel: 'ghost-link-voip',
        });
      } catch {
        // no-op
      } finally {
        setIncomingGhostCall(null);
      }
    })();
  };

  const acceptIncomingGhostCall = () => {
    void (async () => {
      try {
        if (!incomingGhostCall) {
          return;
        }

        const ownerUid = await getActiveUserId();
        if (!ownerUid) {
          return;
        }

        const authenticated = await hardLockCheck('aceptar llamada Ghost-Link');
        if (!authenticated) {
          return;
        }

        await respondGhostLinkInvite({
          ownerUid,
          inviteId: incomingGhostCall.inviteId,
          action: 'accept',
        });

        if (incomingGhostCall.agora) {
          try {
            await joinGhostLinkAgoraSession(incomingGhostCall.agora);
          } catch (agoraErr) {
            if (__DEV__) {
              console.warn('Ghost-Link Agora (callee join):', agoraErr);
            }
          }
        }

        setActiveGhostCall({
          inviteId: incomingGhostCall.inviteId,
          sessionId: incomingGhostCall.sessionId,
          sourceCardName: incomingGhostCall.sourceCardName,
          peerName: incomingGhostCall.callerName,
          peerNickname: incomingGhostCall.callerNickname,
          peerPhotoUrl: incomingGhostCall.callerPhotoUrl,
          direction: 'incoming',
          agora: incomingGhostCall.agora,
        });
        setGhostCallMuted(false);
        setGhostCallSpeaker(false);

        await createCallLog({
          ownerUid,
          peerUid: incomingGhostCall.callerUid,
          direction: 'incoming',
          status: 'completed',
          durationSec: 0,
          tags: ['Ghost-Link'],
          sourceCardName: incomingGhostCall.sourceCardName,
          sourceCardId: null,
          callChannel: 'ghost-link-voip',
        });

        setIncomingGhostCall(null);
      } catch (error: any) {
        Alert.alert(tr('No se pudo aceptar la llamada', 'Could not accept call'), error?.message || tr('Intenta de nuevo.', 'Try again.'));
      }
    })();
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
        <Text style={[styles.headerTitle, { color: shell.textPrimary }]}>{tr('Mis Contactos', 'My Contacts')}</Text>
        <TouchableOpacity
          style={[styles.sortBtn, { backgroundColor: shell.utilBtnBg, borderColor: shell.utilBtnBorder }]} onPress={() => setSortVisible(true)} activeOpacity={0.86}>
          <Text style={[styles.sortBtnText, { color: shell.textPrimary }]}>Sort</Text>
        </TouchableOpacity>
      </View>

      {/* Active sort pill */}
      <View style={styles.activeSortPillWrap}>
        <Text style={[styles.activeSortPill, { color: shell.textPrimary, backgroundColor: shell.filterPillBg }]}>Filtro activo: {sortMode === 'name' ? 'Nombre' : sortMode === 'card' ? 'Nombre Tarjeta' : sortMode === 'date' ? 'Fecha' : 'Grupos'}</Text>
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
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            nestedScrollEnabled
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
                      {tr('Sin contactos aún', 'No contacts yet')}
                    </Text>
                    <Text style={[styles.emptyListSubtitle, { color: shell.textSecondary }]}>
                      {tr(
                        'Escanea un QR o acepta invitaciones para ver contactos aquí.',
                        'Scan a QR or accept invites to see contacts here.',
                      )}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.emptyListTitle, { color: shell.textPrimary }]}>
                      {tr('Sin coincidencias', 'No matches')}
                    </Text>
                    <Text style={[styles.emptyListSubtitle, { color: shell.textSecondary }]}>
                      {tr(
                        'Prueba con otras palabras o sinónimos. También puedes revisar tu conexión.',
                        'Try different words or synonyms. You can also check your connection.',
                      )}
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
                const issuerFont = row.fontFamily ? { fontFamily: row.fontFamily } : null;
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
                              void handleToggleChannelMute(row);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={
                              row.channelMuted ? tr('Dejar de silenciar', 'Unmute') : tr('Silenciar', 'Mute')
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
                            accessibilityLabel={tr('Bloquear', 'Block')}
                          >
                            <MaterialCommunityIcons name="cancel" size={20} color="#FFFFFF" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.swipeActionCol, styles.swipeActionColDanger]}
                            onPress={() => {
                              closeRowSwipe();
                              promptDeleteContact(row);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={tr('Eliminar', 'Delete')}
                          >
                            <MaterialCommunityIcons name="trash-can-outline" size={20} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                    )}
                  >
                    <Animated.View style={{ transform: [{ scale: pressScaleForContactLink(rowLinkKey) }] }}>
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
                            accessibilityLabel={tr('Canal silenciado', 'Channel muted')}
                          >
                            <MaterialCommunityIcons name="volume-off" size={12} color={chest.titleColor} />
                            <Text style={[styles.channelMutedBadgeText, { color: chest.metaColor }]}>
                              {tr('Silenciado', 'Muted')}
                            </Text>
                          </View>
                        ) : null}
                        <View
                          style={[
                            styles.avatarRingLg,
                            row.storyState === 'vip' || row.meta?.storyState === 'vip'
                              ? {
                                  borderWidth: 2.4,
                                  borderColor: shell.ctaAccent,
                                  backgroundColor: isNight ? 'rgba(212,175,55,0.16)' : 'rgba(212,175,55,0.1)',
                                }
                              : row.storyState === 'normal' || row.meta?.storyState === 'normal'
                                ? {
                                    borderWidth: 2.4,
                                    borderColor: shell.success,
                                    backgroundColor: isNight ? 'rgba(48,209,88,0.12)' : 'rgba(52,199,89,0.09)',
                                  }
                                : styles.avatarRingNone,
                          ]}
                        >
                          {row.photoUrl ? (
                            <ExpoImage source={{ uri: row.photoUrl }} style={styles.avatarLg} cachePolicy="disk" />
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
                                {initialsFromDisplayName(row.name)}
                              </Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.contactCardBody}>
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
                            {row.name}
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
                              <MaterialCommunityIcons name="account-group-outline" size={11} color={chest.titleColor} />
                              <Text style={[styles.mutualCountPillText, { color: chest.titleColor }]}>{holders}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </Pressable>
                    </ThemedSharedCardSurface>
                    </Animated.View>
                  </Swipeable>
                );
              }}
            />
            )}
            <Pressable onPress={closeAllSwipes} style={{ flexGrow: 1, minHeight: 80 }} />
          </ScrollView>
        </Animated.View>

        {/* Floating Scan Button */}
        <View style={styles.floatingScanButtonContainer} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.floatingScanButton, { backgroundColor: shell.scanFabBg }]}
            onPress={() => router.push('/scan' as any)}
            activeOpacity={0.82}
          >
            <MaterialCommunityIcons name="qrcode-scan" size={28} color={shell.scanFabIcon} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar fixed at bottom above navbar */}
      <View style={[styles.bottomToolbar, { backgroundColor: shell.surface, borderTopColor: shell.border }]}>
        <View style={[styles.searchWrap, { backgroundColor: shell.searchBg, borderColor: shell.searchBorder }]}> 
          <MaterialCommunityIcons name="magnify" size={17} color={shell.iconColor} />
          <TextInput
            style={[styles.searchInput, { color: shell.searchText }]}
            placeholder={tr(
              'Buscar nombre, tarjeta, grupo o datos compartidos (no teléfonos)',
              'Search name, card, group, or shared data (not phone numbers)'
            )}
            placeholderTextColor={shell.searchPlaceholder}
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
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={tr('Limpiar búsqueda', 'Clear search')}
            >
              <MaterialCommunityIcons name="close-circle" size={18} color={shell.searchPlaceholder} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <Modal visible={sortVisible} transparent animationType="slide" onRequestClose={() => setSortVisible(false)}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: shell.overlayScrim }]} onPress={() => setSortVisible(false)}>
          <Pressable style={[styles.sortModalCard, { backgroundColor: shell.modalBg, borderColor: shell.modalBorder }]}>
            <Text style={[styles.sortModalTitle, { color: shell.textPrimary }]}>Ordenar contactos</Text>
            {[
              { key: 'name', label: tr('Nombre (A-Z, favoritos arriba)', 'Name (A-Z, favorites first)') },
              { key: 'card', label: tr('Nombre de Tarjeta', 'Card Name') },
              { key: 'date', label: tr('Fecha de agregado', 'Date Added') },
              { key: 'groups', label: tr('Grupos', 'Groups') }].map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.sortOptionRow,
                  sortMode === option.key && styles.sortOptionRowActive,
                  {
                    backgroundColor: sortMode === option.key ? shell.storiesControlActiveBg : shell.modalRowBg,
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
          <Pressable onPress={() => {}} style={[styles.actionModalCard, { backgroundColor: shell.modalBg, borderColor: shell.modalBorder }]}>
            <Text style={[styles.actionModalTitle, { color: shell.textPrimary }]}>{longPressContact?.name || tr('Contacto', 'Contact')}</Text>
            {longPressContact?.cardName ? (
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
                {tr('Favorito / quitar favorito', 'Favorite / unfavorite')}
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
                {tr('Mover a grupo', 'Move to group')}
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
                promptDeleteContact(c);
              }}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={shell.iconColor} />
              <Text style={[styles.actionText, { color: shell.textSecondary }]}>{tr('Eliminar', 'Delete')}</Text>
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
              <Text style={[styles.actionTextDanger, { color: shell.fabText }]}>{tr('Bloquear', 'Block')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={groupPickerVisible} transparent animationType="fade" onRequestClose={() => setGroupPickerVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: shell.overlayScrim }]}>
          <View style={[styles.groupPickerCard, { backgroundColor: shell.modalBg, borderColor: shell.border }]}>
            <Text style={[styles.sortModalTitle, { color: shell.textPrimary }]}>Selecciona Grupo</Text>
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
                placeholder="Crear nuevo grupo"
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
        sourceCardId={selectedContact?.cardId ?? null}
        sourceCardName={selectedContact?.cardName}
        peerDisplayName={selectedContact?.nickname || selectedContact?.name || 'contacto'}
        ratingCardType={selectedContact?.cardType ?? 'smart'}
      />

      <Modal
        visible={Boolean(activeGhostCall)}
        transparent
        animationType="fade"
        onRequestClose={endActiveGhostCall}
      >
        <LinearGradient
          colors={[...shell.ghostLinkPremiumGradient]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.ghostFullBleedGradient}
        >
          <SafeAreaView style={styles.ghostSafeArea} edges={['top', 'bottom']}>
            <View style={styles.ghostLogoTopSlot}>{renderGhostLinkBrandLogo()}</View>
            <View style={styles.ghostActiveBody}>
              {renderGhostAvatarGlowing(activeGhostCall?.peerPhotoUrl ?? null)}
              <Text style={styles.ghostActiveHeroNick}>@{activeGhostCall?.peerNickname || 'user'}</Text>
              <Text style={styles.ghostActiveStatusLine}>
                {activeGhostCall?.direction === 'incoming'
                  ? tr('En llamada', 'On call')
                  : tr('Llamando...', 'Calling...')}
              </Text>
              <View style={styles.ghostGoldIdentityPill}>
                <Text style={styles.ghostGoldIdentityPillText} numberOfLines={2}>
                  {activeGhostCall?.direction === 'incoming'
                    ? `${tr('Desde su tarjeta', 'From their card')}: ${activeGhostCall?.sourceCardName || tr('Tarjeta Social', 'Social Card')}`
                    : `${tr('Su Tarjeta', 'Your card')}: ${activeGhostCall?.sourceCardName || tr('Tarjeta Social', 'Social Card')}`}
                </Text>
              </View>
              {activeGhostCall?.direction === 'incoming' && activeGhostCall?.peerName ? (
                <Text style={styles.ghostActiveFullNameSub}>{activeGhostCall.peerName}</Text>
              ) : null}
              <View style={styles.ghostActiveControlRow}>
                <TouchableOpacity
                  style={[styles.ghostControlBtn, ghostCallMuted && styles.ghostControlBtnActive]}
                  onPress={() => setGhostCallMuted((prev) => !prev)}
                  activeOpacity={0.9}
                >
                  <MaterialCommunityIcons
                    name={ghostCallMuted ? 'microphone-off' : 'microphone'}
                    size={22}
                    color={shell.ghostLinkOnGradient}
                  />
                  <Text style={styles.ghostControlText}>{tr('Silencio', 'Mute')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ghostControlBtn, ghostCallSpeaker && styles.ghostControlBtnActive]}
                  onPress={() => setGhostCallSpeaker((prev) => !prev)}
                  activeOpacity={0.9}
                >
                  <MaterialCommunityIcons
                    name={ghostCallSpeaker ? 'volume-high' : 'volume-medium'}
                    size={22}
                    color={shell.ghostLinkOnGradient}
                  />
                  <Text style={styles.ghostControlText}>{tr('Altavoz', 'Speaker')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostControlBtn} activeOpacity={0.9}>
                  <MaterialCommunityIcons name="dialpad" size={22} color={shell.ghostLinkOnGradient} />
                  <Text style={styles.ghostControlText}>{tr('Teclado', 'Keypad')}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.ghostActiveFooterColumn}>
              <TouchableOpacity style={styles.ghostEndBtn} onPress={endActiveGhostCall} activeOpacity={0.9}>
                <Text style={styles.ghostEndBtnText}>{tr('Finalizar llamada', 'End call')}</Text>
              </TouchableOpacity>
              <Text style={styles.ghostActivePrivacy}>
                {tr('Tu número real está 100% oculto', 'Your real number stays 100% hidden')}
              </Text>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </Modal>

      <Modal
        visible={Boolean(incomingGhostCall) && !Boolean(activeGhostCall)}
        transparent
        animationType="fade"
        onRequestClose={rejectIncomingGhostCall}
      >
        <LinearGradient
          colors={[...shell.ghostLinkPremiumGradient]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.ghostFullBleedGradient}
        >
          <SafeAreaView style={styles.ghostSafeArea} edges={['top', 'bottom']}>
            <View style={styles.ghostLogoTopSlot}>{renderGhostLinkBrandLogo()}</View>
            <View style={styles.ghostIncomingScreenBody}>
              <View style={styles.ghostIncomingCardFrosted}>
                {renderGhostAvatarGlowing(incomingGhostCall?.callerPhotoUrl ?? null)}
                <Text style={styles.ghostIncomingNick}>@{incomingGhostCall?.callerNickname || 'user'}</Text>
                <Text style={styles.ghostIncomingTitle}>{tr('Llamada entrante…', 'Incoming call…')}</Text>
                <Text style={styles.ghostIncomingGoldLine} numberOfLines={2}>
                  {tr('Desde su tarjeta', 'From their card')}:{' '}
                  {incomingGhostCall?.sourceCardName || tr('Tarjeta Social', 'Social Card')}
                </Text>
                <Text style={styles.ghostIncomingFullNameLine}>
                  {tr('Nombre completo', 'Full name')}: {incomingGhostCall?.callerName || tr('Contacto', 'Contact')}
                </Text>
                <View style={styles.ghostIncomingActionsRow}>
                  <TouchableOpacity style={styles.ghostIncomingAcceptBtn} onPress={acceptIncomingGhostCall} activeOpacity={0.9}>
                    <Text style={styles.ghostIncomingAcceptText}>{tr('[ACEPTAR]', '[ACCEPT]')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ghostIncomingRejectBtn} onPress={rejectIncomingGhostCall} activeOpacity={0.9}>
                    <Text style={styles.ghostIncomingRejectText}>{tr('[RECHAZAR]', '[DECLINE]')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </Modal>
    </LinearGradient>

      <ReceptorScreenModal
        visible={receptorModalVisible}
        onClose={() => {
          setReceptorModalVisible(false);
          setReceptorContact(null);
          setReceptorSubscribers([]);
        }}
        owner={{
          displayName: receptorContact?.name || '',
          occupation: receptorContact?.ownerOccupation || receptorContact?.cardName || '',
          photoUrl: receptorContact?.photoUrl ?? null,
        }}
        subscribers={receptorSubscribers}
        totalCount={receptorContact?.holdersCount ?? receptorSubscribers.length}
        loading={receptorLoading}
        isDark={isNight}
        tr={tr}
        onBlockExternal={(targetUid, name) => {
          Alert.alert(
            tr('Bloquear usuario', 'Block user'),
            tr(
              `¿Bloquear a ${name}? No podrá agregarte a ninguna tarjeta ni contactarte.`,
              `Block ${name}? They won't be able to add you to any card or contact you.`,
            ),
            [
              { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
              {
                text: tr('Bloquear', 'Block'),
                style: 'destructive',
                onPress: async () => {
                  try {
                    const ownerUid = await getActiveUserId();
                    if (!ownerUid) return;
                    await blockRelationship({ ownerUid, targetUid });
                    setReceptorSubscribers((prev) => prev.filter((r) => r.uid !== targetUid));
                  } catch (e: any) {
                    Alert.alert(tr('Error', 'Error'), e?.message || tr('No se pudo bloquear.', 'Could not block.'));
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
