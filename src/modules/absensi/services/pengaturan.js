// Pengaturan absensi: jadwal kerja (bertanggal berlaku), hari libur, dan masa simpan foto.
// Jadwal baru hanya boleh berlaku mulai hari ini ke depan agar perhitungan masa lalu tidak berubah.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const audit = require('../../pengguna/services/audit');
const { tanggalValid } = require('../../karyawan/services/format');
const { menitDariJam } = require('./waktu');
const kunciGaji = require('../../penggajian/services/kunci');

const KUNCI_RETENSI = 'retensi_foto_absensi_bulan';
const HARI_INI_SQL = "(now() AT TIME ZONE 'Asia/Jakarta')::date";

function pastikanPengelola(pengguna) {
  if (!['admin', 'hr'].includes(pengguna.peran)) throw new GalatBisnis('Anda tidak berhak melakukan tindakan ini.', 403);
}

async function daftarJadwal() {
  const { rows } = await db.query(
    `SELECT id, tanggal_berlaku, to_char(jam_masuk, 'HH24:MI') AS jam_masuk, to_char(jam_pulang, 'HH24:MI') AS jam_pulang,
            toleransi_menit, hari_kerja, ${HARI_INI_SQL} AS hari_ini,
            (id = (SELECT x.id FROM jadwal_kerja x WHERE x.deleted_at IS NULL AND x.tanggal_berlaku <= ${HARI_INI_SQL}
                    ORDER BY x.tanggal_berlaku DESC LIMIT 1)) AS berlaku
       FROM jadwal_kerja WHERE deleted_at IS NULL ORDER BY tanggal_berlaku DESC`);
  return rows;
}

// Untuk perhitungan: jam dalam bentuk 'HH:MM' dan hari_kerja sebagai angka.
async function jadwalUntukHitung() {
  const { rows } = await db.query(
    `SELECT tanggal_berlaku, to_char(jam_masuk, 'HH24:MI') AS jam_masuk, to_char(jam_pulang, 'HH24:MI') AS jam_pulang,
            toleransi_menit, hari_kerja FROM jadwal_kerja WHERE deleted_at IS NULL ORDER BY tanggal_berlaku`);
  return rows.map((r) => ({ ...r, hari_kerja: r.hari_kerja.map(Number) }));
}

function bacaJam(nilai, label) {
  const v = String(nilai || '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new GalatBisnis(`${label} tidak valid (format HH:MM).`);
  return v;
}

async function tambahJadwal(pengguna, input) {
  pastikanPengelola(pengguna);
  const tanggal = String(input.tanggal_berlaku || '').trim();
  if (!tanggalValid(tanggal)) throw new GalatBisnis('Tanggal berlaku tidak valid.');
  const masuk = bacaJam(input.jam_masuk, 'Jam masuk');
  const pulang = bacaJam(input.jam_pulang, 'Jam pulang');
  if (menitDariJam(pulang) <= menitDariJam(masuk)) throw new GalatBisnis('Jam pulang harus setelah jam masuk.');
  const tol = String(input.toleransi_menit === undefined || input.toleransi_menit === '' ? '0' : input.toleransi_menit).trim();
  if (!/^\d{1,3}$/.test(tol) || Number(tol) > 240) throw new GalatBisnis('Toleransi harus 0-240 menit.');
  const hariMentah = [].concat(input.hari_kerja || []).map(String);
  const hari = [...new Set(hariMentah)].filter((h) => /^[1-7]$/.test(h)).map(Number).sort();
  if (!hari.length || hari.length !== new Set(hariMentah).size) throw new GalatBisnis('Pilih minimal satu hari kerja yang valid.');

  try {
    await db.transaksi(async (c) => {
      const { rows } = await c.query(`SELECT ${HARI_INI_SQL} AS hari_ini`);
      if (tanggal < rows[0].hari_ini) throw new GalatBisnis('Jadwal baru tidak boleh berlaku surut. Pilih hari ini atau sesudahnya.');
      const { rows: baru } = await c.query(
        `INSERT INTO jadwal_kerja (tanggal_berlaku, jam_masuk, jam_pulang, toleransi_menit, hari_kerja)
         VALUES ($1, $2, $3, $4, $5::smallint[]) RETURNING id`, [tanggal, masuk, pulang, Number(tol), hari]);
      await audit.catat({
        penggunaId: pengguna.id, aksi: 'tambah_jadwal', entitas: 'pengaturan.jadwal_kerja', entitasId: baru[0].id,
        sesudah: { tanggal_berlaku: tanggal, jam_masuk: masuk, jam_pulang: pulang, toleransi_menit: Number(tol), hari_kerja: hari },
      }, c);
    });
  } catch (err) {
    if (err.code === '23505') throw new GalatBisnis('Sudah ada jadwal yang berlaku pada tanggal tersebut.', 409);
    throw err;
  }
}

// Hanya jadwal yang belum berlaku yang boleh dihapus, dan jadwal terakhir tidak boleh hilang.
async function hapusJadwal(pengguna, id) {
  pastikanPengelola(pengguna);
  await db.transaksi(async (c) => {
    const { rows } = await c.query(
      `SELECT *, ${HARI_INI_SQL} AS hari_ini FROM jadwal_kerja WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
    if (!rows[0]) throw new GalatBisnis('Jadwal tidak ditemukan.', 404);
    if (rows[0].tanggal_berlaku <= rows[0].hari_ini) {
      throw new GalatBisnis('Jadwal yang sudah berlaku tidak dapat dihapus; tambahkan jadwal baru sebagai gantinya.', 409);
    }
    await c.query('UPDATE jadwal_kerja SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
    await audit.catat({ penggunaId: pengguna.id, aksi: 'hapus_jadwal', entitas: 'pengaturan.jadwal_kerja', entitasId: id, sebelum: { tanggal_berlaku: rows[0].tanggal_berlaku } }, c);
  });
}

async function daftarLibur(tahun) {
  const { rows } = await db.query(
    `SELECT id, tanggal, keterangan FROM hari_libur
      WHERE deleted_at IS NULL AND tanggal >= make_date($1, 1, 1) AND tanggal <= make_date($1, 12, 31) ORDER BY tanggal`, [tahun]);
  return rows;
}

async function liburDalamRentang(awal, akhir) {
  const { rows } = await db.query(
    'SELECT tanggal FROM hari_libur WHERE deleted_at IS NULL AND tanggal BETWEEN $1 AND $2', [awal, akhir]);
  return new Set(rows.map((r) => r.tanggal));
}

async function tambahLibur(pengguna, input) {
  pastikanPengelola(pengguna);
  const tanggal = String(input.tanggal || '').trim();
  const keterangan = String(input.keterangan || '').trim();
  if (!tanggalValid(tanggal)) throw new GalatBisnis('Tanggal tidak valid.');
  if (!keterangan) throw new GalatBisnis('Keterangan wajib diisi.');
  if (keterangan.length > 200) throw new GalatBisnis('Keterangan maksimal 200 karakter.');
  try {
    await db.transaksi(async (c) => {
      await kunciGaji.pastikanTanggalBelumTerkunci(c, tanggal, 'Hari libur ini');
      const { rows } = await c.query('INSERT INTO hari_libur (tanggal, keterangan) VALUES ($1, $2) RETURNING id', [tanggal, keterangan]);
      await audit.catat({ penggunaId: pengguna.id, aksi: 'tambah_libur', entitas: 'pengaturan.hari_libur', entitasId: rows[0].id, sesudah: { tanggal, keterangan } }, c);
    });
  } catch (err) {
    if (err.code === '23505') throw new GalatBisnis('Tanggal tersebut sudah terdaftar sebagai hari libur.', 409);
    throw err;
  }
}

async function hapusLibur(pengguna, id) {
  pastikanPengelola(pengguna);
  await db.transaksi(async (c) => {
    const { rows } = await c.query('SELECT tanggal, keterangan FROM hari_libur WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!rows[0]) throw new GalatBisnis('Hari libur tidak ditemukan.', 404);
    await kunciGaji.pastikanTanggalBelumTerkunci(c, rows[0].tanggal, 'Hari libur ini');
    await c.query('UPDATE hari_libur SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
    await audit.catat({ penggunaId: pengguna.id, aksi: 'hapus_libur', entitas: 'pengaturan.hari_libur', entitasId: id, sebelum: rows[0] }, c);
  });
}

async function ambilRetensi(exec = db) {
  const { rows } = await exec.query('SELECT nilai FROM pengaturan_sistem WHERE kunci = $1 AND deleted_at IS NULL', [KUNCI_RETENSI]);
  const n = rows[0] ? Number(rows[0].nilai) : NaN;
  if (!Number.isInteger(n) || n < 1) throw new Error('Pengaturan masa simpan foto absensi tidak valid.');
  return n;
}

async function ubahRetensi(pengguna, nilai) {
  if (pengguna.peran !== 'admin') throw new GalatBisnis('Hanya administrator yang dapat mengubah masa simpan foto.', 403);
  const teks = String(nilai || '').trim();
  if (!/^\d{1,2}$/.test(teks) || Number(teks) < 1 || Number(teks) > 60) throw new GalatBisnis('Masa simpan harus 1-60 bulan.');
  await db.transaksi(async (c) => {
    const lama = await ambilRetensi(c);
    await c.query('UPDATE pengaturan_sistem SET nilai = $1, updated_at = now() WHERE kunci = $2', [teks, KUNCI_RETENSI]);
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'ubah_pengaturan', entitas: 'pengaturan.sistem', entitasId: KUNCI_RETENSI,
      sebelum: { nilai: lama }, sesudah: { nilai: Number(teks) },
    }, c);
  });
}

module.exports = {
  daftarJadwal, jadwalUntukHitung, tambahJadwal, hapusJadwal, daftarLibur, liburDalamRentang,
  tambahLibur, hapusLibur, ambilRetensi, ubahRetensi,
};
