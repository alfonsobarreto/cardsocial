import { resolveMaterialGlyphFromVaultLikeFields } from '@/app/components/iconNameValidation';
import type { PublicCardSlotPayload } from '@/services/qrApi';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React from 'react';

type Props = {
  slot: Pick<PublicCardSlotPayload, 'icon' | 'iconName' | 'type' | 'label'>;
  size: number;
  fallbackColor: string;
};

/**
 * Logo remoto (https) o glifo Material (iconName), alineado con `renderVaultMiniIcon` en Mis Tarjetas.
 */
export function PublicCardSlotGlyph({ slot, size, fallbackColor }: Props) {
  const uri = slot.icon && String(slot.icon).trim().startsWith('http') ? String(slot.icon).trim() : null;
  if (uri) {
    return (
      <ExpoImage
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: Math.max(4, size * 0.18) }}
        cachePolicy="disk"
      />
    );
  }
  const glyph = resolveMaterialGlyphFromVaultLikeFields(
    { icon: slot.icon, iconName: slot.iconName },
    null,
  );
  const name = (glyph || 'link-variant') as keyof typeof MaterialCommunityIcons.glyphMap;
  return <MaterialCommunityIcons name={name} size={size} color={fallbackColor} />;
}
