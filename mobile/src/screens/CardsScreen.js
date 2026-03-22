import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { getMyCards, createCard, deleteCard } from '../services/api';
import { useAuth } from '../context/AuthContext';

const CardsScreen = ({ navigation }) => {
  const { logout } = useAuth();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', jobTitle: '', company: '', email: '', phone: '', bio: '' });

  const loadCards = useCallback(async () => {
    try {
      const res = await getMyCards();
      setCards(res.data.cards);
    } catch (err) {
      Alert.alert('Error', 'Failed to load cards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCards(); }, [loadCards]);

  const handleCreate = async () => {
    if (!form.name) { Alert.alert('Error', 'Card name is required'); return; }
    try {
      await createCard(form);
      setModalVisible(false);
      setForm({ name: '', jobTitle: '', company: '', email: '', phone: '', bio: '' });
      loadCards();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to create card');
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Delete Card', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteCard(id);
            loadCards();
          } catch (_) {
            Alert.alert('Error', 'Failed to delete card');
          }
        },
      },
    ]);
  };

  const renderCard = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('CardDetail', { card: item })}
    >
      <View style={styles.cardContent}>
        <Text style={styles.cardName}>{item.name}</Text>
        {item.jobTitle ? <Text style={styles.cardSub}>{item.jobTitle}</Text> : null}
        {item.company ? <Text style={styles.cardSub}>{item.company}</Text> : null}
        <View style={styles.statusRow}>
          <View style={[styles.badge, item.moderationStatus === 'approved' ? styles.approved : item.moderationStatus === 'rejected' ? styles.rejected : styles.pending]}>
            <Text style={styles.badgeText}>{item.moderationStatus}</Text>
          </View>
          <Text style={styles.views}>👁 {item.viewCount} · 🔗 {item.shareCount}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item._id)} style={styles.deleteBtn}>
        <Text style={styles.deleteBtnText}>🗑</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Cards</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
            <Text style={styles.addBtnText}>+ New</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#6C63FF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(item) => item._id}
          renderItem={renderCard}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>No cards yet. Create your first!</Text>}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Card</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          {[
            { key: 'name', placeholder: 'Full Name *' },
            { key: 'jobTitle', placeholder: 'Job Title' },
            { key: 'company', placeholder: 'Company' },
            { key: 'email', placeholder: 'Email', keyboardType: 'email-address' },
            { key: 'phone', placeholder: 'Phone', keyboardType: 'phone-pad' },
            { key: 'bio', placeholder: 'Bio', multiline: true },
          ].map(({ key, placeholder, keyboardType, multiline }) => (
            <TextInput
              key={key}
              style={[styles.input, multiline && { height: 80 }]}
              placeholder={placeholder}
              value={form[key]}
              onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
              keyboardType={keyboardType}
              multiline={multiline}
            />
          ))}
          <TouchableOpacity style={styles.button} onPress={handleCreate}>
            <Text style={styles.buttonText}>Create Card</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  headerActions: { flexDirection: 'row', gap: 8 },
  addBtn: { backgroundColor: '#6C63FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: '#fff', fontWeight: '600' },
  logoutBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  logoutText: { color: '#999' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  cardContent: { flex: 1 },
  cardName: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 4 },
  cardSub: { fontSize: 14, color: '#666', marginBottom: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  approved: { backgroundColor: '#E8F5E9' },
  rejected: { backgroundColor: '#FFEBEE' },
  pending: { backgroundColor: '#FFF8E1' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  views: { fontSize: 12, color: '#999' },
  deleteBtn: { padding: 8 },
  deleteBtnText: { fontSize: 18 },
  empty: { textAlign: 'center', color: '#999', marginTop: 60, fontSize: 16 },
  modal: { flex: 1, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  closeBtn: { fontSize: 20, color: '#999' },
  input: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 15, borderWidth: 1, borderColor: '#e0e0e0' },
  button: { backgroundColor: '#6C63FF', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default CardsScreen;
