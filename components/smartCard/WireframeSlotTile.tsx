import type { CardTheme as ChestCardTheme } from '@/constants/themeChest';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { WireframeEditSlot, WireframeVaultItem } from '@/components/smartCard/IsolatedWireframeCard';

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
    backgroundColor: '#0D4D8A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTile: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  cardTileLabel: {
    marginTop: 4,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
});

export type WireframeSlotTileProps = {
  slot: WireframeEditSlot;
  ui: { size: number };
  editable: boolean;
  chestTheme: ChestCardTheme;
  tr: (es: string, en: string) => string;
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
  tr,
  renderMiniIcon,
  onEditableOpenPicker,
  onDataPress,
  onMirrorLongPress,
  onRemoveSlotItem,
}: WireframeSlotTileProps) {
  const hasItem = Boolean(slot.item);
  const bubbleSize = Math.max(26, Math.floor(ui.size));
  const iconSize = Math.round(bubbleSize * 0.9);
  const compactTitle = String(slot.item?.title || 'Agregar')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
  const il = chestTheme.iconLabel;
  const slotBubbleBg = chestTheme.bubble.backgroundColor;
  const slotBorderColor = chestTheme.border.color;
  const glyphColor = chestTheme.icon.color;

  /* ── Preview mode: unified card tile (icon + label in one block) ── */
  if (!editable) {
    const previewIconSize = Math.max(24, Math.min(32, Math.round(bubbleSize * 0.52)));
    const previewLabelSize = Math.max(9, Math.min(12, Math.round(bubbleSize * 0.14)));
    const previewLineH = Math.ceil(previewLabelSize * 1.22);

    return (
      <TouchableOpacity
        style={[
          slotStyles.cardTile,
          {
            backgroundColor: slotBubbleBg,
            borderColor: slotBorderColor,
            minHeight: Math.max(72, Math.round(bubbleSize * 0.85)),
          },
        ]}
        activeOpacity={0.7}
        onPress={() => {
          if (slot.item) void onDataPress(slot.item);
        }}
        onLongPress={() => {
          if (onMirrorLongPress) onMirrorLongPress(slot);
        }}
        delayLongPress={650}
      >
        {slot.item ? (
          renderMiniIcon(slot.item, previewIconSize, glyphColor)
        ) : (
          <MaterialCommunityIcons name="plus" size={previewIconSize} color={glyphColor} />
        )}
        <Text
          style={[
            slotStyles.cardTileLabel,
            {
              fontSize: previewLabelSize,
              lineHeight: previewLineH,
              color: il.color,
              fontWeight: il.fontWeight,
              fontStyle: il.fontStyle,
            },
          ]}
          numberOfLines={2}
        >
          {compactTitle}
        </Text>
      </TouchableOpacity>
    );
  }

  /* ── Edit mode: original bubble + detached label ── */
  const labelFontSize = Math.max(
    9,
    Math.min(15, Math.round(Math.min(bubbleSize * 0.155, il.fontSize + 5))),
  );
  const labelLineHeight = Math.ceil(labelFontSize * 1.22);
  const minTileH = bubbleSize + 8 + labelLineHeight * 2 + 8 + 6;
  const bubbleR = Math.min(chestTheme.bubble.borderRadius, bubbleSize / 2);
  const slotBorderW = Math.max(1, chestTheme.border.width);

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
          renderMiniIcon(slot.item, iconSize, glyphColor)
        ) : (
          <MaterialCommunityIcons name="plus" size={iconSize} color={glyphColor} />
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
          },
        ]}
        numberOfLines={2}
      >
        {compactTitle}
      </Text>

      {hasItem && onRemoveSlotItem ? (
        <TouchableOpacity
          style={slotStyles.slotMinusBtn}
          onPress={() => onRemoveSlotItem(slot.index)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={tr('Quitar dato', 'Remove item')}
        >
          <MaterialCommunityIcons name="minus" size={11} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={slotStyles.slotPlusBtn}
        onPress={() => onEditableOpenPicker(slot.index)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel={tr('Agregar dato', 'Add item')}
      >
        <MaterialCommunityIcons name="plus" size={11} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}
