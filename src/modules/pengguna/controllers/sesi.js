const auth = require('../services/auth');
const audit = require('../services/audit');
const { buatSesi, hapusSesi } = require('../../../middleware/auth');

function formMasuk(req, res) {
  if (req.pengguna) return res.redirect('/');
  return res.render('pengguna/masuk', { galat: null, username: '' });
}

async function prosesMasuk(req, res, next) {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) {
    return res.status(400).render('pengguna/masuk', { galat: 'Username dan password wajib diisi.', username });
  }
  try {
    const pengguna = await auth.masuk(username, password);
    buatSesi(res, pengguna);
    return res.redirect('/');
  } catch (err) {
    if (err instanceof auth.GalatAuth) {
      return res.status(401).render('pengguna/masuk', { galat: err.message, username });
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
