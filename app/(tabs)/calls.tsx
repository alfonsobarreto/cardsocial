import { getActiveUserId } from '@/services/authSession';
import { requestGhostLinkCallImperative } from '@/services/GhostLinkCallProvider';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import appPalette from '../theme';
import {
    type CallHistoryRow,
    listCallsHistory,
    listReceivedContacts,
} from '@/services/qrApi';
import { receivedContactMergeKey } from '@/services/receivedContactsPresentationMerge';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

type ContactRow = {
  linkKey: string;
  uid: string;
  cardId: string | null;
  userFullName: string;
  userNickName: string;
  userAvatarUrl: string | null;
  cardName: string;
  holdersCount: number;
  ratingAvg: number;
  storyState: 'none' | 'normal' | 'vip';
  cardType?: 'business' | 'smart';
};

function formatCallDuration(sec: number): string {
  if (!sec || sec <= 0) {
    return '';
  }
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function formatTime24FromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const CALLS_LINE_EMPTY = '—';

/**
 * Historial: línea 1 = tarjeta + tipo; línea 2 = persona; línea 3 = log (hora · duración).
 */
function callsHistoryRowLines(
  item: CallHistoryRow,
  _contact: ContactRow | undefined,
  tr: (es: string, en: string) => string,
): { cardTitleBold: string; cardKindSmall: string; personLine: string; logLine: string } {
  const cardIsBiz = item.displayCardIsBusiness === true;
  const kindLabel = cardIsBiz ? tr('Negocio', 'Business') : tr('Smart Card', 'Smart Card');

  let cardTitle = CALLS_LINE_EMPTY;
  if (item.displayCardName.trim().length > 0) {
    cardTitle = item.displayCardName.trim();
  } else if (item.sourceCardName.trim().length > 0) {
    cardTitle = item.sourceCardName.trim();
  }

  const incomingLike = item.direction === 'incoming' || item.direction === 'missed';
  let personLine = CALLS_LINE_EMPTY;
  if (incomingLike) {
    personLine = item.peerPersonalName.trim().length > 0 ? item.peerPersonalName.trim() : CALLS_LINE_EMPTY;
  } else {
    personLine = item.peerFullName.trim().length > 0 ? item.peerFullName.trim() : CALLS_LINE_EMPTY;
  }

  const durStr = formatCallDuration(item.durationSec);
  const clockStr = formatTime24FromIso(item.createdAt);
  const logLine = [clockStr, durStr].filter(Boolean).join(' · ');
  return { cardTitleBold: cardTitle, cardKindSmall: kindLabel, personLine, logLine };
}

export default function CallsPage() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => language === 'en' ? en : es;
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const shell = appPalette[isNight ? 'dark' : 'light'];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1 },
        headerRow: {
          marginTop: 16,
          marginHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
        },
        title: {
          color: shell.textPrimary,
          fontSize: 25,
          fontFamily: 'Georgia',
          fontWeight: '800',
        },
        loaderWrap: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        listContent: {
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 20,
          gap: 10,
        },
        rowCard: {
          borderRadius: 16,
          borderWidth: 1,
          borderColor: shell.callsCardBorder,
          backgroundColor: shell.callsCardBg,
          padding: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        avatarRingBase: {
          width: 58,
          height: 58,
          borderRadius: 29,
          alignItems: 'center',
          justifyContent: 'center',
        },
        avatarRingNone: {
          borderWidth: 1,
          borderColor: shell.border,
        },
        avatar: {
          width: 50,
          height: 50,
          borderRadius: 25,
        },
        avatarFallback: {
          width: 50,
          height: 50,
          borderRadius: 25,
          backgroundColor: shell.avatarFallbackBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        rowMain: {
          flex: 1,
        },
        nameText: {
          color: shell.textPrimary,
          fontSize: 15,
          fontWeight: '800',
          flexShrink: 1,
        },
        titleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 4,
        },
        cardKindTiny: {
          fontSize: 10,
          fontWeight: '700',
          color: shell.callsOnCardMuted,
          flexShrink: 0,
          marginLeft: 2,
          alignSelf: 'center',
        },
        nickText: {
          marginTop: 1,
          color: shell.callsOnCardSecondary,
          fontSize: 12,
          fontWeight: '700',
        },
        callLogLine: {
          marginTop: 2,
          color: shell.callsOnCardMuted,
          fontSize: 11,
          fontWeight: '600',
        },
        voiceBtn: {
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: shell.voiceBtnBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        actionsColumn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 10,
          marginLeft: 4,
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderLeftColor: shell.callsCardBorder,
        },
        emptyText: {
          marginTop: 48,
          textAlign: 'center',
          color: shell.callsOnCardSecondary,
          fontSize: 14,
          fontWeight: '600',
        },
        modalOverlay: {
          flex: 1,
          backgroundColor: shell.overlayScrim,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 18,
        },
        detailCard: {
          width: '100%',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: shell.callsCardBorder,
          backgroundColor: shell.callsCardBg,
          padding: 18,
          alignItems: 'center',
        },
        closeBtn: {
          position: 'absolute',
          top: 10,
          right: 10,
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: shell.surfaceMuted,
        },
        detailAvatar: {
          marginTop: 8,
          width: 78,
          height: 78,
          borderRadius: 39,
        },
        detailAvatarFallback: {
          marginTop: 8,
          width: 78,
          height: 78,
          borderRadius: 39,
          backgroundColor: shell.avatarFallbackBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        detailName: {
          marginTop: 10,
          color: shell.textPrimary,
          fontSize: 18,
          fontWeight: '800',
        },
        detailNick: {
          marginTop: 2,
          color: shell.callsOnCardSecondary,
          fontSize: 13,
          fontWeight: '700',
        },
        detailLogLine: {
          marginTop: 4,
          color: shell.callsOnCardMuted,
          fontSize: 12,
          fontWeight: '600',
        },
        detailCardName: {
          marginTop: 6,
          color: shell.callsOnCardMuted,
          fontSize: 12,
        },
        detailStats: {
          marginTop: 6,
          color: shell.textPrimary,
          fontSize: 12,
          fontWeight: '700',
        },
        detailMeta: {
          marginTop: 8,
          color: shell.callsOnCardSecondary,
          fontSize: 11,
          textAlign: 'center',
        },
      }),
    [shell],
  );

  const [loading, setLoading] = useState(true);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [history, setHistory] = useState<CallHistoryRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [selectedCall, setSelectedCall] = useState<CallHistoryRow | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const contactByUid = useMemo(() => {
    const map = new Map<string, ContactRow>();
    contacts.forEach((row) => {
      if (!map.has(row.uid)) {
        map.set(row.uid, row);
      }
    });
    return map;
  }, [contacts]);

  const loadData = async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    try {
      if (!silent) {
        setLoading(true);
      }
      const uid = await getActiveUserId();
      if (!uid) {
        setHistory([]);
        setContacts([]);
        return;
      }

      const [historyResponse, contactsResponse] = await Promise.all([
        listCallsHistory({ ownerUid: uid }),
        listReceivedContacts({ ownerUid: uid }),
      ]);

      setHistory(historyResponse.history);
      setContacts(
        contactsResponse.contacts.map((row) => {
          const cardId = row.cardId != null && String(row.cardId).trim() ? String(row.cardId).trim() : null;
          return {
            linkKey: receivedContactMergeKey({ uid: row.uid, cardId }),
            uid: row.uid,
            cardId,
            userFullName: row.userFullName,
            userNickName: row.userNickName,
            userAvatarUrl: row.userAvatarUrl,
            cardName: row.cardName,
            holdersCount: row.holdersCount,
            ratingAvg: row.ratingAvg,
            storyState: row.storyState,
            cardType: row.cardType === 'business' ? 'business' : row.cardType === 'smart' ? 'smart' : undefined,
          };
        }),
      );
    } catch (error: any) {
      Alert.alert(tr('No se pudo cargar Calls', 'Could not load Calls'), error?.message || tr('Intenta de nuevo.', 'Try again.'));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const renderRow = ({ item }: { item: CallHistoryRow }) => {
    const contact = contactByUid.get(item.peerUid);
    const { cardTitleBold, cardKindSmall, personLine, logLine } = callsHistoryRowLines(item, contact, tr);
    const ringExtra =
      item.storyState === 'vip'
        ? { borderWidth: 2.2 as const, borderColor: shell.ctaAccent }
        : item.storyState === 'normal'
          ? { borderWidth: 2 as const, borderColor: shell.success }
          : styles.avatarRingNone;
    const cardKind = item.isBusinessCard ? 'business' : 'personal';
    const imperativeBase = {
      targetUid: item.peerUid,
      sourceCardId: item.sourceCardId,
      sourceCardName: item.sourceCardName || tr('Tarjeta Social', 'Social Card'),
      cardPhoto: item.userAvatarUrl,
      cardType: cardKind,
      peerName: item.peerFullName,
      peerNickname: item.peerFullName.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user',
      peerPhotoUrl: item.userAvatarUrl,
    };

    return (
      <TouchableOpacity
        activeOpacity={0.92}
        style={styles.rowCard}
        onPress={() => {
          setSelectedCall(item);
          setDetailVisible(true);
        }}
      >
        <View style={[styles.avatarRingBase, ringExtra]}>
          {item.userAvatarUrl ? (
            <ExpoImage source={{ uri: item.userAvatarUrl }} style={styles.avatar} cachePolicy="disk" />
          ) : (
            <View style={styles.avatarFallback}>
              <MaterialCommunityIcons name="account" size={18} color={shell.iconColor} />
            </View>
          )}
        </View>

        <View style={styles.rowMain}>
          <View style={styles.titleRow}>
            <MaterialCommunityIcons
              name={
                item.status === 'missed' || item.status === 'rejected'
                  ? 'phone-missed'
                  : item.direction === 'outgoing'
                    ? 'phone-outgoing'
                    : 'phone-incoming'
              }
              size={14}
              color={
                item.status === 'missed' || item.status === 'rejected'
                  ? '#E53935'
                  : item.direction === 'outgoing'
                    ? '#2196F3'
                    : '#4CAF50'
              }
            />
            <Text style={styles.nameText} numberOfLines={2}>
              {cardTitleBold}
            </Text>
            <Text style={styles.cardKindTiny} numberOfLines={1}>
              {cardKindSmall}
            </Text>
            {item.callType === 'video' ? <MaterialCommunityIcons name="video" size={13} color="#C8A84E" /> : null}
          </View>
          <View style={{ marginTop: 3 }}>
            <Text style={styles.nickText} numberOfLines={3}>
              {personLine}
            </Text>
            {logLine ? (
              <Text style={styles.callLogLine} numberOfLines={2}>
                {logLine}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.actionsColumn}>
          <TouchableOpacity
            style={[styles.voiceBtn, { backgroundColor: '#C8A84E' }]}
            onPress={() => {
              requestGhostLinkCallImperative({
                ...imperativeBase,
                callType: 'video',
              });
            }}
            accessibilityLabel={tr('Videollamada', 'Video call')}
          >
            <MaterialCommunityIcons name="video" size={16} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.voiceBtn, { backgroundColor: '#1B6B3A' }]}
            onPress={() => {
              requestGhostLinkCallImperative({
                ...imperativeBase,
                callType: 'audio',
              });
            }}
            accessibilityLabel={tr('Llamada de voz', 'Voice call')}
          >
            <MaterialCommunityIcons name="phone" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const selectedContact = selectedCall ? contactByUid.get(selectedCall.peerUid) || null : null;

  return (
    <LinearGradient colors={[...shell.callsShellGradient]} style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Calls</Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={shell.loaderAccent} />
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.callId}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={listRefreshing}
              onRefresh={async () => {
                setListRefreshing(true);
                await loadData({ silent: true });
                setListRefreshing(false);
              }}
              tintColor={shell.refreshAccent}
              colors={[shell.refreshAccent]}
            />
          }
          ListEmptyComponent={<Text style={styles.emptyText}>{tr('Aun no hay llamadas registradas.', 'No calls registered yet.')}</Text>}
        />
      )}

      <Modal visible={detailVisible} transparent animationType="fade" onRequestClose={() => setDetailVisible(false)}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={70} tint={isNight ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={styles.detailCard}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setDetailVisible(false)} accessibilityLabel={tr('Cerrar', 'Close')}>
              <MaterialCommunityIcons name="close" size={20} color={shell.iconColor} />
            </TouchableOpacity>

            {selectedCall?.userAvatarUrl ? (
              <ExpoImage source={{ uri: selectedCall.userAvatarUrl }} style={styles.detailAvatar} cachePolicy="disk" />
            ) : (
              <View style={styles.detailAvatarFallback}>
                <MaterialCommunityIcons name="account" size={20} color={shell.iconColor} />
              </View>
            )}

            {selectedCall ? (() => {
              const detailLines = callsHistoryRowLines(selectedCall, selectedContact || undefined, tr);
              return (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'baseline', gap: 6 }}>
                    <Text style={styles.detailName}>{detailLines.cardTitleBold}</Text>
                    <Text style={styles.detailCardName}>{detailLines.cardKindSmall}</Text>
                  </View>
                  <Text style={styles.detailNick}>{detailLines.personLine}</Text>
                  {detailLines.logLine ? (
                    <Text style={styles.detailLogLine}>{detailLines.logLine}</Text>
                  ) : null}
                </>
              );
            })() : null}
            <Text style={styles.detailStats}>
              Rating {Number(selectedContact?.ratingAvg || 0).toFixed(1)} | {selectedContact?.holdersCount || 0} poseedores
            </Text>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}
