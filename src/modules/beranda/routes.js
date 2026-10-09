const express = require('express');
const ringkasan = require('./services/ringkasan');
const { wajibMasuk } = require('../../middleware/auth');
const menu = require('../../config/menu');

const router = express.Router();

router.get('/', wajibMasuk, async (req, res, next) => {
  try {
    res.render('beranda/index', await ringkasan.untuk(req.pengguna, { modeKaryawan: req.modeKaryawan && menu.bisaGantiMode(req.pengguna) }));
  } catch (err) { next(err); }
});

// Ganti mode tampilan (Kerja <-> Karyawan). Hanya untuk akun yang boleh berganti mode.
router.post('/mode', wajibMasuk, (req, res) => {
  if (menu.bisaGantiMode(req.pengguna)) {
    const karyawan = req.body.mode === 'karyawan';
    res.cookie('mode', karyawan ? 'karyawan' : 'kerja', { httpOnly: true, sameSite: 'lax', maxAge: 365 * 24 * 3600 * 1000, path: '/' });
  }
  res.redirect('/');
});

module.exports = router;
