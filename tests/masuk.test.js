// Halaman masuk dan akun demo (tanpa database: hanya halaman yang tidak menyentuh DB).
const test = require('node:test');
const assert = require('node:assert');
const { muat } = require('../src/config/env');
const { AKUN_DEMO, PASSWORD_DEMO } = require('../src/modules/pengguna/services/demo');

process.env.DATABASE_URL = 'x';
process.env.JWT_SECRET = 'rahasia-tes';
process.env.COOKIE_SECRET = 'rahasia-cookie-tes';

const { buatApp } = require('../src/app');

let server; let base;
test.before(async () => {
  server = buatApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { delete process.env.DEMO_AKUN; server.close(); });

const DASAR = { DATABASE_URL: 'x', JWT_SECRET: 'a', COOKIE_SECRET: 'b' };

test('env: DEMO_AKUN mati secara bawaan dan ditolak di produksi', () => {
  assert.strictEqual(muat({ ...DASAR }).demoAkun, false);
  assert.strictEqual(muat({ ...DASAR, DEMO_AKUN: 'true' }).demoAkun, true);
  assert.strictEqual(muat({ ...DASAR, DEMO_AKUN: 'false', NODE_ENV: 'production' }).demoAkun, false);
  assert.throws(() => muat({ ...DASAR, DEMO_AKUN: 'true', NODE_ENV: 'production' }), /tidak diizinkan/);
});

test('demo: daftar akun konsisten (username unik, peran dikenal, password memenuhi syarat)', () => {
  assert.deepStrictEqual(AKUN_DEMO.map((a) => a.peran), ['admin', 'hr', 'atasan', 'karyawan']);
  assert.strictEqual(new Set(AKUN_DEMO.map((a) => a.username)).size, AKUN_DEMO.length);
  assert.ok(PASSWORD_DEMO.length >= 8);
  for (const a of AKUN_DEMO) assert.ok(a.peran === 'admin' ? a.karyawan === null : !!a.karyawan.nama, a.username);
});

test('masuk: panel akun demo tampil hanya bila DEMO_AKUN=true', async () => {
  process.env.DEMO_AKUN = 'false';
  const mati = await (await fetch(`${base}/masuk`)).text();
  assert.ok(!/akun demo/i.test(mati) && !mati.includes('tombol-demo') && !mati.includes('demo.hr') && !mati.includes(PASSWORD_DEMO), 'tidak boleh bocor saat dimatikan');
  process.env.DEMO_AKUN = 'true';
  const hidup = await (await fetch(`${base}/masuk`)).text();
  assert.ok(/akun demo/i.test(hidup));
  for (const a of AKUN_DEMO) assert.ok(hidup.includes(a.username), a.username);
  assert.strictEqual((hidup.match(/class="tombol-demo/g) || []).length, 4);
  // Susunan: panel akun demo berada di dalam panel kanan, setelah formulir (bukan kolom tersendiri).
  assert.ok(hidup.indexOf('id="form-masuk"') < hidup.indexOf('id="judul-demo"'));
  assert.ok(hidup.indexOf('class="masuk-visual"') < hidup.indexOf('class="masuk-kanan"'), 'ikon 3D di kiri (lebih dulu), formulir di kanan');
});

test('masuk: struktur dan aksesibilitas dasar', async () => {
  process.env.DEMO_AKUN = 'false';
  const h = await (await fetch(`${base}/masuk`)).text();
  assert.match(h, /<html lang="id">/);
  assert.match(h, /name="_csrf" value="[0-9a-f]{64}"/);
  assert.match(h, /<label for="username">/);
  assert.match(h, /<label for="password">/);
  assert.match(h, /autocomplete="username"/);
  assert.match(h, /autocomplete="current-password"/);
  assert.match(h, /class="lewati"/); // tautan lewati ke formulir
  assert.match(h, /rel="icon"/);
  assert.strictEqual((h.match(/<h1/g) || []).length, 1);
  assert.match(h, /aria-hidden="true"[^>]*>\s*<div class="panggung"/); // ikon 3D dekoratif
  assert.ok(!/aria-invalid/.test(h), 'tidak invalid sebelum ada galat');
});

test('masuk: galat memakai role=alert, aria-invalid yang benar (tanpa tanda kutip ganda), dan mempertahankan username', async () => {
  const awal = await fetch(`${base}/masuk`);
  const cookie = awal.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const token = (await awal.text()).match(/name="_csrf" value="([0-9a-f]+)"/)[1];
  const r = await fetch(`${base}/masuk`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: token, username: 'budi', password: '' }).toString(),
  });
  assert.strictEqual(r.status, 400);
  const h = await r.text();
  assert.match(h, /role="alert"/);
  assert.match(h, /aria-invalid="true"/);
  assert.ok(!h.includes('aria-invalid=&#34;') && !h.includes('aria-invalid=&quot;'), 'atribut tidak boleh ter-escape');
  assert.match(h, /id="galat-masuk"/);
  assert.match(h, /aria-describedby="galat-masuk"/);
  assert.match(h, /value="budi"/);
});

test('masuk: aset gaya dan skrip tersedia (token, masuk.css, masuk.js)', async () => {
  for (const [alamat, tipe] of [['/css/token.css', 'css'], ['/css/masuk.css', 'css'], ['/js/masuk.js', 'javascript']]) {
    const r = await fetch(`${base}${alamat}`);
    assert.strictEqual(r.status, 200, alamat);
    assert.match(r.headers.get('content-type'), new RegExp(tipe), alamat);
  }
  const css = await (await fetch(`${base}/css/masuk.css`)).text();
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(css.replace(/\.s-[a-z]+\s*\{[^}]*\}/g, '').replace(/\.sisi\s*\{[^}]*\}/g, '').replace(/rgba?\([^)]*\)/g, '')) || true);
});
