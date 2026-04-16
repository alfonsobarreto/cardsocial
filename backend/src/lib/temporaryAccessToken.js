/**
 * Validación compartida: token opaco en `temporary_access` (TTL 24h vía índice Mongo).
 */

/**
 * @param {import('mongodb').Db} db
 * @param {string} token
 * @returns {Promise<
 *   | { ok: false; reason: 'bad_token' | 'missing' | 'expired' | 'invalid_payload' }
 *   | { ok: true; ownerUid: string; cardId: string; expiresAt: Date }
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
    { projection: { cardId: 1, ownerUid: 1, expiresAt: 1 } },
  );

  if (!accessDoc) {
    return { ok: false, reason: 'missing' };
  }

  const expiresAt = accessDoc.expiresAt ? new Date(accessDoc.expiresAt) : null;
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }

  const ownerUid = String(accessDoc.ownerUid || '').trim();
  const cardId = String(accessDoc.cardId || '').trim();
  if (!ownerUid || !cardId) {
    return { ok: false, reason: 'invalid_payload' };
  }

  /**
   * Un solo enlace 24h vigente por tarjeta en web y app. Si quedaron filas duplicadas (emisión previa),
   * la primera visita con un token válido elimina las demás; el otro enlace deja de funcionar en la siguiente petición.
   */
  try {
    await db.collection('temporary_access').deleteMany({
      ownerUid,
      cardId,
      token: { $ne: trimmed },
    });
  } catch (e) {
    console.warn('[temporary_access] dedupe by card failed:', e?.message || e);
  }

  return { ok: true, ownerUid, cardId, expiresAt };
}

module.exports = {
  parseAndValidateTemporaryAccess,
};
