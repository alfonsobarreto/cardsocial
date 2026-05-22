import { buildSlotClickMap, clicksForPublicSlot } from '@/services/dashboardAnalytics';
import type { PublicCardSlot } from '@/services/types/cards';

export const CARD_ICON_ANALYTICS_PREVIEW = 5;

export type CardIconAnalyticsRow = {
  key: string;
  label: string;
  clicks: number;
  percent: number;
  iconName: string;
  iconUrl: string | null;
};

export function sortIconAnalyticsRows(rows: CardIconAnalyticsRow[]): CardIconAnalyticsRow[] {
  const hasClicks = rows.some((row) => row.clicks > 0);
  return [...rows].sort((a, b) => {
    if (!hasClicks) {
      return a.label.localeCompare(b.label, 'es', { sensitivity: 'base' });
    }
    return (
      b.percent - a.percent ||
      b.clicks - a.clicks ||
      a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })
    );
  });
}

/** Lista alineada con `publicCardSlots` + `vaultItemIds` actuales (business y smart card). */
export function buildBusinessCardIconAnalyticsRows(
  card: { vaultItemIds?: string[]; publicCardSlots?: PublicCardSlot[] } | null,
  topIcons: Array<{ iconType: string; count: number }> | undefined,
  totalViews: number,
): CardIconAnalyticsRow[] {
  const activeVaultIds = new Set(
    (card?.vaultItemIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  );
  const slots = (card?.publicCardSlots || []).filter((slot) => {
    const itemId = String(slot.itemId || '').trim();
    if (activeVaultIds.size && !activeVaultIds.has(itemId)) {
      return false;
    }
    return String(slot.label || slot.type || '').trim();
  });
  const clickMap = buildSlotClickMap(topIcons);
  const views = Math.max(0, Number(totalViews || 0) || 0);
  const rows = slots.map((slot) => {
    const clicks = clicksForPublicSlot(slot, clickMap);
    return {
      key: String(slot.itemId || `${slot.type}-${slot.label}`),
      label: String(slot.label || slot.type || 'IconoData').trim(),
      iconName: String(slot.iconName || 'link-variant'),
      iconUrl: slot.icon && /^https?:\/\//i.test(String(slot.icon)) ? String(slot.icon) : null,
      clicks,
      percent: views > 0 ? Math.min(100, Math.round((clicks / views) * 100)) : 0,
    };
  });
  return sortIconAnalyticsRows(rows);
}

export function visibleIconAnalyticsRows(
  rows: CardIconAnalyticsRow[],
  expanded: boolean,
): {
  iconRows: CardIconAnalyticsRow[];
  hasMore: boolean;
  showToggle: boolean;
  toggleIsLess: boolean;
} {
  const hasMore = rows.length > CARD_ICON_ANALYTICS_PREVIEW;
  if (!hasMore) {
    return { iconRows: rows, hasMore: false, showToggle: false, toggleIsLess: false };
  }
  if (expanded) {
    return { iconRows: rows, hasMore: true, showToggle: true, toggleIsLess: true };
  }
  return {
    iconRows: rows.slice(0, CARD_ICON_ANALYTICS_PREVIEW),
    hasMore: true,
    showToggle: true,
    toggleIsLess: false,
  };
}
