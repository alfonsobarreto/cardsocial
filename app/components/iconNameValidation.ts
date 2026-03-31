import { MaterialCommunityIcons } from '@expo/vector-icons';

export const ICON_NAME_ALIASES: Record<string, string> = {
  'file-presentation': 'presentation',
  'alternate-email': 'email',
  gmail: 'gmail',
  stamp: 'certificate',
  sello: 'certificate',
  classic: 'card-text',
  clasico: 'card-text',
  'clásico': 'card-text',
};

export const VALID_MATERIAL_ICON_SET = new Set<string>(
  Object.keys((MaterialCommunityIcons as any)?.glyphMap ?? {})
);

const aliasFor = (value: string) => ICON_NAME_ALIASES[value.toLowerCase()] ?? '';

export const normalizeMaterialIconName = (
  iconName: string | null | undefined,
  fallback = 'help-circle'
): string => {
  const raw = String(iconName || '').trim();
  const normalized = raw.toLowerCase().replace(/\s+/g, '-');
  const aliasedRaw = aliasFor(raw);
  const aliasedNormalized = aliasFor(normalized);

  const candidates = [raw, normalized, aliasedRaw, aliasedNormalized].filter(Boolean);
  for (const candidate of candidates) {
    if (VALID_MATERIAL_ICON_SET.has(candidate)) {
      return candidate;
    }
  }

  return VALID_MATERIAL_ICON_SET.has(fallback) ? fallback : 'help-circle';
};

// Alias exports to keep call-sites simple and explicit by context.
export const sanitizeMaterialIconName = normalizeMaterialIconName;
export const sanitizeMaterialCommunityIconName = normalizeMaterialIconName;
export const normalizeMaterialCommunityIconName = normalizeMaterialIconName;
export const normalizeVaultIconName = normalizeMaterialIconName;
export default normalizeMaterialIconName;
