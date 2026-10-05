// Autentikasi lewat JWT di signed cookie.
const jwt = require('jsonwebtoken');
const { muat } = require('../config/env');
const auth = require('../modules/pengguna/services/auth');

const NAMA_COOKIE = 'sesi';
const MASA_JAM = 8;

function opsiCookie(env) {
  return { httpOnly: true, signed: true, sameSite: 'lax', secure: env.cookieSecure, maxAge: MASA_JAM * 3600 * 1000 };
}

function buatSesi(res, pengguna) {
  const env = muat();
  const token = jwt.sign({ sub: String(pengguna.id) }, env.jwtSecret, { expiresIn: `${MASA_JAM}h` });
  res.cookie(NAMA_COOKIE, token, opsiCookie(env));
}

function hapusSesi(res) {
  res.clearCookie(NAMA_COOKIE);
}

// Mengisi req.pengguna bila sesi valid dan akun masih aktif; tidak menolak.
async function muatPengguna(req, res, next) {
  try {
    const token = req.signedCookies && req.signedCookies[NAMA_COOKIE];
    if (token) {
      try {
        const { sub } = jwt.verify(token, muat().jwtSecret);
        req.pengguna = await auth.ambilAktif(sub);
      } catch (e) {
        if (e.name !== 'JsonWebTokenError' && e.name !== 'TokenExpiredError') throw e;
      }
      if (!req.pengguna) hapusSesi(res);
    }
    res.locals.pengguna = req.pengguna || null;
    next();
  } catch (err) { next(err); }
}

function wajibMasuk(req, res, next) {
  if (req.pengguna) return next();
  if (req.get('HX-Request')) { res.set('HX-Redirect', '/masuk'); return res.status(401).end(); }
  return res.redirect('/masuk');
}

module.exports = { buatSesi, hapusSesi, muatPengguna, wajibMasuk, NAMA_COOKIE };
