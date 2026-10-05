// Perlindungan CSRF (double-submit dengan cookie bertanda tangan).
const crypto = require('node:crypto');
const { muat } = require('../config/env');

const COOKIE = '_csrf';
const AMAN = new Set(['GET', 'HEAD', 'OPTIONS']);

function sama(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function csrf(req, res, next) {
  let token = req.signedCookies && req.signedCookies[COOKIE];
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(COOKIE, token, { httpOnly: true, signed: true, sameSite: 'lax', secure: muat().cookieSecure });
  }
  res.locals.csrfToken = token;
  if (AMAN.has(req.method)) return next();

  const kiriman = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (kiriman && sama(kiriman, token)) return next();
  const err = new Error('Token keamanan tidak valid. Muat ulang halaman lalu coba lagi.');
  err.status = 403;
  return next(err);
}

module.exports = { csrf };
