// Perhitungan hari cuti/izin. Fungsi murni (tanpa DB).
// Hanya hari kerja menurut jadwal yang berlaku pada tanggal itu, dan bukan hari libur, yang dihitung.
const { daftarTanggal, jadwalBerlaku, hariKe } = require('../../absensi/services/waktu');

// Mengembalikan daftar tanggal ('YYYY-MM-DD') yang dihitung dalam rentang [mulai, akhir].
function hariDihitung({ mulai, akhir, jadwal, libur }) {
  return daftarTanggal(mulai, akhir).filter((t) => {
    const j = jadwalBerlaku(jadwal, t);
    return !!j && j.hari_kerja.includes(hariKe(t)) && !libur.has(t);
  });
}

// Mengelompokkan tanggal per tahun: { 2026: 3, 2027: 2 }. Saldo cuti dikelola per tahun.
function perTahun(tanggal) {
  const hasil = {};
  for (const t of tanggal) {
    const tahun = Number(t.slice(0, 4));
    hasil[tahun] = (hasil[tahun] || 0) + 1;
  }
  return hasil;
}

module.exports = { hariDihitung, perTahun };
