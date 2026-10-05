// Saldo cuti. Saldo tidak pernah diubah langsung: saldo = jumlah seluruh mutasi per karyawan/jenis/tahun.
// Mutasi: jatah (+), pakai (-), batal (+), hangus (-), bawaan (+). Tabel mutasi dijaga trigger (tak bisa diubah/dihapus).
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const audit = require('../../pengguna/services/audit');

const HARI_INI_SQL = "(now() AT TIME ZONE 'Asia/Jakarta')::date";

async function jenisAktif(exec = db) {
  const { rows } = await exec.query(
    'SELECT id, kode, nama, jatah_hari, potong_saldo FROM jenis_cuti WHERE deleted_at IS NULL ORDER BY nama');
  return rows;
}

// Total mutasi (saldo sebenarnya) untuk satu karyawan/jenis/tahun.
async function saldoTahun(exec, karyawanId, jenisCutiId, tahun) {
  const { rows } = await exec.query(
    `SELECT COALESCE(SUM(jumlah), 0)::int AS saldo FROM saldo_cuti_mutasi
      WHERE karyawan_id = $1 AND jenis_cuti_id = $2 AND tahun = $3`, [karyawanId, jenisCutiId, tahun]);
  return rows[0].saldo;
}

// Hari yang sudah diajukan dan masih menunggu keputusan (belum jadi mutasi).
async function hariMenunggu(exec, karyawanId, jenisCutiId, tahun) {
  const { rows } = await exec.query(
    `SELECT count(*)::int AS n FROM ketidakhadiran_hari h
       JOIN pengajuan p ON p.id = h.pengajuan_id AND p.status = 'menunggu'
       JOIN pengajuan_cuti pc ON pc.pengajuan_id = p.id
      WHERE h.karyawan_id = $1 AND pc.jenis_cuti_id = $2 AND h.deleted_at IS NULL AND EXTRACT(YEAR FROM h.tanggal) = $3`,
    [karyawanId, jenisCutiId, tahun]);
  return rows[0].n;
}

// Rincian saldo satu karyawan untuk satu tahun (untuk tampilan).
async function rincian(karyawanId, tahun) {
  const { rows } = await db.query(
    `SELECT j.id AS jenis_cuti_id, j.kode, j.nama, j.potong_saldo, j.jatah_hari,
            COALESCE(SUM(m.jumlah) FILTER (WHERE m.jenis_mutasi = 'jatah'), 0)::int AS jatah,
            COALESCE(-SUM(m.jumlah) FILTER (WHERE m.jenis_mutasi = 'pakai'), 0)::int AS pakai,
            COALESCE(SUM(m.jumlah) FILTER (WHERE m.jenis_mutasi = 'batal'), 0)::int AS batal,
            COALESCE(-SUM(m.jumlah) FILTER (WHERE m.jenis_mutasi = 'hangus'), 0)::int AS hangus,
            COALESCE(SUM(m.jumlah), 0)::int AS saldo
       FROM jenis_cuti j
       LEFT JOIN saldo_cuti_mutasi m ON m.jenis_cuti_id = j.id AND m.karyawan_id = $1 AND m.tahun = $2
      WHERE j.deleted_at IS NULL AND j.potong_saldo
      GROUP BY j.id ORDER BY j.nama`, [karyawanId, tahun]);
  const hasil = [];
  for (const r of rows) {
    const menunggu = await hariMenunggu(db, karyawanId, r.jenis_cuti_id, tahun);
    hasil.push({ ...r, menunggu, tersedia: r.saldo - menunggu });
  }
  return hasil;
}

async function mutasiKaryawan(karyawanId, tahun) {
  const { rows } = await db.query(
    `SELECT m.id, m.tanggal, m.jenis_mutasi, m.jumlah, m.keterangan, j.nama AS jenis_cuti
       FROM saldo_cuti_mutasi m JOIN jenis_cuti j ON j.id = m.jenis_cuti_id
      WHERE m.karyawan_id = $1 AND m.tahun = $2 ORDER BY m.id DESC`, [karyawanId, tahun]);
  return rows;
}

function pastikanPengelola(pengguna) {
  if (!['admin', 'hr'].includes(pengguna.peran)) throw new GalatBisnis('Anda tidak berhak melakukan tindakan ini.', 403);
}

function bacaTahun(nilai) {
  const t = String(nilai || '').trim();
  if (!/^\d{4}$/.test(t) || Number(t) < 2000 || Number(t) > 2100) throw new GalatBisnis('Tahun tidak valid.');
  return Number(t);
}

// HR memberi jatah (mutasi 'jatah') sebesar jatah_hari jenis cuti. Idempotent: yang sudah diberi dilewati.
// karyawanId kosong = semua karyawan aktif.
async function beriJatah(pengguna, { tahun, jenis_cuti_id: jenisId, karyawan_id: karyawanId }) {
  pastikanPengelola(pengguna);
  const th = bacaTahun(tahun);
  if (!/^\d{1,18}$/.test(String(jenisId || ''))) throw new GalatBisnis('Jenis cuti wajib dipilih.');
  const target = String(karyawanId || '').trim();
  if (target && !/^\d{1,18}$/.test(target)) throw new GalatBisnis('Karyawan tidak valid.');

  return db.transaksi(async (c) => {
    const { rows: j } = await c.query('SELECT id, nama, jatah_hari, potong_saldo FROM jenis_cuti WHERE id = $1 AND deleted_at IS NULL', [jenisId]);
    if (!j[0]) throw new GalatBisnis('Jenis cuti tidak ditemukan.', 404);
    if (!j[0].potong_saldo) throw new GalatBisnis('Jenis cuti ini tidak memakai saldo, sehingga tidak perlu diberi jatah.');
    if (j[0].jatah_hari <= 0) throw new GalatBisnis('Jatah jenis cuti ini 0 hari. Atur jumlah jatah di menu Jenis cuti terlebih dahulu.');
    if (target) {
      const { rowCount } = await c.query("SELECT 1 FROM karyawan WHERE id = $1 AND deleted_at IS NULL AND status = 'aktif'", [target]);
      if (!rowCount) throw new GalatBisnis('Karyawan tidak ditemukan atau sudah keluar.', 404);
    }
    const { rows: eligible } = await c.query(
      `SELECT count(*)::int AS n FROM karyawan WHERE deleted_at IS NULL AND status = 'aktif' AND ($1::bigint IS NULL OR id = $1)`, [target || null]);
    const { rowCount: dibuat } = await c.query(
      `INSERT INTO saldo_cuti_mutasi (karyawan_id, jenis_cuti_id, tahun, jenis_mutasi, jumlah, tanggal, keterangan, dibuat_oleh)
       SELECT k.id, $1::bigint, $2::int, 'jatah', $3::int, make_date($2::int, 1, 1), $4::text, $5::bigint
         FROM karyawan k WHERE k.deleted_at IS NULL AND k.status = 'aktif' AND ($6::bigint IS NULL OR k.id = $6)
       ON CONFLICT (karyawan_id, jenis_cuti_id, tahun) WHERE jenis_mutasi = 'jatah' DO NOTHING`,
      [jenisId, th, j[0].jatah_hari, `Jatah ${j[0].nama} ${th}`, pengguna.id, target || null]);
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'beri_jatah_cuti', entitas: 'saldo_cuti', entitasId: `${jenisId}/${th}`,
      sesudah: { jenis_cuti: j[0].nama, tahun: th, hari: j[0].jatah_hari, karyawan_id: target || 'semua aktif', dibuat, dilewati: eligible[0].n - dibuat },
    }, c);
    return { dibuat, dilewati: eligible[0].n - dibuat };
  });
}

// Sisa cuti tahun-tahun yang sudah lewat dihanguskan (aturan pemilik: hangus semua). Idempotent.
// tahunSekarang hanya untuk pengujian.
async function hanguskanSisa(tahunSekarang = null) {
  const { rowCount } = await db.query(
    `INSERT INTO saldo_cuti_mutasi (karyawan_id, jenis_cuti_id, tahun, jenis_mutasi, jumlah, tanggal, keterangan)
     SELECT m.karyawan_id, m.jenis_cuti_id, m.tahun, 'hangus', -SUM(m.jumlah), make_date(m.tahun, 12, 31), 'Sisa cuti hangus akhir tahun'
       FROM saldo_cuti_mutasi m JOIN jenis_cuti j ON j.id = m.jenis_cuti_id AND j.potong_saldo
      WHERE m.tahun < COALESCE($1::int, EXTRACT(YEAR FROM ${HARI_INI_SQL})::int)
      GROUP BY m.karyawan_id, m.jenis_cuti_id, m.tahun HAVING SUM(m.jumlah) > 0
     ON CONFLICT (karyawan_id, jenis_cuti_id, tahun) WHERE jenis_mutasi = 'hangus' DO NOTHING`, [tahunSekarang]);
  if (rowCount) {
    await audit.catat({ aksi: 'hangus_cuti', entitas: 'saldo_cuti', entitasId: 'otomatis', sesudah: { jumlah_saldo_dihanguskan: rowCount } });
  }
  return rowCount;
}

// Daftar saldo semua karyawan aktif untuk satu tahun (halaman HR).
async function daftarSemua(pengguna, tahunMentah) {
  pastikanPengelola(pengguna);
  const tahun = bacaTahun(tahunMentah);
  const { rows } = await db.query(
    `SELECT k.id AS karyawan_id, k.nomor_induk, k.nama, j.id AS jenis_cuti_id, j.nama AS jenis_cuti,
            COALESCE(SUM(m.jumlah) FILTER (WHERE m.jenis_mutasi = 'jatah'), 0)::int AS jatah,
            COALESCE(-SUM(m.jumlah) FILTER (WHERE m.jenis_mutasi = 'pakai'), 0)::int AS pakai,
            COALESCE(-SUM(m.jumlah) FILTER (WHERE m.jenis_mutasi = 'hangus'), 0)::int AS hangus,
            COALESCE(SUM(m.jumlah), 0)::int AS saldo
       FROM karyawan k CROSS JOIN jenis_cuti j
       LEFT JOIN saldo_cuti_mutasi m ON m.karyawan_id = k.id AND m.jenis_cuti_id = j.id AND m.tahun = $1
      WHERE k.deleted_at IS NULL AND k.status = 'aktif' AND j.deleted_at IS NULL AND j.potong_saldo
      GROUP BY k.id, j.id ORDER BY k.nomor_induk, j.nama`, [tahun]);
  return { tahun, baris: rows };
}

module.exports = { HARI_INI_SQL, jenisAktif, saldoTahun, hariMenunggu, rincian, mutasiKaryawan, beriJatah, hanguskanSisa, daftarSemua };
