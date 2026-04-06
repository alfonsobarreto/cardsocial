/**
 * BunkerClassificationModal
 * Dark premium modal shown after a temporary-access token is validated.
 * Lets the user pick a group (Random / Work / Family / Social) and saves the contact.
 *
 * Props:
 *   visible        — controls Modal visibility
 *   ownerUid       — UID of the card owner being added
 *   cardId         — card ID to consume via share_permissions
 *   ownerDisplayName / ownerNickname / ownerPhotoUrl / ownerOccupation — identity
 *   onClose        — called when user dismisses without saving
 *   onSaved        — called after successful save (pass chosen group)
 *   language       — 'es' | 'en'
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const GROUPS = ['Random', 'Work', 'Family', 'Social'] as const;
type Group = (typeof GROUPS)[number];

const GROUP_ICONS: Record<Group, string> = {
  Random: '🎲',
  Work: '💼',
  Family: '🏠',
  Social: '🌐',
};

const GROUP_LABELS_ES: Record<Group, string> = {
  Random: 'Random',
  Work: 'Trabajo',
  Family: 'Familia',
  Social: 'Social',
};

export type BunkerClassificationModalProps = {
  visible: boolean;
  ownerUid: string;
  cardId: string;
  ownerDisplayName: string | null;
  ownerNickname: string | null;
  ownerPhotoUrl: string | null;
  ownerOccupation: string | null;
  cardName: string;
  holdersCount?: number;
  ratingAvg?: number;
  language?: 'es' | 'en';
  onClose: () => void;
  onSaved: (group: string) => void;
  onConsumeToken: (ownerUid: string, cardId: string) => Promise<void>;
};

export default function BunkerClassificationModal({
  visible,
  ownerUid,
  cardId,
  ownerDisplayName,
  ownerNickname,
  ownerPhotoUrl,
  ownerOccupation,
  cardName,
  holdersCount = 0,
  ratingAvg = 5,
  language = 'es',
  onClose,
  onSaved,
  onConsumeToken,
}: BunkerClassificationModalProps) {
  const [selectedGroup, setSelectedGroup] = useState<Group>('Random');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const es = language !== 'en';
  const tr = (spanishText: string, englishText: string) => (es ? spanishText : englishText);

  const displayName = ownerDisplayName || ownerNickname || tr('Contacto', 'Contact');
  const safeRating = Number.isFinite(Number(ratingAvg)) ? Number(ratingAvg).toFixed(1) : '5.0';

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onConsumeToken(ownerUid, cardId);
      onSaved(selectedGroup);
    } catch (e: any) {
      setError(e?.message || tr('Error al guardar. Intenta de nuevo.', 'Failed to save. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <LinearGradient
            colors={['#1c1c1e', '#0f0f10', '#000000']}
            style={styles.sheetInner}
          >
            {/* Handle bar */}
            <View style={styles.handle} />

            {/* Brand header */}
            <View style={styles.brandRow}>
              <Text style={styles.brandText}>Card-Social · </Text>
              <Text style={styles.brandAccent}>{tr('Búnker', 'Bunker')}</Text>
            </View>

            {/* Identity card */}
            <View style={styles.identityCard}>
              <View style={styles.avatarWrap}>
                {ownerPhotoUrl ? (
                  <Image
                    source={{ uri: ownerPhotoUrl }}
                    style={styles.avatar}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>
                      {displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.identityBody}>
                <Text style={styles.identityName} numberOfLines={1}>
                  {displayName}
                </Text>
                {ownerNickname ? (
                  <Text style={styles.identityNick} numberOfLines={1}>
                    @{ownerNickname}
                  </Text>
                ) : null}
                {ownerOccupation ? (
                  <Text style={styles.identityOcc} numberOfLines={1}>
                    {ownerOccupation}
                  </Text>
                ) : null}
              </View>
              <View style={styles.statCol}>
                <Text style={styles.statVal}>⭐ {safeRating}</Text>
                <Text style={styles.statLabel}>{tr('valoración', 'rating')}</Text>
                <Text style={[styles.statVal, { marginTop: 6 }]}>{holdersCount}</Text>
                <Text style={styles.statLabel}>{tr('titulares', 'holders')}</Text>
              </View>
            </View>

            {/* Card pill */}
            <View style={styles.cardPill}>
              <Text style={styles.cardPillText}>📋 {cardName}</Text>
            </View>

            {/* Group selector */}
            <Text style={styles.sectionTitle}>
              {tr('Agregar a grupo', 'Add to group')}
            </Text>
            <View style={styles.groupRow}>
              {GROUPS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.groupBtn, selectedGroup === g && styles.groupBtnActive]}
                  onPress={() => setSelectedGroup(g)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.groupIcon}>{GROUP_ICONS[g]}</Text>
                  <Text style={[styles.groupLabel, selectedGroup === g && styles.groupLabelActive]}>
                    {es ? GROUP_LABELS_ES[g] : g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Error */}
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            {/* Actions */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              activeOpacity={0.85}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {tr('Agregar al Búnker', 'Add to Bunker')}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>{tr('Cancelar', 'Cancel')}</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const GOLD = '#d4af37';
const GOLD_DIM = 'rgba(212,175,55,0.18)';
const GOLD_BORDER = 'rgba(212,175,55,0.35)';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  sheetInner: {
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: GOLD_BORDER,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 18,
  },
  brandText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  brandAccent: {
    color: GOLD,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  avatarWrap: {
    marginRight: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: GOLD,
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: GOLD,
    backgroundColor: 'rgba(212,175,55,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: GOLD,
    fontSize: 22,
    fontWeight: '700',
  },
  identityBody: {
    flex: 1,
  },
  identityName: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  identityNick: {
    color: GOLD,
    fontSize: 13,
    marginBottom: 2,
  },
  identityOcc: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
  },
  statCol: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  statVal: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '700',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  cardPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  cardPillText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  groupRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  groupBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  groupBtnActive: {
    borderColor: GOLD,
    backgroundColor: GOLD_DIM,
  },
  groupIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  groupLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  groupLabelActive: {
    color: GOLD,
  },
  errorText: {
    color: '#ff453a',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  saveBtn: {
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: GOLD,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
});
