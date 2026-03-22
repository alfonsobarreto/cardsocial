const CryptoJS = require('crypto-js');
const { validationResult } = require('express-validator');
const VaultItem = require('../models/VaultItem');

const getKey = () => process.env.VAULT_ENCRYPTION_KEY || 'default_dev_key_32chars__________';

const encrypt = (plaintext) => {
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(plaintext, getKey(), { iv });
  return { encryptedData: encrypted.toString(), iv: iv.toString() };
};

const decrypt = (encryptedData, iv) => {
  const ivParsed = CryptoJS.enc.Hex.parse(iv);
  const decrypted = CryptoJS.AES.decrypt(encryptedData, getKey(), { iv: ivParsed });
  return decrypted.toString(CryptoJS.enc.Utf8);
};

const createItem = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { label, category, data } = req.body;
  try {
    const { encryptedData, iv } = encrypt(data);
    const item = await VaultItem.create({ owner: req.user._id, label, category, encryptedData, iv });
    res.status(201).json({ item: { _id: item._id, label: item.label, category: item.category, createdAt: item.createdAt } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getItems = async (req, res) => {
  try {
    const items = await VaultItem.find({ owner: req.user._id }).sort({ createdAt: -1 });
    const result = items.map((i) => ({
      _id: i._id,
      label: i.label,
      category: i.category,
      createdAt: i.createdAt,
    }));
    res.json({ items: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getItemData = async (req, res) => {
  try {
    const item = await VaultItem.findOne({ _id: req.params.id, owner: req.user._id });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    const data = decrypt(item.encryptedData, item.iv);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateItem = async (req, res) => {
  const { label, category, data } = req.body;
  try {
    const item = await VaultItem.findOne({ _id: req.params.id, owner: req.user._id });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (label) item.label = label;
    if (category) item.category = category;
    if (data) {
      const enc = encrypt(data);
      item.encryptedData = enc.encryptedData;
      item.iv = enc.iv;
    }
    await item.save();
    res.json({ item: { _id: item._id, label: item.label, category: item.category, updatedAt: item.updatedAt } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteItem = async (req, res) => {
  try {
    const item = await VaultItem.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { createItem, getItems, getItemData, updateItem, deleteItem };
