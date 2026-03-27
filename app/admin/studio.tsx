import AdminFontUploader from '@/components/AdminFontUploader';
import AdminIconUploader from '@/components/AdminIconUploader';
import AdminWallpaperUploader from '@/components/AdminWallpaperUploader';
import { getActiveUserId } from '@/services/authSession';
import { isSuperAdmin } from '@/services/roleService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
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

type StudioTab = 'icons' | 'wallpapers' | 'fonts';

export default function AdminStudioScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StudioTab>('icons');
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
    } catch (err) {
      console.error('[AdminStudio] init error:', err);
    } finally {
      setLoading(false);
    }
  };

  const TABS: { key: StudioTab; label: string; icon: string }[] = [
    { key: 'icons', label: 'Iconos 3D', icon: 'cube-outline' },
    { key: 'wallpapers', label: 'Wallpapers', icon: 'image-multiple' },
    { key: 'fonts', label: 'Fonts', icon: 'format-font' },
  ];

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#C5A065" /></View>;
  }
  if (!authorized) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* HEADER */}
      <LinearGradient colors={['#2D1A5C', '#020D1A']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#C5A065" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <MaterialCommunityIcons name="palette" size={18} color="#C5A065" />
          <Text style={styles.headerTitle}>CARD-STUDIO</Text>
        </View>
        <View style={{ width: 36 }} />
      </LinearGradient>

      {/* INFO BANNER */}
      <View style={styles.infoBanner}>
        <MaterialCommunityIcons name="information-outline" size={14} color="#4A2080" />
        <Text style={styles.infoBannerText}>
          Para themes y coleccionables completos usa cardsocial.me/admin (drag-drop + preview).
        </Text>
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
        {activeTab === 'icons' && <AdminIconUploader />}
        {activeTab === 'wallpapers' && <AdminWallpaperUploader />}
        {activeTab === 'fonts' && <AdminFontUploader />}
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(74,32,128,0.12)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74,32,128,0.2)',
  },
  infoBannerText: { flex: 1, fontSize: 11, color: '#4A2080', lineHeight: 15 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#020D1A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(197,160,101,0.1)',
  },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#C5A065' },
  tabText: { color: '#999', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#C5A065' },
  content: { flex: 1, backgroundColor: '#F5F7FA' },
  contentPad: { padding: 16, paddingBottom: 40 },
});
