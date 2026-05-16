/**
 * Sincroniza leads de waitlist (colección `waitlist_leads`) cuando la app verifica correo.
 * IDs de documento: base64url del email en minúsculas (misma lógica que el alta desde la landing).
 */

const { FieldValue } = require('firebase-admin/firestore');

function normalizeWaitlistEmail(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function waitlistLeadDocId(emailLower) {
  return Buffer.from(normalizeWaitlistEmail(emailLower), 'utf8').toString('base64url');
}

/**
 * @param {import('firebase-admin/firestore').Firestore} firestore
 * @param {string} emailLower
 * @returns {Promise<{ updated: boolean }>}
 */
async function markWaitlistLeadAppVerified(firestore, emailLower) {
  const el = normalizeWaitlistEmail(emailLower);
  if (!el || !firestore) return { updated: false };

  const id = waitlistLeadDocId(el);
  const ref = firestore.collection('waitlist_leads').doc(id);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.set({ confirmed: true, app_verified_at: FieldValue.serverTimestamp() }, { merge: true });
    return { updated: true };
  }

  const q = await firestore.collection('waitlist_leads').where('email', '==', el).limit(10).get();
  if (q.empty) return { updated: false };

  await Promise.all(
    q.docs.map((d) => d.ref.set({ confirmed: true, app_verified_at: FieldValue.serverTimestamp() }, { merge: true })),
  );
  return { updated: true };
}

module.exports = { waitlistLeadDocId, markWaitlistLeadAppVerified, normalizeWaitlistEmail };
