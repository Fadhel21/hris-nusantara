const test = require('node:test');
const assert = require('node:assert');
const { bacaCsv, validasi } = require('../src/modules/penggajian/services/csv');

test('csv: pemisah koma, titik koma, BOM, CRLF, dan sel berkutip', () => {
  assert.deepStrictEqual(bacaCsv('a,b,c\n1,2,3\n').baris, [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepStrictEqual(bacaCsv('a;b;c\r\n1;2;3').baris, [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.strictEqual(bacaCsv('a;b\n1;2').pemisah, ';');
  assert.deepStrictEqual(bacaCsv('﻿a,b\n"x, y","say ""hi"""\n').baris, [['a', 'b'], ['x, y', 'say "hi"']]);
  assert.deepStrictEqual(bacaCsv('a,b\n\n  \n1,2\n').baris, [['a', 'b'], ['1', '2']]);
  assert.throws(() => bacaCsv('a,b\n"tak ditutup,2'), /kutip/);
});

const TER = 'kategori,batas_bawah,batas_atas,tarif,tanggal_berlaku\n';
test('csv ter: data sah dan ringkasan per kelompok', () => {
  const r = validasi('ter', `${TER}A,0,100,0,2026-01-01\nA,101,500,1.5,2026-01-01\nA,501,,3,2026-01-01\nB,0,,2,2026-01-01\n`);
  assert.deepStrictEqual(r.galat, []);
  assert.strictEqual(r.data.length, 4);
  assert.strictEqual(r.data[2].batas_atas, null);
  assert.deepStrictEqual(r.ringkasan.map((x) => x.baris), [3, 1]);
});

test('csv ter: judul salah, kolom kurang, angka salah, tanggal salah, kategori asing dilaporkan dengan nomor baris', () => {
  assert.match(validasi('ter', 'kat,bawah\n').galat[0], /Judul kolom harus persis/);
  assert.match(validasi('ter', `${TER}A,0,100,0\n`).galat[0], /Baris 2: jumlah kolom 4/);
  const r = validasi('ter', `${TER}Z,0,100,0,2026-01-01\nA,1.000,100,0,2026-01-01\nA,0,100,150,2026-01-01\nA,0,100,0,2026-13-01\n`);
  assert.ok(r.galat.some((g) => /Baris 2: kategori/.test(g)));
  assert.ok(r.galat.some((g) => /Baris 3: batas_bawah/.test(g)));
  assert.ok(r.galat.some((g) => /Baris 4: tarif/.test(g)));
  assert.ok(r.galat.some((g) => /Baris 5: tanggal_berlaku/.test(g)));
});

test('csv ter: tidak mulai dari 0, bertumpuk, atau ganda ditolak', () => {
  assert.ok(validasi('ter', `${TER}A,100,200,1,2026-01-01\n`).galat.some((g) => /mulai dari 0/.test(g)));
  assert.ok(validasi('ter', `${TER}A,0,300,1,2026-01-01\nA,200,,2,2026-01-01\n`).galat.some((g) => /tumpang tindih/.test(g)));
  assert.ok(validasi('ter', `${TER}A,0,100,1,2026-01-01\nA,0,200,2,2026-01-01\n`).galat.some((g) => /ganda/.test(g)));
  assert.ok(validasi('ter', `${TER}A,0,100,1,2026-01-01\nA,50,40,2,2026-01-01\n`).galat.length > 0);
});

test('csv lapisan: sah bila bersambung dan terakhir terbuka; selain itu ditolak', () => {
  const H = 'batas_bawah,batas_atas,tarif,tanggal_berlaku\n';
  assert.deepStrictEqual(validasi('lapisan', `${H}0,60000000,5,2026-01-01\n60000000,250000000,15,2026-01-01\n250000000,,25,2026-01-01\n`).galat, []);
  assert.ok(validasi('lapisan', `${H}0,60,5,2026-01-01\n70,,15,2026-01-01\n`).galat.some((g) => /tidak bersambung/.test(g)));
  assert.ok(validasi('lapisan', `${H}0,60,5,2026-01-01\n60,100,15,2026-01-01\n`).galat.some((g) => /terakhir harus tanpa batas/.test(g)));
});

test('csv ptkp: kode, kategori, dan duplikasi', () => {
  const H = 'kode,ptkp_tahunan,kategori_ter,tanggal_berlaku\n';
  assert.deepStrictEqual(validasi('ptkp', `${H}TK/0,54000000,A,2026-01-01\nK/1,63000000,B,2026-01-01\n`).galat, []);
  assert.ok(validasi('ptkp', `${H}TK/0,54000000,D,2026-01-01\n`).galat.some((g) => /kategori_ter/.test(g)));
  assert.ok(validasi('ptkp', `${H}TK/0,54000000,A,2026-01-01\ntk/0,54000000,A,2026-01-01\n`).galat.some((g) => /ganda/.test(g)));
  assert.ok(validasi('ptkp', `${H}TK 0,54000000,A,2026-01-01\n`).galat.some((g) => /kode status/.test(g)));
});

test('csv: jenis tak dikenal, kosong, dan batas baris', () => {
  assert.match(validasi('xxx', 'a').galat[0], /tidak dikenal/);
  assert.match(validasi('ter', '').galat[0], /kosong/);
  assert.match(validasi('ter', TER).galat[0], /Tidak ada baris data/);
});
