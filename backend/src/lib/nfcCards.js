const crypto = require('crypto');
const { brandColors, brandGradients } = require('./brandTokens');
const { env } = require('../config');

const VALID_STATUSES = new Set(['active', 'paused', 'lost', 'blocked', 'unclaimed']);
const VALID_TARGET_TYPES = new Set(['businessCard', 'smartCard', 'publicProfile', 'url']);
const VALID_MATERIALS = new Set(['plastic_matte', 'wood', 'metal', 'unknown']);
const TEMPORARY_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;

function trimOrEmpty(value) {
  return String(value ?? '').trim();
}

function trimOrNull(value) {
  const s = trimOrEmpty(value);
  return s || null;
}

function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function publicBaseUrl() {
  const base = String(env.publicUniversalCardBaseUrl || 'https://cardsocial.me').trim();
  return base.replace(/\/+$/, '') || 'https://cardsocial.me';
}

function normalizeNfcCardId(raw) {
  const id = trimOrEmpty(raw)
    .replace(/^https?:\/\/[^/]+\/n\//i, '')
    .replace(/^\/?n\//i, '')
    .split(/[?#]/)[0]
    .trim();
  if (!/^[a-zA-Z0-9._-]{6,96}$/.test(id)) {
    return null;
  }
  return id;
}

function normalizeActivationPin(raw) {
  const pin = trimOrEmpty(raw).toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(pin)) {
    return null;
  }
  return pin;
}

function normalizeMaterial(raw) {
  const s = trimOrEmpty(raw);
  return VALID_MATERIALS.has(s) ? s : 'unknown';
}

function normalizeStatus(raw, fallback = 'active') {
  const s = trimOrEmpty(raw);
  return VALID_STATUSES.has(s) ? s : fallback;
}

function sanitizeRecoveryContact(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const iconDataId = trimOrNull(raw.iconDataId);
  const label = trimOrEmpty(raw.label).slice(0, 120);
  const type = trimOrEmpty(raw.type).slice(0, 80);
  const value = trimOrEmpty(raw.value).slice(0, 4000);
  if (!iconDataId || !label || !type || !value) return null;
  return { iconDataId, label, type, value };
}

function sanitizeMountedTarget(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = trimOrEmpty(raw.type);
  if (!VALID_TARGET_TYPES.has(type)) return null;
  const id = trimOrEmpty(raw.id).slice(0, 160);
  const displayName = trimOrEmpty(raw.displayName).slice(0, 220);
  const publicUrl = trimOrEmpty(raw.publicUrl).slice(0, 2000);
  if (!id || !displayName || !publicUrl) return null;
  return {
    type,
    id,
    displayName,
    publicUrl,
    isTemporary: Boolean(raw.isTemporary),
    expiresAt: raw.expiresAt ? toIso(raw.expiresAt) : null,
  };
}

function sanitizeFallbackTarget(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = trimOrEmpty(raw.type);
  if (!VALID_TARGET_TYPES.has(type)) return null;
  const id = trimOrEmpty(raw.id).slice(0, 160);
  const displayName = trimOrEmpty(raw.displayName).slice(0, 220);
  const publicUrl = trimOrEmpty(raw.publicUrl).slice(0, 2000);
  if (!id || !displayName || !publicUrl) return null;
  return { type, id, displayName, publicUrl };
}

function toWireNfcCard(doc) {
  if (!doc) return null;
  return {
    nfcCardId: String(doc.nfcCardId || ''),
    ownerUid: doc.ownerUid ? String(doc.ownerUid) : null,
    label: String(doc.label || ''),
    material: normalizeMaterial(doc.material),
    status: normalizeStatus(doc.status),
    isClaimed: Boolean(doc.isClaimed),
    activatedAt: toIso(doc.activatedAt),
    mountedTarget: sanitizeMountedTarget(doc.mountedTarget),
    fallbackTarget: sanitizeFallbackTarget(doc.fallbackTarget),
    recoveryContact: sanitizeRecoveryContact(doc.recoveryContact),
    lastMountedAt: toIso(doc.lastMountedAt),
    lastConfirmedAt: toIso(doc.lastConfirmedAt),
    lastResolvedAt: toIso(doc.lastResolvedAt),
    version: Math.max(0, Math.floor(Number(doc.version || 0))),
  };
}

function newTemporaryAccessToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function createTemporarySmartCardTarget(db, { ownerUid, sid, displayName }) {
  const token = newTemporaryAccessToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TEMPORARY_ACCESS_TTL_MS);
  await db.collection('temporary_access').insertOne({
    token,
    uid: ownerUid,
    sid,
    bId: null,
    source: 'nfc_mount',
    expiresAt,
    createdAt: now,
  });
  return {
    type: 'smartCard',
    id: sid,
    displayName,
    publicUrl: `${publicBaseUrl()}/u/${encodeURIComponent(token)}`,
    isTemporary: true,
    expiresAt,
  };
}

function businessCardPublicUrl(ownerUid, bId) {
  return `${publicBaseUrl()}/b/${encodeURIComponent(bId)}?uid=${encodeURIComponent(ownerUid)}`;
}

function businessCardDisplayName(doc) {
  return trimOrEmpty(doc?.bcName) || trimOrEmpty(doc?.scName) || 'Business Card';
}

function smartCardDisplayName(doc) {
  return trimOrEmpty(doc?.scName) || trimOrEmpty(doc?.userFullName) || trimOrEmpty(doc?.ownerDisplayName) || 'SmartCard';
}

async function buildBusinessCardTarget(db, ownerUid, bId) {
  const card = await db.collection('business_cards').findOne(
    { ownerUid, bId },
    { projection: { bId: 1, bcName: 1, scName: 1, bcContactName: 1, isActive: 1 } },
  );
  if (!card) return null;
  return {
    type: 'businessCard',
    id: String(card.bId || bId),
    displayName: `Business Card · ${businessCardDisplayName(card)}`,
    publicUrl: businessCardPublicUrl(ownerUid, String(card.bId || bId)),
    isTemporary: false,
    expiresAt: null,
  };
}

async function buildFallbackTarget(db, ownerUid, input) {
  const type = trimOrEmpty(input?.fallbackTargetType);
  if (type === 'businessCard') {
    const id = trimOrEmpty(input?.fallbackTargetId || input?.targetId);
    if (!id) return null;
    const target = await buildBusinessCardTarget(db, ownerUid, id);
    if (!target) return null;
    return {
      type: target.type,
      id: target.id,
      displayName: target.displayName,
      publicUrl: target.publicUrl,
    };
  }
  if (type === 'url') {
    const publicUrl = trimOrEmpty(input?.fallbackPublicUrl);
    const displayName = trimOrEmpty(input?.fallbackDisplayName || 'Fallback URL').slice(0, 220);
    if (!/^https?:\/\//i.test(publicUrl)) return null;
    return {
      type: 'url',
      id: publicUrl.slice(0, 160),
      displayName,
      publicUrl: publicUrl.slice(0, 2000),
    };
  }
  return null;
}

async function buildMountedTarget(db, ownerUid, input) {
  const targetType = trimOrEmpty(input?.targetType);
  const targetId = trimOrEmpty(input?.targetId);
  if (targetType === 'businessCard') {
    return buildBusinessCardTarget(db, ownerUid, targetId);
  }
  if (targetType === 'smartCard') {
    const card = await db.collection('smart_cards').findOne(
      { sid: targetId, $or: [{ ownerUid }, { uid: ownerUid }] },
      { projection: { sid: 1, scName: 1, userFullName: 1, ownerDisplayName: 1 } },
    );
    if (!card) return null;
    return createTemporarySmartCardTarget(db, {
      ownerUid,
      sid: String(card.sid || targetId),
      displayName: `SmartCard 24 h · ${smartCardDisplayName(card)}`,
    });
  }
  return null;
}

function chooseRedirectStatus(req) {
  const raw = Number(req.query?.code || 302);
  return raw === 307 ? 307 : 302;
}

function isExpired(target, now = new Date()) {
  if (!target?.isTemporary) return false;
  const expiresAt = target.expiresAt ? new Date(target.expiresAt) : null;
  return !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= now;
}

function htmlPage({ title, body, ctaLabel, ctaHref }) {
  const safe = (s) => String(s || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const btn = ctaHref
    ? `<a href="${safe(ctaHref)}" style="display:inline-block;margin-top:22px;padding:13px 20px;border-radius:14px;background:${brandColors.electricBlue};color:${brandColors.white};text-decoration:none;font-weight:800">${safe(ctaLabel || 'Abrir')}</a>`
    : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${safe(title)} · Card-Social</title></head><body style="margin:0;min-height:100vh;background:${brandColors.midnightNavy};color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:grid;place-items:center;padding:24px"><main style="max-width:420px;text-align:center;border:1px solid rgba(47,123,255,0.28);background:#101E34;border-radius:24px;padding:28px"><div style="font-size:42px;margin-bottom:10px">◈</div><h1 style="font-size:24px;margin:0 0 12px;color:${brandColors.electricBlue}">${safe(title)}</h1><p style="color:#AEAEB2;line-height:1.55;margin:0">${safe(body)}</p>${btn}<p style="margin-top:24px;color:#48484A;font-size:12px">Card-Social</p></main></body></html>`;
}

module.exports = {
  TEMPORARY_ACCESS_TTL_MS,
  buildFallbackTarget,
  buildMountedTarget,
  chooseRedirectStatus,
  htmlPage,
  isExpired,
  normalizeMaterial,
  normalizeActivationPin,
  normalizeNfcCardId,
  normalizeStatus,
  publicBaseUrl,
  sanitizeRecoveryContact,
  toWireNfcCard,
};
