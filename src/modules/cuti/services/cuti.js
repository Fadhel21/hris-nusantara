// Pengajuan cuti: validasi (hari kerja, tumpang tindih, saldo), efek persetujuan (mutasi 'pakai'),
// dan pembatalan (mutasi 'batal'). Saldo hanya berubah lewat mutasi.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const audit = require('../../pengguna/services/audit');
const pengajuan = require('../../persetujuan/services/pengajuan');
const saldo = require('./saldo');
const k = require('./ketidakhadiran');
const { perTahun } = require('./hitung');

async function ajukan(pengguna, input) {
  if (!pengguna.karyawanId) throw new GalatBisnis('Akun Anda belum terhubung ke data karyawan, sehingga tidak dapat mengajukan cuti.', 403);
  const karyawanId = pengguna.karyawanId;
  const rentang = k.bacaRentang(input);
  const alasan = k.bacaAlasan(input);
  if (!/^\d{1,18}$/.test(String(input.jenis_cuti_id || ''))) throw new GalatBisnis('Jenis cuti wajib dipilih.');

  try {
    return await db.transaksi(async (c) => {
      const karyawan = await k.kunciKaryawanAktif(c, karyawanId);
      const { rows: j } = await c.query('SELECT id, nama, potong_saldo FROM jenis_cuti WHERE id = $1 AND deleted_at IS NULL', [input.jenis_cuti_id]);
      if (!j[0]) throw new GalatBisnis('Jenis cuti tidak ditemukan.', 404);
      const hari = await k.siapkanHari(c, karyawanId, karyawan, rentang);

      if (j[0].potong_saldo) {
        for (const [tahun, jumlah] of Object.entries(perTahun(hari))) {
          const tersedia = (await saldo.saldoTahun(c, karyawanId, j[0].id, Number(tahun))) - (await saldo.hariMenunggu(c, karyawanId, j[0].id, Number(tahun)));
          if (jumlah > tersedia) {
            throw new GalatBisnis(`Saldo ${j[0].nama} tahun ${tahun} tidak cukup (tersedia ${Math.max(tersedia, 0)} hari, diajukan ${jumlah} hari).`, 422);
          }
        }
      }
      const id = await pengajuan.buat(c, { jenis: 'cuti', karyawanId, pengguna, alasan });
      await c.query(
        `INSERT INTO pengajuan_cuti (pengajuan_id, jenis_cuti_id, tanggal_mulai, tanggal_akhir, jumlah_hari) VALUES ($1, $2, $3, $4, $5)`,
        [id, j[0].id, rentang.mulai, rentang.akhir, hari.length]);
      await k.simpanHari(c, id, karyawanId, 'cuti', hari);
      return id;
    });
  } catch (err) { throw k.terjemahkanTumpangTindih(err); }
}

async function ambilDetail(exec, pengajuanId) {
  const { rows } = await exec.query(
    `SELECT pc.tanggal_mulai, pc.tanggal_akhir, pc.jumlah_hari, j.nama AS jenis_cuti, j.potong_saldo
       FROM pengajuan_cuti pc JOIN jenis_cuti j ON j.id = pc.jenis_cuti_id WHERE pc.pengajuan_id = $1`, [pengajuanId]);
  return { ...rows[0], hari: await k.daftarHari(exec, pengajuanId) };
}

// Dipanggil mesin persetujuan (dalam transaksinya) saat langkah terakhir menyetujui.
async function saatDisetujui(c, p, pengguna) {
  await c.query('SELECT 1 FROM karyawan WHERE id = $1 FOR UPDATE', [p.karyawan_id]); // serialisasi saldo per karyawan
  const { rows } = await c.query(
    `SELECT pc.jenis_cuti_id, pc.tanggal_mulai, pc.tanggal_akhir, j.potong_saldo, j.nama
       FROM pengajuan_cuti pc JOIN jenis_cuti j ON j.id = pc.jenis_cuti_id WHERE pc.pengajuan_id = $1`, [p.id]);
  const pc = rows[0];
  if (!pc.potong_saldo) return;
  const hari = await k.daftarHari(c, p.id);
  const hariIni = await k.hariIni(c);
  for (const [tahun, jumlah] of Object.entries(perTahun(hari))) {
    const sisa = await saldo.saldoTahun(c, p.karyawan_id, pc.jenis_cuti_id, Number(tahun));
    if (sisa < jumlah) {
      throw new GalatBisnis(`Pengajuan tidak dapat disetujui: saldo ${pc.nama} tahun ${tahun} kini ${sisa} hari, dibutuhkan ${jumlah} hari. Tolak pengajuan ini.`, 409);
    }
    await c.query(
      `INSERT INTO saldo_cuti_mutasi (karyawan_id, jenis_cuti_id, tahun, jenis_mutasi, jumlah, tanggal, keterangan, pengajuan_id, dibuat_oleh)
       VALUES ($1, $2, $3, 'pakai', $4, $5, $6, $7, $8)`,
      [p.karyawan_id, pc.jenis_cuti_id, Number(tahun), -jumlah, hariIni, `Cuti ${pc.tanggal_mulai} s.d. ${pc.tanggal_akhir}`, p.id, pengguna.id]);
  }
}

async function saatDilepas(c, p) {
  await k.lepasHari(c, p.id);
}

// HR/admin membatalkan cuti yang sudah disetujui dan belum dimulai: saldo dikembalikan lewat mutasi 'batal'.
async function batalSetelahDisetujui(c, p, pengguna, catatan) {
  const { rows } = await c.query('SELECT jenis_cuti_id, tanggal_mulai FROM pengajuan_cuti WHERE pengajuan_id = $1', [p.id]);
  const pc = rows[0];
  const hariIni = await k.hariIni(c);
  if (pc.tanggal_mulai <= hariIni) throw new GalatBisnis('Cuti yang sudah dimulai tidak dapat dibatalkan.', 409);
  await c.query('SELECT 1 FROM karyawan WHERE id = $1 FOR UPDATE', [p.karyawan_id]);
  const { rows: pakai } = await c.query(
    `SELECT tahun, -SUM(jumlah)::int AS jumlah FROM saldo_cuti_mutasi WHERE pengajuan_id = $1 AND jenis_mutasi = 'pakai' GROUP BY tahun`, [p.id]);
  for (const m of pakai) {
    await c.query(
      `INSERT INTO saldo_cuti_mutasi (karyawan_id, jenis_cuti_id, tahun, jenis_mutasi, jumlah, tanggal, keterangan, pengajuan_id, dibuat_oleh)
       VALUES ($1, $2, $3, 'batal', $4, $5, $6, $7, $8)`,
      [p.karyawan_id, pc.jenis_cuti_id, m.tahun, m.jumlah, hariIni, `Pembatalan cuti${catatan ? `: ${catatan}` : ''}`, p.id, pengguna.id]);
  }
  await k.lepasHari(c, p.id);
}

module.exports = { ajukan, ambilDetail, saatDisetujui, saatDilepas, batalSetelahDisetujui };
