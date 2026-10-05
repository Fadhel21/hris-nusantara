// Logika bersama cuti dan izin: validasi rentang tanggal, hitung hari kerja, cegah tumpang tindih.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const { tanggalValid } = require('../../karyawan/services/format');
const pengaturan = require('../../absensi/services/pengaturan');
const { hariDihitung } = require('./hitung');

const MAKS_RENTANG_HARI = 366;

function selisihHari(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

// Membaca tanggal mulai/akhir dari formulir. Mengembalikan { mulai, akhir }.
function bacaRentang(input) {
  const mulai = String(input.tanggal_mulai || '').trim();
  const akhir = String(input.tanggal_akhir || '').trim() || mulai;
  if (!tanggalValid(mulai)) throw new GalatBisnis('Tanggal mulai tidak valid.');
  if (!tanggalValid(akhir)) throw new GalatBisnis('Tanggal akhir tidak valid.');
  if (akhir < mulai) throw new GalatBisnis('Tanggal akhir tidak boleh sebelum tanggal mulai.');
  if (selisihHari(mulai, akhir) >= MAKS_RENTANG_HARI) throw new GalatBisnis(`Rentang maksimal ${MAKS_RENTANG_HARI} hari.`);
  return { mulai, akhir };
}

function bacaAlasan(input, wajib = true) {
  const alasan = String(input.alasan || '').trim();
  if (wajib && !alasan) throw new GalatBisnis('Alasan wajib diisi.');
  if (alasan.length > 500) throw new GalatBisnis('Alasan maksimal 500 karakter.');
  return alasan || null;
}

// Mengunci baris karyawan (serialisasi per karyawan) dan memastikan masih aktif.
async function kunciKaryawanAktif(c, karyawanId) {
  const { rows } = await c.query('SELECT status, tanggal_masuk FROM karyawan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [karyawanId]);
  if (!rows[0]) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
  if (rows[0].status !== 'aktif') throw new GalatBisnis('Karyawan yang sudah keluar tidak dapat mengajukan.', 409);
  return rows[0];
}

// Menghitung hari kerja non-libur dalam rentang, memeriksa masa kerja dan tumpang tindih.
async function siapkanHari(c, karyawanId, karyawan, { mulai, akhir }) {
  if (mulai < karyawan.tanggal_masuk) throw new GalatBisnis('Tanggal tidak boleh sebelum tanggal masuk karyawan.');
  const [jadwal, libur] = await Promise.all([pengaturan.jadwalUntukHitung(), pengaturan.liburDalamRentang(mulai, akhir)]);
  const hari = hariDihitung({ mulai, akhir, jadwal, libur });
  if (!hari.length) throw new GalatBisnis('Rentang tanggal tidak mencakup hari kerja (akhir pekan/hari libur).');
  const { rows } = await c.query(
    `SELECT h.tanggal, h.jenis FROM ketidakhadiran_hari h
      WHERE h.karyawan_id = $1 AND h.tanggal = ANY($2::date[]) AND h.deleted_at IS NULL ORDER BY h.tanggal LIMIT 1`, [karyawanId, hari]);
  if (rows[0]) {
    throw new GalatBisnis(`Tanggal ${rows[0].tanggal} bertumpang tindih dengan pengajuan ${rows[0].jenis} lain yang masih aktif.`, 409);
  }
  return hari;
}

async function simpanHari(c, pengajuanId, karyawanId, jenis, hari) {
  await c.query(
    `INSERT INTO ketidakhadiran_hari (pengajuan_id, karyawan_id, tanggal, jenis)
     SELECT $1::bigint, $2::bigint, t, $3::text FROM unnest($4::date[]) AS t`, [pengajuanId, karyawanId, jenis, hari]);
}

// Melepas hari-hari pengajuan (ditolak/dibatalkan) agar dapat dipakai pengajuan lain.
async function lepasHari(c, pengajuanId) {
  await c.query('UPDATE ketidakhadiran_hari SET deleted_at = now(), updated_at = now() WHERE pengajuan_id = $1 AND deleted_at IS NULL', [pengajuanId]);
}

async function daftarHari(exec, pengajuanId) {
  const { rows } = await exec.query(
    'SELECT tanggal FROM ketidakhadiran_hari WHERE pengajuan_id = $1 AND deleted_at IS NULL ORDER BY tanggal', [pengajuanId]);
  return rows.map((r) => r.tanggal);
}

function terjemahkanTumpangTindih(err) {
  if (err.code === '23505' && err.constraint === 'ketidakhadiran_uq') {
    return new GalatBisnis('Tanggal pengajuan bertumpang tindih dengan pengajuan cuti/izin lain yang masih aktif.', 409);
  }
  return err;
}

async function hariIni(exec = db) {
  const { rows } = await exec.query("SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS t");
  return rows[0].t;
}

module.exports = {
  bacaRentang, bacaAlasan, kunciKaryawanAktif, siapkanHari, simpanHari, lepasHari, daftarHari, terjemahkanTumpangTindih, hariIni,
};
