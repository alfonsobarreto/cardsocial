import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, SafeAreaView, ActivityIndicator, FlatList,
} from 'react-native';
import {
  getAdminStats, listAdminUsers, getPendingCards,
  moderateCard, getAdminReports, updateAdminUser,
} from '../services/api';

const TABS = ['Stats', 'Users', 'Cards', 'Reports'];

const AdminScreen = () => {
  const [tab, setTab] = useState('Stats');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [pendingCards, setPendingCards] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminStats();
      setStats(res.data);
    } catch (_) {
      Alert.alert('Error', 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminUsers();
      setUsers(res.data.users);
    } catch (_) {} finally { setLoading(false); }
  }, []);

  const loadPendingCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPendingCards();
      setPendingCards(res.data.cards);
    } catch (_) {} finally { setLoading(false); }
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminReports();
      setReports(res.data.reports);
    } catch (_) {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'Stats') loadStats();
    else if (tab === 'Users') loadUsers();
    else if (tab === 'Cards') loadPendingCards();
    else if (tab === 'Reports') loadReports();
  }, [tab]);

  const handleModerate = async (id, status) => {
    try {
      await moderateCard(id, status, '');
      loadPendingCards();
    } catch (_) {
      Alert.alert('Error', 'Failed to moderate card');
    }
  };

  const handleToggleUser = async (user) => {
    try {
      await updateAdminUser(user._id, { isActive: !user.isActive });
      loadUsers();
    } catch (_) {
      Alert.alert('Error', 'Failed to update user');
    }
  };

  const StatsView = () => (
    stats ? (
      <View style={styles.statsGrid}>
        {[
          { label: 'Total Users', value: stats.totalUsers, icon: '👤' },
          { label: 'Total Cards', value: stats.totalCards, icon: '🪪' },
          { label: 'Pending Review', value: stats.pendingCards, icon: '⏳' },
          { label: 'Open Reports', value: stats.openReports, icon: '🚩' },
        ].map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={styles.statIcon}>{s.icon}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    ) : null
  );

  const UsersView = () => (
    <FlatList
      data={users}
      keyExtractor={(u) => u._id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>{item.name}</Text>
            <Text style={styles.rowSub}>{item.email} · {item.role}</Text>
          </View>
          <TouchableOpacity
            style={[styles.toggleBtn, !item.isActive && styles.toggleInactive]}
            onPress={() => handleToggleUser(item)}
          >
            <Text style={styles.toggleText}>{item.isActive ? 'Disable' : 'Enable'}</Text>
          </TouchableOpacity>
        </View>
      )}
      contentContainerStyle={{ padding: 16 }}
      ListEmptyComponent={<Text style={styles.empty}>No users</Text>}
    />
  );

  const CardsView = () => (
    <FlatList
      data={pendingCards}
      keyExtractor={(c) => c._id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>{item.name}</Text>
            <Text style={styles.rowSub}>{item.owner?.email}</Text>
          </View>
          <View style={styles.moderateActions}>
            <TouchableOpacity style={styles.approveBtn} onPress={() => handleModerate(item._id, 'approved')}>
              <Text style={styles.approveBtnText}>✓</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => handleModerate(item._id, 'rejected')}>
              <Text style={styles.rejectBtnText}>✗</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      contentContainerStyle={{ padding: 16 }}
      ListEmptyComponent={<Text style={styles.empty}>No pending cards</Text>}
    />
  );

  const ReportsView = () => (
    <FlatList
      data={reports}
      keyExtractor={(r) => r._id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>🚩 {item.card?.name || 'Unknown Card'}</Text>
            <Text style={styles.rowSub}>{item.reason}</Text>
            <Text style={styles.rowDetail}>by {item.reporter?.name} · {item.status}</Text>
          </View>
        </View>
      )}
      contentContainerStyle={{ padding: 16 }}
      ListEmptyComponent={<Text style={styles.empty}>No reports</Text>}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>⚙️ Admin Dashboard</Text>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#6C63FF" style={{ marginTop: 40 }} />
      ) : (
        <>
          {tab === 'Stats' && <ScrollView><StatsView /></ScrollView>}
          {tab === 'Users' && <UsersView />}
          {tab === 'Cards' && <CardsView />}
          {tab === 'Reports' && <ReportsView />}
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#333', padding: 16, paddingBottom: 8 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e0e0e0', backgroundColor: '#fff' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#6C63FF' },
  tabText: { fontSize: 13, color: '#999' },
  tabTextActive: { color: '#6C63FF', fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 12 },
  statCard: { width: '46%', backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  statIcon: { fontSize: 28, marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: 'bold', color: '#6C63FF' },
  statLabel: { fontSize: 12, color: '#999', marginTop: 4, textAlign: 'center' },
  row: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  rowSub: { fontSize: 12, color: '#666', marginTop: 2 },
  rowDetail: { fontSize: 11, color: '#999', marginTop: 2 },
  toggleBtn: { backgroundColor: '#FFEBEE', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  toggleInactive: { backgroundColor: '#E8F5E9' },
  toggleText: { fontSize: 12, fontWeight: '600', color: '#555' },
  moderateActions: { flexDirection: 'row', gap: 8 },
  approveBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  approveBtnText: { color: '#4CAF50', fontWeight: 'bold', fontSize: 16 },
  rejectBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFEBEE', justifyContent: 'center', alignItems: 'center' },
  rejectBtnText: { color: '#F44336', fontWeight: 'bold', fontSize: 16 },
  empty: { textAlign: 'center', color: '#999', marginTop: 60, fontSize: 16 },
});

export default AdminScreen;
