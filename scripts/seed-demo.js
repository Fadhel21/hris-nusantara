// Membuat data dan akun demo (idempotent). Pakai:
//   node scripts/seed-demo.js                  -> membuat/menyiapkan akun demo
//   node scripts/seed-demo.js --nonaktifkan    -> menonaktifkan semua akun demo (login dicabut)
// Akun demo memakai password yang diketahui publik; JANGAN dibiarkan aktif di lingkungan produksi.
const db = require('../src/config/db');
const auth = require('../src/modules/pengguna/services/auth');
const karyawanSvc = require('../src/modules/karyawan/services/karyawan');
const { AKUN_DEMO, PASSWORD_DEMO } = require('../src/modules/pengguna/services/demo');

async function idAtauBuat(sqlCari, paramCari, sqlBuat, paramBuat) {
  const { rows } = await db.query(sqlCari, paramCari);
  if (rows[0]) return rows[0].id;
  return (await db.query(sqlBuat, paramBuat)).rows[0].id;
}

async function nonaktifkan() {
  const nama = AKUN_DEMO.map((a) => a.username);
  const { rowCount } = await db.query(
    'UPDATE pengguna SET aktif = FALSE, updated_at = now() WHERE lower(username) = ANY($1::text[]) AND deleted_at IS NULL', [nama]);
  console.log(`${rowCount} akun demo dinonaktifkan.`);
}

async function siapkan() {
  // Admin demo (tanpa data karyawan) dibuat lebih dulu; ia menjadi pelaku pembuatan data lainnya.
  let adminId;
  const cariPengguna = async (username) => (await db.query(
    'SELECT id, karyawan_id FROM pengguna WHERE lower(username) = lower($1) AND deleted_at IS NULL', [username])).rows[0];
  const ada = await cariPengguna('demo.admin');
  if (ada) adminId = ada.id;
  else adminId = await auth.buat({ username: 'demo.admin', password: PASSWORD_DEMO, peranKode: 'admin' });
  const pelaku = { id: adminId, peran: 'admin', karyawanId: null };

  // Struktur organisasi demo.
  const perusahaan = await idAtauBuat(
    "SELECT id FROM perusahaan WHERE nama = 'PT Demo Nusantara' AND deleted_at IS NULL", [],
    "INSERT INTO perusahaan (nama, alamat) VALUES ('PT Demo Nusantara', 'Jl. Contoh No. 1, Jakarta') RETURNING id", []);
  const cabang = await idAtauBuat(
    "SELECT id FROM cabang WHERE perusahaan_id = $1 AND lower(kode) = 'demo-jkt' AND deleted_at IS NULL", [perusahaan],
    "INSERT INTO cabang (perusahaan_id, kode, nama, zona_waktu) VALUES ($1, 'DEMO-JKT', 'Kantor Pusat Demo', 'Asia/Jakarta') RETURNING id", [perusahaan]);
  const dept = await idAtauBuat(
    "SELECT id FROM departemen WHERE perusahaan_id = $1 AND lower(kode) = 'demo-sdm' AND deleted_at IS NULL", [perusahaan],
    "INSERT INTO departemen (perusahaan_id, kode, nama) VALUES ($1, 'DEMO-SDM', 'Sumber Daya Manusia (Demo)') RETURNING id", [perusahaan]);
  const jabatan = await idAtauBuat(
    "SELECT id FROM jabatan WHERE lower(kode) = 'demo-staf' AND deleted_at IS NULL", [],
    "INSERT INTO jabatan (kode, nama, level) VALUES ('DEMO-STAF', 'Staf (Demo)', 1) RETURNING id", []);

  let idAtasan = null;
  for (const a of AKUN_DEMO) {
    const sudah = await cariPengguna(a.username);
    if (sudah) {
      if (a.peran === 'atasan') idAtasan = sudah.karyawan_id;
      await db.query('UPDATE pengguna SET aktif = TRUE, updated_at = now() WHERE id = $1', [sudah.id]);
      console.log(`  ada      ${a.username}`);
      continue;
    }
    if (!a.karyawan) continue; // admin sudah dibuat di atas
    const karyawanId = await karyawanSvc.buat(pelaku, {
      nama: a.karyawan.nama, tanggal_masuk: '2026-01-05', cabang_id: String(cabang), departemen_id: String(dept), jabatan_id: String(jabatan),
      gaji_pokok: a.karyawan.gaji, jenis: 'PKWTT', atasan_id: a.peran === 'karyawan' && idAtasan ? String(idAtasan) : '',
    });
    await auth.buat({ username: a.username, password: PASSWORD_DEMO, peranKode: a.peran, karyawanId }, db);
    if (a.peran === 'atasan') idAtasan = karyawanId;
    console.log(`  dibuat   ${a.username} (${a.peran})`);
  }
  console.log(`\nAkun demo siap. Password semua akun: ${PASSWORD_DEMO}`);
  console.log('Aktifkan panel di halaman masuk dengan DEMO_AKUN=true di .env (jangan di produksi).');
}

(process.argv.includes('--nonaktifkan') ? nonaktifkan() : siapkan())
  .catch((err) => { console.error(`Seed demo gagal: ${err.message}`); process.exitCode = 1; })
  .finally(() => db.tutup());
