const pengajuan = require('../services/pengajuan');
const alur = require('../services/alur');
const cuti = require('../../cuti/services/cuti');
const izin = require('../../cuti/services/izin');
const koreksi = require('../../absensi/services/koreksi');
const lembur = require('../../lembur/services/lembur');
const saldo = require('../../cuti/services/saldo');
const waktu = require('../../absensi/services/waktu');
const { GalatBisnis } = require('../../../config/galat');

const GALAT_TERBUKA = (err) => err instanceof GalatBisnis && err.status !== 403 && err.status !== 404;

async function tampilSaya(req, res, next, { galat = null, status = 200, tab = 'cuti' } = {}) {
  try {
    const tahun = waktu.lokal(new Date(), 'Asia/Jakarta').tanggal.slice(0, 4);
    const punyaKaryawan = !!req.pengguna.karyawanId;
    res.status(status).render('pengajuan/saya', {
      galat, tab, tahun, punyaKaryawan, isian: req.body || {}, kategoriIzin: izin.KATEGORI,
      daftar: await pengajuan.daftarSaya(req.pengguna),
      saldo: punyaKaryawan ? await saldo.rincian(req.pengguna.karyawanId, Number(tahun)) : [],
      jenisCuti: await saldo.jenisAktif(),
    });
  } catch (err) { next(err); }
}

const saya = (req, res, next) => tampilSaya(req, res, next);

function ajukan(tab, fungsi) {
  return async (req, res, next) => {
    try {
      const id = await fungsi(req.pengguna, req.body);
      res.redirect(`/pengajuan/${id}`);
    } catch (err) {
      if (GALAT_TERBUKA(err)) return tampilSaya(req, res, next, { galat: err.message, status: err.status, tab });
      return next(err);
    }
  };
}

const ajukanCuti = ajukan('cuti', cuti.ajukan);
const ajukanIzin = ajukan('izin', izin.ajukan);
const ajukanKoreksi = ajukan('koreksi', koreksi.ajukan);
const ajukanLembur = ajukan('lembur', lembur.ajukan);

async function tampilDetail(req, res, next, { galat = null, status = 200 } = {}) {
  try {
    res.status(status).render('pengajuan/detail', { galat, ...(await pengajuan.detail(req.pengguna, req.params.id)) });
  } catch (err) { next(err); }
}

const detail = (req, res, next) => tampilDetail(req, res, next);

function aksiDetail(fungsi) {
  return async (req, res, next) => {
    try {
      await fungsi(req);
      res.redirect(`/pengajuan/${req.params.id}`);
    } catch (err) {
      if (GALAT_TERBUKA(err)) return tampilDetail(req, res, next, { galat: err.message, status: err.status });
      return next(err);
    }
  };
}

const putuskan = aksiDetail((req) => pengajuan.putuskan(req.pengguna, req.params.id, req.body));
const batal = aksiDetail((req) => pengajuan.batalkan(req.pengguna, req.params.id, req.body.catatan));

async function inbox(req, res, next) {
  try {
    const tab = req.query.tab === 'tim' ? 'tim' : 'menunggu';
    const status = String(req.query.status || '');
    res.render('persetujuan/inbox', {
      tab, status, daftar: tab === 'tim' ? await pengajuan.daftarTim(req.pengguna, status) : await pengajuan.inbox(req.pengguna),
    });
  } catch (err) { next(err); }
}

async function tampilPengaturan(req, res, next, { galat = null, status = 200 } = {}) {
  try {
    res.status(status).render('persetujuan/pengaturan', { galat, mode: await pengajuan.ambilMode(), daftarMode: alur.MODE });
  } catch (err) { next(err); }
}

const pengaturan = (req, res, next) => tampilPengaturan(req, res, next);

async function ubahPengaturan(req, res, next) {
  try {
    await pengajuan.ubahMode(req.pengguna, String(req.body.mode || ''));
    res.redirect('/persetujuan/pengaturan');
  } catch (err) {
    if (GALAT_TERBUKA(err)) return tampilPengaturan(req, res, next, { galat: err.message, status: err.status });
    return next(err);
  }
}

module.exports = { saya, ajukanCuti, ajukanIzin, ajukanKoreksi, ajukanLembur, detail, putuskan, batal, inbox, pengaturan, ubahPengaturan };
