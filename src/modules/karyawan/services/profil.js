// Keluarga dan pendidikan karyawan. Tambah dan hapus (soft delete); koreksi = hapus lalu tambah ulang.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const audit = require('../../pengguna/services/audit');
const akses = require('./akses');
const validasi = require('./validasi');

const DEF = {
  keluarga: { tabel: 'keluarga', label: 'keluarga', urut: 'tanggungan DESC, hubungan, nama', validasi: validasi.keluarga },
  pendidikan: { tabel: 'pendidikan', label: 'pendidikan', urut: 'tahun_lulus DESC NULLS LAST, id DESC', validasi: validasi.pendidikan },
};
const MAKS_BARIS = 50;

async function daftar(jenis, karyawanId) {
  const def = DEF[jenis];
  const { rows } = await db.query(
    `SELECT * FROM ${def.tabel} WHERE karyawan_id = $1 AND deleted_at IS NULL ORDER BY ${def.urut}`, [karyawanId]);
  return rows;
}

async function tambah(pengguna, karyawanId, jenis, input) {
  akses.pastikanPengelola(pengguna);
  const def = DEF[jenis];
  const { nilai, galat } = def.validasi(input);
  if (galat.length) throw new GalatBisnis(galat.join(' '));
  const kolom = Object.keys(nilai);
  await db.transaksi(async (c) => {
    const { rows } = await c.query('SELECT 1 FROM karyawan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [karyawanId]);
    if (!rows[0]) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
    const { rows: n } = await c.query(`SELECT count(*)::int AS n FROM ${def.tabel} WHERE karyawan_id = $1 AND deleted_at IS NULL`, [karyawanId]);
    if (n[0].n >= MAKS_BARIS) throw new GalatBisnis(`Data ${def.label} sudah mencapai batas ${MAKS_BARIS} baris.`, 409);
    const { rows: baru } = await c.query(
      `INSERT INTO ${def.tabel} (karyawan_id, ${kolom.join(', ')}) VALUES ($1, ${kolom.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING id`,
      [karyawanId, ...kolom.map((k) => nilai[k])]);
    await audit.catat({ penggunaId: pengguna.id, aksi: `tambah_${jenis}`, entitas: 'karyawan', entitasId: karyawanId, sesudah: { id: baru[0].id, ...nilai } }, c);
  });
}

async function hapus(pengguna, karyawanId, jenis, barisId) {
  akses.pastikanPengelola(pengguna);
  const def = DEF[jenis];
  if (!def) throw new GalatBisnis('Data tidak dikenal.', 404);
  await db.transaksi(async (c) => {
    const { rows } = await c.query(
      `SELECT * FROM ${def.tabel} WHERE id = $1 AND karyawan_id = $2 AND deleted_at IS NULL FOR UPDATE`, [barisId, karyawanId]);
    if (!rows[0]) throw new GalatBisnis('Data tidak ditemukan.', 404);
    await c.query(`UPDATE ${def.tabel} SET deleted_at = now(), updated_at = now() WHERE id = $1`, [barisId]);
    await audit.catat({ penggunaId: pengguna.id, aksi: `hapus_${jenis}`, entitas: 'karyawan', entitasId: karyawanId, sebelum: rows[0] }, c);
  });
}

module.exports = { daftar, tambah, hapus };
