const express = require('express');
const ctl = require('./controllers/master');
const entitas = require('./entitas');
const { wajibMasuk } = require('../../middleware/auth');
const { butuhPeran } = require('../../middleware/akses');

const router = express.Router();
// Pemeriksaan peran di sini; hak akses per cakupan (cabang/departemen) menyusul bersama data karyawan.
router.use('/organisasi', wajibMasuk, butuhPeran('admin', 'hr'));

router.get('/organisasi/struktur', ctl.tampilStruktur);

// Hanya kunci entitas yang dikenal; id wajib angka.
router.param('entitas', (req, res, next, nilai) => {
  if (Object.prototype.hasOwnProperty.call(entitas, nilai)) return next();
  const err = new Error('Halaman tidak ditemukan.');
  err.status = 404;
  return next(err);
});
router.param('id', (req, res, next, nilai) => {
  if (/^\d{1,18}$/.test(nilai)) return next();
  const err = new Error('Data tidak ditemukan.');
  err.status = 404;
  return next(err);
});

router.get('/organisasi/:entitas', ctl.daftar);
router.get('/organisasi/:entitas/baru', ctl.formBaru);
router.post('/organisasi/:entitas', ctl.simpan);
router.get('/organisasi/:entitas/:id/ubah', ctl.formUbah);
router.post('/organisasi/:entitas/:id', ctl.simpan);
router.post('/organisasi/:entitas/:id/hapus', ctl.hapus);

module.exports = router;
