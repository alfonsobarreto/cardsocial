import { getActiveUserId } from '@/services/authSession';
import { logBackendNetworkDebug } from '@/services/backendAuth';
import { requestGhostLinkCallImperative } from '@/services/GhostLinkCallProvider';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { trEsEn, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import appPalette from '../theme';
import {
    type CallHistoryRow,
    getApiBaseUrl,
    listCallsHistory,
    listReceivedContacts,
} from '@/services/qrApi';
import { outgoingMirrorFromCallHistoryOutgoing } from '@/services/outgoingCallUiMirror';
import { receivedContactMergeKey } from '@/services/receivedContactsPresentationMerge';
import { toRenderableImageUri } from '@/services/userProfilePhoto';
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
  sid: string | null;
  bId: string | null;
  userFullName: string;
  userNickName: string;
  userAvatarUrl: string | null;
  cardName: string;
  /** Solo business — línea de contacto en tarjeta (`bcContactName`). */
  bcContactName?: string | null;
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

function subtitleStripAt(raw: string): string {
  const s = raw.replace(/@/g, '').trim();
  return s.length > 0 ? s : CALLS_LINE_EMPTY;
}

function isCallsHistoryBusinessRow(item: CallHistoryRow): boolean {
  return item.cardType === 'business' || item.displayCardIsBusiness === true;
}

function callsHistoryLogLine(item: CallHistoryRow, tr: (es: string, en: string) => string): string {
  const durStr = formatCallDuration(item.durationSec);
  const clockStr = formatTime24FromIso(item.createdAt);
  const dirLabel =
    item.direction === 'outgoing'
      ? tr('Saliente', 'Outgoing')
      : item.direction === 'missed'
        ? tr('Perdida', 'Missed')
        : tr('Entrante', 'Incoming');
  return [dirLabel, clockStr, durStr].filter(Boolean).join(' · ');
}

function callsHistoryNonEmptyUrl(s: string | null | undefined): string | null {
  const t = s != null ? String(s).trim() : '';
  return t.length > 0 ? t : null;
}

/**
 * Slots UI historial Calls — SOLO `direction === 'outgoing'`.
 * Espejo único: `outgoingMirrorFromCallHistoryOutgoing` (mismos campos que Confirm / Outgoing VoIP).
 */
function callsHistoryOutgoingRowUi(
  item: CallHistoryRow,
  contact: ContactRow | undefined,
  tr: (es: string, en: string) => string,
): {
  avatarPrimary: string | null;
  avatarFallback: string | null;
  titleBold: string;
  kindBadge: string;
  subtitleLine: string;
  logLine: string;
} {
  const logLine = callsHistoryLogLine(item, tr);
  const om = outgoingMirrorFromCallHistoryOutgoing(item, contact);
  return {
    avatarPrimary: om.ringUrl,
    avatarFallback: null,
    titleBold: om.titleBold,
    kindBadge: om.isBusiness ? tr('Negocio', 'Business') : tr('Smart Card', 'Smart Card'),
    subtitleLine: om.subtitleLine,
    logLine,
  };
}

/**
 * Slots UI historial Calls — `incoming` o `missed` (no saliente).
 * Business entrante: avatar = caller (`userAvatarUrl`), título = `bcName`, subtítulo = `userFullName` (caller).
 * Smart entrante: imagen = `userAvatarUrl` caller; título = **tu** tarjeta (`cardName` → `scName` → …); subtítulo = `userFullName` caller.
 */
function callsHistoryIncomingRowUi(
  item: CallHistoryRow,
  contact: ContactRow | undefined,
  tr: (es: string, en: string) => string,
): {
  avatarPrimary: string | null;
  avatarFallback: string | null;
  titleBold: string;
  kindBadge: string;
  subtitleLine: string;
  logLine: string;
} {
  const logLine = callsHistoryLogLine(item, tr);
  const snap = item.issuerSnapshot;

  if (isCallsHistoryBusinessRow(item)) {
    const rowAvatar = callsHistoryNonEmptyUrl(item.userAvatarUrl);
    const contactAvatar = contact ? callsHistoryNonEmptyUrl(contact.userAvatarUrl) : null;
    const snapAvatar = callsHistoryNonEmptyUrl(snap?.userAvatarUrl ?? undefined);
    const avatarPrimary = rowAvatar ?? contactAvatar ?? snapAvatar ?? null;
    const titleRaw =
      (item.bcName != null && String(item.bcName).trim() ? String(item.bcName).trim() : '') ||
      (item.displayCardName || '').trim() ||
      '';
    const titleBold = titleRaw.length > 0 ? titleRaw : CALLS_LINE_EMPTY;
    const caller =
      (item.userFullName || '').trim() ||
      (item.peerFullName || '').trim() ||
      (item.peerPersonalName || '').trim();
    const subtitleLine =
      caller.length > 0 ? subtitleStripAt(caller) : CALLS_LINE_EMPTY;
    return {
      avatarPrimary,
      avatarFallback: null,
      titleBold,
      kindBadge: tr('Negocio', 'Business'),
      subtitleLine,
      logLine,
    };
  }

  const rowAvatar = callsHistoryNonEmptyUrl(item.userAvatarUrl);
  const contactAvatar = contact ? callsHistoryNonEmptyUrl(contact.userAvatarUrl) : null;
  const snapAvatar = callsHistoryNonEmptyUrl(snap?.userAvatarUrl ?? undefined);
  const avatarPrimary = rowAvatar ?? contactAvatar ?? snapAvatar ?? null;
  const cardName =
    (item.cardName != null && String(item.cardName).trim() ? String(item.cardName).trim() : '') ||
    (item.scName != null && String(item.scName).trim() ? String(item.scName).trim() : '') ||
    (item.displayCardName || '').trim() ||
    (item.sourceCardName || '').trim();
  const titleBold = cardName.length > 0 ? cardName : CALLS_LINE_EMPTY;
  const userFullName =
    (item.userFullName || '').trim() ||
    (item.peerFullName || '').trim() ||
    (item.peerPersonalName || '').trim();
  const subtitleLine = userFullName.length > 0 ? subtitleStripAt(userFullName) : CALLS_LINE_EMPTY;

  return {
    avatarPrimary,
    avatarFallback: null,
    titleBold,
    kindBadge: tr('Smart Card', 'Smart Card'),
    subtitleLine,
    logLine,
  };
}

function callsHistoryRowUi(
  item: CallHistoryRow,
  contact: ContactRow | undefined,
  tr: (es: string, en: string) => string,
): {
  avatarPrimary: string | null;
  avatarFallback: string | null;
  titleBold: string;
  kindBadge: string;
  subtitleLine: string;
  logLine: string;
} {
  if (item.direction === 'outgoing') {
    return callsHistoryOutgoingRowUi(item, contact, tr);
  }
  return callsHistoryIncomingRowUi(item, contact, tr);
}

export default function CallsPage() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
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
          paddingVertical: 12,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'flex-start',
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
          minWidth: 0,
        },
        /** Fila 1: icono + título bold + etiqueta tipo (mitad de tamaño, sin bold) */
        titleRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 6,
        },
        titleTextBlock: {
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 4,
        },
        titleBoldWhite: {
          color: isNight ? '#FFFFFF' : shell.textPrimary,
          fontSize: 16,
          fontWeight: '800',
        },
        /** Smart Card / Negocio — ~50% del tamaño del título, sin negrita */
        cardKindLabel: {
          fontSize: 8,
          fontWeight: '400',
          color: shell.callsOnCardMuted,
        },
        videoKindLabel: {
          fontSize: 8,
          fontWeight: '400',
          color: shell.callsOnCardMuted,
        },
        /** Fila 2: subtítulo (persona / contacto) */
        subtitleLine: {
          marginTop: 6,
          color: shell.callsOnCardSecondary,
          fontSize: 13,
          fontWeight: '600',
        },
        /** Fila 3: solo logs (hora, duración, dirección) */
        callLogLine: {
          marginTop: 5,
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
        actionsRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingLeft: 10,
          marginLeft: 4,
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderLeftColor: shell.callsCardBorder,
          alignSelf: 'center',
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
    [shell, isNight],
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
    let apiBaseLog = '';
    try {
      apiBaseLog = getApiBaseUrl();
    } catch (e) {
      apiBaseLog = `(getApiBaseUrl falló: ${String((e as Error)?.message || e)})`;
    }
    if (__DEV__) {
      console.log('[Calls][loadData] inicio', {
        silent,
        apiBaseUrl: apiBaseLog,
        hint: 'Historial: GET /api/qr/calls/history (misma base que ves en el error del Alert)',
      });
    }
    try {
      if (!silent) {
        setLoading(true);
      }
      const uid = await getActiveUserId();
      if (!uid) {
        if (__DEV__) {
          console.warn('[Calls][loadData] sin uid — no se llama al backend');
        }
        setHistory([]);
        setContacts([]);
        return;
      }

      let historyRows: CallHistoryRow[] = [];
      try {
        if (__DEV__) {
          console.log('[Calls][loadData] listCallsHistory →', {
            endpoint: `${apiBaseLog}/api/qr/calls/history`,
            uidPrefix: `${uid.slice(0, 6)}…`,
          });
        }
        const historyResponse = await listCallsHistory({ uid });
        historyRows = historyResponse.history;
        if (__DEV__) {
          console.log('[Calls][loadData] listCallsHistory OK', { filas: historyRows.length });
        }
      } catch (error: any) {
        if (__DEV__) {
          console.warn('[Calls][loadData] listCallsHistory ERROR', {
            message: String(error?.message || ''),
            apiBaseUrl: apiBaseLog,
          });
          try {
            logBackendNetworkDebug('CallsPage:listCallsHistory', error, getApiBaseUrl());
          } catch {
            logBackendNetworkDebug('CallsPage:listCallsHistory', error, apiBaseLog);
          }
        }
        Alert.alert(
          tr('No se pudo cargar Calls', 'Could not load Calls'),
          userFacingAlertMessage(error, language, tr('Intenta de nuevo.', 'Try again.')),
        );
        setHistory([]);
        setContacts([]);
        return;
      }

      setHistory(historyRows);

      try {
        if (__DEV__) {
          console.log('[Calls][loadData] listReceivedContacts →', { apiBaseUrl: apiBaseLog });
        }
        const contactsResponse = await listReceivedContacts({ uid });
        setContacts(
          contactsResponse.contacts.map((row) => {
            const sid = row.sid != null && String(row.sid).trim() ? String(row.sid).trim() : null;
            const bId = row.bId != null && String(row.bId).trim() ? String(row.bId).trim() : null;
            return {
              linkKey: receivedContactMergeKey({ uid: row.uid, sid, bId }),
              uid: row.uid,
              sid,
              bId,
              userFullName: row.userFullName,
              userNickName: row.userNickName,
              userAvatarUrl: row.userAvatarUrl,
              cardName: row.cardName,
              bcContactName:
                row.bcContactName != null && String(row.bcContactName).trim()
                  ? String(row.bcContactName).trim()
                  : null,
              holdersCount: row.holdersCount,
              ratingAvg: row.ratingAvg,
              storyState: row.storyState,
              cardType: row.cardType === 'business' ? 'business' : row.cardType === 'smart' ? 'smart' : undefined,
            };
          }),
        );
        if (__DEV__) {
          console.log('[Calls][loadData] listReceivedContacts OK', {
            contactos: contactsResponse.contacts.length,
          });
        }
      } catch (contactErr: any) {
        if (__DEV__) {
          console.warn('[Calls][loadData] listReceivedContacts ERROR (se deja historial)', {
            message: String(contactErr?.message || ''),
          });
          try {
            logBackendNetworkDebug('CallsPage:listReceivedContacts', contactErr, getApiBaseUrl());
          } catch {
            logBackendNetworkDebug('CallsPage:listReceivedContacts', contactErr, apiBaseLog);
          }
        }
        setContacts([]);
      }
    } catch (error: any) {
      if (__DEV__) {
        console.warn('[Calls][loadData] error general', { message: String(error?.message || '') });
        try {
          logBackendNetworkDebug('CallsPage:loadData(outer)', error, getApiBaseUrl());
        } catch {
          logBackendNetworkDebug('CallsPage:loadData(outer)', error, apiBaseLog);
        }
      }
      Alert.alert(
        tr('No se pudo cargar Calls', 'Could not load Calls'),
        userFacingAlertMessage(error, language, tr('Intenta de nuevo.', 'Try again.')),
      );
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
    const ui = callsHistoryRowUi(item, contact, tr);
    const avatarUri =
      toRenderableImageUri(ui.avatarPrimary) ?? toRenderableImageUri(ui.avatarFallback ?? null);
    const ringExtra =
      item.storyState === 'vip'
        ? { borderWidth: 2.2 as const, borderColor: shell.ctaAccent }
        : item.storyState === 'normal'
          ? { borderWidth: 2 as const, borderColor: shell.success }
          : styles.avatarRingNone;
    const biz = isCallsHistoryBusinessRow(item);
    const snap = item.issuerSnapshot;
    const peerNicknameSlug =
      item.peerFullName.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
    const bizLogo =
      callsHistoryNonEmptyUrl(item.bcLogoUrl) ?? callsHistoryNonEmptyUrl(snap?.bcLogoUrl ?? undefined);
    /** `bizName` PURO: mirror de slot 2 en lista (`item.bcName` → `item.displayCardName`). Sin caer a `peerFullName`. */
    const bizName =
      (item.bcName != null && String(item.bcName).trim() ? String(item.bcName).trim() : '') ||
      (item.displayCardName || '').trim() ||
      null;
    const bizTitle = (bizName || item.displayCardName || '').trim() || null;
    const smartCardTitle =
      (item.scName != null && String(item.scName).trim() ? String(item.scName).trim() : '') ||
      (item.cardName != null && String(item.cardName).trim() ? String(item.cardName).trim() : '') ||
      item.sourceCardName ||
      tr('Tarjeta Social', 'Social Card');
    const smartPeerFull = (item.peerFullName || '').trim() || undefined;
    const bizCardContact = (item.bcContactName || '').trim() || null;
    const contactBcForRow =
      biz &&
      item.direction === 'outgoing' &&
      contact?.cardType === 'business' &&
      item.sourceBId &&
      contact.bId === item.sourceBId
        ? (contact.bcContactName != null && String(contact.bcContactName).trim()
            ? String(contact.bcContactName).trim()
            : null)
        : null;

    /**
     * `CallDisplayCard` canónico emitido por el backend (paso 13 del rebuild).
     * Cuando está presente, es la fuente de verdad para avatar/título/subtítulo
     * que se pasa al `ActionController` → `GhostLinkCallProvider`. El cálculo
     * viejo queda como fallback para backends pre-rollout.
     */
    const display = item.display;
    const displayPhoto = display?.displayPhoto ? String(display.displayPhoto).trim() || null : null;
    const displayTitle = display?.displayTitle ? String(display.displayTitle).trim() : '';
    const displaySubtitle = display?.displaySubtitle ? String(display.displaySubtitle).trim() || null : null;
    const displayIsBusiness = display?.cardType === 'business';

    const incomingLikeRow = item.direction === 'incoming' || item.direction === 'missed';
    const imperativeBase = {
      targetUid: item.peerUid,
      sourceSid: item.sourceSid,
      sourceBId: item.sourceBId,
      sourceCardName: item.sourceCardName || tr('Tarjeta Social', 'Social Card'),
      cardPhoto: biz
        ? incomingLikeRow
          ? bizLogo ?? callsHistoryNonEmptyUrl(snap?.bcLogoUrl ?? undefined) ?? null
          : displayPhoto ?? bizLogo ?? null
        : displayPhoto ??
          callsHistoryNonEmptyUrl(item.userAvatarUrl) ??
          callsHistoryNonEmptyUrl(snap?.userAvatarUrl ?? undefined) ??
          null,
      cardType: biz ? ('business' as const) : ('personal' as const),
      peerName: biz
        ? (displayIsBusiness && displayTitle ? displayTitle : bizTitle || item.displayCardName || tr('Negocio', 'Business'))
        : (!displayIsBusiness && displayTitle ? displayTitle : smartCardTitle),
      peerFullName: biz
        ? (displaySubtitle || undefined)
        : (displayTitle || '').trim() || smartPeerFull,
      peerNickname: biz ? peerNicknameSlug : (contact?.userNickName || '').trim() || peerNicknameSlug,
      peerPhotoUrl: biz
        ? incomingLikeRow
          ? displayPhoto ??
            callsHistoryNonEmptyUrl(item.userAvatarUrl) ??
            callsHistoryNonEmptyUrl(snap?.userAvatarUrl ?? undefined) ??
            bizLogo ??
            null
          : displayPhoto ?? bizLogo ?? null
        : displayPhoto ??
          callsHistoryNonEmptyUrl(item.userAvatarUrl) ??
          callsHistoryNonEmptyUrl(snap?.userAvatarUrl ?? undefined) ??
          contact?.userAvatarUrl ??
          null,
      /**
       * Business: logo de marca (`bcLogoUrl`); en entrante `display.displayPhoto` es el caller — no mezclar.
       */
      bcLogoUrl: biz ? bizLogo ?? callsHistoryNonEmptyUrl(snap?.bcLogoUrl ?? undefined) ?? null : null,
      bcName: biz ? (displayTitle || bizName || null) : null,
      bcContactName: biz
        ? item.direction === 'outgoing'
          ? bizCardContact || contactBcForRow || null
          : null
        : null,
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
        {/* (1) Imagen */}
        <View style={[styles.avatarRingBase, ringExtra]}>
          {avatarUri ? (
            <ExpoImage
              source={{ uri: avatarUri }}
              style={styles.avatar}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={100}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <MaterialCommunityIcons name="account" size={18} color={shell.iconColor} />
            </View>
          )}
        </View>

        <View style={styles.rowMain}>
          {/* (2) Título: bold `cardTitleBold` + tipo `cardKindSmall` (+ vídeo si aplica) */}
          <View style={styles.titleRow}>
            <MaterialCommunityIcons
              name={
                item.status === 'missed' || item.status === 'rejected'
                  ? 'phone-missed'
                  : item.direction === 'outgoing'
                    ? 'phone-outgoing'
                    : 'phone-incoming'
              }
              size={16}
              color={
                item.status === 'missed' || item.status === 'rejected'
                  ? '#E53935'
                  : item.direction === 'outgoing'
                    ? '#2196F3'
                    : '#4CAF50'
              }
              style={{ marginTop: 2 }}
            />
            <View style={styles.titleTextBlock}>
              <Text style={styles.titleBoldWhite} numberOfLines={2}>
                {ui.titleBold}
              </Text>
              {ui.kindBadge ? <Text style={styles.cardKindLabel}>{ui.kindBadge}</Text> : null}
              {item.callType === 'video' ? (
                <Text style={styles.videoKindLabel}>{` · ${tr('Vídeo', 'Video')}`}</Text>
              ) : null}
            </View>
          </View>
          {/* (3) Subtítulo */}
          <Text style={styles.subtitleLine} numberOfLines={2}>
            {ui.subtitleLine}
          </Text>
          {/* (4) Logs (dirección · hora · duración) */}
          {ui.logLine ? (
            <Text style={styles.callLogLine} numberOfLines={2}>
              {ui.logLine}
            </Text>
          ) : null}
        </View>

        <View style={styles.actionsRow}>
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
  const detailUi = selectedCall ? callsHistoryRowUi(selectedCall, selectedContact || undefined, tr) : null;
  const detailAvatarUri =
    detailUi != null
      ? toRenderableImageUri(detailUi.avatarPrimary) ?? toRenderableImageUri(detailUi.avatarFallback ?? null)
      : null;

  return (
    <LinearGradient colors={[...shell.callsShellGradient]} style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{tr('Llamadas', 'Calls')}</Text>
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

            {/* (1) Imagen — modal detalle */}
            {detailAvatarUri ? (
              <ExpoImage
                source={{ uri: detailAvatarUri }}
                style={styles.detailAvatar}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={styles.detailAvatarFallback}>
                <MaterialCommunityIcons name="account" size={20} color={shell.iconColor} />
              </View>
            )}

            {selectedCall && detailUi ? (
              <>
                {/* (2) Título + tipo — modal */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'baseline', gap: 6 }}>
                  <Text style={styles.detailName}>{detailUi.titleBold}</Text>
                  <Text style={styles.detailCardName}>{detailUi.kindBadge}</Text>
                </View>
                {/* (3) Subtítulo — modal */}
                <Text style={styles.detailNick}>{detailUi.subtitleLine}</Text>
                {/* (4) Logs — modal */}
                {detailUi.logLine ? <Text style={styles.detailLogLine}>{detailUi.logLine}</Text> : null}
              </>
            ) : null}
            <Text style={styles.detailStats}>
              Rating {Number(selectedContact?.ratingAvg || 0).toFixed(1)} | {selectedContact?.holdersCount || 0} poseedores
            </Text>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}
