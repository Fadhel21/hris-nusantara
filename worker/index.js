// Proses worker terpisah: job terjadwal. Jalankan dengan `npm run worker`.
const cron = require('node-cron');
const db = require('../src/config/db');
const { bersihkanFotoAbsensi } = require('../src/modules/absensi/services/pembersihan');

const ZONA = 'Asia/Jakarta';

// Membungkus job agar galat satu job tidak mematikan worker.
function jalankan(nama, fungsi) {
  return async () => {
    try {
      const hasil = await fungsi();
      console.log(`[${new Date().toISOString()}] ${nama}: selesai${hasil === undefined ? '' : ` (${hasil})`}`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] ${nama}: gagal - ${err.message}`);
    }
  };
}

// Setiap hari pukul 02:00 WIB: hapus foto absensi yang melewati masa simpan.
cron.schedule('0 2 * * *', jalankan('bersihkan foto absensi', bersihkanFotoAbsensi), { timezone: ZONA });

console.log('Worker berjalan. Job terdaftar: bersihkan foto absensi (02:00 WIB).');

async function berhenti() {
  await db.tutup();
  process.exit(0);
}
process.on('SIGINT', berhenti);
process.on('SIGTERM', berhenti);
