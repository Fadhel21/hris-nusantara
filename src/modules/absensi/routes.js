const express = require('express');
const ctl = require('./controllers/absensi');
const { wajibMasuk } = require('../../middleware/auth');
const { butuhPeran } = require('../../middleware/akses');

const router = express.Router();
const pengelola = butuhPeran('admin', 'hr');

router.use('/absensi', wajibMasuk);

for (const nama of ['id', 'cid']) {
  router.param(nama, (req, res, next, nilai) => {
    if (/^\d{1,18}$/.test(nilai)) return next();
    const err = new Error('Data tidak ditemukan.');
    err.status = 404;
    return next(err);
  });
}

// Foto absen dikirim sebagai raw JPEG (tanpa library multipart); isinya diperiksa ulang di service.
const rawFoto = express.raw({ type: 'image/jpeg', limit: '200kb' });

router.get('/absensi', ctl.saya);
router.post('/absensi/masuk', rawFoto, ctl.masuk);
router.post('/absensi/pulang', rawFoto, ctl.pulang);
router.get('/absensi/foto/:cid', ctl.foto);

// Rekap: cakupan data ditentukan di service (atasan hanya timnya, HR/admin semua).
router.get('/absensi/tim', butuhPeran('admin', 'hr', 'atasan'), ctl.tim);
router.get('/absensi/karyawan/:id', butuhPeran('admin', 'hr', 'atasan'), ctl.karyawan);

router.get('/absensi/pengaturan', pengelola, ctl.halamanPengaturan);
router.post('/absensi/pengaturan/jadwal', pengelola, ctl.tambahJadwal);
router.post('/absensi/pengaturan/jadwal/:id/hapus', pengelola, ctl.hapusJadwal);
router.post('/absensi/pengaturan/retensi', butuhPeran('admin'), ctl.ubahRetensi);
router.get('/absensi/libur', pengelola, ctl.halamanLibur);
router.post('/absensi/libur', pengelola, ctl.tambahLibur);
router.post('/absensi/libur/:id/hapus', pengelola, ctl.hapusLibur);

module.exports = router;
