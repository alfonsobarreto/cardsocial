// models/actionToken.js
// Modelo para tokens de acción (reset, verificación, etc.)

const { ObjectId } = require('mongodb');

/**
 * Estructura esperada:
 * {
 *   _id: ObjectId,
 *   type: 'reset-password' | 'verify-email' | 'report-incident',
 *   userId: string,
 *   email: string,
 *   token: string,
 *   expiresAt: Date,
 *   used: boolean,
 *   createdAt: Date,
 *   usedAt?: Date
 * }
 */

function createActionTokenModel(db) {
  const collection = db.collection('action_tokens');

  async function create({ type, userId, email, token, expiresAt }) {
    const doc = {
      type,
      userId,
      email,
      token,
      expiresAt,
      used: false,
      createdAt: new Date(),
    };
    await collection.insertOne(doc);
    return doc;
  }

  async function findValid(token, type) {
    const now = new Date();
    return collection.findOne({ token, type, used: false, expiresAt: { $gt: now } });
  }

  async function markUsed(token) {
    return collection.updateOne({ token }, { $set: { used: true, usedAt: new Date() } });
  }

  return { create, findValid, markUsed };
}

module.exports = { createActionTokenModel };
