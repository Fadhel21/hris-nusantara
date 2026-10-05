// Hak akses data karyawan di tingkat service:
//   admin/hr -> semua; atasan -> dirinya + seluruh bawahan (langsung maupun tidak langsung);
//   lainnya -> hanya dirinya sendiri. Dipakai ulang oleh modul lain (absensi, cuti, dst.).
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');

// Penempatan yang berlaku hari ini untuk tiap karyawan.
const PENEMPATAN_SAAT_INI = `(
  SELECT DISTINCT ON (karyawan_id) karyawan_id, atasan_id, cabang_id, departemen_id, jabatan_id, golongan_id
    FROM riwayat_penempatan
   WHERE deleted_at IS NULL AND tanggal_berlaku <= CURRENT_DATE
   ORDER BY karyawan_id, tanggal_berlaku DESC, id DESC)`;

const semuaData = (pengguna) => pengguna.peran === 'admin' || pengguna.peran === 'hr';

// Menambahkan parameter ke `params` dan mengembalikan potongan WHERE untuk alias karyawan `k`.
function kondisiAkses(pengguna, params, alias = 'k') {
  if (semuaData(pengguna)) return 'TRUE';
  if (!pengguna.karyawanId) return 'FALSE';
  params.push(pengguna.karyawanId);
  const n = `$${params.length}`;
  if (pengguna.peran === 'atasan') {
    return `(${alias}.id = ${n} OR ${alias}.id IN (
      WITH RECURSIVE bawahan AS (
        SELECT s.karyawan_id FROM ${PENEMPATAN_SAAT_INI} s WHERE s.atasan_id = ${n}
        UNION
        SELECT s.karyawan_id FROM ${PENEMPATAN_SAAT_INI} s JOIN bawahan b ON s.atasan_id = b.karyawan_id
      ) SELECT karyawan_id FROM bawahan))`;
  }
  return `${alias}.id = ${n}`;
}

// Melempar 404 (bukan 403) agar keberadaan data orang lain tidak bocor.
async function pastikanBolehLihat(pengguna, karyawanId, exec = db) {
  const params = [karyawanId];
  const kondisi = kondisiAkses(pengguna, params);
  const { rowCount } = await exec.query(
    `SELECT 1 FROM karyawan k WHERE k.id = $1 AND k.deleted_at IS NULL AND ${kondisi}`, params);
  if (!rowCount) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
}

// NIK, NPWP, rekening tampil utuh hanya untuk admin/HR dan pemilik datanya.
function bolehLihatSensitif(pengguna, karyawanId) {
  return semuaData(pengguna) || String(pengguna.karyawanId) === String(karyawanId);
}

function pastikanPengelola(pengguna) {
  if (!semuaData(pengguna)) throw new GalatBisnis('Anda tidak berhak melakukan tindakan ini.', 403);
}

module.exports = { PENEMPATAN_SAAT_INI, kondisiAkses, pastikanBolehLihat, bolehLihatSensitif, pastikanPengelola, semuaData };
