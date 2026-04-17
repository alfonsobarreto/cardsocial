/**
 * Phase 1 — `issuerSnapshot` en Mongo `smart_cards` (smart + business mirror).
 * Identidad del emisor desde perfil Mongo; `userVaultPicked` solo whitelist desde slots ya sanitizados.
 */

const MAX_PICKED = 24;
const MAX_PUBLIC_VALUE = 4000;

function isGhostLikeType(type) {
  const t = String(type || '').toLowerCase();
  return t.includes('ghost');
}

/**
 * @param {Array<object>} sanitizedPublicSlots — salida de `sanitizePublicCardSlots` (sin privados).
 * @param {string[]} itemIds — ids en la tarjeta; si no vacío, solo se incluyen filas cuyo itemId esté en la lista.
 */
function buildIssuerVaultPickedFromSanitizedPublicSlots(sanitizedPublicSlots, itemIds) {
  const allow = new Set((itemIds || []).map((id) => String(id || '').trim()).filter(Boolean));
  const useAllow = allow.size > 0;
  const rows = Array.isArray(sanitizedPublicSlots) ? sanitizedPublicSlots : [];
  const out = [];

  for (const row of rows.slice(0, MAX_PICKED)) {
    const itemId = String(row?.itemId || '').trim().slice(0, 120);
    if (!itemId) continue;
    if (useAllow && !allow.has(itemId)) continue;

    const type = String(row?.type || 'link').trim().slice(0, 64);
    const title = String(row?.label ?? row?.title ?? '').trim().slice(0, 200);

    const iconRaw = String(row?.icon || '').trim();
    const icon = /^https?:\/\//i.test(iconRaw) ? iconRaw.slice(0, 4000) : undefined;

    let publicValue = String(row?.value ?? row?.publicValue ?? row?.url ?? '').trim();
    if (publicValue.startsWith('data:')) publicValue = '';
    if (publicValue.length > MAX_PUBLIC_VALUE) publicValue = publicValue.slice(0, MAX_PUBLIC_VALUE);
    if (isGhostLikeType(type)) publicValue = '';

    const entry = { itemId, type, title };
    if (icon) entry.icon = icon;
    if (publicValue) entry.publicValue = publicValue;
    out.push(entry);
  }
  return out;
}

/**
 * @param {string} userUid
 * @param {object} extendedProfile — resultado de `resolveUserProfileExtended` / `buildMongoExtendedProfileFields`
 * @param {Array<object>} sanitizedPublicSlots
 * @param {string[]} itemIds
 */
function composeIssuerSnapshot(userUid, extendedProfile, sanitizedPublicSlots, itemIds) {
  const uid = String(userUid || '').trim();
  const fullName = String(extendedProfile?.fullName || extendedProfile?.name || '').trim();
  const nick = String(extendedProfile?.username || extendedProfile?.nickname || '').trim();
  const avatarRaw =
    extendedProfile?.userAvatarUrl != null ? String(extendedProfile.userAvatarUrl).trim() : '';
  const userAvatarUrl = avatarRaw || null;

  return {
    uid,
    userFullName: fullName,
    userNickName: nick,
    userAvatarUrl,
    userVaultPicked: buildIssuerVaultPickedFromSanitizedPublicSlots(sanitizedPublicSlots, itemIds),
    snapshotVersion: 1,
    snapshotAt: new Date().toISOString(),
  };
}

module.exports = {
  buildIssuerVaultPickedFromSanitizedPublicSlots,
  composeIssuerSnapshot,
};
