/**
 * Canje de packs comerciales tras IAP (productId publicado en `system_config/commerce`).
 */
const { getFirestoreOptional } = require('./firebaseAdminApp');

function coercePackList(raw, fields) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const o = row;
    const id = String(o.id ?? `pack_${index}`).trim() || `pack_${index}`;
    const productId = String(o.productId ?? '').trim();
    const priceUsd = Number(o.priceUsd);
    if (!productId || !Number.isFinite(priceUsd) || priceUsd <= 0) return;
    const base = { id, productId, priceUsd: Math.max(0, priceUsd), popular: Boolean(o.popular) };
    if (fields === 'voip') {
      const minutes = Math.max(1, Math.floor(Number(o.minutes) || 0));
      out.push({ ...base, minutes });
    } else if (fields === 'icon') {
      const slots = Math.max(1, Math.floor(Number(o.slots) || 0));
      out.push({ ...base, slots });
    }
  });
  return out;
}

async function loadCommerceCatalog() {
  const fs = getFirestoreOptional();
  if (!fs) return { voipMinutePacks: [], iconDataSlotPacks: [] };
  try {
    const snap = await fs.collection('system_config').doc('commerce').get();
    if (!snap.exists) return { voipMinutePacks: [], iconDataSlotPacks: [] };
    const d = snap.data() || {};
    return {
      voipMinutePacks: coercePackList(d.voipMinutePacks, 'voip'),
      iconDataSlotPacks: coercePackList(d.iconDataSlotPacks, 'icon'),
    };
  } catch {
    return { voipMinutePacks: [], iconDataSlotPacks: [] };
  }
}

function findVoipPack(catalog, packId, productId) {
  const id = String(packId || '').trim();
  const pid = String(productId || '').trim();
  return catalog.voipMinutePacks.find((p) => p.id === id && p.productId === pid) || null;
}

function findIconDataPack(catalog, packId, productId) {
  const id = String(packId || '').trim();
  const pid = String(productId || '').trim();
  return catalog.iconDataSlotPacks.find((p) => p.id === id && p.productId === pid) || null;
}

module.exports = {
  loadCommerceCatalog,
  findVoipPack,
  findIconDataPack,
};
