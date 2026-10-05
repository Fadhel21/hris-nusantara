// Fungsi murni untuk format tampilan, penyamaran data sensitif, dan pemeriksaan tanggal/uang.

// Menyamarkan semua karakter kecuali empat terakhir. Kosong tetap kosong.
function samarkan(nilai) {
  if (nilai === null || nilai === undefined || nilai === '') return '';
  const s = String(nilai);
  if (s.length <= 4) return '*'.repeat(s.length);
  return '*'.repeat(s.length - 4) + s.slice(-4);
}

// Teks uang (mis. '5000000.5') -> 'Rp 5.000.000,50'. Tanpa float.
function rupiah(teks) {
  if (teks === null || teks === undefined || teks === '') return '';
  const [bulat, desimal = ''] = String(teks).split('.');
  return `Rp ${bulat.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${desimal.padEnd(2, '0').slice(0, 2)}`;
}

// 'YYYY-MM-DD' -> 'DD-MM-YYYY'
function tanggal(teks) {
  if (!teks) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(teks));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(teks);
}

// Tanggal kalender yang benar (menolak 2026-02-30).
function tanggalValid(teks) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(teks);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

// Uang: hanya digit dengan maksimal 2 desimal, titik sebagai pemisah desimal.
function uangValid(teks) {
  return /^\d{1,13}(\.\d{1,2})?$/.test(teks);
}

function hariIni() {
  return new Date().toISOString().slice(0, 10);
}

function formatNomorInduk(tahun, urutan) {
  return `${tahun}-${String(urutan).padStart(4, '0')}`;
}

module.exports = { samarkan, rupiah, tanggal, tanggalValid, uangValid, hariIni, formatNomorInduk };
