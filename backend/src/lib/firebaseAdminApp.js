/**
 * Firebase Admin opcional: `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON string del service account).
 * Usado por Firestore admin y verificación de ID tokens (p. ej. eliminación de cuenta + email).
 */

const admin = require('firebase-admin');

let initAttempted = false;

function ensureFirebaseAdminApp() {
  if (admin.apps.length) return admin;
  if (initAttempted) return null;
  initAttempted = true;
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  try {
    const cred = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    return admin;
  } catch (e) {
    console.warn('[firebase-admin] init failed:', e?.message || e);
    return null;
  }
}

function getFirestoreOptional() {
  const a = ensureFirebaseAdminApp();
  return a ? a.firestore() : null;
}

/**
 * @param {string} idToken
 * @returns {Promise<import('firebase-admin').auth.DecodedIdToken>}
 */
async function verifyFirebaseIdToken(idToken) {
  const a = ensureFirebaseAdminApp();
  if (!a) {
    const err = new Error('Firebase Admin is not configured');
    err.code = 'ADMIN_NOT_CONFIGURED';
    throw err;
  }
  return a.auth().verifyIdToken(idToken);
}

module.exports = { getFirestoreOptional, verifyFirebaseIdToken };
