import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Solo llama a initializeApp si no ha sido inicializado antes por otro archivo
if (!admin.apps.length) {
  admin.initializeApp();
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BUSINESS_CARD_DULL_GRACE_DAYS = 30;
const BUSINESS_CARD_DULL_GRACE_MS = BUSINESS_CARD_DULL_GRACE_DAYS * DAY_MS;

function toMillis(value) {
  if (!value) {
    return null;
  }
  if (value instanceof admin.firestore.Timestamp) {
    return value.toMillis();
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const dateValue = value.toDate();
    if (dateValue instanceof Date) {
      const ms = dateValue.getTime();
      return Number.isFinite(ms) ? ms : null;
    }
  }
  return null;
}

function deriveLifecycleStateFromCard(card, nowMs) {
  const rawState = String(card?.lifecycleState || '').trim();
  const trialEndsMs = toMillis(card?.trialEndsAt);
  const annualEndsMs = toMillis(card?.annualContractEndsAt) ?? toMillis(card?.subscriptionExpires);
  const dullStartedMs = toMillis(card?.dullStartedAt);
  const purgeAtMs = toMillis(card?.purgeAt);

  let state =
    rawState ||
    (trialEndsMs && trialEndsMs > nowMs
      ? 'trial_active'
      : annualEndsMs && annualEndsMs > nowMs
        ? 'active_paid'
        : trialEndsMs || annualEndsMs || dullStartedMs || purgeAtMs
          ? 'dull'
          : 'draft');

  if (state === 'trial_active' && (!trialEndsMs || trialEndsMs <= nowMs)) {
    state = annualEndsMs && annualEndsMs > nowMs ? 'active_paid' : 'dull';
  }
  if (state === 'active_paid' && (!annualEndsMs || annualEndsMs <= nowMs)) {
    state = 'dull';
  }
  if (state === 'dull') {
    const computedPurgeMs = purgeAtMs ?? (dullStartedMs ? dullStartedMs + BUSINESS_CARD_DULL_GRACE_MS : null);
    if (computedPurgeMs && computedPurgeMs <= nowMs) {
      state = 'purged';
    }
  }
  return state;
}

async function markRevocableBusinessTransactionsDull(db, userId, cardId) {
  const txSnap = await db
    .collection('users')
    .doc(userId)
    .collection('credits')
    .doc('transactions')
    .collection('entries')
    .where('linkedBusinessCardId', '==', cardId)
    .where('walletSource', '==', 'subscription_revocable')
    .where('status', '==', 'active')
    .get()
    .catch(() => null);

  if (!txSnap || txSnap.empty) {
    return 0;
  }

  const batch = db.batch();
  txSnap.docs.forEach((row) => {
    batch.set(
      row.ref,
      {
        status: 'dull',
        dullAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
  await batch.commit();
  return txSnap.size;
}

async function revokeSubscriptionRevocableCreditsForCard(db, userId, cardId) {
  const balanceRef = db.doc(`users/${userId}/credits/balance`);
  const holdRef = db.doc(`users/${userId}/credits/revocable_holds/${cardId}`);
  const [balanceSnap, holdSnap] = await Promise.all([balanceRef.get(), holdRef.get()]);
  const balanceData = balanceSnap.exists ? balanceSnap.data() || {} : {};
  const currentRevocable = Number(balanceData.creditsSubscriptionRevocable || 0);
  const currentTotal = Number(balanceData.creditsBalance || 0);
  const heldAlready = holdSnap.exists ? Number((holdSnap.data() || {}).amount || 0) : 0;
  const revokeAmount = Math.max(0, currentRevocable);

  if (revokeAmount > 0) {
    await balanceRef.set(
      {
        creditsSubscriptionRevocable: Math.max(0, currentRevocable - revokeAmount),
        creditsBalance: Math.max(0, currentTotal - revokeAmount),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await holdRef.set(
    {
      businessCardId: cardId,
      amount: heldAlready + revokeAmount,
      status: 'held',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: holdSnap.exists
        ? (holdSnap.data() || {}).createdAt || admin.firestore.FieldValue.serverTimestamp()
        : admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return revokeAmount;
}

async function processBusinessCardsLifecycle(db) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cardsSnap = await db.collection('businessCards').get();
  if (cardsSnap.empty) {
    return {
      processed: 0,
      movedToDull: 0,
      purged: 0,
    };
  }

  let movedToDull = 0;
  let purged = 0;

  for (const row of cardsSnap.docs) {
    const card = row.data() || {};
    if (String(card.type || '') !== 'business') {
      continue;
    }

    const cardId = row.id;
    const ownerUid = String(card.ownerUid || '').trim();
    const derivedState = deriveLifecycleStateFromCard(card, now);
    const currentState = String(card.lifecycleState || '').trim() || derivedState;
    const annualEndsMs = toMillis(card.annualContractEndsAt) ?? toMillis(card.subscriptionExpires);
    const trialEndsMs = toMillis(card.trialEndsAt);
    const dullStartedMs = toMillis(card.dullStartedAt);
    const purgeAtMs = toMillis(card.purgeAt) ?? (dullStartedMs ? dullStartedMs + BUSINESS_CARD_DULL_GRACE_MS : null);
    const hasActiveAccess = currentState === 'trial_active' || currentState === 'active_paid';

    // 1) Estado vencido sin acceso -> mover a dull automáticamente
    const mustEnterDull =
      hasActiveAccess &&
      ((currentState === 'trial_active' && trialEndsMs && trialEndsMs <= now) ||
        (currentState === 'active_paid' && annualEndsMs && annualEndsMs <= now));

    if (mustEnterDull) {
      const nextPurgeIso = new Date(now + BUSINESS_CARD_DULL_GRACE_MS).toISOString();
      await row.ref.set(
        {
          lifecycleVersion: 'v1',
          lifecycleState: 'dull',
          dullStartedAt: nowIso,
          purgeAt: nextPurgeIso,
          isActive: false,
          isPublishedToMarket: false,
          lastUpdated: nowIso,
          autopayEnabled: false,
          dullReason: currentState === 'trial_active' ? 'trial_cancelled' : 'annual_expired',
        },
        { merge: true },
      );

      if (ownerUid) {
        await markRevocableBusinessTransactionsDull(db, ownerUid, cardId).catch(() => null);
        await revokeSubscriptionRevocableCreditsForCard(db, ownerUid, cardId).catch(() => null);
      }
      movedToDull += 1;
      continue;
    }

    // 2) Dull vencida por purgeAt -> purga completa
    const mustPurge =
      (currentState === 'dull' || derivedState === 'purged') &&
      purgeAtMs &&
      purgeAtMs <= now;

    if (mustPurge) {
      const licenseUserRef = ownerUid
        ? db.doc(`users/${ownerUid}/business_card_licenses/${cardId}`)
        : null;
      const licenseGlobalRef = ownerUid
        ? db.doc(`business_card_licenses/${ownerUid}_${cardId}`)
        : null;
      const holdRef = ownerUid
        ? db.doc(`users/${ownerUid}/credits/revocable_holds/${cardId}`)
        : null;

      await Promise.all([
        row.ref.delete(),
        licenseUserRef ? licenseUserRef.delete().catch(() => null) : Promise.resolve(),
        licenseGlobalRef ? licenseGlobalRef.delete().catch(() => null) : Promise.resolve(),
        holdRef ? holdRef.delete().catch(() => null) : Promise.resolve(),
      ]);
      purged += 1;
    }
  }

  return {
    processed: cardsSnap.size,
    movedToDull,
    purged,
  };
}

export const purgeExpiredAccounts = functions.pubsub
  .schedule('every day 03:00')
  .timeZone('America/Chicago') // Zona horaria de Austin, Texas
  .onRun(async (context) => {
    const db = admin.firestore();
    
    // CORRECCIÓN CRÍTICA: Usar el objeto Timestamp de Firestore, no Date.now()
    const now = admin.firestore.Timestamp.now();

    const usersQuery = db
      .collection('users')
      .where('pendingDeletion', '==', true)
      .where('deletionDeadline', '<=', now);

    const snapshot = await usersQuery.get();

    if (snapshot.empty) {
      console.log('Operación de limpieza: Cero cuentas expiradas encontradas hoy.');
      return null;
    }

    const results = await Promise.allSettled(
      snapshot.docs.map(async (docSnap) => {
        const uid = docSnap.id;
        
        try {
          // 1. Destruir identidad en Auth
          await admin.auth().deleteUser(uid);
        } catch (authErr) {
          console.error(`Fallo al eliminar Auth del usuario ${uid}:`, authErr);
        }
        
        try {
          // 2. Destruir registro de datos en Firestore
          await db.collection('users').doc(uid).delete();
        } catch (firestoreErr) {
          console.error(`Fallo al eliminar Firestore del usuario ${uid}:`, firestoreErr);
        }
      })
    );

    // Auditoría de resultados
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        console.error(`Error procesando la purga para el usuario ${snapshot.docs[idx].id}:`, result.reason);
      }
    });

    console.log(`Purga nocturna completada. Se procesaron y eliminaron ${snapshot.size} cuentas.`);
    return null;
  });

export const processBusinessCardLifecycleDaily = functions.pubsub
  .schedule('every day 03:30')
  .timeZone('America/Chicago')
  .onRun(async () => {
    const db = admin.firestore();
    const result = await processBusinessCardsLifecycle(db);
    console.log(
      `[BusinessCardLifecycle] processed=${result.processed} movedToDull=${result.movedToDull} purged=${result.purged}`,
    );
    return null;
  });
