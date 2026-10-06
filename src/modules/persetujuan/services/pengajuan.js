// Mesin persetujuan generik: kepala pengajuan + langkah. Setiap keputusan dicatat (siapa, kapan,
// keputusan, catatan). Efek khusus per jenis (saldo cuti, koreksi absensi, ...) dijalankan oleh
// modul jenis masing-masing dalam transaksi yang sama dengan keputusan.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const audit = require('../../pengguna/services/audit');
const akses = require('../../karyawan/services/akses');
const alur = require('./alur');

const LABEL_JENIS = { cuti: 'Cuti', izin: 'Izin', koreksi_absensi: 'Koreksi absensi', lembur: 'Lembur' };
const MODUL = {
  lembur: () => require('../../lembur/services/lembur'),
  cuti: () => require('../../cuti/services/cuti'),
  izin: () => require('../../cuti/services/izin'),
  koreksi_absensi: () => require('../../absensi/services/koreksi'),
};
const MODE_KUNCI = 'alur_persetujuan';
const HARI_INI_SQL = "(now() AT TIME ZONE 'Asia/Jakarta')::date";

function modul(jenis) {
  if (!MODUL[jenis]) throw new GalatBisnis('Jenis pengajuan belum didukung.', 400);
  return MODUL[jenis]();
}

// --- Pengaturan alur ---------------------------------------------------------------------------

async function ambilMode(exec = db) {
  const { rows } = await exec.query('SELECT nilai FROM pengaturan_sistem WHERE kunci = $1 AND deleted_at IS NULL', [MODE_KUNCI]);
  const mode = rows[0] && rows[0].nilai;
  if (!Object.prototype.hasOwnProperty.call(alur.MODE, mode)) throw new Error('Pengaturan alur persetujuan tidak valid.');
  return mode;
}

async function ubahMode(pengguna, mode) {
  if (pengguna.peran !== 'admin') throw new GalatBisnis('Hanya administrator yang dapat mengubah alur persetujuan.', 403);
  if (!Object.prototype.hasOwnProperty.call(alur.MODE, mode)) throw new GalatBisnis('Alur persetujuan tidak valid.');
  await db.transaksi(async (c) => {
    const lama = await ambilMode(c);
    await c.query('UPDATE pengaturan_sistem SET nilai = $1, updated_at = now() WHERE kunci = $2', [mode, MODE_KUNCI]);
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'ubah_pengaturan', entitas: 'pengaturan.sistem', entitasId: MODE_KUNCI,
      sebelum: { nilai: lama }, sesudah: { nilai: mode },
    }, c);
  });
}

// --- Pembuatan ---------------------------------------------------------------------------------

// Atasan langsung saat ini, bila masih aktif dan punya akun login aktif (kalau tidak, dianggap kosong).
async function atasanAktif(exec, karyawanId) {
  const { rows } = await exec.query(
    `SELECT s.atasan_id FROM ${akses.PENEMPATAN_SAAT_INI} s
      JOIN karyawan a ON a.id = s.atasan_id AND a.deleted_at IS NULL AND a.status = 'aktif'
     WHERE s.karyawan_id = $1
       AND EXISTS (SELECT 1 FROM pengguna u WHERE u.karyawan_id = a.id AND u.aktif AND u.deleted_at IS NULL)`, [karyawanId]);
  return rows[0] ? { karyawanId: String(rows[0].atasan_id) } : null;
}

// Dipanggil modul jenis di dalam transaksinya. Mengembalikan id pengajuan.
async function buat(c, { jenis, karyawanId, pengguna, alasan }) {
  const langkah = alur.susunLangkah(await ambilMode(c), await atasanAktif(c, karyawanId));
  const { rows } = await c.query(
    'INSERT INTO pengajuan (jenis, karyawan_id, alasan, diajukan_oleh) VALUES ($1, $2, $3, $4) RETURNING id',
    [jenis, karyawanId, alasan, pengguna.id]);
  const id = rows[0].id;
  for (const l of langkah) {
    await c.query(
      'INSERT INTO pengajuan_langkah (pengajuan_id, urutan, peran, pemutus_karyawan_id) VALUES ($1, $2, $3, $4)',
      [id, l.urutan, l.peran, l.pemutus_karyawan_id]);
  }
  await audit.catat({
    penggunaId: pengguna.id, aksi: 'ajukan', entitas: 'pengajuan', entitasId: id,
    sesudah: { jenis, karyawan_id: karyawanId, langkah: langkah.map((l) => l.peran) },
  }, c);
  return id;
}

// --- Pembacaan ---------------------------------------------------------------------------------

const LANGKAH_SQL = `
  SELECT l.*, k.nama AS pemutus_nama, u.username AS diputuskan_username,
         CASE WHEN l.pemutus_karyawan_id IS NULL THEN NULL
              ELSE (k.status = 'aktif' AND EXISTS (SELECT 1 FROM pengguna x WHERE x.karyawan_id = k.id AND x.aktif AND x.deleted_at IS NULL)) END AS pemutus_aktif
    FROM pengajuan_langkah l
    LEFT JOIN karyawan k ON k.id = l.pemutus_karyawan_id
    LEFT JOIN pengguna u ON u.id = l.diputuskan_oleh
   WHERE l.deleted_at IS NULL`;

const RINGKAS_SQL = `
  SELECT p.id, p.jenis, p.status, p.karyawan_id, p.alasan, p.created_at,
         k.nama AS nama_karyawan, k.nomor_induk,
         COALESCE(pc.tanggal_mulai, pi.tanggal_mulai, pk.tanggal, pl.tanggal) AS tanggal_mulai,
         COALESCE(pc.tanggal_akhir, pi.tanggal_akhir, pk.tanggal, pl.tanggal) AS tanggal_akhir,
         COALESCE(pc.jumlah_hari, pi.jumlah_hari) AS jumlah_hari,
         jc.nama AS jenis_cuti, pi.kategori AS kategori_izin,
         to_char(pl.jam_mulai, 'HH24:MI') AS jam_mulai_lembur, to_char(pl.jam_selesai, 'HH24:MI') AS jam_selesai_lembur,
         pl.menit AS menit_lembur
    FROM pengajuan p
    JOIN karyawan k ON k.id = p.karyawan_id
    LEFT JOIN pengajuan_cuti pc ON pc.pengajuan_id = p.id
    LEFT JOIN jenis_cuti jc ON jc.id = pc.jenis_cuti_id
    LEFT JOIN pengajuan_izin pi ON pi.pengajuan_id = p.id
    LEFT JOIN pengajuan_koreksi pk ON pk.pengajuan_id = p.id
    LEFT JOIN pengajuan_lembur pl ON pl.pengajuan_id = p.id
   WHERE p.deleted_at IS NULL`;

async function ambilPengajuan(exec, id) {
  const { rows } = await exec.query('SELECT * FROM pengajuan WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!rows[0]) throw new GalatBisnis('Pengajuan tidak ditemukan.', 404);
  const { rows: langkah } = await exec.query(`${LANGKAH_SQL} AND l.pengajuan_id = $1 ORDER BY l.urutan`, [id]);
  return { ...rows[0], langkah };
}

async function daftarSaya(pengguna) {
  if (!pengguna.karyawanId) return [];
  const { rows } = await db.query(`${RINGKAS_SQL} AND p.karyawan_id = $1 ORDER BY p.created_at DESC, p.id DESC LIMIT 200`, [pengguna.karyawanId]);
  return rows;
}

// Pengajuan menunggu yang boleh diputuskan oleh pengguna ini.
async function inbox(pengguna) {
  const { rows } = await db.query(`${RINGKAS_SQL} AND p.status = 'menunggu' ORDER BY p.created_at, p.id LIMIT 300`);
  if (!rows.length) return [];
  const { rows: semuaLangkah } = await db.query(`${LANGKAH_SQL} AND l.pengajuan_id = ANY($1::bigint[]) ORDER BY l.pengajuan_id, l.urutan`, [rows.map((r) => r.id)]);
  return rows.filter((r) => {
    const berjalan = alur.langkahBerjalan(semuaLangkah.filter((l) => String(l.pengajuan_id) === String(r.id)));
    return berjalan && alur.bolehMemutuskan(pengguna, { karyawan_id: r.karyawan_id }, berjalan).boleh;
  });
}

// Pengajuan karyawan dalam cakupan akses pengguna (atasan: tim; HR/admin: semua), tanpa milik sendiri.
async function daftarTim(pengguna, status = '') {
  const params = [];
  const kondisi = akses.kondisiAkses(pengguna, params, 'k');
  let filter = '';
  if (['menunggu', 'disetujui', 'ditolak', 'dibatalkan'].includes(status)) { params.push(status); filter = ` AND p.status = $${params.length}`; }
  const { rows } = await db.query(`${RINGKAS_SQL} AND ${kondisi}${filter} ORDER BY p.created_at DESC, p.id DESC LIMIT 200`, params);
  return rows.filter((r) => String(r.karyawan_id) !== String(pengguna.karyawanId));
}

async function pemutusLangkah(exec, id, karyawanId) {
  const { rowCount } = await exec.query(
    'SELECT 1 FROM pengajuan_langkah WHERE pengajuan_id = $1 AND pemutus_karyawan_id = $2 AND deleted_at IS NULL', [id, karyawanId]);
  return rowCount > 0;
}

async function detail(pengguna, id) {
  const p = await ambilPengajuan(db, id);
  const milikSendiri = pengguna.karyawanId && String(pengguna.karyawanId) === String(p.karyawan_id);
  let boleh = milikSendiri || ['admin', 'hr'].includes(pengguna.peran)
    || (pengguna.karyawanId && await pemutusLangkah(db, id, pengguna.karyawanId));
  if (!boleh) {
    // Atasan (langsung maupun tidak langsung) boleh melihat pengajuan bawahannya.
    try { await akses.pastikanBolehLihat(pengguna, p.karyawan_id); boleh = true; } catch (_) { boleh = false; }
  }
  if (!boleh) throw new GalatBisnis('Pengajuan tidak ditemukan.', 404);

  const { rows: k } = await db.query('SELECT nama, nomor_induk FROM karyawan WHERE id = $1', [p.karyawan_id]);
  const berjalan = p.status === 'menunggu' ? alur.langkahBerjalan(p.langkah) : null;
  const hakPutus = berjalan ? alur.bolehMemutuskan(pengguna, p, berjalan) : { boleh: false };
  const m = modul(p.jenis);
  return {
    pengajuan: p, karyawan: k[0], label: LABEL_JENIS[p.jenis], detail: await m.ambilDetail(db, id),
    langkahBerjalan: berjalan, bolehPutuskan: !!hakPutus.boleh,
    bolehBatalPemohon: !!milikSendiri && p.status === 'menunggu',
    bolehBatalHr: p.status === 'disetujui' && !milikSendiri && ['admin', 'hr'].includes(pengguna.peran) && typeof m.batalSetelahDisetujui === 'function',
  };
}

// --- Keputusan ---------------------------------------------------------------------------------

async function putuskan(pengguna, id, { keputusan, catatan }) {
  if (!['setuju', 'tolak'].includes(keputusan)) throw new GalatBisnis('Keputusan tidak valid.');
  const cat = String(catatan || '').trim();
  if (cat.length > 500) throw new GalatBisnis('Catatan maksimal 500 karakter.');
  if (keputusan === 'tolak' && !cat) throw new GalatBisnis('Catatan wajib diisi saat menolak pengajuan.');

  return db.transaksi(async (c) => {
    const { rows } = await c.query('SELECT * FROM pengajuan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!rows[0]) throw new GalatBisnis('Pengajuan tidak ditemukan.', 404);
    const p = rows[0];
    if (p.status !== 'menunggu') throw new GalatBisnis(`Pengajuan sudah ${p.status}.`, 409);
    const { rows: langkah } = await c.query(`${LANGKAH_SQL} AND l.pengajuan_id = $1 ORDER BY l.urutan`, [id]);
    const berjalan = alur.langkahBerjalan(langkah);
    if (!berjalan) throw new GalatBisnis('Pengajuan tidak memiliki langkah yang menunggu.', 409);
    const hak = alur.bolehMemutuskan(pengguna, p, berjalan);
    if (!hak.boleh) throw new GalatBisnis(hak.alasan, 403);

    const statusLangkah = keputusan === 'setuju' ? 'disetujui' : 'ditolak';
    await c.query(
      `UPDATE pengajuan_langkah SET status = $1, diputuskan_oleh = $2, diputuskan_pada = now(), catatan = $3, updated_at = now() WHERE id = $4`,
      [statusLangkah, pengguna.id, cat || null, berjalan.id]);

    let statusAkhir = 'menunggu';
    const m = modul(p.jenis);
    if (keputusan === 'tolak') {
      statusAkhir = 'ditolak';
      await m.saatDilepas(c, p);
    } else if (!langkah.some((l) => l.urutan > berjalan.urutan && l.status === 'menunggu')) {
      statusAkhir = 'disetujui';
      await m.saatDisetujui(c, p, pengguna);
    }
    if (statusAkhir !== 'menunggu') {
      await c.query('UPDATE pengajuan SET status = $1, diputuskan_pada = now(), updated_at = now() WHERE id = $2', [statusAkhir, id]);
    }
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'putuskan_pengajuan', entitas: 'pengajuan', entitasId: id,
      sebelum: { status: 'menunggu' },
      sesudah: { status: statusAkhir, jenis: p.jenis, langkah: berjalan.urutan, keputusan, catatan: cat || null },
    }, c);
    return statusAkhir;
  });
}

// Pemohon membatalkan pengajuan yang masih menunggu; HR/admin membatalkan yang sudah disetujui
// (bila belum dimulai) dengan mutasi pembatalan.
async function batalkan(pengguna, id, catatan) {
  const cat = String(catatan || '').trim().slice(0, 500);
  await db.transaksi(async (c) => {
    const { rows } = await c.query('SELECT * FROM pengajuan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!rows[0]) throw new GalatBisnis('Pengajuan tidak ditemukan.', 404);
    const p = rows[0];
    const milikSendiri = pengguna.karyawanId && String(pengguna.karyawanId) === String(p.karyawan_id);
    const m = modul(p.jenis);
    if (p.status === 'menunggu') {
      if (!milikSendiri) throw new GalatBisnis('Hanya pemohon yang dapat membatalkan pengajuan yang menunggu.', 403);
      await m.saatDilepas(c, p);
    } else if (p.status === 'disetujui') {
      if (milikSendiri || !['admin', 'hr'].includes(pengguna.peran) || typeof m.batalSetelahDisetujui !== 'function') {
        throw new GalatBisnis('Pengajuan yang sudah disetujui hanya dapat dibatalkan oleh HR atau administrator (bukan pemohon).', 403);
      }
      await m.batalSetelahDisetujui(c, p, pengguna, cat);
    } else {
      throw new GalatBisnis(`Pengajuan sudah ${p.status}.`, 409);
    }
    await c.query("UPDATE pengajuan SET status = 'dibatalkan', diputuskan_pada = now(), updated_at = now() WHERE id = $1", [id]);
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'batal_pengajuan', entitas: 'pengajuan', entitasId: id,
      sebelum: { status: p.status }, sesudah: { status: 'dibatalkan', jenis: p.jenis, catatan: cat || null },
    }, c);
  });
}

// Dipakai saat karyawan keluar: semua pengajuannya yang menunggu dibatalkan otomatis.
async function batalkanMenungguKaryawan(c, karyawanId, pengguna) {
  const { rows } = await c.query("SELECT * FROM pengajuan WHERE karyawan_id = $1 AND status = 'menunggu' AND deleted_at IS NULL FOR UPDATE", [karyawanId]);
  for (const p of rows) {
    await modul(p.jenis).saatDilepas(c, p);
    await c.query("UPDATE pengajuan SET status = 'dibatalkan', diputuskan_pada = now(), updated_at = now() WHERE id = $1", [p.id]);
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'batal_pengajuan', entitas: 'pengajuan', entitasId: p.id,
      sebelum: { status: 'menunggu' }, sesudah: { status: 'dibatalkan', catatan: 'Karyawan keluar' },
    }, c);
  }
  return rows.length;
}

module.exports = {
  LABEL_JENIS, HARI_INI_SQL, ambilMode, ubahMode, buat, daftarSaya, inbox, daftarTim, detail, putuskan, batalkan,
  batalkanMenungguKaryawan,
};
