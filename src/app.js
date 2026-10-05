const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { muat } = require('./config/env');

function buatApp() {
  const env = muat();
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(helmet());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser(env.cookieSecret));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/sehat', (req, res) => res.json({ status: 'ok' }));

  // Penanganan error: pesan umum ke pengguna, detail hanya di konsol (tanpa data sensitif).
  app.use((err, req, res, next) => {
    console.error(`Kesalahan: ${err.message}`);
    res.status(500).send('Terjadi kesalahan pada server.');
  });
  return app;
}

module.exports = { buatApp };
