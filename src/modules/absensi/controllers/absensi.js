const catat = require('../services/catat');
const pengaturan = require('../services/pengaturan');
const { GalatBisnis } = require('../../../config/galat');

const NAMA_HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

async function saya(req, res, next) {
  try {
    if (!req.pengguna.karyawanId) return res.render('absensi/saya', { terhubung: false });
    const [status, rekap] = await Promise.all([
      catat.statusHariIni(req.pengguna), catat.riwayat(req.pengguna, req.pengguna.karyawanId, req.query.bulan),
    ]);
    return res.render('absensi/saya', { terhubung: true, status, ...rekap, tautanDasar: '/absensi' });
  } catch (err) { return next(err); }
}

function absen(jenis) {
  return async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new GalatBisnis('Foto wajib disertakan (JPEG).', 415);
      const hasil = await catat.catat(req.pengguna, jenis, {
        isi: req.body, lat: req.query.lat, lon: req.query.lon, akurasi: req.query.akurasi,
      });
      res.status(201).json({ ok: true, ...hasil });
    } catch (err) { next(err); }
  };
}

async function foto(req, res, next) {
  try {
    const jalur = await catat.untukDibukaFoto(req.pengguna, req.params.cid);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'private, no-store');
    res.sendFile(jalur, (err) => { if (err) next(err.code === 'ENOENT' ? new GalatBisnis('Foto tidak ditemukan.', 404) : err); });
  } catch (err) { next(err); }
}

async function tim(req, res, next) {
  try {
    res.render('absensi/tim', await catat.rekapTim(req.pengguna, req.query.bulan));
  } catch (err) { next(err); }
}

async function karyawan(req, res, next) {
  try {
    const rekap = await catat.riwayat(req.pengguna, req.params.id, req.query.bulan);
    res.render('absensi/karyawan', { ...rekap, tautanDasar: `/absensi/karyawan/${req.params.id}` });
  } catch (err) { next(err); }
}

async function tampilPengaturan(req, res, next, { galat = null, status = 200 } = {}) {
  try {
    res.status(status).render('absensi/pengaturan', {
      galat, jadwal: await pengaturan.daftarJadwal(), retensi: await pengaturan.ambilRetensi(),
      bolehUbahRetensi: req.pengguna.peran === 'admin', namaHari: NAMA_HARI,
    });
  } catch (err) { next(err); }
}

const halamanPengaturan = (req, res, next) => tampilPengaturan(req, res, next);

function aksiPengaturan(fungsi) {
  return async (req, res, next) => {
    try {
      await fungsi(req);
      res.redirect('/absensi/pengaturan');
    } catch (err) {
      if (err instanceof GalatBisnis && err.status !== 403 && err.status !== 404) return tampilPengaturan(req, res, next, { galat: err.message, status: err.status });
      return next(err);
    }
  };
}

const tambahJadwal = aksiPengaturan((req) => pengaturan.tambahJadwal(req.pengguna, req.body));
const ubahRetensi = aksiPengaturan((req) => pengaturan.ubahRetensi(req.pengguna, req.body.bulan));

async function hapusJadwal(req, res, next) {
  try {
    await pengaturan.hapusJadwal(req.pengguna, req.params.id);
    res.status(200).send('');
  } catch (err) { next(err); }
}

function tahunDariQuery(q) {
  const t = String(q || '');
  return /^\d{4}$/.test(t) ? Number(t) : Number(catat.bulanBerjalan().slice(0, 4));
}

async function tampilLibur(req, res, next, { galat = null, status = 200 } = {}) {
  try {
    const tahun = tahunDariQuery(req.query.tahun);
    res.status(status).render('absensi/libur', { galat, tahun, libur: await pengaturan.daftarLibur(tahun) });
  } catch (err) { next(err); }
}

const halamanLibur = (req, res, next) => tampilLibur(req, res, next);

async function tambahLibur(req, res, next) {
  try {
    await pengaturan.tambahLibur(req.pengguna, req.body);
    res.redirect(`/absensi/libur?tahun=${String(req.body.tanggal).slice(0, 4)}`);
  } catch (err) {
    if (err instanceof GalatBisnis && err.status !== 403) return tampilLibur(req, res, next, { galat: err.message, status: err.status });
    return next(err);
  }
}

async function hapusLibur(req, res, next) {
  try {
    await pengaturan.hapusLibur(req.pengguna, req.params.id);
    res.status(200).send('');
  } catch (err) { next(err); }
}

module.exports = {
  saya, masuk: absen('masuk'), pulang: absen('pulang'), foto, tim, karyawan,
  halamanPengaturan, tambahJadwal, ubahRetensi, hapusJadwal, halamanLibur, tambahLibur, hapusLibur,
};
