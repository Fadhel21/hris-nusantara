const test = require('node:test');
const assert = require('node:assert');
const entitas = require('../src/modules/organisasi/entitas');
const { bersihkan } = require('../src/modules/organisasi/services/validasi');
const { susunPohon } = require('../src/modules/organisasi/services/struktur');

test('validasi: field wajib kosong menghasilkan galat', () => {
  const { galat } = bersihkan(entitas.golongan.fields, { kode: ' ', nama: 'A', urutan: '1' });
  assert.deepStrictEqual(galat, ['Kode wajib diisi.']);
});

test('validasi: angka harus bilangan bulat tidak negatif', () => {
  for (const salah of ['-1', '1.5', 'abc', '99999999999']) {
    const { galat } = bersihkan(entitas.golongan.fields, { kode: 'G1', nama: 'A', urutan: salah });
    assert.strictEqual(galat.length, 1, `harus ditolak: ${salah}`);
  }
  const ok = bersihkan(entitas.golongan.fields, { kode: ' G1 ', nama: 'A', urutan: '3' });
  assert.deepStrictEqual(ok.nilai, { kode: 'G1', nama: 'A', urutan: 3 });
});

test('validasi: zona waktu hanya WIB/WITA/WIT', () => {
  const dasar = { perusahaan_id: '1', kode: 'JKT', nama: 'Jakarta' };
  assert.strictEqual(bersihkan(entitas.cabang.fields, { ...dasar, zona_waktu: 'Asia/Makassar' }).galat.length, 0);
  assert.strictEqual(bersihkan(entitas.cabang.fields, { ...dasar, zona_waktu: 'UTC' }).galat.length, 1);
});

test('validasi: rujukan harus berupa angka; kosong diizinkan bila tidak wajib', () => {
  const dasar = { perusahaan_id: '1', kode: 'D1', nama: 'Dept' };
  assert.strictEqual(bersihkan(entitas.departemen.fields, { ...dasar, induk_id: "1; DROP TABLE x" }).galat.length, 1);
  const ok = bersihkan(entitas.departemen.fields, { ...dasar, induk_id: '' });
  assert.strictEqual(ok.galat.length, 0);
  assert.strictEqual(ok.nilai.induk_id, null);
});

test('validasi: teks terlalu panjang ditolak', () => {
  const { galat } = bersihkan(entitas.perusahaan.fields, { nama: 'x'.repeat(201) });
  assert.strictEqual(galat.length, 1);
});

test('struktur: menyusun pohon departemen', () => {
  const pohon = susunPohon([
    { id: 1, induk_id: null }, { id: 2, induk_id: 1 }, { id: 3, induk_id: 2 }, { id: 4, induk_id: null },
  ]);
  assert.strictEqual(pohon.length, 2);
  assert.strictEqual(pohon[0].anak[0].anak[0].id, 3);
});

test('entitas: semua kolom tampil dan rujukan terdefinisi', () => {
  for (const [kunci, def] of Object.entries(entitas)) {
    for (const k of def.kolom) assert.ok(def.fields.some((f) => f.nama === k), `${kunci}.${k}`);
    for (const f of def.fields.filter((x) => x.ref)) assert.ok(entitas[f.ref.entitas], `${kunci}.${f.nama}`);
  }
});
