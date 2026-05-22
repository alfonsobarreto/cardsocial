import {
  CONTACT_SAVE_ANALYTICS_APP,
  CONTACT_SAVE_ANALYTICS_PHONE,
} from '@/constants/contactSaveAnalyticsKeys';
import type { PublicCardSlot } from '@/services/types/cards';

export function normalizeAnalyticsSubtype(value: unknown): string {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_') || 'unknown'
  );
}

const CONTACT_SAVE_KEYS = new Set([
  normalizeAnalyticsSubtype(CONTACT_SAVE_ANALYTICS_APP),
  normalizeAnalyticsSubtype(CONTACT_SAVE_ANALYTICS_PHONE),
]);

export function isContactSaveAnalyticsSubtype(value: unknown): boolean {
  return CONTACT_SAVE_KEYS.has(normalizeAnalyticsSubtype(value));
}

/** Mapa subType → conteo, excluyendo guardados de contacto (métrica aparte). */
export function buildSlotClickMap(
  topIcons: Array<{ iconType: string; count: number }> | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of topIcons || []) {
    const key = normalizeAnalyticsSubtype(row.iconType);
    if (isContactSaveAnalyticsSubtype(key)) continue;
    const n = Number(row.count || 0) || 0;
    if (n > 0) map.set(key, n);
  }
  return map;
}

/** Resuelve clics de un slot público: primero itemId único; fallback legacy por tipo/nombre. */
export function clicksForPublicSlot(slot: PublicCardSlot, clickMap: Map<string, number>): number {
  const itemIdKey = normalizeAnalyticsSubtype(slot.itemId);
  if (itemIdKey && itemIdKey !== 'unknown') {
    const exact = clickMap.get(itemIdKey);
    if (exact != null) {
      return exact;
    }
  }

  const legacyCandidates = [slot.type, slot.label, slot.iconName]
    .map(normalizeAnalyticsSubtype)
    .filter((k) => k && k !== 'unknown');

  for (const key of legacyCandidates) {
    const hit = clickMap.get(key);
    if (hit != null) {
      return hit;
    }
  }
  return 0;
}

export type ContactSavesCounts = { app: number; phone: number };

export function contactSavesFromSummary(summary: {
  contactSaves?: ContactSavesCounts;
  topIcons?: Array<{ iconType: string; count: number }>;
} | undefined): ContactSavesCounts {
  if (summary?.contactSaves) {
    return {
      app: Number(summary.contactSaves.app || 0) || 0,
      phone: Number(summary.contactSaves.phone || 0) || 0,
    };
  }
  let app = 0;
  let phone = 0;
  for (const row of summary?.topIcons || []) {
    const key = normalizeAnalyticsSubtype(row.iconType);
    const n = Number(row.count || 0) || 0;
    if (key === normalizeAnalyticsSubtype(CONTACT_SAVE_ANALYTICS_APP)) app = n;
    if (key === normalizeAnalyticsSubtype(CONTACT_SAVE_ANALYTICS_PHONE)) phone = n;
  }
  return { app, phone };
}
