import { getActiveUserId } from '@/services/authSession';
import { requestGhostLinkCallImperative } from '@/services/GhostLinkCallProvider';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import appPalette from '../theme';
import {
    type CallHistoryRow,
    createCallLog,
    listCallsHistory,
    listReceivedContacts,
    patchCallLogMeta,
} from '@/services/qrApi';
import { receivedContactMergeKey } from '@/services/receivedContactsPresentationMerge';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Pressable,
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
  name: string;
  nickname: string;
  photoUrl: string | null;
  cardName: string;
  holdersCount: number;
  ratingAvg: number;
  storyState: 'none' | 'normal' | 'vip';
};

const QUICK_TAGS = ['Interesado', 'Llamar luego', 'Cerrado'];

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
          justifyContent: 'space-between',
        },
        title: {
          color: shell.textPrimary,
          fontSize: 25,
          fontFamily: 'Georgia',
          fontWeight: '800',
        },
        registerBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: shell.headerBtnBg,
          borderRadius: 999,
          paddingVertical: 8,
          paddingHorizontal: 12,
        },
        registerBtnText: {
          color: shell.btnPrimaryText,
          fontSize: 12,
          fontWeight: '700',
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
        },
        nickText: {
          marginTop: 1,
          color: shell.textSecondary,
          fontSize: 12,
          fontWeight: '700',
        },
        cardHintText: {
          marginTop: 2,
          color: shell.textMuted,
          fontSize: 11,
        },
        callChannelText: {
          marginTop: 2,
          color: shell.textChannel,
          fontSize: 10,
          fontWeight: '700',
        },
        tagRow: {
          marginTop: 7,
          flexDirection: 'row',
          gap: 6,
        },
        tagChip: {
          borderRadius: 999,
          borderWidth: 1,
          borderColor: shell.pillBorder,
          backgroundColor: shell.pillBg,
          paddingHorizontal: 8,
          paddingVertical: 4,
        },
        tagChipText: {
          fontSize: 10,
          color: shell.pillText,
          fontWeight: '700',
        },
        voiceBtn: {
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: shell.voiceBtnBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        emptyText: {
          marginTop: 48,
          textAlign: 'center',
          color: shell.textSecondary,
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
          color: shell.textSecondary,
          fontSize: 13,
          fontWeight: '700',
        },
        detailCardName: {
          marginTop: 6,
          color: shell.textMuted,
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
          color: shell.textSecondary,
          fontSize: 11,
          textAlign: 'center',
        },
        registerCard: {
          width: '100%',
          maxHeight: '80%',
          borderRadius: 18,
          backgroundColor: shell.modalBg,
          borderWidth: 1,
          borderColor: shell.modalBorder,
          padding: 14,
        },
        registerTitle: {
          color: shell.textPrimary,
          fontSize: 17,
          fontWeight: '800',
        },
        registerStep: {
          marginTop: 12,
          marginBottom: 6,
          color: shell.textSecondary,
          fontSize: 12,
          fontWeight: '700',
        },
        optionWrap: {
          gap: 7,
        },
        optionBtn: {
          borderRadius: 12,
          borderWidth: 1,
          borderColor: shell.modalRowBorder,
          backgroundColor: shell.modalRowBg,
          paddingVertical: 9,
          paddingHorizontal: 10,
        },
        optionText: {
          color: shell.textPrimary,
          fontSize: 12,
          fontWeight: '700',
        },
        inlineRow: {
          flexDirection: 'row',
          gap: 8,
        },
        inlineBtn: {
          borderRadius: 999,
          borderWidth: 1,
          borderColor: shell.modalRowBorder,
          backgroundColor: shell.modalRowBg,
          paddingHorizontal: 10,
          paddingVertical: 7,
        },
        inlineBtnText: {
          color: shell.textPrimary,
          fontSize: 11,
          fontWeight: '700',
        },
        footerBtns: {
          marginTop: 16,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: 8,
        },
        cancelBtn: {
          borderRadius: 10,
          borderWidth: 1,
          borderColor: shell.modalRowBorder,
          paddingHorizontal: 12,
          paddingVertical: 8,
        },
        cancelBtnText: {
          color: shell.textSecondary,
          fontSize: 12,
          fontWeight: '700',
        },
        saveBtn: {
          borderRadius: 10,
          backgroundColor: shell.headerBtnBg,
          paddingHorizontal: 12,
          paddingVertical: 8,
        },
        saveBtnText: {
          color: shell.btnPrimaryText,
          fontSize: 12,
          fontWeight: '700',
        },
      }),
    [shell],
  );

  const [loading, setLoading] = useState(true);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ownerUid, setOwnerUid] = useState('');
  const [history, setHistory] = useState<CallHistoryRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [selectedCall, setSelectedCall] = useState<(CallHistoryRow & { count?: number; allCalls?: CallHistoryRow[] }) | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [registerVisible, setRegisterVisible] = useState(false);

  const [newPeerLinkKey, setNewPeerLinkKey] = useState('');
  const [newDirection, setNewDirection] = useState<'incoming' | 'outgoing' | 'missed'>('incoming');
  const [newStatus, setNewStatus] = useState<'completed' | 'missed' | 'rejected'>('completed');

  const contactByUid = useMemo(() => {
    const map = new Map<string, ContactRow>();
    contacts.forEach((row) => {
      if (!map.has(row.uid)) {
        map.set(row.uid, row);
      }
    });
    return map;
  }, [contacts]);

  type GroupedCall = CallHistoryRow & { count: number; allCalls: CallHistoryRow[] };

  const groupedHistory = useMemo<GroupedCall[]>(() => {
    if (history.length === 0) return [];
    const groups: GroupedCall[] = [];
    for (const call of history) {
      const last = groups[groups.length - 1];
      if (last && last.peerUid === call.peerUid && last.direction === call.direction) {
        last.count += 1;
        last.allCalls.push(call);
        last.durationSec += call.durationSec;
      } else {
        groups.push({ ...call, count: 1, allCalls: [call] });
      }
    }
    return groups;
  }, [history]);

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
        setOwnerUid('');
        return;
      }

      setOwnerUid(uid);
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
            name: row.name,
            nickname: row.nickname,
            photoUrl: row.photoUrl,
            cardName: row.cardName,
            holdersCount: row.holdersCount,
            ratingAvg: row.ratingAvg,
            storyState: row.storyState,
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

  const assignTag = async (row: CallHistoryRow, tag: string) => {
    try {
      if (!ownerUid) {
        return;
      }
      setSaving(true);
      await patchCallLogMeta({ ownerUid, callId: row.callId, tags: [tag] });
      setHistory((prev) => prev.map((item) => (item.callId === row.callId ? { ...item, tags: [tag] } : item)));
      if (selectedCall?.callId === row.callId) {
        setSelectedCall((prev) => (prev ? { ...prev, tags: [tag] } : prev));
      }
    } catch (error: any) {
      Alert.alert(tr('No se pudo guardar etiqueta', 'Could not save tag'), error?.message || tr('Intenta otra vez.', 'Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const attachVoiceNote = async (row: CallHistoryRow) => {
    try {
      if (!ownerUid) {
        return;
      }

      const picked = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.length) {
        return;
      }

      const asset = picked.assets[0];
      setSaving(true);
      await patchCallLogMeta({
        ownerUid,
        callId: row.callId,
        voiceNoteUri: asset.uri,
        voiceNoteName: asset.name || 'voice-note',
      });

      setHistory((prev) =>
        prev.map((item) =>
          item.callId === row.callId
            ? { ...item, voiceNoteUri: asset.uri, voiceNoteName: asset.name || 'voice-note' }
            : item
        )
      );
      if (selectedCall?.callId === row.callId) {
        setSelectedCall((prev) =>
          prev ? { ...prev, voiceNoteUri: asset.uri, voiceNoteName: asset.name || 'voice-note' } : prev
        );
      }
    } catch (error: any) {
      Alert.alert(tr('Nota de voz no guardada', 'Voice note not saved'), error?.message || tr('No se pudo adjuntar audio.', 'Could not attach audio.'));
    } finally {
      setSaving(false);
    }
  };

  const registerCall = async () => {
    try {
      if (!ownerUid) {
        return;
      }
      if (!newPeerLinkKey) {
        Alert.alert(tr('Contacto requerido', 'Contact required'), tr('Selecciona un contacto para registrar la llamada.', 'Select a contact to register the call.'));
        return;
      }

      const picked = contacts.find((row) => row.linkKey === newPeerLinkKey);
      if (!picked) {
        Alert.alert(tr('Contacto requerido', 'Contact required'), tr('Selecciona un contacto para registrar la llamada.', 'Select a contact to register the call.'));
        return;
      }

      setSaving(true);
      await createCallLog({
        ownerUid,
        peerUid: picked.uid,
        direction: newDirection,
        status: newStatus,
        durationSec: newStatus === 'completed' ? 42 : 0,
        sourceCardName: picked.cardName || 'Tarjeta Social',
        sourceCardId: picked.cardId,
        callChannel: 'ghost-link-voip',
      });

      setRegisterVisible(false);
      setNewPeerLinkKey('');
      await loadData({ silent: true });
    } catch (error: any) {
      Alert.alert(tr('No se pudo registrar llamada', 'Could not register call'), error?.message || tr('Intenta nuevamente.', 'Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const renderRow = ({ item }: { item: GroupedCall }) => {
    const ringExtra =
      item.storyState === 'vip'
        ? { borderWidth: 2.2 as const, borderColor: shell.ctaAccent }
        : item.storyState === 'normal'
          ? { borderWidth: 2 as const, borderColor: shell.success }
          : styles.avatarRingNone;
    const contact = contactByUid.get(item.peerUid) || null;

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
          {item.photoUrl ? (
            <ExpoImage source={{ uri: item.photoUrl }} style={styles.avatar} cachePolicy="disk" />
          ) : (
            <View style={styles.avatarFallback}>
              <MaterialCommunityIcons name="account" size={18} color={shell.iconColor} />
            </View>
          )}
        </View>

        <View style={styles.rowMain}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
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
                    ? '#4CAF50'
                    : '#2196F3'
              }
            />
            <Text style={styles.nameText} numberOfLines={1}>{item.name}{item.count > 1 ? ` (${item.count})` : ''}</Text>
            {item.callType === 'video' && <MaterialCommunityIcons name="video" size={13} color="#C8A84E" />}
          </View>
          <Text style={styles.nickText} numberOfLines={1}>@{item.nickname}{item.durationSec > 0 ? ` · ${Math.floor(item.durationSec / 60)}:${String(item.durationSec % 60).padStart(2, '0')}` : ''}</Text>
          <Text style={styles.cardHintText} numberOfLines={1}>{item.sourceCardName || contact?.cardName || tr('Tarjeta de contacto', 'Contact card')}</Text>
          <Text style={styles.callChannelText}>{tr('Canal privado: Ghost-Link VoIP', 'Private channel: Ghost-Link VoIP')}</Text>

          <View style={styles.tagRow}>
            {QUICK_TAGS.map((tag) => {
              const active = item.tags.includes(tag);
              return (
                <TouchableOpacity
                  key={`${item.callId}_${tag}`}
                  style={[
                    styles.tagChip,
                    {
                      backgroundColor: active ? shell.headerBtnBg : shell.pillBg,
                      borderColor: active ? shell.headerBtnBg : shell.pillBorder,
                    },
                  ]}
                  onPress={() => {
                    void assignTag(item, tag);
                  }}
                  disabled={saving}
                >
                  <Text style={[styles.tagChipText, { color: active ? shell.btnPrimaryText : shell.pillText }]}>{tag}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            style={[styles.voiceBtn, { backgroundColor: '#1B6B3A' }]}
            onPress={() => {
              requestGhostLinkCallImperative({
                targetUid: item.peerUid,
                sourceCardId: item.sourceCardId,
                sourceCardName: item.sourceCardName || tr('Tarjeta Social', 'Social Card'),
                cardPhoto: item.photoUrl,
                cardType: 'personal',
                peerName: item.name,
                peerNickname: item.nickname,
                peerPhotoUrl: item.photoUrl,
              });
            }}
            accessibilityLabel={tr('Rellamar', 'Call back')}
          >
            <MaterialCommunityIcons name="phone" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.voiceBtn, { backgroundColor: '#C8A84E' }]}
            onPress={() => {
              requestGhostLinkCallImperative({
                targetUid: item.peerUid,
                sourceCardId: item.sourceCardId,
                sourceCardName: item.sourceCardName || tr('Tarjeta Social', 'Social Card'),
                cardPhoto: item.photoUrl,
                cardType: 'personal',
                callType: 'video',
                peerName: item.name,
                peerNickname: item.nickname,
                peerPhotoUrl: item.photoUrl,
              });
            }}
            accessibilityLabel={tr('FaceCall', 'FaceCall')}
          >
            <MaterialCommunityIcons name="video" size={16} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.voiceBtn}
            onPress={() => {
              void attachVoiceNote(item);
            }}
            disabled={saving}
          >
            <MaterialCommunityIcons name="microphone-outline" size={18} color={shell.btnPrimaryText} />
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
        <TouchableOpacity style={styles.registerBtn} onPress={() => setRegisterVisible(true)}>
          <MaterialCommunityIcons name="plus" size={15} color={shell.btnPrimaryText} />
          <Text style={styles.registerBtnText}>Registrar</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={shell.loaderAccent} />
        </View>
      ) : (
        <FlatList
          data={groupedHistory}
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

            {selectedCall?.photoUrl ? (
              <ExpoImage source={{ uri: selectedCall.photoUrl }} style={styles.detailAvatar} cachePolicy="disk" />
            ) : (
              <View style={styles.detailAvatarFallback}>
                <MaterialCommunityIcons name="account" size={20} color={shell.iconColor} />
              </View>
            )}

            <Text style={styles.detailName}>{selectedCall?.name || ''}{(selectedCall?.count ?? 0) > 1 ? ` (${selectedCall?.count})` : ''}</Text>
            <Text style={styles.detailNick}>@{selectedCall?.nickname || ''}</Text>
            <Text style={styles.detailCardName}>{selectedCall?.sourceCardName || selectedContact?.cardName || tr('Tarjeta social', 'Social card')}</Text>
            <Text style={styles.detailStats}>
              Rating {Number(selectedContact?.ratingAvg || 0).toFixed(1)} | {selectedContact?.holdersCount || 0} poseedores
            </Text>

            {(selectedCall?.allCalls?.length ?? 0) > 1 && (
              <View style={{ width: '100%', marginTop: 10, gap: 6 }}>
                <Text style={[styles.detailMeta, { fontWeight: '600', marginBottom: 2 }]}>{tr('Detalle del grupo:', 'Group detail:')}</Text>
                {selectedCall!.allCalls!.map((sub) => {
                  const ts = sub.createdAt ? new Date(sub.createdAt) : null;
                  const timeStr = ts ? ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  const dur = sub.durationSec > 0 ? `${Math.floor(sub.durationSec / 60)}:${String(sub.durationSec % 60).padStart(2, '0')}` : '';
                  return (
                    <View key={sub.callId} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialCommunityIcons
                        name={sub.status === 'missed' || sub.status === 'rejected' ? 'phone-missed' : sub.direction === 'outgoing' ? 'phone-outgoing' : 'phone-incoming'}
                        size={13}
                        color={sub.status === 'missed' || sub.status === 'rejected' ? '#E53935' : sub.direction === 'outgoing' ? '#4CAF50' : '#2196F3'}
                      />
                      <Text style={[styles.detailMeta, { flex: 1 }]}>{timeStr}{dur ? ` · ${dur}` : ''} — {sub.status}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={[styles.detailMeta, { marginTop: 8 }]}>{tr('Ultima nota de voz:', 'Last voice note:')} {selectedCall?.voiceNoteName || tr('Ninguna', 'None')}</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={registerVisible} transparent animationType="slide" onRequestClose={() => setRegisterVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setRegisterVisible(false)}>
          <Pressable style={styles.registerCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.registerTitle}>Registrar llamada</Text>

            <Text style={[styles.registerStep, { color: shell.iconColor }]}>Contacto</Text>
            <View style={styles.optionWrap}>
              {contacts.map((contact) => (
                <TouchableOpacity
                  key={contact.linkKey}
                  style={[
                    styles.optionBtn,
                    {
                      backgroundColor: newPeerLinkKey === contact.linkKey ? shell.headerBtnBg : shell.modalRowBg,
                      borderColor: newPeerLinkKey === contact.linkKey ? shell.headerBtnBg : shell.modalRowBorder,
                    },
                  ]}
                  onPress={() => setNewPeerLinkKey(contact.linkKey)}
                >
                  <Text style={[styles.optionText, { color: newPeerLinkKey === contact.linkKey ? shell.btnPrimaryText : shell.iconColor }]}>
                    {contact.name}
                    {contact.cardName ? ` · ${contact.cardName}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.registerStep, { color: shell.iconColor }]}>Direccion</Text>
            <View style={styles.inlineRow}>
              {(['incoming', 'outgoing', 'missed'] as const).map((direction) => (
                <TouchableOpacity
                  key={direction}
                  style={[
                    styles.inlineBtn,
                    {
                      backgroundColor: newDirection === direction ? shell.headerBtnBg : shell.modalRowBg,
                      borderColor: newDirection === direction ? shell.headerBtnBg : shell.modalRowBorder,
                    },
                  ]}
                  onPress={() => setNewDirection(direction)}
                >
                  <Text style={[styles.inlineBtnText, { color: newDirection === direction ? shell.btnPrimaryText : shell.iconColor }]}>{direction}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.registerStep, { color: shell.iconColor }]}>Estado</Text>
            <View style={styles.inlineRow}>
              {(['completed', 'missed', 'rejected'] as const).map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.inlineBtn,
                    {
                      backgroundColor: newStatus === status ? shell.headerBtnBg : shell.modalRowBg,
                      borderColor: newStatus === status ? shell.headerBtnBg : shell.modalRowBorder,
                    },
                  ]}
                  onPress={() => setNewStatus(status)}
                >
                  <Text style={[styles.inlineBtnText, { color: newStatus === status ? shell.btnPrimaryText : shell.iconColor }]}>{status}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.footerBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: shell.modalRowBorder }]} onPress={() => setRegisterVisible(false)}>
                <Text style={[styles.cancelBtnText, { color: shell.iconColor }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={() => { void registerCall(); }} disabled={saving}>
                <Text style={styles.saveBtnText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}