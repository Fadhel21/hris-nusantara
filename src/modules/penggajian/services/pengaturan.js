// Pengaturan penggajian: tarif BPJS, parameter (potongan keterlambatan), kepesertaan BPJS, dan nominal komponen karyawan.
// Semuanya bertanggal berlaku; tidak ada angka bawaan. Perubahan yang berlaku surut ke periode terkunci ditolak.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const audit = require('../../pengguna/services/audit');
const akses = require('../../karyawan/services/akses');
const { tanggalValid } = require('../../karyawan/services/format');
const kunci = require('./kunci');
const { URUTAN_PROGRAM, NAMA_PROGRAM } = require('./hitung');
const { TIPE_HARI, PRESET_KEPMENAKER } = require('./lembur');

function pastikanPengelola(pengguna) {
  if (!['admin', 'hr'].includes(pengguna.peran)) throw new GalatBisnis('Anda tidak berhak melakukan tindakan ini.', 403);
}

const POLA_TARIF = /^\d{1,3}(\.\d{1,4})?$/;
const POLA_UANG = /^\d{1,13}(\.\d{1,2})?$/;

function bacaTanggal(nilai, label = 'Tanggal berlaku') {
  const t = String(nilai || '').trim();
  if (!tanggalValid(t)) throw new GalatBisnis(`${label} tidak valid.`);
  return t;
}

// --- Tarif BPJS --------------------------------------------------------------------------------

async function daftarTarifBpjs() {
  const { rows } = await db.query(
    `SELECT id, program, tarif_karyawan, tarif_perusahaan, batas_upah_atas, tanggal_berlaku FROM tarif_bpjs
      WHERE deleted_at IS NULL ORDER BY program, tanggal_berlaku DESC`);
  return rows.sort((a, b) => URUTAN_PROGRAM.indexOf(a.program) - URUTAN_PROGRAM.indexOf(b.program) || (a.tanggal_berlaku < b.tanggal_berlaku ? 1 : -1));
}

async function tambahTarifBpjs(pengguna, input) {
  pastikanPengelola(pengguna);
  const program = String(input.program || '');
  if (!URUTAN_PROGRAM.includes(program)) throw new GalatBisnis('Program BPJS tidak valid.');
  const tk = String(input.tarif_karyawan === undefined ? '' : input.tarif_karyawan).trim();
  const tp = String(input.tarif_perusahaan === undefined ? '' : input.tarif_perusahaan).trim();
  if (!POLA_TARIF.test(tk) || Number(tk) > 100) throw new GalatBisnis('Tarif karyawan harus berupa persen 0-100 (maks. 4 desimal, titik sebagai desimal).');
  if (!POLA_TARIF.test(tp) || Number(tp) > 100) throw new GalatBisnis('Tarif perusahaan harus berupa persen 0-100 (maks. 4 desimal, titik sebagai desimal).');
  const batasMentah = String(input.batas_upah_atas || '').trim();
  if (batasMentah && (!POLA_UANG.test(batasMentah) || Number(batasMentah) <= 0)) throw new GalatBisnis('Batas upah atas harus berupa angka positif.');
  const tanggal = bacaTanggal(input.tanggal_berlaku);
  try {
    await db.transaksi(async (c) => {
      await kunci.pastikanBelumTerkunci(c, tanggal, 'Tarif BPJS ini');
      const { rows } = await c.query(
        `INSERT INTO tarif_bpjs (program, tarif_karyawan, tarif_perusahaan, batas_upah_atas, tanggal_berlaku)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`, [program, tk, tp, batasMentah || null, tanggal]);
      await audit.catat({
        penggunaId: pengguna.id, aksi: 'tambah_tarif_bpjs', entitas: 'pengaturan.tarif_bpjs', entitasId: rows[0].id,
        sesudah: { program, tarif_karyawan: tk, tarif_perusahaan: tp, batas_upah_atas: batasMentah || null, tanggal_berlaku: tanggal },
      }, c);
    });
  } catch (err) {
    if (err.code === '23505') throw new GalatBisnis('Sudah ada tarif untuk program dan tanggal berlaku tersebut.', 409);
    throw err;
  }
}

async function hapusTarifBpjs(pengguna, id) {
  pastikanPengelola(pengguna);
  await db.transaksi(async (c) => {
    const { rows } = await c.query('SELECT * FROM tarif_bpjs WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!rows[0]) throw new GalatBisnis('Tarif tidak ditemukan.', 404);
    await kunci.pastikanBelumTerkunci(c, rows[0].tanggal_berlaku, 'Tarif BPJS ini');
    await c.query('UPDATE tarif_bpjs SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
    await audit.catat({ penggunaId: pengguna.id, aksi: 'hapus_tarif_bpjs', entitas: 'pengaturan.tarif_bpjs', entitasId: id, sebelum: rows[0] }, c);
  });
}

// --- Parameter gaji ----------------------------------------------------------------------------

const KUNCI_TERLAMBAT = 'potongan_keterlambatan_per_menit';

// Parameter bernilai tunggal yang bertanggal berlaku. Tidak ada nilai bawaan.
const PARAMETER = {
  potongan_keterlambatan_per_menit: { label: 'Potongan keterlambatan per menit (Rp)', tipe: 'uang' },
  pembagi_upah_jam_lembur: { label: 'Pembagi upah per jam lembur', tipe: 'bulat' },
  lembur_maks_menit_per_hari: { label: 'Batas lembur per hari (menit, opsional)', tipe: 'bulat' },
};
const POLA_BULAT = /^[1-9]\d{0,5}$/;

async function daftarParameter() {
  const { rows } = await db.query(
    'SELECT id, kunci, nilai, tanggal_berlaku FROM parameter_gaji WHERE deleted_at IS NULL ORDER BY kunci, tanggal_berlaku DESC');
  return rows;
}

// Nilai parameter yang berlaku pada tanggal (baris dengan tanggal_berlaku terbaru <= tanggal), atau null bila belum diisi.
async function parameterBerlaku(exec, kunciParam, tanggal) {
  const { rows } = await exec.query(
    `SELECT nilai, tanggal_berlaku FROM parameter_gaji WHERE deleted_at IS NULL AND kunci = $1 AND tanggal_berlaku <= $2
      ORDER BY tanggal_berlaku DESC LIMIT 1`, [kunciParam, tanggal]);
  return rows[0] || null;
}

async function tambahParameter(pengguna, input) {
  pastikanPengelola(pengguna);
  const def = Object.prototype.hasOwnProperty.call(PARAMETER, input.kunci) ? PARAMETER[input.kunci] : null;
  if (!def) throw new GalatBisnis('Parameter tidak dikenal.');
  const nilai = String(input.nilai === undefined ? '' : input.nilai).trim();
  if (def.tipe === 'uang' && !POLA_UANG.test(nilai)) throw new GalatBisnis('Nilai harus berupa angka (maks. 2 desimal, tanpa pemisah ribuan).');
  if (def.tipe === 'bulat' && !POLA_BULAT.test(nilai)) throw new GalatBisnis('Nilai harus berupa bilangan bulat positif.');
  const tanggal = bacaTanggal(input.tanggal_berlaku);
  try {
    await db.transaksi(async (c) => {
      await kunci.pastikanBelumTerkunci(c, tanggal, 'Parameter ini');
      const { rows } = await c.query(
        'INSERT INTO parameter_gaji (kunci, nilai, tanggal_berlaku) VALUES ($1, $2, $3) RETURNING id', [input.kunci, nilai, tanggal]);
      await audit.catat({
        penggunaId: pengguna.id, aksi: 'tambah_parameter_gaji', entitas: 'pengaturan.parameter_gaji', entitasId: rows[0].id,
        sesudah: { kunci: input.kunci, nilai, tanggal_berlaku: tanggal },
      }, c);
    });
  } catch (err) {
    if (err.code === '23505') throw new GalatBisnis('Sudah ada nilai untuk tanggal berlaku tersebut.', 409);
    throw err;
  }
}

async function hapusParameter(pengguna, id) {
  pastikanPengelola(pengguna);
  await db.transaksi(async (c) => {
    const { rows } = await c.query('SELECT * FROM parameter_gaji WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!rows[0]) throw new GalatBisnis('Parameter tidak ditemukan.', 404);
    await kunci.pastikanBelumTerkunci(c, rows[0].tanggal_berlaku, 'Parameter ini');
    await c.query('UPDATE parameter_gaji SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
    await audit.catat({ penggunaId: pengguna.id, aksi: 'hapus_parameter_gaji', entitas: 'pengaturan.parameter_gaji', entitasId: id, sebelum: rows[0] }, c);
  });
}

// --- Kepesertaan BPJS --------------------------------------------------------------------------

async function kepesertaan(karyawanId) {
  const { rows } = await db.query(
    'SELECT program FROM kepesertaan_bpjs WHERE karyawan_id = $1 AND aktif AND deleted_at IS NULL', [karyawanId]);
  const ikut = new Set(rows.map((r) => r.program));
  return URUTAN_PROGRAM.map((p) => ({ program: p, nama: NAMA_PROGRAM[p], ikut: ikut.has(p) }));
}

async function aturKepesertaan(pengguna, karyawanId, input) {
  pastikanPengelola(pengguna);
  const dipilih = new Set([].concat(input.program || []).map(String));
  for (const p of dipilih) if (!URUTAN_PROGRAM.includes(p)) throw new GalatBisnis('Program BPJS tidak valid.');
  await db.transaksi(async (c) => {
    const { rowCount } = await c.query('SELECT 1 FROM karyawan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [karyawanId]);
    if (!rowCount) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
    const { rows } = await c.query('SELECT program FROM kepesertaan_bpjs WHERE karyawan_id = $1 AND aktif AND deleted_at IS NULL', [karyawanId]);
    const sebelum = rows.map((r) => r.program).sort();
    for (const p of URUTAN_PROGRAM) {
      await c.query(
        `INSERT INTO kepesertaan_bpjs (karyawan_id, program, aktif) VALUES ($1, $2, $3)
         ON CONFLICT (karyawan_id, program) WHERE deleted_at IS NULL DO UPDATE SET aktif = EXCLUDED.aktif, updated_at = now()`,
        [karyawanId, p, dipilih.has(p)]);
    }
    const sesudah = [...dipilih].sort();
    if (JSON.stringify(sebelum) !== JSON.stringify(sesudah)) {
      await audit.catat({ penggunaId: pengguna.id, aksi: 'ubah_kepesertaan_bpjs', entitas: 'karyawan', entitasId: karyawanId, sebelum: { program: sebelum }, sesudah: { program: sesudah } }, c);
    }
  });
}

// --- Komponen gaji per karyawan ----------------------------------------------------------------

async function daftarKomponenKaryawan(karyawanId) {
  const { rows } = await db.query(
    `SELECT r.id, r.tanggal_berlaku, r.nominal, k.kode, k.nama, k.jenis,
            (r.id = (SELECT x.id FROM riwayat_komponen_karyawan x
                      WHERE x.karyawan_id = r.karyawan_id AND x.komponen_id = r.komponen_id AND x.deleted_at IS NULL
                        AND x.tanggal_berlaku <= (now() AT TIME ZONE 'Asia/Jakarta')::date
                      ORDER BY x.tanggal_berlaku DESC, x.id DESC LIMIT 1)) AS berlaku
       FROM riwayat_komponen_karyawan r JOIN komponen_gaji k ON k.id = r.komponen_id
      WHERE r.karyawan_id = $1 AND r.deleted_at IS NULL ORDER BY k.nama, r.tanggal_berlaku DESC`, [karyawanId]);
  return rows;
}

async function daftarKomponenAktif() {
  const { rows } = await db.query('SELECT id, kode, nama, jenis FROM komponen_gaji WHERE deleted_at IS NULL ORDER BY jenis, nama');
  return rows;
}

async function tambahKomponenKaryawan(pengguna, karyawanId, input) {
  pastikanPengelola(pengguna);
  if (!/^\d{1,18}$/.test(String(input.komponen_id || ''))) throw new GalatBisnis('Komponen wajib dipilih.');
  const nominal = String(input.nominal === undefined ? '' : input.nominal).trim();
  if (!POLA_UANG.test(nominal)) throw new GalatBisnis('Nominal harus berupa angka (maks. 2 desimal, tanpa pemisah ribuan). Isi 0 untuk menghentikan komponen.');
  const tanggal = bacaTanggal(input.tanggal_berlaku);
  try {
    await db.transaksi(async (c) => {
      const { rows: k } = await c.query("SELECT status, tanggal_masuk FROM karyawan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [karyawanId]);
      if (!k[0]) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
      if (k[0].status !== 'aktif') throw new GalatBisnis('Karyawan sudah keluar; komponen gaji tidak dapat diubah.', 409);
      if (tanggal < k[0].tanggal_masuk) throw new GalatBisnis('Tanggal berlaku tidak boleh sebelum tanggal masuk karyawan.');
      const { rows: kom } = await c.query('SELECT id, nama FROM komponen_gaji WHERE id = $1 AND deleted_at IS NULL', [input.komponen_id]);
      if (!kom[0]) throw new GalatBisnis('Komponen tidak ditemukan.', 404);
      await kunci.pastikanBelumTerkunci(c, tanggal, 'Komponen gaji ini');
      const { rows } = await c.query(
        'INSERT INTO riwayat_komponen_karyawan (karyawan_id, komponen_id, tanggal_berlaku, nominal) VALUES ($1, $2, $3, $4) RETURNING id',
        [karyawanId, kom[0].id, tanggal, nominal]);
      await audit.catat({
        penggunaId: pengguna.id, aksi: 'tambah_komponen_gaji', entitas: 'karyawan', entitasId: karyawanId,
        sesudah: { id: rows[0].id, komponen: kom[0].nama, nominal, tanggal_berlaku: tanggal },
      }, c);
    });
  } catch (err) {
    if (err.code === '23505') throw new GalatBisnis('Sudah ada nominal untuk komponen dan tanggal berlaku tersebut.', 409);
    throw err;
  }
}

async function hapusKomponenKaryawan(pengguna, karyawanId, riwayatId) {
  pastikanPengelola(pengguna);
  await db.transaksi(async (c) => {
    const { rows } = await c.query(
      'SELECT * FROM riwayat_komponen_karyawan WHERE id = $1 AND karyawan_id = $2 AND deleted_at IS NULL FOR UPDATE', [riwayatId, karyawanId]);
    if (!rows[0]) throw new GalatBisnis('Riwayat komponen tidak ditemukan.', 404);
    await kunci.pastikanBelumTerkunci(c, rows[0].tanggal_berlaku, 'Komponen gaji ini');
    await c.query('UPDATE riwayat_komponen_karyawan SET deleted_at = now(), updated_at = now() WHERE id = $1', [riwayatId]);
    await audit.catat({ penggunaId: pengguna.id, aksi: 'hapus_komponen_gaji', entitas: 'karyawan', entitasId: karyawanId, sebelum: rows[0] }, c);
  });
}

// --- Aturan lembur -----------------------------------------------------------------------------

async function daftarAturanLembur() {
  const { rows } = await db.query(
    `SELECT id, tipe_hari, menit_dari, menit_sampai, pengali, tanggal_berlaku FROM aturan_lembur
      WHERE deleted_at IS NULL ORDER BY tanggal_berlaku DESC, tipe_hari, menit_dari`);
  return rows;
}

async function tambahAturanLembur(pengguna, input) {
  pastikanPengelola(pengguna);
  if (!Object.prototype.hasOwnProperty.call(TIPE_HARI, input.tipe_hari)) throw new GalatBisnis('Tipe hari tidak valid.');
  const dari = String(input.menit_dari === undefined ? '' : input.menit_dari).trim();
  const sampai = String(input.menit_sampai === undefined ? '' : input.menit_sampai).trim();
  if (!/^\d{1,5}$/.test(dari)) throw new GalatBisnis('Menit mulai harus bilangan bulat tidak negatif.');
  if (sampai && (!/^\d{1,5}$/.test(sampai) || Number(sampai) <= Number(dari))) throw new GalatBisnis('Menit akhir harus bilangan bulat lebih besar dari menit mulai (kosongkan bila tanpa batas).');
  const pengali = String(input.pengali === undefined ? '' : input.pengali).trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(pengali) || Number(pengali) <= 0 || Number(pengali) > 20) throw new GalatBisnis('Pengali harus berupa angka positif (maks. 2 desimal, maksimum 20).');
  const tanggal = bacaTanggal(input.tanggal_berlaku);
  try {
    await db.transaksi(async (c) => {
      await kunci.pastikanBelumTerkunci(c, tanggal, 'Aturan lembur ini');
      const { rowCount } = await c.query(
        `SELECT 1 FROM aturan_lembur WHERE tipe_hari = $1 AND tanggal_berlaku = $2 AND deleted_at IS NULL
            AND menit_dari < COALESCE($4::int, 2147483647) AND COALESCE(menit_sampai, 2147483647) > $3::int`,
        [input.tipe_hari, tanggal, Number(dari), sampai ? Number(sampai) : null]);
      if (rowCount) throw new GalatBisnis('Rentang menit bertumpang tindih dengan tahap lain pada tipe hari dan tanggal berlaku yang sama.', 409);
      const { rows } = await c.query(
        'INSERT INTO aturan_lembur (tipe_hari, menit_dari, menit_sampai, pengali, tanggal_berlaku) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [input.tipe_hari, Number(dari), sampai ? Number(sampai) : null, pengali, tanggal]);
      await audit.catat({
        penggunaId: pengguna.id, aksi: 'tambah_aturan_lembur', entitas: 'pengaturan.aturan_lembur', entitasId: rows[0].id,
        sesudah: { tipe_hari: input.tipe_hari, menit_dari: Number(dari), menit_sampai: sampai ? Number(sampai) : null, pengali, tanggal_berlaku: tanggal },
      }, c);
    });
  } catch (err) {
    if (err.code === '23505') throw new GalatBisnis('Sudah ada tahap dengan menit mulai dan tanggal berlaku tersebut.', 409);
    throw err;
  }
}

async function hapusAturanLembur(pengguna, id) {
  pastikanPengelola(pengguna);
  await db.transaksi(async (c) => {
    const { rows } = await c.query('SELECT * FROM aturan_lembur WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!rows[0]) throw new GalatBisnis('Aturan tidak ditemukan.', 404);
    await kunci.pastikanBelumTerkunci(c, rows[0].tanggal_berlaku, 'Aturan lembur ini');
    await c.query('UPDATE aturan_lembur SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
    await audit.catat({ penggunaId: pengguna.id, aksi: 'hapus_aturan_lembur', entitas: 'pengaturan.aturan_lembur', entitasId: id, sebelum: rows[0] }, c);
  });
}

// Mengisi seluruh aturan lembur sesuai preset Kepmenaker 102/2004 beserta pembagi 173, atas permintaan eksplisit pemilik.
async function terapkanPresetKepmenaker(pengguna, input) {
  pastikanPengelola(pengguna);
  const tanggal = bacaTanggal(input.tanggal_berlaku);
  await db.transaksi(async (c) => {
    await kunci.pastikanBelumTerkunci(c, tanggal, 'Aturan lembur ini');
    const { rowCount } = await c.query('SELECT 1 FROM aturan_lembur WHERE tanggal_berlaku = $1 AND deleted_at IS NULL', [tanggal]);
    if (rowCount) throw new GalatBisnis('Sudah ada aturan lembur pada tanggal berlaku tersebut. Hapus dulu atau pilih tanggal lain.', 409);
    for (const a of PRESET_KEPMENAKER.aturan) {
      await c.query(
        'INSERT INTO aturan_lembur (tipe_hari, menit_dari, menit_sampai, pengali, tanggal_berlaku) VALUES ($1, $2, $3, $4, $5)',
        [a.tipe_hari, a.menit_dari, a.menit_sampai, a.pengali, tanggal]);
    }
    const ada = await c.query("SELECT 1 FROM parameter_gaji WHERE kunci = 'pembagi_upah_jam_lembur' AND tanggal_berlaku = $1 AND deleted_at IS NULL", [tanggal]);
    if (!ada.rowCount) {
      await c.query("INSERT INTO parameter_gaji (kunci, nilai, tanggal_berlaku) VALUES ('pembagi_upah_jam_lembur', $1, $2)", [PRESET_KEPMENAKER.pembagi, tanggal]);
    }
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'terapkan_preset_lembur', entitas: 'pengaturan.aturan_lembur', entitasId: tanggal,
      sesudah: { sumber: 'Kepmenaker 102/2004', tanggal_berlaku: tanggal, pembagi: PRESET_KEPMENAKER.pembagi, jumlah_tahap: PRESET_KEPMENAKER.aturan.length },
    }, c);
  });
}

// Hak lihat komponen/BPJS karyawan: hanya pengelola (admin/HR).
function pastikanBolehLihat(pengguna) {
  if (!akses.semuaData(pengguna)) throw new GalatBisnis('Data tidak ditemukan.', 404);
}

module.exports = {
  KUNCI_TERLAMBAT, PARAMETER, daftarTarifBpjs, tambahTarifBpjs, hapusTarifBpjs, daftarParameter, parameterBerlaku, tambahParameter, hapusParameter,
  daftarAturanLembur, tambahAturanLembur, hapusAturanLembur, terapkanPresetKepmenaker,
  kepesertaan, aturKepesertaan, daftarKomponenKaryawan, daftarKomponenAktif, tambahKomponenKaryawan, hapusKomponenKaryawan,
  pastikanBolehLihat,
};
