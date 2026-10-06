const svc = require('../services/karyawan');
const riwayat = require('../services/riwayat');
const profil = require('../services/profil');
const validasi = require('../services/validasi');
const gajiPengaturan = require('../../penggajian/services/pengaturan');
const pajakSvc = require('../../penggajian/services/pajak');
const akses = require('../services/akses');
const { GalatBisnis } = require('../../../config/galat');

async function daftar(req, res, next) {
  try {
    const { cari = '', status = '', halaman = 1 } = req.query;
    const hasil = await svc.daftar(req.pengguna, { cari: String(cari), status: String(status), halaman });
    res.render('karyawan/daftar', { ...hasil, cari: String(cari), status: String(status), bolehKelola: akses.semuaData(req.pengguna) });
  } catch (err) { next(err); }
}

function saya(req, res, next) {
  if (!req.pengguna.karyawanId) return next(new GalatBisnis('Akun Anda belum terhubung ke data karyawan.', 404));
  return res.redirect(`/karyawan/${req.pengguna.karyawanId}`);
}

async function tampilDetail(req, res, next, { galat = null, status = 200 } = {}) {
  try {
    const data = await svc.detail(req.pengguna, req.params.id);
    res.status(status).render('karyawan/detail', {
      ...data, galat, opsi: data.bolehKelola ? await svc.opsi() : null, peranAkun: svc.PERAN_AKUN, isian: req.body || {},
      hubunganKeluarga: validasi.HUBUNGAN, jenjangPendidikan: validasi.JENJANG, jenisDokumen: validasi.JENIS_DOKUMEN,
    });
  } catch (err) { next(err); }
}

const detail = (req, res, next) => tampilDetail(req, res, next);

async function formBaru(req, res, next) {
  try {
    res.render('karyawan/form', { id: null, nilai: {}, galat: null, opsi: await svc.opsi() });
  } catch (err) { next(err); }
}

async function simpanBaru(req, res, next) {
  try {
    const id = await svc.buat(req.pengguna, req.body);
    res.redirect(`/karyawan/${id}`);
  } catch (err) {
    if (!(err instanceof GalatBisnis) || err.status === 403) return next(err);
    try {
      return res.status(err.status).render('karyawan/form', { id: null, nilai: req.body, galat: err.message, opsi: await svc.opsi() });
    } catch (e) { return next(e); }
  }
}

async function formUbah(req, res, next) {
  try {
    const nilai = await svc.ambilUntukUbah(req.pengguna, req.params.id);
    res.render('karyawan/form', { id: req.params.id, nilai, galat: null, opsi: null });
  } catch (err) { next(err); }
}

async function simpanUbah(req, res, next) {
  try {
    await svc.ubah(req.pengguna, req.params.id, req.body);
    res.redirect(`/karyawan/${req.params.id}`);
  } catch (err) {
    if (!(err instanceof GalatBisnis) || err.status === 403 || err.status === 404) return next(err);
    return res.status(err.status).render('karyawan/form', { id: req.params.id, nilai: req.body, galat: err.message, opsi: null });
  }
}

// Aksi dari halaman detail: sukses -> kembali ke detail; gagal validasi -> tampilkan detail dengan pesan.
function aksiDetail(fungsi) {
  return async (req, res, next) => {
    try {
      await fungsi(req);
      res.redirect(`/karyawan/${req.params.id}`);
    } catch (err) {
      if (err instanceof GalatBisnis && err.status !== 403 && err.status !== 404) {
        return tampilDetail(req, res, next, { galat: err.message, status: err.status });
      }
      return next(err);
    }
  };
}

const tambahPenempatan = aksiDetail((req) => riwayat.tambahPenempatan(req.pengguna, req.params.id, req.body));
const tambahGaji = aksiDetail((req) => riwayat.tambahGaji(req.pengguna, req.params.id, req.body));
const tambahKontrak = aksiDetail((req) => riwayat.tambahKontrak(req.pengguna, req.params.id, req.body));
const tambahKeluarga = aksiDetail((req) => profil.tambah(req.pengguna, req.params.id, 'keluarga', req.body));
const tambahPendidikan = aksiDetail((req) => profil.tambah(req.pengguna, req.params.id, 'pendidikan', req.body));
const tambahKomponen = aksiDetail((req) => gajiPengaturan.tambahKomponenKaryawan(req.pengguna, req.params.id, req.body));
const tambahStatusPajak = aksiDetail((req) => pajakSvc.tambahStatus(req.pengguna, req.params.id, req.body));
const simpanSaldoAwalPajak = aksiDetail((req) => pajakSvc.simpanSaldoAwal(req.pengguna, req.params.id, req.body));
const aturBpjs = aksiDetail((req) => gajiPengaturan.aturKepesertaan(req.pengguna, req.params.id, req.body));
const keluarkan = aksiDetail((req) => svc.keluarkan(req.pengguna, req.params.id, req.body));
const buatAkun = aksiDetail((req) => svc.buatAkun(req.pengguna, req.params.id, req.body));

async function hapusStatusPajak(req, res, next) {
  try {
    await pajakSvc.hapusStatus(req.pengguna, req.params.id, req.params.rid);
    res.status(200).send('');
  } catch (err) { next(err); }
}

async function hapusKomponen(req, res, next) {
  try {
    await gajiPengaturan.hapusKomponenKaryawan(req.pengguna, req.params.id, req.params.rid);
    res.status(200).send('');
  } catch (err) { next(err); }
}

// Dipanggil lewat HTMX: baris riwayat dihapus dari tabel bila berhasil.
async function hapusRiwayat(req, res, next) {
  try {
    await riwayat.hapus(req.pengguna, req.params.id, req.params.jenis, req.params.rid);
    res.status(200).send('');
  } catch (err) { next(err); }
}

module.exports = {
  daftar, saya, detail, formBaru, simpanBaru, formUbah, simpanUbah,
  tambahPenempatan, tambahGaji, tambahKontrak, tambahKeluarga, tambahPendidikan, tambahKomponen, aturBpjs, hapusKomponen,
  tambahStatusPajak, simpanSaldoAwalPajak, hapusStatusPajak,
  keluarkan, buatAkun, hapusRiwayat,
};
