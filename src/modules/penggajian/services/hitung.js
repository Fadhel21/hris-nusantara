// Mesin hitung slip gaji. Fungsi murni (tanpa DB), seluruh uang dalam bilangan bulat (sen).
//
// Aturan yang diterapkan (keputusan pemilik):
//   - Periode = bulan kalender. Prorata berdasarkan HARI KERJA (jadwal kerja berlaku dan bukan hari libur):
//       gaji = nominal x (hari kerja yang ia bekerja / hari kerja periode), dihitung per segmen nominal
//       (bila nominal berubah di tengah periode, tiap hari memakai nominal yang berlaku pada hari itu).
//   - Potongan keterlambatan = total menit terlambat x nominal per menit.
//   - BPJS: dasar = gaji pokok + tunjangan bertanda "masuk dasar BPJS" yang diterima pada periode (sesudah prorata),
//       dibatasi batas upah atas bila ada; iuran = dasar x tarif%. Bagian perusahaan hanya dicatat (tidak mengurangi gaji).
// Asumsi yang perlu dikonfirmasi pemilik: pembulatan ke sen (tanpa pembulatan rupiah); BPJS atas dasar penghasilan
// yang diterima (bukan penuh sebulan); ketidakhadiran tidak memotong gaji.
const uang = require('./uang');

const NAMA_PROGRAM = {
  kesehatan: 'BPJS Kesehatan', jht: 'BPJS JHT', jp: 'BPJS JP', jkk: 'BPJS JKK', jkm: 'BPJS JKM',
};
const URUTAN_PROGRAM = ['kesehatan', 'jht', 'jp', 'jkk', 'jkm'];

// Nominal yang berlaku pada suatu hari: baris riwayat dengan tanggal_berlaku terbaru <= hari. 0 bila belum ada.
function nominalPada(riwayat, hari) {
  let pilih = null;
  for (const r of riwayat) {
    if (r.tanggal_berlaku <= hari && (!pilih || r.tanggal_berlaku > pilih.tanggal_berlaku)) pilih = r;
  }
  return pilih ? uang.keSen(pilih.nominal) : 0n;
}

// Jumlah (sen) yang diterima untuk satu komponen berriwayat sepanjang hari-hari kerja yang dijalani.
function prorata(hariBekerja, riwayat, totalHari) {
  const kelompok = new Map();
  for (const h of hariBekerja) {
    const n = nominalPada(riwayat, h);
    if (n > 0n) kelompok.set(n, (kelompok.get(n) || 0) + 1);
  }
  const urut = [...kelompok.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return uang.jumlah(urut.map(([nominal, hari]) => uang.kaliPecahan(nominal, hari, totalHari)));
}

// masukan:
//   hariKerjaPeriode: ['YYYY-MM-DD', ...] seluruh hari kerja periode (jadwal & libur sudah diperhitungkan)
//   karyawan: { tanggal_masuk, tanggal_keluar|null }
//   gajiPokok: [{ tanggal_berlaku, nominal }]
//   komponen: [{ kode, nama, jenis: 'tunjangan'|'potongan', masuk_dasar_bpjs, riwayat: [{ tanggal_berlaku, nominal }] }]
//   menitTerlambat: integer; tarifPerMenit: teks uang
//   bpjs: [{ program, tarif_karyawan, tarif_perusahaan, batas_upah_atas|null }] hanya program yang diikuti karyawan
//   penyesuaian: [{ jenis: 'pendapatan'|'potongan', keterangan, nominal }]
function hitungSlip(masukan) {
  const total = masukan.hariKerjaPeriode.length;
  if (total === 0) throw new Error('Periode tidak memiliki hari kerja menurut jadwal kerja.');
  const { tanggal_masuk: masuk, tanggal_keluar: keluar } = masukan.karyawan;
  const hariBekerja = masukan.hariKerjaPeriode.filter((h) => h >= masuk && (!keluar || h <= keluar));

  const rincian = [];
  const tambah = (tipe, kode, nama, sen, keterangan = null) => {
    rincian.push({ tipe, kode, nama, nominal: sen, keterangan });
  };

  // Pendapatan
  const gajiPokok = prorata(hariBekerja, masukan.gajiPokok, total);
  tambah('pendapatan', 'GAJI_POKOK', 'Gaji pokok', gajiPokok, `${hariBekerja.length} dari ${total} hari kerja`);
  let dasarBpjs = gajiPokok;
  const tunjangan = [];
  const potonganTetap = [];
  for (const k of masukan.komponen) {
    const sen = prorata(hariBekerja, k.riwayat, total);
    if (sen === 0n) continue;
    if (k.jenis === 'tunjangan') {
      tunjangan.push({ k, sen });
      if (k.masuk_dasar_bpjs) dasarBpjs += sen;
    } else {
      potonganTetap.push({ k, sen });
    }
  }
  for (const t of tunjangan) tambah('pendapatan', t.k.kode, t.k.nama, t.sen);
  for (const p of masukan.penyesuaian.filter((x) => x.jenis === 'pendapatan')) {
    tambah('pendapatan', 'PENYESUAIAN', p.keterangan, uang.keSen(p.nominal));
  }

  // Potongan
  for (const p of potonganTetap) tambah('potongan', p.k.kode, p.k.nama, p.sen);
  if (masukan.menitTerlambat > 0) {
    const sen = uang.keSen(masukan.tarifPerMenit) * BigInt(masukan.menitTerlambat);
    if (sen > 0n) tambah('potongan', 'KETERLAMBATAN', 'Potongan keterlambatan', sen, `${masukan.menitTerlambat} menit`);
  }
  const beban = [];
  const programBpjs = [...masukan.bpjs].sort((a, b) => URUTAN_PROGRAM.indexOf(a.program) - URUTAN_PROGRAM.indexOf(b.program));
  for (const b of programBpjs) {
    const batas = b.batas_upah_atas === null || b.batas_upah_atas === undefined ? null : uang.keSen(b.batas_upah_atas);
    const dasar = batas !== null && dasarBpjs > batas ? batas : dasarBpjs;
    const iuranKaryawan = uang.persen(dasar, b.tarif_karyawan);
    const iuranPerusahaan = uang.persen(dasar, b.tarif_perusahaan);
    const ket = `dasar Rp ${uang.dariSen(dasar)}`;
    if (iuranKaryawan > 0n) tambah('potongan', `BPJS_${b.program.toUpperCase()}`, `${NAMA_PROGRAM[b.program]} (karyawan)`, iuranKaryawan, ket);
    if (iuranPerusahaan > 0n) beban.push({ program: b.program, sen: iuranPerusahaan, ket });
  }
  for (const p of masukan.penyesuaian.filter((x) => x.jenis === 'potongan')) {
    tambah('potongan', 'PENYESUAIAN', p.keterangan, uang.keSen(p.nominal));
  }
  for (const b of beban) tambah('beban_perusahaan', `BPJS_${b.program.toUpperCase()}_PRS`, `${NAMA_PROGRAM[b.program]} (perusahaan)`, b.sen, b.ket);

  const bruto = uang.jumlah(rincian.filter((r) => r.tipe === 'pendapatan').map((r) => r.nominal));
  const potongan = uang.jumlah(rincian.filter((r) => r.tipe === 'potongan').map((r) => r.nominal));
  if (potongan > bruto) {
    throw new Error(`Total potongan (Rp ${uang.dariSen(potongan)}) melebihi pendapatan (Rp ${uang.dariSen(bruto)}).`);
  }
  return {
    hariKerjaPeriode: total,
    hariKerjaBekerja: hariBekerja.length,
    bruto: uang.dariSen(bruto),
    potongan: uang.dariSen(potongan),
    bersih: uang.dariSen(bruto - potongan),
    rincian: rincian.map((r, i) => ({ ...r, urutan: i + 1, nominal: uang.dariSen(r.nominal) })),
  };
}

module.exports = { NAMA_PROGRAM, URUTAN_PROGRAM, nominalPada, prorata, hitungSlip };
