'use strict';

const { sanitizeAnalyticsSegmentKey } = require('../services/cardAnalyticsRecord');

/** Preferir slot/item id único por tarjeta; fallback a tipo legacy (whatsapp, email, …). */
function resolveIconClickSubType(body) {
  const slotId = String(
    body?.slotId || body?.itemId || body?.metadata?.slotId || body?.metadata?.itemId || '',
  ).trim();
  if (slotId) {
    return sanitizeAnalyticsSegmentKey(slotId);
  }
  return sanitizeAnalyticsSegmentKey(
    body?.subType || body?.iconType || body?.slotType || 'unknown',
  );
}

module.exports = {
  resolveIconClickSubType,
};
