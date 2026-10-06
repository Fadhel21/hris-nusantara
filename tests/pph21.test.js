const test = require('node:test');
const assert = require('node:assert');
const uang = require('../src/modules/penggajian/services/uang');
const P = require('../src/modules/penggajian/services/pph21');

// TABEL FIKTIF UNTUK PENGUJIAN (bukan tarif resmi): dipakai hanya untuk memeriksa mekanisme hitung.
const TER_A = [
  { kategori: 'A', batas_bawah: '0.00', tarif: '0' },
  { kategori: 'A', batas_bawah: '5000000.00', tarif: '1' },
  { kategori: 'A', batas_bawah: '10000000.00', tarif: '2.5' },
];
const LAPISAN = [
  { batas_bawah: '0.00', batas_atas: '60000000.00', tarif: '5' },
  { batas_bawah: '60000000.00', batas_atas: '250000000.00', tarif: '15' },
  { batas_bawah: '250000000.00', batas_atas: null, tarif: '25' },
];
const S = (x) => uang.keSen(x);

test('pph21: pembulatan ke rupiah terdekat', () => {
  assert.strictEqual(P.bulatRupiah(S('1234.49')), S('1234'));
  assert.strictEqual(P.bulatRupiah(S('1234.50')), S('1235'));
  assert.strictEqual(P.bulatRupiah(S('0.49')), 0n);
  assert.strictEqual(uang.dariSen(P.kaliPengali(S('100000'), '1.20')), '120000.00');
});

test('pph21: pencarian TER memakai batas bawah terbesar yang <= bruto (rupiah penuh)', () => {
  assert.strictEqual(P.cariTer(TER_A, S('4999999.99')).tarif, '0'); // belum mencapai 5.000.000
  assert.strictEqual(P.cariTer(TER_A, S('5000000')).tarif, '1');
  assert.strictEqual(P.cariTer(TER_A, S('5000000.99')).tarif, '1');
  assert.strictEqual(P.cariTer(TER_A, S('9999999.99')).tarif, '1');
  assert.strictEqual(P.cariTer(TER_A, S('10000000')).tarif, '2.5');
  assert.strictEqual(P.cariTer(TER_A, S('99999999')).tarif, '2.5');
  assert.strictEqual(P.cariTer([{ batas_bawah: '1000.00', tarif: '1' }], S('500')), null);
});

test('pph21: TER bulanan = tarif x bruto, dibulatkan ke rupiah', () => {
  const r = P.hitungPph21({ brutoPajak: S('6000000'), iuranPengurang: 0n, kategori: 'A', ter: TER_A, tanpaNpwp: false, masaAkhir: null });
  assert.strictEqual(r.metode, 'TER');
  assert.strictEqual(uang.dariSen(r.pph), '60000.00'); // 1% x 6.000.000
  assert.match(r.keterangan, /TER kategori A, tarif 1%/);
  const r2 = P.hitungPph21({ brutoPajak: S('12345678.90'), iuranPengurang: 0n, kategori: 'A', ter: TER_A, tanpaNpwp: false, masaAkhir: null });
  assert.strictEqual(uang.dariSen(r2.pph), '308642.00'); // 2,5% x 12.345.678,90 = 308.641,9725 -> 308.642
  const r3 = P.hitungPph21({ brutoPajak: S('3000000'), iuranPengurang: 0n, kategori: 'A', ter: TER_A, tanpaNpwp: false, masaAkhir: null });
  assert.strictEqual(r3.pph, 0n);
});

test('pph21: tanpa NPWP dikali pengali parameter; tabel TER kosong ditolak', () => {
  const r = P.hitungPph21({ brutoPajak: S('6000000'), iuranPengurang: 0n, kategori: 'A', ter: TER_A, tanpaNpwp: true, pengaliTanpaNpwp: '1.20', masaAkhir: null });
  assert.strictEqual(uang.dariSen(r.pph), '72000.00');
  assert.match(r.keterangan, /tanpa NPWP/);
  assert.throws(() => P.hitungPph21({ brutoPajak: S('6000000'), iuranPengurang: 0n, kategori: 'B', ter: [], tanpaNpwp: false, masaAkhir: null }), /tidak ditemukan/);
});

test('pph21: lapisan progresif - tiap lapisan dikenai tarifnya', () => {
  assert.strictEqual(uang.dariSen(P.pphLapisan(S('60000000'), LAPISAN)), '3000000.00'); // 5% x 60jt
  assert.strictEqual(uang.dariSen(P.pphLapisan(S('100000000'), LAPISAN)), '9000000.00'); // 3.000.000 + 15% x 40jt
  // 5% x 60jt + 15% x 190jt + 25% x 50jt = 3.000.000 + 28.500.000 + 12.500.000
  assert.strictEqual(uang.dariSen(P.pphLapisan(S('300000000'), LAPISAN)), '44000000.00');
  assert.strictEqual(P.pphLapisan(0n, LAPISAN), 0n);
});

test('pph21: pemeriksaan kelengkapan lapisan dan tabel TER', () => {
  assert.strictEqual(P.periksaLapisan(LAPISAN), null);
  assert.match(P.periksaLapisan([]), /belum diisi/);
  assert.match(P.periksaLapisan([{ batas_bawah: '1', batas_atas: null, tarif: '5' }]), /mulai dari 0/);
  assert.match(P.periksaLapisan([{ batas_bawah: '0', batas_atas: '10', tarif: '5' }, { batas_bawah: '20', batas_atas: null, tarif: '9' }]), /tidak bersambung/);
  assert.match(P.periksaLapisan([{ batas_bawah: '0', batas_atas: '10', tarif: '5' }]), /terakhir harus tanpa batas/);
  assert.strictEqual(P.periksaTer(TER_A), null);
  assert.match(P.periksaTer([{ batas_bawah: '100' }]), /mulai dari 0/);
  assert.match(P.periksaTer([{ batas_bawah: '0' }, { batas_bawah: '0' }]), /ganda/);
});

const MASA_AKHIR = (o = {}) => ({
  brutoYtdSebelum: S('110000000'), iuranYtdSebelum: 0n, pphYtdSebelum: S('2200000'), bulanBekerja: 12, ptkpTahunan: S('54000000'),
  biayaJabatanPersen: '5', biayaJabatanMaksPerBulan: S('500000'), pembulatanPkp: S('1000'), lapisan: LAPISAN, ...o,
});

test('pph21: masa pajak terakhir - setahun penuh', () => {
  // bruto 11 bulan 110.000.000 + Desember 10.000.000 = 120.000.000
  // biaya jabatan = min(5% x 120jt = 6.000.000; 500.000 x 12 = 6.000.000) = 6.000.000
  // neto = 114.000.000; PTKP 54.000.000; PKP = 60.000.000; PPh setahun = 5% x 60jt = 3.000.000
  // sudah dipotong 2.200.000 -> Desember 800.000
  const r = P.hitungPph21({ brutoPajak: S('10000000'), iuranPengurang: 0n, kategori: 'A', ter: TER_A, tanpaNpwp: false, masaAkhir: MASA_AKHIR() });
  assert.strictEqual(r.metode, 'MASA_AKHIR');
  assert.strictEqual(uang.dariSen(r.rincian.biaya), '6000000.00');
  assert.strictEqual(uang.dariSen(r.rincian.pkp), '60000000.00');
  assert.strictEqual(uang.dariSen(r.rincian.tahunan), '3000000.00');
  assert.strictEqual(uang.dariSen(r.pph), '800000.00');
});

test('pph21: biaya jabatan dibatasi per bulan, iuran pengurang mengurangi neto', () => {
  // bruto setahun 240jt: 5% = 12.000.000 > maks 6.000.000 -> 6.000.000. iuran 2.400.000 -> neto 231.600.000
  // PTKP 54jt -> PKP 177.600.000; PPh = 3.000.000 + 15% x 117.600.000 = 3.000.000 + 17.640.000 = 20.640.000
  const r = P.hitungPph21({
    brutoPajak: S('20000000'), iuranPengurang: S('200000'), kategori: 'A', ter: TER_A, tanpaNpwp: false,
    masaAkhir: MASA_AKHIR({ brutoYtdSebelum: S('220000000'), iuranYtdSebelum: S('2200000'), pphYtdSebelum: S('10000000') }),
  });
  assert.strictEqual(uang.dariSen(r.rincian.biaya), '6000000.00');
  assert.strictEqual(uang.dariSen(r.rincian.neto), '231600000.00');
  assert.strictEqual(uang.dariSen(r.rincian.pkp), '177600000.00');
  assert.strictEqual(uang.dariSen(r.rincian.tahunan), '20640000.00');
  assert.strictEqual(uang.dariSen(r.pph), '10640000.00');
});

test('pph21: PKP dibulatkan ke bawah ke kelipatan pembulatan', () => {
  // bruto 100.500.000 -> biaya 5% = 5.025.000 -> neto 95.475.000 -> PKP 41.475.000 - tidak, PTKP 54jt => 41.475.000
  const r = P.hitungPph21({ brutoPajak: S('500000'), iuranPengurang: 0n, kategori: 'A', ter: TER_A, tanpaNpwp: false,
    masaAkhir: MASA_AKHIR({ brutoYtdSebelum: S('100000000'), pphYtdSebelum: 0n }) });
  assert.strictEqual(uang.dariSen(r.rincian.neto), '95475000.00');
  assert.strictEqual(uang.dariSen(r.rincian.pkp), '41475000.00');
  const r2 = P.hitungPph21({ brutoPajak: S('500000.99'), iuranPengurang: 0n, kategori: 'A', ter: TER_A, tanpaNpwp: false,
    masaAkhir: MASA_AKHIR({ brutoYtdSebelum: S('100000000'), pphYtdSebelum: 0n, ptkpTahunan: S('54000000.50') }) });
  assert.strictEqual(r2.rincian.pkp % S('1000'), 0n);
});

test('pph21: PTKP proporsional untuk karyawan yang bekerja kurang dari setahun', () => {
  // 6 bulan: PTKP = 54.000.000 x 6/12 = 27.000.000; bruto 60.000.000 (6 x 10jt); biaya = min(3.000.000; 500.000 x 6 = 3.000.000)
  // neto 57.000.000 -> PKP 30.000.000 -> PPh 1.500.000; sudah dipotong 1.000.000 -> 500.000
  const r = P.hitungPph21({ brutoPajak: S('10000000'), iuranPengurang: 0n, kategori: 'A', ter: TER_A, tanpaNpwp: false,
    masaAkhir: MASA_AKHIR({ brutoYtdSebelum: S('50000000'), pphYtdSebelum: S('1000000'), bulanBekerja: 6 }) });
  assert.strictEqual(uang.dariSen(r.rincian.ptkp), '27000000.00');
  assert.strictEqual(uang.dariSen(r.rincian.biaya), '3000000.00');
  assert.strictEqual(uang.dariSen(r.rincian.pkp), '30000000.00');
  assert.strictEqual(uang.dariSen(r.pph), '500000.00');
});

test('pph21: kelebihan potong menghasilkan nilai NEGATIF (dikembalikan lewat slip)', () => {
  const r = P.hitungPph21({ brutoPajak: S('10000000'), iuranPengurang: 0n, kategori: 'A', ter: TER_A, tanpaNpwp: false,
    masaAkhir: MASA_AKHIR({ pphYtdSebelum: S('3500000') }) });
  assert.strictEqual(uang.dariSen(r.rincian.tahunan), '3000000.00');
  assert.strictEqual(r.pph, -S('500000'));
  assert.match(r.keterangan, /Masa pajak terakhir/);
});

test('pph21: penghasilan di bawah PTKP -> PPh setahun 0; tanpa NPWP dikali pengali', () => {
  const r = P.hitungPph21({ brutoPajak: S('1000000'), iuranPengurang: 0n, kategori: 'A', ter: TER_A, tanpaNpwp: false,
    masaAkhir: MASA_AKHIR({ brutoYtdSebelum: S('11000000'), pphYtdSebelum: 0n }) });
  assert.strictEqual(r.rincian.pkp, 0n);
  assert.strictEqual(r.pph, 0n);
  const r2 = P.hitungPph21({ brutoPajak: S('10000000'), iuranPengurang: 0n, kategori: 'A', ter: TER_A, tanpaNpwp: true, pengaliTanpaNpwp: '1.20',
    masaAkhir: MASA_AKHIR({ pphYtdSebelum: 0n }) });
  assert.strictEqual(uang.dariSen(r2.rincian.tahunan), '3600000.00'); // 3.000.000 x 1,2
});

test('pph21: lapisan tidak lengkap menolak perhitungan akhir tahun', () => {
  assert.throws(() => P.hitungPph21({ brutoPajak: S('1'), iuranPengurang: 0n, kategori: 'A', ter: TER_A, tanpaNpwp: false,
    masaAkhir: MASA_AKHIR({ lapisan: [{ batas_bawah: '0', batas_atas: '10', tarif: '5' }] }) }), /Lapisan tarif PPh 21 tidak lengkap/);
});
