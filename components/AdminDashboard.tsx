import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getActiveUserId } from '@/services/authSession';
import { getQRHistory, getAuditLog, type QRGift } from '@/services/qrGiftService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import MintQRGenerator from './MintQRGenerator';
import AdminIconUploader from './AdminIconUploader';
import AdminWallpaperUploader from './AdminWallpaperUploader';
import AdminFontUploader from './AdminFontUploader';
import AdminStudentPackAudits from './AdminStudentPackAudits';

const { width } = Dimensions.get('window');

type AdminTab = 'mint' | 'history' | 'audit' | 'student-pack' | 'icons' | 'wallpapers' | 'fonts';

const AdminDashboard: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('mint');
  const [pochobsUid, setPochobsUid] = useState<string>('');
  const [pochobsBalance, setPochobsBalance] = useState(0);
  const [qrHistory, setQRHistory] = useState<QRGift[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const uid = await getActiveUserId();
      if (!uid) return;

      setPochobsUid(uid);

      // Cargar balance
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        setPochobsBalance(userDoc.data().creditsBalance || 0);
      }

      // Cargar historial de QRs
      const history = await getQRHistory(uid);
      setQRHistory(history);

      // Cargar audit log
      const audit = await getAuditLog(50);
      setAuditLog(audit);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      Alert.alert('Error', 'No se pudo cargar el dashboard');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalGifted = (): number => {
    return qrHistory.reduce((sum, qr) => sum + qr.originalCreditsPool, 0);
  };

  const calculateTotalRedeemed = (): number => {
    return qrHistory.reduce(
      (sum, qr) =>
        sum + (qr.creditsPerUse * qr.redeemedUsers.length),
      0
    );
  };

  const renderQRItem = (item: QRGift) => (
    <View style={styles.qrCard}>
      <View style={styles.qrCardHeader}>
        <View>
          <Text style={styles.qrCardTitle}>{item.id.substring(0, 15)}...</Text>
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
