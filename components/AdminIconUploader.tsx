import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { uploadIconAsAdmin, getIconCategories } from '@/services/iconLibraryService';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { getActiveUserId } from '@/services/authSession';
import { trEsEn, useLanguage } from '@/services/language';
import { createIconPack, type IconPack } from '@/services/iconPackService';

/**
 * Admin Icon Uploader
 * 
 * Panel para que Pochobs suba iconos a Firebase Storage
 * Rutas: /free-icons/{category}/ o /premium-icons/{category}/
 */

interface IconUploadState {
  file: string | null;
  fileName: string;
  category: string;
  type: 'free' | 'premium';
  loading: boolean;
  uploadProgress: number;
  createDrop: boolean;
  dropName: string;
  dropDescription: string;
  dropBrand: string;
  dropCredits: string;
  dropStock: string;
  dropRarity: IconPack['rarity'];
  dropSection: 'featured' | 'newest' | 'most_popular' | 'collectible' | 'out_of_stock' | 'retail';
}

const AdminIconUploader: React.FC = () => {
  const [state, setState] = useState<IconUploadState>({
    file: null,
    fileName: '',
    category: 'communication',
    type: 'free',
    loading: false,
    uploadProgress: 0,
    createDrop: false,
    dropName: '',
    dropDescription: '',
    dropBrand: 'Card-Social',
    dropCredits: '900',
    dropStock: '100',
    dropRarity: 'legendary',
    dropSection: 'collectible',
  });

  const [categories, setCategories] = useState<string[]>([]);
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const { language } = useLanguage();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
  const modalFooterBottomPad = useModalFooterBottomPad();

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const uid = await getActiveUserId();
      setUserId(uid);

      const cats = await getIconCategories();
      setCategories(cats.length > 0 ? cats : ['communication', 'social', 'payment', 'custom']);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setState((prev) => ({
          ...prev,
          file: asset.uri,
          fileName: asset.fileName || `icon-${Date.now()}.png`,
        }));
      }
    } catch (error) {
      Alert.alert(tr('Error', 'Error'), tr('No se pudo seleccionar la imagen', 'Could not select the image'));
    }
  };

  const handleAddCategory = () => {
    if (!newCategory.trim()) {
      Alert.alert(tr('Error', 'Error'), tr('Ingresa un nombre de categoría', 'Enter a category name'));
      return;
    }

    const categoryName = newCategory.toLowerCase().trim();
    if (!categories.includes(categoryName)) {
      setCategories([...categories, categoryName]);
      setState((prev) => ({ ...prev, category: categoryName }));
    }

    setNewCategory('');
    setShowCategoryInput(false);
  };

  const handleUpload = async () => {
    if (!state.file || !state.fileName || !state.category || !userId) {
      Alert.alert(tr('Error', 'Error'), tr('Por favor completa todos los campos', 'Please fill in all fields'));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, uploadProgress: 0 }));

    try {
      // Simular progreso
      setState((prev) => ({ ...prev, uploadProgress: 30 }));

      // Subir icono
      const result = await uploadIconAsAdmin(
        state.file,
        state.fileName,
        state.category,
        state.type,
        userId,
        state.dropRarity,
      );

      setState((prev) => ({ ...prev, uploadProgress: 100 }));

      if (result.success) {
        if (state.createDrop && result.url) {
          const categoryMap: Record<string, IconPack['category']> = {
            communication: 'communication',
            social: 'social',
            payment: 'payment',
            custom: 'custom',
            premium: 'premium',
          };
          const creditsPrice = Math.max(1, Number(state.dropCredits || 900));
          const stock = Math.max(1, Number(state.dropStock || 100));
          await createIconPack(userId, {
            name: state.dropName.trim() || state.fileName.replace(/\.[^/.]+$/, ''),
            description:
              state.dropDescription.trim() ||
              tr('Drop exclusivo de', 'Exclusive drop from') + ` ${state.dropBrand || 'Card-Social'}`,
            category: categoryMap[state.category] || 'custom',
            iconCount: 1,
            creditsPrice,
            previewImages: [result.url],
            folderPath: `${state.type}-icons/${state.category}/`,
            rarity: state.dropRarity,
            isActive: true,
            isLimitedEdition: true,
            stockTotal: stock,
            stockRemaining: stock,
            max_supply: stock,
            current_supply: stock,
            brand: state.dropBrand.trim() || 'Card-Social',
            dropLabel: `${state.dropBrand.trim() || 'CS'} Limited Drop`,
            isCollectible: true,
            storeSection: state.dropSection,
          });
        }

        Alert.alert(
          tr('✅ Éxito', '✅ Success'),
          state.createDrop
            ? tr(
                `Icono + drop limitados listos en /${state.type}-icons/${state.category}/`,
                `Icon + limited drop ready at /${state.type}-icons/${state.category}/`,
              )
            : tr(
                `Icono subido exitosamente a /${state.type}-icons/${state.category}/`,
                `Icon uploaded successfully to /${state.type}-icons/${state.category}/`,
              ),
        );

        // Reset form
        setState({
          file: null,
          fileName: '',
          category: state.category,
          type: state.type,
          loading: false,
          uploadProgress: 0,
          createDrop: state.createDrop,
          dropName: '',
          dropDescription: '',
          dropBrand: state.dropBrand,
          dropCredits: state.dropCredits,
          dropStock: state.dropStock,
          dropRarity: state.dropRarity,
          dropSection: state.dropSection,
        });
      } else {
        Alert.alert(
          tr('Error', 'Error'),
          tr('Error al subir el icono', 'Error uploading icon'),
        );
      }
    } catch (error) {
      Alert.alert(
        tr('Error', 'Error'),
        userFacingAlertMessage(error, language, tr('Error desconocido', 'Unknown error')),
      );
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <LinearGradient
        colors={['#0A2540', '#1A3D5C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <MaterialCommunityIcons name="palette-advanced" size={32} color="#C5A065" />
        <Text style={styles.headerTitle}>{tr('Icon Library Manager', 'Icon Library Manager')}</Text>
        <Text style={styles.headerSubtitle}>
          {tr('Sube diseños PNG/GIF a Firebase Storage', 'Upload PNG/GIF designs to Firebase Storage')}
        </Text>
      </LinearGradient>

      {/* FILE PICKER */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{tr('📷 Seleccionar imagen', '📷 Select image')}</Text>

        {state.file ? (
          <View style={styles.selectedFileBox}>
            <MaterialCommunityIcons name="check-circle" size={24} color="#2ECC71" />
            <Text style={styles.selectedFileName}>{state.fileName}</Text>
            <TouchableOpacity onPress={() => setState((prev) => ({ ...prev, file: null }))}>
              <MaterialCommunityIcons name="close" size={20} color="#E74C3C" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
            <MaterialCommunityIcons name="cloud-upload-outline" size={32} color="#C5A065" />
            <Text style={styles.uploadButtonText}>
              {tr('Toca para seleccionar imagen', 'Tap to select an image')}
            </Text>
            <Text style={styles.uploadButtonHint}>
              {tr('PNG o GIF recomendado', 'PNG or GIF recommended')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* TYPE SELECTOR */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{tr('🏷️ Tipo de icono', '🏷️ Icon type')}</Text>

        <View style={styles.typeSelector}>
          <TouchableOpacity
            style={[
              styles.typeButton,
              state.type === 'free' && styles.typeButtonActive,
            ]}
            onPress={() => setState((prev) => ({ ...prev, type: 'free' }))}
          >
            <MaterialCommunityIcons
              name="gift-open"
              size={20}
              color={state.type === 'free' ? '#C5A065' : '#999'}
            />
            <Text
              style={[
                styles.typeButtonText,
                state.type === 'free' && styles.typeButtonTextActive,
              ]}
            >
              {tr('Gratis', 'Free')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeButton,
              state.type === 'premium' && styles.typeButtonActive,
            ]}
            onPress={() => setState((prev) => ({ ...prev, type: 'premium' }))}
          >
            <MaterialCommunityIcons
              name="star"
              size={20}
              color={state.type === 'premium' ? '#C5A065' : '#999'}
            />
            <Text
              style={[
                styles.typeButtonText,
                state.type === 'premium' && styles.typeButtonTextActive,
              ]}
            >
              {tr('Premium', 'Premium')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.typeInfo}>
          <MaterialCommunityIcons name="information-outline" size={16} color="#3498DB" />
          <Text style={styles.typeInfoText}>
            {state.type === 'free'
              ? tr('Disponible para todos los usuarios', 'Available to all users')
              : tr('También visible para todos en modo lujo masivo', 'Visible to all in mass luxury mode')}
          </Text>
        </View>
      </View>

      {/* CATEGORY SELECTOR */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{tr('📁 Categoría', '📁 Category')}</Text>

        <View style={styles.categoryList}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryChip,
                state.category === cat && styles.categoryChipActive,
              ]}
              onPress={() => setState((prev) => ({ ...prev, category: cat }))}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  state.category === cat && styles.categoryChipTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.categoryChipAdd}
            onPress={() => setShowCategoryInput(true)}
          >
            <MaterialCommunityIcons name="plus" size={16} color="#C5A065" />
          </TouchableOpacity>
        </View>
      </View>

      {/* LIMITED DROP CONFIG */}
      <View style={styles.section}>
        <View style={styles.dropHeaderRow}>
          <Text style={styles.sectionTitle}>{tr('🚀 Drop exclusivo por marca', '🚀 Branded exclusive drop')}</Text>
          <TouchableOpacity
            style={[styles.dropToggle, state.createDrop && styles.dropToggleActive]}
            onPress={() => setState((prev) => ({ ...prev, createDrop: !prev.createDrop }))}
          >
            <Text style={[styles.dropToggleText, state.createDrop && styles.dropToggleTextActive]}>
              {state.createDrop ? tr('ACTIVO', 'ON') : 'OFF'}
            </Text>
          </TouchableOpacity>
        </View>

        {state.createDrop && (
          <View style={styles.dropCard}>
            <TextInput
              style={styles.dropInput}
              placeholder={tr('Nombre del drop (ej. Legend Gold #1)', 'Drop name (e.g. Legend Gold #1)')}
              placeholderTextColor="#999"
              value={state.dropName}
              onChangeText={(v) => setState((prev) => ({ ...prev, dropName: v }))}
            />
            <TextInput
              style={styles.dropInput}
              placeholder={tr('Marca (ej. Pochobs Atelier)', 'Brand (e.g. Pochobs Atelier)')}
              placeholderTextColor="#999"
              value={state.dropBrand}
              onChangeText={(v) => setState((prev) => ({ ...prev, dropBrand: v }))}
            />
            <TextInput
              style={styles.dropInput}
              placeholder={tr('Descripción', 'Description')}
              placeholderTextColor="#999"
              value={state.dropDescription}
              onChangeText={(v) => setState((prev) => ({ ...prev, dropDescription: v }))}
            />
            <View style={styles.dropInputRow}>
              <TextInput
                style={[styles.dropInput, styles.dropInputHalf]}
                keyboardType="numeric"
                placeholder={tr('Precio CS', 'CS price')}
                placeholderTextColor="#999"
                value={state.dropCredits}
                onChangeText={(v) => setState((prev) => ({ ...prev, dropCredits: v }))}
              />
              <TextInput
                style={[styles.dropInput, styles.dropInputHalf]}
                keyboardType="numeric"
                placeholder={tr('Stock', 'Stock')}
                placeholderTextColor="#999"
                value={state.dropStock}
                onChangeText={(v) => setState((prev) => ({ ...prev, dropStock: v }))}
              />
            </View>
            <Text style={styles.dropHint}>
              {tr(
                'Este drop creará límite real de stock en la tienda.',
                'This drop will set a real stock limit in the store.',
              )}
            </Text>
            <View style={styles.sectionPickerRow}>
              {[
                { id: 'featured', label: tr('Destacado', 'Featured') },
                { id: 'newest', label: tr('Novedades', 'Newest') },
                { id: 'most_popular', label: tr('Popular', 'Popular') },
                { id: 'collectible', label: tr('Coleccionable', 'Collectible') },
                { id: 'retail', label: tr('Tienda', 'Retail') },
              ].map((section) => (
                <TouchableOpacity
                  key={section.id}
                  style={[
                    styles.sectionChip,
                    state.dropSection === section.id && styles.sectionChipActive,
                  ]}
                  onPress={() =>
                    setState((prev) => ({
                      ...prev,
                      dropSection: section.id as IconUploadState['dropSection'],
                    }))
                  }
                >
                  <Text
                    style={[
                      styles.sectionChipText,
                      state.dropSection === section.id && styles.sectionChipTextActive,
                    ]}
                  >
                    {section.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* UPLOAD BUTTON */}
      <TouchableOpacity
        style={[styles.uploadActionButton, state.loading && styles.uploadActionButtonDisabled]}
        onPress={handleUpload}
        disabled={state.loading || !state.file}
      >
        {state.loading ? (
          <>
            <ActivityIndicator color="#FFF" size="small" />
            <Text style={styles.uploadActionButtonText}>
              {tr('Subiendo…', 'Uploading…')} {state.uploadProgress}%
            </Text>
          </>
        ) : (
          <>
            <MaterialCommunityIcons name="cloud-upload" size={20} color="#FFF" />
            <Text style={styles.uploadActionButtonText}>
              {tr('Subir icono a Firebase', 'Upload icon to Firebase')}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* INFO BOX */}
      <View style={styles.infoBox}>
        <MaterialCommunityIcons name="server" size={20} color="#3498DB" />
        <View style={styles.infoContent}>
          <Text style={styles.infoTitle}>{tr('Ruta en Firebase Storage', 'Path in Firebase Storage')}</Text>
          <Text style={styles.infoPath}>
            /assets/icons/{state.category}/{state.dropRarity}/{state.fileName || tr('archivo', 'file')}
          </Text>
        </View>
      </View>

      {/* MODAL: NEW CATEGORY */}
      <Modal
        visible={showCategoryInput}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryInput(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{tr('Nueva categoría', 'New category')}</Text>

            <TextInput
              style={styles.modalInput}
              placeholder={tr('Ej: payment, social, communication', 'E.g. payment, social, communication')}
              placeholderTextColor="#999"
              value={newCategory}
              onChangeText={setNewCategory}
            />

            <View style={[styles.modalButtons, { paddingBottom: modalFooterBottomPad }]}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => {
                  setShowCategoryInput(false);
                  setNewCategory('');
                }}
              >
                <Text style={styles.modalButtonText}>{tr('Cancelar', 'Cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalButtonConfirm}
                onPress={handleAddCategory}
              >
                <Text style={[styles.modalButtonText, { color: '#FFF' }]}>{tr('Crear', 'Create')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  header: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#CCC',
  },

  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A2540',
    marginBottom: 12,
  },

  uploadButton: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#C5A065',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(197, 160, 101, 0.05)',
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A2540',
  },
  uploadButtonHint: {
    fontSize: 12,
    color: '#999',
  },

  selectedFileBox: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#2ECC71',
  },
  selectedFileName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0A2540',
  },

  typeSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    gap: 6,
  },
  typeButtonActive: {
    backgroundColor: 'rgba(197, 160, 101, 0.15)',
    borderColor: '#C5A065',
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  typeButtonTextActive: {
    color: '#C5A065',
  },

  typeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    borderRadius: 8,
  },
  typeInfoText: {
    fontSize: 11,
    color: '#3498DB',
    fontWeight: '500',
  },
  dropHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropToggle: {
    borderWidth: 1,
    borderColor: '#C5A065',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFF',
  },
  dropToggleActive: {
    backgroundColor: '#C5A065',
  },
  dropToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C5A065',
  },
  dropToggleTextActive: {
    color: '#FFF',
  },
  dropCard: {
    marginTop: 10,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  dropInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0A2540',
  },
  dropInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dropInputHalf: {
    flex: 1,
  },
  dropHint: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  sectionPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  sectionChip: {
    borderWidth: 1,
    borderColor: '#B7C6D2',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#F7FAFC',
  },
  sectionChipActive: {
    borderColor: '#0A2540',
    backgroundColor: '#0A2540',
  },
  sectionChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#35566F',
  },
  sectionChipTextActive: {
    color: '#FFFFFF',
  },

  categoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  categoryChipActive: {
    backgroundColor: '#C5A065',
    borderColor: '#C5A065',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  categoryChipTextActive: {
    color: '#FFF',
  },

  categoryChipAdd: {
    borderRadius: 20,
    width: 40,
    height: 36,
    borderWidth: 1,
    borderColor: '#C5A065',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },

  uploadActionButton: {
    backgroundColor: '#C5A065',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  uploadActionButtonDisabled: {
    opacity: 0.5,
  },
  uploadActionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },

  infoBox: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flexDirection: 'row',
    gap: 12,
  },
  infoContent: {
    flex: 1,
    gap: 4,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3498DB',
  },
  infoPath: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'monospace',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    gap: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A2540',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0A2540',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonCancel: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalButtonConfirm: {
    flex: 1,
    backgroundColor: '#C5A065',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0A2540',
  },
});

export default AdminIconUploader;
