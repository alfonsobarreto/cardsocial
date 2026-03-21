import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getActiveUserId } from '@/services/authSession';
import { getFontFolderPaths, uploadFontAsAdmin, type FontTier } from '@/services/fontLibraryService';

const AdminFontUploader: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tier, setTier] = useState<FontTier>('free');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      const uid = await getActiveUserId();
      setUserId(uid);
    };
    init();
  }, []);

  const pickFont = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['font/ttf', 'font/otf', 'application/x-font-ttf', 'application/x-font-otf'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const file = result.assets[0];
      setFileUri(file.uri);
      setFileName(file.name || 'font.ttf');
      setDisplayName((file.name || 'font').replace(/\.(ttf|otf)$/i, ''));
    } catch {
      Alert.alert('Error', 'No se pudo seleccionar el archivo de fuente.');
    }
  };

  const upload = async () => {
    if (!userId || !fileUri || !fileName || !displayName.trim()) {
      Alert.alert('Campos requeridos', 'Selecciona fuente y nombre visible.');
      return;
    }

    setLoading(true);
    try {
      const res = await uploadFontAsAdmin({
        fileUri,
        fileName,
        displayName: displayName.trim(),
        tier,
        userId,
      });

      if (!res.success) {
        Alert.alert('Error', res.error || 'No se pudo subir la fuente.');
        return;
      }

      Alert.alert('Fuente subida', `Disponible en fonts/${tier}`);
      setFileUri(null);
      setFileName('');
      setDisplayName('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#0A2540', '#1A3D5C']} style={styles.header}>
        <MaterialCommunityIcons name="format-font" size={28} color="#C5A065" />
        <Text style={styles.headerTitle}>Font Uploader</Text>
        <Text style={styles.headerSub}>Sube .ttf o .otf y clasifica Free/Premium</Text>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1) Archivo de fuente</Text>
        <TouchableOpacity style={styles.pickBtn} onPress={pickFont}>
          <MaterialCommunityIcons name="file-upload-outline" size={24} color="#0A2540" />
          <Text style={styles.pickText}>{fileName || 'Seleccionar .ttf o .otf'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2) Nombre visible</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Ej: Luxe Serif"
          placeholderTextColor="#7A9AB0"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3) Nivel</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.chip, tier === 'free' && styles.chipActive]} onPress={() => setTier('free')}>
            <Text style={[styles.chipText, tier === 'free' && styles.chipTextActive]}>Free</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, tier === 'premium' && styles.chipActive]} onPress={() => setTier('premium')}>
            <Text style={[styles.chipText, tier === 'premium' && styles.chipTextActive]}>Premium</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.pathsBox}>
        <Text style={styles.pathsTitle}>Rutas de Cloud Fonts</Text>
        {getFontFolderPaths().map((path) => (
          <Text key={path} style={styles.pathLine}>{path}</Text>
        ))}
      </View>

      <TouchableOpacity style={styles.submitBtn} onPress={upload} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Subir Fuente</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 24 },
  header: { borderRadius: 14, marginHorizontal: 16, marginTop: 14, padding: 14, gap: 6 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#D4EAF7', fontSize: 12 },
  section: { marginHorizontal: 16, marginTop: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0A2540', marginBottom: 8 },
  pickBtn: { borderWidth: 1, borderColor: '#B6CCE0', borderRadius: 10, backgroundColor: '#FFFFFF', padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  pickText: { color: '#0A2540', fontWeight: '600', flex: 1 },
  input: { borderWidth: 1, borderColor: '#B6CCE0', borderRadius: 10, backgroundColor: '#FFFFFF', color: '#0A2540', paddingHorizontal: 12, paddingVertical: 10, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1, borderWidth: 1, borderColor: '#B6CCE0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#FFFFFF' },
  chipActive: { borderColor: '#C5A065', backgroundColor: 'rgba(197, 160, 101, 0.15)' },
  chipText: { color: '#4A4A4A', fontWeight: '600' },
  chipTextActive: { color: '#0A2540' },
  pathsBox: { marginHorizontal: 16, marginTop: 16, borderRadius: 10, padding: 12, backgroundColor: '#EAF3FA' },
  pathsTitle: { color: '#0A2540', fontWeight: '700', marginBottom: 8 },
  pathLine: { color: '#35566F', fontSize: 12, marginBottom: 2 },
  submitBtn: { marginHorizontal: 16, marginTop: 16, borderRadius: 12, backgroundColor: '#0A2540', paddingVertical: 12, alignItems: 'center' },
  submitText: { color: '#FFFFFF', fontWeight: '700' },
});

export default AdminFontUploader;
