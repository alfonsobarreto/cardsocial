import type { PublicCardSlotPayload, IssuerSnapshotPayload, IssuerVaultPickedItem } from '@/services/qrApi';

/**
 * Construye `issuerSnapshot` alineado con Mongo (Phase 1): misma whitelist que el backend
 * (`issuerSnapshot.js`) a partir de `publicCardSlots` ya filtrados (sin Ghost value, etc.).
 */
export function buildIssuerSnapshotFromPublicSlots(params: {
  uid: string;
  userFullName: string;
  userNickName: string;
  userAvatarUrl: string | null;
  publicCardSlots: PublicCardSlotPayload[];
  itemIds: string[];
}): IssuerSnapshotPayload {
  const uid = String(params.uid || '').trim();
  const allow = new Set(params.itemIds.map((x) => String(x || '').trim()).filter(Boolean));
  const useAllow = allow.size > 0;
  const picked: IssuerVaultPickedItem[] = [];

  for (const row of params.publicCardSlots.slice(0, 24)) {
    const itemId = String(row.itemId || '').trim().slice(0, 120);
    if (!itemId) continue;
    if (useAllow && !allow.has(itemId)) continue;

    const type = String(row.type || 'link').trim().slice(0, 64);
    const title = String(row.label || '').trim().slice(0, 200);
    const iconRaw = String(row.icon || '').trim();
    const icon = /^https?:\/\//i.test(iconRaw) ? iconRaw.slice(0, 4000) : undefined;
    let publicValue = String(row.value || '').trim();
    if (publicValue.startsWith('data:')) publicValue = '';
    if (type.toLowerCase().includes('ghost')) publicValue = '';
    if (publicValue.length > 4000) publicValue = publicValue.slice(0, 4000);

    const entry: IssuerVaultPickedItem = { itemId, type, title };
    if (icon) entry.icon = icon;
    if (publicValue) entry.publicValue = publicValue;
    picked.push(entry);
  }

  const av = String(params.userAvatarUrl || '').trim();
  return {
    uid,
    userFullName: String(params.userFullName || '').trim(),
    userNickName: String(params.userNickName || '').trim(),
    userAvatarUrl: av || null,
    userVaultPicked: picked,
    snapshotVersion: 1,
    snapshotAt: new Date().toISOString(),
  };
}
