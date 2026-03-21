import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getActiveUserId } from '@/services/authSession';
import {
  getWallpaperFolderPaths,
  uploadWallpaperAsAdmin,
  type WallpaperOrientation,
  type WallpaperTier,
} from '@/services/wallpaperService';

type UploadState = {
  fileUri: string | null;
  fileName: string;
  orientation: WallpaperOrientation;
  tier: WallpaperTier;
  priceCredits: string;
  loading: boolean;
};

const AdminWallpaperUploader: React.FC = () => {
  const [state, setState] = useState<UploadState>({
    fileUri: null,
    fileName: '',
    orientation: 'vertical',
    tier: 'free',
    priceCredits: '0',
    loading: false,
  });
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const boot = async () => {
      const uid = await getActiveUserId();
      setUserId(uid);
    };
    boot();
  }, []);

  const resolvedPrice = useMemo(() => {
    if (state.tier === 'free') {
      return 0;
    }
    const parsed = Number(state.priceCredits || '0');
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }, [state.tier, state.priceCredits]);

  const pickWallpaper = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setState((prev) => ({
          ...prev,
          fileUri: asset.uri,
          fileName: asset.fileName || `wallpaper-${Date.now()}.jpg`,
        }));
      }
    } catch {
      Alert.alert('Error', 'No se pudo seleccionar la imagen.');
    }
  };

  const submitUpload = async () => {
    if (!userId || !state.fileUri) {
      Alert.alert('Faltan datos', 'Selecciona un archivo antes de subir.');
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));
    try {
      const result = await uploadWallpaperAsAdmin({
        fileUri: state.fileUri,
        fileName: state.fileName,
        orientation: state.orientation,
        tier: state.tier,
        priceCredits: resolvedPrice,
        userId,
      });

      if (!result.success) {
        Alert.alert('Error al subir', result.error || 'No se pudo subir el wallpaper.');
        return;
      }

      Alert.alert(
        'Upload exitoso',
        `Guardado en assets/wallpapers/${state.orientation}/${state.tier === 'premium' ? 'legendary' : 'common'}/full y thumbs` +
          (state.tier === 'premium' ? `\nPrecio: ${resolvedPrice} CS` : ''),
      );

      setState((prev) => ({
        ...prev,
        fileUri: null,
        fileName: '',
        loading: false,
      }));
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo subir el wallpaper.');
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    setState((prev) => ({ ...prev, loading: false }));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#0A2540', '#1A3D5C']} style={styles.header}>
        <MaterialCommunityIcons name="image-multiple" size={28} color="#C5A065" />
        <Text style={styles.headerTitle}>Wallpaper Uploader</Text>
        <Text style={styles.headerSub}>Alta resolución + thumbnails automáticos</Text>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1) Imagen Base</Text>
        <TouchableOpacity style={styles.uploadBtn} onPress={pickWallpaper}>
          <MaterialCommunityIcons name="cloud-upload-outline" size={28} color="#0A2540" />
          <Text style={styles.uploadText}>{state.fileName || 'Seleccionar wallpaper (JPG/PNG)'}</Text>
        </TouchableOpacity>

        {state.fileUri ? <Image source={{ uri: state.fileUri }} style={styles.preview} resizeMode="cover" /> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2) Orientación</Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.chip, state.orientation === 'vertical' && styles.chipActive]}
            onPress={() => setState((prev) => ({ ...prev, orientation: 'vertical' }))}
          >
            <Text style={[styles.chipText, state.orientation === 'vertical' && styles.chipTextActive]}>Vertical</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, state.orientation === 'horizontal' && styles.chipActive]}
            onPress={() => setState((prev) => ({ ...prev, orientation: 'horizontal' }))}
          >
            <Text style={[styles.chipText, state.orientation === 'horizontal' && styles.chipTextActive]}>Horizontal</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3) Nivel</Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.chip, state.tier === 'free' && styles.chipActive]}
            onPress={() => setState((prev) => ({ ...prev, tier: 'free', priceCredits: '0' }))}
          >
            <Text style={[styles.chipText, state.tier === 'free' && styles.chipTextActive]}>Free</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, state.tier === 'premium' && styles.chipActive]}
            onPress={() => setState((prev) => ({ ...prev, tier: 'premium', priceCredits: prev.priceCredits || '40' }))}
          >
            <Text style={[styles.chipText, state.tier === 'premium' && styles.chipTextActive]}>Premium</Text>
          </TouchableOpacity>
        </View>
      </View>

      {state.tier === 'premium' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4) Precio (Créditos CS)</Text>
          <TextInput
            value={state.priceCredits}
            onChangeText={(value) => setState((prev) => ({ ...prev, priceCredits: value.replace(/[^0-9]/g, '') }))}
            keyboardType="number-pad"
            style={styles.input}
            placeholder="40"
            placeholderTextColor="#7A9AB0"
          />
        </View>
      ) : null}

      <View style={styles.pathsBox}>
        <Text style={styles.pathsTitle}>Rutas activas de Cloud Wallpapers</Text>
        {getWallpaperFolderPaths().map((path) => (
          <Text key={path} style={styles.pathLine}>{path}</Text>
        ))}
      </View>

      <TouchableOpacity style={styles.submitBtn} onPress={submitUpload} disabled={state.loading}>
        {state.loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <MaterialCommunityIcons name="content-save" size={18} color="#FFFFFF" />
            <Text style={styles.submitText}>Subir Wallpaper</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 24 },
  header: {
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#D4EAF7', fontSize: 12 },
  section: { marginHorizontal: 16, marginTop: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0A2540', marginBottom: 8 },
  uploadBtn: {
    borderWidth: 1,
    borderColor: '#B6CCE0',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  uploadText: { color: '#0A2540', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  preview: { marginTop: 10, width: '100%', height: 140, borderRadius: 10 },
  row: { flexDirection: 'row', gap: 10 },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#B6CCE0',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  chipActive: { borderColor: '#C5A065', backgroundColor: 'rgba(197, 160, 101, 0.15)' },
  chipText: { color: '#4A4A4A', fontWeight: '600' },
  chipTextActive: { color: '#0A2540' },
  input: {
    borderWidth: 1,
    borderColor: '#B6CCE0',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: '#0A2540',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: '600',
  },
  pathsBox: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#EAF3FA',
  },
  pathsTitle: { color: '#0A2540', fontWeight: '700', marginBottom: 8 },
  pathLine: { color: '#35566F', fontSize: 12, marginBottom: 2 },
  submitBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: '#0A2540',
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  submitText: { color: '#FFFFFF', fontWeight: '700' },
});

export default AdminWallpaperUploader;
