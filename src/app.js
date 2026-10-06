const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { muat } = require('./config/env');
const menu = require('./config/menu');
const ikon = require('./config/ikon');
const format = require('./modules/karyawan/services/format');
const waktu = require('./modules/absensi/services/waktu');
const { muatPengguna, wajibMasuk } = require('./middleware/auth');
const { csrf } = require('./middleware/csrf');
const { tidakDitemukan, tanganiError } = require('./middleware/error');

function buatApp() {
  const env = muat();
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  // CSP bawaan helmet; Alpine (build standar) butuh 'unsafe-eval'.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-eval'"],
        // blob: dipakai pengecilan foto di browser (gambar sementara sebelum diunggah).
        'img-src': ["'self'", 'data:', 'blob:'],
      },
    },
  }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser(env.cookieSecret));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/sehat', (req, res) => res.json({ status: 'ok' }));

  // Pembantu tampilan: ikon SVG inline dan peta ikon kelompok menu.
  app.use((req, res, next) => { res.locals.ikon = ikon.ikon; res.locals.ikonGrup = ikon.IKON_GRUP; next(); });

  app.use(csrf);
  app.use(muatPengguna);
  app.use((req, res, next) => {
    res.locals.menu = req.pengguna ? menu.filter((m) => m.peran.includes(req.pengguna.peran)) : [];
    res.locals.halaman = req.path;
    res.locals.fmt = {
      rupiah: format.rupiah,
      tanggal: format.tanggal,
      hari: (t) => ['', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'][waktu.hariKe(t)],
    };
    next();
  });

  app.use(require('./modules/pengguna/routes'));
  app.use(require('./modules/organisasi/routes'));
  app.use(require('./modules/karyawan/routes'));
  app.use(require('./modules/absensi/routes'));
  app.use(require('./modules/persetujuan/routes'));
  app.use(require('./modules/cuti/routes'));
  app.use(require('./modules/penggajian/routes'));
  app.use(require('./modules/beranda/routes'));

  app.use(tidakDitemukan);
  app.use(tanganiError);
  return app;
}

module.exports = { buatApp };
