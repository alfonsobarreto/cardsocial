const router = require('express').Router();
const { auth, adminOnly } = require('../middleware/auth');
const {
  getDashboardStats,
  listUsers,
  updateUser,
  listPendingCards,
  moderateCard,
  listReports,
  updateReport,
} = require('../controllers/adminController');

router.use(auth, adminOnly);

router.get('/stats', getDashboardStats);

router.get('/users', listUsers);
router.put('/users/:id', updateUser);

router.get('/cards/pending', listPendingCards);
router.put('/cards/:id/moderate', moderateCard);

router.get('/reports', listReports);
router.put('/reports/:id', updateReport);

module.exports = router;
