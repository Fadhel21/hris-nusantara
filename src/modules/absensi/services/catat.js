// Absen masuk/pulang dan rekap. Waktu selalu dari jam server (now() di database), bukan jam perangkat;
// tanggal dan jam lokal mengikuti zona waktu cabang penempatan karyawan saat ini.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const { jalurAman } = require('../../../config/uploads');
const akses = require('../../karyawan/services/akses');
const berkas = require('../../karyawan/services/berkas');
const pengaturan = require('./pengaturan');
const waktu = require('./waktu');

const MAKS_FOTO = 150 * 1024;
const MAKS_SISI_FOTO = 800;
const ZONA_BAWAAN = 'Asia/Jakarta';

async function zonaSaatIni(exec, karyawanId) {
  const { rows } = await exec.query(
    `SELECT c.zona_waktu FROM ${akses.PENEMPATAN_SAAT_INI} p JOIN cabang c ON c.id = p.cabang_id WHERE p.karyawan_id = $1`, [karyawanId]);
  return rows[0] ? rows[0].zona_waktu : null;
}

function bacaLokasi({ lat, lon, akurasi }) {
  const ada = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  if (!ada(lat) || !ada(lon)) return { latitude: null, longitude: null, akurasi_m: null };
  const la = Number(lat); const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
    throw new GalatBisnis('Koordinat lokasi tidak valid.');
  }
  const ak = ada(akurasi) && Number.isFinite(Number(akurasi)) && Number(akurasi) >= 0 ? Math.round(Number(akurasi)) : null;
  // Dibulatkan 6 desimal (±0,1 m) sesuai NUMERIC(9,6).
  return { latitude: la.toFixed(6), longitude: lo.toFixed(6), akurasi_m: ak };
}

function pastikanPunyaKaryawan(pengguna) {
  if (!pengguna.karyawanId) throw new GalatBisnis('Akun Anda belum terhubung ke data karyawan, sehingga tidak dapat absen.', 403);
}

// Status absen hari ini untuk halaman "Absen saya".
async function statusHariIni(pengguna) {
  pastikanPunyaKaryawan(pengguna);
  const zona = (await zonaSaatIni(db, pengguna.karyawanId)) || ZONA_BAWAAN;
  const { rows: t } = await db.query('SELECT (now() AT TIME ZONE $1)::date AS tanggal', [zona]);
  const { rows } = await db.query(
    `SELECT jenis, waktu, zona_waktu FROM absensi_catat WHERE karyawan_id = $1 AND tanggal = $2 AND deleted_at IS NULL`,
    [pengguna.karyawanId, t[0].tanggal]);
  const hasil = { tanggal: t[0].tanggal, zona, masuk: null, pulang: null, adaPenempatan: !!(await zonaSaatIni(db, pengguna.karyawanId)) };
  for (const r of rows) hasil[r.jenis] = waktu.lokal(r.waktu, r.zona_waktu);
  return hasil;
}

// jenis: 'masuk' | 'pulang'. isi: Buffer JPEG (foto wajib).
async function catat(pengguna, jenis, { isi, lat, lon, akurasi }) {
  pastikanPunyaKaryawan(pengguna);
  if (!['masuk', 'pulang'].includes(jenis)) throw new GalatBisnis('Jenis absen tidak valid.');
  if (!Buffer.isBuffer(isi) || isi.length === 0) throw new GalatBisnis('Foto wajib disertakan saat absen.', 422);
  if (isi.length > MAKS_FOTO) throw new GalatBisnis('Ukuran foto maksimal 150 KB. Foto dikecilkan otomatis oleh browser.', 413);
  const tipe = berkas.deteksiTipe(isi);
  if (!tipe || tipe.mime !== 'image/jpeg') throw new GalatBisnis('Foto harus berformat JPEG.', 415);
  const dim = berkas.dimensiJpeg(isi);
  if (!dim || dim.lebar > MAKS_SISI_FOTO || dim.tinggi > MAKS_SISI_FOTO) throw new GalatBisnis(`Dimensi foto maksimal ${MAKS_SISI_FOTO} px.`, 422);
  const lokasi = bacaLokasi({ lat, lon, akurasi });
  const karyawanId = pengguna.karyawanId;

  const bulanFolder = new Date().toISOString().slice(0, 7).replace('-', '');
  const relatif = path.posix.join('absensi', String(karyawanId), bulanFolder, `${crypto.randomUUID()}.jpg`);
  const mutlak = jalurAman(relatif);
  await fs.mkdir(path.dirname(mutlak), { recursive: true });
  await fs.writeFile(mutlak, isi, { flag: 'wx' });
  try {
    return await db.transaksi(async (c) => {
      const { rows: k } = await c.query('SELECT status FROM karyawan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [karyawanId]);
      if (!k[0]) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
      if (k[0].status !== 'aktif') throw new GalatBisnis('Karyawan yang sudah keluar tidak dapat absen.', 409);
      const zona = await zonaSaatIni(c, karyawanId);
      if (!zona) throw new GalatBisnis('Penempatan cabang Anda belum diatur. Hubungi HR.', 409);

      const { rows: t } = await c.query('SELECT now() AS waktu, (now() AT TIME ZONE $1)::date AS tanggal', [zona]);
      const { tanggal } = t[0];
      if (jenis === 'pulang') {
        const { rowCount } = await c.query(
          `SELECT 1 FROM absensi_catat WHERE karyawan_id = $1 AND tanggal = $2 AND jenis = 'masuk' AND deleted_at IS NULL`, [karyawanId, tanggal]);
        if (!rowCount) throw new GalatBisnis('Anda belum absen masuk hari ini.', 409);
      }
      try {
        await c.query(
          `INSERT INTO absensi_catat (karyawan_id, tanggal, jenis, waktu, zona_waktu, foto_path, latitude, longitude, akurasi_m)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [karyawanId, tanggal, jenis, t[0].waktu, zona, relatif, lokasi.latitude, lokasi.longitude, lokasi.akurasi_m]);
      } catch (err) {
        if (err.code === '23505') throw new GalatBisnis(`Anda sudah absen ${jenis} hari ini.`, 409);
        throw err;
      }
      return { jenis, tanggal, ...waktu.lokal(t[0].waktu, zona), zona };
    });
  } catch (err) {
    await fs.unlink(mutlak).catch(() => {}); // jangan tinggalkan foto yatim
    throw err;
  }
}

function bulanBerjalan() {
  return waktu.lokal(new Date(), ZONA_BAWAAN).tanggal.slice(0, 7);
}

function bacaBulan(bulan) {
  const rentang = waktu.rentangBulan(bulan || bulanBerjalan());
  if (!rentang) throw new GalatBisnis('Bulan tidak valid (format YYYY-MM).');
  return { bulan: bulan || bulanBerjalan(), ...rentang };
}

async function ambilCatatan(karyawanIds, awal, akhir) {
  const { rows } = await db.query(
    `SELECT id, karyawan_id, tanggal, jenis, waktu, zona_waktu, (foto_path IS NOT NULL) AS ada_foto
       FROM absensi_catat WHERE karyawan_id = ANY($1::bigint[]) AND tanggal BETWEEN $2 AND $3 AND deleted_at IS NULL`,
    [karyawanIds, awal, akhir]);
  return rows;
}

// Rekap harian satu karyawan untuk satu bulan.
async function riwayat(pengguna, karyawanId, bulanParam) {
  await akses.pastikanBolehLihat(pengguna, karyawanId);
  const { bulan, awal, akhir } = bacaBulan(bulanParam);
  const { rows } = await db.query(
    'SELECT id, nomor_induk, nama, tanggal_masuk, tanggal_keluar FROM karyawan WHERE id = $1 AND deleted_at IS NULL', [karyawanId]);
  const k = rows[0];
  const zona = (await zonaSaatIni(db, karyawanId)) || ZONA_BAWAAN;
  const [jadwal, libur, catatan] = await Promise.all([
    pengaturan.jadwalUntukHitung(), pengaturan.liburDalamRentang(awal, akhir), ambilCatatan([karyawanId], awal, akhir),
  ]);
  const harian = waktu.susunHarian({
    awal, akhir, hariIni: waktu.lokal(new Date(), zona).tanggal, jadwal, libur, catatan,
    mulaiKerja: k.tanggal_masuk, selesaiKerja: k.tanggal_keluar,
  });
  return { karyawan: k, bulan, harian, ringkasan: waktu.ringkas(harian) };
}

// Rekap bulanan semua karyawan dalam cakupan akses pengguna (admin/HR semua; atasan: tim sendiri).
async function rekapTim(pengguna, bulanParam) {
  const { bulan, awal, akhir } = bacaBulan(bulanParam);
  const params = [akhir, awal];
  const kondisi = akses.kondisiAkses(pengguna, params);
  const { rows: daftar } = await db.query(
    `SELECT k.id, k.nomor_induk, k.nama, k.tanggal_masuk, k.tanggal_keluar, COALESCE(c.zona_waktu, '${ZONA_BAWAAN}') AS zona
       FROM karyawan k
       LEFT JOIN ${akses.PENEMPATAN_SAAT_INI} p ON p.karyawan_id = k.id
       LEFT JOIN cabang c ON c.id = p.cabang_id
      WHERE k.deleted_at IS NULL AND k.tanggal_masuk <= $1 AND (k.tanggal_keluar IS NULL OR k.tanggal_keluar >= $2) AND ${kondisi}
      ORDER BY k.nomor_induk`, params);
  const [jadwal, libur, catatan] = await Promise.all([
    pengaturan.jadwalUntukHitung(), pengaturan.liburDalamRentang(awal, akhir),
    ambilCatatan(daftar.map((d) => d.id), awal, akhir),
  ]);
  const perKaryawan = new Map();
  for (const c of catatan) {
    if (!perKaryawan.has(String(c.karyawan_id))) perKaryawan.set(String(c.karyawan_id), []);
    perKaryawan.get(String(c.karyawan_id)).push(c);
  }
  const baris = daftar.map((k) => {
    const harian = waktu.susunHarian({
      awal, akhir, hariIni: waktu.lokal(new Date(), k.zona).tanggal, jadwal, libur,
      catatan: perKaryawan.get(String(k.id)) || [], mulaiKerja: k.tanggal_masuk, selesaiKerja: k.tanggal_keluar,
    });
    return { id: k.id, nomor_induk: k.nomor_induk, nama: k.nama, ringkasan: waktu.ringkas(harian) };
  });
  return { bulan, baris };
}

// Foto absen boleh dilihat oleh yang berhak melihat karyawannya (diri sendiri, atasan, HR).
async function untukDibukaFoto(pengguna, catatId) {
  const { rows } = await db.query('SELECT karyawan_id, foto_path FROM absensi_catat WHERE id = $1 AND deleted_at IS NULL', [catatId]);
  if (!rows[0]) throw new GalatBisnis('Data tidak ditemukan.', 404);
  await akses.pastikanBolehLihat(pengguna, rows[0].karyawan_id);
  if (!rows[0].foto_path) throw new GalatBisnis('Foto sudah dihapus sesuai masa simpan.', 404);
  return jalurAman(rows[0].foto_path);
}

module.exports = { statusHariIni, catat, riwayat, rekapTim, untukDibukaFoto, bulanBerjalan };
