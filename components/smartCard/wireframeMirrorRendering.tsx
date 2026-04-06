/**
 * Render compartido para modales espejo (Mis Tarjetas preview, Contactos, Búsqueda).
 * Fuente única de verdad visual: mismas estrellas y mismos mini-iconos que cards.tsx.
 */

import {
  resolveMaterialGlyphFromVaultLikeFields,
  type MaterialIconVaultLookup,
} from '@/app/components/iconNameValidation';
import type { CardTheme as ChestCardTheme } from '@/constants/themeChest';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { View } from 'react-native';
import type { WireframeEditSlot, WireframeVaultItem } from '@/components/smartCard/IsolatedWireframeCard';
import { WireframeSlotTile } from '@/components/smartCard/WireframeSlotTile';

/** Igual que `renderDetailedRatingStars` en app/(tabs)/cards.tsx */
export function renderWireframeDetailedRatingStars(rating: number, starSize = 14, starColor = '#C5A065') {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  const gap = Math.max(1, Math.round(starSize * 0.12));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      {Array.from({ length: 5 }).map((_, index) => {
        const threshold = index + 1;
        let name: 'star' | 'star-half-full' | 'star-outline' = 'star-outline';
        if (r >= threshold) name = 'star';
        else if (r >= threshold - 0.5) name = 'star-half-full';
        return (
          <MaterialCommunityIcons key={`wf-dstar-${index}`} name={name} size={starSize} color={starColor} />
        );
      })}
    </View>
  );
}

export type IconVaultLookup = MaterialIconVaultLookup | null | undefined;

/**
 * Igual que `renderVaultMiniIcon` en cards.tsx: URL → imagen; si no, glifo Material + vault lookup opcional.
 */
export function renderWireframeMiniIcon(
  item: WireframeVaultItem | null | undefined,
  size = 20,
  glyphColor?: string,
  iconVaultById?: IconVaultLookup,
  emptyTint = '#94A3B8',
) {
  const tint = glyphColor ?? emptyTint;
  try {
    if (!item) {
      return <MaterialCommunityIcons name="link-variant" size={size} color={emptyTint} />;
    }
    if (item.icon?.startsWith('http')) {
      return (
        <ExpoImage source={{ uri: item.icon }} style={{ width: size, height: size, borderRadius: size / 2 }} cachePolicy="disk" />
      );
    }
    const safeIconName = resolveMaterialGlyphFromVaultLikeFields(item, iconVaultById ?? null);
    return <MaterialCommunityIcons name={(safeIconName || 'help-circle') as any} size={size} color={tint} />;
  } catch {
    return <MaterialCommunityIcons name={'help-circle' as any} size={size} color={tint} />;
  }
}

export type ReceiverWireframeSlotHandlers = {
  tr: (es: string, en: string) => string;
  onDataPress: (item: WireframeVaultItem) => void | Promise<void>;
  onMirrorLongPress?: (slot: WireframeEditSlot) => void;
  iconVaultById?: IconVaultLookup;
};

/** Slot renderer receptor: mismo `WireframeSlotTile` que Contactos, con mini-iconos unificados. */
export function createReceiverWireframeSlotRenderer(h: ReceiverWireframeSlotHandlers) {
  return (slot: WireframeEditSlot, ui: { size: number }, _editable: boolean, chestTheme: ChestCardTheme) => (
    <WireframeSlotTile
      slot={slot}
      ui={ui}
      editable={false}
      chestTheme={chestTheme}
      tr={h.tr}
      renderMiniIcon={(item, size, gc) => renderWireframeMiniIcon(item, size, gc, h.iconVaultById)}
      onEditableOpenPicker={() => {}}
      onDataPress={(it) => void h.onDataPress(it as WireframeVaultItem)}
      onMirrorLongPress={h.onMirrorLongPress}
    />
  );
}
