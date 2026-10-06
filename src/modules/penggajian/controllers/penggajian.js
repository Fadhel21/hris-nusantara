const periode = require('../services/periode');
const slip = require('../services/slip');
const pengaturan = require('../services/pengaturan');
const { URUTAN_PROGRAM, NAMA_PROGRAM } = require('../services/hitung');
const { TIPE_HARI, PRESET_KEPMENAKER } = require('../services/lembur');
const { GalatBisnis } = require('../../../config/galat');

const GALAT_TERBUKA = (err) => err instanceof GalatBisnis && err.status !== 403 && err.status !== 404;

async function daftar(req, res, next, { galat = null, status = 200 } = {}) {
  try {
    const sekarang = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
    res.status(status).render('penggajian/daftar', {
      galat, daftar: await periode.daftarPeriode(), namaBulan: slip.NAMA_BULAN, bulanIni: sekarang, isian: req.body || {},
    });
  } catch (err) { next(err); }
}

async function buatPeriode(req, res, next) {
  try {
    const id = await periode.buatPeriode(req.pengguna, req.body);
    res.redirect(`/penggajian/periode/${id}`);
  } catch (err) {
    if (GALAT_TERBUKA(err)) return daftar(req, res, next, { galat: err.message, status: err.status });
    return next(err);
  }
}

async function tampilPeriode(req, res, next, { galat = null, pesan = null, status = 200 } = {}) {
  try {
    const data = await periode.detail(req.pengguna, req.params.id);
    res.status(status).render('penggajian/periode', { galat, pesan, ...data, judulPeriode: slip.namaPeriode(data.periode) });
  } catch (err) { next(err); }
}

const detailPeriode = (req, res, next) => tampilPeriode(req, res, next, {
  pesan: req.query.hasil ? 'Perhitungan selesai.' : null,
});

function aksi(fungsi, { pesan = null } = {}) {
  return async (req, res, next) => {
    try {
      await fungsi(req);
      res.redirect(`/penggajian/periode/${req.params.id}${pesan ? `?hasil=${pesan}` : ''}`);
    } catch (err) {
      if (GALAT_TERBUKA(err)) return tampilPeriode(req, res, next, { galat: err.message, status: err.status });
      return next(err);
    }
  };
}

const hitung = aksi((req) => periode.hitung(req.pengguna, req.params.id), { pesan: 'ok' });
const kunci = aksi((req) => periode.kunciPeriode(req.pengguna, req.params.id));
const mintaBuka = aksi((req) => periode.mintaBukaKunci(req.pengguna, req.params.id, req.body.alasan));
const putuskanBuka = aksi((req) => periode.putuskanBukaKunci(req.pengguna, req.params.id, req.body));
const tambahPenyesuaian = aksi((req) => periode.tambahPenyesuaian(req.pengguna, req.params.id, req.body));

async function hapusPenyesuaian(req, res, next) {
  try {
    await periode.hapusPenyesuaian(req.pengguna, req.params.id, req.params.aid);
    res.status(200).send('');
  } catch (err) { next(err); }
}

async function lihatSlip(req, res, next) {
  try {
    res.render('penggajian/slip', await slip.ambilSlip(req.pengguna, req.params.sid));
  } catch (err) { next(err); }
}

async function pdfSlip(req, res, next) {
  try {
    const { buffer, nama } = await slip.buatPdf(req.pengguna, req.params.sid);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${nama}"`);
    res.set('Cache-Control', 'private, no-store');
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
}

async function slipSaya(req, res, next) {
  try {
    res.render('penggajian/slip_saya', { daftar: await slip.slipSaya(req.pengguna), namaBulan: slip.NAMA_BULAN });
  } catch (err) { next(err); }
}

async function tampilPengaturan(req, res, next, { galat = null, status = 200 } = {}) {
  try {
    res.status(status).render('penggajian/pengaturan', {
      galat, tarif: await pengaturan.daftarTarifBpjs(), parameter: await pengaturan.daftarParameter(),
      program: URUTAN_PROGRAM, namaProgram: NAMA_PROGRAM, kunciTerlambat: pengaturan.KUNCI_TERLAMBAT,
      parameterDef: pengaturan.PARAMETER, aturanLembur: await pengaturan.daftarAturanLembur(), tipeHari: TIPE_HARI,
      preset: PRESET_KEPMENAKER,
    });
  } catch (err) { next(err); }
}

const halamanPengaturan = (req, res, next) => tampilPengaturan(req, res, next);

function aksiPengaturan(fungsi) {
  return async (req, res, next) => {
    try {
      await fungsi(req);
      res.redirect('/penggajian/pengaturan');
    } catch (err) {
      if (GALAT_TERBUKA(err)) return tampilPengaturan(req, res, next, { galat: err.message, status: err.status });
      return next(err);
    }
  };
}

const tambahTarif = aksiPengaturan((req) => pengaturan.tambahTarifBpjs(req.pengguna, req.body));
const tambahParameter = aksiPengaturan((req) => pengaturan.tambahParameter(req.pengguna, req.body));

function hapusDengan(fungsi) {
  return async (req, res, next) => {
    try {
      await fungsi(req);
      res.status(200).send('');
    } catch (err) { next(err); }
  };
}

const tambahAturan = aksiPengaturan((req) => pengaturan.tambahAturanLembur(req.pengguna, req.body));
const terapkanPreset = aksiPengaturan((req) => pengaturan.terapkanPresetKepmenaker(req.pengguna, req.body));
const hapusAturan = hapusDengan((req) => pengaturan.hapusAturanLembur(req.pengguna, req.params.id));
const hapusTarif = hapusDengan((req) => pengaturan.hapusTarifBpjs(req.pengguna, req.params.id));
const hapusParameter = hapusDengan((req) => pengaturan.hapusParameter(req.pengguna, req.params.id));

module.exports = {
  daftar: (req, res, next) => daftar(req, res, next), buatPeriode, detailPeriode, hitung, kunci, mintaBuka, putuskanBuka,
  tambahPenyesuaian, hapusPenyesuaian, lihatSlip, pdfSlip, slipSaya, halamanPengaturan, tambahTarif, tambahParameter, hapusTarif, hapusParameter,
  tambahAturan, terapkanPreset, hapusAturan,
};
