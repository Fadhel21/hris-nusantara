// Pengajuan lembur lewat mesin persetujuan. Setelah disetujui, upah lembur dihitung saat penggajian
// (lihat penggajian/services/lembur.js dan periode.js); tidak ada efek saldo.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const pengajuan = require('../../persetujuan/services/pengajuan');
const { tanggalValid } = require('../../karyawan/services/format');
const k = require('../../cuti/services/ketidakhadiran');
const gaji = require('../../penggajian/services/pengaturan');
const kunciGaji = require('../../penggajian/services/kunci');
const { menitDariJam } = require('../../absensi/services/waktu');
const { menitKeTeks } = require('../../penggajian/services/lembur');

const JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

function bacaJam(nilai, label) {
  const v = String(nilai || '').trim();
  if (!JAM.test(v)) throw new GalatBisnis(`${label} tidak valid (format HH:MM).`);
  return v;
}

async function ajukan(pengguna, input) {
  if (!pengguna.karyawanId) throw new GalatBisnis('Akun Anda belum terhubung ke data karyawan, sehingga tidak dapat mengajukan lembur.', 403);
  const karyawanId = pengguna.karyawanId;
  const tanggal = String(input.tanggal || '').trim();
  if (!tanggalValid(tanggal)) throw new GalatBisnis('Tanggal tidak valid.');
  const mulai = bacaJam(input.jam_mulai, 'Jam mulai');
  const selesai = bacaJam(input.jam_selesai, 'Jam selesai');
  const menit = menitDariJam(selesai) - menitDariJam(mulai);
  if (menit <= 0) throw new GalatBisnis('Jam selesai harus setelah jam mulai (lembur tidak boleh melewati tengah malam; ajukan terpisah per tanggal).');
  const alasan = k.bacaAlasan(input);

  return db.transaksi(async (c) => {
    const karyawan = await k.kunciKaryawanAktif(c, karyawanId);
    if (tanggal < karyawan.tanggal_masuk) throw new GalatBisnis('Tanggal tidak boleh sebelum tanggal masuk karyawan.');
    const sekarang = await k.hariIni(c);
    if (Math.round((new Date(`${tanggal}T00:00:00Z`) - new Date(`${sekarang}T00:00:00Z`)) / 86400000) > 366) {
      throw new GalatBisnis('Tanggal lembur terlalu jauh di masa depan.');
    }
    await kunciGaji.pastikanTanggalBelumTerkunci(c, tanggal, 'Lembur ini');

    // Tidak boleh bertumpuk dengan lembur lain (menunggu/disetujui) pada tanggal yang sama.
    const { rows: lain } = await c.query(
      `SELECT pl.menit, to_char(pl.jam_mulai, 'HH24:MI') AS jam_mulai, to_char(pl.jam_selesai, 'HH24:MI') AS jam_selesai
         FROM pengajuan_lembur pl JOIN pengajuan p ON p.id = pl.pengajuan_id
        WHERE p.karyawan_id = $1 AND pl.tanggal = $2 AND p.status IN ('menunggu', 'disetujui') AND p.deleted_at IS NULL`, [karyawanId, tanggal]);
    const bentrok = lain.find((x) => menitDariJam(x.jam_mulai) < menitDariJam(selesai) && menitDariJam(x.jam_selesai) > menitDariJam(mulai));
    if (bentrok) throw new GalatBisnis(`Bertumpuk dengan lembur lain pada tanggal itu (${bentrok.jam_mulai}-${bentrok.jam_selesai}).`, 409);

    // Batas lembur per hari (bila pemilik mengisinya).
    const batas = await gaji.parameterBerlaku(c, 'lembur_maks_menit_per_hari', tanggal);
    if (batas) {
      const sudah = lain.reduce((a, x) => a + x.menit, 0);
      if (sudah + menit > Number(batas.nilai)) {
        throw new GalatBisnis(`Melebihi batas lembur per hari (${menitKeTeks(Number(batas.nilai))}); sudah diajukan ${menitKeTeks(sudah)}.`, 422);
      }
    }
    const id = await pengajuan.buat(c, { jenis: 'lembur', karyawanId, pengguna, alasan });
    await c.query(
      'INSERT INTO pengajuan_lembur (pengajuan_id, tanggal, jam_mulai, jam_selesai, menit) VALUES ($1, $2, $3, $4, $5)',
      [id, tanggal, mulai, selesai, menit]);
    return id;
  });
}

async function ambilDetail(exec, pengajuanId) {
  const { rows } = await exec.query(
    `SELECT tanggal, to_char(jam_mulai, 'HH24:MI') AS jam_mulai, to_char(jam_selesai, 'HH24:MI') AS jam_selesai, menit
       FROM pengajuan_lembur WHERE pengajuan_id = $1`, [pengajuanId]);
  return { ...rows[0], durasi: menitKeTeks(rows[0].menit) };
}

async function tanggalLembur(c, pengajuanId) {
  const { rows } = await c.query('SELECT tanggal FROM pengajuan_lembur WHERE pengajuan_id = $1', [pengajuanId]);
  return rows[0].tanggal;
}

// Periode gaji bisa saja dikunci sejak pengajuan dibuat; lembur tidak boleh mengubah hasil yang sudah dikunci.
async function saatDisetujui(c, p) {
  await kunciGaji.pastikanTanggalBelumTerkunci(c, await tanggalLembur(c, p.id), 'Lembur ini');
}

async function saatDilepas() { /* belum berpengaruh sebelum disetujui */ }

async function batalSetelahDisetujui(c, p) {
  await kunciGaji.pastikanTanggalBelumTerkunci(c, await tanggalLembur(c, p.id), 'Lembur ini');
}

module.exports = { ajukan, ambilDetail, saatDisetujui, saatDilepas, batalSetelahDisetujui };
