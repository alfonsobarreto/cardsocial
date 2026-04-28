import { isGhostLinkVaultType } from '../constants/ghostLinkVault';
import {
  normalizeMaterialIconNamePermissive,
  resolveMaterialGlyphFromVaultLikeFieldsShared,
} from './materialIconResolveShared';

/** Misma forma que `PublicCardSlotPayload` en `qrApi` (definida aquí para no arrastrar `qrApi` en Next). */
export type VaultPublicCardSlotPayload = {
  itemId: string;
  type?: string;
  label?: string;
  value?: string;
  iconName?: string;
  icon?: string;
  isPrivate?: boolean;
  visibility?: string;
  vaultMimeType?: string;
};

/** Subconjunto de icon_vault suficiente para resolver glifos en slots públicos. */
export type IconVaultGlyphLookup = Record<string, { materialIconName?: string | null } | undefined>;

export type VaultLinkSnapshotItem = {
  id: string;
  title: string;
  type: string;
  value: string;
  iconName: string;
  icon?: string;
  iconVaultId?: string;
  vaultProtected?: boolean;
  isFavorite: boolean;
  vaultMimeType?: string;
};

export function migrateVaultIconsForStorage(items: unknown[]): VaultLinkSnapshotItem[] {
  return (items as any[]).map((item) => {
    if (item.iconName === 'alternate-email') return { ...item, iconName: 'email' };
    if (item.iconName === 'file-presentation') return { ...item, iconName: 'file-document' };
    if (item.iconName === 'Gmail') return { ...item, iconName: 'gmail' };
    if (item.iconName === 'Stamp') return { ...item, iconName: 'certificate' };
    if (item.iconName === 'Classic') return { ...item, iconName: 'card-text' };
    if (!item.iconName || item.iconName.includes(' ') || item.iconName === '') {
      return { ...item, iconName: 'link-variant' };
    }
    return { ...item, iconName: normalizeMaterialIconNamePermissive(item.iconName, 'link-variant') };
  }) as VaultLinkSnapshotItem[];
}

export function buildPublicCardSlotsForPersist(
  vaultItems: VaultLinkSnapshotItem[],
  itemIds: string[],
  iconVaultById: IconVaultGlyphLookup,
): VaultPublicCardSlotPayload[] {
  const out: VaultPublicCardSlotPayload[] = [];
  const seen = new Set<string>();
  for (const id of itemIds) {
    const trimmedId = String(id || '').trim();
    if (!trimmedId || seen.has(trimmedId)) {
      continue;
    }
    seen.add(trimmedId);
    const it = vaultItems.find((v) => String(v.id || '').trim() === trimmedId);
    if (!it) {
      continue;
    }
    const iconRaw = String(it.icon || '').trim();
    const iconUrl = /^https?:\/\//i.test(iconRaw) ? iconRaw.slice(0, 4000) : undefined;
    const resolvedGlyph = resolveMaterialGlyphFromVaultLikeFieldsShared(
      {
        icon: it.icon,
        iconName: it.iconName,
        iconVaultId: it.iconVaultId,
      },
      iconVaultById,
    );
    const value = isGhostLinkVaultType(it.type) ? '' : String(it.value || '').trim();
    const row: VaultPublicCardSlotPayload = {
      itemId: trimmedId,
      type: String(it.type || 'link').slice(0, 64),
      label: String(it.title || '').slice(0, 200),
      value: value.slice(0, 4000),
    };
    if (iconUrl) {
      row.icon = iconUrl;
    }
    if (resolvedGlyph) {
      row.iconName = resolvedGlyph.slice(0, 120);
    }
    const vm = String((it as { vaultMimeType?: string }).vaultMimeType || '').trim();
    if (vm) {
      row.vaultMimeType = vm.slice(0, 120);
    }
    out.push(row);
  }
  return out.slice(0, 24);
}
