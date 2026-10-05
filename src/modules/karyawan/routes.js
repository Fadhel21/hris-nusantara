const express = require('express');
const ctl = require('./controllers/karyawan');
const { wajibMasuk } = require('../../middleware/auth');
const { butuhPeran } = require('../../middleware/akses');

const router = express.Router();
const pengelola = butuhPeran('admin', 'hr');

router.use('/karyawan', wajibMasuk);

router.param('id', (req, res, next, nilai) => {
  if (/^\d{1,18}$/.test(nilai)) return next();
  const err = new Error('Data tidak ditemukan.');
  err.status = 404;
  return next(err);
});
router.param('rid', (req, res, next, nilai) => {
  if (/^\d{1,18}$/.test(nilai)) return next();
  const err = new Error('Data tidak ditemukan.');
  err.status = 404;
  return next(err);
});

// Pembatasan peran kasar di sini; pembatasan per-data (diri sendiri/bawahan) ada di service.
router.get('/karyawan', butuhPeran('admin', 'hr', 'atasan'), ctl.daftar);
router.get('/karyawan/saya', ctl.saya);
router.get('/karyawan/baru', pengelola, ctl.formBaru);
router.post('/karyawan', pengelola, ctl.simpanBaru);
router.get('/karyawan/:id', ctl.detail);
router.get('/karyawan/:id/ubah', pengelola, ctl.formUbah);
router.post('/karyawan/:id', pengelola, ctl.simpanUbah);
router.post('/karyawan/:id/penempatan', pengelola, ctl.tambahPenempatan);
router.post('/karyawan/:id/gaji', pengelola, ctl.tambahGaji);
router.post('/karyawan/:id/kontrak', pengelola, ctl.tambahKontrak);
router.post('/karyawan/:id/keluar', pengelola, ctl.keluarkan);
router.post('/karyawan/:id/akun', butuhPeran('admin'), ctl.buatAkun);
router.post('/karyawan/:id/riwayat/:jenis/:rid/hapus', pengelola, ctl.hapusRiwayat);

module.exports = router;
