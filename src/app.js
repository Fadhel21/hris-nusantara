const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { muat } = require('./config/env');
const menu = require('./config/menu');
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
      },
    },
  }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser(env.cookieSecret));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/sehat', (req, res) => res.json({ status: 'ok' }));

  app.use(csrf);
  app.use(muatPengguna);
  app.use((req, res, next) => {
    res.locals.menu = req.pengguna ? menu.filter((m) => m.peran.includes(req.pengguna.peran)) : [];
    res.locals.halaman = req.path;
    next();
  });

  app.use(require('./modules/pengguna/routes'));
  app.use(require('./modules/organisasi/routes'));
  app.get('/', wajibMasuk, (req, res) => res.render('beranda/index'));

  app.use(tidakDitemukan);
  app.use(tanganiError);
  return app;
}

module.exports = { buatApp };
