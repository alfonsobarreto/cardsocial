const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { validationResult } = require('express-validator');
const Card = require('../models/Card');

const generateSlug = () => uuidv4().replace(/-/g, '').slice(0, 12);

const createCard = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const slug = generateSlug();
    const card = await Card.create({ ...req.body, owner: req.user._id, slug });

    const publicUrl = `${process.env.PUBLIC_URL || 'https://cardsocial.app'}/cards/${slug}`;
    card.qrCode = await QRCode.toDataURL(publicUrl);
    await card.save();

    res.status(201).json({ card });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getMyCards = async (req, res) => {
  try {
    const cards = await Card.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ cards });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getCardBySlug = async (req, res) => {
  try {
    const card = await Card.findOne({ slug: req.params.slug, isPublic: true, isActive: true });
    if (!card) return res.status(404).json({ message: 'Card not found' });
    card.viewCount += 1;
    await card.save();
    res.json({ card });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateCard = async (req, res) => {
  try {
    const card = await Card.findOne({ _id: req.params.id, owner: req.user._id });
    if (!card) return res.status(404).json({ message: 'Card not found' });
    Object.assign(card, req.body);
    card.moderationStatus = 'pending'; // re-moderate on update
    await card.save();
    res.json({ card });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteCard = async (req, res) => {
  try {
    const card = await Card.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!card) return res.status(404).json({ message: 'Card not found' });
    res.json({ message: 'Card deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const incrementShare = async (req, res) => {
  try {
    const card = await Card.findOne({ slug: req.params.slug });
    if (!card) return res.status(404).json({ message: 'Card not found' });
    card.shareCount += 1;
    await card.save();
    res.json({ shareCount: card.shareCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { createCard, getMyCards, getCardBySlug, updateCard, deleteCard, incrementShare };
