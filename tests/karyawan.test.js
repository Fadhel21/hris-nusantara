const test = require('node:test');
const assert = require('node:assert');
const f = require('../src/modules/karyawan/services/format');
const v = require('../src/modules/karyawan/services/validasi');

test('format: samarkan menyisakan 4 digit terakhir', () => {
  assert.strictEqual(f.samarkan('3201234567890001'), '************0001');
  assert.strictEqual(f.samarkan('123'), '***');
  assert.strictEqual(f.samarkan(null), '');
});

test('format: rupiah tanpa float', () => {
  assert.strictEqual(f.rupiah('5000000'), 'Rp 5.000.000,00');
  assert.strictEqual(f.rupiah('1234567.5'), 'Rp 1.234.567,50');
  assert.strictEqual(f.rupiah('0.00'), 'Rp 0,00');
  assert.strictEqual(f.rupiah('9999999999999.99'), 'Rp 9.999.999.999.999,99');
});

test('format: tanggal kalender dan nomor induk', () => {
  assert.ok(f.tanggalValid('2024-02-29'));
  assert.ok(!f.tanggalValid('2026-02-29'));
  assert.ok(!f.tanggalValid('2026-13-01'));
  assert.ok(!f.tanggalValid('2026-1-1'));
  assert.strictEqual(f.tanggal('2026-10-05'), '05-10-2026');
  assert.strictEqual(f.formatNomorInduk(2026, 7), '2026-0007');
});

test('format: uang hanya digit & maks 2 desimal', () => {
  for (const ok of ['0', '5000000', '5000000.5', '5000000.50']) assert.ok(f.uangValid(ok), ok);
  for (const salah of ['-1', '1,5', '1.234', 'abc', '', '1e6', '12345678901234']) assert.ok(!f.uangValid(salah), salah);
});

test('validasi: NIK/NPWP/rekening dinormalisasi lalu diperiksa panjangnya', () => {
  const ok = v.dataPribadi({ nama: 'Budi', nik: '3201 2345 6789 0001', npwp: '12.345.678.9-012.345', nomor_rekening: '123-456-789' });
  assert.deepStrictEqual(ok.galat, []);
  assert.strictEqual(ok.nilai.nik, '3201234567890001');
  assert.strictEqual(v.dataPribadi({ nama: 'Budi', nik: '123' }).galat.length, 1);
  assert.strictEqual(v.dataPribadi({ nama: '' }).galat.length, 1);
  assert.strictEqual(v.dataPribadi({ nama: 'B', tanggal_lahir: '2999-01-01' }).galat.length, 1);
});

test('validasi: kontrak PKWT/magang wajib tanggal akhir, PKWTT tidak boleh', () => {
  assert.strictEqual(v.kontrak({ jenis: 'PKWT', tanggal_mulai: '2026-01-01' }).galat.length, 1);
  assert.strictEqual(v.kontrak({ jenis: 'PKWTT', tanggal_mulai: '2026-01-01', tanggal_akhir: '2027-01-01' }).galat.length, 1);
  assert.strictEqual(v.kontrak({ jenis: 'PKWT', tanggal_mulai: '2026-06-01', tanggal_akhir: '2026-01-01' }).galat.length, 1);
  assert.strictEqual(v.kontrak({ jenis: 'PKWT', tanggal_mulai: '2026-01-01', tanggal_akhir: '2026-12-31' }).galat.length, 0);
  assert.strictEqual(v.kontrak({ jenis: 'PKWTT', tanggal_mulai: '2026-01-01' }).galat.length, 0);
});

test('validasi: karyawan baru memvalidasi semua bagian sekaligus', () => {
  const dasar = { nama: 'Budi', tanggal_masuk: '2026-01-05', cabang_id: '1', departemen_id: '1', jabatan_id: '1', gaji_pokok: '5000000', jenis: 'PKWTT' };
  const ok = v.karyawanBaru(dasar);
  assert.deepStrictEqual(ok.galat, []);
  assert.strictEqual(ok.nilai.kontrak.tanggal_mulai, '2026-01-05');
  assert.strictEqual(ok.nilai.gaji.gaji_pokok, '5000000');
  assert.ok(v.karyawanBaru({ ...dasar, gaji_pokok: '5.000.000' }).galat.length > 0);
  assert.ok(v.karyawanBaru({ ...dasar, cabang_id: '' }).galat.length > 0);
  assert.ok(v.karyawanBaru({ ...dasar, tanggal_masuk: '' }).galat.length > 0);
});
