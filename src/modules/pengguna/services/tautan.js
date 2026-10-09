// Menautkan akun administrator (yang tidak punya data karyawan) ke satu data karyawan miliknya sendiri,
// agar bisa memakai Mode Karyawan, absen, pengajuan, dan slip gaji. Hanya administrator, hanya untuk dirinya sendiri.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const audit = require('./audit');

// Karyawan aktif yang belum punya akun login.
async function kandidat() {
  const { rows } = await db.query(
    `SELECT k.id, k.nama, k.nomor_induk
       FROM karyawan k
      WHERE k.deleted_at IS NULL AND k.status = 'aktif'
        AND NOT EXISTS (SELECT 1 FROM pengguna p WHERE p.karyawan_id = k.id AND p.deleted_at IS NULL)
      ORDER BY k.nama`);
  return rows;
}

async function tautkanDiri(pengguna, karyawanId) {
  if (pengguna.peran !== 'admin') throw new GalatBisnis('Hanya administrator yang dapat menautkan akunnya ke data karyawan.', 403);
  if (pengguna.karyawanId) throw new GalatBisnis('Akun Anda sudah tertaut ke data karyawan.', 409);
  const id = Number(karyawanId);
  if (!Number.isInteger(id) || id <= 0) throw new GalatBisnis('Pilih data karyawan yang akan ditautkan.');
  try {
    await db.transaksi(async (c) => {
      const { rows } = await c.query("SELECT id, status FROM karyawan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [id]);
      if (!rows[0]) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
      if (rows[0].status !== 'aktif') throw new GalatBisnis('Karyawan yang sudah keluar tidak dapat ditautkan.', 409);
      const { rowCount } = await c.query(
        'UPDATE pengguna SET karyawan_id = $1, updated_at = now() WHERE id = $2 AND karyawan_id IS NULL AND deleted_at IS NULL', [id, pengguna.id]);
      if (!rowCount) throw new GalatBisnis('Akun Anda sudah tertaut ke data karyawan.', 409);
      await audit.catat({
        penggunaId: pengguna.id, aksi: 'tautkan_akun_karyawan', entitas: 'pengguna', entitasId: pengguna.id,
        sebelum: { karyawan_id: null }, sesudah: { karyawan_id: id },
      }, c);
    });
  } catch (err) {
    if (err.code === '23505') throw new GalatBisnis('Karyawan ini sudah punya akun login.', 409);
    throw err;
  }
}

module.exports = { kandidat, tautkanDiri };
