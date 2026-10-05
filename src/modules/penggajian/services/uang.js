// Aritmetika uang dengan bilangan bulat (BigInt) dalam satuan sen. Tidak ada float JavaScript.
// Pembulatan: setengah ke atas (half-up) pada nilai tidak negatif.

const POLA_UANG = /^\d{1,13}(\.\d{1,2})?$/;
const POLA_TARIF = /^\d{1,3}(\.\d{1,4})?$/;

// '1234.5' -> 123450n
function keSen(teks) {
  const s = String(teks);
  if (!POLA_UANG.test(s)) throw new Error(`Nilai uang tidak valid: ${s}`);
  const [bulat, desimal = ''] = s.split('.');
  return BigInt(bulat) * 100n + BigInt(desimal.padEnd(2, '0'));
}

// 123450n -> '1234.50'
function dariSen(sen) {
  if (sen < 0n) throw new Error('Nilai uang negatif tidak didukung di sini.');
  const bulat = sen / 100n;
  const sisa = sen % 100n;
  return `${bulat}.${String(sisa).padStart(2, '0')}`;
}

// round-half-up(pembilang / penyebut) untuk BigInt tidak negatif
function bagiBulat(pembilang, penyebut) {
  if (penyebut <= 0n) throw new Error('Penyebut harus positif.');
  return (2n * pembilang + penyebut) / (2n * penyebut);
}

// sen * p / q dengan pembulatan half-up
function kaliPecahan(sen, p, q) {
  return bagiBulat(sen * BigInt(p), BigInt(q));
}

// Tarif persen dengan maksimal 4 desimal ('4.0000' atau '0.24') -> BigInt berskala 10^4.
function keTarif(teks) {
  const s = String(teks);
  if (!POLA_TARIF.test(s)) throw new Error(`Tarif tidak valid: ${s}`);
  const [bulat, desimal = ''] = s.split('.');
  return BigInt(bulat) * 10000n + BigInt(desimal.padEnd(4, '0'));
}

// sen * tarif% , dibulatkan half-up ke sen
function persen(sen, tarifTeks) {
  return bagiBulat(sen * keTarif(tarifTeks), 1000000n);
}

function jumlah(daftar) {
  return daftar.reduce((a, b) => a + b, 0n);
}

module.exports = { keSen, dariSen, bagiBulat, kaliPecahan, keTarif, persen, jumlah };
