const router = require('express').Router();
const { auth } = require('../middleware/auth');
const {
  addContact,
  getContacts,
  updateContact,
  deleteContact,
} = require('../controllers/contactController');

router.use(auth);

router.get('/', getContacts);
router.post('/', addContact);
router.put('/:id', updateContact);
router.delete('/:id', deleteContact);

module.exports = router;
