// Membuat pengguna admin awal. Pakai: node scripts/seed.js <username> [password]
// Tanpa password, dibuat acak dan ditampilkan sekali.
const crypto = require('node:crypto');
const db = require('../src/config/db');
const auth = require('../src/modules/pengguna/services/auth');
const audit = require('../src/modules/pengguna/services/audit');

async function jalankan() {
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || crypto.randomBytes(9).toString('base64url');
  const id = await db.transaksi(async (c) => {
    const baru = await auth.buat({ username, password, peranKode: 'admin' }, c);
    await audit.catat({ aksi: 'buat', entitas: 'pengguna', entitasId: baru, sesudah: { username, peran: 'admin' } }, c);
    return baru;
  });
  console.log(`Admin dibuat (id ${id}). Username: ${username}`);
  if (!process.argv[3]) console.log(`Password sementara (catat, tidak ditampilkan lagi): ${password}`);
}

jalankan()
  .catch((err) => { console.error(`Seed gagal: ${err.message}`); process.exitCode = 1; })
  .finally(() => db.tutup());
