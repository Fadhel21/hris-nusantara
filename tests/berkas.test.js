const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { deteksiTipe, dimensiJpeg, bersihkanNama } = require('../src/modules/karyawan/services/berkas');
const v = require('../src/modules/karyawan/services/validasi');

// JPEG sintetis: SOI + APP0 + SOF0 (tinggi, lebar) + EOI. Cukup untuk pemeriksaan byte, bukan untuk ditampilkan.
function jpeg(lebar, tinggi) {
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(9)]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, tinggi >> 8, tinggi & 255, lebar >> 8, lebar & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

test('berkas: tipe dikenali dari byte awal, bukan nama', () => {
  assert.strictEqual(deteksiTipe(jpeg(10, 10)).mime, 'image/jpeg');
  assert.strictEqual(deteksiTipe(Buffer.from('%PDF-1.7\n...')).mime, 'application/pdf');
  assert.strictEqual(deteksiTipe(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)])).mime, 'image/png');
});

test('berkas: skrip/HTML/SVG/exe yang menyamar ditolak', () => {
  for (const isi of ['<html><script>alert(1)</script></html>', '<svg xmlns="http://www.w3.org/2000/svg"/>', 'MZ\x90\x00\x03\x00\x00\x00', 'GIF89a.....', '']) {
    assert.strictEqual(deteksiTipe(Buffer.from(isi)), null, isi);
  }
  assert.strictEqual(deteksiTipe('bukan buffer'), null);
});

test('berkas: dimensi JPEG dibaca dari segmen SOF', () => {
  assert.deepStrictEqual(dimensiJpeg(jpeg(400, 300)), { lebar: 400, tinggi: 300 });
  assert.deepStrictEqual(dimensiJpeg(jpeg(4000, 3000)), { lebar: 4000, tinggi: 3000 });
  assert.strictEqual(dimensiJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0])), null);
});

test('berkas: nama asli dibersihkan dari path dan karakter berbahaya', () => {
  assert.strictEqual(bersihkanNama(String.raw`..\..\Windows\system.ini`), 'system.ini');
  assert.strictEqual(bersihkanNama('../../etc/passwd'), 'passwd');
  assert.strictEqual(bersihkanNama('KTP "Budi"<x>.pdf'), 'KTP Budix.pdf');
  assert.strictEqual(bersihkanNama(''), 'dokumen');
  assert.ok(bersihkanNama('a'.repeat(500)).length <= 150);
});

test('uploads: jalur di luar folder unggahan ditolak', () => {
  process.env.UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
  const { jalurAman, FOLDER } = require('../src/config/uploads');
  assert.ok(jalurAman('dokumen/1/a.pdf').startsWith(FOLDER));
  for (const buruk of ['../.env', 'dokumen/../../.env', String.raw`..\..\x`, path.resolve('/windows/system32')]) {
    assert.throws(() => jalurAman(buruk), /tidak valid/, buruk);
  }
});

test('validasi: keluarga dan pendidikan', () => {
  assert.deepStrictEqual(v.keluarga({ nama: 'Sari', hubungan: 'pasangan', tanggungan: '1' }).galat, []);
  assert.strictEqual(v.keluarga({ nama: 'Sari', hubungan: 'tetangga' }).galat.length, 1);
  assert.strictEqual(v.keluarga({ nama: 'Sari', hubungan: 'anak' }).nilai.tanggungan, false);
  assert.deepStrictEqual(v.pendidikan({ jenjang: 'S1', institusi: 'UI', tahun_masuk: '2010', tahun_lulus: '2014' }).galat, []);
  assert.strictEqual(v.pendidikan({ jenjang: 'S1', institusi: 'UI', tahun_masuk: '2014', tahun_lulus: '2010' }).galat.length, 1);
  assert.strictEqual(v.pendidikan({ jenjang: 'SMA', institusi: 'X' }).galat.length, 1);
  assert.strictEqual(v.pendidikan({ jenjang: 'S1', institusi: 'X', tahun_masuk: '1800' }).galat.length, 1);
});
