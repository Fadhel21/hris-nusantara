// Perhitungan upah lembur. Fungsi murni (tanpa DB), uang dalam sen (BigInt).
//   upah sejam = upah sebulan / pembagi; tiap tahap menit dikalikan pengalinya.
// Pengali, pembagi, dan batasnya dibaca dari tabel pengaturan (bertanggal berlaku), bukan ditulis mati di sini.
// Satu-satunya angka tetap adalah PRESET_KEPMENAKER, yang hanya dipakai bila pemilik menekan tombol
// "Terapkan aturan Kepmenaker 102/2004" (pemilik wajib memverifikasinya dengan teks resmi).
const uang = require('./uang');
const { jadwalBerlaku, hariKe } = require('../../absensi/services/waktu');

const TIPE_HARI = {
  hari_kerja: 'Hari kerja',
  libur_5hari: 'Hari libur (5 hari kerja/minggu)',
  libur_6hari: 'Hari libur (6 hari kerja/minggu)',
};

// Kepmenaker 102/2004: hari kerja 1,5x jam pertama lalu 2x; hari libur 5 hari kerja: 2x delapan jam pertama, 3x jam kesembilan,
// 4x jam kesepuluh dst.; hari libur 6 hari kerja: 2x tujuh jam pertama, 3x jam kedelapan, 4x jam kesembilan dst. Pembagi 173.
const PRESET_KEPMENAKER = {
  pembagi: '173',
  aturan: [
    { tipe_hari: 'hari_kerja', menit_dari: 0, menit_sampai: 60, pengali: '1.50' },
    { tipe_hari: 'hari_kerja', menit_dari: 60, menit_sampai: null, pengali: '2.00' },
    { tipe_hari: 'libur_5hari', menit_dari: 0, menit_sampai: 480, pengali: '2.00' },
    { tipe_hari: 'libur_5hari', menit_dari: 480, menit_sampai: 540, pengali: '3.00' },
    { tipe_hari: 'libur_5hari', menit_dari: 540, menit_sampai: null, pengali: '4.00' },
    { tipe_hari: 'libur_6hari', menit_dari: 0, menit_sampai: 420, pengali: '2.00' },
    { tipe_hari: 'libur_6hari', menit_dari: 420, menit_sampai: 480, pengali: '3.00' },
    { tipe_hari: 'libur_6hari', menit_dari: 480, menit_sampai: null, pengali: '4.00' },
  ],
};

// Jenis hari untuk tanggal tertentu menurut jadwal kerja yang berlaku pada tanggal itu dan daftar libur.
function tipeHari({ tanggal, jadwal, libur }) {
  const j = jadwalBerlaku(jadwal, tanggal);
  const hariKerja = !!j && j.hari_kerja.includes(hariKe(tanggal)) && !libur.has(tanggal);
  if (hariKerja) return 'hari_kerja';
  return j && j.hari_kerja.length >= 6 ? 'libur_6hari' : 'libur_5hari';
}

// Aturan satu tipe hari harus lengkap: mulai dari 0, bersambung tanpa celah/tumpang tindih, dan berakhir terbuka.
// Mengembalikan pesan galat atau null.
function periksaAturan(tahap) {
  if (!tahap.length) return 'belum diisi';
  const urut = [...tahap].sort((a, b) => a.menit_dari - b.menit_dari);
  if (urut[0].menit_dari !== 0) return 'tahap pertama harus mulai dari menit 0';
  for (let i = 0; i < urut.length - 1; i += 1) {
    if (urut[i].menit_sampai === null || urut[i].menit_sampai === undefined) return 'ada tahap terbuka sebelum tahap terakhir';
    if (urut[i].menit_sampai !== urut[i + 1].menit_dari) return `tahap tidak bersambung (menit ${urut[i].menit_sampai} s.d. ${urut[i + 1].menit_dari})`;
  }
  const akhir = urut[urut.length - 1];
  if (akhir.menit_sampai !== null && akhir.menit_sampai !== undefined) return 'tahap terakhir harus terbuka (tanpa batas atas)';
  return null;
}

// pengali '1.50' -> 150n (skala 100)
function keSkala(pengali) {
  const [b, d = ''] = String(pengali).split('.');
  return BigInt(b) * 100n + BigInt(d.padEnd(2, '0').slice(0, 2));
}

// Upah lembur (sen) untuk `menit` menit lembur. dasarSen = upah sebulan (sen); pembagi = bilangan bulat > 0.
function upahLembur({ menit, tahap, dasarSen, pembagi }) {
  const galat = periksaAturan(tahap);
  if (galat) throw new Error(`Aturan lembur tidak lengkap: ${galat}.`);
  if (!Number.isInteger(pembagi) || pembagi <= 0) throw new Error('Pembagi upah per jam tidak valid.');
  let total = 0n;
  for (const t of tahap) {
    const batas = t.menit_sampai === null || t.menit_sampai === undefined ? Infinity : t.menit_sampai;
    const dalam = Math.max(0, Math.min(menit, batas) - t.menit_dari);
    if (dalam > 0) total += uang.bagiBulat(dasarSen * keSkala(t.pengali) * BigInt(dalam), BigInt(pembagi) * 60n * 100n);
  }
  return total;
}

// Aturan yang berlaku pada tanggal: untuk tiap tipe hari, seluruh tahap dengan tanggal_berlaku terbaru <= tanggal.
function aturanBerlaku(semua, tipe, tanggal) {
  const kandidat = semua.filter((a) => a.tipe_hari === tipe && a.tanggal_berlaku <= tanggal);
  if (!kandidat.length) return [];
  const terbaru = kandidat.reduce((m, a) => (a.tanggal_berlaku > m ? a.tanggal_berlaku : m), '0000-00-00');
  return kandidat.filter((a) => a.tanggal_berlaku === terbaru);
}

function menitKeTeks(menit) {
  const j = Math.floor(menit / 60);
  const m = menit % 60;
  return `${j} jam${m ? ` ${m} menit` : ''}`;
}

module.exports = { TIPE_HARI, PRESET_KEPMENAKER, tipeHari, periksaAturan, upahLembur, aturanBerlaku, menitKeTeks, keSkala };
