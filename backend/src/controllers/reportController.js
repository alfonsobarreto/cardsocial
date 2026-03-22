const Report = require('../models/Report');

const createReport = async (req, res) => {
  const { cardId, reason } = req.body;
  try {
    const report = await Report.create({ reporter: req.user._id, card: cardId, reason });
    res.status(201).json({ report });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { createReport };
