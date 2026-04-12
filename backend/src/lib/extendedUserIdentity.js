/**
 * Resolución de identidad desde Mongo: fusionar `users` + `profiles`.
 * Sin placeholders tipo "User abc123" (se filtran vía pickFirstNonGeneric).
 */

const { pickFirstNonGeneric } = require('./resolvePublicIdentity');

function mergeUsersAndProfilesDocuments(usersDoc, profilesDoc) {
  if (!usersDoc && !profilesDoc) {
    return null;
  }
  const pick = (key) => {
    const u = usersDoc?.[key];
    const p = profilesDoc?.[key];
    const su = String(u ?? '').trim();
    const sp = String(p ?? '').trim();
    if (su) {
      return u;
    }
    if (sp) {
      return p;
    }
    return u ?? p ?? '';
  };
  return {
    displayName: pick('displayName'),
    name: pick('name'),
    fullName: pick('fullName'),
    firstName: pick('firstName'),
    lastName: pick('lastName'),
    nickname: pick('nickname'),
    nicknameLower: pick('nicknameLower'),
    photoUrl: pick('photoUrl'),
    avatarUrl: pick('avatarUrl'),
    profilePhoto: pick('profilePhoto'),
  };
}

/**
 * @param {string} safeUid
 * @param {object|null} usersDoc
 * @param {object|null} profilesDoc
 */
function buildMongoExtendedProfileFields(safeUid, usersDoc, profilesDoc) {
  const merged = mergeUsersAndProfilesDocuments(usersDoc, profilesDoc);
  if (!merged) {
    return {
      uid: safeUid,
      fullName: '',
      username: '',
      name: '',
      nickname: '',
      photoUrl: null,
      ownerOccupation: null,
    };
  }

  const firstName = String(merged.firstName || '').trim();
  const lastName = String(merged.lastName || '').trim();
  const composedFull = `${firstName} ${lastName}`.trim();

  /** Persona: priorizar first+last; si no hay, no “apagar” displayName/name del documento Mongo. */
  let fullName = pickFirstNonGeneric(
    composedFull,
    merged.fullName,
    merged.displayName,
    merged.name,
  );
  if (!fullName) {
    fullName = String(merged.displayName || merged.name || merged.fullName || '').trim();
  }

  const username = String(merged.nickname || merged.nicknameLower || '')
    .trim()
    .replace(/^@+/g, '');
  const photoUrl = String(merged.photoUrl || merged.avatarUrl || merged.profilePhoto || '').trim() || null;

  return {
    uid: safeUid,
    fullName,
    username,
    name: fullName,
    nickname: username,
    photoUrl,
    ownerOccupation: null,
  };
}

module.exports = {
  mergeUsersAndProfilesDocuments,
  buildMongoExtendedProfileFields,
};
