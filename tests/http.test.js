// Uji HTTP tanpa database: halaman yang tidak menyentuh DB.
const test = require('node:test');
const assert = require('node:assert');

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
test.after(() => server.close());

test('http: beranda tanpa login diarahkan ke /masuk', async () => {
  const r = await fetch(`${base}/`, { redirect: 'manual' });
  assert.strictEqual(r.status, 302);
  assert.strictEqual(r.headers.get('location'), '/masuk');
});

test('http: halaman masuk tampil dengan token CSRF', async () => {
  const r = await fetch(`${base}/masuk`);
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /name="_csrf" value="[0-9a-f]{64}"/);
});

test('http: POST /masuk tanpa token CSRF ditolak 403', async () => {
  const r = await fetch(`${base}/masuk`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'username=admin&password=apapun',
  });
  assert.strictEqual(r.status, 403);
});

test('http: halaman tidak ada memberi 404', async () => {
  const r = await fetch(`${base}/tidak-ada`);
  assert.strictEqual(r.status, 404);
});

test('http: rute organisasi tanpa login diarahkan ke /masuk', async () => {
  const r = await fetch(`${base}/organisasi/cabang`, { redirect: 'manual' });
  assert.strictEqual(r.status, 302);
  assert.strictEqual(r.headers.get('location'), '/masuk');
});
