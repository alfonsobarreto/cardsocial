import { seedMetaForIncomingCard } from '@/services/bunkerContactMetaSeed';
import { useLanguage } from '@/services/language';
import {
  consumeDynamicQrToken,
  fetchBunkerGroups,
  redeemTemporaryAccessToken,
  trackBunkerGroupUsage,
} from '@/services/qrApi';
import { Picker } from '@react-native-picker/picker';
import { BlurView } from 'expo-blur';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const GOLD = '#d4af37';
const GOLD_BORDER = 'rgba(212, 175, 55, 0.45)';
const OLED = '#000000';

const BASE_GROUPS = ['Random', 'Family', 'Social', 'Work'];

export type BunkerClassificationModalProps = {
  visible: boolean;
  mode: 'universal' | 'dynamic_qr';
  token: string;
  ownerUid: string;
  cardId: string;
  /** Nombre público resuelto (ownerDisplayName); dinámico por emisor. */
  issuerFullName: string;
  receiverUid: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function BunkerClassificationModal({
  visible,
  mode,
  token,
  ownerUid,
  cardId,
  issuerFullName,
  receiverUid,
  onClose,
  onSuccess,
}: BunkerClassificationModalProps) {
  const { language } = useLanguage();
  const [groups, setGroups] = useState<string[]>(BASE_GROUPS);
  const [group, setGroup] = useState('Random');
  const [busy, setBusy] = useState(false);

  const tr = useCallback(
    (es: string, en: string) => (language === 'es' ? es : en),
    [language],
  );

  useEffect(() => {
    if (!visible || !receiverUid) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const g = await fetchBunkerGroups(receiverUid, language);
        if (!cancelled) {
          const list = Array.isArray(g) && g.length > 0 ? g : BASE_GROUPS;
          setGroups(list);
          setGroup((prev) => (list.includes(prev) ? prev : 'Random'));
        }
      } catch {
        if (!cancelled) {
          setGroups(BASE_GROUPS);
          setGroup((prev) => (BASE_GROUPS.includes(prev) ? prev : 'Random'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, receiverUid, language]);

  const welcome = useMemo(() => {
    const name = issuerFullName.trim() || tr('titular de la tarjeta', 'the card holder');
    if (language === 'es') {
      return `Bienvenido, estás queriendo agregar la tarjeta de ${name}.`;
    }
    return `Welcome, you are looking to add the card of ${name}.`;
  }, [issuerFullName, language, tr]);

  const handleAdd = async () => {
    if (!receiverUid || !token || !ownerUid || !cardId) {
      return;
    }
    setBusy(true);
    try {
      if (mode === 'universal') {
        await redeemTemporaryAccessToken({ receiverUid, token, locale: language });
      } else {
        await consumeDynamicQrToken({ receiverUid, token, locale: language });
      }
      await seedMetaForIncomingCard({
        issuerUid: ownerUid,
        cardId,
        group,
      });
      try {
        await trackBunkerGroupUsage({ viewerUid: receiverUid, groupName: group, locale: language });
      } catch {
        /* no bloquear alta si el track falla */
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : tr('Intenta de nuevo.', 'Try again.');
      Alert.alert(tr('No se pudo agregar', 'Could not add'), msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.card}>
          <Text style={styles.title}>{tr('Clasificar en el Búnker', 'Classify in the Bunker')}</Text>
          <Text style={styles.welcome}>{welcome}</Text>

          <Text style={styles.label}>{tr('Grupo', 'Group')}</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={group}
              onValueChange={(v) => setGroup(String(v))}
              dropdownIconColor={GOLD}
              style={styles.picker}
              itemStyle={styles.pickerItem}
            >
              {groups.map((g) => (
                <Picker.Item key={g} label={g} value={g} color={GOLD} />
              ))}
            </Picker>
          </View>

          <TouchableOpacity
            style={[styles.btnPrimary, busy && styles.btnDisabled]}
            onPress={() => void handleAdd()}
            disabled={busy}
            activeOpacity={0.88}
          >
            {busy ? (
              <ActivityIndicator color={OLED} />
            ) : (
              <Text style={styles.btnPrimaryText}>{tr('Agregar al Búnker', 'Add to Bunker')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnGhost} onPress={onClose} disabled={busy}>
            <Text style={styles.btnGhostText}>{tr('Cancelar', 'Cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    backgroundColor: OLED,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    padding: 20,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  title: {
    color: GOLD,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  welcome: {
    color: 'rgba(212,175,55,0.92)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
  },
  label: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    borderRadius: 12,
    marginBottom: 18,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
  },
  picker: {
    color: GOLD,
  },
  pickerItem: {
    color: GOLD,
    backgroundColor: OLED,
  },
  btnPrimary: {
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  btnPrimaryText: {
    color: OLED,
    fontWeight: '800',
    fontSize: 15,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnGhostText: {
    color: GOLD,
    fontWeight: '700',
    fontSize: 14,
  },
});
