'use strict';

const crypto = require('crypto');

/** Misma normalización que `qrRoutes.js` para `icons.*` / `sources.*`. */
function sanitizeAnalyticsSegmentKey(raw) {
  const s = String(raw || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64);
  return s || 'unknown';
}

/**
 * Persistencia alineada con `POST /api/qr/analytics/track`:
 * documento de evento + rollups diario y mensual en `card_analytics`.
 *
 * @param {import('mongodb').Db} db
 * @param {{ cardKey: string, sid?: string|null, bId?: string|null, type: string, subType: string, source: string, viewerUid?: string|null, timestamp?: Date }} p
 */
async function recordCardAnalyticsEvent(db, p) {
  const cardKey = String(p.cardKey || '').trim();
  if (!cardKey || cardKey.length > 160) {
    throw new Error('invalid cardKey');
  }

  const ts = p.timestamp instanceof Date ? p.timestamp : new Date();
  if (Number.isNaN(ts.getTime())) {
    throw new Error('invalid timestamp');
  }

  const sid = p.sid != null && String(p.sid).trim() ? String(p.sid).trim() : null;
  const bId = p.bId != null && String(p.bId).trim() ? String(p.bId).trim() : null;
  const mongoType = String(p.type || 'icon_click').trim();
  const allowedTypes = new Set(['view', 'icon_click', 'qr_scan']);
  if (!allowedTypes.has(mongoType)) {
    throw new Error('invalid analytics type');
  }

  const subType = sanitizeAnalyticsSegmentKey(p.subType);
  const srcKey = sanitizeAnalyticsSegmentKey(p.source);
  const now = new Date();
  const dayKey = ts.toISOString().slice(0, 10);
  const monthKey = ts.toISOString().slice(0, 7);
  const dailyId = `d:${cardKey}:${dayKey}`;
  const monthlyId = `m:${cardKey}:${monthKey}`;
  const eventId = `e:${cardKey}:${ts.getTime()}:${crypto.randomBytes(4).toString('hex')}`;

  /** @type {Record<string, unknown>} */
  const doc = {
    _id: eventId,
    cardId: cardKey,
    type: mongoType,
    subType,
    timestamp: ts,
    sid,
    bId,
    source: srcKey,
    createdAt: now,
  };

  const vu = p.viewerUid != null ? String(p.viewerUid).trim() : '';
  if (vu) {
    doc.viewerUid = vu;
  }

  await db.collection('card_analytics').insertOne(doc);

  await db.collection('card_analytics').updateOne(
    { _id: dailyId },
    {
      $inc: {
        totalInteractions: 1,
        [`icons.${subType}`]: 1,
        [`sources.${srcKey}`]: 1,
      },
      $set: { updatedAt: now },
      $setOnInsert: {
        sid,
        bId,
        granularity: 'day',
        periodKey: dayKey,
        monthKey,
        createdAt: now,
      },
    },
    { upsert: true },
  );

  await db.collection('card_analytics').updateOne(
    { _id: monthlyId },
    {
      $inc: {
        totalInteractions: 1,
        [`icons.${subType}`]: 1,
        [`sources.${srcKey}`]: 1,
      },
      $set: { updatedAt: now },
      $setOnInsert: {
        sid,
        bId,
        granularity: 'month',
        periodKey: monthKey,
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

module.exports = {
  sanitizeAnalyticsSegmentKey,
  recordCardAnalyticsEvent,
};
