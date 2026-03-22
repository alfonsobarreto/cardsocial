const User = require('../models/User');
const Card = require('../models/Card');
const Report = require('../models/Report');

const getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, totalCards, pendingCards, openReports] = await Promise.all([
      User.countDocuments(),
      Card.countDocuments(),
      Card.countDocuments({ moderationStatus: 'pending' }),
      Report.countDocuments({ status: 'open' }),
    ]);
    res.json({ totalUsers, totalCards, pendingCards, openReports });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const listUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const users = await User.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    const total = await User.countDocuments();
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateUser = async (req, res) => {
  const { isActive, role } = req.body;
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { ...(isActive !== undefined && { isActive }), ...(role && { role }) },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const listPendingCards = async (req, res) => {
  try {
    const cards = await Card.find({ moderationStatus: 'pending' })
      .populate('owner', 'name email')
      .sort({ createdAt: -1 });
    res.json({ cards });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const moderateCard = async (req, res) => {
  const { status, note } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be approved or rejected' });
  }
  try {
    const card = await Card.findByIdAndUpdate(
      req.params.id,
      { moderationStatus: status, moderationNote: note || '' },
      { new: true }
    );
    if (!card) return res.status(404).json({ message: 'Card not found' });
    res.json({ card });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const listReports = async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('reporter', 'name email')
      .populate('card', 'name slug owner')
      .sort({ createdAt: -1 });
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateReport = async (req, res) => {
  const { status, adminNote } = req.body;
  try {
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { ...(status && { status }), ...(adminNote !== undefined && { adminNote }) },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json({ report });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getDashboardStats, listUsers, updateUser, listPendingCards, moderateCard, listReports, updateReport };
