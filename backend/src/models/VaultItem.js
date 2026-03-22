const mongoose = require('mongoose');

const vaultItemSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    label: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['password', 'note', 'document', 'identity', 'financial', 'other'],
      default: 'other',
    },
    encryptedData: { type: String, required: true },
    iv: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VaultItem', vaultItemSchema);
