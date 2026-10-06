const express = require('express');
const ringkasan = require('./services/ringkasan');
const { wajibMasuk } = require('../../middleware/auth');

const router = express.Router();

router.get('/', wajibMasuk, async (req, res, next) => {
  try {
    res.render('beranda/index', await ringkasan.untuk(req.pengguna));
  } catch (err) { next(err); }
});

module.exports = router;
