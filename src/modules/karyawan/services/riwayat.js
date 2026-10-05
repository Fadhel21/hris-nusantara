// Riwayat bertanggal: penempatan (cabang/departemen/jabatan/golongan/atasan), gaji pokok, kontrak.
// Riwayat tidak pernah ditimpa; perubahan = baris baru dengan tanggal berlaku. Baris keliru boleh
// dihapus (soft delete, tercatat di audit), tetapi minimal satu baris penempatan/gaji harus tersisa.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const audit = require('../../pengguna/services/audit');
const akses = require('./akses');
const validasi = require('./validasi');
const kunciGaji = require('../../penggajian/services/kunci');

const JENIS = {
  penempatan: { tabel: 'riwayat_penempatan', kolomTanggal: 'tanggal_berlaku', sisaMinimal: 1, label: 'penempatan' },
  gaji: { tabel: 'riwayat_gaji', kolomTanggal: 'tanggal_berlaku', sisaMinimal: 1, label: 'gaji' },
  kontrak: { tabel: 'riwayat_kontrak', kolomTanggal: 'tanggal_mulai', sisaMinimal: 0, label: 'kontrak' },
};

async function daftarPenempatan(karyawanId) {
  const { rows } = await db.query(
    `SELECT r.id, r.tanggal_berlaku, c.nama AS cabang, d.nama AS departemen, j.nama AS jabatan,
            g.nama AS golongan, a.nomor_induk AS atasan_nomor, a.nama AS atasan,
            (r.id = (SELECT x.id FROM riwayat_penempatan x
                      WHERE x.karyawan_id = r.karyawan_id AND x.deleted_at IS NULL AND x.tanggal_berlaku <= CURRENT_DATE
                      ORDER BY x.tanggal_berlaku DESC, x.id DESC LIMIT 1)) AS berlaku
       FROM riwayat_penempatan r
       JOIN cabang c ON c.id = r.cabang_id
       JOIN departemen d ON d.id = r.departemen_id
       JOIN jabatan j ON j.id = r.jabatan_id
       LEFT JOIN golongan g ON g.id = r.golongan_id
       LEFT JOIN karyawan a ON a.id = r.atasan_id
      WHERE r.karyawan_id = $1 AND r.deleted_at IS NULL
      ORDER BY r.tanggal_berlaku DESC, r.id DESC`, [karyawanId]);
  return rows;
}

async function daftarGaji(karyawanId) {
  const { rows } = await db.query(
    `SELECT id, tanggal_berlaku, gaji_pokok, alasan,
            (id = (SELECT x.id FROM riwayat_gaji x
                    WHERE x.karyawan_id = riwayat_gaji.karyawan_id AND x.deleted_at IS NULL AND x.tanggal_berlaku <= CURRENT_DATE
                    ORDER BY x.tanggal_berlaku DESC, x.id DESC LIMIT 1)) AS berlaku
       FROM riwayat_gaji WHERE karyawan_id = $1 AND deleted_at IS NULL
      ORDER BY tanggal_berlaku DESC, id DESC`, [karyawanId]);
  return rows;
}

async function daftarKontrak(karyawanId) {
  const { rows } = await db.query(
    `SELECT id, jenis, tanggal_mulai, tanggal_akhir FROM riwayat_kontrak
      WHERE karyawan_id = $1 AND deleted_at IS NULL ORDER BY tanggal_mulai DESC, id DESC`, [karyawanId]);
  return rows;
}

async function ada(exec, tabel, id, ekstra = '') {
  const { rowCount } = await exec.query(`SELECT 1 FROM ${tabel} WHERE id = $1 AND deleted_at IS NULL${ekstra}`, [id]);
  return rowCount > 0;
}

// Apakah `kandidat` termasuk bawahan (langsung/tidak langsung) dari `karyawanId` saat ini?
async function adalahBawahan(exec, karyawanId, kandidat) {
  const { rowCount } = await exec.query(
    `WITH RECURSIVE bawahan AS (
       SELECT s.karyawan_id FROM ${akses.PENEMPATAN_SAAT_INI} s WHERE s.atasan_id = $1
       UNION
       SELECT s.karyawan_id FROM ${akses.PENEMPATAN_SAAT_INI} s JOIN bawahan b ON s.atasan_id = b.karyawan_id
     ) SELECT 1 FROM bawahan WHERE karyawan_id = $2`, [karyawanId, kandidat]);
  return rowCount > 0;
}

// karyawanId null saat karyawan baru dibuat (belum punya bawahan).
async function periksaRujukanPenempatan(exec, karyawanId, p) {
  if (!(await ada(exec, 'cabang', p.cabang_id))) throw new GalatBisnis('Cabang tidak ditemukan.');
  if (!(await ada(exec, 'departemen', p.departemen_id))) throw new GalatBisnis('Departemen tidak ditemukan.');
  if (!(await ada(exec, 'jabatan', p.jabatan_id))) throw new GalatBisnis('Jabatan tidak ditemukan.');
  if (p.golongan_id && !(await ada(exec, 'golongan', p.golongan_id))) throw new GalatBisnis('Golongan tidak ditemukan.');
  if (p.atasan_id) {
    if (!(await ada(exec, 'karyawan', p.atasan_id, " AND status = 'aktif'"))) throw new GalatBisnis('Atasan tidak ditemukan atau sudah keluar.');
    if (karyawanId !== null) {
      if (String(p.atasan_id) === String(karyawanId)) throw new GalatBisnis('Karyawan tidak boleh menjadi atasan dirinya sendiri.');
      if (await adalahBawahan(exec, karyawanId, p.atasan_id)) throw new GalatBisnis('Atasan tidak boleh berupa bawahan karyawan ini (rantai atasan melingkar).');
    }
  }
}

async function sisipPenempatan(c, karyawanId, tanggal, p) {
  await c.query(
    `INSERT INTO riwayat_penempatan (karyawan_id, tanggal_berlaku, cabang_id, departemen_id, jabatan_id, golongan_id, atasan_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [karyawanId, tanggal, p.cabang_id, p.departemen_id, p.jabatan_id, p.golongan_id, p.atasan_id]);
}

async function sisipGaji(c, karyawanId, tanggal, gajiPokok, alasan) {
  await c.query(
    'INSERT INTO riwayat_gaji (karyawan_id, tanggal_berlaku, gaji_pokok, alasan) VALUES ($1, $2, $3, $4)',
    [karyawanId, tanggal, gajiPokok, alasan]);
}

async function sisipKontrak(c, karyawanId, k) {
  await c.query(
    'INSERT INTO riwayat_kontrak (karyawan_id, jenis, tanggal_mulai, tanggal_akhir) VALUES ($1, $2, $3, $4)',
    [karyawanId, k.jenis, k.tanggal_mulai, k.tanggal_akhir]);
}

// Memastikan karyawan aktif & tanggal tidak sebelum tanggal masuk; mengunci barisnya.
async function kunciKaryawan(c, karyawanId, tanggal) {
  const { rows } = await c.query('SELECT status, tanggal_masuk FROM karyawan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [karyawanId]);
  if (!rows[0]) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
  if (rows[0].status !== 'aktif') throw new GalatBisnis('Karyawan sudah keluar; riwayat tidak dapat ditambah.', 409);
  if (tanggal < rows[0].tanggal_masuk) throw new GalatBisnis('Tanggal tidak boleh sebelum tanggal masuk karyawan.');
}

function terjemahkan(err, jenis) {
  if (err.code === '23505') return new GalatBisnis(`Sudah ada riwayat ${JENIS[jenis].label} pada tanggal tersebut.`, 409);
  return err;
}

async function tambahPenempatan(pengguna, karyawanId, input) {
  akses.pastikanPengelola(pengguna);
  const { nilai, galat } = validasi.penempatan(input);
  if (galat.length) throw new GalatBisnis(galat.join(' '));
  try {
    await db.transaksi(async (c) => {
      await kunciKaryawan(c, karyawanId, nilai.tanggal_berlaku);
      await periksaRujukanPenempatan(c, karyawanId, nilai);
      await sisipPenempatan(c, karyawanId, nilai.tanggal_berlaku, nilai);
      await audit.catat({ penggunaId: pengguna.id, aksi: 'tambah_penempatan', entitas: 'karyawan', entitasId: karyawanId, sesudah: nilai }, c);
    });
  } catch (err) { throw terjemahkan(err, 'penempatan'); }
}

async function tambahGaji(pengguna, karyawanId, input) {
  akses.pastikanPengelola(pengguna);
  const { nilai, galat } = validasi.gaji(input);
  if (galat.length) throw new GalatBisnis(galat.join(' '));
  try {
    await db.transaksi(async (c) => {
      await kunciKaryawan(c, karyawanId, nilai.tanggal_berlaku);
      await kunciGaji.pastikanBelumTerkunci(c, nilai.tanggal_berlaku, 'Gaji pokok ini');
      await sisipGaji(c, karyawanId, nilai.tanggal_berlaku, nilai.gaji_pokok, nilai.alasan);
      await audit.catat({ penggunaId: pengguna.id, aksi: 'tambah_gaji', entitas: 'karyawan', entitasId: karyawanId, sesudah: nilai }, c);
    });
  } catch (err) { throw terjemahkan(err, 'gaji'); }
}

async function tambahKontrak(pengguna, karyawanId, input) {
  akses.pastikanPengelola(pengguna);
  const { nilai, galat } = validasi.kontrak(input);
  if (galat.length) throw new GalatBisnis(galat.join(' '));
  try {
    await db.transaksi(async (c) => {
      await kunciKaryawan(c, karyawanId, nilai.tanggal_mulai);
      await sisipKontrak(c, karyawanId, nilai);
      await audit.catat({ penggunaId: pengguna.id, aksi: 'tambah_kontrak', entitas: 'karyawan', entitasId: karyawanId, sesudah: nilai }, c);
    });
  } catch (err) { throw terjemahkan(err, 'kontrak'); }
}

async function hapus(pengguna, karyawanId, jenis, riwayatId) {
  akses.pastikanPengelola(pengguna);
  const def = JENIS[jenis];
  if (!def) throw new GalatBisnis('Jenis riwayat tidak dikenal.', 404);
  await db.transaksi(async (c) => {
    const { rows } = await c.query(
      `SELECT * FROM ${def.tabel} WHERE id = $1 AND karyawan_id = $2 AND deleted_at IS NULL FOR UPDATE`, [riwayatId, karyawanId]);
    if (!rows[0]) throw new GalatBisnis('Riwayat tidak ditemukan.', 404);
    if (jenis === 'gaji') await kunciGaji.pastikanBelumTerkunci(c, rows[0].tanggal_berlaku, 'Gaji pokok ini');
    const { rows: hitung } = await c.query(
      `SELECT count(*)::int AS n FROM ${def.tabel} WHERE karyawan_id = $1 AND deleted_at IS NULL`, [karyawanId]);
    if (hitung[0].n <= def.sisaMinimal) throw new GalatBisnis(`Riwayat ${def.label} terakhir tidak dapat dihapus.`, 409);
    await c.query(`UPDATE ${def.tabel} SET deleted_at = now(), updated_at = now() WHERE id = $1`, [riwayatId]);
    await audit.catat({ penggunaId: pengguna.id, aksi: `hapus_${jenis}`, entitas: 'karyawan', entitasId: karyawanId, sebelum: rows[0] }, c);
  });
}

module.exports = {
  daftarPenempatan, daftarGaji, daftarKontrak, periksaRujukanPenempatan,
  sisipPenempatan, sisipGaji, sisipKontrak, tambahPenempatan, tambahGaji, tambahKontrak, hapus,
};
