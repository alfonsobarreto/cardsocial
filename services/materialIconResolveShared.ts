/**
 * Normalización de glifos Material para construir `publicCardSlots` sin depender de
 * `@expo/vector-icons` (Next/web y Node pueden importar esto con seguridad).
 */

export const ICON_NAME_ALIASES: Record<string, string> = {
  'file-presentation': 'presentation',
  'alternate-email': 'email',
  gmail: 'gmail',
  stamp: 'certificate',
  sello: 'certificate',
  classic: 'card-text',
  clasico: 'card-text',
  clásico: 'card-text',
};

export function normalizeMaterialIconNamePermissive(
  iconName: string | null | undefined,
  fallback = 'help-circle',
): string {
  const raw = String(iconName || '').trim();
  if (!raw) return fallback;
  const normalized = raw.toLowerCase().replace(/\s+/g, '-');
  const aliasedRaw = ICON_NAME_ALIASES[raw.toLowerCase()] ?? '';
  const aliasedNormalized = ICON_NAME_ALIASES[normalized] ?? '';
  const candidate = aliasedNormalized || aliasedRaw || normalized || raw.toLowerCase();
  if (!candidate || !/^[a-z0-9-]+$/.test(candidate)) {
    return fallback;
  }
  return candidate;
}

export type MaterialIconVaultLookup = Record<string, { materialIconName?: string | null } | undefined>;

/** Misma prioridad que la UI de bóveda: catálogo (`iconVaultId`) → `icon` → `iconName`. */
export function resolveMaterialGlyphFromVaultLikeFieldsShared(
  fields: {
    icon?: string | null;
    iconName?: string | null;
    iconVaultId?: string | null;
  },
  iconVaultById?: MaterialIconVaultLookup | null,
): string {
  const iconRaw = String(fields.icon || '').trim();
  const labelRaw = String(fields.iconName || '').trim();
  const vaultId = String(fields.iconVaultId || '').trim();
  const isHttp = /^https?:\/\//i.test(iconRaw);

  if (!vaultId && !iconRaw && !labelRaw) {
    return '';
  }

  let fromVault = '';
  if (!isHttp && vaultId && iconVaultById) {
    const ent = iconVaultById[vaultId];
    const mn = String(ent?.materialIconName || '').trim();
    if (mn) {
      fromVault = normalizeMaterialIconNamePermissive(mn);
    }
  }

  const fromStoredIcon = !isHttp && iconRaw ? normalizeMaterialIconNamePermissive(iconRaw) : '';
  const fromIconName = labelRaw ? normalizeMaterialIconNamePermissive(labelRaw) : '';

  return fromVault || fromStoredIcon || fromIconName || 'help-circle';
}
