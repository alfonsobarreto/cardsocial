import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { getActiveUserId } from '@/services/authSession';
import { db } from '@/services/firebaseConfig';
import { getQRHistory } from '@/services/qrGiftService';
import { isSuperAdmin } from '@/services/roleService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { coreTrEsEn } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';

type StatsTab = 'users' | 'coins' | 'costs';
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

export default function AdminStatsScreen() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);
  const intlLocale = language === 'pt' ? 'pt-BR' : language;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StatsTab>('users');
  const [coinsPeriod, setCoinsPeriod] = useState<CoinsPeriod>('month');
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [userStats, setUserStats] = useState<UserStats>({ total: 0, premium: 0, business: 0, businessNull: 0 });
  const [coinsStats, setCoinsStats] = useState<CoinsStats>({ totalGifted: 0, totalRedeemed: 0, thisMonth: 0, thisYear: 0 });
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

      const [usersSnap, businessSnap, qrHistory] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'businessCards')).catch(() => ({ docs: [], size: 0 })),
        getQRHistory(uid),
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

      setAuthorized(true);
    } catch (err) {
      console.error('[AdminStats] init error:', err);
    } finally {
      setLoading(false);
    }
  };

  const TABS: { key: StatsTab; label: string; icon: string }[] = useMemo(
    () => [
      { key: 'users', label: tr('Usuarios', 'Users'), icon: 'account-group' },
      { key: 'coins', label: 'CS Coins', icon: 'cash-multiple' },
      { key: 'costs', label: tr('Costos', 'Costs'), icon: 'server' },
    ],
    [language],
  );

  const costServices = useMemo(
    () => [
      {
        name: tr('Azure Blob Storage', 'Azure Blob Storage'),
        desc: tr('Archivos de usuarios (fotos, docs, QRs)', 'User files (photos, docs, QRs)'),
        icon: 'microsoft-azure' as const,
        color: '#0078D4' as const,
      },
      {
        name: tr('Azure Computer Vision', 'Azure Computer Vision'),
        desc: tr('Moderación de contenido (imágenes)', 'Content moderation (images)'),
        icon: 'eye-check' as const,
        color: '#0078D4' as const,
      },
      {
        name: 'Firebase Firestore',
        desc: tr('Base de datos principal', 'Main database'),
        icon: 'database' as const,
        color: '#FFA000' as const,
      },
      {
        name: 'Firebase Auth',
        desc: tr('Autenticación de usuarios', 'User authentication'),
        icon: 'shield-lock' as const,
        color: '#FFA000' as const,
      },
      {
        name: 'Firebase Storage',
        desc: tr('Assets del mercado de íconos', 'Icon marketplace assets'),
        icon: 'folder-multiple' as const,
        color: '#FFA000' as const,
      },
      {
        name: 'Expo EAS',
        desc: tr('Build y distribución de la app', 'App build and distribution'),
        icon: 'cellphone-arrow-down' as const,
        color: '#4630EB' as const,
      },
    ],
    [language],
  );

  const coinsDisplay = coinsPeriod === 'month' ? coinsStats.thisMonth
    : coinsPeriod === 'year' ? coinsStats.thisYear
    : coinsStats.totalRedeemed;

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#7A42FF" /></View>;
  }
  if (!authorized) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* HEADER */}
      <LinearGradient colors={['#020D1A', '#070226']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#7A42FF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <MaterialCommunityIcons name="chart-bar" size={18} color="#7A42FF" />
          <Text style={styles.headerTitle}>{tr('ESTADÍSTICAS', 'STATISTICS')}</Text>
        </View>
        <View style={{ width: 36 }} />
      </LinearGradient>

      {/* SUB-TABS */}
      <ScrollView horizontal {...verticalScrollInteractionProps} showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <MaterialCommunityIcons name={tab.icon as any} size={15} color={activeTab === tab.key ? '#7A42FF' : '#999'} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.content} {...verticalScrollInteractionProps} contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.contentPad]} showsVerticalScrollIndicator={false}>

        {/* ── USUARIOS ── */}
        {activeTab === 'users' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{tr('Distribución de Usuarios', 'User distribution')}</Text>
            <View style={styles.kpiGrid}>
              <KpiCard icon="account-multiple" label={tr('Total Usuarios', 'Total users')} value={userStats.total.toLocaleString(intlLocale)} color="#2F7BFF" />
              <KpiCard icon="star-circle" label="Premium" value={userStats.premium.toLocaleString(intlLocale)} color="#7A42FF" />
              <KpiCard icon="card-account-details" label="Business Cards" value={userStats.business.toLocaleString(intlLocale)} color="#27AE60" />
              <KpiCard icon="card-off" label={tr('Cards Vacías', 'Empty cards')} value={userStats.businessNull.toLocaleString(intlLocale)} color="#E74C3C" />
            </View>
            <View style={styles.progressSection}>
              <Text style={styles.progressLabel}>{tr('Premium vs Free', 'Premium vs free')}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${userStats.total > 0 ? (userStats.premium / userStats.total) * 100 : 0}%`, backgroundColor: '#7A42FF' }]} />
              </View>
              <Text style={styles.progressCaption}>
                {userStats.premium} {tr('premium', 'premium')} · {userStats.total - userStats.premium} {tr('gratis', 'free')}
              </Text>
            </View>
          </View>
        )}

        {/* ── CS COINS ── */}
        {activeTab === 'coins' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{tr('CS Coins Canjeados', 'CS coins redeemed')}</Text>
            <View style={styles.periodRow}>
              {(['month', 'year', 'all'] as CoinsPeriod[]).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.periodBtn, coinsPeriod === p && styles.periodBtnActive]}
                  onPress={() => setCoinsPeriod(p)}
                >
                  <Text style={[styles.periodText, coinsPeriod === p && styles.periodTextActive]}>
                    {p === 'month' ? tr('Este mes', 'This month') : p === 'year' ? tr('Este año', 'This year') : tr('Total', 'Total')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.bigKpi}>
              <Text style={styles.bigKpiValue}>{coinsDisplay.toLocaleString(intlLocale)}</Text>
              <Text style={styles.bigKpiLabel}>{tr('CS Coins canjeados', 'CS coins redeemed')}</Text>
            </View>
            <View style={styles.kpiGrid}>
              <KpiCard icon="gift" label={tr('Total Gifted (histórico)', 'Total gifted (all-time)')} value={coinsStats.totalGifted.toLocaleString(intlLocale)} color="#9B59B6" />
              <KpiCard icon="check-all" label={tr('Total Canjeado (histórico)', 'Total redeemed (all-time)')} value={coinsStats.totalRedeemed.toLocaleString(intlLocale)} color="#27AE60" />
              <KpiCard icon="calendar-month" label={tr('Canjeado este mes', 'Redeemed this month')} value={coinsStats.thisMonth.toLocaleString(intlLocale)} color="#2F7BFF" />
              <KpiCard icon="calendar" label={tr('Canjeado este año', 'Redeemed this year')} value={coinsStats.thisYear.toLocaleString(intlLocale)} color="#7A42FF" />
            </View>
          </View>
        )}

        {/* ── COSTOS ── */}
        {activeTab === 'costs' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{tr('Infraestructura y Costos', 'Infrastructure and costs')}</Text>
            <Text style={styles.costsNote}>
              {tr(
                'Los costos en tiempo real están disponibles en el panel web (cardsocial.me/admin). Aquí se muestran las referencias de los servicios activos.',
                'Real-time costs are available on the web panel (cardsocial.me/admin). This shows the active service references.',
              )}
            </Text>
            {costServices.map(svc => (
              <View key={svc.name} style={styles.costRow}>
                <View style={[styles.costIconBox, { backgroundColor: svc.color + '20' }]}>
                  <MaterialCommunityIcons name={svc.icon as any} size={20} color={svc.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.costName}>{svc.name}</Text>
                  <Text style={styles.costDesc}>{svc.desc}</Text>
                </View>
                <View style={styles.costActiveBadge}>
                  <Text style={styles.costActiveText}>{tr('ACTIVO', 'ACTIVE')}</Text>
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={styles.webLink}
              onPress={() => {/* deep link or open browser */}}
            >
              <MaterialCommunityIcons name="open-in-new" size={15} color="#2F7BFF" />
              <Text style={styles.webLinkText}>
                {tr('Ver costos detallados en cardsocial.me/admin', 'View detailed costs at cardsocial.me/admin')}
              </Text>
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
  value: { fontSize: 22, fontWeight: '800', color: '#070226' },
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
  headerTitle: { color: '#7A42FF', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  tabScroll: { backgroundColor: '#020D1A', flexGrow: 0 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(197,160,101,0.1)',
    gap: 4,
  },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#7A42FF' },
  tabText: { color: '#999', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#7A42FF' },
  content: { flex: 1, backgroundColor: '#F5F7FA' },
  contentPad: { padding: 16, paddingBottom: 40 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#070226' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  progressSection: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, gap: 8 },
  progressLabel: { fontSize: 13, fontWeight: '600', color: '#070226' },
  progressTrack: { height: 8, backgroundColor: '#E8EDF2', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressCaption: { fontSize: 11, color: '#777' },
  periodRow: { flexDirection: 'row', gap: 8 },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E8EDF2' },
  periodBtnActive: { backgroundColor: '#2F7BFF' },
  periodText: { fontSize: 12, fontWeight: '600', color: '#777' },
  periodTextActive: { color: '#FFF' },
  bigKpi: {
    backgroundColor: '#070226',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 4,
  },
  bigKpiValue: { color: '#7A42FF', fontSize: 40, fontWeight: '900' },
  bigKpiLabel: { color: 'rgba(197,160,101,0.6)', fontSize: 13 },
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
  costName: { fontSize: 13, fontWeight: '700', color: '#070226' },
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
  webLinkText: { fontSize: 13, color: '#2F7BFF', fontWeight: '600' },
});
