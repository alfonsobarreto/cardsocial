/**
 * CardStudioVault
 * ─────────────────────────────────────────────────────────────────────────────
 * Galería categorizada de íconos para el Vault y Card-Studio.
 * Todos los íconos activos son vectoriales (MaterialCommunityIcons) — cero PNGs.
 * Secciones premium vacías se muestran como colecciones futuras con badge 🔒.
 */

import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Dimensions,
    InteractionManager,
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
const RECENT_ICONS_KEY = 'vault_recent_icon_ids';
const MAX_RECENTS = 5;

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type VaultDataType =
  | 'Enlaces'
  | 'Teléfono'
  | 'Email'
  | 'Texto Plain'
  | 'Documento';

export interface IconItem {
  id: string;
  label: string;    // Español
  labelEn: string;  // English
  icon: string;
}

interface IconSection {
  title: string;
  titleEn?: string;
  data: IconItem[][];   // SectionList rows — cada row es un array de hasta 5 items
  isEmpty?: boolean;
  isPremium?: boolean;
  emptyLabel?: string;
  emptyLabelEn?: string;
}

// ─── SECCIONES CATEGORIZADAS ──────────────────────────────────────────────────
const RAW_SECTIONS: Array<{
  title: string;
  titleEn: string;
  items?: Array<{ label: string; labelEn: string; icon: string }>;
  isEmpty?: boolean;
  isPremium?: boolean;
  emptyLabel?: string;
  emptyLabelEn?: string;
}> = [
  {
    title: 'Enlaces',
    titleEn: 'Links',
    items: [
      { label: 'LinkedIn',    labelEn: 'LinkedIn',    icon: 'linkedin'         },
      { label: 'Instagram',   labelEn: 'Instagram',   icon: 'instagram'        },
      { label: 'Facebook',    labelEn: 'Facebook',    icon: 'facebook'         },
      { label: 'WhatsApp',    labelEn: 'WhatsApp',    icon: 'whatsapp'         },
      { label: 'Twitter/X',   labelEn: 'Twitter/X',   icon: 'twitter'          },
      { label: 'TikTok',      labelEn: 'TikTok',      icon: 'music-note'       },
      { label: 'YouTube',     labelEn: 'YouTube',     icon: 'youtube'          },
      { label: 'Snapchat',    labelEn: 'Snapchat',    icon: 'snapchat'         },
      { label: 'Web',         labelEn: 'Web',         icon: 'web'              },
      { label: 'Enlace',      labelEn: 'Link',        icon: 'link-variant'     },
    ],
  },
  {
    title: 'Teléfonos',
    titleEn: 'Phones',
    items: [
      { label: 'Apple',       labelEn: 'Apple',       icon: 'apple'            },
      { label: 'Android',     labelEn: 'Android',     icon: 'android'          },
      { label: 'Teléfono',    labelEn: 'Phone',       icon: 'phone'            },
      { label: 'Clásico',     labelEn: 'Classic',     icon: 'phone-classic'    },
      { label: 'Celular',     labelEn: 'Mobile',      icon: 'cellphone'        },
      { label: 'WhatsApp',    labelEn: 'WhatsApp',    icon: 'whatsapp'         },
      { label: 'Tablet',      labelEn: 'Tablet',      icon: 'tablet-cellphone' },
      { label: 'Vibrar',      labelEn: 'Vibrate',     icon: 'vibrate'          },
      { label: 'VoIP',        labelEn: 'VoIP',        icon: 'phone-voip'       },
      { label: 'Contactos',   labelEn: 'Contacts',    icon: 'contacts'         },
    ],
  },
  {
    title: 'Emails',
    titleEn: 'Emails',
    items: [
      { label: 'Gmail',       labelEn: 'Gmail',       icon: 'gmail'             },
      { label: 'Email',       labelEn: 'Email',       icon: 'email-outline'     },
      { label: 'Abierto',     labelEn: 'Open',        icon: 'email-open'        },
      { label: 'Outlook',     labelEn: 'Outlook',     icon: 'microsoft-outlook' },
      { label: 'Yahoo',       labelEn: 'Yahoo',       icon: 'yahoo'             },
      { label: 'Buzón',       labelEn: 'Mailbox',     icon: 'mailbox'           },
      { label: 'Enviar',      labelEn: 'Send',        icon: 'send'              },
      { label: 'Sello',       labelEn: 'Stamp',       icon: 'email-seal'        },
      { label: 'Arroba',      labelEn: 'At Sign',     icon: 'at'                },
      { label: 'Alt Email',   labelEn: 'Alt Email',   icon: 'alternate-email'   },
    ],
  },
  {
    title: 'Seguridad / Estilo',
    titleEn: 'Security / Style',
    items: [
      { label: 'Llave',       labelEn: 'Key',         icon: 'key'              },
      { label: 'Escudo',      labelEn: 'Shield',      icon: 'shield-check'     },
      { label: 'Candado',     labelEn: 'Lock',        icon: 'lock'             },
      { label: 'Carpeta',     labelEn: 'Folder',      icon: 'folder-lock'      },
      { label: 'Ojo',         labelEn: 'Eye',         icon: 'eye-outline'      },
      { label: 'Huella',      labelEn: 'Fingerprint', icon: 'fingerprint'      },
      { label: 'Estrella',    labelEn: 'Star',        icon: 'star'             },
      { label: 'Diamante',    labelEn: 'Diamond',     icon: 'diamond-stone'    },
      { label: 'Corona',      labelEn: 'Crown',       icon: 'crown'            },
      { label: 'Corazón',     labelEn: 'Heart',       icon: 'heart'            },
      { label: 'Rayo',        labelEn: 'Flash',       icon: 'flash'            },
    ],
  },
  {
    title: 'Documentos',
    titleEn: 'Documents',
    items: [
      { label: 'PDF',         labelEn: 'PDF',         icon: 'file-pdf-box'      },
      { label: 'Imagen',      labelEn: 'Image',       icon: 'file-image'        },
      { label: 'Video',       labelEn: 'Video',       icon: 'file-video'        },
      { label: 'Word',        labelEn: 'Word',        icon: 'file-word'         },
      { label: 'Excel',       labelEn: 'Excel',       icon: 'file-excel'        },
      { label: 'Doc',         labelEn: 'Doc',         icon: 'file-document'     },
      { label: 'PPT',         labelEn: 'PPT',         icon: 'file-presentation' },
      { label: 'Música',      labelEn: 'Music',       icon: 'file-music'        },
      { label: 'ZIP',         labelEn: 'ZIP',         icon: 'zip-box'           },
      { label: 'Carpeta',     labelEn: 'Folder',      icon: 'folder-zip'        },
    ],
  },
  // ── Colección personal ────
  {
    title: 'Mis Iconos Personalizados',
    titleEn: 'My Custom Icons',
    isEmpty: true,
    isPremium: false,
    emptyLabel: 'Próximamente: Sube tus propios iconos',
    emptyLabelEn: 'Coming soon: Upload your own icons',
  },
  // ── Colecciones premium futuras ───
  {
    title: 'Luxury',
    titleEn: 'Luxury',
    isEmpty: true,
    isPremium: true,
    emptyLabel: 'Colección Luxury — Próximamente',
    emptyLabelEn: 'Luxury Collection — Coming soon',
  },
  {
    title: '3D',
    titleEn: '3D',
    isEmpty: true,
    isPremium: true,
    emptyLabel: 'Iconos 3D — Próximamente',
    emptyLabelEn: '3D Icons — Coming soon',
  },
  {
    title: 'GIF',
    titleEn: 'GIF',
    isEmpty: true,
    isPremium: true,
    emptyLabel: 'Iconos Animados GIF — Próximamente',
    emptyLabelEn: 'Animated GIF Icons — Coming soon',
  },
  {
    title: 'Coleccionables',
    titleEn: 'Collectibles',
    isEmpty: true,
    isPremium: true,
    emptyLabel: 'Coleccionables — Próximamente',
    emptyLabelEn: 'Collectibles — Coming soon',
  },
  {
    title: 'Themes',
    titleEn: 'Themes',
    isEmpty: true,
    isPremium: true,
    emptyLabel: 'Temas Exclusivos — Próximamente',
    emptyLabelEn: 'Exclusive Themes — Coming soon',
  },
];

// Asigna IDs únicos y trocea en filas de 5 para SectionList
let _globalId = 1;
const ICON_SECTIONS: IconSection[] = RAW_SECTIONS.map((sec) => {
  if (sec.isEmpty || !sec.items) {
    return {
      title: sec.title,
      titleEn: sec.titleEn,
      data: [],
      isEmpty: true,
      isPremium: sec.isPremium,
      emptyLabel: sec.emptyLabel,
      emptyLabelEn: sec.emptyLabelEn,
    };
  }
  const items: IconItem[] = sec.items.map((i) => ({
    id: String(_globalId++),
    label: i.label,
    labelEn: i.labelEn,
    icon: i.icon,
  }));
  // Chunk into rows of 5
  const rows: IconItem[][] = [];
  for (let i = 0; i < items.length; i += 5) rows.push(items.slice(i, i + 5));
  return { title: sec.title, titleEn: sec.titleEn, data: rows };
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
  const { language } = useLanguage();
  const isEN = language === 'en';
  const tr = (es: string, en: string) => isEN ? en : es;
  const [storeModalVisible, setStoreModalVisible] = useState(false);
  const [recentIconIds, setRecentIconIds] = useState<string[]>([]);
  const sectionListRef = useRef<SectionList<IconItem[], IconSection>>(null);
  const longPressTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({}); 

  // Cargar recientes de AsyncStorage al montar — diferido para no bloquear la animación
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      AsyncStorage.getItem(RECENT_ICONS_KEY)
        .then((raw) => { if (raw) setRecentIconIds(JSON.parse(raw)); })
        .catch(() => {});
    });
    return () => task.cancel();
  }, []);

  // Secciones dinámicas — antepone "Recientes" si existen
  const displaySections = useMemo((): IconSection[] => {
    if (recentIconIds.length === 0) return ICON_SECTIONS;
    const recentItems = recentIconIds
      .map((id) => ICON_GALLERY.find((i) => i.id === id))
      .filter(Boolean) as IconItem[];
    const recentRows: IconItem[][] = [];
    for (let i = 0; i < recentItems.length; i += 5)
      recentRows.push(recentItems.slice(i, i + 5));
    const recentSection: IconSection = {
      title: isEN ? 'Recent' : 'Recientes',
      titleEn: 'Recent',
      data: recentRows,
    };
    return [recentSection, ...ICON_SECTIONS];
  }, [recentIconIds, isEN]);

  // Auto-scroll a la sección del dataType cuando el modal se abre
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      const titleMap: Record<string, string> = {
        'Enlaces': 'Enlaces',
        'Teléfono': 'Teléfonos',
        'Email': 'Emails',
        'Documento': 'Documentos',
        'Texto Plain': 'Documentos',
      };
      const target = titleMap[dataType];
      if (!target) return;
      const sectionIndex = displaySections.findIndex((s) => s.title === target);
      if (sectionIndex < 0) return;
      try {
        sectionListRef.current?.scrollToLocation({
          sectionIndex,
          itemIndex: 0,
          animated: true,
          viewPosition: 0,
        });
      } catch { /* ignora si la sección aún no está renderizada */ }
    }, 420);
    return () => clearTimeout(timer);
  }, [visible, dataType, displaySections]);

  // Selección de ícono con haptic + recientes
  const handleSelectIcon = (iconId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Cerrar el modal de inmediato — la animación de slide-down no se bloquea
    onSelectIcon(iconId);
    onClose();
    // Escribir recientes en AsyncStorage después de que termine la animación
    InteractionManager.runAfterInteractions(() => {
      const next = [iconId, ...recentIconIds.filter((id) => id !== iconId)].slice(0, MAX_RECENTS);
      setRecentIconIds(next);
      AsyncStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(next)).catch(() => {});
    });
  };

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
      tr(`Eliminar icono "${item.label}"`, `Delete icon "${item.labelEn}"`),
      tr(
        'Si lo eliminas, los datos del B\u00fanker que usen este \u00edcono quedar\u00e1n con el \u00edcono por defecto. \u00bfDeseas continuar?',
        'If you delete it, Vault items using this icon will revert to the default icon. Continue?'
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        {
          text: tr('Eliminar', 'Delete'),
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
        {isEN ? section.titleEn : section.title}
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
              onPress={() => handleSelectIcon(item.id)}
              onLongPress={() => handleLongPress(item)}
              delayLongPress={1200}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons
                name={item.icon as any}
                color={active ? theme.selectedText : theme.textPrimary}
                size={28}
              />
              <Text
                style={[styles.iconLabel, { color: active ? theme.selectedText : theme.textSecondary }]}
                numberOfLines={1}
              >
                {isEN ? item.labelEn : item.label}
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
          {isEN ? (section.emptyLabelEn ?? section.emptyLabel) : section.emptyLabel}
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
              <View
                style={[
                  styles.sheet,
                  {
                    maxHeight: SCREEN_HEIGHT * 0.88,
                    backgroundColor: theme.sheetBg,
                    borderTopColor: theme.border,
                  },
                ]}
                onStartShouldSetResponder={() => true}
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
                  {tr('Mantén presionado para eliminar un ícono', 'Long press to delete an icon')}
                </Text>

                {/* SectionList categorizado */}
                <View style={{ flex: 1 }}>
                <SectionList
                  ref={sectionListRef}
                  sections={displaySections}
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
                  scrollEventThrottle={16}
                  windowSize={2}
                  maxToRenderPerBatch={5}
                  initialNumToRender={3}
                  bounces={false}
                  overScrollMode="never"
                />
                </View>
              </View>
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
                  {tr('Tienda Card-Studio: Temas y Coleccionables disponibles muy pronto.', 'Card-Studio Store: Themes and Collectibles coming very soon.')}
                </Text>
                <TouchableOpacity
                  style={styles.storeCloseBtn}
                  onPress={() => setStoreModalVisible(false)}
                >
                  <Text style={styles.storeCloseBtnText}>{tr('Cerrar', 'Close')}</Text>
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
