const express = require('express');
const sesi = require('./controllers/sesi');
const { wajibMasuk } = require('../../middleware/auth');

const router = express.Router();
router.get('/masuk', sesi.formMasuk);
router.post('/masuk', sesi.prosesMasuk);
router.post('/keluar', wajibMasuk, sesi.keluar);

module.exports = router;
