const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { createReport } = require('../controllers/reportController');

router.use(auth);
router.post('/', createReport);

module.exports = router;
