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

// Pesan untuk galat bawaan Express/body-parser yang berbahasa Inggris.
function pesanUntuk(err, status) {
  if (status >= 500) return 'Terjadi kesalahan pada server.';
  if (err.type === 'entity.too.large') return 'Ukuran berkas melebihi batas.';
  if (err.type === 'entity.parse.failed' || err.type === 'encoding.unsupported') return 'Permintaan tidak dapat dibaca.';
  return err.message;
}

// eslint-disable-next-line no-unused-vars
function tanganiError(err, req, res, next) {
  const status = err.type === 'entity.too.large' ? 413 : (err.status || err.statusCode || 500);
  if (status >= 500) console.error(`Kesalahan: ${err.message}`);
  const pesan = pesanUntuk(err, status);
  if ((req.get('accept') || '').includes('application/json')) return res.status(status).json({ galat: pesan });
  if (req.get('HX-Request')) return res.status(status).send(`<p class="galat">${escapeHtml(pesan)}</p>`);
  return res.status(status).render('galat', {
    status, pesan, pengguna: res.locals.pengguna || null, csrfToken: res.locals.csrfToken || '',
    menu: res.locals.menu || [], halaman: req.path,
  });
}

module.exports = { tidakDitemukan, tanganiError };
