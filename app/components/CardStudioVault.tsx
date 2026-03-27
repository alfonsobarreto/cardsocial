/**
 * CardStudioVault
 * ─────────────────────────────────────────────────────────────────────────────
 * Galería categorizada de íconos para el Vault y Card-Studio.
 * Todos los íconos activos son vectoriales (MaterialCommunityIcons) — cero PNGs.
 * Secciones premium vacías se muestran como colecciones futuras con badge 🔒.
 */

import { useLookMode } from '@/services/lookMode';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  PanResponder,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const VAULT_STORAGE_KEY = 'vault_data';

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type VaultDataType =
  | 'Enlaces'
  | 'Teléfono'
  | 'Email'
  | 'Texto Plain'
  | 'Documento';

export interface IconItem {
  id: string;
  label: string;
  icon: string;
}

interface IconSection {
  title: string;
  data: IconItem[][];   // SectionList rows — cada row es un array de hasta 5 items
  isEmpty?: boolean;
  isPremium?: boolean;
  emptyLabel?: string;
}

// ─── SECCIONES CATEGORIZADAS ──────────────────────────────────────────────────
const RAW_SECTIONS: Array<{
  title: string;
  items?: Array<{ label: string; icon: string }>;
  isEmpty?: boolean;
  isPremium?: boolean;
  emptyLabel?: string;
}> = [
  {
    title: 'Enlaces',
    items: [
      { label: 'LinkedIn',    icon: 'linkedin'        },
      { label: 'Instagram',   icon: 'instagram'       },
      { label: 'Facebook',    icon: 'facebook'        },
      { label: 'WhatsApp',    icon: 'whatsapp'        },
      { label: 'Twitter/X',   icon: 'twitter'         },
      { label: 'TikTok',      icon: 'music-note'      },
      { label: 'YouTube',     icon: 'youtube'         },
      { label: 'Snapchat',    icon: 'snapchat'        },
      { label: 'Web',         icon: 'web'             },
      { label: 'Link',        icon: 'link-variant'    },
    ],
  },
  {
    title: 'Teléfonos',
    items: [
      { label: 'Apple',       icon: 'apple'           },
      { label: 'Android',     icon: 'android'         },
      { label: 'Teléfono',    icon: 'phone'           },
      { label: 'Clásico',     icon: 'phone-classic'   },
      { label: 'Celular',     icon: 'cellphone'       },
      { label: 'WhatsApp',    icon: 'whatsapp'        },
      { label: 'Tablet',      icon: 'tablet-cellphone'},
      { label: 'Vibrar',      icon: 'vibrate'         },
      { label: 'VoIP',        icon: 'phone-voip'      },
      { label: 'Contactos',   icon: 'contacts'        },
    ],
  },
  {
    title: 'Emails',
    items: [
      { label: 'Gmail',       icon: 'gmail'           },
      { label: 'Email',       icon: 'email-outline'   },
      { label: 'Abierto',     icon: 'email-open'      },
      { label: 'Outlook',     icon: 'microsoft-outlook'},
      { label: 'Yahoo',       icon: 'yahoo'           },
      { label: 'Buzón',       icon: 'mailbox'         },
      { label: 'Enviar',      icon: 'send'            },
      { label: 'Sello',       icon: 'email-seal'      },
      { label: 'Arroba',      icon: 'at'              },
      { label: 'Alt Email',   icon: 'alternate-email' },
    ],
  },
  {
    title: 'Seguridad / Estilo',
    items: [
      { label: 'Llave',       icon: 'key'             },
      { label: 'Escudo',      icon: 'shield-check'    },
      { label: 'Candado',     icon: 'lock'            },
      { label: 'Carpeta',     icon: 'folder-lock'     },
      { label: 'Ojo',         icon: 'eye-outline'     },
      { label: 'Huella',      icon: 'fingerprint'     },
      { label: 'Estrella',    icon: 'star'            },
      { label: 'Diamante',    icon: 'diamond-stone'   },
      { label: 'Corona',      icon: 'crown'           },
      { label: 'Corazón',     icon: 'heart'           },
      { label: 'Rayo',        icon: 'flash'           },
    ],
  },
  {
    title: 'Documentos',
    items: [
      { label: 'PDF',         icon: 'file-pdf-box'    },
      { label: 'Imagen',      icon: 'file-image'      },
      { label: 'Video',       icon: 'file-video'      },
      { label: 'Word',        icon: 'file-word'       },
      { label: 'Excel',       icon: 'file-excel'      },
      { label: 'Doc',         icon: 'file-document'   },
      { label: 'PPT',         icon: 'file-presentation'},
      { label: 'Música',      icon: 'file-music'      },
      { label: 'ZIP',         icon: 'zip-box'         },
      { label: 'Carpeta',     icon: 'folder-zip'      },
    ],
  },
  // ── Colección personal ────
  {
    title: 'Mis Iconos Personalizados',
    isEmpty: true,
    isPremium: false,
    emptyLabel: 'Próximamente: Sube tus propios iconos',
  },
  // ── Colecciones premium futuras ───
  {
    title: 'Luxury',
    isEmpty: true,
    isPremium: true,
    emptyLabel: 'Colección Luxury — Próximamente',
  },
  {
    title: '3D',
    isEmpty: true,
    isPremium: true,
    emptyLabel: 'Iconos 3D — Próximamente',
  },
  {
    title: 'GIF',
    isEmpty: true,
    isPremium: true,
    emptyLabel: 'Iconos Animados GIF — Próximamente',
  },
  {
    title: 'Coleccionables',
    isEmpty: true,
    isPremium: true,
    emptyLabel: 'Coleccionables — Próximamente',
  },
  {
    title: 'Themes',
    isEmpty: true,
    isPremium: true,
    emptyLabel: 'Temas Exclusivos — Próximamente',
  },
];

// Asigna IDs únicos y trocea en filas de 5 para SectionList
let _globalId = 1;
const ICON_SECTIONS: IconSection[] = RAW_SECTIONS.map((sec) => {
  if (sec.isEmpty || !sec.items) {
    return {
      title: sec.title,
      data: [],
      isEmpty: true,
      isPremium: sec.isPremium,
      emptyLabel: sec.emptyLabel,
    };
  }
  const items: IconItem[] = sec.items.map((i) => ({
    id: String(_globalId++),
    label: i.label,
    icon: i.icon,
  }));
  // Chunk into rows of 5
  const rows: IconItem[][] = [];
  for (let i = 0; i < items.length; i += 5) rows.push(items.slice(i, i + 5));
  return { title: sec.title, data: rows };
});

// ─── ICON_GALLERY flat — compatibilidad con NewInfoForm y resto del app ───────
export const ICON_GALLERY: IconItem[] = ICON_SECTIONS.flatMap((sec) =>
  sec.data.flatMap((row) => row)
);

// ─── Props ────────────────────────────────────────────────────────────────────
interface CardStudioVaultProps {
  visible: boolean;
  onClose: () => void;
  onSelectIcon: (iconId: string) => void;
  dataType: VaultDataType;
  selectedIcon: string;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function CardStudioVault({
  visible,
  onClose,
  onSelectIcon,
  dataType,
  selectedIcon,
}: CardStudioVaultProps) {
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const [storeModalVisible, setStoreModalVisible] = useState(false);
  const longPressTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const theme = {
    surfaceBg:        isNight ? '#0A2540' : '#E3F2FD',
    sheetBg:          isNight ? '#071828' : '#F5F9FF',
    border:           '#D4AF37',
    textPrimary:      isNight ? '#F0F4F8' : '#002D4B',
    textSecondary:    isNight ? '#87A9C2' : '#5A7A8A',
    selectedBg:       isNight ? '#1C5BB9' : '#54C1FB',
    selectedText:     '#F0F4F8',
    sectionHeaderBg:  isNight ? '#0D2035' : '#DCF0FC',
    premiumBadgeBg:   '#1A1A2E',
    premiumBadgeText: '#D4AF37',
    iconBorder:       isNight ? '#1A3A50' : '#C8E6F5',
  };

  const swipeResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx) * 0.8,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx) * 0.8,
        onPanResponderRelease: (_, g) => {
          if (g.dy > 20 || g.vy > 0.35) onClose();
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [onClose]
  );

  const handleLongPress = (item: IconItem) => {
    Alert.alert(
      `Eliminar icono "${item.label}"`,
      'Si lo eliminas, los datos del Búnker que usen este ícono quedarán con el ícono por defecto. ¿Deseas continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const raw = await AsyncStorage.getItem(VAULT_STORAGE_KEY);
              if (!raw) return;
              const data: any[] = JSON.parse(raw);
              const updated = data.map((entry) =>
                entry.iconName === item.label
                  ? { ...entry, icon: 'file-document', iconName: 'Documento' }
                  : entry
              );
              await AsyncStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updated));
            } catch {
              // silent
            }
          },
        },
      ]
    );
  };

  const renderSectionHeader = ({ section }: { section: IconSection }) => (
    <View style={[styles.sectionHeader, { backgroundColor: theme.sectionHeaderBg }]}>
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
        {section.title}
      </Text>
      {section.isPremium && (
        <View style={[styles.premiumBadge, { backgroundColor: theme.premiumBadgeBg }]}>
          <MaterialCommunityIcons name="crown" color="#D4AF37" size={12} />
          <Text style={[styles.premiumBadgeText, { color: theme.premiumBadgeText }]}>
            {' '}Premium
          </Text>
        </View>
      )}
    </View>
  );

  const renderItem = ({ item: row, section }: { item: IconItem[]; section: IconSection }) => {
    if (section.isEmpty) return null;
    return (
      <View style={styles.row}>
        {row.map((item) => {
          const active = selectedIcon === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.iconItem,
                { borderColor: theme.iconBorder },
                active && {
                  backgroundColor: theme.selectedBg,
                  borderColor: theme.selectedBg,
                  shadowColor: theme.selectedBg,
                  shadowOpacity: 0.3,
                  shadowRadius: 6,
                  elevation: 4,
                },
              ]}
              onPress={() => { onSelectIcon(item.id); onClose(); }}
              onLongPress={() => handleLongPress(item)}
              delayLongPress={3000}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons
                name={item.icon as any}
                color={active ? theme.selectedText : theme.textPrimary}
                size={32}
              />
              <Text
                style={[
                  styles.iconLabel,
                  { color: active ? theme.selectedText : theme.textSecondary },
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderEmptySection = (section: IconSection) => {
    if (!section.isEmpty) return null;
    return (
      <View style={styles.emptySection}>
        <MaterialCommunityIcons
          name={section.isPremium ? 'lock' : 'image-plus'}
          color="#D4AF37"
          size={28}
        />
        <Text style={[styles.emptyLabel, { color: theme.textSecondary }]}>
          {section.emptyLabel}
        </Text>
      </View>
    );
  };

  const ListFooter = () => (
    <TouchableOpacity
      style={styles.storeButton}
      onPress={() => setStoreModalVisible(true)}
      activeOpacity={0.85}
    >
      <MaterialCommunityIcons name="store" color="#0A1A2F" size={22} />
      <Text style={styles.storeButtonText}>Card-Studio</Text>
      <MaterialCommunityIcons name="chevron-right" color="#0A1A2F" size={20} />
    </TouchableOpacity>
  );

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View
                style={[
                  styles.sheet,
                  {
                    maxHeight: SCREEN_HEIGHT * 0.88,
                    backgroundColor: theme.sheetBg,
                    borderTopColor: theme.border,
                  },
                ]}
              >
                {/* Drag handle */}
                <View style={styles.dragHandleWrap} {...swipeResponder.panHandlers}>
                  <View style={styles.dragHandle} />
                </View>

                {/* Header */}
                <View style={styles.header}>
                  <Text style={[styles.title, { color: theme.textPrimary }]}>
                    Card-Studio — {dataType}
                  </Text>
                  <TouchableOpacity
                    onPress={onClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialCommunityIcons name="close" color="#D4AF37" size={24} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.hint, { color: theme.textSecondary }]}>
                  Mantén presionado 3s para eliminar un ícono
                </Text>

                {/* SectionList categorizado */}
                <SectionList
                  sections={ICON_SECTIONS}
                  keyExtractor={(row, idx) =>
                    Array.isArray(row) && row.length > 0 ? row[0].id : `empty-${idx}`
                  }
                  renderSectionHeader={renderSectionHeader}
                  renderItem={({ item, section }) => {
                    if (section.isEmpty) return renderEmptySection(section);
                    return renderItem({ item, section });
                  }}
                  renderSectionFooter={({ section }) =>
                    section.isEmpty ? renderEmptySection(section) : null
                  }
                  ListFooterComponent={<ListFooter />}
                  stickySectionHeadersEnabled
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.listContent}
                  removeClippedSubviews
                  scrollEventThrottle={16}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal Card-Studio Store placeholder */}
      <Modal
        visible={storeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStoreModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setStoreModalVisible(false)}>
          <View style={styles.storeOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.storeSheet}>
                <MaterialCommunityIcons name="store" color="#D4AF37" size={48} />
                <Text style={styles.storeTitle}>Card-Studio</Text>
                <Text style={styles.storeSubtitle}>
                  Tienda Card-Studio: Temas y Coleccionables disponibles muy pronto.
                </Text>
                <TouchableOpacity
                  style={styles.storeCloseBtn}
                  onPress={() => setStoreModalVisible(false)}
                >
                  <Text style={styles.storeCloseBtnText}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopWidth: 1.5,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 24,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D4AF37',
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  hint: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 8,
    opacity: 0.7,
  },
  listContent: {
    paddingBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  premiumBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  iconItem: {
    flex: 1,
    margin: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    maxWidth: 70,
  },
  iconLabel: {
    fontSize: 9,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
  },
  emptySection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  emptyLabel: {
    fontSize: 13,
    fontStyle: 'italic',
    flex: 1,
  },
  // Botón Card-Studio
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#D4AF37',
    gap: 8,
    shadowColor: '#D4AF37',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  storeButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0A1A2F',
    letterSpacing: 1,
  },
  // Store modal
  storeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  storeSheet: {
    backgroundColor: '#0A2540',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    width: '100%',
  },
  storeTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#D4AF37',
    marginTop: 12,
    letterSpacing: 1,
  },
  storeSubtitle: {
    fontSize: 14,
    color: '#B8D9F0',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  storeCloseBtn: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: '#D4AF37',
    borderRadius: 12,
  },
  storeCloseBtnText: {
    fontWeight: '700',
    color: '#0A1A2F',
    fontSize: 15,
  },
});
