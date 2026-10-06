// Layanan data karyawan: daftar, detail, tambah, ubah, keluar, akun login.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const audit = require('../../pengguna/services/audit');
const auth = require('../../pengguna/services/auth');
const akses = require('./akses');
const validasi = require('./validasi');
const riwayat = require('./riwayat');
const profil = require('./profil');
const persetujuan = require('../../persetujuan/services/pengajuan');
const gajiPengaturan = require('../../penggajian/services/pengaturan');
const pajakSvc = require('../../penggajian/services/pajak');
const dokumen = require('./dokumen');
const { samarkan, formatNomorInduk } = require('./format');

const PER_HALAMAN = 25;
const SENSITIF = ['nik', 'npwp', 'nomor_rekening'];
const PERAN_AKUN = ['karyawan', 'atasan', 'hr'];

// Audit tidak menyimpan nilai NIK/NPWP/rekening; hanya menandai bahwa field itu berubah.
function untukAudit(data, pembanding = null) {
  const hasil = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIF.includes(k)) {
      if (pembanding === null ? v !== null : v !== pembanding[k]) hasil[k] = '[diubah]';
    } else if (pembanding === null || v !== pembanding[k]) hasil[k] = v;
  }
  return hasil;
}

function samarkanSensitif(baris) {
  const salinan = { ...baris };
  for (const k of SENSITIF) salinan[k] = samarkan(salinan[k]);
  return salinan;
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function daftar(pengguna, { cari = '', status = '', halaman = 1 } = {}) {
  const params = [];
  const kondisi = ['k.deleted_at IS NULL', akses.kondisiAkses(pengguna, params)];
  if (['aktif', 'keluar'].includes(status)) { params.push(status); kondisi.push(`k.status = $${params.length}`); }
  const kata = String(cari).trim().slice(0, 100);
  if (kata) {
    params.push(`%${escapeLike(kata)}%`);
    kondisi.push(`(k.nama ILIKE $${params.length} OR k.nomor_induk ILIKE $${params.length})`);
  }
  const dari = `FROM karyawan k
    LEFT JOIN ${akses.PENEMPATAN_SAAT_INI} p ON p.karyawan_id = k.id
    LEFT JOIN cabang c ON c.id = p.cabang_id
    LEFT JOIN departemen d ON d.id = p.departemen_id
    LEFT JOIN jabatan j ON j.id = p.jabatan_id
    WHERE ${kondisi.join(' AND ')}`;
  const total = Number((await db.query(`SELECT count(*) AS n ${dari}`, params)).rows[0].n);
  const hlm = Math.max(1, Math.min(Number(halaman) || 1, Math.ceil(total / PER_HALAMAN) || 1));
  const { rows } = await db.query(
    `SELECT k.id, k.nomor_induk, k.nama, k.status, c.nama AS cabang, d.nama AS departemen, j.nama AS jabatan
       ${dari} ORDER BY k.nomor_induk LIMIT ${PER_HALAMAN} OFFSET ${(hlm - 1) * PER_HALAMAN}`, params);
  return { baris: rows, total, nomorHalaman: hlm, jumlahHalaman: Math.max(1, Math.ceil(total / PER_HALAMAN)) };
}

async function detail(pengguna, id) {
  await akses.pastikanBolehLihat(pengguna, id);
  const { rows } = await db.query('SELECT * FROM karyawan WHERE id = $1 AND deleted_at IS NULL', [id]);
  const k = rows[0];
  const sensitif = akses.bolehLihatSensitif(pengguna, id);
  const pengelola = akses.semuaData(pengguna);
  const diriSendiri = String(pengguna.karyawanId) === String(id);
  const hasil = {
    karyawan: sensitif ? k : samarkanSensitif(k),
    sensitif,
    bolehKelola: pengelola,
    bolehAkun: pengguna.peran === 'admin',
    penempatan: await riwayat.daftarPenempatan(id),
    gaji: pengelola ? await riwayat.daftarGaji(id) : null,
    kontrak: pengelola || diriSendiri ? await riwayat.daftarKontrak(id) : null,
    // Keluarga, pendidikan, dan dokumen: hanya admin/HR dan pemilik datanya (atasan tidak).
    keluarga: sensitif ? await profil.daftar('keluarga', id) : null,
    pendidikan: sensitif ? await profil.daftar('pendidikan', id) : null,
    dokumen: sensitif ? await dokumen.daftar(id) : null,
    // Komponen gaji dan kepesertaan BPJS: hanya admin/HR.
    komponen: pengelola ? await gajiPengaturan.daftarKomponenKaryawan(id) : null,
    kepesertaan: pengelola ? await gajiPengaturan.kepesertaan(id) : null,
    komponenOpsi: pengelola ? await gajiPengaturan.daftarKomponenAktif() : null,
    // Status pajak (PPh 21) dan saldo awal pajak: hanya admin/HR.
    statusPajak: pengelola ? await pajakSvc.daftarStatus(id) : null,
    saldoAwalPajak: pengelola ? await pajakSvc.daftarSaldoAwal(id) : null,
    statusTersedia: pengelola ? await pajakSvc.daftarStatusTersedia() : null,
    akun: null,
  };
  if (hasil.bolehAkun) {
    const a = await db.query(
      `SELECT p.username, p.aktif, r.kode AS peran FROM pengguna p JOIN peran r ON r.id = p.peran_id
        WHERE p.karyawan_id = $1 AND p.deleted_at IS NULL`, [id]);
    hasil.akun = a.rows[0] || null;
  }
  return hasil;
}

// Pilihan dropdown untuk formulir penempatan.
async function opsi() {
  const ambil = async (sql) => (await db.query(sql)).rows.map((r) => ({ id: String(r.id), label: r.label }));
  return {
    cabang: await ambil("SELECT id, kode || ' - ' || nama AS label FROM cabang WHERE deleted_at IS NULL ORDER BY kode"),
    departemen: await ambil("SELECT id, kode || ' - ' || nama AS label FROM departemen WHERE deleted_at IS NULL ORDER BY kode"),
    jabatan: await ambil("SELECT id, kode || ' - ' || nama AS label FROM jabatan WHERE deleted_at IS NULL ORDER BY kode"),
    golongan: await ambil("SELECT id, kode || ' - ' || nama AS label FROM golongan WHERE deleted_at IS NULL ORDER BY urutan"),
    atasan: await ambil("SELECT id, nomor_induk || ' - ' || nama AS label FROM karyawan WHERE deleted_at IS NULL AND status = 'aktif' ORDER BY nama"),
  };
}

function terjemahkan(err) {
  if (err.code === '23505') {
    if (err.constraint === 'karyawan_nik_uq') return new GalatBisnis('NIK sudah terdaftar pada karyawan lain.', 409);
    return new GalatBisnis('Data sudah ada.', 409);
  }
  return err;
}

async function buat(pengguna, input) {
  akses.pastikanPengelola(pengguna);
  const { nilai, galat } = validasi.karyawanBaru(input);
  if (galat.length) throw new GalatBisnis(galat.join(' '));
  const { pribadi, penempatan, gaji, kontrak } = nilai;
  const tahun = Number(pribadi.tanggal_masuk.slice(0, 4));

  try {
    return await db.transaksi(async (c) => {
      await riwayat.periksaRujukanPenempatan(c, null, penempatan, pribadi.tanggal_masuk);
      const { rows: urut } = await c.query(
        `INSERT INTO urutan_nomor_induk (tahun, terakhir) VALUES ($1, 1)
         ON CONFLICT (tahun) DO UPDATE SET terakhir = urutan_nomor_induk.terakhir + 1, updated_at = now()
         RETURNING terakhir`, [tahun]);
      const nomorInduk = formatNomorInduk(tahun, urut[0].terakhir);
      const kolom = Object.keys(pribadi);
      const { rows } = await c.query(
        `INSERT INTO karyawan (nomor_induk, ${kolom.join(', ')})
         VALUES ($1, ${kolom.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING id`,
        [nomorInduk, ...kolom.map((k) => pribadi[k])]);
      const id = rows[0].id;
      const mulai = pribadi.tanggal_masuk;
      await riwayat.sisipPenempatan(c, id, mulai, penempatan);
      await riwayat.sisipGaji(c, id, mulai, gaji.gaji_pokok, 'Gaji awal');
      await riwayat.sisipKontrak(c, id, kontrak);
      await audit.catat({
        penggunaId: pengguna.id, aksi: 'buat', entitas: 'karyawan', entitasId: id,
        sesudah: { nomor_induk: nomorInduk, ...untukAudit(pribadi), penempatan, gaji_pokok: gaji.gaji_pokok, kontrak },
      }, c);
      return id;
    });
  } catch (err) { throw terjemahkan(err); }
}

async function ambilUntukUbah(pengguna, id) {
  akses.pastikanPengelola(pengguna);
  const { rows } = await db.query('SELECT * FROM karyawan WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!rows[0]) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
  return rows[0];
}

async function ubah(pengguna, id, input) {
  akses.pastikanPengelola(pengguna);
  const { nilai, galat } = validasi.dataPribadi(input);
  if (galat.length) throw new GalatBisnis(galat.join(' '));
  try {
    await db.transaksi(async (c) => {
      const { rows } = await c.query('SELECT * FROM karyawan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!rows[0]) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
      const lama = rows[0];
      const kolom = Object.keys(nilai);
      await c.query(
        `UPDATE karyawan SET ${kolom.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${kolom.length + 1}`,
        [...kolom.map((k) => nilai[k]), id]);
      const sebelum = {}; const sesudah = untukAudit(nilai, lama);
      for (const k of Object.keys(sesudah)) sebelum[k] = SENSITIF.includes(k) ? '[diubah]' : lama[k];
      if (Object.keys(sesudah).length) {
        await audit.catat({ penggunaId: pengguna.id, aksi: 'ubah', entitas: 'karyawan', entitasId: id, sebelum, sesudah }, c);
      }
    });
  } catch (err) { throw terjemahkan(err); }
}

// Karyawan keluar: tidak dihapus; nonaktif, tanggal keluar tercatat, akses login dicabut.
async function keluarkan(pengguna, id, input) {
  akses.pastikanPengelola(pengguna);
  const { nilai, galat } = validasi.keluar(input);
  if (galat.length) throw new GalatBisnis(galat.join(' '));
  await db.transaksi(async (c) => {
    const { rows } = await c.query('SELECT * FROM karyawan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
    const k = rows[0];
    if (!k) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
    if (k.status === 'keluar') throw new GalatBisnis('Karyawan ini sudah keluar.', 409);
    if (nilai.tanggal_keluar < k.tanggal_masuk) throw new GalatBisnis('Tanggal keluar tidak boleh sebelum tanggal masuk.');
    await c.query(
      `UPDATE karyawan SET status = 'keluar', tanggal_keluar = $1, alasan_keluar = $2, updated_at = now() WHERE id = $3`,
      [nilai.tanggal_keluar, nilai.alasan_keluar, id]);
    const cabut = await c.query(
      'UPDATE pengguna SET aktif = FALSE, updated_at = now() WHERE karyawan_id = $1 AND deleted_at IS NULL RETURNING id', [id]);
    // Pengajuan yang masih menunggu otomatis dibatalkan (hari cuti/izin dilepas).
    const dibatalkan = await persetujuan.batalkanMenungguKaryawan(c, id, pengguna);
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'keluar', entitas: 'karyawan', entitasId: id,
      sebelum: { status: 'aktif' }, sesudah: { status: 'keluar', ...nilai, login_dicabut: cabut.rowCount > 0, pengajuan_dibatalkan: dibatalkan },
    }, c);
  });
}

// Membuat akun login untuk karyawan. Hanya admin (perubahan hak akses).
async function buatAkun(pengguna, id, { username, password, peran }) {
  if (pengguna.peran !== 'admin') throw new GalatBisnis('Hanya administrator yang dapat mengelola akun login.', 403);
  const nama = String(username || '').trim();
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(nama)) throw new GalatBisnis('Username 3-50 karakter: huruf, angka, titik, garis bawah, atau strip.');
  if (!PERAN_AKUN.includes(peran)) throw new GalatBisnis('Peran tidak valid.');
  try {
    await db.transaksi(async (c) => {
      const { rows } = await c.query('SELECT status FROM karyawan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!rows[0]) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
      if (rows[0].status !== 'aktif') throw new GalatBisnis('Karyawan yang sudah keluar tidak dapat diberi akun.', 409);
      const baru = await auth.buat({ username: nama, password, peranKode: peran, karyawanId: id }, c);
      await audit.catat({
        penggunaId: pengguna.id, aksi: 'buat_akun', entitas: 'pengguna', entitasId: baru,
        sesudah: { username: nama, peran, karyawan_id: id },
      }, c);
    });
  } catch (err) {
    if (err.code === '23505') {
      throw new GalatBisnis(err.constraint === 'pengguna_karyawan_uq' ? 'Karyawan ini sudah punya akun.' : 'Username sudah dipakai.', 409);
    }
    if (err instanceof auth.GalatAuth) throw new GalatBisnis(err.message);
    throw err;
  }
}

module.exports = { daftar, detail, opsi, buat, ambilUntukUbah, ubah, keluarkan, buatAkun, PERAN_AKUN };
