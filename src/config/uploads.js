// Lokasi folder unggahan. Folder ini di luar /public sehingga tidak bisa diakses langsung lewat URL;
// berkas hanya dilayani oleh route yang memeriksa hak akses.
const path = require('node:path');

const FOLDER = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', '..', 'uploads');

// Mengubah path relatif (dari DB) menjadi path absolut, dan menolak yang keluar dari folder unggahan.
function jalurAman(relatif) {
  const mutlak = path.resolve(FOLDER, relatif);
  if (mutlak !== FOLDER && !mutlak.startsWith(FOLDER + path.sep)) {
    throw new Error('Jalur berkas tidak valid.');
  }
  return mutlak;
}

module.exports = { FOLDER, jalurAman };
