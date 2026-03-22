const Contact = require('../models/Contact');
const Card = require('../models/Card');

const addContact = async (req, res) => {
  const { cardId, notes, tags } = req.body;
  try {
    const card = await Card.findById(cardId);
    if (!card) return res.status(404).json({ message: 'Card not found' });
    if (String(card.owner) === String(req.user._id)) {
      return res.status(400).json({ message: 'Cannot add your own card as a contact' });
    }
    const contact = await Contact.create({ owner: req.user._id, card: cardId, notes, tags });
    res.status(201).json({ contact });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Contact already exists' });
    res.status(500).json({ message: err.message });
  }
};

const getContacts = async (req, res) => {
  try {
    const contacts = await Contact.find({ owner: req.user._id })
      .populate('card', 'name jobTitle company email phone avatar slug')
      .sort({ createdAt: -1 });
    res.json({ contacts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateContact = async (req, res) => {
  const { notes, tags } = req.body;
  try {
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { notes, tags },
      { new: true }
    ).populate('card', 'name jobTitle company email phone avatar slug');
    if (!contact) return res.status(404).json({ message: 'Contact not found' });
    res.json({ contact });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!contact) return res.status(404).json({ message: 'Contact not found' });
    res.json({ message: 'Contact removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { addContact, getContacts, updateContact, deleteContact };
