// Unggah/unduh foto dan dokumen. Unggahan dikirim sebagai raw body (tanpa library multipart);
// metadata ada di query string. Hak akses diperiksa di service.
const dokumen = require('../services/dokumen');
const profil = require('../services/profil');
const { GalatBisnis } = require('../../../config/galat');

function pastikanBerkas(req) {
  if (!Buffer.isBuffer(req.body)) throw new GalatBisnis('Tipe berkas tidak didukung. Gunakan PDF, JPG, atau PNG.', 415);
  return req.body;
}

async function unggahDokumen(req, res, next) {
  try {
    await dokumen.unggah(req.pengguna, req.params.id, {
      jenis: String(req.query.jenis || ''), nama: String(req.query.nama || ''), isi: pastikanBerkas(req),
    });
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
}

async function bukaDokumen(req, res, next) {
  try {
    const d = await dokumen.untukDibuka(req.pengguna, req.params.id, req.params.did);
    res.set('Content-Type', d.mime);
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(d.nama)}`);
    res.set('Cache-Control', 'private, no-store');
    res.sendFile(d.jalur, (err) => { if (err) next(err.code === 'ENOENT' ? new GalatBisnis('Berkas tidak ditemukan.', 404) : err); });
  } catch (err) { next(err); }
}

async function hapusDokumen(req, res, next) {
  try {
    await dokumen.hapus(req.pengguna, req.params.id, req.params.did);
    res.status(200).send('');
  } catch (err) { next(err); }
}

async function unggahFoto(req, res, next) {
  try {
    await dokumen.simpanFoto(req.pengguna, req.params.id, pastikanBerkas(req));
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
}

async function bukaFoto(req, res, next) {
  try {
    const jalur = await dokumen.untukDibukaFoto(req.pengguna, req.params.id);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'private, no-cache');
    res.sendFile(jalur, (err) => { if (err) next(err.code === 'ENOENT' ? new GalatBisnis('Foto belum ada.', 404) : err); });
  } catch (err) { next(err); }
}

// Hapus baris keluarga/pendidikan lewat HTMX.
async function hapusProfil(req, res, next) {
  try {
    await profil.hapus(req.pengguna, req.params.id, req.params.jenisProfil, req.params.kid);
    res.status(200).send('');
  } catch (err) { next(err); }
}

module.exports = { unggahDokumen, bukaDokumen, hapusDokumen, unggahFoto, bukaFoto, hapusProfil };
