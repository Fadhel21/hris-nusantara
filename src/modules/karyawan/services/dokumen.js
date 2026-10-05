// Dokumen dan foto profil karyawan. Berkas disimpan di uploads/ (di luar git dan di luar /public);
// database hanya menyimpan path. Berkas hanya dilayani lewat route yang memeriksa hak akses.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const { FOLDER, jalurAman } = require('../../../config/uploads');
const audit = require('../../pengguna/services/audit');
const akses = require('./akses');
const berkas = require('./berkas');
const { JENIS_DOKUMEN } = require('./validasi');

const MAKS_DOKUMEN = 2 * 1024 * 1024;
const MAKS_FOTO = 150 * 1024;
const MAKS_SISI_FOTO = 800; // klien mengecilkan ke 400 px; batas server lebih longgar
const MAKS_DOKUMEN_PER_KARYAWAN = 50;
const TIPE_DOKUMEN = ['application/pdf', 'image/jpeg', 'image/png'];

async function daftar(karyawanId) {
  const { rows } = await db.query(
    `SELECT id, jenis, nama_asli, tipe_mime, ukuran, created_at FROM dokumen_karyawan
      WHERE karyawan_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC, id DESC`, [karyawanId]);
  return rows;
}

async function pastikanKaryawanAda(exec, karyawanId) {
  const { rowCount } = await exec.query('SELECT 1 FROM karyawan WHERE id = $1 AND deleted_at IS NULL', [karyawanId]);
  if (!rowCount) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
}

async function unggah(pengguna, karyawanId, { jenis, nama, isi }) {
  akses.pastikanPengelola(pengguna);
  if (!JENIS_DOKUMEN.includes(jenis)) throw new GalatBisnis('Jenis dokumen tidak valid.');
  if (!Buffer.isBuffer(isi) || isi.length === 0) throw new GalatBisnis('Berkas kosong atau tidak terbaca.', 400);
  if (isi.length > MAKS_DOKUMEN) throw new GalatBisnis('Ukuran berkas maksimal 2 MB.', 413);
  const tipe = berkas.deteksiTipe(isi);
  if (!tipe || !TIPE_DOKUMEN.includes(tipe.mime)) throw new GalatBisnis('Format berkas harus PDF, JPG, atau PNG.', 415);
  await pastikanKaryawanAda(db, karyawanId);

  const relatif = path.posix.join('dokumen', String(karyawanId), `${crypto.randomUUID()}.${tipe.ext}`);
  const mutlak = jalurAman(relatif);
  await fs.mkdir(path.dirname(mutlak), { recursive: true });
  await fs.writeFile(mutlak, isi, { flag: 'wx' });
  try {
    await db.transaksi(async (c) => {
      const { rows: n } = await c.query(
        'SELECT count(*)::int AS n FROM dokumen_karyawan WHERE karyawan_id = $1 AND deleted_at IS NULL', [karyawanId]);
      if (n[0].n >= MAKS_DOKUMEN_PER_KARYAWAN) throw new GalatBisnis(`Jumlah dokumen sudah mencapai batas ${MAKS_DOKUMEN_PER_KARYAWAN}.`, 409);
      const namaAsli = berkas.bersihkanNama(nama);
      const { rows } = await c.query(
        `INSERT INTO dokumen_karyawan (karyawan_id, jenis, nama_asli, path, tipe_mime, ukuran, diunggah_oleh)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [karyawanId, jenis, namaAsli, relatif, tipe.mime, isi.length, pengguna.id]);
      await audit.catat({
        penggunaId: pengguna.id, aksi: 'unggah_dokumen', entitas: 'karyawan', entitasId: karyawanId,
        sesudah: { id: rows[0].id, jenis, nama_asli: namaAsli, ukuran: isi.length },
      }, c);
    });
  } catch (err) {
    await fs.unlink(mutlak).catch(() => {}); // jangan tinggalkan berkas yatim bila DB gagal
    throw err;
  }
}

// Dokumen hanya untuk admin/HR dan pemilik datanya (atasan tidak).
async function untukDibuka(pengguna, karyawanId, dokumenId) {
  await akses.pastikanBolehLihat(pengguna, karyawanId);
  if (!akses.bolehLihatSensitif(pengguna, karyawanId)) throw new GalatBisnis('Data tidak ditemukan.', 404);
  const { rows } = await db.query(
    `SELECT path, tipe_mime, nama_asli FROM dokumen_karyawan WHERE id = $1 AND karyawan_id = $2 AND deleted_at IS NULL`,
    [dokumenId, karyawanId]);
  if (!rows[0]) throw new GalatBisnis('Dokumen tidak ditemukan.', 404);
  return { jalur: jalurAman(rows[0].path), mime: rows[0].tipe_mime, nama: rows[0].nama_asli };
}

// Rekaman dokumen ditandai terhapus; berkas fisik dipertahankan agar dapat dipulihkan bila keliru.
async function hapus(pengguna, karyawanId, dokumenId) {
  akses.pastikanPengelola(pengguna);
  await db.transaksi(async (c) => {
    const { rows } = await c.query(
      'SELECT id, jenis, nama_asli FROM dokumen_karyawan WHERE id = $1 AND karyawan_id = $2 AND deleted_at IS NULL FOR UPDATE',
      [dokumenId, karyawanId]);
    if (!rows[0]) throw new GalatBisnis('Dokumen tidak ditemukan.', 404);
    await c.query('UPDATE dokumen_karyawan SET deleted_at = now(), updated_at = now() WHERE id = $1', [dokumenId]);
    await audit.catat({ penggunaId: pengguna.id, aksi: 'hapus_dokumen', entitas: 'karyawan', entitasId: karyawanId, sebelum: rows[0] }, c);
  });
}

async function simpanFoto(pengguna, karyawanId, isi) {
  akses.pastikanPengelola(pengguna);
  if (!Buffer.isBuffer(isi) || isi.length === 0) throw new GalatBisnis('Berkas kosong atau tidak terbaca.', 400);
  if (isi.length > MAKS_FOTO) throw new GalatBisnis('Ukuran foto maksimal 150 KB. Foto dikecilkan otomatis oleh browser.', 413);
  const tipe = berkas.deteksiTipe(isi);
  if (!tipe || tipe.mime !== 'image/jpeg') throw new GalatBisnis('Foto harus berformat JPEG.', 415);
  const dim = berkas.dimensiJpeg(isi);
  if (!dim || dim.lebar > MAKS_SISI_FOTO || dim.tinggi > MAKS_SISI_FOTO) {
    throw new GalatBisnis(`Dimensi foto maksimal ${MAKS_SISI_FOTO} px.`, 422);
  }
  await pastikanKaryawanAda(db, karyawanId);

  const relatif = path.posix.join('foto', `${karyawanId}.jpg`);
  const mutlak = jalurAman(relatif);
  await fs.mkdir(path.dirname(mutlak), { recursive: true });
  const sementara = `${mutlak}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(sementara, isi, { flag: 'wx' });
  try {
    await fs.rename(sementara, mutlak);
    await db.transaksi(async (c) => {
      await c.query('UPDATE karyawan SET foto_path = $1, updated_at = now() WHERE id = $2', [relatif, karyawanId]);
      await audit.catat({
        penggunaId: pengguna.id, aksi: 'ganti_foto', entitas: 'karyawan', entitasId: karyawanId,
        sesudah: { ukuran: isi.length, lebar: dim.lebar, tinggi: dim.tinggi },
      }, c);
    });
  } catch (err) {
    await fs.unlink(sementara).catch(() => {});
    throw err;
  }
}

// Foto boleh dilihat siapa pun yang berhak melihat karyawannya.
async function untukDibukaFoto(pengguna, karyawanId) {
  await akses.pastikanBolehLihat(pengguna, karyawanId);
  const { rows } = await db.query('SELECT foto_path FROM karyawan WHERE id = $1 AND deleted_at IS NULL', [karyawanId]);
  if (!rows[0] || !rows[0].foto_path) throw new GalatBisnis('Foto belum ada.', 404);
  return jalurAman(rows[0].foto_path);
}

module.exports = { daftar, unggah, untukDibuka, hapus, simpanFoto, untukDibukaFoto, FOLDER, MAKS_DOKUMEN };
