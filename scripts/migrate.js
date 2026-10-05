// Menjalankan file migrasi bernomor di /migrations secara berurutan.
// Migrasi yang sudah berjalan tidak dijalankan lagi dan tidak boleh diedit.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../src/config/db');

const FOLDER = path.join(__dirname, '..', 'migrations');

async function jalankan() {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nama TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    dijalankan_pada TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const sudah = new Map((await db.query('SELECT nama, checksum FROM schema_migrations')).rows
    .map((r) => [r.nama, r.checksum]));
  const berkas = fs.readdirSync(FOLDER).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

  for (const nama of berkas) {
    const sql = fs.readFileSync(path.join(FOLDER, nama), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    if (sudah.has(nama)) {
      if (sudah.get(nama) !== checksum) {
        throw new Error(`Migrasi ${nama} sudah dijalankan lalu diubah. Migrasi lama tidak boleh diedit.`);
      }
      continue;
    }
    await db.transaksi(async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations (nama, checksum) VALUES ($1, $2)', [nama, checksum]);
    });
    console.log(`Migrasi dijalankan: ${nama}`);
  }
  console.log('Migrasi selesai.');
}

jalankan()
  .catch((err) => { console.error(`Migrasi gagal: ${err.message}`); process.exitCode = 1; })
  .finally(() => db.tutup());
