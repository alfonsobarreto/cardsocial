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
    userFullName: pick('userFullName'),
    fullName: pick('fullName'),
    firstName: pick('firstName'),
    lastName: pick('lastName'),
    userNickName: pick('userNickName'),
    nickname: pick('nickname'),
    userNickNameLower: pick('userNickNameLower'),
    nicknameLower: pick('nicknameLower'),
    userAvatarUrl: pick('userAvatarUrl'),
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
      userAvatarUrl: null,
      ownerOccupation: null,
    };
  }

  const firstName = String(merged.firstName || '').trim();
  const lastName = String(merged.lastName || '').trim();
  const composedFull = `${firstName} ${lastName}`.trim();

  /** Priorizar userFullName canónico; luego first+last y legacy. */
  let fullName = pickFirstNonGeneric(
    merged.userFullName,
    composedFull,
    merged.fullName,
    merged.displayName,
    merged.name,
  );
  if (!fullName) {
    fullName = String(
      merged.userFullName || merged.displayName || merged.name || merged.fullName || '',
    ).trim();
  }

  const username = String(
    merged.userNickName || merged.nickname || merged.userNickNameLower || merged.nicknameLower || '',
  )
    .trim()
    .replace(/^@+/g, '');
  const userAvatarUrl = String(merged.userAvatarUrl || '').trim() || null;

  return {
    uid: safeUid,
    fullName,
    username,
    name: fullName,
    nickname: username,
    userAvatarUrl,
    ownerOccupation: null,
  };
}

module.exports = {
  mergeUsersAndProfilesDocuments,
  buildMongoExtendedProfileFields,
};
