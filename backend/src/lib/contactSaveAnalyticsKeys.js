'use strict';

/** Alineado con `constants/contactSaveAnalyticsKeys.ts` (app + web + dashboard). */
const CONTACT_SAVE_ANALYTICS_APP = 'contact_saved_app';
const CONTACT_SAVE_ANALYTICS_PHONE = 'contact_saved_phone';

const CONTACT_SAVE_SUBTYPES = new Set([CONTACT_SAVE_ANALYTICS_APP, CONTACT_SAVE_ANALYTICS_PHONE]);

function isContactSaveSubtype(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_');
  return CONTACT_SAVE_SUBTYPES.has(key);
}

/** subTypes de sistema (no son slots de la tarjeta). */
const ANALYTICS_INTERNAL_SUBTYPES = new Set([
  'modal_open',
  'universal_open',
  'web_universal_24h',
  'unknown',
  ...CONTACT_SAVE_SUBTYPES,
]);

function isInternalAnalyticsSubtype(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_');
  return ANALYTICS_INTERNAL_SUBTYPES.has(key);
}

function isOwnerViewer(viewerUid, ownerUid) {
  const v = String(viewerUid || '').trim();
  const o = String(ownerUid || '').trim();
  return Boolean(v && o && v === o);
}

module.exports = {
  CONTACT_SAVE_ANALYTICS_APP,
  CONTACT_SAVE_ANALYTICS_PHONE,
  CONTACT_SAVE_SUBTYPES,
  ANALYTICS_INTERNAL_SUBTYPES,
  isContactSaveSubtype,
  isInternalAnalyticsSubtype,
  isOwnerViewer,
};
