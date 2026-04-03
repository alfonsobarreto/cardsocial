import { SharedCardSkeletonList } from '@/components/SharedCardRowSkeleton';
import { ThemedSharedCardSurface } from '@/components/ThemedSharedCardSurface';
import ErrorBoundary from '@/components/ErrorBoundary';
import FlexGrid from '@/components/FlexGrid';
import { MEDIA_PLACEHOLDER } from '@/constants/mediaPlaceholders';
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
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
import { getCardRowTheme } from '@/services/useActiveTheme';
import { collectStringsReceivedContact, orderByDeepSearchWithExpandedQuery } from '@/services/deepSearch';
import { buildExpandedMarketQuery } from '@/services/marketSearchSynonyms';
import {
  blockRelationship,
  createCallLog,
  listReceivedContacts,
  removeRelationship,
  setSubscriberSelfCardMute,
} from '@/services/qrApi';
import { mergeReceivedContactRows } from '@/services/receivedContactsPresentationMerge';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  UIManager,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Swipeable } from 'react-native-gesture-handler';

const GHOST_PREMIUM_GRADIENT = ['#030814', '#0A1E38', '#0F2F58'] as const;

type Contact = {
  uid: string;
  cardId?: string | null;
  name: string;
  nickname: string;
  photoUrl: string | null;
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
const STORY_RING_NORMAL = '#2ECC71';
const STORY_RING_VIP = '#F0A43A';

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
  const contactsTheme = {
    cardBg: isNight ? 'rgba(12,40,70,0.88)' : 'rgba(255,255,255,0.82)',
    cardBorder: isNight ? 'rgba(212,175,55,0.18)' : 'rgba(13,77,138,0.18)',
    searchBg: isNight ? 'rgba(10,37,64,0.85)' : 'rgba(255,255,255,0.84)',
    searchBorder: isNight ? 'rgba(212,175,55,0.22)' : 'rgba(13,77,138,0.22)',
    searchText: isNight ? '#F0F4F8' : '#0A2540',
    searchPlaceholder: isNight ? '#87A9C2' : '#5C87A5',
    modalBg: isNight ? '#0D2E40' : '#F2FBFF',
    modalBorder: isNight ? 'rgba(212,175,55,0.22)' : '#B8E7FF',
    modalRowBg: isNight ? '#0F3554' : '#FFFFFF',
    modalRowBorder: isNight ? 'rgba(212,175,55,0.15)' : '#D0EEFF',
    textPrimary: isNight ? '#F0F4F8' : '#0D4D8A',
    textSecondary: isNight ? '#87C8E8' : '#2E668C',
    avatarFallbackBg: isNight ? '#0D2E40' : '#EAF7FF',
    avatarFallbackBorder: isNight ? 'rgba(212,175,55,0.22)' : '#B8E7FF',
    pillBg: isNight ? 'rgba(10,37,64,0.85)' : 'rgba(255,255,255,0.8)',
    pillBorder: isNight ? 'rgba(212,175,55,0.22)' : 'rgba(13,77,138,0.2)',
    pillText: isNight ? '#87C8E8' : '#0D4D8A',
    filterPillBg: isNight ? 'rgba(10,37,64,0.72)' : 'rgba(255,255,255,0.72)',
    utilBtnBg: isNight ? '#0D2E40' : '#FFFFFF',
    utilBtnBorder: isNight ? '#D4AF37' : '#B8E7FF',
    iconColor: isNight ? '#87C8E8' : '#0D4D8A',
  };
  const tr = (es: string, en: string) => language === 'en' ? en : es;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [metaMap, setMetaMap] = useState<Record<string, ContactMeta>>({});
  const [groupFavorites, setGroupFavorites] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [sortVisible, setSortVisible] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('groups');

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [floatingVisible, setFloatingVisible] = useState(false);
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  const [longPressVisible, setLongPressVisible] = useState(false);
  const [longPressContact, setLongPressContact] = useState<Contact | null>(null);

  const [groupPickerVisible, setGroupPickerVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const [activeGhostCall, setActiveGhostCall] = useState<ActiveGhostCallView | null>(null);
  const [incomingGhostCall, setIncomingGhostCall] = useState<IncomingGhostCallView | null>(null);
  const [ghostCallMuted, setGhostCallMuted] = useState(false);
  const [ghostCallSpeaker, setGhostCallSpeaker] = useState(false);
  const listEntrance = useRef(new Animated.Value(0)).current;
  const swipeableByContactUidRef = useRef<Map<string, { close: () => void }>>(new Map());
  const rowPressScaleRef = useRef<Map<string, Animated.Value>>(new Map());

  const pressScaleForContact = (uid: string) => {
    let v = rowPressScaleRef.current.get(uid);
    if (!v) {
      v = new Animated.Value(1);
      rowPressScaleRef.current.set(uid, v);
    }
    return v;
  };

  const animateContactRowPressIn = (uid: string) => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      /* haptics opcional */
    }
    Animated.spring(pressScaleForContact(uid), {
      toValue: 0.98,
      useNativeDriver: true,
      friction: 7,
      tension: 220,
    }).start();
  };

  const animateContactRowPressOut = (uid: string) => {
    Animated.spring(pressScaleForContact(uid), {
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

  const normalizeContactRow = (row: Contact): Contact => ({
    ...row,
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
  });

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
        if (!mergedMeta[row.uid]) {
          mergedMeta[row.uid] = {
            group: GROUP_DEFAULT,
            isFavorite: false,
            firstSeenAt: row.addedAt || nowIso,
            storyState: row.storyState || 'none',
          };
        } else if (!mergedMeta[row.uid].storyState) {
          mergedMeta[row.uid].storyState = row.storyState || 'none';
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

  useEffect(() => {
    if (!floatingVisible) {
      cardScale.setValue(0.92);
      cardOpacity.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        speed: 16,
        bounciness: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [floatingVisible, cardOpacity, cardScale]);

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
      const meta = metaMap[contact.uid] || {
        group: GROUP_DEFAULT,
        isFavorite: false,
        firstSeenAt: contact.addedAt || new Date().toISOString(),
      };
      return {
        ...contact,
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
      return sortedContacts.map((row) => ({ type: 'contact' as const, key: row.uid, contact: row }));
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
      result.push({ type: 'contact', key: row.uid, contact: row });
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

  const renderStars = (value: number) => {
    const rounded = Math.max(0, Math.min(5, Math.round(value)));
    return (
      <View style={styles.starsRow}>
        {Array.from({ length: 5 }).map((_, index) => (
          <MaterialCommunityIcons
            key={`rating-${index}`}
            name={index < rounded ? 'star' : 'star-outline'}
            size={14}
            color="#C5A065"
          />
        ))}
      </View>
    );
  };

  const renderDetailedRatingStars = (rating: number) => {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    return (
      <View style={styles.starsRow}>
        {Array.from({ length: 5 }).map((_, index) => {
          const threshold = index + 1;
          let name: 'star' | 'star-half-full' | 'star-outline' = 'star-outline';
          if (r >= threshold) name = 'star';
          else if (r >= threshold - 0.5) name = 'star-half-full';
          return (
            <MaterialCommunityIcons key={`dstar-${index}`} name={name} size={12} color="#C5A065" />
          );
        })}
      </View>
    );
  };

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
        source={require('../../assets/images/CS Icon Logo BG transparent.png')}
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
            <MaterialCommunityIcons name="account" size={40} color="#1A3A5C" />
          </View>
        )}
      </View>
    </View>
  );

  const updateContactMeta = async (uid: string, updater: (prev: ContactMeta) => ContactMeta) => {
    const base = metaMap[uid] || {
      group: GROUP_DEFAULT,
      isFavorite: false,
      firstSeenAt: new Date().toISOString(),
    };
    const next = {
      ...metaMap,
      [uid]: updater(base),
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

  const purgeContactFromUi = async (uid: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setContacts((prev) => {
      const next = prev.filter((row) => row.uid !== uid);
      void persistContactsCache(next);
      return next;
    });
    const nextMeta = { ...metaMap };
    delete nextMeta[uid];
    await persistMetaMap(nextMeta);
    if (selectedContact?.uid === uid) {
      setFloatingVisible(false);
      setSelectedContact(null);
    }
    setLongPressVisible(false);
    setLongPressContact(null);
    swipeableByContactUidRef.current.delete(uid);
  };

  const handleDeleteContact = async (uid: string) => {
    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        return;
      }
      await removeRelationship({ ownerUid, targetUid: uid });
      await purgeContactFromUi(uid);
      Toast.show({
        type: 'info',
        text1: tr('Contacto eliminado', 'Contact removed'),
        text2: tr('Puedes volver a agregarlo escaneando su QR.', 'You can add them again by scanning their QR.'),
        position: 'bottom',
        visibilityTime: 4000,
      });
    } catch (error: any) {
      Alert.alert(tr('No se pudo eliminar', 'Could not delete'), error?.message || tr('Intenta de nuevo.', 'Try again.'));
    }
  };

  const promptDeleteContact = (uid: string) => {
    Alert.alert(
      tr('Eliminar contacto', 'Delete contact'),
      tr(
        'Quitar a esta persona de tu lista de contactos. Podrás volver a agregarla con un QR.',
        'Remove this person from your contacts. You can add them again with a QR code.',
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        {
          text: tr('Eliminar', 'Delete'),
          style: 'destructive',
          onPress: () => {
            void handleDeleteContact(uid);
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
      await purgeContactFromUi(uid);
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
      setContacts((prev) => {
        const next = prev.map((row) => (row.uid === contact.uid ? { ...row, channelMuted: nextMuted } : row));
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

  const closeFloatingCard = () => {
    Keyboard.dismiss();
    Animated.timing(cardOpacity, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setFloatingVisible(false);
      setSelectedContact(null);
    });
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
    <LinearGradient colors={isNight ? ['#071A32', '#0A2540', '#0F2C50'] : ['#EAF7FF', '#CDEFFF', '#B8E7FF']} style={styles.container}>
      {/* Header with title and Sort button */}
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>{tr('Mis Contactos', 'My Contacts')}</Text>
        <TouchableOpacity
          style={[styles.sortBtn, { backgroundColor: contactsTheme.utilBtnBg, borderColor: contactsTheme.utilBtnBorder }]} onPress={() => setSortVisible(true)} activeOpacity={0.86}>
          <Text style={[styles.sortBtnText, { color: contactsTheme.textPrimary }]}>Sort</Text>
        </TouchableOpacity>
      </View>

      {/* Active sort pill */}
      <View style={styles.activeSortPillWrap}>
        <Text style={[styles.activeSortPill, { color: contactsTheme.textPrimary, backgroundColor: contactsTheme.filterPillBg }]}>Filtro activo: {sortMode === 'name' ? 'Nombre' : sortMode === 'card' ? 'Nombre Tarjeta' : sortMode === 'date' ? 'Fecha' : 'Grupos'}</Text>
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
          {loading && contacts.length === 0 ? (
            <View style={styles.skeletonListWrap}>
              <SharedCardSkeletonList count={6} isDark={isNight} avatarSize={81} />
            </View>
          ) : rowsWithHeaders.length === 0 ? (
            <Pressable onPress={Keyboard.dismiss} style={styles.emptyListRoot}>
              <MaterialCommunityIcons name="magnify" size={64} color={contactsTheme.searchPlaceholder} />
              {contacts.length === 0 && !searchValue.trim() ? (
                <>
                  <Text style={[styles.emptyListTitle, { color: contactsTheme.textPrimary }]}>
                    {tr('Sin contactos aún', 'No contacts yet')}
                  </Text>
                  <Text style={[styles.emptyListSubtitle, { color: contactsTheme.textSecondary }]}>
                    {tr(
                      'Escanea un QR o acepta invitaciones para ver contactos aquí.',
                      'Scan a QR or accept invites to see contacts here.',
                    )}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.emptyListTitle, { color: contactsTheme.textPrimary }]}>
                    {tr('Sin coincidencias', 'No matches')}
                  </Text>
                  <Text style={[styles.emptyListSubtitle, { color: contactsTheme.textSecondary }]}>
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
                      <Text style={[styles.groupHeaderText, { color: contactsTheme.textPrimary }]}>{item.title}</Text>
                    </View>
                  );
                }
                const row = item.contact;
                const reviewCount = row.totalRatings ?? 0;
                const rating = reviewCount > 0 ? Number(row.ratingAvg ?? 0) : 0;
                const isAlert = reviewCount > 0 && Number(row.ratingAvg || 0) <= RATING_ALERT;
                const mutual = row.mutualContactsCount ?? 0;
                const chest = getCardRowTheme(row.themeId);
                const issuerFont = row.fontFamily ? { fontFamily: row.fontFamily } : null;
                const closeRowSwipe = () => {
                  swipeableByContactUidRef.current.get(row.uid)?.close();
                };
                return (
                  <Swipeable
                    containerStyle={styles.contactSwipeRow}
                    ref={(el) => {
                      if (el) {
                        swipeableByContactUidRef.current.set(row.uid, { close: () => el.close() });
                      } else {
                        swipeableByContactUidRef.current.delete(row.uid);
                      }
                    }}
                    overshootRight={false}
                    renderRightActions={() => (
                        <View style={styles.swipeActionsRow}>
                          <TouchableOpacity
                            style={[styles.swipeActionCol, styles.swipeActionDelete]}
                            onPress={() => {
                              closeRowSwipe();
                              promptDeleteContact(row.uid);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={tr('Eliminar contacto', 'Delete contact')}
                            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                          >
                            <MaterialCommunityIcons name="trash-can-outline" size={22} color="#FFFFFF" />
                            <Text style={styles.swipeActionLabel}>{tr('Eliminar', 'Delete')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.swipeActionCol, styles.swipeActionMute]}
                            onPress={() => {
                              closeRowSwipe();
                              void handleToggleChannelMute(row);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={
                              row.channelMuted ? tr('Dejar de silenciar tarjeta', 'Unmute card channel') : tr('Silenciar tarjeta', 'Mute card channel')
                            }
                            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                          >
                            <MaterialCommunityIcons name={row.channelMuted ? 'volume-high' : 'volume-off'} size={22} color="#FFFFFF" />
                            <Text style={styles.swipeActionLabel}>{tr('Silenciar', 'Mute')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.swipeActionCol, styles.swipeActionBlock]}
                            onPress={() => {
                              closeRowSwipe();
                              promptBlockContact(row.uid);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={tr('Bloquear contacto', 'Block contact')}
                            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                          >
                            <MaterialCommunityIcons name="block-helper" size={22} color="#FFFFFF" />
                            <Text style={styles.swipeActionLabel}>{tr('Bloquear', 'Block')}</Text>
                          </TouchableOpacity>
                        </View>
                    )}
                  >
                    <Animated.View style={{ transform: [{ scale: pressScaleForContact(row.uid) }] }}>
                    <ThemedSharedCardSurface
                      themeId={row.themeId}
                      wallpaperUrl={row.wallpaperUrl || undefined}
                      borderRadius={15}
                      style={[styles.contactThemedSurface, row.channelMuted ? styles.contactCardMuted : null]}
                    >
                      <Pressable
                        style={styles.contactCardInnerThemed}
                        onPress={() => void openFloatingCard(row)}
                        onLongPress={() => onLongPressRow(row)}
                        delayLongPress={400}
                        onPressIn={() => animateContactRowPressIn(row.uid)}
                        onPressOut={() => animateContactRowPressOut(row.uid)}
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
                              ? styles.avatarRingVip
                              : row.storyState === 'normal' || row.meta?.storyState === 'normal'
                                ? styles.avatarRingNormal
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
                                  backgroundColor: isNight ? MEDIA_PLACEHOLDER.personBgDark : MEDIA_PLACEHOLDER.personBgLight,
                                  borderColor: isNight ? MEDIA_PLACEHOLDER.personBorderDark : MEDIA_PLACEHOLDER.personBorderLight,
                                },
                              ]}
                            >
                              <Text
                                style={[styles.avatarInitials, { color: isNight ? MEDIA_PLACEHOLDER.personIconDark : MEDIA_PLACEHOLDER.personIconLight }]}
                                numberOfLines={1}
                              >
                                {initialsFromDisplayName(row.name)}
                              </Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.contactCardBody}>
                          <Text style={[styles.contactTitleName, { color: chest.titleColor }, issuerFont]} numberOfLines={2}>
                            {row.name}
                          </Text>
                          <Text style={[styles.contactSubtitleCardName, { color: chest.metaColor }, issuerFont]} numberOfLines={1}>
                            {row.cardName}
                          </Text>
                          <View style={styles.contactRowStatsRow}>
                            <View style={styles.contactRowRatingCluster}>
                              {renderDetailedRatingStars(rating)}
                              <Text
                                style={[
                                  styles.contactRatingCaption,
                                  isAlert && styles.ratingNumberAlert,
                                  { color: chest.metaColor },
                                ]}
                              >
                                {rating.toFixed(1)} · {reviewCount} {tr('reseñas', 'reviews')}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.mutualCountPill,
                                { backgroundColor: 'rgba(255,255,255,0.72)', borderColor: chest.borderColor },
                              ]}
                            >
                              <MaterialCommunityIcons name="account-multiple-outline" size={11} color={chest.titleColor} />
                              <Text style={[styles.mutualCountPillText, { color: chest.titleColor }]}>{mutual}</Text>
                            </View>
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
        </Animated.View>

        {/* Floating Scan Button */}
        <View style={styles.floatingScanButtonContainer} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.floatingScanButton}
            onPress={() => router.push('/scan' as any)}
            activeOpacity={0.82}
          >
            <MaterialCommunityIcons name="qrcode-scan" size={28} color="#0A1A2F" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar fixed at bottom above navbar */}
      <View style={styles.bottomToolbar}>
        <View style={[styles.searchWrap, { backgroundColor: contactsTheme.searchBg, borderColor: contactsTheme.searchBorder }]}> 
          <MaterialCommunityIcons name="magnify" size={17} color={contactsTheme.iconColor} />
          <TextInput
            style={[styles.searchInput, { color: contactsTheme.searchText }]}
            placeholder={tr(
              'Buscar nombre, tarjeta, grupo o datos compartidos (no teléfonos)',
              'Search name, card, group, or shared data (not phone numbers)'
            )}
            placeholderTextColor={contactsTheme.searchPlaceholder}
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
              <MaterialCommunityIcons name="close-circle" size={18} color={contactsTheme.searchPlaceholder} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <Modal visible={sortVisible} transparent animationType="slide" onRequestClose={() => setSortVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSortVisible(false)}>
          <Pressable style={[styles.sortModalCard, { backgroundColor: contactsTheme.modalBg, borderColor: contactsTheme.modalBorder }]}>
            <Text style={[styles.sortModalTitle, { color: contactsTheme.textPrimary }]}>Ordenar contactos</Text>
            {[
              { key: 'name', label: tr('Nombre (A-Z, favoritos arriba)', 'Name (A-Z, favorites first)') },
              { key: 'card', label: tr('Nombre de Tarjeta', 'Card Name') },
              { key: 'date', label: tr('Fecha de agregado', 'Date Added') },
              { key: 'groups', label: tr('Grupos', 'Groups') }].map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[styles.sortOptionRow, sortMode === option.key && styles.sortOptionRowActive, { backgroundColor: contactsTheme.modalRowBg, borderColor: contactsTheme.modalRowBorder }]}
                onPress={() => {
                  setSortMode(option.key as SortMode);
                  setSortVisible(false);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.sortOptionText, sortMode === option.key && styles.sortOptionTextActive, { color: contactsTheme.textSecondary }]}>{option.label}</Text>
                {sortMode === option.key ? <MaterialCommunityIcons name="check-circle" size={17} color={contactsTheme.iconColor} /> : null}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={longPressVisible} transparent animationType="fade" onRequestClose={() => setLongPressVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setLongPressVisible(false)}>
          <Pressable onPress={() => {}} style={[styles.actionModalCard, { backgroundColor: contactsTheme.modalBg, borderColor: contactsTheme.modalBorder }]}>
            <Text style={[styles.actionModalTitle, { color: contactsTheme.textPrimary }]}>{longPressContact?.name || tr('Contacto', 'Contact')}</Text>
            <TouchableOpacity
              style={[styles.actionRow, { backgroundColor: contactsTheme.modalRowBg, borderColor: contactsTheme.modalRowBorder }]}
              activeOpacity={0.85}
              onPress={() => {
                const uid = longPressContact?.uid;
                if (!uid) {
                  return;
                }
                void updateContactMeta(uid, (prev) => ({
                  ...prev,
                  isFavorite: !prev.isFavorite,
                }));
                setLongPressVisible(false);
                setLongPressContact(null);
              }}
            >
              <MaterialCommunityIcons
                name={
                  longPressContact?.uid && metaMap[longPressContact.uid]?.isFavorite ? 'star' : 'star-outline'
                }
                size={18}
                color={contactsTheme.iconColor}
              />
              <Text style={[styles.actionText, { color: contactsTheme.textSecondary }]}>
                {tr('Favorito / quitar favorito', 'Favorite / unfavorite')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionRow, { backgroundColor: contactsTheme.modalRowBg, borderColor: contactsTheme.modalRowBorder }]}
              activeOpacity={0.85}
              onPress={() => {
                setLongPressVisible(false);
                setGroupPickerVisible(true);
              }}
            >
              <MaterialCommunityIcons name="folder-move-outline" size={18} color={contactsTheme.iconColor} />
              <Text style={[styles.actionText, { color: contactsTheme.textSecondary }]}>
                {tr('Mover a grupo', 'Move to group')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionRow, { backgroundColor: contactsTheme.modalRowBg, borderColor: contactsTheme.modalRowBorder }]}
              activeOpacity={0.85}
              onPress={() => {
                const uid = longPressContact?.uid;
                if (!uid) {
                  return;
                }
                setLongPressVisible(false);
                setLongPressContact(null);
                promptDeleteContact(uid);
              }}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={contactsTheme.iconColor} />
              <Text style={[styles.actionText, { color: contactsTheme.textSecondary }]}>{tr('Eliminar', 'Delete')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionRowDanger}
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
              <MaterialCommunityIcons name="cancel" size={18} color="#FFFFFF" />
              <Text style={styles.actionTextDanger}>{tr('Bloquear', 'Block')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={groupPickerVisible} transparent animationType="fade" onRequestClose={() => setGroupPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.groupPickerCard, { backgroundColor: contactsTheme.modalBg, borderColor: contactsTheme.modalBorder }]}>
            <Text style={[styles.sortModalTitle, { color: contactsTheme.textPrimary }]}>Selecciona Grupo</Text>
            {allGroups.map((groupName) => (
              <View key={groupName} style={styles.groupRowWrap}>
                <TouchableOpacity
                  style={[styles.sortOptionRow, styles.groupSelectRow, { backgroundColor: contactsTheme.modalRowBg, borderColor: contactsTheme.modalRowBorder }]}
                  onPress={() => {
                    const uid = longPressContact?.uid;
                    if (!uid) {
                      return;
                    }
                    updateContactMeta(uid, (prev) => ({
                      ...prev,
                      group: groupName,
                    }));
                    setGroupPickerVisible(false);
                  }}
                >                  <Text style={[styles.sortOptionText, { color: contactsTheme.textSecondary }]}>{groupName}</Text>
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
                    color={Boolean(groupFavorites[groupName]) ? '#C5A065' : '#0D4D8A'}
                  />
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.newGroupWrap}>
              <TextInput
                style={[styles.newGroupInput, { backgroundColor: contactsTheme.modalRowBg, borderColor: contactsTheme.modalRowBorder, color: contactsTheme.searchText }]}
                placeholder="Crear nuevo grupo"
                placeholderTextColor={contactsTheme.searchPlaceholder}
                value={newGroupName}
                onChangeText={setNewGroupName}
              />
              <TouchableOpacity
                style={styles.newGroupBtn}
                onPress={() => {
                  const name = String(newGroupName || '').trim();
                  const uid = longPressContact?.uid;
                  if (!uid || !name) {
                    return;
                  }
                  updateContactMeta(uid, (prev) => ({
                    ...prev,
                    group: name,
                  }));
                  setNewGroupName('');
                  setGroupPickerVisible(false);
                }}
              >
                <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={floatingVisible} transparent animationType="none" onRequestClose={closeFloatingCard}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={70} tint={isNight ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <Animated.View
            style={[
              styles.floatingCard,
              { backgroundColor: contactsTheme.modalBg, borderColor: contactsTheme.modalBorder },
              {
                opacity: cardOpacity,
                transform: [{ scale: cardScale }],
              },
            ]}
          >
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: contactsTheme.modalRowBg }]} onPress={closeFloatingCard} accessibilityLabel={tr('Cerrar', 'Close')}>
              <MaterialCommunityIcons name="close" size={20} color={contactsTheme.iconColor} />
            </TouchableOpacity>

            {selectedContact?.photoUrl ? (
              <ExpoImage source={{ uri: selectedContact.photoUrl }} style={styles.modalAvatar} cachePolicy="disk" />
            ) : (
              <View
                style={[
                  styles.modalAvatarFallback,
                  {
                    backgroundColor: isNight ? MEDIA_PLACEHOLDER.personBgDark : MEDIA_PLACEHOLDER.personBgLight,
                    borderColor: isNight ? MEDIA_PLACEHOLDER.personBorderDark : MEDIA_PLACEHOLDER.personBorderLight,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={MEDIA_PLACEHOLDER.personIconName}
                  size={22}
                  color={isNight ? MEDIA_PLACEHOLDER.personIconDark : MEDIA_PLACEHOLDER.personIconLight}
                />
              </View>
            )}
            <Text style={[styles.modalName, { color: contactsTheme.textPrimary }]}>{selectedContact?.name || ''}</Text>
            <Text style={[styles.modalNick, { color: contactsTheme.textSecondary }]}>@{selectedContact?.nickname || ''}</Text>
            <Text style={[styles.modalCardName, { color: contactsTheme.textSecondary }]}>{selectedContact?.cardName || ''}</Text>

            <View style={styles.modalStatsRow}>
              {renderStars(Number(selectedContact?.ratingAvg || 0))}
              <Text style={[styles.modalRatingNumber, { color: contactsTheme.textPrimary }]}>{Number(selectedContact?.ratingAvg || 0).toFixed(1)}</Text>
              <Text style={[styles.modalHoldersText, { color: contactsTheme.textSecondary }]}>
                {selectedContact?.holdersCount ?? 0} {tr('poseedores', 'holders')}
              </Text>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(activeGhostCall)}
        transparent
        animationType="fade"
        onRequestClose={endActiveGhostCall}
      >
        <LinearGradient
          colors={[...GHOST_PREMIUM_GRADIENT]}
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
                    color="#FFFFFF"
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
                    color="#FFFFFF"
                  />
                  <Text style={styles.ghostControlText}>{tr('Altavoz', 'Speaker')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostControlBtn} activeOpacity={0.9}>
                  <MaterialCommunityIcons name="dialpad" size={22} color="#FFFFFF" />
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
          colors={[...GHOST_PREMIUM_GRADIENT]}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    paddingTop: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#0D4D8A',
    fontSize: 23,
    fontFamily: 'Georgia',
    fontWeight: '800',
    letterSpacing: 0.25,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#54C1FB',
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 40,
  },
  scanBtnText: {
    color: '#0A1A2F',
    fontSize: 12,
    fontWeight: '700',
  },
  toolbarRow: {
    marginTop: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.22)',
    backgroundColor: 'rgba(255,255,255,0.84)',
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: '#0A2540',
    fontSize: 13.5,
  },
  sortBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#FFFFFF',
    height: 44,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#0D4D8A',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sortBtnText: {
    color: '#0D4D8A',
    fontWeight: '700',
    fontSize: 12.5,
  },
  activeSortPillWrap: {
    paddingHorizontal: 16,
    marginTop: 9,
  },
  activeSortPill: {
    alignSelf: 'flex-start',
    color: '#0A2540',
    fontSize: 11.5,
    fontWeight: '700',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.72)',
    paddingHorizontal: 11,
    paddingVertical: 6.5,
  },
  listAnimatedWrap: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  contactSwipeRow: {
    width: '100%',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonListWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  emptyListRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  emptyListTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyListSubtitle: {
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },
  emptyText: {
    color: '#2A668F',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 13,
  },
  groupHeaderWrap: {
    width: '100%',
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginTop: 9,
  },
  groupHeaderText: {
    color: '#0D4D8A',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  contactThemedSurface: {
    width: '100%',
    marginBottom: 8,
    shadowColor: '#0D4D8A',
    shadowOpacity: 0.09,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  contactCardInnerThemed: {
    position: 'relative',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 101,
  },
  contactCardMuted: {
    opacity: 0.92,
  },
  channelMutedBadge: {
    position: 'absolute',
    top: 8,
    right: 10,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  channelMutedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  contactCardBody: {
    flex: 1,
    minWidth: 0,
  },
  contactTitleName: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 19,
  },
  contactSubtitleCardName: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
  },
  /** Fila 3: valoración (izq.) + pastilla mutuales (der.), misma línea que el mock. */
  contactRowStatsRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 6,
  },
  contactRowRatingCluster: {
    alignItems: 'flex-start',
    flexShrink: 1,
    minWidth: 0,
  },
  contactRatingCaption: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
  },
  mutualCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  mutualCountPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarLg: {
    width: 73,
    height: 73,
    borderRadius: 36.5,
  },
  avatarRingLg: {
    width: 81,
    height: 81,
    borderRadius: 40.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackLg: {
    width: 73,
    height: 73,
    borderRadius: 36.5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  avatarRing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRingNone: {
    borderWidth: 0,
    borderColor: 'transparent',
  },
  avatarRingNormal: {
    borderWidth: 2.4,
    borderColor: STORY_RING_NORMAL,
    backgroundColor: 'rgba(46, 204, 113, 0.08)',
  },
  avatarRingVip: {
    borderWidth: 2.4,
    borderColor: STORY_RING_VIP,
    backgroundColor: 'rgba(240, 164, 58, 0.1)',
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#EAF7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactName: {
    color: '#0D4D8A',
    fontSize: 13.5,
    fontWeight: '800',
    maxWidth: '52%',
  },
  contactNick: {
    color: '#5A87A6',
    fontSize: 10.5,
    fontWeight: '700',
    maxWidth: '42%',
  },
  cardNameText: {
    marginTop: 2,
    color: '#2F648A',
    fontSize: 11.5,
    fontWeight: '600',
  },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  ratingNumber: {
    color: '#0D4D8A',
    fontSize: 11,
    fontWeight: '800',
  },
  ratingNumberAlert: {
    color: '#B7343A',
  },
  holdersPill: {
    marginLeft: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.2)',
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  holdersPillText: {
    color: '#0D4D8A',
    fontSize: 10,
    fontWeight: '700',
  },
  rowTrashBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E66A3',
    shadowColor: '#1E66A3',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7,33,54,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  sortModalCard: {
    width: '92%',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#F2FBFF',
    padding: 14,
  },
  sortModalTitle: {
    color: '#0D4D8A',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 9,
  },
  sortOptionRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D0EEFF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sortOptionRowActive: {
    borderColor: '#0D4D8A',
    backgroundColor: '#EAF7FF',
  },
  sortOptionText: {
    color: '#2E668C',
    fontSize: 13,
    fontWeight: '700',
  },
  sortOptionTextActive: {
    color: '#0D4D8A',
  },
  actionModalCard: {
    width: '90%',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#F2FBFF',
    padding: 14,
  },
  actionModalTitle: {
    color: '#0D4D8A',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 10,
  },
  actionRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D0EEFF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionText: {
    color: '#2E668C',
    fontSize: 13,
    fontWeight: '700',
  },
  actionRowDanger: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A31E2A',
    backgroundColor: '#B7343A',
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionTextDanger: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  groupPickerCard: {
    width: '90%',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#F2FBFF',
    padding: 14,
  },
  groupRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  groupSelectRow: {
    flex: 1,
    marginBottom: 0,
  },
  groupFavBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D0EEFF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupFavBtnActive: {
    borderColor: '#C5A065',
    backgroundColor: 'rgba(197,160,101,0.14)',
  },
  newGroupWrap: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newGroupInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CFEFFF',
    backgroundColor: '#FFFFFF',
    color: '#0A2540',
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
  },
  newGroupBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0D4D8A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCard: {
    width: '90%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: 'rgba(242,251,255,0.94)',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  modalAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  modalAvatarFallback: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#EAF7FF',
  },
  modalName: {
    marginTop: 10,
    color: '#0D4D8A',
    fontSize: 19,
    fontWeight: '800',
  },
  modalNick: {
    marginTop: 3,
    color: '#4E7E9F',
    fontSize: 12,
  },
  modalCardName: {
    marginTop: 4,
    color: '#2F648A',
    fontSize: 13,
    fontWeight: '700',
  },
  modalStatsRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  modalRatingNumber: {
    color: '#0D4D8A',
    fontSize: 12,
    fontWeight: '800',
  },
  modalHoldersText: {
    color: '#2E668C',
    fontSize: 11,
    fontWeight: '700',
  },
  actionIconRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.2)',
    backgroundColor: '#FFFFFF',
  },
  actionPickerCard: {
    width: '85%',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#F2FBFF',
    padding: 14,
  },
  cancelPickerBtn: {
    marginTop: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D0EEFF',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelPickerBtnText: {
    color: '#0D4D8A',
    fontWeight: '700',
    fontSize: 13,
  },
  ghostConfirmCard: {
    width: '88%',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#F2FBFF',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  ghostAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  ghostAvatarFallback: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#EAF7FF',
  },
  ghostConfirmName: {
    marginTop: 10,
    color: '#0D4D8A',
    fontSize: 18,
    fontWeight: '800',
  },
  ghostConfirmNick: {
    marginTop: 2,
    color: '#4E7E9F',
    fontSize: 12,
  },
  ghostConfirmCardName: {
    marginTop: 3,
    color: '#2F648A',
    fontSize: 12,
    fontWeight: '700',
  },
  ghostPrivacyText: {
    marginTop: 12,
    color: '#0A2540',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
  },
  ghostActionsRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ghostCallBtn: {
    minWidth: 120,
    borderRadius: 10,
    backgroundColor: '#0D4D8A',
    paddingHorizontal: 18,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostCallBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  ghostCancelBtn: {
    minWidth: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDFF4',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostCancelBtnText: {
    color: '#0D4D8A',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  ghostFullBleedGradient: {
    flex: 1,
    width: '100%',
  },
  ghostSafeArea: {
    flex: 1,
    width: '100%',
  },
  ghostLogoTopSlot: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 4,
  },
  ghostBrandLogoWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  ghostBrandLogoImage: {
    width: 52,
    height: 52,
  },
  ghostAvatarGlowOuter: {
    marginTop: 4,
    padding: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(248, 220, 150, 0.95)',
    ...Platform.select({
      ios: {
        shadowColor: '#C5A065',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.85,
        shadowRadius: 18,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  ghostAvatarGlowInner: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 3,
    borderColor: '#C5A065',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(8, 18, 40, 0.45)',
  },
  ghostAvatarImage: {
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  ghostAvatarImageFallback: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#EAF4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostActiveBody: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  ghostActiveHeroNick: {
    marginTop: 18,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  ghostActiveStatusLine: {
    marginTop: 8,
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  ghostGoldIdentityPill: {
    marginTop: 14,
    maxWidth: '92%',
    backgroundColor: '#C5A065',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(255, 248, 220, 0.55)',
  },
  ghostGoldIdentityPillText: {
    color: '#0A2540',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  ghostActiveFullNameSub: {
    marginTop: 10,
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  ghostActiveFooterColumn: {
    width: '100%',
    paddingHorizontal: 24,
    paddingBottom: 10,
    alignItems: 'center',
  },
  ghostActivePrivacy: {
    marginTop: 12,
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 12,
  },
  ghostActiveControlRow: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 360,
    gap: 10,
  },
  ghostControlBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 5,
  },
  ghostControlBtnActive: {
    backgroundColor: 'rgba(197, 160, 101, 0.28)',
    borderColor: 'rgba(248, 220, 150, 0.75)',
  },
  ghostControlText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 10,
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  ghostEndBtn: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 400,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: '#FF2638',
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#FF2638',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  ghostEndBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  ghostIncomingScreenBody: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  ghostIncomingCardFrosted: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(197, 160, 101, 0.42)',
    backgroundColor: 'rgba(236, 242, 250, 0.94)',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 22,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  ghostIncomingNick: {
    marginTop: 14,
    color: '#0A2540',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  ghostIncomingTitle: {
    marginTop: 8,
    color: '#0A2540',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  ghostIncomingGoldLine: {
    marginTop: 12,
    color: '#9A6B1A',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  ghostIncomingFullNameLine: {
    marginTop: 10,
    color: '#0A2540',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  ghostIncomingActionsRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  ghostIncomingAcceptBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#00C86F',
    paddingVertical: 13,
    alignItems: 'center',
  },
  ghostIncomingAcceptText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  ghostIncomingRejectBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#1A2332',
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.2)',
  },
  ghostIncomingRejectText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  floatingScanButtonContainer: {
    position: 'absolute',
    bottom: 16,
    right: 20,
    zIndex: 10,
  },
  floatingScanButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#54C1FB',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  swipeActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  swipeActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 10,
    minHeight: 118,
    borderRadius: 15,
    overflow: 'hidden',
  },
  swipeActionCol: {
    width: 78,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 6,
  },
  swipeActionDelete: {
    backgroundColor: '#B7343A',
  },
  swipeActionMute: {
    backgroundColor: '#5A6B7C',
  },
  swipeActionBlock: {
    backgroundColor: '#0A2540',
  },
  swipeActionLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  swipeActionButton: {
    width: 64,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    marginLeft: 4,
  },
  bottomToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#eee',
  },
});
