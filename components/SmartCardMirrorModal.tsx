import { getPreviewModalStackSize } from '@/components/smartCard/wireframeMath';
import { BlurView } from 'expo-blur';
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const shellStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  previewModalStack: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  previewModalCard: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  previewModalFooterOutside: {
    marginTop: 20,
    marginBottom: 0,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalActions: {
    marginTop: 0,
    flexDirection: 'row',
    gap: 10,
  },
  ghostBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  ghostBtnText: {
    fontWeight: '400',
  },
  saveBtn: {
    flex: 1,
    borderRadius: 999,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  saveBtnText: {
    fontWeight: '400',
  },
});

export type SmartCardMirrorModalFooter = {
  variant: 'issuer' | 'receiver';
  closeLabel: string;
  editLabel?: string;
  onClose: () => void;
  onEditCard?: () => void;
  colors: {
    overlay: string;
    modalBg: string;
    modalBorder: string;
    ghostBg: string;
    ghostBorder: string;
    ghostText: string;
    primaryBg: string;
    primaryText: string;
  };
  blurTint: 'light' | 'dark';
};

export type SmartCardMirrorModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  screenHeight: number;
  iconSlotCount: number;
  /** Reservado (el borde vive solo en `IsolatedWireframeCard` / tema; sin doble marco en el shell). */
  cardBorder: { color: string; width: number };
  footer: SmartCardMirrorModalFooter;
  children: React.ReactNode;
};

/**
 * Contenedor común del modal de vista previa (Mis Tarjetas = emisor, Contactos = receptor).
 */
export function SmartCardMirrorModal({
  visible,
  onRequestClose,
  screenHeight,
  iconSlotCount,
  cardBorder: _cardBorder,
  footer,
  children,
}: SmartCardMirrorModalProps) {
  const insets = useSafeAreaInsets();
  const stack = getPreviewModalStackSize(screenHeight, iconSlotCount);
  const c = footer.colors;
  /** Mínimo generoso si no hay SafeAreaProvider; + extra para que la tarjeta no roce el status bar. */
  const overlayPadTop = Math.max(insets.top, 28) + 36;
  const overlayPadBottom = Math.max(insets.bottom, 16) + 12;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View
        style={[
          shellStyles.modalOverlay,
          {
            backgroundColor: c.overlay,
            paddingTop: overlayPadTop,
            paddingBottom: overlayPadBottom,
            paddingHorizontal: 16,
          },
        ]}
      >
        <BlurView intensity={65} tint={footer.blurTint} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={[shellStyles.previewModalStack, { height: stack.height, maxHeight: stack.maxHeight }]}>
          <View style={shellStyles.previewModalCard}>
            <View style={{ flex: 1, minHeight: 0, paddingBottom: 22 }}>{children}</View>
          </View>

          <View
            style={[
              shellStyles.modalActions,
              shellStyles.previewModalFooterOutside,
              {
                backgroundColor: c.modalBg,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderColor: c.modalBorder,
              },
            ]}
          >
            <TouchableOpacity
              style={[shellStyles.ghostBtn, { backgroundColor: c.ghostBg, borderColor: c.ghostBorder }]}
              onPress={footer.onClose}
            >
              <Text style={[shellStyles.ghostBtnText, { color: c.ghostText }]}>{footer.closeLabel}</Text>
            </TouchableOpacity>
            {footer.variant === 'issuer' && footer.onEditCard ? (
              <TouchableOpacity style={[shellStyles.saveBtn, { backgroundColor: c.primaryBg }]} onPress={footer.onEditCard}>
                <Text style={[shellStyles.saveBtnText, { color: c.primaryText }]}>{footer.editLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
