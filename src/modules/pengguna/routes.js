const express = require('express');
const sesi = require('./controllers/sesi');
const { wajibMasuk } = require('../../middleware/auth');

const router = express.Router();
router.get('/masuk', sesi.formMasuk);
router.post('/masuk', sesi.prosesMasuk);
router.post('/keluar', wajibMasuk, sesi.keluar);


// Tautkan akun administrator ke data karyawan sendiri (membuka Mode Karyawan).
const tautan = require('./services/tautan');
const { GalatBisnis } = require('../../config/galat');
async function halamanTautan(req, res, galat = null, status = 200) {
  const sudah = !!req.pengguna.karyawanId;
  res.status(status).render('pengguna/tautan', { sudah, kandidat: sudah || req.pengguna.peran !== 'admin' ? [] : await tautan.kandidat(), galat });
}
router.get('/akun/tautan', wajibMasuk, (req, res, next) => halamanTautan(req, res).catch(next));
router.post('/akun/tautan', wajibMasuk, async (req, res, next) => {
  try {
    await tautan.tautkanDiri(req.pengguna, req.body.karyawan_id);
    res.redirect('/');
  } catch (err) {
    if (err instanceof GalatBisnis) return halamanTautan(req, res, err.message, err.status || 400).catch(next);
    return next(err);
  }
});

module.exports = router;
