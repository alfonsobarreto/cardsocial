import type { CardTheme as ChestCardTheme } from '@/constants/themeChest';
import { useCoreT } from '@/services/coreI18n';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { WireframeEditSlot, WireframeVaultItem } from '@/components/smartCard/IsolatedWireframeCard';
import {
  computeWireframeBubbleBorderRadius,
  wireframeSlotBelowBubbleHeight,
  wireframeWebBubbleBorderRadius,
} from '@/components/smartCard/wireframeMath';

/** Igual que `compactSlotLabel` en `BusinessCardWeb` (máx. 4 palabras). */
function compactSlotLabel(label: string): string {
  return String(label || '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(' ');
}

const slotStyles = StyleSheet.create({
  slotTile: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  slotBubble: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.83)',
    borderWidth: 1,
    borderColor: '#C3E6FA',
  },
  slotLabel: {
    marginTop: 2,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  slotMinusBtn: {
    position: 'absolute',
    top: -2,
    right: 8,
    width: 19,
    height: 19,
    borderRadius: 9.5,
    backgroundColor: '#C44B55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotPlusBtn: {
    position: 'absolute',
    bottom: 14,
    right: 8,
    width: 19,
    height: 19,
    borderRadius: 9.5,
    backgroundColor: '#2F7BFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export type WireframeSlotTileProps = {
  slot: WireframeEditSlot;
  ui: { size: number };
  editable: boolean;
  chestTheme: ChestCardTheme;
  renderMiniIcon: (item: WireframeVaultItem | null | undefined, size: number, glyphColor?: string) => React.ReactNode;
  onEditableOpenPicker: (index: number) => void;
  onDataPress: (item: WireframeVaultItem) => void;
  onMirrorLongPress?: (slot: WireframeEditSlot) => void;
  onRemoveSlotItem?: (index: number) => void;
};

export function WireframeSlotTile({
  slot,
  ui,
  editable,
  chestTheme,
  renderMiniIcon,
  onEditableOpenPicker,
  onDataPress,
  onMirrorLongPress,
  onRemoveSlotItem,
}: WireframeSlotTileProps) {
  const t = useCoreT();
  const hasItem = Boolean(slot.item);
  const bubbleSize = Math.max(26, Math.floor(ui.size));
  const editableGlyphSize = Math.round(bubbleSize * 0.9);
  const il = chestTheme.iconLabel;
  const slotBubbleBg = chestTheme.bubble.backgroundColor;
  const slotBorderColor = chestTheme.border.color;
  const glyphColor = chestTheme.icon.color;

  const labelFontSize = Math.max(
    9,
    Math.min(15, Math.round(Math.min(bubbleSize * 0.155, il.fontSize + 5))),
  );
  const labelLineHeight = Math.ceil(labelFontSize * 1.22);
  const minTileH = bubbleSize + wireframeSlotBelowBubbleHeight(bubbleSize, il.fontSize);
  const bubbleR = editable
    ? computeWireframeBubbleBorderRadius(bubbleSize, chestTheme.bubble.borderRadius)
    : wireframeWebBubbleBorderRadius(bubbleSize, chestTheme.bubble.borderRadius);
  const slotBorderW = Math.max(1, chestTheme.border.width);

  /* ── Vista espejo: unidad atómica (ancho fijo = bubble), columna, botón + label — calque WebWireframeSlotTile ── */
  if (!editable) {
    const voip = String(slot.item?.type || '')
      .toLowerCase()
      .includes('voip');
    const mirrorGlyphSize = Math.round(bubbleSize * 0.9);
    const compactLabel = compactSlotLabel(slot.item ? String(slot.item.title || '') : t('wireframe_add'));

    return (
      <View
        style={{
          width: bubbleSize,
          minHeight: minTileH,
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <TouchableOpacity
          style={[
            slotStyles.slotBubble,
            {
              width: bubbleSize,
              height: bubbleSize,
              borderRadius: bubbleR,
              backgroundColor: slotBubbleBg,
              borderWidth: slotBorderW,
              borderColor: slotBorderColor,
              opacity: voip ? 0.45 : 1,
            },
          ]}
          activeOpacity={voip ? 1 : 0.7}
          disabled={voip}
          onPress={() => {
            if (voip || !slot.item) return;
            void onDataPress(slot.item);
          }}
          onLongPress={() => {
            if (onMirrorLongPress) onMirrorLongPress(slot);
          }}
          delayLongPress={650}
        >
          {slot.item ? (
            renderMiniIcon(slot.item, mirrorGlyphSize, glyphColor)
          ) : (
            <MaterialCommunityIcons name="plus" size={mirrorGlyphSize} color={glyphColor} />
          )}
        </TouchableOpacity>
        <Text
          style={{
            marginTop: 4,
            width: '100%',
            maxWidth: bubbleSize,
            textAlign: 'center',
            alignSelf: 'stretch',
            fontSize: labelFontSize,
            lineHeight: labelLineHeight,
            color: il.color,
            fontWeight: '300',
            fontStyle: il.fontStyle,
            ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
          }}
          numberOfLines={3}
          ellipsizeMode="tail"
        >
          {compactLabel}
        </Text>
      </View>
    );
  }

  /* ── Edición Mis Tarjetas: bubble + etiqueta + controles ── */
  return (
    <View style={[slotStyles.slotTile, { minHeight: minTileH }]}>
      <TouchableOpacity
        style={[
          slotStyles.slotBubble,
          {
            width: bubbleSize,
            height: bubbleSize,
            borderRadius: bubbleR,
            backgroundColor: slotBubbleBg,
            borderWidth: slotBorderW,
            borderColor: slotBorderColor,
          },
        ]}
        onPress={() => onEditableOpenPicker(slot.index)}
      >
        {slot.item ? (
          renderMiniIcon(slot.item, editableGlyphSize, glyphColor)
        ) : (
          <MaterialCommunityIcons name="plus" size={editableGlyphSize} color={glyphColor} />
        )}
      </TouchableOpacity>
      <Text
        style={[
          slotStyles.slotLabel,
          {
            width: '100%',
            maxWidth: '100%',
            fontSize: labelFontSize,
            lineHeight: labelLineHeight,
            color: il.color,
            fontWeight: il.fontWeight,
            fontStyle: il.fontStyle,
            ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
          },
        ]}
        numberOfLines={3}
        ellipsizeMode="tail"
      >
        {compactSlotLabel(slot.item ? String(slot.item.title || '') : t('wireframe_add'))}
      </Text>

      {hasItem && onRemoveSlotItem ? (
        <TouchableOpacity
          style={slotStyles.slotMinusBtn}
          onPress={() => onRemoveSlotItem(slot.index)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={t('wireframe_remove_item')}
        >
          <MaterialCommunityIcons name="minus" size={11} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={slotStyles.slotPlusBtn}
        onPress={() => onEditableOpenPicker(slot.index)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel={t('wireframe_add_item')}
      >
        <MaterialCommunityIcons name="plus" size={11} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}
