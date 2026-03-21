import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { getActiveUserId } from '@/services/authSession';
import {
  type CallHistoryRow,
  createCallLog,
  listCallsHistory,
  listReceivedContacts,
  patchCallLogMeta,
} from '@/services/qrApi';

type ContactRow = {
  uid: string;
  name: string;
  nickname: string;
  photoUrl: string | null;
  cardName: string;
  holdersCount: number;
  ratingAvg: number;
  storyState: 'none' | 'normal' | 'vip';
};

const STORY_RING_NORMAL = '#2ECC71';
const STORY_RING_VIP = '#C5A065';
const QUICK_TAGS = ['Interesado', 'Llamar luego', 'Cerrado'];

export default function CallsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ownerUid, setOwnerUid] = useState('');
  const [history, setHistory] = useState<CallHistoryRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [selectedCall, setSelectedCall] = useState<CallHistoryRow | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [registerVisible, setRegisterVisible] = useState(false);

  const [newPeerUid, setNewPeerUid] = useState('');
  const [newDirection, setNewDirection] = useState<'incoming' | 'outgoing' | 'missed'>('incoming');
  const [newStatus, setNewStatus] = useState<'completed' | 'missed' | 'rejected'>('completed');

  const contactByUid = useMemo(() => {
    const map = new Map<string, ContactRow>();
    contacts.forEach((row) => map.set(row.uid, row));
    return map;
  }, [contacts]);

  const loadData = async () => {
    try {
      setLoading(true);
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
        contactsResponse.contacts.map((row) => ({
          uid: row.uid,
          name: row.name,
          nickname: row.nickname,
          photoUrl: row.photoUrl,
          cardName: row.cardName,
          holdersCount: row.holdersCount,
          ratingAvg: row.ratingAvg,
          storyState: row.storyState,
        }))
      );
    } catch (error: any) {
      Alert.alert('No se pudo cargar Calls', error?.message || 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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
      Alert.alert('No se pudo guardar etiqueta', error?.message || 'Intenta otra vez.');
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
      Alert.alert('Nota de voz no guardada', error?.message || 'No se pudo adjuntar audio.');
    } finally {
      setSaving(false);
    }
  };

  const registerCall = async () => {
    try {
      if (!ownerUid) {
        return;
      }
      if (!newPeerUid) {
        Alert.alert('Contacto requerido', 'Selecciona un contacto para registrar la llamada.');
        return;
      }

      setSaving(true);
      await createCallLog({
        ownerUid,
        peerUid: newPeerUid,
        direction: newDirection,
        status: newStatus,
        durationSec: newStatus === 'completed' ? 42 : 0,
        sourceCardName: contacts.find((row) => row.uid === newPeerUid)?.cardName || 'Tarjeta Social',
        sourceCardId: null,
        callChannel: 'ghost-link-voip',
      });

      setRegisterVisible(false);
      setNewPeerUid('');
      await loadData();
    } catch (error: any) {
      Alert.alert('No se pudo registrar llamada', error?.message || 'Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const renderRow = ({ item }: { item: CallHistoryRow }) => {
    const ringStyle =
      item.storyState === 'vip'
        ? styles.avatarRingVip
        : item.storyState === 'normal'
          ? styles.avatarRingNormal
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
        <View style={[styles.avatarRingBase, ringStyle]}>
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <MaterialCommunityIcons name="account" size={18} color="#0D4D8A" />
            </View>
          )}
        </View>

        <View style={styles.rowMain}>
          <Text style={styles.nameText} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.nickText} numberOfLines={1}>@{item.nickname}</Text>
          <Text style={styles.cardHintText} numberOfLines={1}>{item.sourceCardName || contact?.cardName || 'Tarjeta de contacto'}</Text>
          <Text style={styles.callChannelText}>Canal privado: Ghost-Link VoIP</Text>

          <View style={styles.tagRow}>
            {QUICK_TAGS.map((tag) => {
              const active = item.tags.includes(tag);
              return (
                <TouchableOpacity
                  key={`${item.callId}_${tag}`}
                  style={[styles.tagChip, active && styles.tagChipActive]}
                  onPress={() => {
                    void assignTag(item, tag);
                  }}
                  disabled={saving}
                >
                  <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>{tag}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={styles.voiceBtn}
          onPress={() => {
            void attachVoiceNote(item);
          }}
          disabled={saving}
        >
          <MaterialCommunityIcons name="microphone-outline" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const selectedContact = selectedCall ? contactByUid.get(selectedCall.peerUid) || null : null;

  return (
    <LinearGradient colors={['#F8FCFF', '#EAF7FF', '#DDF2FF']} style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Calls</Text>
        <TouchableOpacity style={styles.registerBtn} onPress={() => setRegisterVisible(true)}>
          <MaterialCommunityIcons name="plus" size={15} color="#FFFFFF" />
          <Text style={styles.registerBtnText}>Registrar</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#0D4D8A" />
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.callId}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={() => {
            void loadData();
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>Aun no hay llamadas registradas.</Text>}
        />
      )}

      <Modal visible={detailVisible} transparent animationType="fade" onRequestClose={() => setDetailVisible(false)}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.detailCard}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setDetailVisible(false)}>
              <MaterialCommunityIcons name="close" size={20} color="#0D4D8A" />
            </TouchableOpacity>

            {selectedCall?.photoUrl ? (
              <Image source={{ uri: selectedCall.photoUrl }} style={styles.detailAvatar} />
            ) : (
              <View style={styles.detailAvatarFallback}>
                <MaterialCommunityIcons name="account" size={20} color="#0D4D8A" />
              </View>
            )}

            <Text style={styles.detailName}>{selectedCall?.name || ''}</Text>
            <Text style={styles.detailNick}>@{selectedCall?.nickname || ''}</Text>
            <Text style={styles.detailCardName}>{selectedCall?.sourceCardName || selectedContact?.cardName || 'Tarjeta social'}</Text>
            <Text style={styles.detailStats}>
              Rating {Number(selectedContact?.ratingAvg || 0).toFixed(1)} | {selectedContact?.holdersCount || 0} poseedores
            </Text>
            <Text style={styles.detailMeta}>Ultima nota de voz: {selectedCall?.voiceNoteName || 'Ninguna'}</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={registerVisible} transparent animationType="slide" onRequestClose={() => setRegisterVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setRegisterVisible(false)}>
          <Pressable style={styles.registerCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.registerTitle}>Registrar llamada</Text>

            <Text style={styles.registerStep}>Contacto</Text>
            <View style={styles.optionWrap}>
              {contacts.map((contact) => (
                <TouchableOpacity
                  key={contact.uid}
                  style={[styles.optionBtn, newPeerUid === contact.uid && styles.optionBtnActive]}
                  onPress={() => setNewPeerUid(contact.uid)}
                >
                  <Text style={styles.optionText}>{contact.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.registerStep}>Direccion</Text>
            <View style={styles.inlineRow}>
              {(['incoming', 'outgoing', 'missed'] as const).map((direction) => (
                <TouchableOpacity
                  key={direction}
                  style={[styles.inlineBtn, newDirection === direction && styles.inlineBtnActive]}
                  onPress={() => setNewDirection(direction)}
                >
                  <Text style={styles.inlineBtnText}>{direction}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.registerStep}>Estado</Text>
            <View style={styles.inlineRow}>
              {(['completed', 'missed', 'rejected'] as const).map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[styles.inlineBtn, newStatus === status && styles.inlineBtnActive]}
                  onPress={() => setNewStatus(status)}
                >
                  <Text style={styles.inlineBtnText}>{status}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.footerBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRegisterVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    marginTop: 16,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#0A2540',
    fontSize: 25,
    fontFamily: 'Georgia',
    fontWeight: '800',
  },
  registerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0D4D8A',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  registerBtnText: {
    color: '#FFFFFF',
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
    borderColor: 'rgba(13,77,138,0.22)',
    backgroundColor: 'rgba(255,255,255,0.92)',
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
    borderColor: 'rgba(13,77,138,0.2)',
  },
  avatarRingNormal: {
    borderWidth: 2,
    borderColor: STORY_RING_NORMAL,
  },
  avatarRingVip: {
    borderWidth: 2.2,
    borderColor: STORY_RING_VIP,
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
    backgroundColor: '#E8F5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: {
    flex: 1,
  },
  nameText: {
    color: '#0A2540',
    fontSize: 15,
    fontWeight: '800',
  },
  nickText: {
    marginTop: 1,
    color: '#2E678E',
    fontSize: 12,
    fontWeight: '700',
  },
  cardHintText: {
    marginTop: 2,
    color: '#4A4A4A',
    fontSize: 11,
  },
  callChannelText: {
    marginTop: 2,
    color: '#4F7FA0',
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
    borderColor: 'rgba(13,77,138,0.27)',
    backgroundColor: '#F2FAFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagChipActive: {
    backgroundColor: '#0D4D8A',
    borderColor: '#0D4D8A',
  },
  tagChipText: {
    fontSize: 10,
    color: '#0D4D8A',
    fontWeight: '700',
  },
  tagChipTextActive: {
    color: '#FFFFFF',
  },
  voiceBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0D4D8A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 48,
    textAlign: 'center',
    color: '#2E668C',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5,20,35,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  detailCard: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.54)',
    backgroundColor: 'rgba(255,255,255,0.72)',
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
    backgroundColor: 'rgba(255,255,255,0.88)',
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
    backgroundColor: '#E8F5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailName: {
    marginTop: 10,
    color: '#0A2540',
    fontSize: 18,
    fontWeight: '800',
  },
  detailNick: {
    marginTop: 2,
    color: '#2E668C',
    fontSize: 13,
    fontWeight: '700',
  },
  detailCardName: {
    marginTop: 6,
    color: '#4A4A4A',
    fontSize: 12,
  },
  detailStats: {
    marginTop: 6,
    color: '#0D4D8A',
    fontSize: 12,
    fontWeight: '700',
  },
  detailMeta: {
    marginTop: 8,
    color: '#2E668C',
    fontSize: 11,
    textAlign: 'center',
  },
  registerCard: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.2)',
    padding: 14,
  },
  registerTitle: {
    color: '#0A2540',
    fontSize: 17,
    fontWeight: '800',
  },
  registerStep: {
    marginTop: 12,
    marginBottom: 6,
    color: '#0D4D8A',
    fontSize: 12,
    fontWeight: '700',
  },
  optionWrap: {
    gap: 7,
  },
  optionBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.22)',
    backgroundColor: '#F4FAFF',
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  optionBtnActive: {
    backgroundColor: '#0D4D8A',
    borderColor: '#0D4D8A',
  },
  optionText: {
    color: '#0D4D8A',
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
    borderColor: 'rgba(13,77,138,0.22)',
    backgroundColor: '#F4FAFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  inlineBtnActive: {
    backgroundColor: '#0D4D8A',
    borderColor: '#0D4D8A',
  },
  inlineBtnText: {
    color: '#0D4D8A',
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
    borderColor: 'rgba(13,77,138,0.28)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: '#0D4D8A',
    fontSize: 12,
    fontWeight: '700',
  },
  saveBtn: {
    borderRadius: 10,
    backgroundColor: '#0D4D8A',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});