// Koneksi PostgreSQL dan helper transaksi. Semua service memakai helper ini.
const { Pool } = require('pg');
const { muat } = require('./env');

let pool;

function ambilPool() {
  if (!pool) pool = new Pool({ connectionString: muat().databaseUrl });
  return pool;
}

function query(teks, params) {
  return ambilPool().query(teks, params);
}

// Menjalankan fungsi dalam satu BEGIN...COMMIT; ROLLBACK bila gagal.
// fn menerima client; semua query di dalamnya harus lewat client itu.
async function transaksi(fn) {
  const client = await ambilPool().connect();
  try {
    await client.query('BEGIN');
    const hasil = await fn(client);
    await client.query('COMMIT');
    return hasil;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* abaikan */ }
    throw err;
  } finally {
    client.release();
  }
}

async function tutup() {
  if (pool) { await pool.end(); pool = undefined; }
}

module.exports = { query, transaksi, tutup };
