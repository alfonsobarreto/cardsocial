import { getPreviewModalStackSize } from '@/components/smartCard/wireframeMath';
import { BlurView } from 'expo-blur';
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const shellStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewModalStack: {
    width: '92%',
    maxWidth: 600,
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
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  previewModalFooterOutside: {
    marginTop: 14,
    marginBottom: 0,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  ghostBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontWeight: '700',
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
  /** Borde del marco de tarjeta (tema). */
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
  cardBorder,
  footer,
  children,
}: SmartCardMirrorModalProps) {
  const insets = useSafeAreaInsets();
  const stack = getPreviewModalStackSize(screenHeight, iconSlotCount);
  const c = footer.colors;
  const overlayPadTop = Math.max(insets.top, 12) + 20;
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
          <View style={[shellStyles.previewModalCard, { borderColor: cardBorder.color, borderWidth: cardBorder.width }]}>
            <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
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
