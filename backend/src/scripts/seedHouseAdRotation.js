const { env } = require('../config');
const { createMongoStorage } = require('../services/mongoStorage');

function parseArgs(argv) {
  const flags = {};
  for (const raw of argv.slice(2)) {
    const token = String(raw || '').trim();
    if (!token.startsWith('--')) {
      continue;
    }
    const [key, value] = token.slice(2).split('=');
    flags[key] = value === undefined ? 'true' : value;
  }
  return flags;
}

function resolveHouseAdUid(flags) {
  const byFlag = String(flags.uid || '').trim();
  const byEnv = String(process.env.HOUSE_AD_OWNER_UID || '').trim();
  return byFlag || byEnv;
}

function getHouseCatalog(uid) {
  const slug = String(uid || 'owner').slice(0, 8);
  return [
    {
      id: `mism-${slug}-001`,
      title: 'Mi Sueno Mexicano - Casa Jardin',
      subtitle: 'Casa familiar con alberca y acabados premium.',
      priceLabel: '$4,450,000 MXN',
      locationLabel: 'Merida, Yucatan',
      photoUrl: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=80',
      ctaLabel: 'Quiero esta casa',
      ctaUrl: 'https://wa.me/17373477731?text=Interesado%20en%20Casa%20Jardin%20-%20Merida',
    },
    {
      id: `mism-${slug}-002`,
      title: 'Mi Sueno Mexicano - Loft Urbano',
      subtitle: 'Loft inteligente cerca de zona financiera.',
      priceLabel: '$3,180,000 MXN',
      locationLabel: 'Monterrey, Nuevo Leon',
      photoUrl: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=80',
      ctaLabel: 'Agenda recorrido',
      ctaUrl: 'https://wa.me/17373477731?text=Agenda%20recorrido%20Loft%20Urbano%20-%20Monterrey',
    },
    {
      id: `mism-${slug}-003`,
      title: 'Mi Sueno Mexicano - Villa Playa',
      subtitle: 'Vista al mar y terraza para renta vacacional.',
      priceLabel: '$6,990,000 MXN',
      locationLabel: 'Cancun, Quintana Roo',
      photoUrl: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1400&q=80',
      ctaLabel: 'Ver disponibilidad',
      ctaUrl: 'https://wa.me/17373477731?text=Ver%20disponibilidad%20Villa%20Playa%20-%20Cancun',
    },
  ];
}

function daySerialUtc(dayShift) {
  const now = new Date();
  const shifted = new Date(now.getTime() + dayShift * 24 * 60 * 60 * 1000);
  return Math.floor(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) / 86400000);
}

async function run() {
  if (!env.mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  const flags = parseArgs(process.argv);
  const uid = resolveHouseAdUid(flags);
  if (!uid) {
    throw new Error('uid is required. Use --uid=<uid> or HOUSE_AD_OWNER_UID env var.');
  }

  const dayShift = Number(flags['day-shift'] || 0);
  const apply = String(flags.apply || 'true').toLowerCase() !== 'false';

  const catalog = getHouseCatalog(uid);
  const serial = daySerialUtc(Number.isFinite(dayShift) ? dayShift : 0);
  const index = ((serial % catalog.length) + catalog.length) % catalog.length;
  const selected = catalog[index];

  const storage = createMongoStorage({
    uri: env.mongoUri,
    dbName: env.mongoDbName,
  });

  const db = await storage.connect();
  const now = new Date();

  await db.collection('stories_house_ads_catalog').findOneAndUpdate(
    { uid },
    {
      $set: {
        uid,
        catalog,
        activeIndex: index,
        activeAdId: selected.id,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
      includeResultMetadata: false,
    }
  );

  if (apply) {
    await db.collection('stories_house_ads').findOneAndUpdate(
      { uid },
      {
        $set: {
          uid,
          title: selected.title,
          subtitle: selected.subtitle,
          priceLabel: selected.priceLabel,
          locationLabel: selected.locationLabel,
          photoUrl: selected.photoUrl,
          ctaLabel: selected.ctaLabel,
          ctaUrl: selected.ctaUrl,
          isActive: true,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        includeResultMetadata: false,
      }
    );
  }

  console.log(JSON.stringify({
    ok: true,
    uid,
    dayShift,
    appliedToStoriesAd: apply,
    selectedIndex: index,
    selected,
  }, null, 2));

  await storage.close();
}

run().catch((error) => {
  console.error('seedHouseAdRotation failed:', error.message);
  process.exit(1);
});
