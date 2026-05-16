/**
 * Identidad en contactos / relaciones: si Mongo users/profiles no tiene nombre real,
 * prevalecen los campos guardados en smart_cards (preview del emisor).
 *
 * Para receptores: `userAvatarUrl` viene de Mongo; si falta y la tarjeta **no** es business,
 * se puede usar `ownerPhotoUrl` de la tarjeta personal como respaldo (evita logo de negocio como cara).
 */

const { isGenericUserLabel, pickFirstNonGeneric } = require('./resolvePublicIdentity');
const { readSmartCardScName } = require('./smartCardScName');

function isSyntheticMongoUserName(name, uid) {
  const n = String(name || '').trim();
  const u = String(uid || '').trim();
  if (!u || u.length < 6) {
    return false;
  }
  return n === `User ${u.slice(0, 6)}`;
}

/**
 * @param {object} profile - { uid, name, nickname, userAvatarUrl } desde Mongo
 * @param {string} uid
 * @param {object|null} cardDoc - fragmento smart_cards
 * @returns {object} profile enriquecido + ownerOccupation desde tarjeta si existe
 */
function mergeContactProfileFromCard(profile, uid, cardDoc) {
  const display = cardDoc?.ownerDisplayName ? String(cardDoc.ownerDisplayName).trim().slice(0, 240) : '';
  const cardNick = cardDoc?.ownerNickname ? String(cardDoc.ownerNickname).trim().slice(0, 240) : '';
  const occupation = cardDoc?.ownerOccupation ? String(cardDoc.ownerOccupation).trim().slice(0, 240) : '';

  const avatarFromProfile = String(profile.userAvatarUrl || '').trim() || null;

  // Business: nombre/marca desde la tarjeta; avatar = solo perfil Mongo (`userAvatarUrl`).
  if (cardDoc?.cardType === 'business') {
    const brand = String(display || cardNick || profile.name || '').trim();
    return {
      ...profile,
      name: brand || profile.name,
      fullName: brand || profile.fullName || profile.name,
      nickname: String(profile.username || profile.nickname || cardNick || '').trim(),
      userAvatarUrl: avatarFromProfile,
      ownerOccupation: occupation || profile.ownerOccupation || null,
    };
  }

  let name = profile.name;
  let nickname = profile.nickname;
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

  return {
    ...profile,
    fullName: name,
    name,
    nickname,
    userAvatarUrl: avatarFromProfile,
    ownerOccupation: occupation || profile.ownerOccupation || null,
  };
}

/**
 * Receptores (GET …/subscribers): perfil Mongo + última smart_card del suscriptor.
 * Limpia etiquetas genéricas; si falta nombre, `ownerDisplayName` de su tarjeta (y marca en business).
 * Avatar: `userAvatarUrl` Mongo; si falta y la tarjeta personal tiene `ownerPhotoUrl`, se usa como
 * respaldo (no aplica a `cardType === 'business'` — evita confundir logo con persona).
 * @param {object} profile - resultado de resolveUserProfileExtended
 * @param {object|null} cardDoc - smart_cards (proyección acotada)
 */
function enrichSubscriberProfileFromCard(profile, cardDoc) {
  const uid = String(profile.uid || '').trim();
  const rawMongoLine = String(profile.fullName || profile.name || '').trim();
  let mongoHuman = '';
  if (rawMongoLine && !isGenericUserLabel(rawMongoLine) && !isSyntheticMongoUserName(rawMongoLine, uid)) {
    mongoHuman = rawMongoLine;
  }
  if (!mongoHuman) {
    mongoHuman = String(
      pickFirstNonGeneric(profile.fullName, profile.name, profile.displayName) || '',
    ).trim();
  }

  let username = String(profile.username || profile.nickname || '')
    .trim()
    .replace(/^@+/g, '');

  const display = cardDoc?.ownerDisplayName ? String(cardDoc.ownerDisplayName).trim().slice(0, 240) : '';
  const cardNick = cardDoc?.ownerNickname ? String(cardDoc.ownerNickname).trim().slice(0, 240) : '';

  // 1) Perfil Mongo legible → 2) Tarjeta (ownerDisplayName, luego ownerNickname) → 3) resto de campos perfil
  let fullName = mongoHuman;
  if (!fullName && cardDoc) {
    fullName = String(display || cardNick || '').trim();
  }
  if (!fullName) {
    fullName = String(profile.displayName || profile.fullName || profile.name || '').trim();
  }

  let userAvatarUrl = String(profile.userAvatarUrl || '').trim() || null;

  if (!cardDoc) {
    return {
      ...profile,
      fullName,
      name: fullName,
      username,
      nickname: username,
      userAvatarUrl,
    };
  }

  const occupation = cardDoc.ownerOccupation ? String(cardDoc.ownerOccupation).trim().slice(0, 240) : '';

  if (!username && cardNick) {
    username = String(cardNick).trim().replace(/^@+/g, '');
  }

  const cardTitle = readSmartCardScName(cardDoc);
  if (!String(fullName || '').trim() && cardTitle) {
    fullName = cardTitle;
  }

  const ctype = String(cardDoc.cardType || '').trim();
  if (!userAvatarUrl && ctype !== 'business') {
    const op = String(cardDoc.ownerPhotoUrl || '').trim();
    if (op) {
      userAvatarUrl = op;
    }
  }

  return {
    ...profile,
    fullName,
    name: fullName,
    username,
    nickname: username,
    userAvatarUrl,
    ownerOccupation: occupation || profile.ownerOccupation || null,
  };
}

module.exports = {
  isSyntheticMongoUserName,
  mergeContactProfileFromCard,
  enrichSubscriberProfileFromCard,
};
