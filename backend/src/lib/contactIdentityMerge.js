/**
 * Identidad en contactos / relaciones: si Mongo users/profiles no tiene nombre real,
 * prevalecen los campos guardados en smart_cards (preview del emisor).
 */

function isSyntheticMongoUserName(name, uid) {
  const n = String(name || '').trim();
  const u = String(uid || '').trim();
  if (!u || u.length < 6) {
    return false;
  }
  return n === `User ${u.slice(0, 6)}`;
}

/**
 * @param {object} profile - { uid, name, nickname, photoUrl }
 * @param {string} uid
 * @param {object|null} cardDoc - fragmento smart_cards
 * @returns {object} profile enriquecido + ownerOccupation desde tarjeta si existe
 */
function mergeContactProfileFromCard(profile, uid, cardDoc) {
  const display = cardDoc?.ownerDisplayName ? String(cardDoc.ownerDisplayName).trim().slice(0, 240) : '';
  const cardNick = cardDoc?.ownerNickname ? String(cardDoc.ownerNickname).trim().slice(0, 240) : '';
  const cardPhoto = cardDoc?.ownerPhotoUrl ? String(cardDoc.ownerPhotoUrl).trim() : '';
  const occupation = cardDoc?.ownerOccupation ? String(cardDoc.ownerOccupation).trim().slice(0, 240) : '';

  // Business cards must never blend with the personal profile.
  // Use the business identity (ownerDisplayName / ownerPhotoUrl) exclusively.
  if (cardDoc?.cardType === 'business') {
    return {
      uid: profile.uid,
      name: display || cardNick || profile.name,
      nickname: display || cardNick || profile.nickname,
      photoUrl: cardPhoto || null,
      ownerOccupation: occupation || null,
    };
  }

  let name = profile.name;
  let nickname = profile.nickname;
  let photoUrl = profile.photoUrl;

  const weakName =
    isSyntheticMongoUserName(profile.name, uid) ||
    String(profile.name || '').trim() === 'Usuario' ||
    !String(profile.name || '').trim();

  if (weakName) {
    if (display) {
      name = display;
      nickname = cardNick
        ? String(cardNick).toLowerCase().replace(/\s+/g, '_')
        : String(display).toLowerCase().replace(/\s+/g, '_');
    } else if (cardNick) {
      name = cardNick;
      nickname = String(cardNick).toLowerCase().replace(/\s+/g, '_');
    }
  }
  if (!photoUrl && cardPhoto) {
    photoUrl = cardPhoto;
  }

  return {
    uid: profile.uid,
    name,
    nickname,
    photoUrl,
    ownerOccupation: occupation || null,
  };
}

module.exports = {
  isSyntheticMongoUserName,
  mergeContactProfileFromCard,
};
