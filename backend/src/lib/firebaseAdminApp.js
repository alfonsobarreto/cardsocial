/**
 * Firestore Admin (opcional). Config: FIREBASE_SERVICE_ACCOUNT_JSON = JSON string del service account.
 */

let firestoreRef = null;
let initAttempted = false;

function getFirestoreOptional() {
  if (firestoreRef) return firestoreRef;
  if (initAttempted) return null;
  initAttempted = true;
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  try {
    const admin = require('firebase-admin');
    const cred = JSON.parse(raw);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(cred) });
    }
    firestoreRef = admin.firestore();
    return firestoreRef;
  } catch (e) {
    console.warn('[firebase-admin] Firestore no disponible:', e?.message || e);
    return null;
  }
}

module.exports = { getFirestoreOptional };
