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
    const brand = String(display || cardNick || profile.name || "").trim();
    return {
      ...profile,
      name: brand || profile.name,
      fullName: brand || profile.fullName || profile.name,
      nickname: String(profile.username || profile.nickname || cardNick || "").trim(),
      photoUrl: cardPhoto || profile.photoUrl || null,
      ownerOccupation: occupation || profile.ownerOccupation || null,
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
      // Only use cardNick as the nickname, never promote it to display name
      nickname = String(cardNick).toLowerCase().replace(/\s+/g, '_');
    }
  }
  if (!photoUrl && cardPhoto) {
    photoUrl = cardPhoto;
  }

  return {
    ...profile,
    fullName: name,
    name,
    nickname,
    photoUrl,
    ownerOccupation: occupation || profile.ownerOccupation || null,
  };
}

/**
 * Lista de receptores: nunca mezclar `ownerDisplayName` de smart_cards (suele ser el nombre de la tarjeta).
 * Solo rellenar foto y ocupación desde la tarjeta si faltan en el perfil Mongo.
 * @param {object} profile - resultado de resolveUserProfileExtended
 * @param {object|null} cardDoc - smart_cards (proyección acotada)
 */
function enrichSubscriberProfileFromCard(profile, cardDoc) {
  if (!cardDoc) {
    return { ...profile };
  }
  const cardPhoto = cardDoc.ownerPhotoUrl ? String(cardDoc.ownerPhotoUrl).trim() : "";
  const occupation = cardDoc.ownerOccupation ? String(cardDoc.ownerOccupation).trim().slice(0, 240) : "";

  return {
    ...profile,
    photoUrl: profile.photoUrl || cardPhoto || null,
    ownerOccupation: occupation || profile.ownerOccupation || null,
  };
}

module.exports = {
  isSyntheticMongoUserName,
  mergeContactProfileFromCard,
  enrichSubscriberProfileFromCard,
};
