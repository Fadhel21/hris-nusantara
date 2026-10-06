// Pajak penghasilan (PPh 21): konfigurasi tabel (impor CSV), status pajak karyawan, saldo awal, dan perakitan
// masukan perhitungan per karyawan. Semua tarif/PTKP berasal dari tabel yang diisi pemilik; tidak ada angka bawaan.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const audit = require('../../pengguna/services/audit');
const { tanggalValid } = require('../../karyawan/services/format');
const kunci = require('./kunci');
const csv = require('./csv');
const uang = require('./uang');

const MULAI_KUNCI = 'pph21_mulai';
const POLA_UANG = /^\d{1,13}(\.\d{1,2})?$/;
const JENIS_TABEL = { ptkp: 'ptkp_status', ter: 'tarif_ter', lapisan: 'lapisan_pph21' };

function pastikanPengelola(pengguna) {
  if (!['admin', 'hr'].includes(pengguna.peran)) throw new GalatBisnis('Anda tidak berhak melakukan tindakan ini.', 403);
}

// --- Aktivasi ----------------------------------------------------------------------------------

async function ambilMulai(exec = db) {
  const { rows } = await exec.query('SELECT nilai FROM pengaturan_sistem WHERE kunci = $1 AND deleted_at IS NULL', [MULAI_KUNCI]);
  return rows[0] ? rows[0].nilai : '';
}

function aktifUntuk(mulai, tahun, bulan) {
  return mulai !== '' && mulai <= `${tahun}-${String(bulan).padStart(2, '0')}`;
}

// Mengaktifkan PPh 21 mulai periode tertentu (YYYY-MM), atau mematikannya (kosong).
// Tidak boleh sama dengan/sebelum periode yang sudah dikunci, agar hasil yang sudah dikunci tidak "berubah makna".
async function aturMulai(pengguna, nilaiMentah) {
  pastikanPengelola(pengguna);
  const nilai = String(nilaiMentah || '').trim();
  if (nilai !== '' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(nilai)) throw new GalatBisnis('Periode mulai harus berformat YYYY-MM atau dikosongkan.');
  await db.transaksi(async (c) => {
    const lama = await ambilMulai(c);
    if (nilai !== '') {
      const { rows } = await c.query(
        `SELECT max(tahun * 100 + bulan) AS terakhir FROM periode_gaji WHERE status = 'terkunci' AND deleted_at IS NULL`);
      const [t, b] = nilai.split('-').map(Number);
      if (rows[0].terakhir !== null && t * 100 + b <= Number(rows[0].terakhir)) {
        throw new GalatBisnis('PPh 21 tidak dapat dimulai pada/sebelum periode gaji yang sudah dikunci.', 409);
      }
    } else {
      const { rowCount } = await c.query(`SELECT 1 FROM slip_gaji WHERE metode_pajak IS NOT NULL AND deleted_at IS NULL LIMIT 1`);
      if (rowCount) throw new GalatBisnis('PPh 21 sudah dipakai pada slip yang ada; tidak dapat dimatikan.', 409);
    }
    await c.query('UPDATE pengaturan_sistem SET nilai = $1, updated_at = now() WHERE kunci = $2', [nilai, MULAI_KUNCI]);
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'ubah_pengaturan', entitas: 'pengaturan.sistem', entitasId: MULAI_KUNCI,
      sebelum: { nilai: lama }, sesudah: { nilai },
    }, c);
  });
}

// --- Ringkasan & impor tabel -------------------------------------------------------------------

async function ringkasan() {
  const [ptkp, ter, lapisan] = await Promise.all([
    db.query('SELECT tanggal_berlaku, count(*)::int AS jumlah FROM ptkp_status WHERE deleted_at IS NULL GROUP BY tanggal_berlaku ORDER BY tanggal_berlaku DESC'),
    db.query('SELECT tanggal_berlaku, kategori, count(*)::int AS jumlah FROM tarif_ter WHERE deleted_at IS NULL GROUP BY tanggal_berlaku, kategori ORDER BY tanggal_berlaku DESC, kategori'),
    db.query('SELECT tanggal_berlaku, count(*)::int AS jumlah FROM lapisan_pph21 WHERE deleted_at IS NULL GROUP BY tanggal_berlaku ORDER BY tanggal_berlaku DESC'),
  ]);
  return { ptkp: ptkp.rows, ter: ter.rows, lapisan: lapisan.rows, mulai: await ambilMulai() };
}

// Status PTKP yang tersedia (set terbaru per kode), untuk dropdown status pajak karyawan.
async function daftarStatusTersedia() {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (upper(kode)) kode, ptkp_tahunan, kategori_ter FROM ptkp_status
      WHERE deleted_at IS NULL ORDER BY upper(kode), tanggal_berlaku DESC`);
  return rows.sort((a, b) => a.kode.localeCompare(b.kode));
}

// mode: 'validasi' (tidak menyimpan) atau 'simpan'. Mengembalikan { galat, ringkasan, tersimpan }.
async function impor(pengguna, jenis, teks, mode) {
  pastikanPengelola(pengguna);
  const v = csv.validasi(jenis, teks);
  if (v.galat.length) return { galat: v.galat, ringkasan: v.ringkasan, tersimpan: false };
  if (mode !== 'simpan') return { galat: [], ringkasan: v.ringkasan, tersimpan: false };

  await db.transaksi(async (c) => {
    const tanggal = [...new Set(v.data.map((r) => r.tanggal_berlaku))].sort();
    for (const t of tanggal) await kunci.pastikanBelumTerkunci(c, t, 'Tabel pajak ini');
    for (const t of tanggal) {
      let ada;
      if (jenis === 'ptkp') {
        ada = await c.query('SELECT 1 FROM ptkp_status WHERE tanggal_berlaku = $1 AND upper(kode) = ANY($2::text[]) AND deleted_at IS NULL',
          [t, v.data.filter((r) => r.tanggal_berlaku === t).map((r) => r.kode.toUpperCase())]);
      } else if (jenis === 'ter') {
        ada = await c.query('SELECT 1 FROM tarif_ter WHERE tanggal_berlaku = $1 AND kategori = ANY($2::text[]) AND deleted_at IS NULL',
          [t, [...new Set(v.data.filter((r) => r.tanggal_berlaku === t).map((r) => r.kategori))]]);
      } else {
        ada = await c.query('SELECT 1 FROM lapisan_pph21 WHERE tanggal_berlaku = $1 AND deleted_at IS NULL', [t]);
      }
      if (ada.rowCount) throw new GalatBisnis(`Sudah ada data ${jenis} dengan tanggal berlaku ${t}. Hapus set lama terlebih dahulu.`, 409);
    }
    for (const r of v.data) {
      if (jenis === 'ptkp') {
        await c.query('INSERT INTO ptkp_status (kode, ptkp_tahunan, kategori_ter, tanggal_berlaku) VALUES ($1, $2, $3, $4)',
          [r.kode, r.ptkp_tahunan, r.kategori_ter, r.tanggal_berlaku]);
      } else if (jenis === 'ter') {
        await c.query('INSERT INTO tarif_ter (kategori, batas_bawah, batas_atas, tarif, tanggal_berlaku) VALUES ($1, $2, $3, $4, $5)',
          [r.kategori, r.batas_bawah, r.batas_atas, r.tarif, r.tanggal_berlaku]);
      } else {
        await c.query('INSERT INTO lapisan_pph21 (batas_bawah, batas_atas, tarif, tanggal_berlaku) VALUES ($1, $2, $3, $4)',
          [r.batas_bawah, r.batas_atas, r.tarif, r.tanggal_berlaku]);
      }
    }
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'impor_tabel_pajak', entitas: 'pengaturan.pajak', entitasId: jenis,
      sesudah: { jenis, jumlah_baris: v.data.length, tanggal_berlaku: tanggal },
    }, c);
  });
  return { galat: [], ringkasan: v.ringkasan, tersimpan: true };
}

// Menghapus (soft delete) satu set tabel pada tanggal berlaku tertentu (untuk TER: per kategori).
async function hapusSet(pengguna, jenis, tanggal, kategori = null) {
  pastikanPengelola(pengguna);
  if (!Object.prototype.hasOwnProperty.call(JENIS_TABEL, jenis)) throw new GalatBisnis('Jenis tabel tidak dikenal.');
  if (!tanggalValid(String(tanggal || ''))) throw new GalatBisnis('Tanggal berlaku tidak valid.');
  if (jenis === 'ter' && !['A', 'B', 'C'].includes(kategori)) throw new GalatBisnis('Kategori TER tidak valid.');
  await db.transaksi(async (c) => {
    await kunci.pastikanBelumTerkunci(c, tanggal, 'Tabel pajak ini');
    const tabel = JENIS_TABEL[jenis];
    const { rowCount } = jenis === 'ter'
      ? await c.query(`UPDATE ${tabel} SET deleted_at = now(), updated_at = now() WHERE tanggal_berlaku = $1 AND kategori = $2 AND deleted_at IS NULL`, [tanggal, kategori])
      : await c.query(`UPDATE ${tabel} SET deleted_at = now(), updated_at = now() WHERE tanggal_berlaku = $1 AND deleted_at IS NULL`, [tanggal]);
    if (!rowCount) throw new GalatBisnis('Set data tidak ditemukan.', 404);
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'hapus_set_pajak', entitas: 'pengaturan.pajak', entitasId: jenis,
      sebelum: { jenis, tanggal_berlaku: tanggal, kategori, jumlah_baris: rowCount },
    }, c);
  });
}

// --- Status pajak karyawan ---------------------------------------------------------------------

async function daftarStatus(karyawanId) {
  const { rows } = await db.query(
    `SELECT r.id, r.kode_status, r.tanggal_berlaku,
            (r.id = (SELECT x.id FROM riwayat_status_pajak x WHERE x.karyawan_id = r.karyawan_id AND x.deleted_at IS NULL
                      AND x.tanggal_berlaku <= (now() AT TIME ZONE 'Asia/Jakarta')::date ORDER BY x.tanggal_berlaku DESC, x.id DESC LIMIT 1)) AS berlaku
       FROM riwayat_status_pajak r WHERE r.karyawan_id = $1 AND r.deleted_at IS NULL ORDER BY r.tanggal_berlaku DESC, r.id DESC`, [karyawanId]);
  return rows;
}

async function tambahStatus(pengguna, karyawanId, input) {
  pastikanPengelola(pengguna);
  const kode = String(input.kode_status || '').trim();
  const tanggal = String(input.tanggal_berlaku || '').trim();
  if (!/^[A-Za-z0-9/]{1,12}$/.test(kode)) throw new GalatBisnis('Status pajak tidak valid.');
  if (!tanggalValid(tanggal)) throw new GalatBisnis('Tanggal berlaku tidak valid.');
  try {
    await db.transaksi(async (c) => {
      const { rows: k } = await c.query('SELECT status, tanggal_masuk FROM karyawan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [karyawanId]);
      if (!k[0]) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
      if (tanggal < k[0].tanggal_masuk) throw new GalatBisnis('Tanggal berlaku tidak boleh sebelum tanggal masuk karyawan.');
      const { rows: ada } = await c.query('SELECT kode FROM ptkp_status WHERE upper(kode) = upper($1) AND deleted_at IS NULL LIMIT 1', [kode]);
      if (!ada[0]) throw new GalatBisnis('Status pajak tidak ada di tabel PTKP. Impor tabel PTKP terlebih dahulu.', 422);
      await kunci.pastikanBelumTerkunci(c, tanggal, 'Status pajak ini');
      const { rows } = await c.query(
        'INSERT INTO riwayat_status_pajak (karyawan_id, kode_status, tanggal_berlaku) VALUES ($1, $2, $3) RETURNING id', [karyawanId, ada[0].kode, tanggal]);
      await audit.catat({ penggunaId: pengguna.id, aksi: 'tambah_status_pajak', entitas: 'karyawan', entitasId: karyawanId, sesudah: { id: rows[0].id, kode_status: ada[0].kode, tanggal_berlaku: tanggal } }, c);
    });
  } catch (err) {
    if (err.code === '23505') throw new GalatBisnis('Sudah ada status pajak pada tanggal berlaku tersebut.', 409);
    throw err;
  }
}

async function hapusStatus(pengguna, karyawanId, id) {
  pastikanPengelola(pengguna);
  await db.transaksi(async (c) => {
    const { rows } = await c.query('SELECT * FROM riwayat_status_pajak WHERE id = $1 AND karyawan_id = $2 AND deleted_at IS NULL FOR UPDATE', [id, karyawanId]);
    if (!rows[0]) throw new GalatBisnis('Riwayat status pajak tidak ditemukan.', 404);
    await kunci.pastikanBelumTerkunci(c, rows[0].tanggal_berlaku, 'Status pajak ini');
    await c.query('UPDATE riwayat_status_pajak SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
    await audit.catat({ penggunaId: pengguna.id, aksi: 'hapus_status_pajak', entitas: 'karyawan', entitasId: karyawanId, sebelum: rows[0] }, c);
  });
}

// --- Saldo awal pajak --------------------------------------------------------------------------

async function daftarSaldoAwal(karyawanId) {
  const { rows } = await db.query(
    'SELECT id, tahun, sampai_bulan, bruto_ytd, iuran_pengurang_ytd, pph21_ytd FROM saldo_awal_pajak WHERE karyawan_id = $1 AND deleted_at IS NULL ORDER BY tahun DESC', [karyawanId]);
  return rows;
}

async function simpanSaldoAwal(pengguna, karyawanId, input) {
  pastikanPengelola(pengguna);
  const tahun = String(input.tahun || '').trim();
  const sampai = String(input.sampai_bulan || '').trim();
  if (!/^\d{4}$/.test(tahun) || Number(tahun) < 2000 || Number(tahun) > 2100) throw new GalatBisnis('Tahun tidak valid.');
  if (!/^\d{1,2}$/.test(sampai) || Number(sampai) < 1 || Number(sampai) > 11) throw new GalatBisnis('Sampai bulan harus 1-11.');
  const nilai = {};
  for (const [kolom, label] of [['bruto_ytd', 'Penghasilan bruto'], ['iuran_pengurang_ytd', 'Iuran pengurang'], ['pph21_ytd', 'PPh 21 yang sudah dipotong']]) {
    const v = String(input[kolom] === undefined ? '' : input[kolom]).trim();
    if (!POLA_UANG.test(v)) throw new GalatBisnis(`${label} harus berupa angka (maks. 2 desimal, tanpa pemisah ribuan; isi 0 bila tidak ada).`);
    nilai[kolom] = v;
  }
  await db.transaksi(async (c) => {
    const { rowCount } = await c.query('SELECT 1 FROM karyawan WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [karyawanId]);
    if (!rowCount) throw new GalatBisnis('Data karyawan tidak ditemukan.', 404);
    const { rowCount: terpakai } = await c.query(
      `SELECT 1 FROM slip_gaji s JOIN periode_gaji p ON p.id = s.periode_id
        WHERE s.karyawan_id = $1 AND p.tahun = $2 AND p.status = 'terkunci' AND s.metode_pajak = 'MASA_AKHIR' AND s.deleted_at IS NULL LIMIT 1`, [karyawanId, Number(tahun)]);
    // Saldo awal hanya dipakai pada masa pajak terakhir; selama belum ada slip masa-akhir yang terkunci, boleh diisi/diganti.
    if (terpakai) throw new GalatBisnis('Saldo awal tidak dapat diubah: sudah ada slip masa pajak terakhir yang terkunci pada tahun itu.', 409);
    const { rows: lama } = await c.query('SELECT * FROM saldo_awal_pajak WHERE karyawan_id = $1 AND tahun = $2 AND deleted_at IS NULL FOR UPDATE', [karyawanId, Number(tahun)]);
    if (lama[0]) await c.query('UPDATE saldo_awal_pajak SET deleted_at = now(), updated_at = now() WHERE id = $1', [lama[0].id]);
    await c.query(
      `INSERT INTO saldo_awal_pajak (karyawan_id, tahun, sampai_bulan, bruto_ytd, iuran_pengurang_ytd, pph21_ytd) VALUES ($1, $2, $3, $4, $5, $6)`,
      [karyawanId, Number(tahun), Number(sampai), nilai.bruto_ytd, nilai.iuran_pengurang_ytd, nilai.pph21_ytd]);
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'simpan_saldo_awal_pajak', entitas: 'karyawan', entitasId: karyawanId,
      sebelum: lama[0] ? { sampai_bulan: lama[0].sampai_bulan, bruto_ytd: lama[0].bruto_ytd, pph21_ytd: lama[0].pph21_ytd } : null,
      sesudah: { tahun: Number(tahun), sampai_bulan: Number(sampai), ...nilai },
    }, c);
  });
}

// --- Perakitan masukan perhitungan -------------------------------------------------------------

function pilihTerbaru(baris, akhir) {
  let t = null;
  for (const r of baris) if (r.tanggal_berlaku <= akhir && (t === null || r.tanggal_berlaku > t)) t = r.tanggal_berlaku;
  return t === null ? [] : baris.filter((r) => r.tanggal_berlaku === t);
}

// Merakit masukan `pajak` untuk hitungSlip satu karyawan. Melempar Error berpesan jelas bila data belum lengkap.
//   ctx: { tahun, bulan, awal, akhir, ptkp, ter, lapisan, riwayatStatus, saldoAwal, slipSebelum, parameter }
//   parameter: { biayaJabatanPersen, biayaJabatanMaksPerBulan, pembulatanPkp, pengaliTanpaNpwp } (nilai teks atau null)
function susunMasukan(ctx, k) {
  const { tahun, bulan, awal, akhir } = ctx;
  const milik = (baris) => baris.filter((r) => String(r.karyawan_id) === String(k.id));
  let status = null;
  for (const r of milik(ctx.riwayatStatus)) if (r.tanggal_berlaku <= akhir && (!status || r.tanggal_berlaku > status.tanggal_berlaku)) status = r;
  if (!status) throw new Error('Status pajak belum diisi (tab Pajak pada data karyawan).');
  const baris = ctx.ptkp.filter((r) => r.kode.toUpperCase() === status.kode_status.toUpperCase());
  const ptkp = pilihTerbaru(baris, akhir)[0];
  if (!ptkp) throw new Error(`Status pajak ${status.kode_status} belum ada di tabel PTKP (berlaku sampai ${akhir}).`);
  const ter = pilihTerbaru(ctx.ter.filter((r) => r.kategori === ptkp.kategori_ter), akhir);
  if (!ter.length) throw new Error(`Tabel TER kategori ${ptkp.kategori_ter} belum diisi (berlaku sampai ${akhir}).`);
  const tanpaNpwp = !k.npwp;
  if (tanpaNpwp && !ctx.parameter.pengaliTanpaNpwp) {
    throw new Error('Tidak memiliki NPWP: isi parameter "pengali tanpa NPWP" (isi 1.00 bila tidak ada tambahan).');
  }
  const hasil = { kategori: ptkp.kategori_ter, ter, tanpaNpwp, pengaliTanpaNpwp: ctx.parameter.pengaliTanpaNpwp, masaAkhir: null };

  const keluarDiPeriode = k.tanggal_keluar && k.tanggal_keluar >= awal && k.tanggal_keluar <= akhir;
  if (bulan !== 12 && !keluarDiPeriode) return hasil;

  // Masa pajak terakhir: butuh parameter, lapisan, dan data seluruh bulan sebelumnya pada tahun itu.
  const p = ctx.parameter;
  const kurang = [];
  if (!p.biayaJabatanPersen) kurang.push('biaya jabatan (persen)');
  if (!p.biayaJabatanMaksPerBulan) kurang.push('biaya jabatan maksimum per bulan');
  if (!p.pembulatanPkp) kurang.push('pembulatan PKP');
  if (kurang.length) throw new Error(`Masa pajak terakhir membutuhkan parameter yang belum diisi: ${kurang.join(', ')}.`);
  const lapisan = pilihTerbaru(ctx.lapisan, akhir);
  if (!lapisan.length) throw new Error(`Lapisan tarif PPh 21 belum diisi (berlaku sampai ${akhir}).`);

  const awalBulan = k.tanggal_masuk.slice(0, 4) === String(tahun) ? Number(k.tanggal_masuk.slice(5, 7)) : 1;
  const saldo = milik(ctx.saldoAwal)[0] || null;
  const slipKaryawan = milik(ctx.slipSebelum);
  let bruto = 0n; let iuran = 0n; let pph = 0n;
  if (saldo) { bruto += uang.keSen(saldo.bruto_ytd); iuran += uang.keSen(saldo.iuran_pengurang_ytd); pph += uang.keSen(saldo.pph21_ytd); }
  for (let mm = awalBulan; mm < bulan; mm += 1) {
    if (saldo && mm <= saldo.sampai_bulan) continue;
    const slip = slipKaryawan.find((s) => s.bulan === mm && s.metode_pajak);
    if (!slip) throw new Error(`Data pajak bulan ${String(mm).padStart(2, '0')}/${tahun} belum ada (hitung periode itu, atau isi saldo awal pajak).`);
    if (slip.status !== 'terkunci') throw new Error(`Periode ${String(mm).padStart(2, '0')}/${tahun} belum dikunci; kunci dulu sebelum menghitung masa pajak terakhir.`);
    bruto += uang.keSen(slip.bruto_pajak);
    iuran += uang.keSen(slip.iuran_pengurang_pajak);
    pph += uang.keSen(slip.pph21);
  }
  hasil.masaAkhir = {
    brutoYtdSebelum: bruto, iuranYtdSebelum: iuran, pphYtdSebelum: pph, bulanBekerja: bulan - awalBulan + 1,
    ptkpTahunan: uang.keSen(ptkp.ptkp_tahunan), biayaJabatanPersen: p.biayaJabatanPersen,
    biayaJabatanMaksPerBulan: uang.keSen(p.biayaJabatanMaksPerBulan), pembulatanPkp: uang.keSen(p.pembulatanPkp),
    lapisan,
  };
  return hasil;
}

module.exports = {
  MULAI_KUNCI, ambilMulai, aktifUntuk, aturMulai, ringkasan, daftarStatusTersedia, impor, hapusSet,
  daftarStatus, tambahStatus, hapusStatus, daftarSaldoAwal, simpanSaldoAwal, susunMasukan,
};
