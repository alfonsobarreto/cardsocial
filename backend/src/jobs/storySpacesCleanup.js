/**
 * Limpieza de archivos de historias en DigitalOcean Spaces tras expiración (Fase 3).
 *
 * Cuando el cliente suba media de Story a Spaces, debe insertar en Mongo:
 *   db.story_cdn_assets.insertOne({
 *     spacesUrl: 'https://bucket.region.digitaloceanspaces.com/...',
 *     expiresAt: new Date(...), // alineado a expiración VIP (ej. 30 días)
 *     uid, sid / bId (opcional)
 *   })
 *
 * Este job borra el objeto en Spaces y el documento cuando `expiresAt <= now`.
 * Las historias 100 % locales (AsyncStorage) no pasan por aquí hasta que exista upload.
 */

async function runStorySpacesAssetCleanup(storage) {
  if (typeof storage.deleteFromSpacesByPublicUrl !== 'function') {
    return;
  }
  const db = await storage.connect();
  const coll = db.collection('story_cdn_assets');
  const now = new Date();
  const expired = await coll.find({ expiresAt: { $lte: now } }).limit(200).toArray();

  for (const row of expired) {
    const url = String(row.spacesUrl || '').trim();
    if (url) {
      await storage.deleteFromSpacesByPublicUrl(url);
    }
    await coll.deleteOne({ _id: row._id });
  }

  if (expired.length) {
    console.log(`[storySpacesCleanup] processed ${expired.length} expired story CDN asset(s)`);
  }
}

module.exports = { runStorySpacesAssetCleanup };
