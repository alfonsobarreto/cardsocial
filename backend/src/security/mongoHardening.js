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
  const cardsValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['ownerUid', 'name', 'layout', 'version', 'isActive', 'items', 'createdAt', 'updatedAt'],
      properties: {
        ownerUid: { bsonType: 'string', minLength: 3 },
        name: { bsonType: 'string', minLength: 1, maxLength: 120 },
        layout: { enum: ['vertical', 'horizontal'] },
        version: { bsonType: 'int', minimum: 1 },
        isActive: { bsonType: 'bool' },
        items: {
          bsonType: 'array',
          maxItems: 16,
          items: {
            bsonType: 'object',
            required: ['vaultDataId', 'label'],
            properties: {
              vaultDataId: { bsonType: 'string', minLength: 6 },
              label: { bsonType: 'string', minLength: 1, maxLength: 60 },
              order: { bsonType: ['int', 'null'] },
              isVisible: { bsonType: ['bool', 'null'] },
            },
          },
        },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  };

  const qrTokensValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['token', 'cardId', 'ownerUid', 'status', 'expiresAt', 'createdAt'],
      properties: {
        token: { bsonType: 'string', minLength: 24 },
        cardId: { bsonType: 'string', minLength: 8 },
        ownerUid: { bsonType: 'string', minLength: 3 },
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
      required: ['ownerUid', 'targetUid', 'cardId', 'scope', 'isRevoked', 'createdAt'],
      properties: {
        ownerUid: { bsonType: 'string', minLength: 3 },
        targetUid: { bsonType: 'string', minLength: 3 },
        cardId: { bsonType: 'string', minLength: 8 },
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
      required: ['ownerUid', 'state', 'expiresAt', 'createdAt', 'updatedAt'],
      properties: {
        ownerUid: { bsonType: 'string', minLength: 3 },
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

  const storiesHouseAdsValidator = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['ownerUid', 'title', 'priceLabel', 'locationLabel', 'isActive', 'createdAt', 'updatedAt'],
      properties: {
        ownerUid: { bsonType: 'string', minLength: 3 },
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
      required: ['callId', 'ownerUid', 'peerUid', 'direction', 'status', 'durationSec', 'tags', 'createdAt', 'updatedAt'],
      properties: {
        callId: { bsonType: 'string', minLength: 8 },
        ownerUid: { bsonType: 'string', minLength: 3 },
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
        createdAt: { bsonType: 'date' },
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

  await ensureCollection(db, 'cards', cardsValidator);
  await ensureCollection(db, 'qr_tokens', qrTokensValidator);
  await ensureCollection(db, 'share_permissions', sharePermissionsValidator);
  await ensureCollection(db, 'blocked_relations', blockedRelationsValidator);
  await ensureCollection(db, 'story_states', storyStatesValidator);
  await ensureCollection(db, 'stories_house_ads', storiesHouseAdsValidator);
  await ensureCollection(db, 'call_logs', callLogsValidator);
  await ensureCollection(db, 'email_otps', emailOtpsValidator);

  await db.collection('cards').createIndex({ ownerUid: 1, isActive: 1, updatedAt: -1 }, { name: 'idx_cards_owner_active_updated' });
  await db.collection('cards').createIndex({ ownerUid: 1, version: -1 }, { name: 'idx_cards_owner_version' });

  await db.collection('qr_tokens').createIndex({ token: 1 }, { unique: true, name: 'uq_qr_token' });
  await db.collection('qr_tokens').createIndex({ ownerUid: 1, status: 1, expiresAt: 1 }, { name: 'idx_qr_owner_status_exp' });
  await db.collection('qr_tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_qr_expires_at' });

  await db.collection('share_permissions').createIndex({ ownerUid: 1, targetUid: 1, cardId: 1 }, { unique: true, name: 'uq_share_owner_target_card' });
  await db.collection('share_permissions').createIndex({ cardId: 1, isRevoked: 1, expiresAt: 1 }, { name: 'idx_share_card_status_exp' });

  await db.collection('blocked_relations').createIndex({ relationKey: 1 }, { unique: true, name: 'uq_blocked_relation_key' });
  await db.collection('blocked_relations').createIndex({ uidA: 1, uidB: 1 }, { name: 'idx_blocked_pair' });

  await db.collection('story_states').createIndex({ ownerUid: 1 }, { unique: true, name: 'uq_story_owner' });
  await db.collection('story_states').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_story_expires_at' });
  await db.collection('story_states').createIndex({ isPaidExternal: 1, expiresAt: 1 }, { name: 'idx_story_external_exp' });

  await db.collection('stories_house_ads').createIndex({ ownerUid: 1 }, { unique: true, name: 'uq_house_ad_owner' });
  await db.collection('stories_house_ads').createIndex({ isActive: 1, updatedAt: -1 }, { name: 'idx_house_ad_active_updated' });

  await db.collection('call_logs').createIndex({ ownerUid: 1, createdAt: -1 }, { name: 'idx_calls_owner_created' });
  await db.collection('call_logs').createIndex({ ownerUid: 1, callId: 1 }, { unique: true, name: 'uq_calls_owner_callid' });
  await db.collection('call_logs').createIndex({ peerUid: 1, updatedAt: -1 }, { name: 'idx_calls_peer_updated' });

  await db.collection('email_otps').createIndex({ sessionId: 1 }, { unique: true, name: 'uq_email_otp_session' });
  await db.collection('email_otps').createIndex({ emailLower: 1, status: 1, expiresAt: 1 }, { name: 'idx_email_otp_email_status_exp' });
  await db.collection('email_otps').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_email_otp_expires_at' });
}

module.exports = {
  ensureMongoHardening,
};
