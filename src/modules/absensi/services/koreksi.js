// Koreksi absensi: catatan mentah (absensi_catat) tidak pernah diubah. Karyawan mengajukan koreksi jam
// masuk/pulang untuk suatu tanggal; setelah disetujui, nilainya disimpan di absensi_koreksi dan dipakai rekap.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const pengajuan = require('../../persetujuan/services/pengajuan');
const { tanggalValid } = require('../../karyawan/services/format');
const catat = require('./catat');
const { menitDariJam, lokal } = require('./waktu');

const JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

function bacaJam(nilai, label) {
  const v = String(nilai || '').trim();
  if (!v) return null;
  if (!JAM.test(v)) throw new GalatBisnis(`${label} tidak valid (format HH:MM).`);
  return v;
}

async function ajukan(pengguna, input) {
  if (!pengguna.karyawanId) throw new GalatBisnis('Akun Anda belum terhubung ke data karyawan, sehingga tidak dapat mengajukan koreksi.', 403);
  const karyawanId = pengguna.karyawanId;
  const tanggal = String(input.tanggal || '').trim();
  if (!tanggalValid(tanggal)) throw new GalatBisnis('Tanggal tidak valid.');
  const masuk = bacaJam(input.jam_masuk, 'Jam masuk');
  const pulang = bacaJam(input.jam_pulang, 'Jam pulang');
  if (!masuk && !pulang) throw new GalatBisnis('Isi jam masuk dan/atau jam pulang yang dikoreksi.');
  if (masuk && pulang && menitDariJam(pulang) <= menitDariJam(masuk)) throw new GalatBisnis('Jam pulang harus setelah jam masuk.');
  const alasan = String(input.alasan || '').trim();
  if (!alasan) throw new GalatBisnis('Alasan wajib diisi.');
  if (alasan.length > 500) throw new GalatBisnis('Alasan maksimal 500 karakter.');

  return db.transaksi(async (c) => {
    const { rows } = await c.query('SELECT status, tanggal_masuk FROM karyawan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [karyawanId]);
    if (!rows[0]) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
    if (rows[0].status !== 'aktif') throw new GalatBisnis('Karyawan yang sudah keluar tidak dapat mengajukan.', 409);
    if (tanggal < rows[0].tanggal_masuk) throw new GalatBisnis('Tanggal tidak boleh sebelum tanggal masuk karyawan.');
    const zona = await catat.zonaSaatIni(c, karyawanId);
    if (!zona) throw new GalatBisnis('Penempatan cabang Anda belum diatur. Hubungi HR.', 409);
    if (tanggal > lokal(new Date(), zona).tanggal) throw new GalatBisnis('Koreksi hanya untuk tanggal hari ini atau yang sudah lewat.');
    const { rowCount } = await c.query(
      `SELECT 1 FROM pengajuan_koreksi pk JOIN pengajuan p ON p.id = pk.pengajuan_id
        WHERE p.karyawan_id = $1 AND pk.tanggal = $2 AND p.status = 'menunggu' AND p.deleted_at IS NULL`, [karyawanId, tanggal]);
    if (rowCount) throw new GalatBisnis('Sudah ada pengajuan koreksi untuk tanggal itu yang masih menunggu.', 409);

    const id = await pengajuan.buat(c, { jenis: 'koreksi_absensi', karyawanId, pengguna, alasan });
    await c.query(
      'INSERT INTO pengajuan_koreksi (pengajuan_id, tanggal, jam_masuk, jam_pulang, zona_waktu) VALUES ($1, $2, $3, $4, $5)',
      [id, tanggal, masuk, pulang, zona]);
    return id;
  });
}

async function ambilDetail(exec, pengajuanId) {
  const { rows } = await exec.query(
    `SELECT tanggal, to_char(jam_masuk, 'HH24:MI') AS jam_masuk, to_char(jam_pulang, 'HH24:MI') AS jam_pulang, zona_waktu
       FROM pengajuan_koreksi WHERE pengajuan_id = $1`, [pengajuanId]);
  const mentah = await exec.query(
    `SELECT jenis, waktu, zona_waktu FROM absensi_catat
      WHERE karyawan_id = (SELECT karyawan_id FROM pengajuan WHERE id = $1) AND tanggal = $2 AND deleted_at IS NULL`,
    [pengajuanId, rows[0].tanggal]);
  const tercatat = {};
  for (const r of mentah.rows) tercatat[r.jenis] = lokal(r.waktu, r.zona_waktu).jam;
  return { ...rows[0], tercatat };
}

// Menghitung waktu absolut dari tanggal + jam lokal di zona cabang.
async function keWaktu(c, tanggal, jam, zona) {
  if (!jam) return null;
  const { rows } = await c.query('SELECT (($1::date + $2::time) AT TIME ZONE $3) AS t', [tanggal, jam, zona]);
  return rows[0].t;
}

async function saatDisetujui(c, p) {
  const { rows } = await c.query(
    `SELECT tanggal, to_char(jam_masuk, 'HH24:MI') AS jam_masuk, to_char(jam_pulang, 'HH24:MI') AS jam_pulang, zona_waktu
       FROM pengajuan_koreksi WHERE pengajuan_id = $1`, [p.id]);
  const pk = rows[0];
  const { rows: lama } = await c.query(
    'SELECT id, waktu_masuk, waktu_pulang FROM absensi_koreksi WHERE karyawan_id = $1 AND tanggal = $2 AND deleted_at IS NULL FOR UPDATE',
    [p.karyawan_id, pk.tanggal]);
  // Sisi yang tidak dikoreksi mempertahankan koreksi sebelumnya (bila ada).
  const masuk = (await keWaktu(c, pk.tanggal, pk.jam_masuk, pk.zona_waktu)) || (lama[0] && lama[0].waktu_masuk) || null;
  const pulang = (await keWaktu(c, pk.tanggal, pk.jam_pulang, pk.zona_waktu)) || (lama[0] && lama[0].waktu_pulang) || null;

  // Urutan harus tetap masuk akal terhadap catatan mentah sisi yang tidak dikoreksi.
  const { rows: mentah } = await c.query(
    `SELECT jenis, waktu FROM absensi_catat WHERE karyawan_id = $1 AND tanggal = $2 AND deleted_at IS NULL`, [p.karyawan_id, pk.tanggal]);
  const rawMasuk = (mentah.find((m) => m.jenis === 'masuk') || {}).waktu;
  const rawPulang = (mentah.find((m) => m.jenis === 'pulang') || {}).waktu;
  const efektifMasuk = masuk || rawMasuk;
  const efektifPulang = pulang || rawPulang;
  if (efektifMasuk && efektifPulang && new Date(efektifPulang) <= new Date(efektifMasuk)) {
    throw new GalatBisnis('Koreksi tidak dapat disetujui: jam pulang efektif tidak setelah jam masuk efektif. Tolak pengajuan ini.', 409);
  }
  if (lama[0]) await c.query('UPDATE absensi_koreksi SET deleted_at = now(), updated_at = now() WHERE id = $1', [lama[0].id]);
  await c.query(
    `INSERT INTO absensi_koreksi (karyawan_id, tanggal, waktu_masuk, waktu_pulang, zona_waktu, pengajuan_id) VALUES ($1, $2, $3, $4, $5, $6)`,
    [p.karyawan_id, pk.tanggal, masuk, pulang, pk.zona_waktu, p.id]);
}

async function saatDilepas() { /* koreksi belum berlaku sebelum disetujui; tidak ada yang dilepas */ }

module.exports = { ajukan, ambilDetail, saatDisetujui, saatDilepas };
