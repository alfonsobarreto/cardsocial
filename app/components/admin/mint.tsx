import MintQRGenerator from '@/components/MintQRGenerator';
import { getActiveUserId } from '@/services/authSession';
import { getAuditLog, getQRHistory, type QRGift } from '@/services/qrGiftService';
import { isSuperAdmin } from '@/services/roleService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { trEsEn, useLanguage } from '@/services/language';

type MintTab = 'generate' | 'history' | 'audit';

export default function AdminMintScreen() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
  const intlLocale = language === 'pt' ? 'pt-BR' : language;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<MintTab>('generate');
  const [pochobsUid, setPochobsUid] = useState('');
  const [qrHistory, setQrHistory] = useState<QRGift[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
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
      setPochobsUid(uid);

      const [history, audit] = await Promise.all([
        getQRHistory(uid),
        getAuditLog(50),
      ]);
      setQrHistory(history);
      setAuditLog(audit);
      setAuthorized(true);
    } catch (err) {
      console.error('[AdminMint] init error:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalGifted = qrHistory.reduce((s, q) => s + q.originalCreditsPool, 0);
  const totalRedeemed = qrHistory.reduce((s, q) => s + q.creditsPerUse * q.redeemedUsers.length, 0);
  const activeQRs = qrHistory.filter(q => q.status === 'active').length;

  const TABS: { key: MintTab; label: string; icon: string }[] = useMemo(
    () => [
      { key: 'generate', label: tr('Generar', 'Generate'), icon: 'crown' },
      { key: 'history', label: tr('Historial', 'History'), icon: 'qrcode' },
      { key: 'audit', label: tr('Auditoría', 'Audit'), icon: 'file-document' },
    ],
    [language],
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#C5A065" />
      </View>
    );
  }

  if (!authorized) return null;

  const renderQRItem = ({ item }: { item: QRGift }) => {
    const progress = item.maxUses > 0 ? item.redeemedUsers.length / item.maxUses : 0;
    return (
      <View style={styles.qrCard}>
        <View style={styles.qrCardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.qrCardId}>{item.id.substring(0, 20)}...</Text>
            <Text style={styles.qrCardDate}>
              {item.createdAt ? new Date(item.createdAt.toMillis()).toLocaleDateString(intlLocale) : 'N/A'}
            </Text>
          </View>
          <View style={[styles.statusBadge, item.status === 'active' && styles.statusActive, item.status === 'depleted' && styles.statusDepleted]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.qrStats}>
          <View style={styles.qrStat}>
            <MaterialCommunityIcons name="cash" size={14} color="#C5A065" />
            <Text style={styles.qrStatText}>
              {item.creditsPerUse} {tr('CS/uso', 'CS per use')}
            </Text>
          </View>
          <View style={styles.qrStat}>
            <MaterialCommunityIcons name="account-group" size={14} color="#3498DB" />
            <Text style={styles.qrStatText}>
              {item.redeemedUsers.length}/{item.maxUses} {tr('canjeados', 'redeemed')}
            </Text>
          </View>
          <View style={styles.qrStat}>
            <MaterialCommunityIcons name="calendar" size={14} color="#9B59B6" />
            <Text style={styles.qrStatText}>
              {item.maxExpiresIn ? Math.ceil(item.maxExpiresIn / 86400000) + 'd' : '∞'}
            </Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* HEADER */}
      <LinearGradient colors={['#020D1A', '#0A2540']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#C5A065" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <MaterialCommunityIcons name="crown" size={18} color="#C5A065" />
          <Text style={styles.headerTitle}>{tr('MINT', 'MINT')}</Text>
        </View>
        <View style={{ width: 36 }} />
      </LinearGradient>

      {/* KPI STRIP */}
      <View style={styles.kpiStrip}>
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{activeQRs}</Text>
          <Text style={styles.kpiLabel}>{tr('Activos', 'Active')}</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{totalGifted.toLocaleString(intlLocale)}</Text>
          <Text style={styles.kpiLabel}>{tr('CS regalados', 'CS gifted')}</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{totalRedeemed.toLocaleString(intlLocale)}</Text>
          <Text style={styles.kpiLabel}>{tr('CS canjeados', 'CS redeemed')}</Text>
        </View>
      </View>

      {/* SUB-TABS */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <MaterialCommunityIcons
              name={tab.icon as any}
              size={16}
              color={activeTab === tab.key ? '#C5A065' : '#999'}
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* CONTENT */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentPad} showsVerticalScrollIndicator={false}>
        {activeTab === 'generate' && (
          pochobsUid ? <MintQRGenerator pochobsUid={pochobsUid} onClose={() => router.back()} /> : null
        )}

        {activeTab === 'history' && (
          <>
            <Text style={styles.sectionTitle}>
              {tr('QRs generados', 'Generated QRs')} ({qrHistory.length})
            </Text>
            {qrHistory.length === 0 ? (
              <Text style={styles.emptyText}>{tr('No hay QRs generados aún.', 'No QRs generated yet.')}</Text>
            ) : (
              <FlatList
                data={qrHistory}
                renderItem={renderQRItem}
                keyExtractor={item => item.id}
                scrollEnabled={false}
              />
            )}
          </>
        )}

        {activeTab === 'audit' && (
          <>
            <Text style={styles.sectionTitle}>
              {tr('Registro de auditoría', 'Audit log')} ({auditLog.length})
            </Text>
            {auditLog.length === 0 ? (
              <Text style={styles.emptyText}>{tr('No hay registros aún.', 'No records yet.')}</Text>
            ) : (
              auditLog.map((entry, idx) => (
                <View key={idx} style={styles.auditRow}>
                  <View style={styles.auditIconBox}>
                    <MaterialCommunityIcons name="qrcode" size={14} color="#C5A065" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.auditAction}>
                      {tr('QR generado', 'QR generated')} · {tr('ID', 'ID')}: {entry.giftId?.substring(0, 12)}...
                    </Text>
                    <Text style={styles.auditDate}>
                      {entry.timestamp ? new Date(entry.timestamp.toMillis()).toLocaleString(intlLocale) : 'N/A'}
                    </Text>
                  </View>
                  <Text style={styles.auditAmount}>-{entry.creditsDeducted} CS</Text>
                </View>
              ))
            )}
          </>
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
  kpiStrip: {
    flexDirection: 'row',
    backgroundColor: '#0A1A2F',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  kpi: { flex: 1, alignItems: 'center' },
  kpiValue: { color: '#C5A065', fontSize: 20, fontWeight: '800' },
  kpiLabel: { color: 'rgba(197,160,101,0.5)', fontSize: 10, marginTop: 2 },
  kpiDivider: { width: 1, height: '100%', backgroundColor: 'rgba(197,160,101,0.2)' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#020D1A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(197,160,101,0.1)',
  },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#C5A065' },
  tabText: { color: '#999', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#C5A065' },
  content: { flex: 1, backgroundColor: '#F5F7FA' },
  contentPad: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0A2540', marginBottom: 12 },
  emptyText: { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 32 },
  qrCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8EDF2',
  },
  qrCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  qrCardId: { fontSize: 12, fontWeight: '700', color: '#0A2540' },
  qrCardDate: { fontSize: 10, color: '#999', marginTop: 2 },
  statusBadge: { backgroundColor: '#F0F0F0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusActive: { backgroundColor: 'rgba(46,204,113,0.15)' },
  statusDepleted: { backgroundColor: 'rgba(231,76,60,0.12)' },
  statusText: { fontSize: 9, fontWeight: '800', color: '#2ECC71', letterSpacing: 0.5 },
  qrStats: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  qrStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qrStatText: { fontSize: 11, color: '#555' },
  progressTrack: { height: 4, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#C5A065' },
  auditRow: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#C5A065',
  },
  auditIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(197,160,101,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  auditAction: { fontSize: 12, fontWeight: '600', color: '#0A2540' },
  auditDate: { fontSize: 10, color: '#999', marginTop: 2 },
  auditAmount: { fontSize: 13, fontWeight: '800', color: '#E74C3C' },
});
