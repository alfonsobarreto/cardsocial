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
          <Text style={styles.qrCardDate}>
            {item.createdAt
              ? new Date(item.createdAt.toMillis()).toLocaleDateString()
              : 'N/A'}
          </Text>
        </View>
        <View style={[styles.statusBadge, item.status === 'active' && styles.statusActive]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.qrCardStats}>
        <View style={styles.statItem}>
          <MaterialCommunityIcons name="cash" size={16} color="#C5A065" />
          <Text style={styles.statText}>
            {item.creditsPerUse} CS x {item.maxUses}
          </Text>
        </View>
        <View style={styles.statItem}>
          <MaterialCommunityIcons name="check-circle" size={16} color="#2ECC71" />
          <Text style={styles.statText}>
            {item.redeemedUsers.length}/{item.maxUses}
          </Text>
        </View>
        <View style={styles.statItem}>
          <MaterialCommunityIcons name="calendar" size={16} color="#3498DB" />
          <Text style={styles.statText}>
            {item.maxExpiresIn ? Math.ceil(item.maxExpiresIn / (24 * 60 * 60 * 1000)) : '∞'} días
          </Text>
        </View>
      </View>

      <LinearGradient
        colors={['rgba(197, 160, 101, 0.2)', 'rgba(197, 160, 101, 0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.progressContainer}
      >
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${(item.redeemedUsers.length / item.maxUses) * 100}%`,
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {item.redeemedUsers.length} de {item.maxUses} canjeados
        </Text>
      </LinearGradient>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* TAB SELECTOR */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'mint' && styles.tabActive]}
          onPress={() => setActiveTab('mint')}
        >
          <MaterialCommunityIcons name="crown" size={18} color={activeTab === 'mint' ? '#C5A065' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'mint' && styles.tabTextActive]}>Mint</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <MaterialCommunityIcons name="qrcode" size={18} color={activeTab === 'history' ? '#C5A065' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>QR History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'audit' && styles.tabActive]}
          onPress={() => setActiveTab('audit')}
        >
          <MaterialCommunityIcons name="file-document" size={18} color={activeTab === 'audit' ? '#C5A065' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'audit' && styles.tabTextActive]}>Auditoría</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'student-pack' && styles.tabActive]}
          onPress={() => setActiveTab('student-pack')}
        >
          <MaterialCommunityIcons name="school" size={18} color={activeTab === 'student-pack' ? '#C5A065' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'student-pack' && styles.tabTextActive]}>Student</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'icons' && styles.tabActive]}
          onPress={() => setActiveTab('icons')}
        >
          <MaterialCommunityIcons name="palette-advanced" size={18} color={activeTab === 'icons' ? '#C5A065' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'icons' && styles.tabTextActive]}>Icons</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'wallpapers' && styles.tabActive]}
          onPress={() => setActiveTab('wallpapers')}
        >
          <MaterialCommunityIcons name="image-multiple" size={18} color={activeTab === 'wallpapers' ? '#C5A065' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'wallpapers' && styles.tabTextActive]}>Wallpapers</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'fonts' && styles.tabActive]}
          onPress={() => setActiveTab('fonts')}
        >
          <MaterialCommunityIcons name="format-font" size={18} color={activeTab === 'fonts' ? '#C5A065' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'fonts' && styles.tabTextActive]}>Fonts</Text>
        </TouchableOpacity>
      </View>

      {/* STATS */}
      <View style={styles.statsContainer}>
        <LinearGradient colors={['#0A2540', '#1A3D5C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statBox}>
          <View>
            <Text style={styles.statLabel}>Balance Actual</Text>
            <Text style={styles.statValue}>{pochobsBalance.toLocaleString()}</Text>
          </View>
          <MaterialCommunityIcons name="cash-multiple" size={28} color="#C5A065" />
        </LinearGradient>

        <LinearGradient colors={['#C5A065', '#E8C547']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statBox}>
          <View>
            <Text style={[styles.statLabel, { color: '#0A2540' }]}>Total Gifted</Text>
            <Text style={[styles.statValue, { color: '#0A2540' }]}>{calculateTotalGifted().toLocaleString()}</Text>
          </View>
          <MaterialCommunityIcons name="gift" size={28} color="#0A2540" />
        </LinearGradient>

        <LinearGradient colors={['#2ECC71', '#27AE60']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statBox}>
          <View>
            <Text style={[styles.statLabel, { color: '#FFF' }]}>Canjeados</Text>
            <Text style={[styles.statValue, { color: '#FFF' }]}>{calculateTotalRedeemed().toLocaleString()}</Text>
          </View>
          <MaterialCommunityIcons name="check-all" size={28} color="#FFF" />
        </LinearGradient>
      </View>

      {/* CONTENT */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {activeTab === 'mint' && (
          <View>
            {pochobsUid ? <MintQRGenerator pochobsUid={pochobsUid} onClose={onClose} /> : null}
          </View>
        )}

        {activeTab === 'history' && (
          <View>
            <Text style={styles.sectionTitle}>Tus QRs Generados</Text>
            {qrHistory.length === 0 ? (
              <Text style={styles.emptyText}>No has generado ningún QR aún</Text>
            ) : (
              <FlatList
                data={qrHistory}
                renderItem={({ item }) => renderQRItem(item)}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            )}
          </View>
        )}

        {activeTab === 'audit' && (
          <View>
            <Text style={styles.sectionTitle}>Registro de Auditoría</Text>
            {auditLog.length === 0 ? (
              <Text style={styles.emptyText}>No hay registros de auditoría</Text>
            ) : (
              auditLog.map((entry, idx) => (
                <View key={idx} style={styles.auditItem}>
                  <View style={styles.auditIcon}>
                    <MaterialCommunityIcons name="qrcode" size={16} color="#C5A065" />
                  </View>
                  <View style={styles.auditContent}>
                    <Text style={styles.auditAction}>QR Generado (ID: {entry.giftId?.substring(0, 12)}...)</Text>
                    <Text style={styles.auditDate}>
                      {entry.timestamp ? new Date(entry.timestamp.toMillis()).toLocaleString() : 'N/A'}
                    </Text>
                  </View>
                  <Text style={styles.auditAmount}>-{entry.creditsDeducted} CS</Text>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'student-pack' && (
          <AdminStudentPackAudits />
        )}

        {activeTab === 'icons' && (
          <AdminIconUploader />
        )}

        {activeTab === 'wallpapers' && (
          <AdminWallpaperUploader />
        )}

        {activeTab === 'fonts' && (
          <AdminFontUploader />
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },

  tabSelector: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFF',
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  tabActive: {
    backgroundColor: 'rgba(197, 160, 101, 0.1)',
  },
  tabText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#C5A065',
    fontWeight: '700',
  },

  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  statBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#CCC',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginTop: 4,
  },

  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A2540',
    marginBottom: 12,
  },

  emptyText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 24,
  },

  qrCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  qrCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  qrCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0A2540',
  },
  qrCardDate: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: 'rgba(46, 204, 113, 0.2)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2ECC71',
  },

  qrCardStats: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 11,
    color: '#666',
  },

  progressContainer: {
    borderRadius: 8,
    padding: 10,
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#C5A065',
  },
  progressText: {
    fontSize: 10,
    color: '#666',
  },

  auditItem: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#C5A065',
  },
  auditIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(197, 160, 101, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  auditContent: {
    flex: 1,
  },
  auditAction: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0A2540',
  },
  auditDate: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  auditAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E74C3C',
  },
});

export default AdminDashboard;
