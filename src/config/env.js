// Memuat dan memvalidasi variabel lingkungan.
require('dotenv').config();

const wajib = ['DATABASE_URL', 'JWT_SECRET', 'COOKIE_SECRET'];

function muat(sumber = process.env) {
  const hilang = wajib.filter((k) => !sumber[k]);
  if (hilang.length) {
    throw new Error(`Variabel lingkungan wajib belum diisi: ${hilang.join(', ')}`);
  }
  return {
    port: Number(sumber.PORT) || 3000,
    production: sumber.NODE_ENV === 'production',
    databaseUrl: sumber.DATABASE_URL,
    jwtSecret: sumber.JWT_SECRET,
    cookieSecret: sumber.COOKIE_SECRET,
    cookieSecure: sumber.COOKIE_SECURE === 'true',
  };
}

module.exports = { muat };
