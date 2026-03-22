import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, SafeAreaView, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { getContacts, deleteContact, addContact } from '../services/api';

const ContactsScreen = () => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addVisible, setAddVisible] = useState(false);
  const [cardSlug, setCardSlug] = useState('');

  const loadContacts = useCallback(async () => {
    try {
      const res = await getContacts();
      setContacts(res.data.contacts);
    } catch (_) {
      Alert.alert('Error', 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const handleAdd = async () => {
    if (!cardSlug) { Alert.alert('Error', 'Please enter a card ID'); return; }
    try {
      await addContact(cardSlug);
      setAddVisible(false);
      setCardSlug('');
      loadContacts();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to add contact');
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Remove Contact', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await deleteContact(id);
            loadContacts();
          } catch (_) {
            Alert.alert('Error', 'Failed to remove contact');
          }
        },
      },
    ]);
  };

  const renderContact = ({ item }) => {
    const card = item.card || {};
    return (
      <View style={styles.contact}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(card.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{card.name || 'Unknown'}</Text>
          {card.jobTitle ? <Text style={styles.sub}>{card.jobTitle}</Text> : null}
          {card.company ? <Text style={styles.sub}>{card.company}</Text> : null}
          {card.email ? <Text style={styles.detail}>✉️ {card.email}</Text> : null}
        </View>
        <TouchableOpacity onPress={() => handleDelete(item._id)}>
          <Text style={styles.removeText}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>👥 Contacts</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddVisible(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#6C63FF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item._id}
          renderItem={renderContact}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>No contacts yet.</Text>}
        />
      )}

      <Modal visible={addVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.addModal}>
            <Text style={styles.modalTitle}>Add Contact by Card ID</Text>
            <TextInput
              style={styles.input}
              placeholder="Card ID"
              value={cardSlug}
              onChangeText={setCardSlug}
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setAddVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleAdd}>
                <Text style={styles.confirmText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  addBtn: { backgroundColor: '#6C63FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: '#fff', fontWeight: '600' },
  contact: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#4ECDC4', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#333' },
  sub: { fontSize: 13, color: '#666', marginTop: 1 },
  detail: { fontSize: 12, color: '#999', marginTop: 2 },
  removeText: { fontSize: 18, color: '#ccc', padding: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 60, fontSize: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  addModal: { backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 16 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 15, borderWidth: 1, borderColor: '#e0e0e0' },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', backgroundColor: '#f0f0f0' },
  cancelText: { color: '#555', fontWeight: '600' },
  confirmBtn: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', backgroundColor: '#6C63FF' },
  confirmText: { color: '#fff', fontWeight: '600' },
});

export default ContactsScreen;
