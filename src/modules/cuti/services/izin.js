// Pengajuan izin: seperti cuti tetapi tanpa saldo.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const pengajuan = require('../../persetujuan/services/pengajuan');
const k = require('./ketidakhadiran');

const KATEGORI = { sakit: 'Sakit', keperluan_pribadi: 'Keperluan pribadi', lainnya: 'Lainnya' };

async function ajukan(pengguna, input) {
  if (!pengguna.karyawanId) throw new GalatBisnis('Akun Anda belum terhubung ke data karyawan, sehingga tidak dapat mengajukan izin.', 403);
  const karyawanId = pengguna.karyawanId;
  const rentang = k.bacaRentang(input);
  const alasan = k.bacaAlasan(input);
  const kategori = String(input.kategori || '');
  if (!Object.prototype.hasOwnProperty.call(KATEGORI, kategori)) throw new GalatBisnis('Kategori izin tidak valid.');

  try {
    return await db.transaksi(async (c) => {
      const karyawan = await k.kunciKaryawanAktif(c, karyawanId);
      const hari = await k.siapkanHari(c, karyawanId, karyawan, rentang);
      const id = await pengajuan.buat(c, { jenis: 'izin', karyawanId, pengguna, alasan });
      await c.query(
        'INSERT INTO pengajuan_izin (pengajuan_id, kategori, tanggal_mulai, tanggal_akhir, jumlah_hari) VALUES ($1, $2, $3, $4, $5)',
        [id, kategori, rentang.mulai, rentang.akhir, hari.length]);
      await k.simpanHari(c, id, karyawanId, 'izin', hari);
      return id;
    });
  } catch (err) { throw k.terjemahkanTumpangTindih(err); }
}

async function ambilDetail(exec, pengajuanId) {
  const { rows } = await exec.query(
    'SELECT kategori, tanggal_mulai, tanggal_akhir, jumlah_hari FROM pengajuan_izin WHERE pengajuan_id = $1', [pengajuanId]);
  return { ...rows[0], kategori_label: KATEGORI[rows[0].kategori], hari: await k.daftarHari(exec, pengajuanId) };
}

async function saatDisetujui() { /* izin tidak memakai saldo; hari-harinya tetap tercatat */ }

async function saatDilepas(c, p) {
  await k.lepasHari(c, p.id);
}

async function batalSetelahDisetujui(c, p) {
  const { rows } = await c.query('SELECT tanggal_mulai FROM pengajuan_izin WHERE pengajuan_id = $1', [p.id]);
  if (rows[0].tanggal_mulai <= (await k.hariIni(c))) throw new GalatBisnis('Izin yang sudah dimulai tidak dapat dibatalkan.', 409);
  await k.lepasHari(c, p.id);
}

module.exports = { KATEGORI, ajukan, ambilDetail, saatDisetujui, saatDilepas, batalSetelahDisetujui };
