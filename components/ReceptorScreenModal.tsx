/**
 * ReceptorScreenModal — Premium full-screen modal showing who has saved a card.
 *
 * Reusable across cards.tsx, contacts.tsx, and search.tsx.
 * Adapts to dark/light mode and ES/EN via the `tr` prop.
 */

import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import type { CardSubscriberRow } from '@/services/qrApi';
import { resolveVaultMediaUrlForApp } from '@/services/resolveVaultMediaUrl';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
  tr: (es: string, en: string) => string;
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
  tr: (es: string, en: string) => string,
): string {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays <= 0) return tr('Hoy', 'Today');
  if (diffDays === 1) return tr('Ayer', 'Yesterday');
  if (diffDays < 7) return `${diffDays} ${tr('días', 'days')}`;

  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mIdx = d.getMonth();
  const day = d.getDate();
  const label = tr(months[mIdx], monthsEn[mIdx]);
  return `${day} ${label}`;
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  const gold = '#D4AF37';
  const goldSoft = isDark ? 'rgba(212,175,55,0.22)' : 'rgba(212,175,55,0.14)';
  const goldBorder = isDark ? 'rgba(212,175,55,0.45)' : 'rgba(212,175,55,0.55)';
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
    timePillBg: isDark ? 'rgba(212,175,55,0.18)' : 'rgba(212,175,55,0.12)',
    timePillText: isDark ? '#D4AF37' : '#8B7340',
    filterBg: isDark ? 'rgba(212,175,55,0.15)' : 'rgba(212,175,55,0.10)',
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
  tr,
  onRevoke,
  onMute,
  onBlock,
  onBlockExternal,
}: ReceptorScreenModalProps) {
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
      const timeLabel = relativeTimeLabel(item.addedAt, tr);
      const primary = subscriberTitle(item);
      const subtitle = subscriberSubtitleLine(item, primary);
      const profileAvatar = item.userAvatarUrl;

      const rowContent = (
        <View style={[s.listRow, { backgroundColor: c.rowBg, borderBottomColor: c.rowBorder }, item.muted && { opacity: 0.5 }]}>
          {profileAvatar ? (
            <ExpoImage
              source={{ uri: profileAvatar }}
              style={[s.listAvatar, { borderColor: c.avatarRing }]}
              cachePolicy="none"
              key={`${item.uid}-${profileAvatar}`}
            />
          ) : (
            <View style={[s.listAvatarFallback, { backgroundColor: c.surface, borderColor: c.avatarRing }]}>
              <Text style={[s.listAvatarInitials, { color: c.muted }]}>{initialsFrom(primary)}</Text>
            </View>
          )}
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
                {item.muted ? tr('Activar', 'Unmute') : tr('Silenciar', 'Mute')}
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
              <Text style={s.swipeBtnText}>{tr('Bloquear', 'Block')}</Text>
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
              <Text style={s.swipeBtnText}>{tr('Bloquear', 'Block')}</Text>
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
              <Text style={s.swipeBtnText}>{tr('Eliminar', 'Remove')}</Text>
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
    [c, tr, hasOwnerActions, hasExternalAction, onRevoke, onMute, onBlock, onBlockExternal, closeAllSwipes],
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
            accessibilityLabel={tr('Cerrar', 'Close')}
          >
            <MaterialCommunityIcons name="close" size={20} color={c.closeIcon} />
          </TouchableOpacity>
        </View>

        {/* ── Title ─────────────────────────────────────────────── */}
        <Text style={[s.screenTitle, { color: c.text }]}>
          {tr('Mis Receptores', 'My Receptors')}
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
              {tr('Total de Receptores', 'Total Receptors')}
            </Text>
          </View>
          <View style={[s.statsDivider, { backgroundColor: c.border }]} />
          <View style={s.statsRight}>
            <View style={s.statsNewRow}>
              <Text style={[s.statsNewNumber, { color: c.gold }]}>+{newToday}</Text>
              <MaterialCommunityIcons name="arrow-top-right" size={14} color={c.gold} />
            </View>
            <Text style={[s.statsLabel, { color: c.textSecondary }]}>
              {tr('Nuevos (Hoy)', 'New (Today)')}
            </Text>
          </View>
        </View>

        {/* ── New Receptors Carousel ─────────────────────────────── */}
        {recentSubscribers.length > 0 ? (
          <View style={s.carouselSection}>
            <Text style={[s.sectionTitle, { color: c.text }]}>
              {tr('Nuevos Receptores', 'New Receptors')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.carouselContent}
            >
              {recentSubscribers.map((sub) => {
                const title = subscriberTitle(sub);
                const parts = title.split(/\s+/).filter(Boolean);
                const profileAvatar = sub.userAvatarUrl
                  ? resolveVaultMediaUrlForApp(sub.userAvatarUrl) ?? sub.userAvatarUrl
                  : null;
                return (
                <View key={`carousel-${sub.uid}`} style={s.carouselItem}>
                  <View style={[s.carouselAvatarRing, { borderColor: c.gold }]}>
                    {profileAvatar ? (
                      <ExpoImage
                        source={{ uri: profileAvatar }}
                        style={s.carouselAvatar}
                        cachePolicy="none"
                        key={`${sub.uid}-${profileAvatar}`}
                      />
                    ) : (
                      <View style={[s.carouselAvatarFallback, { backgroundColor: c.surface }]}>
                        <Text style={[s.carouselFallbackInitials, { color: c.muted }]}>
                          {initialsFrom(title)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.carouselName, { color: c.carouselNameColor }]} numberOfLines={1}>
                    {parts[0] || title}
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
              ? tr('Todas las Conexiones (A-Z)', 'All Connections (A-Z)')
              : tr('Todas las Conexiones', 'All Connections')}
          </Text>
          <TouchableOpacity
            style={[s.filterBtn, { backgroundColor: c.filterBg, borderColor: c.filterBorder }]}
            onPress={toggleSort}
          >
            <Text style={[s.filterBtnText, { color: c.filterText }]}>
              {tr('Filtrar', 'Filter')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Main List ─────────────────────────────────────────── */}
        {loading ? (
          <View style={s.loadingWrap}>
            <Text style={[s.loadingText, { color: c.textSecondary }]}>
              {tr('Cargando...', 'Loading...')}
            </Text>
          </View>
        ) : sorted.length === 0 ? (
          <View style={s.emptyWrap}>
            <MaterialCommunityIcons name="account-group-outline" size={48} color={c.muted} />
            <Text style={[s.emptyText, { color: c.textSecondary }]}>
              {tr('Aún no hay personas con acceso a esta tarjeta.', 'No one has access to this card yet.')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={keyExtractor}
            renderItem={renderListRow}
            contentContainerStyle={[s.listContent, { paddingBottom: Math.max(40, modalFooterBottomPad) }]}
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
    paddingTop: Platform.OS === 'ios' ? 58 : 36,
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
  carouselFallbackInitials: {
    fontSize: 16,
    fontWeight: '700',
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
  listAvatarInitials: {
    fontSize: 18,
    fontWeight: '700',
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
