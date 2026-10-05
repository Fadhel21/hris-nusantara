// Pembersihan foto absensi yang melewati masa simpan. Catatan absensinya tetap ada;
// hanya berkas foto yang dihapus dan foto_path dikosongkan.
const fs = require('node:fs/promises');
const db = require('../../../config/db');
const { jalurAman } = require('../../../config/uploads');
const pengaturan = require('./pengaturan');

const BATCH = 500;

// Mengembalikan jumlah foto yang dibersihkan. `sekarang` hanya untuk pengujian.
async function bersihkanFotoAbsensi(sekarang = null) {
  const bulan = await pengaturan.ambilRetensi();
  let total = 0;
  for (;;) {
    const { rows } = await db.query(
      `SELECT id, foto_path FROM absensi_catat
        WHERE foto_path IS NOT NULL AND waktu < (COALESCE($2::timestamptz, now()) - make_interval(months => $1))
        ORDER BY id LIMIT ${BATCH}`, [bulan, sekarang]);
    if (!rows.length) break;
    let berhasil = 0;
    for (const r of rows) {
      try {
        await fs.unlink(jalurAman(r.foto_path));
      } catch (err) {
        if (err.code !== 'ENOENT') { console.error(`Gagal menghapus foto absensi ${r.id}: ${err.message}`); continue; }
      }
      await db.query('UPDATE absensi_catat SET foto_path = NULL, updated_at = now() WHERE id = $1', [r.id]);
      berhasil += 1;
    }
    total += berhasil;
    // Berhenti bila satu batch penuh tidak membuahkan kemajuan, agar tidak berputar tanpa akhir.
    if (rows.length < BATCH || berhasil === 0) break;
  }
  return total;
}

module.exports = { bersihkanFotoAbsensi };
