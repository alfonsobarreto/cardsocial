import { getActiveUserId } from '@/services/authSession';
import { db } from '@/services/firebaseConfig';
import { isSuperAdmin } from '@/services/roleService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { localeStringForReportDates, useLanguage } from '@/services/language';
import { coreTrEsEn } from '@/services/coreI18n';

type FilterTab = 'pending' | 'reviewed' | 'dismissed';

interface Report {
  id: string;
  type: 'card' | 'profile' | 'support';
  status: 'pending' | 'reviewed' | 'dismissed';
  reportedUserId?: string;
  reporterUserId?: string;
  targetCardId?: string;
  reason: string;
  details?: string;
  createdAt?: any;
}

export default function AdminModerationScreen() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('pending');
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const uid = await getActiveUserId();
      if (!uid || !(await isSuperAdmin(uid))) {
        router.replace('/');
        return;
      }
      setAuthorized(true);
      await fetchReports();
    } catch (err) {
      console.error('[AdminModeration] init error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReports = async () => {
    try {
      const snap = await getDocs(collection(db, 'reports'));
      const data: Report[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Report));
      setReports(data);
    } catch {
      // collection may not exist yet
      setReports([]);
    }
  };

  const handleAction = (report: Report, action: 'reviewed' | 'dismissed' | 'ban') => {
    if (action === 'ban') {
      Alert.alert(
        tr('⚠️ Banear usuario', '⚠️ Ban user'),
        tr(
          `¿Seguro que deseas banear al usuario ${report.reportedUserId?.substring(0, 12)}...?`,
          `Are you sure you want to ban user ${report.reportedUserId?.substring(0, 12)}...?`,
        ),
        [
          { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
          {
            text: tr('Banear', 'Ban'),
            style: 'destructive',
            onPress: () => performBan(report),
          },
        ],
      );
    } else {
      performUpdate(report.id, action);
    }
  };

  const performUpdate = async (reportId: string, status: 'reviewed' | 'dismissed') => {
    try {
      await updateDoc(doc(db, 'reports', reportId), {
        status,
        reviewedAt: serverTimestamp(),
      });
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status } : r));
    } catch (err) {
      Alert.alert(tr('Error', 'Error'), tr('No se pudo actualizar el reporte.', 'Could not update the report.'));
    }
  };

  const performBan = async (report: Report) => {
    try {
      if (report.reportedUserId) {
        await updateDoc(doc(db, 'users', report.reportedUserId), {
          isBanned: true,
          bannedAt: serverTimestamp(),
          banReason: report.reason,
        });
      }
      await performUpdate(report.id, 'reviewed');
      Alert.alert(
        tr('✅ Usuario baneado correctamente', '✅ User banned successfully'),
        tr('El usuario quedó baneado.', 'The user has been banned.'),
      );
    } catch (err) {
      Alert.alert(tr('Error', 'Error'), tr('No se pudo banear al usuario.', 'Could not ban the user.'));
    }
  };

  const filtered = reports.filter((r) => r.status === activeFilter);

  const filterTabs: { key: FilterTab; label: string; icon: string }[] = [
    { key: 'pending', label: tr('Pendientes', 'Pending'), icon: 'clock-alert' },
    { key: 'reviewed', label: tr('Revisados', 'Reviewed'), icon: 'check-circle' },
    { key: 'dismissed', label: tr('Desestimados', 'Dismissed'), icon: 'close-circle' },
  ];

  const TYPE_COLORS: Record<string, string> = {
    card: '#E74C3C',
    profile: '#E67E22',
    support: '#3498DB',
  };

  const typeLabel = (t: string) => {
    if (t === 'card') return tr('Tarjeta', 'Card');
    if (t === 'profile') return tr('Perfil', 'Profile');
    if (t === 'support') return tr('Soporte', 'Support');
    return t;
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#C5A065" /></View>;
  }
  if (!authorized) return null;

  const pendingCount = reports.filter(r => r.status === 'pending').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* HEADER */}
      <LinearGradient
        colors={pendingCount > 0 ? ['#5C0A0A', '#020D1A'] : ['#0A2540', '#020D1A']}
        style={styles.header}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#C5A065" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <MaterialCommunityIcons name="shield-alert" size={18} color="#C5A065" />
          <Text style={styles.headerTitle}>{tr('SOPORTE', 'SUPPORT')}</Text>
          {pendingCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 36 }} />
      </LinearGradient>

      {/* FILTER TABS */}
      <View style={styles.tabBar}>
        {filterTabs.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.tab, activeFilter === f.key && styles.tabActive]}
            onPress={() => setActiveFilter(f.key)}
          >
            <MaterialCommunityIcons
              name={f.icon as any}
              size={15}
              color={activeFilter === f.key ? '#C5A065' : '#999'}
            />
            <Text style={[styles.tabText, activeFilter === f.key && styles.tabTextActive]}>
              {f.label}
            </Text>
            {f.key === 'pending' && pendingCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{pendingCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentPad} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="shield-check" size={48} color="#27AE60" />
            <Text style={styles.emptyTitle}>
              {activeFilter === 'pending'
                ? tr('¡Sin pendientes!', 'All clear!')
                : activeFilter === 'reviewed'
                  ? tr('No hay reportes revisados.', 'No reviewed reports.')
                  : tr('No hay reportes desestimados.', 'No dismissed reports.')}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeFilter === 'pending'
                ? tr('No hay denuncias esperando revisión.', 'No reports waiting for review.')
                : tr('Los reportes aparecerán aquí.', 'Reports will show up here.')}
            </Text>
          </View>
        ) : (
          filtered.map(report => (
            <View key={report.id} style={styles.reportCard}>
              <View style={styles.reportHeader}>
                <View style={[styles.typeBadge, { backgroundColor: (TYPE_COLORS[report.type] ?? '#999') + '20' }]}>
                  <Text style={[styles.typeText, { color: TYPE_COLORS[report.type] ?? '#999' }]}>
                    {typeLabel(report.type)}
                  </Text>
                </View>
                <Text style={styles.reportDate}>
                  {report.createdAt
                    ? new Date(report.createdAt.toMillis()).toLocaleDateString(localeStringForReportDates(language))
                    : tr('Sin fecha', 'No date')}
                </Text>
              </View>

              <Text style={styles.reportReason}>{report.reason}</Text>
              {report.details ? (
                <Text style={styles.reportDetails}>{report.details}</Text>
              ) : null}

              <View style={styles.reportMeta}>
                {report.reportedUserId && (
                  <Text style={styles.reportMetaText}>
                    {tr('Reportado:', 'Reported:')}{' '}
                    <Text style={styles.reportMetaValue}>{report.reportedUserId.substring(0, 14)}...</Text>
                  </Text>
                )}
                {report.reporterUserId && (
                  <Text style={styles.reportMetaText}>
                    {tr('Por:', 'By:')}{' '}
                    <Text style={styles.reportMetaValue}>{report.reporterUserId.substring(0, 14)}...</Text>
                  </Text>
                )}
              </View>

              {report.status === 'pending' && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.dismissBtn]}
                    onPress={() => handleAction(report, 'dismissed')}
                  >
                    <MaterialCommunityIcons name="close" size={14} color="#777" />
                    <Text style={styles.dismissBtnText}>{tr('Desestimar', 'Dismiss')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.reviewBtn]}
                    onPress={() => handleAction(report, 'reviewed')}
                  >
                    <MaterialCommunityIcons name="check" size={14} color="#27AE60" />
                    <Text style={styles.reviewBtnText}>{tr('Marcar revisado', 'Mark reviewed')}</Text>
                  </TouchableOpacity>
                  {report.reportedUserId && (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.banBtn]}
                      onPress={() => handleAction(report, 'ban')}
                    >
                      <MaterialCommunityIcons name="account-cancel" size={14} color="#FFF" />
                      <Text style={styles.banBtnText}>{tr('Banear', 'Ban')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#020D1A' },
  loadingContainer: { flex: 1, backgroundColor: '#020D1A', justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(197,160,101,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: '#C5A065', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  countBadge: {
    backgroundColor: '#E74C3C',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  countBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#020D1A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(197,160,101,0.1)',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#C5A065' },
  tabText: { color: '#999', fontSize: 11, fontWeight: '600' },
  tabTextActive: { color: '#C5A065' },
  tabBadge: { backgroundColor: '#E74C3C', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  content: { flex: 1, backgroundColor: '#F5F7FA' },
  contentPad: { padding: 16, paddingBottom: 40 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0A2540' },
  emptySubtitle: { fontSize: 13, color: '#999', textAlign: 'center' },
  reportCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    gap: 8,
  },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  reportDate: { fontSize: 11, color: '#AAA' },
  reportReason: { fontSize: 13, fontWeight: '600', color: '#0A2540' },
  reportDetails: { fontSize: 12, color: '#666', lineHeight: 17 },
  reportMeta: { gap: 3, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 8 },
  reportMetaText: { fontSize: 11, color: '#999' },
  reportMetaValue: { color: '#0A2540', fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  dismissBtn: { backgroundColor: '#F0F0F0' },
  dismissBtnText: { fontSize: 12, fontWeight: '600', color: '#777' },
  reviewBtn: { backgroundColor: 'rgba(39,174,96,0.12)' },
  reviewBtnText: { fontSize: 12, fontWeight: '600', color: '#27AE60' },
  banBtn: { backgroundColor: '#E74C3C', marginLeft: 'auto' },
  banBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
});
