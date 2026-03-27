import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { getActiveUserId } from '@/services/authSession';
import { getQRHistory } from '@/services/qrGiftService';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

const { width } = Dimensions.get('window');
const CARD_W = (width - 48) / 2;

interface QuickStats {
  balance: number;
  pendingReports: number;
  totalUsers: number;
  activeQRs: number;
}

const AdminDashboard: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<QuickStats>({ balance: 0, pendingReports: 0, totalUsers: 0, activeQRs: 0 });

  useEffect(() => {
    loadQuickStats();
  }, []);

  const loadQuickStats = async () => {
    try {
      const uid = await getActiveUserId();
      if (!uid) return;

      const [userDocSnap, qrHistory, usersSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getQRHistory(uid),
        getDocs(collection(db, 'users')),
      ]);

      const balance = userDocSnap.exists() ? (userDocSnap.data().creditsBalance || 0) : 0;
      const totalUsers = usersSnap.size;
      const activeQRs = qrHistory.filter(q => q.status === 'active').length;

      let pendingReports = 0;
      try {
        const reportsSnap = await getDocs(query(collection(db, 'reports'), where('status', '==', 'pending')));
        pendingReports = reportsSnap.size;
      } catch {
        // collection may not exist yet
      }

      setStats({ balance, pendingReports, totalUsers, activeQRs });
    } catch (error) {
      console.error('[AdminDashboard] Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const MODULES = [
    {
      id: 'mint',
      title: 'MINT',
      subtitle: 'QR Gifts · Activaciones · Historial',
      icon: 'crown' as const,
      colors: ['#0A2540', '#1A3D5C'] as [string, string],
      badge: stats.activeQRs > 0 ? `${stats.activeQRs} activos` : null,
      alert: false,
      route: '/admin/mint',
    },
    {
      id: 'stats',
      title: 'ESTADÍSTICAS',
      subtitle: 'Usuarios · CS Coins · Costos',
      icon: 'chart-bar' as const,
      colors: ['#1A3D5C', '#0D4D8A'] as [string, string],
      badge: `${stats.totalUsers.toLocaleString()} usuarios`,
      alert: false,
      route: '/admin/stats',
    },
    {
      id: 'support',
      title: 'SOPORTE',
      subtitle: 'Reportes · Denuncias · Bans',
      icon: 'shield-alert' as const,
      colors: (stats.pendingReports > 0 ? ['#7B1818', '#A51D1D'] : ['#1A3D5C', '#0D4D8A']) as [string, string],
      badge: stats.pendingReports > 0 ? `${stats.pendingReports} pendientes` : 'Sin pendientes',
      alert: stats.pendingReports > 0,
      route: '/admin/moderation',
    },
    {
      id: 'studio',
      title: 'CARD-STUDIO',
      subtitle: 'Iconos · Wallpapers · Fonts',
      icon: 'palette' as const,
      colors: ['#2D1A5C', '#4A2080'] as [string, string],
      badge: null,
      alert: false,
      route: '/admin/studio',
    },
  ];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#C5A065" />
        <Text style={styles.loadingText}>Cargando The Mint...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* ── HEADER ─────────────────────────────────────────── */}
      <LinearGradient colors={['#020D1A', '#0A2540']} style={styles.header}>
        <View style={styles.headerRow}>
          {onClose ? (
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color="#C5A065" />
            </TouchableOpacity>
          ) : <View style={{ width: 36 }} />}
          <View style={styles.headerTitleRow}>
            <MaterialCommunityIcons name="crown" size={20} color="#C5A065" />
            <Text style={styles.headerTitle}>THE MINT</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.balanceStrip}>
          <View style={styles.balanceItem}>
            <MaterialCommunityIcons name="cash-multiple" size={14} color="#C5A065" />
            <Text style={styles.balanceText}>{stats.balance.toLocaleString()} CS</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceItem}>
            <MaterialCommunityIcons name="account-group" size={14} color="#C5A065" />
            <Text style={styles.balanceText}>{stats.totalUsers.toLocaleString()} usuarios</Text>
          </View>
          {stats.pendingReports > 0 && (
            <>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceItem}>
                <MaterialCommunityIcons name="alert-circle" size={14} color="#E74C3C" />
                <Text style={[styles.balanceText, { color: '#E74C3C' }]}>{stats.pendingReports} reportes</Text>
              </View>
            </>
          )}
        </View>
      </LinearGradient>

      {/* ── 2-COL GRID ─────────────────────────────────────── */}
      <View style={styles.grid}>
        {MODULES.map((mod, idx) => (
          <TouchableOpacity
            key={mod.id}
            style={[styles.card, idx % 2 === 0 ? styles.cardLeft : styles.cardRight]}
            onPress={() => router.push(mod.route as any)}
            activeOpacity={0.82}
          >
            <LinearGradient colors={mod.colors} style={styles.cardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <MaterialCommunityIcons name={mod.icon} size={30} color="#C5A065" />
              <Text style={styles.cardTitle}>{mod.title}</Text>
              <Text style={styles.cardSubtitle}>{mod.subtitle}</Text>
              {mod.badge ? (
                <View style={[styles.cardBadge, mod.alert && styles.cardBadgeAlert]}>
                  <Text style={[styles.cardBadgeText, mod.alert && { color: '#FF6B6B' }]}>{mod.badge}</Text>
                </View>
              ) : null}
            </LinearGradient>
          </TouchableOpacity>
        ))}

        {/* CONFIG — full width */}
        <TouchableOpacity
          style={styles.cardFull}
          onPress={() => router.push('/admin/config' as any)}
          activeOpacity={0.82}
        >
          <LinearGradient colors={['#1A1A2E', '#16213E']} style={styles.cardGradientFull} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <MaterialCommunityIcons name="cog" size={26} color="#C5A065" />
            <View style={styles.cardFullText}>
              <Text style={styles.cardTitle}>SYS CONFIG</Text>
              <Text style={[styles.cardSubtitle, { opacity: 0.65 }]}>Límites · Broadcast · Feature flags</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(197,160,101,0.4)" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#020D1A',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#C5A065',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#020D1A',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  // HEADER
  header: {
    paddingTop: 56,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(197,160,101,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#C5A065',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
  },
  balanceStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(197,160,101,0.08)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 10,
    flexWrap: 'wrap',
  },
  balanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  balanceText: {
    color: '#C5A065',
    fontSize: 13,
    fontWeight: '600',
  },
  balanceDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(197,160,101,0.3)',
  },
  // GRID
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  card: {
    width: CARD_W,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardLeft: {},
  cardRight: {},
  cardGradient: {
    padding: 20,
    minHeight: 170,
    justifyContent: 'flex-end',
    gap: 4,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    lineHeight: 14,
  },
  cardBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(197,160,101,0.2)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cardBadgeAlert: {
    backgroundColor: 'rgba(231,76,60,0.2)',
  },
  cardBadgeText: {
    color: '#C5A065',
    fontSize: 10,
    fontWeight: '700',
  },
  // FULL WIDTH
  cardFull: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardGradientFull: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 14,
  },
  cardFullText: {
    flex: 1,
    gap: 3,
  },
});

export default AdminDashboard;
