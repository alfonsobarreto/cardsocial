/**
 * Nombre público de respeto para emisor (sin "User + id" genérico).
 * Orden: ownerDisplayName en smart_cards → users/profiles (fullName, displayName, name) → fallback neutral.
 */

const { readSmartCardScName } = require('./smartCardScName');

/** Fallback neutral cuando no hay nombre resoluble (app global; sin personas fijas). */
const RESPECT_FALLBACK_NAME = 'Card owner';

function isGenericUserLabel(name) {
  const s = String(name || '').trim();
  if (!s) {
    return true;
  }
  if (/^user\s+[a-z0-9]{1,12}$/i.test(s)) {
    return true;
  }
  if (/^user[a-z0-9]*$/i.test(s.replace(/\s+/g, ''))) {
    return true;
  }
  return false;
}

function pickFirstNonGeneric(...candidates) {
  for (const c of candidates) {
    const v = String(c || '').trim();
    if (v && !isGenericUserLabel(v)) {
      return v;
    }
  }
  return '';
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} ownerUid
 * @param {string} cardId
 * @returns {Promise<{ fullName: string; cardTitle: string }>}
 */
async function resolvePublicIdentity(db, ownerUid, cardId) {
  const ou = String(ownerUid || '').trim();
  const cid = String(cardId || '').trim();
  if (!ou || !cid) {
    return { fullName: RESPECT_FALLBACK_NAME, cardTitle: 'Card-Social' };
  }

  const card = await db.collection('smart_cards').findOne(
    { ownerUid: ou, cardId: cid },
    { projection: { ownerDisplayName: 1, scName: 1 } },
  );

  const cardTitle = String(readSmartCardScName(card) || '').trim() || 'Card-Social';

  const fromCard = pickFirstNonGeneric(card?.ownerDisplayName);
  if (fromCard) {
    return { fullName: fromCard, cardTitle };
  }

  const usersDoc = await db.collection('users').findOne(
    { uid: ou },
    { projection: { displayName: 1, name: 1, fullName: 1 } },
  );
  const profilesDoc = usersDoc
    ? null
    : await db.collection('profiles').findOne(
        { uid: ou },
        { projection: { displayName: 1, name: 1, fullName: 1 } },
      );

  const src = usersDoc || profilesDoc;
  const fromProfile = pickFirstNonGeneric(src?.fullName, src?.displayName, src?.name);
  if (fromProfile) {
    return { fullName: fromProfile, cardTitle };
  }

  return { fullName: RESPECT_FALLBACK_NAME, cardTitle };
}

module.exports = {
  resolvePublicIdentity,
  RESPECT_FALLBACK_NAME,
  isGenericUserLabel,
  pickFirstNonGeneric,
};
