import type { PublicCardSlotPayload } from '@/services/qrApi';

/** Misma forma mínima que `VaultItem` en Mis Tarjetas (wireframe + acciones). */
export type MirrorVaultItem = {
  id: string;
  title: string;
  type: string;
  value: string;
  iconName: string;
  icon?: string;
  iconVaultId?: string;
  vaultProtected?: boolean;
  isFavorite: boolean;
};

export function publicSlotToMirrorVaultItem(s: PublicCardSlotPayload): MirrorVaultItem {
  return {
    id: String(s.itemId || '').trim(),
    title: String(s.label || ''),
    type: String(s.type || 'link'),
    value: String(s.value || ''),
    iconName: String(s.iconName || ''),
    icon: s.icon,
    isFavorite: false,
  };
}

/**
 * Mismo orden que Mis Tarjetas: una fila por `itemIds[i]` en ese orden (no el orden del array `publicCardSlots` ni el de la bóveda).
 * Solo se incluye un ítem si existe `publicCardSlots` para ese `itemId`.
 */
export function buildMirrorVaultItemsForContact(contact: {
  itemIds?: string[];
  publicCardSlots?: PublicCardSlotPayload[];
  searchFacets?: Array<{ type: string; label: string; value: string }>;
}): MirrorVaultItem[] {
  const slots = Array.isArray(contact.publicCardSlots) ? contact.publicCardSlots : [];
  const byId = new Map(slots.map((s) => [String(s.itemId || '').trim(), s]));
  const ids = Array.isArray(contact.itemIds)
    ? contact.itemIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];

  if (ids.length) {
    const out: MirrorVaultItem[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (row) {
        out.push(publicSlotToMirrorVaultItem(row));
      }
    }
    return out;
  }

  if (slots.length) {
    return slots.map(publicSlotToMirrorVaultItem);
  }

  const facets = Array.isArray(contact.searchFacets) ? contact.searchFacets : [];
  return facets.map((f, i) => ({
    id: `facet-${i}`,
    title: String(f.label || ''),
    type: String(f.type || 'link'),
    value: String(f.value || ''),
    iconName: '',
    isFavorite: false,
  }));
}
