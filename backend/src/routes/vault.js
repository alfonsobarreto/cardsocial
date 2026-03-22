const router = require('express').Router();
const { body } = require('express-validator');
const { auth } = require('../middleware/auth');
const {
  createItem,
  getItems,
  getItemData,
  updateItem,
  deleteItem,
} = require('../controllers/vaultController');

router.use(auth);

router.get('/', getItems);
router.get('/:id/data', getItemData);

router.post(
  '/',
  [
    body('label').notEmpty().withMessage('Label is required'),
    body('data').notEmpty().withMessage('Data is required'),
  ],
  createItem
);

router.put('/:id', updateItem);
router.delete('/:id', deleteItem);

module.exports = router;
