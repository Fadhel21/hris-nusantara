const saldo = require('../services/saldo');
const waktu = require('../../absensi/services/waktu');
const { GalatBisnis } = require('../../../config/galat');

async function tampil(req, res, next, { galat = null, status = 200 } = {}) {
  try {
    const tahunIni = waktu.lokal(new Date(), 'Asia/Jakarta').tanggal.slice(0, 4);
    const tahun = /^\d{4}$/.test(String(req.query.tahun || req.body.tahun || '')) ? String(req.query.tahun || req.body.tahun) : tahunIni;
    const angka = (v) => (/^\d{1,6}$/.test(String(v || '')) ? Number(v) : null);
    const data = await saldo.daftarSemua(req.pengguna, tahun);
    res.status(status).render('cuti/jatah', {
      galat, tahun: data.tahun, baris: data.baris, jenisCuti: await saldo.jenisAktif(),
      hasil: angka(req.query.dibuat) !== null ? { dibuat: angka(req.query.dibuat), dilewati: angka(req.query.dilewati) || 0 } : null,
    });
  } catch (err) { next(err); }
}

const halaman = (req, res, next) => tampil(req, res, next);

async function beriJatah(req, res, next) {
  try {
    const h = await saldo.beriJatah(req.pengguna, req.body);
    res.redirect(`/cuti/jatah?tahun=${encodeURIComponent(String(req.body.tahun).trim())}&dibuat=${h.dibuat}&dilewati=${h.dilewati}`);
  } catch (err) {
    if (err instanceof GalatBisnis && err.status !== 403) return tampil(req, res, next, { galat: err.message, status: err.status });
    return next(err);
  }
}

module.exports = { halaman, beriJatah };
