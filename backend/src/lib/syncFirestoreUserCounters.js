/**
 * Denormaliza contadores en `users/{uid}` para reglas server-side (p. ej. Market Radar desde Studio Web).
 */
const { getFirestoreOptional } = require('./firebaseAdminApp');

async function syncBusinessCardsOwnedCountForUser(uid, count) {
  const id = String(uid || '').trim();
  /** @type {number} */
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!id) return;
  const fs = getFirestoreOptional();
  if (!fs) return;
  try {
    await fs.collection('users').doc(id).set({ businessCardsOwnedCount: n }, { merge: true });
  } catch (e) {
    console.warn('[syncBusinessCardsOwnedCountForUser]', id, e?.message || e);
  }
}

module.exports = { syncBusinessCardsOwnedCountForUser };
