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

/**
 * NOTA: antes había dos helpers `renderWireframeDetailedRatingStars` y
 * `renderWireframeMirrorRatingStars` que pintaban estrellas tipo Amazon. Se
 * eliminaron — el rating oficial son las **medallas** (`medalPills` en
 * `IsolatedWireframeCard.renderMirrorStatsCapsule`).
 */

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

/**
 * Preview modal / web: favicon en cuadrado redondeado (no círculo inscrito) para no dejar “anillo” vacío en el bubble.
 * Glifo Material sigue a tamaño `size` (≈ 0.9 × bubble desde `WireframeSlotTile`).
 *
 * URLs: el `borderRadius` va en un `View` con `overflow: 'hidden'` (no en la `ExpoImage`); en Android,
 * radio en la imagen nativa recorta mal el píxel superior. `contentFit="contain"` evita el recorte
 * agresivo del default (`cover`) que en nativo no coincide con el `<img objectFit="cover">` del navegador.
 */
export function renderWireframeMirrorMiniIcon(
  item: WireframeVaultItem | null | undefined,
  size = 20,
  glyphColor?: string,
  iconVaultById?: IconVaultLookup,
  emptyTint = '#94A3B8',
) {
  const tint = glyphColor ?? emptyTint;
  const imgRadius = Math.max(4, Math.min(18, Math.round(size * 0.22)));
  try {
    if (!item) {
      return <MaterialCommunityIcons name="link-variant" size={size} color={emptyTint} />;
    }
    if (item.icon?.startsWith('http')) {
      return (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: imgRadius,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ExpoImage
            source={{ uri: item.icon }}
            style={{ width: size, height: size }}
            contentFit="contain"
            cachePolicy="disk"
          />
        </View>
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

/**
 * Renderer del modal de vista previa (Mis Tarjetas / Contactos / Búsqueda).
 * Usa `WireframeSlotTile` en modo espejo con la misma geometría que la web (`WebWireframeSlotTile`) y
 * `renderWireframeMirrorMiniIcon` para favicons (esquinas acordes al cuadrado, no disco recortado).
 */
export function createReceiverWireframeSlotRenderer(h: ReceiverWireframeSlotHandlers) {
  return (slot: WireframeEditSlot, ui: { size: number }, _editable: boolean, chestTheme: ChestCardTheme) => (
    <WireframeSlotTile
      slot={slot}
      ui={ui}
      editable={false}
      chestTheme={chestTheme}
      tr={h.tr}
      renderMiniIcon={(item, size, gc) => renderWireframeMirrorMiniIcon(item, size, gc, h.iconVaultById)}
      onEditableOpenPicker={() => {}}
      onDataPress={(it) => void h.onDataPress(it as WireframeVaultItem)}
      onMirrorLongPress={h.onMirrorLongPress}
    />
  );
}

/** Alias explícito para quien lea el modal: mismo cuerpo que `createReceiverWireframeSlotRenderer`. */
export const createPreviewWireframeSlotRenderer = createReceiverWireframeSlotRenderer;
