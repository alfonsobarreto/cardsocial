const router = require('express').Router();
const { body } = require('express-validator');
const { auth } = require('../middleware/auth');
const { moderateContent } = require('../middleware/moderation');
const {
  createCard,
  getMyCards,
  getCardBySlug,
  updateCard,
  deleteCard,
  incrementShare,
} = require('../controllers/cardController');

// Public
router.get('/public/:slug', getCardBySlug);
router.post('/public/:slug/share', incrementShare);

// Protected
router.use(auth);

router.get('/', getMyCards);

router.post(
  '/',
  [body('name').notEmpty().withMessage('Card name is required')],
  moderateContent(['name', 'bio', 'jobTitle', 'company']),
  createCard
);

router.put(
  '/:id',
  moderateContent(['name', 'bio', 'jobTitle', 'company']),
  updateCard
);

router.delete('/:id', deleteCard);

module.exports = router;
