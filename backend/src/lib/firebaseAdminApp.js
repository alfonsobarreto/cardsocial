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
    // Azure (and many CI/CD systems) store the JSON in a single env var and
    // serialize literal newlines as the two-character sequence \n.  The Node.js
    // crypto layer then receives a malformed PEM and throws
    // "Unparsed DER bytes remain after ASN.1 parsing".
    // Fix: unescape \n -> actual newline in private_key only (safe for all other fields).
    if (typeof cred.private_key === 'string') {
      cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    }
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

/** @returns {import('firebase-admin').auth.Auth} */
function getFirebaseAdminAuth() {
  const a = ensureFirebaseAdminApp();
  if (!a) {
    const err = new Error('Firebase Admin is not configured');
    err.code = 'ADMIN_NOT_CONFIGURED';
    throw err;
  }
  return a.auth();
}

module.exports = { getFirestoreOptional, verifyFirebaseIdToken, getFirebaseAdminAuth };
