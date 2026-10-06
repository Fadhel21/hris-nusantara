const auth = require('../services/auth');
const audit = require('../services/audit');
const demo = require('../services/demo');
const { muat } = require('../../../config/env');
const { buatSesi, hapusSesi } = require('../../../middleware/auth');

// Akun demo hanya diteruskan ke tampilan bila DEMO_AKUN=true (ditolak di produksi oleh config/env.js).
function renderMasuk(res, status, { galat = null, username = '' } = {}) {
  const aktif = muat().demoAkun;
  return res.status(status).render('pengguna/masuk', {
    galat, username, akunDemo: aktif ? demo.AKUN_DEMO : [], passwordDemo: demo.PASSWORD_DEMO,
  });
}

function formMasuk(req, res) {
  if (req.pengguna) return res.redirect('/');
  return renderMasuk(res, 200);
}

async function prosesMasuk(req, res, next) {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) {
    return renderMasuk(res, 400, { galat: 'Username dan password wajib diisi.', username });
  }
  try {
    const pengguna = await auth.masuk(username, password);
    buatSesi(res, pengguna);
    return res.redirect('/');
  } catch (err) {
    if (err instanceof auth.GalatAuth) {
      return renderMasuk(res, 401, { galat: err.message, username });
    }
    return next(err);
  }
}

async function keluar(req, res, next) {
  try {
    await audit.catat({ penggunaId: req.pengguna.id, aksi: 'logout', entitas: 'pengguna', entitasId: req.pengguna.id });
    hapusSesi(res);
    res.redirect('/masuk');
  } catch (err) { next(err); }
}

module.exports = { formMasuk, prosesMasuk, keluar };
