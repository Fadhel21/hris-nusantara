const express = require('express');
const ctl = require('./controllers/pengajuan');
const { wajibMasuk } = require('../../middleware/auth');
const { butuhPeran } = require('../../middleware/akses');

const router = express.Router();

router.param('id', (req, res, next, nilai) => {
  if (/^\d{1,18}$/.test(nilai)) return next();
  const err = new Error('Data tidak ditemukan.');
  err.status = 404;
  return next(err);
});

// Hak akses per pengajuan diperiksa di service (pemohon, pemberi keputusan, atasan, HR/admin).
router.use(['/pengajuan', '/persetujuan'], wajibMasuk);

router.get('/pengajuan', ctl.saya);
router.post('/pengajuan/cuti', ctl.ajukanCuti);
router.post('/pengajuan/izin', ctl.ajukanIzin);
router.post('/pengajuan/koreksi', ctl.ajukanKoreksi);
router.post('/pengajuan/lembur', ctl.ajukanLembur);
router.get('/pengajuan/:id', ctl.detail);
router.post('/pengajuan/:id/batal', ctl.batal);

router.get('/persetujuan', ctl.inbox);
router.get('/persetujuan/pengaturan', butuhPeran('admin'), ctl.pengaturan);
router.post('/persetujuan/pengaturan', butuhPeran('admin'), ctl.ubahPengaturan);
router.post('/persetujuan/:id/putuskan', ctl.putuskan);

module.exports = router;
