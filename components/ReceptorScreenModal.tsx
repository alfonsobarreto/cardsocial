/**
 * ReceptorScreenModal — Premium full-screen modal showing who has saved a card.
 *
 * Reusable across cards.tsx, contacts.tsx, and search.tsx.
 * Adapts to dark/light mode and ES/EN via the `tr` prop.
 */

import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import { listScrollInteractionProps, SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { useCoreT } from '@/services/coreI18n';
import { intlLocaleTagForAppLanguage, useLanguage, type AppLanguage } from '@/services/language';
import type { CardSubscriberRow } from '@/services/qrApi';
import { resolveVaultMediaUrlForApp } from '@/services/resolveVaultMediaUrl';
import { fetchUserProfilePhotoUrl } from '@/services/userProfilePhoto';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

/* ─── Types ───────────────────────────────────────────────────────── */

export type ReceptorOwnerInfo = {
  displayName: string;
  occupation: string;
  /** Foto de persona (Mongo / perfil); no es logo de negocio. */
  userAvatarUrl: string | null;
  /** Logo de marca (tarjeta business); no sustituye a `userAvatarUrl` para persona. */
  brandLogoUrl?: string | null;
};

export type ReceptorScreenModalProps = {
  visible: boolean;
  onClose: () => void;
  owner: ReceptorOwnerInfo;
  subscribers: CardSubscriberRow[];
  totalCount: number;
  loading: boolean;
  isDark: boolean;
  /** @deprecated Usa useCoreT; prop ignorada. */
  tr?: (es: string, en: string) => string;
  /** Owner context: actions on own card's subscribers */
  onRevoke?: (targetUid: string, name: string) => void;
  onMute?: (targetUid: string, currentlyMuted: boolean, name: string) => void;
  onBlock?: (targetUid: string, name: string) => void;
  /** Viewer context: block a user seen in someone else's card */
  onBlockExternal?: (targetUid: string, name: string) => void;
};

type SortMode = 'date' | 'alpha';

/* ─── Helpers ─────────────────────────────────────────────────────── */

const { width: SCREEN_W } = Dimensions.get('window');
const AVATAR_SIZE = 56;
const CAROUSEL_AVATAR_SIZE = 52;

function relativeTimeLabel(
  isoDate: string | null | undefined,
  lang: AppLanguage,
  t: (key: import('@/services/coreI18n').CoreLocaleKey, vars?: Record<string, string | number>) => string,
): string {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays <= 0) return t('core_rel_today');
  if (diffDays === 1) return t('core_rel_yesterday');
  if (diffDays < 7) return t('core_rel_days', { count: diffDays });

  return d.toLocaleDateString(intlLocaleTagForAppLanguage(lang), { day: 'numeric', month: 'short' });
}

/** Foto de perfil: URL del API; si viene vacía, `users/{uid}` en Firestore. Sin iniciales. */
function SubscriberResolvedAvatar({
  uid,
  userAvatarUrl,
  variant,
  borderColor,
  surfaceBg,
  iconMuted,
}: {
  uid: string;
  userAvatarUrl: string | null;
  variant: 'list' | 'carousel';
  borderColor: string;
  surfaceBg: string;
  iconMuted: string;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [loadingFs, setLoadingFs] = useState(false);

  useEffect(() => {
    const raw = String(userAvatarUrl ?? '').trim();
    const fromApi = raw ? resolveVaultMediaUrlForApp(raw) ?? raw : null;
    setUri(fromApi);
    const id = String(uid || '').trim();
    if (!id || fromApi) {
      setLoadingFs(false);
      return;
    }
    setLoadingFs(true);
    let cancelled = false;
    void (async () => {
      const url = await fetchUserProfilePhotoUrl(id);
      if (cancelled) return;
      if (url) {
        setUri(resolveVaultMediaUrlForApp(url) ?? url);
      }
      setLoadingFs(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, userAvatarUrl]);

  const iconSize = variant === 'list' ? 28 : 24;

  if (uri) {
    return (
      <ExpoImage
        source={{ uri }}
        style={
          variant === 'list'
            ? [s.listAvatar, { borderColor }]
            : [s.carouselAvatar, { borderColor }]
        }
        cachePolicy="memory-disk"
        key={`${uid}-${uri}`}
      />
    );
  }

  return (
    <View
      style={
        variant === 'list'
          ? [s.listAvatarFallback, { borderColor, backgroundColor: surfaceBg }]
          : [s.carouselAvatarFallback, { borderColor, backgroundColor: surfaceBg }]
      }
    >
      {loadingFs ? (
        <ActivityIndicator size="small" color={iconMuted} />
      ) : (
        <MaterialCommunityIcons name="account" size={iconSize} color={iconMuted} />
      )}
    </View>
  );
}

/** Título: nombre completo canónico desde la API. */
function subscriberTitle(item: CardSubscriberRow): string {
  return (item.userFullName || item.name || '').trim();
}

/**
 * Subtítulo: `@userNickName`. Sin handle: ocupación si difiere del título (evita duplicar la tarjeta en ambas líneas).
 */
function subscriberSubtitleLine(item: CardSubscriberRow, primary: string): string {
  const u = String(item.userNickName || '')
    .replace(/^@+/g, '')
    .trim();
  if (u) {
    const at = `@${u}`;
    const pNorm = primary.replace(/^@+/g, '').trim().toLowerCase();
    if (pNorm === u.toLowerCase()) return '';
    return at;
  }
  const occ = String(item.ownerOccupation || '').trim();
  if (occ && occ.toLowerCase() !== primary.trim().toLowerCase()) return occ;
  return '';
}

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/* ─── Colors ──────────────────────────────────────────────────────── */

function getColors(isDark: boolean) {
  const gold = '#E9C349';
  const goldSoft = isDark ? 'rgba(233,195,73,0.22)' : 'rgba(233,195,73,0.14)';
  const goldBorder = isDark ? 'rgba(233,195,73,0.45)' : 'rgba(233,195,73,0.55)';
  return {
    bg: isDark ? '#000000' : '#FFFFFF',
    surface: isDark ? '#1C1C1E' : '#F2F2F7',
    surfaceElevated: isDark ? '#2C2C2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1C1C1E',
    textSecondary: isDark ? '#8E8E93' : '#636366',
    muted: isDark ? '#48484A' : '#8E8E93',
    border: isDark ? '#3A3A3C' : '#C6C6C8',
    gold,
    goldSoft,
    goldBorder,
    closeBg: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,28,30,0.06)',
    closeIcon: isDark ? '#FFFFFF' : '#1C1C1E',
    statCardBg: isDark ? '#1C1C1E' : '#FFFFFF',
    statCardBorder: goldBorder,
    rowBg: isDark ? '#1C1C1E' : '#FFFFFF',
    rowBorder: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,28,30,0.06)',
    timePillBg: isDark ? 'rgba(233,195,73,0.18)' : 'rgba(233,195,73,0.12)',
    timePillText: isDark ? '#E9C349' : '#8B7340',
    filterBg: isDark ? 'rgba(233,195,73,0.15)' : 'rgba(233,195,73,0.10)',
    filterBorder: goldBorder,
    filterText: isDark ? gold : '#8B7340',
    avatarRing: goldBorder,
    carouselNameColor: isDark ? '#FFFFFF' : '#1C1C1E',
  };
}

/* ─── Swipeable row wrapper (avoids ref type mismatch) ───────────── */

function SwipeableRow({
  uid,
  swipeRefs,
  swipeActions,
  children,
}: {
  uid: string;
  swipeRefs: React.MutableRefObject<Map<string, any>>;
  swipeActions: React.ReactElement;
  children: React.ReactNode;
}) {
  const ref = useRef<any>(null);

  React.useEffect(() => {
    if (ref.current) swipeRefs.current.set(uid, ref.current);
    return () => { swipeRefs.current.delete(uid); };
  }, [uid, swipeRefs]);

  return (
    <Swipeable
      ref={ref}
      rightThreshold={30}
      renderRightActions={() => swipeActions}
      containerStyle={{ overflow: 'visible' }}
    >
      {children}
    </Swipeable>
  );
}

/* ─── Component ───────────────────────────────────────────────────── */

export default function ReceptorScreenModal({
  visible,
  onClose,
  owner,
  subscribers,
  totalCount,
  loading,
  isDark,
  onRevoke,
  onMute,
  onBlock,
  onBlockExternal,
}: ReceptorScreenModalProps) {
  const t = useCoreT();
  const { language } = useLanguage();
  const modalFooterBottomPad = useModalFooterBottomPad();
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const c = useMemo(() => getColors(isDark), [isDark]);
  const swipeRefs = useRef<Map<string, any>>(new Map());
  const closeAllSwipes = useCallback(() => {
    for (const ref of swipeRefs.current.values()) { try { ref.close(); } catch {} }
  }, []);
  const hasOwnerActions = !!(onRevoke || onMute || onBlock);
  const hasExternalAction = !!onBlockExternal;

  const newToday = useMemo(
    () => subscribers.filter((s) => isToday(s.addedAt)).length,
    [subscribers],
  );

  const sorted = useMemo(() => {
    const list = [...subscribers];
    if (sortMode === 'alpha') {
      list.sort((a, b) =>
        subscriberTitle(a).localeCompare(subscriberTitle(b), 'es', { sensitivity: 'base' }),
      );
    } else {
      list.sort((a, b) => {
        const ta = a.addedAt ? new Date(a.addedAt).getTime() : 0;
        const tb = b.addedAt ? new Date(b.addedAt).getTime() : 0;
        return tb - ta;
      });
    }
    return list;
  }, [subscribers, sortMode]);

  const recentSubscribers = useMemo(() => {
    const byDate = [...subscribers].sort((a, b) => {
      const ta = a.addedAt ? new Date(a.addedAt).getTime() : 0;
      const tb = b.addedAt ? new Date(b.addedAt).getTime() : 0;
      return tb - ta;
    });
    return byDate.slice(0, 15);
  }, [subscribers]);

  const toggleSort = useCallback(() => {
    setSortMode((prev) => (prev === 'date' ? 'alpha' : 'date'));
  }, []);

  const renderListRow = useCallback(
    ({ item }: { item: CardSubscriberRow }) => {
      const timeLabel = relativeTimeLabel(item.addedAt, language, t);
      const primary = subscriberTitle(item);
      const subtitle = subscriberSubtitleLine(item, primary);

      const rowContent = (
        <View style={[s.listRow, { backgroundColor: c.rowBg, borderBottomColor: c.rowBorder }, item.muted && { opacity: 0.5 }]}>
          <SubscriberResolvedAvatar
            uid={item.uid}
            userAvatarUrl={item.userAvatarUrl}
            variant="list"
            borderColor={c.avatarRing}
            surfaceBg={c.surface}
            iconMuted={c.muted}
          />
          <View style={s.listTextCol}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[s.listName, { color: c.text }]} numberOfLines={1}>
                {primary}
              </Text>
              {item.muted && <MaterialCommunityIcons name="volume-off" size={13} color={c.gold} />}
            </View>
            {subtitle ? (
              <Text style={[s.listSubtitle, { color: c.textSecondary }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {timeLabel ? (
            <View style={[s.timePill, { backgroundColor: c.timePillBg }]}>
              <Text style={[s.timePillText, { color: c.timePillText }]}>{timeLabel}</Text>
            </View>
          ) : null}
        </View>
      );

      if (!hasOwnerActions && !hasExternalAction) return rowContent;

      const swipeActions = (
        <View style={s.swipeRow}>
          {onMute && (
            <TouchableOpacity
              style={[s.swipeBtn, { backgroundColor: '#FF9500' }]}
              onPress={() => {
                closeAllSwipes();
                onMute(item.uid, item.muted, primary);
              }}
            >
              <MaterialCommunityIcons name={item.muted ? 'volume-high' : 'volume-off'} size={18} color="#fff" />
              <Text style={s.swipeBtnText}>
                {item.muted ? t('common_unmute') : t('common_mute')}
              </Text>
            </TouchableOpacity>
          )}
          {onBlock && (
            <TouchableOpacity
              style={[s.swipeBtn, { backgroundColor: '#AF52DE' }]}
              onPress={() => {
                closeAllSwipes();
                onBlock(item.uid, primary);
              }}
            >
              <MaterialCommunityIcons name="cancel" size={18} color="#fff" />
              <Text style={s.swipeBtnText}>{t('common_block')}</Text>
            </TouchableOpacity>
          )}
          {onBlockExternal && (
            <TouchableOpacity
              style={[s.swipeBtn, { backgroundColor: '#AF52DE' }]}
              onPress={() => {
                closeAllSwipes();
                onBlockExternal(item.uid, primary);
              }}
            >
              <MaterialCommunityIcons name="cancel" size={18} color="#fff" />
              <Text style={s.swipeBtnText}>{t('common_block')}</Text>
            </TouchableOpacity>
          )}
          {onRevoke && (
            <TouchableOpacity
              style={[s.swipeBtn, { backgroundColor: '#FF3B30' }]}
              onPress={() => {
                closeAllSwipes();
                onRevoke(item.uid, primary);
              }}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color="#fff" />
              <Text style={s.swipeBtnText}>{t('common_remove')}</Text>
            </TouchableOpacity>
          )}
        </View>
      );

      return (
        <SwipeableRow uid={item.uid} swipeRefs={swipeRefs} swipeActions={swipeActions}>
          {rowContent}
        </SwipeableRow>
      );
    },
    [c, t, language, hasOwnerActions, hasExternalAction, onRevoke, onMute, onBlock, onBlockExternal, closeAllSwipes],
  );

  const keyExtractor = useCallback((item: CardSubscriberRow) => item.uid, []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[s.root, { backgroundColor: c.bg }]}>
        {/* ── Header ────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {owner.userAvatarUrl ? (
              <ExpoImage
                source={{
                  uri: resolveVaultMediaUrlForApp(owner.userAvatarUrl) ?? owner.userAvatarUrl,
                }}
                style={s.headerAvatar}
                cachePolicy="none"
                key={owner.userAvatarUrl}
              />
            ) : owner.brandLogoUrl ? (
              <ExpoImage
                source={{
                  uri: resolveVaultMediaUrlForApp(owner.brandLogoUrl) ?? owner.brandLogoUrl,
                }}
                style={s.headerAvatar}
                cachePolicy="disk"
                key={`brand-${owner.brandLogoUrl}`}
              />
            ) : (
              <View style={[s.headerAvatarFallback, { backgroundColor: c.surface }]}>
                <MaterialCommunityIcons name="account" size={20} color={c.muted} />
              </View>
            )}
            <View style={s.headerTextCol}>
              <Text style={[s.headerName, { color: c.text }]} numberOfLines={1}>
                {owner.displayName}
              </Text>
              {owner.occupation ? (
                <Text style={[s.headerOccupation, { color: c.textSecondary }]} numberOfLines={1}>
                  {owner.occupation}
                </Text>
              ) : null}
            </View>
          </View>
          <TouchableOpacity
            style={[s.closeBtn, { backgroundColor: c.closeBg }]}
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('receptor_close_a11y')}
          >
            <MaterialCommunityIcons name="close" size={20} color={c.closeIcon} />
          </TouchableOpacity>
        </View>

        {/* ── Title ─────────────────────────────────────────────── */}
        <Text style={[s.screenTitle, { color: c.text }]}>
          {t('receptor_title')}
        </Text>

        {/* ── Stats Card ────────────────────────────────────────── */}
        <View
          style={[
            s.statsCard,
            { backgroundColor: c.statCardBg, borderColor: c.statCardBorder },
          ]}
        >
          <View style={s.statsLeft}>
            <Text style={[s.statsNumber, { color: c.gold }]}>{totalCount}</Text>
            <Text style={[s.statsLabel, { color: c.textSecondary }]}>
              {t('receptor_total_label')}
            </Text>
          </View>
          <View style={[s.statsDivider, { backgroundColor: c.border }]} />
          <View style={s.statsRight}>
            <View style={s.statsNewRow}>
              <Text style={[s.statsNewNumber, { color: c.gold }]}>+{newToday}</Text>
              <MaterialCommunityIcons name="arrow-top-right" size={14} color={c.gold} />
            </View>
            <Text style={[s.statsLabel, { color: c.textSecondary }]}>
              {t('receptor_new_today')}
            </Text>
          </View>
        </View>

        {/* ── New Receptors Carousel ─────────────────────────────── */}
        {recentSubscribers.length > 0 ? (
          <View style={s.carouselSection}>
            <Text style={[s.sectionTitle, { color: c.text }]}>
              {t('receptor_new_carousel')}
            </Text>
            <ScrollView
              horizontal
              {...verticalScrollInteractionProps}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.carouselContent}
            >
              {recentSubscribers.map((sub) => {
                const title = subscriberTitle(sub);
                const nick = String(sub.userNickName || '')
                  .replace(/^@+/g, '')
                  .trim();
                const displayTitle = title || (nick ? `@${nick}` : '');
                const parts = displayTitle.split(/\s+/).filter(Boolean);
                return (
                <View key={`carousel-${sub.uid}`} style={s.carouselItem}>
                  <View style={[s.carouselAvatarRing, { borderColor: c.gold }]}>
                    <SubscriberResolvedAvatar
                      uid={sub.uid}
                      userAvatarUrl={sub.userAvatarUrl}
                      variant="carousel"
                      borderColor={c.gold}
                      surfaceBg={c.surface}
                      iconMuted={c.muted}
                    />
                  </View>
                  <Text style={[s.carouselName, { color: c.carouselNameColor }]} numberOfLines={1}>
                    {parts[0] || displayTitle || `#${sub.uid.slice(-4)}`}
                    {parts.length > 1 ? ` ${parts[1]?.[0]?.toUpperCase() ?? ''}.` : ''}
                  </Text>
                </View>
              );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* ── Connections Header + Filter ────────────────────────── */}
        <View style={s.connectionsHeader}>
          <Text style={[s.sectionTitle, { color: c.text, flex: 1 }]}>
            {sortMode === 'alpha'
              ? t('receptor_connections_az')
              : t('receptor_connections')}
          </Text>
          <TouchableOpacity
            style={[s.filterBtn, { backgroundColor: c.filterBg, borderColor: c.filterBorder }]}
            onPress={toggleSort}
          >
            <Text style={[s.filterBtnText, { color: c.filterText }]}>
              {t('receptor_filter')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Main List ─────────────────────────────────────────── */}
        {loading ? (
          <View style={s.loadingWrap}>
            <Text style={[s.loadingText, { color: c.textSecondary }]}>
              {t('receptor_loading')}
            </Text>
          </View>
        ) : sorted.length === 0 ? (
          <View style={s.emptyWrap}>
            <MaterialCommunityIcons name="account-group-outline" size={48} color={c.muted} />
            <Text style={[s.emptyText, { color: c.textSecondary }]}>
              {t('receptor_empty')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={keyExtractor}
            {...listScrollInteractionProps}
            renderItem={renderListRow}
            contentContainerStyle={[
              SCROLL_CONTENT_MIN_FILL,
              s.listContent,
              { paddingBottom: Math.max(40, modalFooterBottomPad) },
            ]}
            showsVerticalScrollIndicator={false}
            initialNumToRender={15}
            maxToRenderPerBatch={20}
          />
        )}
      </View>
    </Modal>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 70 : 48,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  headerAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    marginLeft: 10,
    flex: 1,
  },
  headerName: {
    fontSize: 15,
    fontWeight: '600',
  },
  headerOccupation: {
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Screen Title */
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 14,
  },

  /* Stats Card */
  statsCard: {
    marginHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 18,
  },
  statsLeft: {
    flex: 1,
    alignItems: 'center',
  },
  statsRight: {
    flex: 1,
    alignItems: 'center',
  },
  statsDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 12,
  },
  statsNumber: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  statsLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  statsNewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statsNewNumber: {
    fontSize: 22,
    fontWeight: '700',
  },

  /* Carousel */
  carouselSection: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  carouselContent: {
    paddingHorizontal: 16,
    gap: 14,
  },
  carouselItem: {
    alignItems: 'center',
    width: 68,
  },
  carouselAvatarRing: {
    width: CAROUSEL_AVATAR_SIZE + 4,
    height: CAROUSEL_AVATAR_SIZE + 4,
    borderRadius: (CAROUSEL_AVATAR_SIZE + 4) / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  carouselAvatar: {
    width: CAROUSEL_AVATAR_SIZE,
    height: CAROUSEL_AVATAR_SIZE,
    borderRadius: CAROUSEL_AVATAR_SIZE / 2,
  },
  carouselAvatarFallback: {
    width: CAROUSEL_AVATAR_SIZE,
    height: CAROUSEL_AVATAR_SIZE,
    borderRadius: CAROUSEL_AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselName: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },

  /* Connections Header */
  connectionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  filterBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  filterBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },

  /* Main List */
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1.5,
  },
  listAvatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTextCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  listName: {
    fontSize: 15,
    fontWeight: '600',
  },
  listSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  timePill: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timePillText: {
    fontSize: 11,
    fontWeight: '600',
  },

  /* States */
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },

  /* Swipe actions */
  swipeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: '100%',
  },
  swipeBtn: {
    width: 72,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  swipeBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
});
