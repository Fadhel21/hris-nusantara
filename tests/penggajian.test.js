const test = require('node:test');
const assert = require('node:assert');
const uang = require('../src/modules/penggajian/services/uang');
const { hitungSlip, prorata } = require('../src/modules/penggajian/services/hitung');

// Oktober 2026: 22 hari kerja Senin-Jumat.
function hariKerja(awal, akhir) {
  const hasil = [];
  for (let d = new Date(`${awal}T00:00:00Z`); d <= new Date(`${akhir}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay();
    if (w >= 1 && w <= 5) hasil.push(d.toISOString().slice(0, 10));
  }
  return hasil;
}
const OKT = hariKerja('2026-10-01', '2026-10-31');

const dasar = (o = {}) => ({
  hariKerjaPeriode: OKT, karyawan: { tanggal_masuk: '2026-01-05', tanggal_keluar: null },
  gajiPokok: [{ tanggal_berlaku: '2026-01-05', nominal: '5000000.00' }],
  komponen: [], menitTerlambat: 0, tarifPerMenit: '0.00', bpjs: [], penyesuaian: [], ...o,
});

test('uang: konversi sen bolak-balik tanpa float', () => {
  assert.strictEqual(uang.keSen('1234.5'), 123450n);
  assert.strictEqual(uang.keSen('0.05'), 5n);
  assert.strictEqual(uang.dariSen(123450n), '1234.50');
  assert.strictEqual(uang.dariSen(5n), '0.05');
  assert.strictEqual(uang.dariSen(uang.keSen('9999999999999.99')), '9999999999999.99');
  for (const salah of ['-1', '1,5', '1.234', 'abc', '', '1e3']) assert.throws(() => uang.keSen(salah), salah);
});

test('uang: pembulatan half-up pada pecahan dan persen', () => {
  assert.strictEqual(uang.bagiBulat(1n, 2n), 1n); // 0,5 -> 1
  assert.strictEqual(uang.bagiBulat(1n, 3n), 0n);
  assert.strictEqual(uang.bagiBulat(2n, 3n), 1n);
  assert.strictEqual(uang.dariSen(uang.kaliPecahan(uang.keSen('1000000'), 7, 22)), '318181.82'); // 318181,818...
  assert.strictEqual(uang.dariSen(uang.kaliPecahan(uang.keSen('5000000'), 22, 22)), '5000000.00');
  assert.strictEqual(uang.dariSen(uang.persen(uang.keSen('5000000'), '1')), '50000.00');
  assert.strictEqual(uang.dariSen(uang.persen(uang.keSen('4500000'), '0.24')), '10800.00');
  assert.strictEqual(uang.dariSen(uang.persen(uang.keSen('1234567.89'), '3.7')), '45679.01'); // 45679,0119...
  assert.throws(() => uang.keTarif('1.12345'));
});

test('hitung: bulan penuh tanpa komponen = gaji pokok', () => {
  const s = hitungSlip(dasar());
  assert.strictEqual(OKT.length, 22);
  assert.deepStrictEqual([s.bruto, s.potongan, s.bersih], ['5000000.00', '0.00', '5000000.00']);
  assert.strictEqual(s.hariKerjaBekerja, 22);
});

test('hitung: karyawan masuk di tengah bulan diprorata hari kerja', () => {
  // Masuk Senin 19 Okt: hari kerja 19-23, 26-30 = 10 dari 22 hari
  const s = hitungSlip(dasar({ karyawan: { tanggal_masuk: '2026-10-19', tanggal_keluar: null } }));
  assert.strictEqual(s.hariKerjaBekerja, 10);
  assert.strictEqual(s.bruto, '2272727.27'); // 5.000.000 x 10/22 = 2.272.727,27
});

test('hitung: karyawan keluar di tengah bulan diprorata; akhir pekan tidak dihitung', () => {
  const s = hitungSlip(dasar({ karyawan: { tanggal_masuk: '2026-01-05', tanggal_keluar: '2026-10-11' } })); // Minggu
  assert.strictEqual(s.hariKerjaBekerja, 7); // 1,2,5,6,7,8,9
  assert.strictEqual(s.bruto, uang.dariSen(uang.kaliPecahan(500000000n, 7, 22)));
});

test('hitung: hari libur mengurangi pembagi dan tidak membuat gaji turun pada bulan penuh', () => {
  const libur = OKT.filter((h) => h !== '2026-10-07'); // 21 hari kerja
  const s = hitungSlip(dasar({ hariKerjaPeriode: libur }));
  assert.strictEqual(s.bruto, '5000000.00');
  assert.strictEqual(s.hariKerjaPeriode, 21);
});

test('hitung: perubahan gaji pokok di tengah periode memakai nominal tiap hari', () => {
  const s = hitungSlip(dasar({
    gajiPokok: [{ tanggal_berlaku: '2026-01-05', nominal: '4400000' }, { tanggal_berlaku: '2026-10-15', nominal: '5500000' }],
  }));
  // 1-14 Okt: 10 hari kerja (1,2,5-9,12,13,14); 15-31 Okt: 12 hari kerja
  const awal = uang.kaliPecahan(440000000n, 10, 22);
  const akhir = uang.kaliPecahan(550000000n, 12, 22);
  assert.strictEqual(s.bruto, uang.dariSen(awal + akhir));
});

test('hitung: tunjangan dan potongan tetap ikut prorata; urutan rincian: pendapatan, potongan, beban', () => {
  const s = hitungSlip(dasar({
    komponen: [
      { kode: 'TRANS', nama: 'Tunjangan transport', jenis: 'tunjangan', masuk_dasar_bpjs: false, riwayat: [{ tanggal_berlaku: '2026-01-05', nominal: '440000' }] },
      { kode: 'KOP', nama: 'Iuran koperasi', jenis: 'potongan', masuk_dasar_bpjs: false, riwayat: [{ tanggal_berlaku: '2026-01-05', nominal: '100000' }] },
      { kode: 'LAMA', nama: 'Tunjangan dihentikan', jenis: 'tunjangan', masuk_dasar_bpjs: false, riwayat: [{ tanggal_berlaku: '2026-01-05', nominal: '300000' }, { tanggal_berlaku: '2026-09-01', nominal: '0' }] },
    ],
  }));
  assert.deepStrictEqual(s.rincian.map((r) => r.kode), ['GAJI_POKOK', 'TRANS', 'KOP']);
  assert.deepStrictEqual([s.bruto, s.potongan, s.bersih], ['5440000.00', '100000.00', '5340000.00']);
});

test('hitung: keterlambatan = menit x nominal per menit', () => {
  const s = hitungSlip(dasar({ menitTerlambat: 90, tarifPerMenit: '1000' }));
  assert.strictEqual(s.potongan, '90000.00');
  assert.strictEqual(s.bersih, '4910000.00');
  assert.strictEqual(s.rincian.find((r) => r.kode === 'KETERLAMBATAN').keterangan, '90 menit');
});

test('hitung: BPJS - dasar gaji pokok + tunjangan bertanda, ada batas atas, bagian perusahaan hanya dicatat', () => {
  const s = hitungSlip(dasar({
    komponen: [
      { kode: 'TJ', nama: 'Tunjangan tetap', jenis: 'tunjangan', masuk_dasar_bpjs: true, riwayat: [{ tanggal_berlaku: '2026-01-05', nominal: '1000000' }] },
      { kode: 'MAKAN', nama: 'Uang makan', jenis: 'tunjangan', masuk_dasar_bpjs: false, riwayat: [{ tanggal_berlaku: '2026-01-05', nominal: '500000' }] },
    ],
    bpjs: [
      { program: 'jht', tarif_karyawan: '2.0000', tarif_perusahaan: '3.7000', batas_upah_atas: null },
      { program: 'kesehatan', tarif_karyawan: '1.0000', tarif_perusahaan: '4.0000', batas_upah_atas: '5000000' },
      { program: 'jkk', tarif_karyawan: '0.0000', tarif_perusahaan: '0.2400', batas_upah_atas: null },
    ],
  }));
  // dasar = 5.000.000 + 1.000.000 = 6.000.000 (uang makan tidak masuk)
  const per = Object.fromEntries(s.rincian.map((r) => [r.kode, r]));
  assert.strictEqual(per.BPJS_JHT.nominal, '120000.00'); // 2% x 6.000.000
  assert.strictEqual(per.BPJS_KESEHATAN.nominal, '50000.00'); // dibatasi 5.000.000 x 1%
  assert.strictEqual(per.BPJS_KESEHATAN.keterangan, 'dasar Rp 5000000.00');
  assert.strictEqual(per.BPJS_JHT_PRS.nominal, '222000.00'); // 3,7% x 6.000.000
  assert.strictEqual(per.BPJS_JKK_PRS.nominal, '14400.00');
  assert.ok(!per.BPJS_JKK, 'tarif karyawan 0 tidak menghasilkan baris potongan');
  assert.strictEqual(s.bruto, '6500000.00');
  assert.strictEqual(s.potongan, '170000.00'); // hanya bagian karyawan
  assert.strictEqual(s.bersih, '6330000.00');
  assert.deepStrictEqual(s.rincian.map((r) => r.tipe), ['pendapatan', 'pendapatan', 'pendapatan', 'potongan', 'potongan', 'beban_perusahaan', 'beban_perusahaan', 'beban_perusahaan']);
});

test('hitung: penyesuaian periode (pendapatan dan potongan) ikut dihitung', () => {
  const s = hitungSlip(dasar({
    penyesuaian: [
      { jenis: 'pendapatan', keterangan: 'Koreksi kekurangan bulan lalu', nominal: '250000.50' },
      { jenis: 'potongan', keterangan: 'Kelebihan bayar bulan lalu', nominal: '100000' },
    ],
  }));
  assert.deepStrictEqual([s.bruto, s.potongan, s.bersih], ['5250000.50', '100000.00', '5150000.50']);
});

test('hitung: potongan melebihi pendapatan ditolak, bukan menghasilkan gaji negatif', () => {
  assert.throws(() => hitungSlip(dasar({ penyesuaian: [{ jenis: 'potongan', keterangan: 'x', nominal: '9000000' }] })), /melebihi pendapatan/);
});

test('hitung: periode tanpa hari kerja ditolak; karyawan belum masuk = 0 hari', () => {
  assert.throws(() => hitungSlip(dasar({ hariKerjaPeriode: [] })), /tidak memiliki hari kerja/);
  const s = hitungSlip(dasar({ karyawan: { tanggal_masuk: '2026-11-01', tanggal_keluar: null } }));
  assert.strictEqual(s.hariKerjaBekerja, 0);
  assert.strictEqual(s.bruto, '0.00');
});

test('hitung: hasil deterministik - dihitung ulang dengan masukan sama menghasilkan keluaran identik', () => {
  const m = dasar({
    karyawan: { tanggal_masuk: '2026-10-08', tanggal_keluar: null },
    komponen: [{ kode: 'TJ', nama: 'TJ', jenis: 'tunjangan', masuk_dasar_bpjs: true, riwayat: [{ tanggal_berlaku: '2026-01-01', nominal: '777777.77' }] }],
    bpjs: [{ program: 'jp', tarif_karyawan: '1', tarif_perusahaan: '2', batas_upah_atas: '9000000' }], menitTerlambat: 13, tarifPerMenit: '333.33',
  });
  assert.deepStrictEqual(hitungSlip(m), hitungSlip(JSON.parse(JSON.stringify(m))));
  for (const r of hitungSlip(m).rincian) assert.match(r.nominal, /^\d+\.\d{2}$/);
});

test('hitung: prorata menjumlahkan segmen dengan pembulatan per segmen', () => {
  const hari = OKT.slice(0, 22);
  assert.strictEqual(prorata(hari, [{ tanggal_berlaku: '2026-01-01', nominal: '1000000' }], 22), 100000000n);
  assert.strictEqual(prorata([], [{ tanggal_berlaku: '2026-01-01', nominal: '1000000' }], 22), 0n);
  assert.strictEqual(prorata(hari, [], 22), 0n);
});
