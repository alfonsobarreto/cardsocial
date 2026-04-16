const path = require('path');
const axios = require('axios');
const { MongoClient } = require('mongodb');

require('dotenv').config({ path: path.resolve('backend/.env') });
require('dotenv').config({ path: path.resolve('.env') });

async function main() {
  const baseUrl = String(process.env.EXPO_PUBLIC_MODERATION_API_URL || '').trim();
  const gatewayKey = String(process.env.API_GATEWAY_KEY || process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY || '').trim();
  const mongoUri = String(process.env.MONGO_URI || '').trim();
  const dbName = String(process.env.MONGO_DB_NAME || 'cardsocial').trim();

  if (!baseUrl || !gatewayKey || !mongoUri) {
    throw new Error('Missing baseUrl/gatewayKey/mongoUri from env files');
  }

  const uid = `sim_owner_${Date.now()}`;
  const receiverUid = `sim_receiver_${Date.now()}`;
  const sid = `asesor_premium_${Date.now()}`;

  const out = { baseUrl, uid, receiverUid, sid, timeline: [] };

  const health = await axios.get(`${baseUrl}/api/health`, { timeout: 15000 });
  out.timeline.push({ step: 'health', status: health.status, body: health.data });

  const tokenAResp = await axios.post(
    `${baseUrl}/api/auth/token`,
    { uid, scope: 'qr.access' },
    { headers: { 'x-api-gateway-key': gatewayKey }, timeout: 15000 }
  );
  const jwtA = tokenAResp.data.token;

  const tokenBResp = await axios.post(
    `${baseUrl}/api/auth/token`,
    { uid: receiverUid, scope: 'qr.access' },
    { headers: { 'x-api-gateway-key': gatewayKey }, timeout: 15000 }
  );
  const jwtB = tokenBResp.data.token;

  const commonA = { 'x-api-gateway-key': gatewayKey, Authorization: `Bearer ${jwtA}` };
  const commonB = { 'x-api-gateway-key': gatewayKey, Authorization: `Bearer ${jwtB}` };

  await axios.put(
    `${baseUrl}/api/cards/${encodeURIComponent(sid)}`,
    {
      uid,
      scName: 'Asesor Premium',
      layout: 'vertical',
      themeId: 'sky-glass',
      isFavorite: true,
      itemIds: ['cellular_main', 'brochure_pdf'],
      holdersCount: 0,
      ratingAvg: 5,
      ownerNickname: 'asesor_premium',
      ownerPhotoUrl: null,
    },
    { headers: commonA, timeout: 15000 }
  );
  out.timeline.push({ step: 'upsert_card', status: 'ok' });

  const issueResp = await axios.post(`${baseUrl}/api/qr/issue`, { uid, sid }, { headers: commonA, timeout: 15000 });
  const token1 = String(issueResp.data.token || '');
  out.timeline.push({
    step: 'issue_token_1',
    status: issueResp.status,
    ttlSec: issueResp.data.ttlSec,
    expiresAt: issueResp.data.expiresAt,
    tokenPreview: token1.slice(0, 12) + '...',
  });

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const db = mongo.db(dbName);

  const tokenDoc1 = await db.collection('qr_tokens').findOne(
    { token: token1 },
    { projection: { token: 1, status: 1, expiresAt: 1, createdAt: 1, uid: 1, sid: 1, bId: 1 } }
  );
  const ttlApproxSec = tokenDoc1?.expiresAt ? Math.round((new Date(tokenDoc1.expiresAt).getTime() - Date.now()) / 1000) : null;
  out.timeline.push({ step: 'mongo_token_saved', exists: Boolean(tokenDoc1), status: tokenDoc1?.status || null, ttlApproxSec });

  const relationKey = [uid, receiverUid].sort().join('::');
  const blockedBefore = await db.collection('blocked_relations').findOne({ relationKey });
  out.timeline.push({ step: 'blocked_check_before_scan', blocked: Boolean(blockedBefore) });

  const consume1 = await axios.post(`${baseUrl}/api/qr/consume`, { receiverUid, token: token1 }, { headers: commonB, timeout: 15000 });
  out.timeline.push({ step: 'consume_1_success', status: consume1.status, body: consume1.data });

  const perm = await db.collection('share_permissions').findOne(
    { uid, targetUid: receiverUid, sid, bId: null },
    { projection: { uid: 1, targetUid: 1, sid: 1, bId: 1, scope: 1, isRevoked: 1, createdAt: 1 } }
  );
  out.timeline.push({ step: 'share_permission_after_success', exists: Boolean(perm), scope: perm?.scope || null, isRevoked: perm?.isRevoked ?? null });

  const contacts = await axios.get(`${baseUrl}/api/contacts/received`, { params: { uid: receiverUid }, headers: commonB, timeout: 15000 });
  const canSeeOwner = Array.isArray(contacts.data?.contacts) && contacts.data.contacts.some((c) => c.uid === uid);
  out.timeline.push({ step: 'receiver_contacts_view', count: contacts.data?.count || 0, ownerVisible: canSeeOwner });

  await new Promise((r) => setTimeout(r, 61000));

  let consumeAfter61;
  try {
    await axios.post(`${baseUrl}/api/qr/consume`, { receiverUid, token: token1 }, { headers: commonB, timeout: 15000 });
    consumeAfter61 = { accepted: true };
  } catch (err) {
    consumeAfter61 = {
      accepted: false,
      status: err?.response?.status || null,
      error: err?.response?.data?.error || err.message,
    };
  }
  out.timeline.push({ step: 'consume_same_token_after_61s', ...consumeAfter61 });

  const blockResp = await axios.post(`${baseUrl}/api/relationships/block`, { uid, targetUid: receiverUid }, { headers: commonA, timeout: 15000 });
  out.timeline.push({ step: 'block_relationship', status: blockResp.status, deletedLinks: blockResp.data?.deletedLinks || 0 });

  const issueResp2 = await axios.post(`${baseUrl}/api/qr/issue`, { uid, sid }, { headers: commonA, timeout: 15000 });
  const token2 = String(issueResp2.data.token || '');
  out.timeline.push({ step: 'issue_token_2', status: issueResp2.status, ttlSec: issueResp2.data.ttlSec, tokenPreview: token2.slice(0, 12) + '...' });

  let consumeBlocked;
  try {
    await axios.post(`${baseUrl}/api/qr/consume`, { receiverUid, token: token2 }, { headers: commonB, timeout: 15000 });
    consumeBlocked = { accepted: true };
  } catch (err) {
    consumeBlocked = {
      accepted: false,
      status: err?.response?.status || null,
      error: err?.response?.data?.error || err.message,
    };
  }
  out.timeline.push({ step: 'consume_new_token_after_block', ...consumeBlocked });

  out.dbSummary = {
    qrTokensForPair: await db.collection('qr_tokens').countDocuments({ uid, sid }),
    latestTokens: await db
      .collection('qr_tokens')
      .find({ uid, sid }, { projection: { token: 1, status: 1, expiresAt: 1, scannedByUid: 1 } })
      .sort({ createdAt: -1 })
      .limit(3)
      .toArray(),
    sharePermissionActive: await db
      .collection('share_permissions')
      .find({ uid, targetUid: receiverUid })
      .project({ sid: 1, bId: 1, isRevoked: 1, scope: 1 })
      .toArray(),
    blockedRelation: await db
      .collection('blocked_relations')
      .findOne(
        { relationKey },
        { projection: { uidA: 1, uidB: 1, blockedByUid: 1, createdAt: 1, updatedAt: 1 } }
      ),
  };

  await mongo.close();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error('SIM_ERROR', e?.response?.status, e?.response?.data || e.message);
  process.exit(1);
});
