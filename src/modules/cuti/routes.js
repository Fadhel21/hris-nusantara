const express = require('express');
const jatah = require('./controllers/jatah');
const { wajibMasuk } = require('../../middleware/auth');
const { butuhPeran } = require('../../middleware/akses');

const router = express.Router();
router.use('/cuti', wajibMasuk, butuhPeran('admin', 'hr'));

router.get('/cuti/jatah', jatah.halaman);
router.post('/cuti/jatah', jatah.beriJatah);

module.exports = router;
