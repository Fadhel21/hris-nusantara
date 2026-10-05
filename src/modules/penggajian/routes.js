const express = require('express');
const ctl = require('./controllers/penggajian');
const { wajibMasuk } = require('../../middleware/auth');
const { butuhPeran } = require('../../middleware/akses');

const router = express.Router();
const pengelola = butuhPeran('admin', 'hr');

for (const nama of ['id', 'sid', 'aid']) {
  router.param(nama, (req, res, next, nilai) => {
    if (/^\d{1,18}$/.test(nilai)) return next();
    const err = new Error('Data tidak ditemukan.');
    err.status = 404;
    return next(err);
  });
}

router.use(['/penggajian', '/slip-saya'], wajibMasuk);

// Slip: admin/HR semua slip; karyawan hanya slip miliknya pada periode terkunci (diperiksa di service).
router.get('/slip-saya', ctl.slipSaya);
router.get('/penggajian/slip/:sid', ctl.lihatSlip);
router.get('/penggajian/slip/:sid/pdf', ctl.pdfSlip);

router.get('/penggajian', pengelola, ctl.daftar);
router.post('/penggajian/periode', pengelola, ctl.buatPeriode);
router.get('/penggajian/periode/:id', pengelola, ctl.detailPeriode);
router.post('/penggajian/periode/:id/hitung', pengelola, ctl.hitung);
router.post('/penggajian/periode/:id/kunci', pengelola, ctl.kunci);
router.post('/penggajian/periode/:id/minta-buka-kunci', pengelola, ctl.mintaBuka);
router.post('/penggajian/periode/:id/putuskan-buka-kunci', butuhPeran('admin'), ctl.putuskanBuka);
router.post('/penggajian/periode/:id/penyesuaian', pengelola, ctl.tambahPenyesuaian);
router.post('/penggajian/periode/:id/penyesuaian/:aid/hapus', pengelola, ctl.hapusPenyesuaian);

router.get('/penggajian/pengaturan', pengelola, ctl.halamanPengaturan);
router.post('/penggajian/pengaturan/tarif-bpjs', pengelola, ctl.tambahTarif);
router.post('/penggajian/pengaturan/tarif-bpjs/:id/hapus', pengelola, ctl.hapusTarif);
router.post('/penggajian/pengaturan/parameter', pengelola, ctl.tambahParameter);
router.post('/penggajian/pengaturan/parameter/:id/hapus', pengelola, ctl.hapusParameter);

module.exports = router;
