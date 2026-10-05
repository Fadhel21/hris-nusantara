// Pencatatan jejak audit. Jangan pernah memasukkan password atau data sensitif ke sebelum/sesudah.
const db = require('../../../config/db');

// exec: db atau client transaksi (punya .query).
async function catat({ penggunaId = null, aksi, entitas, entitasId = null, sebelum = null, sesudah = null }, exec = db) {
  await exec.query(
    `INSERT INTO audit_log (pengguna_id, aksi, entitas, entitas_id, sebelum, sesudah)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [penggunaId, aksi, entitas, entitasId === null ? null : String(entitasId),
      sebelum && JSON.stringify(sebelum), sesudah && JSON.stringify(sesudah)]
  );
}

module.exports = { catat };
