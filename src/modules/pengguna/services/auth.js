// Autentikasi: verifikasi password, penguncian akun, dan pembuatan pengguna.
const bcrypt = require('bcryptjs');
const db = require('../../../config/db');
const audit = require('./audit');

const MAKS_GAGAL = 5;
const MENIT_KUNCI = 15;
// Hash palsu agar waktu respons sama baik username ada maupun tidak.
const HASH_PALSU = bcrypt.hashSync('tidak-dipakai', 10);

class GalatAuth extends Error {
  constructor(pesan) { super(pesan); this.name = 'GalatAuth'; }
}

const SELECT_PENGGUNA = `
  SELECT p.id, p.username, p.email, p.password_hash, p.aktif, p.karyawan_id,
         p.percobaan_gagal, (p.terkunci_sampai IS NOT NULL AND p.terkunci_sampai > now()) AS terkunci,
         r.kode AS peran
    FROM pengguna p JOIN peran r ON r.id = p.peran_id`;

async function masuk(username, password) {
  const { rows } = await db.query(
    `${SELECT_PENGGUNA} WHERE lower(p.username) = lower($1) AND p.deleted_at IS NULL`, [username]);
  const p = rows[0];
  const cocok = await bcrypt.compare(password, p ? p.password_hash : HASH_PALSU);

  if (!p || !p.aktif) {
    await audit.catat({ aksi: 'login_gagal', entitas: 'pengguna', sesudah: { alasan: 'tidak_dikenal_atau_nonaktif' } });
    throw new GalatAuth('Username atau password salah.');
  }
  if (p.terkunci) throw new GalatAuth(`Akun terkunci sementara. Coba lagi dalam ${MENIT_KUNCI} menit.`);

  if (!cocok) {
    await db.query(
      `UPDATE pengguna SET percobaan_gagal = percobaan_gagal + 1, updated_at = now(),
         terkunci_sampai = CASE WHEN percobaan_gagal + 1 >= $2 THEN now() + make_interval(mins => $3) END
       WHERE id = $1`, [p.id, MAKS_GAGAL, MENIT_KUNCI]);
    await audit.catat({ penggunaId: p.id, aksi: 'login_gagal', entitas: 'pengguna', entitasId: p.id });
    throw new GalatAuth('Username atau password salah.');
  }

  await db.query(
    `UPDATE pengguna SET percobaan_gagal = 0, terkunci_sampai = NULL, login_terakhir = now(), updated_at = now()
     WHERE id = $1`, [p.id]);
  await audit.catat({ penggunaId: p.id, aksi: 'login', entitas: 'pengguna', entitasId: p.id });
  return { id: p.id, username: p.username, peran: p.peran, karyawanId: p.karyawan_id };
}

// Dipakai middleware tiap request: akun yang dinonaktifkan langsung kehilangan akses.
async function ambilAktif(id) {
  const { rows } = await db.query(
    `${SELECT_PENGGUNA} WHERE p.id = $1 AND p.aktif AND p.deleted_at IS NULL`, [id]);
  const p = rows[0];
  return p ? { id: p.id, username: p.username, peran: p.peran, karyawanId: p.karyawan_id } : null;
}

async function buat({ username, password, peranKode, email = null, karyawanId = null }, exec = db) {
  if (!password || password.length < 8) throw new GalatAuth('Password minimal 8 karakter.');
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await exec.query(
    `INSERT INTO pengguna (username, email, password_hash, peran_id, karyawan_id)
     VALUES ($1, $2, $3, (SELECT id FROM peran WHERE kode = $4 AND deleted_at IS NULL), $5)
     RETURNING id`, [username, email, hash, peranKode, karyawanId]);
  return rows[0].id;
}

module.exports = { masuk, ambilAktif, buat, GalatAuth };
