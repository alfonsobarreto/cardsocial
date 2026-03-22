import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Share, Alert, SafeAreaView, TextInput, Modal,
} from 'react-native';
import { updateCard } from '../services/api';

const FIELD_LABELS = {
  name: 'Name', jobTitle: 'Job Title', company: 'Company',
  email: 'Email', phone: 'Phone', website: 'Website', bio: 'Bio',
};

const CardDetailScreen = ({ route, navigation }) => {
  const [card, setCard] = useState(route.params.card);
  const [editVisible, setEditVisible] = useState(false);
  const [form, setForm] = useState({ ...card });

  const handleShare = async () => {
    const shareUrl = `https://cardsocial.app/cards/${card.slug}`;
    try {
      await Share.share({ message: `Check out my digital card: ${shareUrl}`, url: shareUrl });
    } catch (_) {}
  };

  const handleUpdate = async () => {
    try {
      const res = await updateCard(card._id, form);
      setCard(res.data.card);
      setEditVisible(false);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Update failed');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Card Preview */}
        <View style={styles.cardPreview}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{card.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{card.name}</Text>
          {card.jobTitle ? <Text style={styles.jobTitle}>{card.jobTitle}</Text> : null}
          {card.company ? <Text style={styles.company}>🏢 {card.company}</Text> : null}
          {card.email ? <Text style={styles.info}>✉️ {card.email}</Text> : null}
          {card.phone ? <Text style={styles.info}>📞 {card.phone}</Text> : null}
          {card.website ? <Text style={styles.info}>🌐 {card.website}</Text> : null}
          {card.bio ? <Text style={styles.bio}>{card.bio}</Text> : null}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{card.viewCount}</Text>
            <Text style={styles.statLabel}>Views</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{card.shareCount}</Text>
            <Text style={styles.statLabel}>Shares</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{card.moderationStatus}</Text>
            <Text style={styles.statLabel}>Status</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <Text style={styles.actionBtnText}>🔗 Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.editBtn]} onPress={() => setEditVisible(true)}>
            <Text style={styles.actionBtnText}>✏️ Edit</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={editVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Card</Text>
            <TouchableOpacity onPress={() => setEditVisible(false)}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {Object.keys(FIELD_LABELS).map((key) => (
              <TextInput
                key={key}
                style={[styles.input, key === 'bio' && { height: 80 }]}
                placeholder={FIELD_LABELS[key]}
                value={form[key] || ''}
                onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
                multiline={key === 'bio'}
              />
            ))}
            <TouchableOpacity style={styles.button} onPress={handleUpdate}>
              <Text style={styles.buttonText}>Save Changes</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scroll: { padding: 16 },
  cardPreview: { backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#6C63FF', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
  name: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  jobTitle: { fontSize: 16, color: '#6C63FF', marginBottom: 2 },
  company: { fontSize: 15, color: '#555', marginBottom: 8 },
  info: { fontSize: 14, color: '#666', marginBottom: 4 },
  bio: { fontSize: 14, color: '#777', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  statsRow: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: 'bold', color: '#6C63FF' },
  statLabel: { fontSize: 12, color: '#999', marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, backgroundColor: '#6C63FF', borderRadius: 12, padding: 14, alignItems: 'center' },
  editBtn: { backgroundColor: '#4ECDC4' },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  modal: { flex: 1, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  closeBtn: { fontSize: 20, color: '#999' },
  input: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 15, borderWidth: 1, borderColor: '#e0e0e0' },
  button: { backgroundColor: '#6C63FF', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default CardDetailScreen;
