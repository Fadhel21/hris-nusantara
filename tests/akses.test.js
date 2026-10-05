const test = require('node:test');
const assert = require('node:assert');
const { butuhPeran } = require('../src/middleware/akses');
const { csrf } = require('../src/middleware/csrf');

process.env.DATABASE_URL = 'x';
process.env.JWT_SECRET = 'rahasia-tes';
process.env.COOKIE_SECRET = 'rahasia-cookie-tes';

function jalankan(mw, req) {
  return new Promise((resolve) => mw(req, {}, (err) => resolve(err)));
}

test('akses: peran yang tidak berhak ditolak 403', async () => {
  const err = await jalankan(butuhPeran('hr', 'admin'), { pengguna: { peran: 'karyawan' } });
  assert.strictEqual(err.status, 403);
});

test('akses: tanpa login ditolak 403', async () => {
  const err = await jalankan(butuhPeran('hr'), {});
  assert.strictEqual(err.status, 403);
});

test('akses: peran yang berhak lolos', async () => {
  const err = await jalankan(butuhPeran('hr'), { pengguna: { peran: 'hr' } });
  assert.strictEqual(err, undefined);
});

function csrfReq(method, { cookie, body, header } = {}) {
  const res = { locals: {}, cookie() {} };
  const req = {
    method, signedCookies: cookie ? { _csrf: cookie } : {}, body: body || {},
    get: (n) => (n === 'x-csrf-token' ? header : undefined),
  };
  return new Promise((resolve) => csrf(req, res, (err) => resolve({ err, res })));
}

test('csrf: POST tanpa token ditolak', async () => {
  const { err } = await csrfReq('POST', { cookie: 'abc' });
  assert.strictEqual(err.status, 403);
});

test('csrf: POST dengan token salah ditolak', async () => {
  const { err } = await csrfReq('POST', { cookie: 'abc', body: { _csrf: 'xyz' } });
  assert.strictEqual(err.status, 403);
});

test('csrf: POST dengan token benar (form atau header HTMX) lolos', async () => {
  assert.strictEqual((await csrfReq('POST', { cookie: 'abc', body: { _csrf: 'abc' } })).err, undefined);
  assert.strictEqual((await csrfReq('POST', { cookie: 'abc', header: 'abc' })).err, undefined);
});

test('csrf: GET selalu lolos dan menyediakan token', async () => {
  const { err, res } = await csrfReq('GET');
  assert.strictEqual(err, undefined);
  assert.match(res.locals.csrfToken, /^[0-9a-f]{64}$/);
});
