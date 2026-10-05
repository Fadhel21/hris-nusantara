const master = require('../services/master');
const struktur = require('../services/struktur');
const { GalatBisnis } = require('../../../config/galat');

async function daftar(req, res, next) {
  try {
    const def = master.ambilDef(req.params.entitas);
    res.render('organisasi/daftar', { def, kunci: req.params.entitas, baris: await master.daftar(req.params.entitas) });
  } catch (err) { next(err); }
}

async function formBaru(req, res, next) {
  try {
    const kunci = req.params.entitas;
    res.render('organisasi/form', {
      def: master.ambilDef(kunci), kunci, id: null, nilai: {}, galat: null, opsi: await master.opsiForm(kunci),
    });
  } catch (err) { next(err); }
}

async function formUbah(req, res, next) {
  try {
    const kunci = req.params.entitas;
    const def = master.ambilDef(kunci);
    const nilai = await master.ambil(kunci, req.params.id);
    res.render('organisasi/form', { def, kunci, id: req.params.id, nilai, galat: null, opsi: await master.opsiForm(kunci, req.params.id) });
  } catch (err) { next(err); }
}

// Simpan baru (id kosong) atau ubah. Bila gagal validasi, tampilkan ulang formulir dengan isian tadi.
async function simpan(req, res, next) {
  const kunci = req.params.entitas;
  const id = req.params.id || null;
  try {
    await master.simpan(kunci, req.body, req.pengguna, id);
    res.redirect(`/organisasi/${kunci}`);
  } catch (err) {
    if (!(err instanceof GalatBisnis) || err.status === 404) return next(err);
    try {
      const nilai = { ...req.body };
      return res.status(err.status).render('organisasi/form', {
        def: master.ambilDef(kunci), kunci, id, nilai, galat: err.message, opsi: await master.opsiForm(kunci, id),
      });
    } catch (e) { return next(e); }
  }
}

// Dipanggil lewat HTMX: baris dihapus dari tabel bila berhasil.
async function hapus(req, res, next) {
  try {
    await master.hapus(req.params.entitas, req.params.id, req.pengguna);
    res.status(200).send('');
  } catch (err) { next(err); }
}

async function tampilStruktur(req, res, next) {
  try {
    res.render('organisasi/struktur', { perusahaan: await struktur.ambilStruktur() });
  } catch (err) { next(err); }
}

module.exports = { daftar, formBaru, formUbah, simpan, hapus, tampilStruktur };
