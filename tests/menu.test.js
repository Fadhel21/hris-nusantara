// Setiap menu harus punya ikon yang terdaftar agar sidebar dan jejak halaman tidak jatuh ke ikon bawaan.
const test = require('node:test');
const assert = require('node:assert');
const menu = require('../src/config/menu');
const { BENTUK, IKON_GRUP } = require('../src/config/ikon');

test('menu: semua item punya ikon yang terdaftar', () => {
  for (const m of menu) assert.ok(BENTUK[m.ikon], `menu "${m.label}" tanpa ikon valid (${m.ikon})`);
});
test('menu: setiap kelompok punya ikon kelompok', () => {
  for (const g of new Set(menu.filter((m) => m.grup).map((m) => m.grup))) assert.ok(BENTUK[IKON_GRUP[g]], `kelompok ${g} tanpa ikon`);
});
test('menu: ikon sub-menu dalam satu kelompok tidak kembar', () => {
  const per = {};
  for (const m of menu.filter((x) => x.grup)) (per[m.grup] = per[m.grup] || []).push(m.ikon);
  for (const [g, daftar] of Object.entries(per)) assert.strictEqual(new Set(daftar).size, daftar.length, `ikon kembar di ${g}`);
});
