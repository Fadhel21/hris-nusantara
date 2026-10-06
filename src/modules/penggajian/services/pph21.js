// Mesin PPh 21. Fungsi murni (tanpa DB), uang dalam sen (BigInt). Semua tarif, PTKP, dan parameter datang dari
// tabel pengaturan yang diisi pemilik; tidak ada angka pajak yang ditulis mati di sini.
//
// Metode (keputusan pemilik):
//   - Masa pajak biasa: TER bulanan = tarif TER (menurut kategori dan penghasilan bruto bulan itu) x penghasilan bruto.
//   - Masa pajak terakhir (Desember, atau bulan karyawan keluar): hitung ulang setahun dengan lapisan progresif:
//       neto = bruto setahun - biaya jabatan - iuran pengurang; PKP = neto - PTKP (proporsional bulan bekerja),
//       dibulatkan ke bawah ke kelipatan pembulatan PKP; PPh bulan itu = PPh setahun - PPh yang sudah dipotong.
//     Hasil boleh NEGATIF (kelebihan potong dikembalikan lewat slip).
//   - Pembulatan PPh yang dipotong: ke rupiah terdekat.
//   - Tanpa NPWP: dikali pengali dari parameter (diisi pemilik).
const uang = require('./uang');

function skala(teks) {
  const s = String(teks);
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) throw new Error(`Pengali tidak valid: ${s}`);
  const [b, d = ''] = s.split('.');
  return BigInt(b) * 100n + BigInt(d.padEnd(2, '0'));
}

// Rupiah penuh terdekat (0,50 ke atas naik). sen >= 0.
function bulatRupiah(sen) {
  return uang.bagiBulat(sen, 100n) * 100n;
}

function kaliPengali(sen, pengali) {
  return uang.bagiBulat(sen * skala(pengali), 100n);
}

// Teks uang untuk keterangan (mendukung negatif).
function fmt(sen) {
  return sen < 0n ? `-${uang.dariSen(-sen)}` : uang.dariSen(sen);
}

// Baris TER untuk penghasilan bruto: batas_bawah terbesar yang <= bruto (dibulatkan ke bawah ke rupiah penuh).
function cariTer(ter, brutoSen) {
  const rupiahSen = (brutoSen / 100n) * 100n;
  let pilih = null;
  for (const r of ter) {
    const b = uang.keSen(r.batas_bawah);
    if (b <= rupiahSen && (!pilih || b > pilih.b)) pilih = { b, tarif: r.tarif };
  }
  return pilih;
}

// Lapisan progresif harus mulai dari 0, bersambung, dan berakhir terbuka. Mengembalikan pesan galat atau null.
function periksaLapisan(lapisan) {
  if (!lapisan.length) return 'belum diisi';
  const urut = [...lapisan].sort((a, b) => (uang.keSen(a.batas_bawah) < uang.keSen(b.batas_bawah) ? -1 : 1));
  if (uang.keSen(urut[0].batas_bawah) !== 0n) return 'lapisan pertama harus mulai dari 0';
  for (let i = 0; i < urut.length - 1; i += 1) {
    if (urut[i].batas_atas === null || urut[i].batas_atas === undefined) return 'ada lapisan terbuka sebelum lapisan terakhir';
    if (uang.keSen(urut[i].batas_atas) !== uang.keSen(urut[i + 1].batas_bawah)) return 'lapisan tidak bersambung';
  }
  const akhir = urut[urut.length - 1];
  if (akhir.batas_atas !== null && akhir.batas_atas !== undefined) return 'lapisan terakhir harus tanpa batas atas';
  return null;
}

// Tabel TER satu kategori: mulai dari 0 dan batas bawah naik tegas. Mengembalikan pesan galat atau null.
function periksaTer(baris) {
  if (!baris.length) return 'belum diisi';
  const urut = [...baris].sort((a, b) => (uang.keSen(a.batas_bawah) < uang.keSen(b.batas_bawah) ? -1 : 1));
  if (uang.keSen(urut[0].batas_bawah) !== 0n) return 'baris pertama harus mulai dari 0';
  for (let i = 0; i < urut.length - 1; i += 1) {
    if (uang.keSen(urut[i].batas_bawah) === uang.keSen(urut[i + 1].batas_bawah)) return 'ada batas bawah ganda';
  }
  return null;
}

function pphLapisan(pkp, lapisan) {
  const galat = periksaLapisan(lapisan);
  if (galat) throw new Error(`Lapisan tarif PPh 21 tidak lengkap: ${galat}.`);
  let total = 0n;
  for (const l of lapisan) {
    const bawah = uang.keSen(l.batas_bawah);
    const atas = l.batas_atas === null || l.batas_atas === undefined ? null : uang.keSen(l.batas_atas);
    const puncak = atas === null || pkp < atas ? pkp : atas;
    if (puncak > bawah) total += uang.persen(puncak - bawah, l.tarif);
  }
  return total;
}

// masukan: { brutoPajak, iuranPengurang (BigInt), kategori, ter, tanpaNpwp, pengaliTanpaNpwp, masaAkhir|null }
//   masaAkhir: { brutoYtdSebelum, iuranYtdSebelum, pphYtdSebelum (BigInt), bulanBekerja (int), ptkpTahunan (BigInt),
//                biayaJabatanPersen (teks), biayaJabatanMaksPerBulan (BigInt), pembulatanPkp (BigInt sen > 0), lapisan }
// Mengembalikan { pph (BigInt, boleh negatif), metode, keterangan }.
function hitungPph21(masukan) {
  if (!masukan.masaAkhir) {
    const baris = cariTer(masukan.ter, masukan.brutoPajak);
    if (!baris) throw new Error(`Tarif TER kategori ${masukan.kategori} untuk penghasilan Rp ${fmt(masukan.brutoPajak)} tidak ditemukan.`);
    let pph = uang.persen(masukan.brutoPajak, baris.tarif);
    if (masukan.tanpaNpwp) pph = kaliPengali(pph, masukan.pengaliTanpaNpwp);
    pph = bulatRupiah(pph);
    return {
      pph, metode: 'TER',
      // Tarif tampil tanpa nol di belakang koma ('2.0000' -> '2'); hanya untuk keterangan, bukan untuk perhitungan.
      keterangan: `TER kategori ${masukan.kategori}, tarif ${String(Number(baris.tarif))}% atas penghasilan bruto Rp ${fmt(masukan.brutoPajak)}${masukan.tanpaNpwp ? ` (tanpa NPWP x${Number(masukan.pengaliTanpaNpwp)})` : ''}`,
    };
  }
  const a = masukan.masaAkhir;
  if (!(a.pembulatanPkp > 0n)) throw new Error('Pembulatan PKP harus positif.');
  const brutoTahun = a.brutoYtdSebelum + masukan.brutoPajak;
  const biayaMaks = a.biayaJabatanMaksPerBulan * BigInt(a.bulanBekerja);
  const biayaHitung = uang.persen(brutoTahun, a.biayaJabatanPersen);
  const biaya = biayaHitung < biayaMaks ? biayaHitung : biayaMaks;
  const iuran = a.iuranYtdSebelum + masukan.iuranPengurang;
  let neto = brutoTahun - biaya - iuran;
  if (neto < 0n) neto = 0n;
  const ptkp = uang.kaliPecahan(a.ptkpTahunan, a.bulanBekerja, 12);
  const pkp0 = neto > ptkp ? neto - ptkp : 0n;
  const pkp = (pkp0 / a.pembulatanPkp) * a.pembulatanPkp;
  let tahunan = pphLapisan(pkp, a.lapisan);
  if (masukan.tanpaNpwp) tahunan = kaliPengali(tahunan, masukan.pengaliTanpaNpwp);
  tahunan = bulatRupiah(tahunan);
  const pph = tahunan - a.pphYtdSebelum;
  return {
    pph, metode: 'MASA_AKHIR',
    keterangan: `Masa pajak terakhir (${a.bulanBekerja} bulan): PPh setahun Rp ${fmt(tahunan)} dikurangi yang sudah dipotong Rp ${fmt(a.pphYtdSebelum)}; PKP Rp ${fmt(pkp)}`,
    rincian: { brutoTahun, biaya, iuran, neto, ptkp, pkp, tahunan },
  };
}

module.exports = { bulatRupiah, kaliPengali, cariTer, periksaLapisan, periksaTer, pphLapisan, hitungPph21, fmt };
