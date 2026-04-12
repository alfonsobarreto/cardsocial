const { Expo } = require('expo-server-sdk');

const expo = new Expo();

/**
 * @param {import('mongodb').Db} db
 * @param {string} targetUid
 * @param {{ title: string; body: string; data?: Record<string, unknown>; channelId?: string }} payload
 */
async function sendPushToUser(db, targetUid, payload) {
  const uid = String(targetUid || '').trim();
  if (!uid) return;

  const tokens = await db
    .collection('push_tokens')
    .find({ uid }, { projection: { token: 1 } })
    .toArray();

  const messages = [];
  for (const row of tokens) {
    const pushToken = String(row.token || '').trim();
    if (!Expo.isExpoPushToken(pushToken)) continue;

    messages.push({
      to: pushToken,
      sound: 'default',
      priority: 'high',
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      channelId: payload.channelId || 'ghost-link-calls',
    });
  }

  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Push] send error:', err);
      }
    }
  }
}

module.exports = { sendPushToUser };
