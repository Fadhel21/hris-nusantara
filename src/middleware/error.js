// 404 dan penanganan error. Detail hanya ke konsol, tanpa data sensitif.
function tidakDitemukan(req, res, next) {
  const err = new Error('Halaman tidak ditemukan.');
  err.status = 404;
  next(err);
}

function escapeHtml(s) {
  const peta = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s).replace(/[&<>"']/g, (c) => peta[c]);
}

// eslint-disable-next-line no-unused-vars
function tanganiError(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(`Kesalahan: ${err.message}`);
  const pesan = status >= 500 ? 'Terjadi kesalahan pada server.' : err.message;
  if (req.get('HX-Request')) return res.status(status).send(`<p class="galat">${escapeHtml(pesan)}</p>`);
  return res.status(status).render('galat', {
    status, pesan, pengguna: res.locals.pengguna || null, csrfToken: res.locals.csrfToken || '',
    menu: res.locals.menu || [], halaman: req.path,
  });
}

module.exports = { tidakDitemukan, tanganiError };
