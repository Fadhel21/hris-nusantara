// Kontras warna (WCAG 2.x) dihitung langsung dari token.css agar perubahan token tidak merusak keterbacaan.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'token.css'), 'utf8');
const token = new Map();
for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) token.set(m[1], m[2].trim());

function nilai(nama, kedalaman = 0) {
  let v = token.get(nama);
  assert.ok(v !== undefined, `token --${nama} tidak ada`);
  const ref = /^var\(--([a-z0-9-]+)\)$/.exec(v);
  if (ref && kedalaman < 10) return nilai(ref[1], kedalaman + 1);
  return v;
}

function luminans(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function rasio(a, b) {
  const [x, y] = [luminans(nilai(a)), luminans(nilai(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const PASANGAN_TEKS = [
  ['warna-teks', 'warna-permukaan', 'teks di kartu'],
  ['warna-teks', 'warna-latar', 'teks di latar halaman'],
  ['warna-teks-redup', 'warna-permukaan', 'teks redup di kartu'],
  ['warna-teks-redup', 'warna-latar', 'teks redup di latar halaman'],
  ['warna-utama', 'warna-permukaan', 'tautan di kartu'],
  ['warna-di-atas-utama', 'warna-utama', 'teks tombol utama'],
  ['warna-di-atas-utama', 'warna-utama-hover', 'teks tombol utama (hover)'],
  ['warna-bahaya', 'warna-permukaan', 'tautan/aksi bahaya'],
  ['abu-0', 'warna-bahaya', 'teks tombol bahaya'],
  ['bahaya-teks', 'warna-bahaya-lembut', 'pesan galat'],
  ['sukses-teks', 'sukses-bg', 'pesan sukses & lencana ok'],
  ['peringatan-teks', 'peringatan-bg', 'pesan peringatan'],
  ['info-teks', 'info-bg', 'pesan info'],
  ['warna-utama-di-lembut', 'warna-utama-lembut', 'ikon/teks pada latar biru lembut'],
  ['sidebar-teks', 'navy-900', 'teks sidebar di atas navy'],
  ['sidebar-teks', 'navy-950', 'teks sidebar di dasar gradasi'],
  ['sidebar-teks-aktif', 'navy-800', 'teks sidebar aktif'],
  ['abu-0', 'navy-900', 'teks putih di panel gelap'],
];

for (const [fg, bg, ket] of PASANGAN_TEKS) {
  test(`kontras: ${ket} (${fg} / ${bg}) >= 4,5:1`, () => {
    const r = rasio(fg, bg);
    assert.ok(r >= 4.5, `${fg} di atas ${bg} hanya ${r.toFixed(2)}:1`);
  });
}

test('kontras: batas isian (komponen non-teks) >= 3:1 terhadap permukaan', () => {
  const r = rasio('isian-garis', 'warna-permukaan');
  assert.ok(r >= 3, `garis isian hanya ${r.toFixed(2)}:1`);
});

test('token: komponen hanya merujuk token yang ada (tidak ada var() yatim)', () => {
  for (const [nama, v] of token) {
    for (const m of v.matchAll(/var\(--([a-z0-9-]+)\)/g)) assert.ok(token.has(m[1]), `--${nama} merujuk --${m[1]} yang tidak ada`);
  }
});

test('token: target sentuh minimal 44px', () => {
  assert.strictEqual(parseInt(nilai('tombol-tinggi'), 10) >= 44, true);
});
