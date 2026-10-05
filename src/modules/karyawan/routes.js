const express = require('express');
const ctl = require('./controllers/karyawan');
const berkas = require('./controllers/berkas');
const { wajibMasuk } = require('../../middleware/auth');
const { butuhPeran } = require('../../middleware/akses');

const router = express.Router();
const pengelola = butuhPeran('admin', 'hr');

router.use('/karyawan', wajibMasuk);

// Semua parameter id harus berupa angka.
for (const nama of ['id', 'rid', 'did', 'kid']) {
  router.param(nama, (req, res, next, nilai) => {
    if (/^\d{1,18}$/.test(nilai)) return next();
    const err = new Error('Data tidak ditemukan.');
    err.status = 404;
    return next(err);
  });
}

// Unggahan dibaca sebagai raw body (tanpa library multipart). Isi diperiksa ulang di service lewat magic number.
const rawDokumen = express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png'], limit: '2mb' });
const rawFoto = express.raw({ type: 'image/jpeg', limit: '200kb' });

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
router.post('/karyawan/:id/keluarga', pengelola, ctl.tambahKeluarga);
router.post('/karyawan/:id/pendidikan', pengelola, ctl.tambahPendidikan);
router.post('/karyawan/:id/komponen', pengelola, ctl.tambahKomponen);
router.post('/karyawan/:id/komponen/:rid/hapus', pengelola, ctl.hapusKomponen);
router.post('/karyawan/:id/bpjs', pengelola, ctl.aturBpjs);
router.post('/karyawan/:id/keluar', pengelola, ctl.keluarkan);
router.post('/karyawan/:id/akun', butuhPeran('admin'), ctl.buatAkun);
router.post('/karyawan/:id/riwayat/:jenis/:rid/hapus', pengelola, ctl.hapusRiwayat);
router.post('/karyawan/:id/:jenisProfil(keluarga|pendidikan)/:kid/hapus', pengelola, berkas.hapusProfil);

router.get('/karyawan/:id/foto', berkas.bukaFoto);
router.post('/karyawan/:id/foto', pengelola, rawFoto, berkas.unggahFoto);
router.post('/karyawan/:id/dokumen', pengelola, rawDokumen, berkas.unggahDokumen);
router.get('/karyawan/:id/dokumen/:did', berkas.bukaDokumen);
router.post('/karyawan/:id/dokumen/:did/hapus', pengelola, berkas.hapusDokumen);

module.exports = router;
