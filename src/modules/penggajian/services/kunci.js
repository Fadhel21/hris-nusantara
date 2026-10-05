// Penjaga periode terkunci: data yang memengaruhi gaji pada periode yang sudah dikunci tidak boleh
// diubah surut. Koreksi dilakukan lewat penyesuaian di periode berikutnya (atau buka kunci dengan persetujuan).
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');

// Apakah tanggal berada di dalam periode gaji yang terkunci?
async function tanggalTerkunci(exec, tanggal) {
  const { rowCount } = await exec.query(
    `SELECT 1 FROM periode_gaji WHERE status = 'terkunci' AND deleted_at IS NULL AND $1::date BETWEEN tanggal_awal AND tanggal_akhir`, [tanggal]);
  return rowCount > 0;
}

// Tanggal berlaku data berriwayat (gaji, komponen, tarif) tidak boleh jatuh pada/sebelum akhir periode terkunci terakhir,
// karena dapat mengubah hasil hitung ulang periode itu.
async function pastikanBelumTerkunci(exec = db, tanggal, apa = 'Data ini') {
  const { rows } = await exec.query(
    `SELECT tahun, bulan FROM periode_gaji WHERE status = 'terkunci' AND deleted_at IS NULL AND tanggal_akhir >= $1::date
      ORDER BY tanggal_akhir DESC LIMIT 1`, [tanggal]);
  if (rows[0]) {
    throw new GalatBisnis(
      `${apa} berlaku pada/sebelum periode gaji ${String(rows[0].bulan).padStart(2, '0')}/${rows[0].tahun} yang sudah dikunci. ` +
      'Gunakan tanggal berlaku sesudah periode itu, atau koreksi lewat penyesuaian pada periode berikutnya.', 409);
  }
}

// Untuk data bertanggal tunggal (hari libur, koreksi absensi).
async function pastikanTanggalBelumTerkunci(exec = db, tanggal, apa = 'Perubahan ini') {
  if (await tanggalTerkunci(exec, tanggal)) {
    throw new GalatBisnis(`${apa} jatuh pada periode gaji yang sudah dikunci (tanggal ${tanggal}). Koreksi lewat penyesuaian pada periode berikutnya.`, 409);
  }
}

module.exports = { tanggalTerkunci, pastikanBelumTerkunci, pastikanTanggalBelumTerkunci };
