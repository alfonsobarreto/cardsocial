async function ensureCollection(db, name, validator) {
  const exists = await db.listCollections({ name }).hasNext();

  if (!exists) {
    await db.createCollection(name, {
      validator,
      validationLevel: 'moderate',
      validationAction: 'error',
    });
    return;
  }

  await db.command({
    collMod: name,
    validator,
    validationLevel: 'moderate',
    validationAction: 'error',
  });
}

async function ensureMongoHardening(db) {
  /**
   * NOTA: El validator antiguo `cards` (que exigía `name`, `version`, `items`)
   * se eliminó porque quedó huérfano tras la migración a `smart_cards` /
   * `business_cards`. Nadie escribe a `cards` y mantener su validator provocaba
   * confusión. Dejamos la colección sin validator estricto para no romper docs
   * actuales (scName, itemIds, publicCardSlots, etc.); el shape se valida en la
   * capa de rutas (`qrRoutes.js` y `smartCardsRoutes.js`).
   */

  const qrTokensValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['token', 'uid', 'status', 'expiresAt', 'createdAt'],
      properties: {
        token: { bsonType: 'string', minLength: 24 },
        uid: { bsonType: 'string', minLength: 3 },
        sid: { bsonType: ['string', 'null'], minLength: 8 },
        bId: { bsonType: ['string', 'null'], minLength: 8 },
        status: { enum: ['unused', 'scanned', 'revoked'] },
        oneTime: { bsonType: ['bool', 'null'] },
        expiresAt: { bsonType: 'date' },
        scannedAt: { bsonType: ['date', 'null'] },
        scannedByUid: { bsonType: ['string', 'null'] },
        sharePermissionId: { bsonType: ['objectId', 'null'] },
        createdAt: { bsonType: 'date' },
      },
    },
  };

  const sharePermissionsValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['uid', 'targetUid', 'scope', 'isRevoked', 'createdAt'],
      properties: {
        uid: { bsonType: 'string', minLength: 3 },
        targetUid: { bsonType: 'string', minLength: 3 },
        sid: { bsonType: ['string', 'null'], minLength: 8 },
        bId: { bsonType: ['string', 'null'], minLength: 8 },
        scope: { enum: ['view', 'view_call', 'view_message', 'full'] },
        isRevoked: { bsonType: 'bool' },
        expiresAt: { bsonType: ['date', 'null'] },
        revokedAt: { bsonType: ['date', 'null'] },
        createdAt: { bsonType: 'date' },
      },
    },
  };

  const blockedRelationsValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['relationKey', 'uidA', 'uidB', 'blockedByUid', 'createdAt', 'updatedAt'],
      properties: {
        relationKey: { bsonType: 'string', minLength: 7 },
        uidA: { bsonType: 'string', minLength: 3 },
        uidB: { bsonType: 'string', minLength: 3 },
        blockedByUid: { bsonType: 'string', minLength: 3 },
        reason: { bsonType: ['string', 'null'] },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  };

  const storyStatesValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['uid', 'state', 'expiresAt', 'createdAt', 'updatedAt'],
      properties: {
        uid: { bsonType: 'string', minLength: 3 },
        state: { enum: ['normal', 'vip'] },
        isPaidExternal: { bsonType: ['bool', 'null'] },
        vipSource: { enum: ['manual', 'subscription', 'external_partner', null] },
        paidChannel: { bsonType: ['string', 'null'], maxLength: 80 },
        manualReason: { bsonType: ['string', 'null'], maxLength: 220 },
        externalPaidAt: { bsonType: ['date', 'null'] },
        activatedByUid: { bsonType: ['string', 'null'], maxLength: 100 },
        expiresAt: { bsonType: 'date' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  };

  const storyCardStatesValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['uid', 'state', 'expiresAt', 'createdAt', 'updatedAt'],
      properties: {
        uid: { bsonType: 'string', minLength: 3 },
        sid: { bsonType: ['string', 'null'], minLength: 4 },
        bId: { bsonType: ['string', 'null'], minLength: 4 },
        state: { enum: ['normal', 'vip'] },
        isPaidExternal: { bsonType: ['bool', 'null'] },
        vipSource: { enum: ['manual', 'subscription', 'external_partner', null] },
        paidChannel: { bsonType: ['string', 'null'], maxLength: 80 },
        manualReason: { bsonType: ['string', 'null'], maxLength: 220 },
        externalPaidAt: { bsonType: ['date', 'null'] },
        activatedByUid: { bsonType: ['string', 'null'], maxLength: 100 },
        expiresAt: { bsonType: 'date' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  };

  const cardSubscriberMutesValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['uid', 'targetUid', 'muted', 'createdAt', 'updatedAt'],
      properties: {
        uid: { bsonType: 'string', minLength: 3 },
        sid: { bsonType: ['string', 'null'], minLength: 4 },
        bId: { bsonType: ['string', 'null'], minLength: 4 },
        targetUid: { bsonType: 'string', minLength: 3 },
        muted: { bsonType: 'bool' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  };

  const storiesHouseAdsValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['uid', 'title', 'priceLabel', 'locationLabel', 'isActive', 'createdAt', 'updatedAt'],
      properties: {
        uid: { bsonType: 'string', minLength: 3 },
        title: { bsonType: 'string', minLength: 2, maxLength: 120 },
        subtitle: { bsonType: ['string', 'null'], maxLength: 240 },
        priceLabel: { bsonType: 'string', minLength: 1, maxLength: 80 },
        locationLabel: { bsonType: 'string', minLength: 1, maxLength: 120 },
        photoUrl: { bsonType: ['string', 'null'], maxLength: 2000 },
        ctaLabel: { bsonType: ['string', 'null'], maxLength: 60 },
        ctaUrl: { bsonType: ['string', 'null'], maxLength: 2000 },
        isActive: { bsonType: 'bool' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  };

  const callLogsValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['callId', 'uid', 'peerUid', 'direction', 'status', 'durationSec', 'tags', 'createdAt', 'updatedAt'],
      properties: {
        callId: { bsonType: 'string', minLength: 8 },
        uid: { bsonType: 'string', minLength: 3 },
        peerUid: { bsonType: 'string', minLength: 3 },
        direction: { enum: ['incoming', 'outgoing', 'missed'] },
        status: { enum: ['completed', 'missed', 'rejected'] },
        durationSec: { bsonType: 'int', minimum: 0 },
        tags: {
          bsonType: 'array',
          maxItems: 8,
          items: {
            bsonType: 'string',
            minLength: 2,
            maxLength: 40,
          },
        },
        voiceNoteUri: { bsonType: ['string', 'null'], maxLength: 2000 },
        voiceNoteName: { bsonType: ['string', 'null'], maxLength: 240 },
        callType: { enum: ['audio', 'video'] },
        isBusinessCard: { bsonType: ['bool', 'null'] },
        sourceSid: { bsonType: ['string', 'null'], maxLength: 128 },
        sourceBId: { bsonType: ['string', 'null'], maxLength: 128 },
        sourceCardName: { bsonType: ['string', 'null'], maxLength: 240 },
        callChannel: { bsonType: ['string', 'null'], maxLength: 64 },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  };

  const temporaryAccessValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['token', 'uid', 'source', 'expiresAt', 'createdAt'],
      properties: {
        token: { bsonType: 'string', minLength: 16, maxLength: 128 },
        uid: { bsonType: 'string', minLength: 3 },
        sid: { bsonType: ['string', 'null'], minLength: 4 },
        bId: { bsonType: ['string', 'null'], minLength: 4 },
        source: { bsonType: 'string', minLength: 1, maxLength: 64 },
        expiresAt: { bsonType: 'date' },
        createdAt: { bsonType: 'date' },
      },
    },
  };

  const bunkerGroupsValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['viewerUid', 'groupName', 'createdAt', 'updatedAt'],
      properties: {
        viewerUid: { bsonType: 'string', minLength: 3 },
        groupName: { bsonType: 'string', minLength: 1, maxLength: 60 },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  };

  const businessCardLicensesValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['uid', 'bId', 'annualPriceUsd', 'isActive', 'expiresAt', 'updatedAt'],
      properties: {
        uid: { bsonType: 'string', minLength: 3 },
        bId: { bsonType: 'string', minLength: 3 },
        annualPriceUsd: { bsonType: ['double', 'int', 'long'], minimum: 0 },
        startedAt: { bsonType: ['date', 'null'] },
        expiresAt: { bsonType: 'date' },
        isActive: { bsonType: 'bool' },
        purchaseId: { bsonType: ['string', 'null'], maxLength: 240 },
        platform: { enum: ['ios', 'android', null] },
        cashbackCreditsGranted: { bsonType: ['double', 'int', 'long'], minimum: 0 },
        createdAt: { bsonType: ['date', 'null'] },
        updatedAt: { bsonType: 'date' },
      },
    },
  };

  const emailOtpsValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['sessionId', 'emailLower', 'codeHash', 'status', 'expiresAt', 'createdAt', 'updatedAt'],
      properties: {
        sessionId: { bsonType: 'string', minLength: 16 },
        emailLower: { bsonType: 'string', minLength: 5, maxLength: 320 },
        codeHash: { bsonType: 'string', minLength: 32 },
        status: { enum: ['active', 'verified', 'expired'] },
        attempts: { bsonType: ['int', 'long', 'null'] },
        expiresAt: { bsonType: 'date' },
        verifiedAt: { bsonType: ['date', 'null'] },
        expiredAt: { bsonType: ['date', 'null'] },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  };

  await ensureCollection(db, 'qr_tokens', qrTokensValidator);
  await ensureCollection(db, 'share_permissions', sharePermissionsValidator);
  await ensureCollection(db, 'blocked_relations', blockedRelationsValidator);
  await ensureCollection(db, 'story_states', storyStatesValidator);
  await ensureCollection(db, 'story_card_states', storyCardStatesValidator);
  await ensureCollection(db, 'card_subscriber_mutes', cardSubscriberMutesValidator);
  await ensureCollection(db, 'stories_house_ads', storiesHouseAdsValidator);
  await ensureCollection(db, 'call_logs', callLogsValidator);
  await ensureCollection(db, 'email_otps', emailOtpsValidator);
  await ensureCollection(db, 'temporary_access', temporaryAccessValidator);
  await ensureCollection(db, 'bunker_groups', bunkerGroupsValidator);
  await ensureCollection(db, 'business_card_licenses', businessCardLicensesValidator);

  /**
   * Índices autoritativos para `smart_cards` y `business_cards` (antes no se
   * hardenizaban). `uq_smart_cards_uid_sid`/`uq_business_cards_uid_bid`
   * garantizan idempotencia del upsert PUT `/api/qr/cards/:cardRef`.
   */
  await db.collection('smart_cards').createIndex(
    { uid: 1, sid: 1 },
    { unique: true, partialFilterExpression: { sid: { $type: 'string' } }, name: 'uq_smart_cards_uid_sid' },
  );
  await db.collection('smart_cards').createIndex(
    { uid: 1, bId: 1 },
    { unique: true, partialFilterExpression: { bId: { $type: 'string' } }, name: 'uq_smart_cards_uid_bid' },
  );
  await db.collection('smart_cards').createIndex({ uid: 1, updatedAt: -1 }, { name: 'idx_smart_cards_uid_updated' });

  await db.collection('business_cards').createIndex(
    { uid: 1, bId: 1 },
    { unique: true, partialFilterExpression: { bId: { $type: 'string' } }, name: 'uq_business_cards_uid_bid' },
  );
  await db.collection('business_cards').createIndex({ uid: 1, updatedAt: -1 }, { name: 'idx_business_cards_uid_updated' });

  await db.collection('qr_tokens').createIndex({ token: 1 }, { unique: true, name: 'uq_qr_token' });
  await db.collection('qr_tokens').createIndex({ uid: 1, status: 1, expiresAt: 1 }, { name: 'idx_qr_uid_status_exp' });
  await db.collection('qr_tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_qr_expires_at' });

  await db.collection('share_permissions').createIndex(
    { uid: 1, targetUid: 1, sid: 1, bId: 1 },
    { unique: true, name: 'uq_share_uid_target_s_b' },
  );
  await db.collection('share_permissions').createIndex({ sid: 1, isRevoked: 1, expiresAt: 1 }, { name: 'idx_share_sid_status_exp' });
  await db.collection('share_permissions').createIndex({ bId: 1, isRevoked: 1, expiresAt: 1 }, { name: 'idx_share_bid_status_exp' });

  await db.collection('blocked_relations').createIndex({ relationKey: 1 }, { unique: true, name: 'uq_blocked_relation_key' });
  await db.collection('blocked_relations').createIndex({ uidA: 1, uidB: 1 }, { name: 'idx_blocked_pair' });

  await db.collection('story_states').createIndex({ uid: 1 }, { unique: true, name: 'uq_story_uid' });
  await db.collection('story_states').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_story_expires_at' });
  await db.collection('story_states').createIndex({ isPaidExternal: 1, expiresAt: 1 }, { name: 'idx_story_external_exp' });

  await db.collection('story_card_states').createIndex({ uid: 1, sid: 1, bId: 1 }, { unique: true, name: 'uq_story_card_uid_s_b' });
  await db.collection('story_card_states').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_story_card_expires_at' });

  await db.collection('card_subscriber_mutes').createIndex(
    { uid: 1, targetUid: 1, sid: 1, bId: 1 },
    { unique: true, name: 'uq_mute_uid_target_s_b' },
  );
  await db.collection('card_subscriber_mutes').createIndex({ targetUid: 1, uid: 1 }, { name: 'idx_mute_target_uid' });

  await db.collection('stories_house_ads').createIndex({ uid: 1 }, { unique: true, name: 'uq_house_ad_uid' });
  await db.collection('stories_house_ads').createIndex({ isActive: 1, updatedAt: -1 }, { name: 'idx_house_ad_active_updated' });

  await db.collection('call_logs').createIndex({ uid: 1, createdAt: -1 }, { name: 'idx_calls_uid_created' });
  await db.collection('call_logs').createIndex({ uid: 1, callId: 1 }, { unique: true, name: 'uq_calls_uid_callid' });
  await db.collection('call_logs').createIndex({ peerUid: 1, updatedAt: -1 }, { name: 'idx_calls_peer_updated' });

  await db.collection('email_otps').createIndex({ sessionId: 1 }, { unique: true, name: 'uq_email_otp_session' });
  await db.collection('email_otps').createIndex({ emailLower: 1, status: 1, expiresAt: 1 }, { name: 'idx_email_otp_email_status_exp' });
  await db.collection('email_otps').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_email_otp_expires_at' });

  await db.collection('temporary_access').createIndex({ token: 1 }, { unique: true, name: 'uq_temporary_access_token' });
  await db.collection('temporary_access').createIndex({ uid: 1, sid: 1, bId: 1, createdAt: -1 }, { name: 'idx_temp_access_uid_card_created' });
  await db.collection('temporary_access').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_temporary_access_expires_at' });
  await db.collection('bunker_groups').createIndex(
    { viewerUid: 1, groupName: 1 },
    { unique: true, name: 'uq_bunker_groups_viewer_name' },
  );

  await db.collection('business_card_licenses').createIndex(
    { uid: 1, bId: 1 },
    { unique: true, name: 'uq_bcl_uid_bid' },
  );
  await db.collection('business_card_licenses').createIndex(
    { uid: 1, expiresAt: 1 },
    { name: 'idx_bcl_uid_expires' },
  );
}

module.exports = {
  ensureMongoHardening,
};
