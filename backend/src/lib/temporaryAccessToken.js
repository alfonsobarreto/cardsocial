/**
 * Validación compartida: token opaco en `temporary_access` (TTL 24h vía índice Mongo).
 */

/**
 * @param {import('mongodb').Db} db
 * @param {string} token
 * @returns {Promise<
 *   | { ok: false; reason: 'bad_token' | 'missing' | 'expired' | 'invalid_payload' }
 *   | { ok: true; uid: string; sid: string | null; bId: string | null; expiresAt: Date }
 * >}
 */
async function parseAndValidateTemporaryAccess(db, token) {
  const trimmed = String(token || '').trim();
  if (!trimmed || trimmed.length < 16 || trimmed.length > 128) {
    return { ok: false, reason: 'bad_token' };
  }

  const now = new Date();
  const accessDoc = await db.collection('temporary_access').findOne(
    { token: trimmed },
    { projection: { sid: 1, bId: 1, uid: 1, expiresAt: 1 } },
  );

  if (!accessDoc) {
    return { ok: false, reason: 'missing' };
  }

  const expiresAt = accessDoc.expiresAt ? new Date(accessDoc.expiresAt) : null;
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }

  const uid = String(accessDoc.uid || '').trim();
  const sid = accessDoc.sid != null && String(accessDoc.sid).trim() ? String(accessDoc.sid).trim() : null;
  const bId = accessDoc.bId != null && String(accessDoc.bId).trim() ? String(accessDoc.bId).trim() : null;
  if (!uid || (!sid && !bId)) {
    return { ok: false, reason: 'invalid_payload' };
  }

  /**
   * Un solo enlace 24h vigente por tarjeta en web y app. Si quedaron filas duplicadas (emisión previa),
   * la primera visita con un token válido elimina las demás; el otro enlace deja de funcionar en la siguiente petición.
   */
  try {
    const cardFilter =
      sid && bId ? { sid, bId } : sid ? { sid, bId: null } : { sid: null, bId };
    await db.collection('temporary_access').deleteMany({
      uid,
      ...cardFilter,
      token: { $ne: trimmed },
    });
  } catch (e) {
    console.warn('[temporary_access] dedupe by card failed:', e?.message || e);
  }

  return { ok: true, uid, sid, bId, expiresAt };
}

module.exports = {
  parseAndValidateTemporaryAccess,
};
