import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { getVaultItems, createVaultItem, deleteVaultItem, getVaultItemData } from '../services/api';

const CATEGORIES = ['password', 'note', 'document', 'identity', 'financial', 'other'];
const CATEGORY_ICONS = { password: '🔑', note: '📝', document: '📄', identity: '🪪', financial: '💳', other: '📦' };

const VaultScreen = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [form, setForm] = useState({ label: '', category: 'other', data: '' });

  const [showData, setShowData] = useState(false);

  const loadItems = useCallback(async () => {
    try {
      const res = await getVaultItems();
      setItems(res.data.items);
    } catch (_) {
      Alert.alert('Error', 'Failed to load vault items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleCreate = async () => {
    if (!form.label || !form.data) { Alert.alert('Error', 'Label and data are required'); return; }
    try {
      await createVaultItem(form.label, form.category, form.data);
      setModalVisible(false);
      setForm({ label: '', category: 'other', data: '' });
      loadItems();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to create item');
    }
  };

  const handleView = async (id) => {
    try {
      const res = await getVaultItemData(id);
      setViewData(res.data.data);
    } catch (_) {
      Alert.alert('Error', 'Failed to retrieve data');
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Delete', 'Are you sure you want to delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteVaultItem(id);
            loadItems();
          } catch (_) {
            Alert.alert('Error', 'Failed to delete item');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <Text style={styles.icon}>{CATEGORY_ICONS[item.category] || '📦'}</Text>
      <View style={styles.itemContent}>
        <Text style={styles.label}>{item.label}</Text>
        <Text style={styles.category}>{item.category}</Text>
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity onPress={() => handleView(item._id)} style={styles.viewBtn}>
          <Text style={styles.viewBtnText}>View</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item._id)}>
          <Text style={styles.deleteText}>🗑</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔒 Vault</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#6C63FF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>Vault is empty. Add your first item!</Text>}
        />
      )}

      {/* View Data Modal */}
      <Modal visible={viewData !== null} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.dataModal}>
            <Text style={styles.dataTitle}>Vault Data</Text>
            <View style={styles.dataBox}>
              <Text style={styles.dataText} selectable>{viewData}</Text>
            </View>
            <TouchableOpacity style={styles.button} onPress={() => setViewData(null)}>
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Item Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Vault Item</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Label"
            value={form.label}
            onChangeText={(v) => setForm((f) => ({ ...f, label: v }))}
          />
          <Text style={styles.sectionLabel}>Category</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.catChip, form.category === cat && styles.catChipActive]}
                onPress={() => setForm((f) => ({ ...f, category: cat }))}
              >
                <Text style={[styles.catChipText, form.category === cat && styles.catChipTextActive]}>
                  {CATEGORY_ICONS[cat]} {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.dataInputWrapper}>
            <TextInput
              style={[styles.input, { height: 120, flex: 1 }]}
              placeholder="Data (will be encrypted)"
              value={form.data}
              onChangeText={(v) => setForm((f) => ({ ...f, data: v }))}
              multiline
              secureTextEntry={!showData}
            />
            <TouchableOpacity style={styles.showToggle} onPress={() => setShowData((s) => !s)}>
              <Text style={styles.showToggleText}>{showData ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.button} onPress={handleCreate}>
            <Text style={styles.buttonText}>Save to Vault</Text>
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
  addBtn: { backgroundColor: '#6C63FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: '#fff', fontWeight: '600' },
  item: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  icon: { fontSize: 28, marginRight: 12 },
  itemContent: { flex: 1 },
  label: { fontSize: 16, fontWeight: '600', color: '#333' },
  category: { fontSize: 12, color: '#999', marginTop: 2, textTransform: 'capitalize' },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  viewBtn: { backgroundColor: '#E8F0FE', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  viewBtnText: { color: '#6C63FF', fontWeight: '600', fontSize: 13 },
  deleteText: { fontSize: 18 },
  empty: { textAlign: 'center', color: '#999', marginTop: 60, fontSize: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  dataModal: { backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  dataTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 16 },
  dataBox: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 16 },
  dataText: { fontSize: 16, color: '#333', lineHeight: 22 },
  modal: { flex: 1, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  closeBtn: { fontSize: 20, color: '#999' },
  input: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 15, borderWidth: 1, borderColor: '#e0e0e0' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 8 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catChip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0' },
  catChipActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  catChipText: { fontSize: 12, color: '#555' },
  catChipTextActive: { color: '#fff' },
  dataInputWrapper: { position: 'relative', marginBottom: 12 },
  showToggle: { position: 'absolute', right: 12, top: 14 },
  showToggleText: { color: '#6C63FF', fontWeight: '600', fontSize: 13 },
  button: { backgroundColor: '#6C63FF', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default VaultScreen;
