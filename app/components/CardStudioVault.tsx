/**
 * CardStudioVault
 * ─────────────────────────────────────────────────────────────────────────────
 * Selector de íconos del Vault. Punto de intersección entre el Bunker del
 * usuario y el Card-Studio de Pochobs.
 *
 * Hoy: muestra la galería base de 10 íconos.
 * Futuro: leerá los packs que el usuario compró en el Card-Design Store
 *          (icon_packs en Firestore) y mostrará íconos por colección y rareza.
 *
 * Usado en: NewInfoForm (al agregar dato al vault)
 * Reusable en: cualquier pantalla que necesite selección de ícono.
 */

import { useLookMode } from '@/services/lookMode';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
    Dimensions,
    FlatList,
    Modal,
    PanResponder,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ─── Galería base (única fuente de verdad) ────────────────────────────────────
// Todos los tipos de dato comparten esta misma galería hasta que el sistema de
// packs esté activo. Cuando lo esté, cada pack del Card-Studio agrega filas aquí.
export const ICON_GALLERY: Array<{ id: string; label: string; icon: string }> = [
  { id: '1',  label: 'WhatsApp',   icon: 'whatsapp'       },
  { id: '2',  label: 'Facebook',   icon: 'facebook'       },
  { id: '3',  label: 'Instagram',  icon: 'instagram'      },
  { id: '4',  label: 'LinkedIn',   icon: 'linkedin'       },
  { id: '5',  label: 'Web',        icon: 'web'            },
  { id: '6',  label: 'Ubicación',  icon: 'map-marker'     },
  { id: '7',  label: 'Llamada',    icon: 'phone'          },
  { id: '8',  label: 'Email',      icon: 'email'          },
  { id: '9',  label: 'Documento',  icon: 'file-document'  },
  { id: '10', label: 'Video',      icon: 'play-circle'    },
];

// ─── Props ────────────────────────────────────────────────────────────────────
export type VaultDataType =
  | 'Enlaces'
  | 'Teléfono'
  | 'Email'
  | 'Texto Plain'
  | 'Documento';

interface CardStudioVaultProps {
  visible: boolean;
  onClose: () => void;
  /** Devuelve el id del ícono seleccionado ("1" … "10") */
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

  const theme = {
    surfaceBg:        isNight ? '#0A2540'  : '#E3F2FD',
    border:           '#D4AF37',
    textPrimary:      isNight ? '#F0F4F8'  : '#002D4B',
    selectedPillBg:   isNight ? '#1C5BB9'  : '#54C1FB',
    selectedPillText: '#F0F4F8',
    selectedPillGlow: isNight ? '#1C5BB9'  : '#54C1FB',
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
    [onClose],
  );

  return (
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
                  maxHeight: SCREEN_HEIGHT * 0.85,
                  backgroundColor: theme.surfaceBg,
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
                  Elige Icono — {dataType}
                </Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <MaterialCommunityIcons name="close" color="#D4AF37" size={24} />
                </TouchableOpacity>
              </View>

              {/* Grid de íconos */}
              <FlatList
                data={ICON_GALLERY}
                keyExtractor={item => item.id}
                numColumns={5}
                scrollEnabled
                removeClippedSubviews
                scrollEventThrottle={16}
                contentContainerStyle={styles.grid}
                renderItem={({ item }) => {
                  const active = selectedIcon === item.id;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.iconItem,
                        active && {
                          backgroundColor: theme.selectedPillBg,
                          borderColor: theme.selectedPillBg,
                          shadowColor: theme.selectedPillGlow,
                          shadowOpacity: 0.2,
                          shadowRadius: 6,
                          elevation: 3,
                        },
                      ]}
                      onPress={() => {
                        onSelectIcon(item.id);
                        onClose();
                      }}
                      activeOpacity={0.78}
                    >
                      <MaterialCommunityIcons
                        name={item.icon as any}
                        color={active ? theme.selectedPillText : theme.textPrimary}
                        size={36}
                      />
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopWidth: 1.5,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
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
    paddingBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  grid: {
    padding: 12,
    alignItems: 'center',
  },
  iconItem: {
    width: 60,
    height: 60,
    margin: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
