import { getActiveUserId } from '@/services/authSession';
import { db } from '@/services/firebaseConfig';
import { getQRHistory } from '@/services/qrGiftService';
import { isSuperAdmin } from '@/services/roleService';
import { getStudentPackGrantAudits } from '@/services/studentPackAdminService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type StatsTab = 'users' | 'coins' | 'students' | 'costs';
type CoinsPeriod = 'month' | 'year' | 'all';

interface UserStats {
  total: number;
  premium: number;
  business: number;
  businessNull: number;
}

interface CoinsStats {
  totalGifted: number;
  totalRedeemed: number;
  thisMonth: number;
  thisYear: number;
}

interface StudentStats {
  totalGrants: number;
  totalCS: number;
  github: number;
  google: number;
}

export default function AdminStatsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StatsTab>('users');
  const [coinsPeriod, setCoinsPeriod] = useState<CoinsPeriod>('month');
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [userStats, setUserStats] = useState<UserStats>({ total: 0, premium: 0, business: 0, businessNull: 0 });
  const [coinsStats, setCoinsStats] = useState<CoinsStats>({ totalGifted: 0, totalRedeemed: 0, thisMonth: 0, thisYear: 0 });
  const [studentStats, setStudentStats] = useState<StudentStats>({ totalGrants: 0, totalCS: 0, github: 0, google: 0 });
  const [studentRows, setStudentRows] = useState<any[]>([]);

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

      const [usersSnap, businessSnap, qrHistory, studentAudits] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'businessCards')).catch(() => ({ docs: [], size: 0 })),
        getQRHistory(uid),
        getStudentPackGrantAudits(200).catch(() => []),
      ]);

      // Users
      const allUsers = usersSnap.docs.map(d => d.data());
      const premium = allUsers.filter(u => u.isPremium || u.subscriptionStatus === 'active' || u.role === 'super_admin').length;
      const businessCards = (businessSnap as any).docs ?? [];
      const businessNull = businessCards.filter((d: any) => {
        const data = d.data();
        return !data.companyName && !data.jobTitle && !data.phone;
      }).length;

      setUserStats({
        total: usersSnap.size,
        premium,
        business: (businessSnap as any).size ?? 0,
        businessNull,
      });

      // CS Coins
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
      const totalGifted = qrHistory.reduce((s, q) => s + q.originalCreditsPool, 0);
      const totalRedeemed = qrHistory.reduce((s, q) => s + q.creditsPerUse * q.redeemedUsers.length, 0);

      let thisMonth = 0;
      let thisYear = 0;
      for (const q of qrHistory) {
        const ts = q.createdAt?.toMillis() ?? 0;
        const amt = q.creditsPerUse * q.redeemedUsers.length;
        if (ts >= monthStart) thisMonth += amt;
        if (ts >= yearStart) thisYear += amt;
      }

      setCoinsStats({ totalGifted, totalRedeemed, thisMonth, thisYear });

      // Students
      const grants = (studentAudits as any[]).filter((r: any) => r.granted);
      setStudentStats({
        totalGrants: grants.length,
        totalCS: grants.reduce((s: number, r: any) => s + r.amount, 0),
        github: grants.filter((r: any) => r.provider === 'github.com').length,
        google: grants.filter((r: any) => r.provider === 'google.com').length,
      });
      setStudentRows(studentAudits as any[]);

      setAuthorized(true);
    } catch (err) {
      console.error('[AdminStats] init error:', err);
    } finally {
      setLoading(false);
    }
  };

  const TABS: { key: StatsTab; label: string; icon: string }[] = [
    { key: 'users', label: 'Usuarios', icon: 'account-group' },
    { key: 'coins', label: 'CS Coins', icon: 'cash-multiple' },
    { key: 'students', label: 'Student Pack', icon: 'school' },
    { key: 'costs', label: 'Costos', icon: 'server' },
  ];

  const coinsDisplay = coinsPeriod === 'month' ? coinsStats.thisMonth
    : coinsPeriod === 'year' ? coinsStats.thisYear
    : coinsStats.totalRedeemed;

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#C5A065" /></View>;
  }
  if (!authorized) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* HEADER */}
      <LinearGradient colors={['#020D1A', '#0A2540']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#C5A065" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <MaterialCommunityIcons name="chart-bar" size={18} color="#C5A065" />
          <Text style={styles.headerTitle}>ESTADÍSTICAS</Text>
        </View>
        <View style={{ width: 36 }} />
      </LinearGradient>

      {/* SUB-TABS */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <MaterialCommunityIcons name={tab.icon as any} size={15} color={activeTab === tab.key ? '#C5A065' : '#999'} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentPad} showsVerticalScrollIndicator={false}>

        {/* ── USUARIOS ── */}
        {activeTab === 'users' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Distribución de Usuarios</Text>
            <View style={styles.kpiGrid}>
              <KpiCard icon="account-multiple" label="Total Usuarios" value={userStats.total.toLocaleString()} color="#0D4D8A" />
              <KpiCard icon="star-circle" label="Premium" value={userStats.premium.toLocaleString()} color="#C5A065" />
              <KpiCard icon="card-account-details" label="Business Cards" value={userStats.business.toLocaleString()} color="#27AE60" />
              <KpiCard icon="card-off" label="Cards Vacías" value={userStats.businessNull.toLocaleString()} color="#E74C3C" />
            </View>
            <View style={styles.progressSection}>
              <Text style={styles.progressLabel}>Premium vs Free</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${userStats.total > 0 ? (userStats.premium / userStats.total) * 100 : 0}%`, backgroundColor: '#C5A065' }]} />
              </View>
              <Text style={styles.progressCaption}>
                {userStats.premium} premium · {userStats.total - userStats.premium} free
              </Text>
            </View>
          </View>
        )}

        {/* ── CS COINS ── */}
        {activeTab === 'coins' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CS Coins Canjeados</Text>
            <View style={styles.periodRow}>
              {(['month', 'year', 'all'] as CoinsPeriod[]).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.periodBtn, coinsPeriod === p && styles.periodBtnActive]}
                  onPress={() => setCoinsPeriod(p)}
                >
                  <Text style={[styles.periodText, coinsPeriod === p && styles.periodTextActive]}>
                    {p === 'month' ? 'Este mes' : p === 'year' ? 'Este año' : 'Total'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.bigKpi}>
              <Text style={styles.bigKpiValue}>{coinsDisplay.toLocaleString()}</Text>
              <Text style={styles.bigKpiLabel}>CS Coins canjeados</Text>
            </View>
            <View style={styles.kpiGrid}>
              <KpiCard icon="gift" label="Total Gifted (histórico)" value={coinsStats.totalGifted.toLocaleString()} color="#9B59B6" />
              <KpiCard icon="check-all" label="Total Canjeado (histórico)" value={coinsStats.totalRedeemed.toLocaleString()} color="#27AE60" />
              <KpiCard icon="calendar-month" label="Canjeado este mes" value={coinsStats.thisMonth.toLocaleString()} color="#0D4D8A" />
              <KpiCard icon="calendar" label="Canjeado este año" value={coinsStats.thisYear.toLocaleString()} color="#C5A065" />
            </View>
          </View>
        )}

        {/* ── STUDENT PACK ── */}
        {activeTab === 'students' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Student Pack (.edu)</Text>
            <View style={styles.kpiGrid}>
              <KpiCard icon="school-outline" label="Grants Otorgados" value={studentStats.totalGrants.toLocaleString()} color="#27AE60" />
              <KpiCard icon="cash-multiple" label="CS Entregados" value={studentStats.totalCS.toLocaleString()} color="#C5A065" />
              <KpiCard icon="github" label="Vía GitHub" value={studentStats.github.toLocaleString()} color="#333" />
              <KpiCard icon="google" label="Vía Google" value={studentStats.google.toLocaleString()} color="#EA4335" />
            </View>
            {studentRows.length === 0 ? (
              <Text style={styles.emptyText}>No hay grants registrados aún.</Text>
            ) : (
              studentRows.slice(0, 50).map((item: any) => (
                <View key={item.uid} style={styles.studentRow}>
                  <MaterialCommunityIcons name="school-outline" size={14} color="#0A2540" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentEmail}>{item.emailLower || item.uid}</Text>
                    <Text style={styles.studentMeta}>{item.provider} · {item.source} · {item.grantedAtText}</Text>
                  </View>
                  <View style={[styles.studentBadge, !item.granted && styles.studentBadgeDenied]}>
                    <Text style={styles.studentBadgeText}>{item.granted ? `+${item.amount} CS` : 'Denegado'}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── COSTOS ── */}
        {activeTab === 'costs' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Infraestructura & Costos</Text>
            <Text style={styles.costsNote}>
              Los costos en tiempo real están disponibles en el panel web (cardsocial.me/admin).
              Aquí se muestran las referencias de los servicios activos.
            </Text>
            {[
              { name: 'Azure Blob Storage', desc: 'Archivos de usuarios (fotos, docs, QRs)', icon: 'microsoft-azure', color: '#0078D4' },
              { name: 'Azure Computer Vision', desc: 'Moderación de contenido (imágenes)', icon: 'eye-check', color: '#0078D4' },
              { name: 'Firebase Firestore', desc: 'Base de datos principal', icon: 'database', color: '#FFA000' },
              { name: 'Firebase Auth', desc: 'Autenticación de usuarios', icon: 'shield-lock', color: '#FFA000' },
              { name: 'Firebase Storage', desc: 'Assets del mercado de íconos', icon: 'folder-multiple', color: '#FFA000' },
              { name: 'Expo EAS', desc: 'Build y distribución de la app', icon: 'cellphone-arrow-down', color: '#4630EB' },
            ].map(svc => (
              <View key={svc.name} style={styles.costRow}>
                <View style={[styles.costIconBox, { backgroundColor: svc.color + '20' }]}>
                  <MaterialCommunityIcons name={svc.icon as any} size={20} color={svc.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.costName}>{svc.name}</Text>
                  <Text style={styles.costDesc}>{svc.desc}</Text>
                </View>
                <View style={styles.costActiveBadge}>
                  <Text style={styles.costActiveText}>ACTIVO</Text>
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={styles.webLink}
              onPress={() => {/* deep link or open browser */}}
            >
              <MaterialCommunityIcons name="open-in-new" size={15} color="#0D4D8A" />
              <Text style={styles.webLinkText}>Ver costos detallados en cardsocial.me/admin</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={kpiStyles.card}>
      <View style={[kpiStyles.iconBox, { backgroundColor: color + '18' }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={kpiStyles.value}>{value}</Text>
      <Text style={kpiStyles.label}>{label}</Text>
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  card: {
    width: '47%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    gap: 6,
  },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  value: { fontSize: 22, fontWeight: '800', color: '#0A2540' },
  label: { fontSize: 11, color: '#777', lineHeight: 14 },
});

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
  tabScroll: { backgroundColor: '#020D1A', flexGrow: 0 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(197,160,101,0.1)',
    gap: 4,
  },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#C5A065' },
  tabText: { color: '#999', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#C5A065' },
  content: { flex: 1, backgroundColor: '#F5F7FA' },
  contentPad: { padding: 16, paddingBottom: 40 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0A2540' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  progressSection: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, gap: 8 },
  progressLabel: { fontSize: 13, fontWeight: '600', color: '#0A2540' },
  progressTrack: { height: 8, backgroundColor: '#E8EDF2', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressCaption: { fontSize: 11, color: '#777' },
  periodRow: { flexDirection: 'row', gap: 8 },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E8EDF2' },
  periodBtnActive: { backgroundColor: '#0D4D8A' },
  periodText: { fontSize: 12, fontWeight: '600', color: '#777' },
  periodTextActive: { color: '#FFF' },
  bigKpi: {
    backgroundColor: '#0A2540',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 4,
  },
  bigKpiValue: { color: '#C5A065', fontSize: 40, fontWeight: '900' },
  bigKpiLabel: { color: 'rgba(197,160,101,0.6)', fontSize: 13 },
  emptyText: { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 32 },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E8EDF2',
  },
  studentEmail: { fontSize: 12, fontWeight: '600', color: '#0A2540' },
  studentMeta: { fontSize: 10, color: '#999', marginTop: 2 },
  studentBadge: { backgroundColor: 'rgba(39,174,96,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  studentBadgeDenied: { backgroundColor: 'rgba(231,76,60,0.12)' },
  studentBadgeText: { fontSize: 11, fontWeight: '700', color: '#27AE60' },
  costsNote: { fontSize: 12, color: '#777', lineHeight: 18, backgroundColor: '#FFF', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#E8EDF2' },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8EDF2',
  },
  costIconBox: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  costName: { fontSize: 13, fontWeight: '700', color: '#0A2540' },
  costDesc: { fontSize: 11, color: '#999', marginTop: 2 },
  costActiveBadge: { backgroundColor: 'rgba(39,174,96,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  costActiveText: { fontSize: 9, fontWeight: '800', color: '#27AE60', letterSpacing: 0.5 },
  webLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D0E4FF',
  },
  webLinkText: { fontSize: 13, color: '#0D4D8A', fontWeight: '600' },
});
