// Memuat dan memvalidasi variabel lingkungan.
require('dotenv').config();

const wajib = ['DATABASE_URL', 'JWT_SECRET', 'COOKIE_SECRET'];

function muat(sumber = process.env) {
  const hilang = wajib.filter((k) => !sumber[k]);
  if (hilang.length) {
    throw new Error(`Variabel lingkungan wajib belum diisi: ${hilang.join(', ')}`);
  }
  const production = sumber.NODE_ENV === 'production';
  const demoAkun = sumber.DEMO_AKUN === 'true';
  // Akun demo memakai password yang tampil di halaman masuk; tidak boleh aktif di produksi.
  if (production && demoAkun) {
    throw new Error('DEMO_AKUN=true tidak diizinkan saat NODE_ENV=production.');
  }
  return {
    port: Number(sumber.PORT) || 3000,
    production,
    databaseUrl: sumber.DATABASE_URL,
    jwtSecret: sumber.JWT_SECRET,
    cookieSecret: sumber.COOKIE_SECRET,
    cookieSecure: sumber.COOKIE_SECURE === 'true',
    demoAkun,
  };
}

module.exports = { muat };
