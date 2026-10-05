const test = require('node:test');
const assert = require('node:assert');
const { muat } = require('../src/config/env');

test('env: menolak bila variabel wajib kosong', () => {
  assert.throws(() => muat({}), /belum diisi/);
});

test('env: membaca nilai yang valid', () => {
  const e = muat({ DATABASE_URL: 'x', JWT_SECRET: 'a', COOKIE_SECRET: 'b', PORT: '4000' });
  assert.strictEqual(e.port, 4000);
  assert.strictEqual(e.cookieSecure, false);
});
