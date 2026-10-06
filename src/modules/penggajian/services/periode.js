// Siklus periode gaji: buat -> hitung (boleh diulang selagi terbuka) -> kunci. Setelah dikunci, slip tidak bisa
// diubah (dijaga trigger database). Buka kunci memerlukan permintaan satu orang dan persetujuan admin lain, tercatat di audit.
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const audit = require('../../pengguna/services/audit');
const absensiPengaturan = require('../../absensi/services/pengaturan');
const absensiCatat = require('../../absensi/services/catat');
const akses = require('../../karyawan/services/akses');
const { hariDihitung } = require('../../cuti/services/hitung');
const { rentangBulan } = require('../../absensi/services/waktu');
const gaji = require('./pengaturan');
const uang = require('./uang');
const { hitungSlip, nominalPada, URUTAN_PROGRAM } = require('./hitung');
const { tipeHari: tipeHariLembur, aturanBerlaku, periksaAturan, upahLembur, TIPE_HARI } = require('./lembur');

const HARI_INI_SQL = "(now() AT TIME ZONE 'Asia/Jakarta')::date";
const POLA_UANG = /^\d{1,13}(\.\d{1,2})?$/;

function pastikanPengelola(pengguna) {
  if (!['admin', 'hr'].includes(pengguna.peran)) throw new GalatBisnis('Anda tidak berhak melakukan tindakan ini.', 403);
}

async function hariIni(exec) {
  const { rows } = await exec.query(`SELECT ${HARI_INI_SQL} AS t`);
  return rows[0].t;
}

async function ambilPeriode(exec, id, kunciBaris = false) {
  const { rows } = await exec.query(`SELECT * FROM periode_gaji WHERE id = $1 AND deleted_at IS NULL${kunciBaris ? ' FOR UPDATE' : ''}`, [id]);
  if (!rows[0]) throw new GalatBisnis('Periode gaji tidak ditemukan.', 404);
  return rows[0];
}

async function daftarPeriode() {
  const { rows } = await db.query(
    `SELECT p.id, p.tahun, p.bulan, p.tanggal_awal, p.tanggal_akhir, p.status, p.minta_buka_pada,
            (SELECT count(*)::int FROM slip_gaji s WHERE s.periode_id = p.id AND s.deleted_at IS NULL) AS jumlah_slip
       FROM periode_gaji p WHERE p.deleted_at IS NULL ORDER BY p.tahun DESC, p.bulan DESC`);
  return rows;
}

async function buatPeriode(pengguna, input) {
  pastikanPengelola(pengguna);
  const tahun = String(input.tahun || '').trim();
  const bulan = String(input.bulan || '').trim().padStart(2, '0');
  const rentang = /^\d{4}$/.test(tahun) ? rentangBulan(`${tahun}-${bulan}`) : null;
  if (!rentang || Number(tahun) < 2000 || Number(tahun) > 2100) throw new GalatBisnis('Tahun dan bulan periode tidak valid.');
  try {
    return await db.transaksi(async (c) => {
      const { rows } = await c.query(
        'INSERT INTO periode_gaji (tahun, bulan, tanggal_awal, tanggal_akhir) VALUES ($1, $2, $3, $4) RETURNING id',
        [Number(tahun), Number(bulan), rentang.awal, rentang.akhir]);
      await audit.catat({ penggunaId: pengguna.id, aksi: 'buat_periode_gaji', entitas: 'penggajian.periode', entitasId: rows[0].id, sesudah: { tahun: Number(tahun), bulan: Number(bulan) } }, c);
      return rows[0].id;
    });
  } catch (err) {
    if (err.code === '23505') throw new GalatBisnis('Periode gaji tersebut sudah ada.', 409);
    throw err;
  }
}

// --- Pengumpulan masukan & perhitungan ----------------------------------------------------------

function pilihBerlaku(daftar, tanggal) {
  let p = null;
  for (const r of daftar) if (r.tanggal_berlaku <= tanggal && (!p || r.tanggal_berlaku > p.tanggal_berlaku)) p = r;
  return p;
}

// Menghitung slip semua karyawan yang bekerja pada periode. Tidak menulis apa pun.
// Mengembalikan { slip: [{ karyawan, hasil }], galat: [pesan], dilewati: jumlah }.
async function hitungSemua(exec, periode) {
  const { tanggal_awal: awal, tanggal_akhir: akhir } = periode;
  const [jadwal, libur] = await Promise.all([absensiPengaturan.jadwalUntukHitung(), absensiPengaturan.liburDalamRentang(awal, akhir)]);
  const hariKerjaPeriode = hariDihitung({ mulai: awal, akhir, jadwal, libur });
  const galat = [];
  if (!hariKerjaPeriode.length) return { slip: [], dilewati: 0, galat: ['Periode tidak memiliki hari kerja menurut jadwal kerja.'] };

  const { rows: daftar } = await exec.query(
    `SELECT k.id, k.nomor_induk, k.nama, k.tanggal_masuk, k.tanggal_keluar,
            COALESCE(c.zona_waktu, 'Asia/Jakarta') AS zona, j.nama AS jabatan, d.nama AS departemen
       FROM karyawan k
       LEFT JOIN LATERAL (
         SELECT * FROM riwayat_penempatan x WHERE x.karyawan_id = k.id AND x.deleted_at IS NULL AND x.tanggal_berlaku <= $2
          ORDER BY x.tanggal_berlaku DESC, x.id DESC LIMIT 1) p ON TRUE
       LEFT JOIN cabang c ON c.id = p.cabang_id
       LEFT JOIN jabatan j ON j.id = p.jabatan_id
       LEFT JOIN departemen d ON d.id = p.departemen_id
      WHERE k.deleted_at IS NULL AND k.tanggal_masuk <= $2 AND (k.tanggal_keluar IS NULL OR k.tanggal_keluar >= $1)
      ORDER BY k.nomor_induk`, [awal, akhir]);
  if (!daftar.length) return { slip: [], dilewati: 0, galat: [] };
  const ids = daftar.map((d) => d.id);

  const [rGaji, rKomponen, rMaster, rPeserta, rTarif, rParam, rAdj, rLembur, rAturan] = await Promise.all([
    exec.query('SELECT karyawan_id, tanggal_berlaku, gaji_pokok AS nominal FROM riwayat_gaji WHERE deleted_at IS NULL AND karyawan_id = ANY($1::bigint[]) AND tanggal_berlaku <= $2', [ids, akhir]),
    exec.query('SELECT karyawan_id, komponen_id, tanggal_berlaku, nominal FROM riwayat_komponen_karyawan WHERE deleted_at IS NULL AND karyawan_id = ANY($1::bigint[]) AND tanggal_berlaku <= $2', [ids, akhir]),
    exec.query('SELECT id, kode, nama, jenis, masuk_dasar_bpjs, masuk_dasar_lembur FROM komponen_gaji WHERE deleted_at IS NULL ORDER BY jenis, nama'),
    exec.query('SELECT karyawan_id, program FROM kepesertaan_bpjs WHERE aktif AND deleted_at IS NULL AND karyawan_id = ANY($1::bigint[])', [ids]),
    exec.query('SELECT program, tarif_karyawan, tarif_perusahaan, batas_upah_atas, tanggal_berlaku FROM tarif_bpjs WHERE deleted_at IS NULL AND tanggal_berlaku <= $1', [akhir]),
    exec.query('SELECT nilai, tanggal_berlaku FROM parameter_gaji WHERE deleted_at IS NULL AND kunci = $1 AND tanggal_berlaku <= $2', [gaji.KUNCI_TERLAMBAT, akhir]),
    exec.query("SELECT karyawan_id, jenis, keterangan, nominal FROM penyesuaian_gaji WHERE periode_id = $1 AND deleted_at IS NULL ORDER BY id", [periode.id]),
    // Lembur yang sudah disetujui pada periode ini, dan aturan lembur yang berlaku sampai akhir periode.
    exec.query(
      `SELECT p.karyawan_id, pl.tanggal, pl.menit FROM pengajuan_lembur pl JOIN pengajuan p ON p.id = pl.pengajuan_id
        WHERE p.status = 'disetujui' AND p.deleted_at IS NULL AND pl.tanggal BETWEEN $1 AND $2 AND p.karyawan_id = ANY($3::bigint[])
        ORDER BY pl.tanggal, pl.id`, [awal, akhir, ids]),
    exec.query('SELECT tipe_hari, menit_dari, menit_sampai, pengali, tanggal_berlaku FROM aturan_lembur WHERE deleted_at IS NULL AND tanggal_berlaku <= $1', [akhir]),
  ]);

  const param = pilihBerlaku(rParam.rows, akhir);
  if (!param) {
    return { slip: [], dilewati: 0, galat: [`Parameter potongan keterlambatan per menit belum diisi (berlaku sampai ${akhir}). Isi di Pengaturan penggajian (boleh 0).`] };
  }
  const pembagiLembur = rLembur.rows.length ? await gaji.parameterBerlaku(exec, 'pembagi_upah_jam_lembur', akhir) : null;
  if (rLembur.rows.length && !pembagiLembur) {
    return { slip: [], dilewati: 0, galat: [`Ada lembur yang disetujui, tetapi pembagi upah per jam lembur belum diisi (berlaku sampai ${akhir}).`] };
  }
  const tarifPerProgram = {};
  for (const p of URUTAN_PROGRAM) tarifPerProgram[p] = pilihBerlaku(rTarif.rows.filter((t) => t.program === p), akhir);

  const rekap = await absensiCatat.rekapUntuk(
    daftar.map((d) => ({ id: d.id, tanggal_masuk: d.tanggal_masuk, tanggal_keluar: d.tanggal_keluar, zona: d.zona })), awal, akhir);

  const per = (baris, id) => baris.filter((r) => String(r.karyawan_id) === String(id));
  const slip = [];
  let dilewati = 0;
  for (const k of daftar) {
    try {
      const program = per(rPeserta.rows, k.id).map((r) => r.program);
      for (const p of program) {
        if (!tarifPerProgram[p]) throw new Error(`Tarif ${p.toUpperCase()} belum diisi (berlaku sampai ${akhir}).`);
      }
      const komponen = rMaster.rows.map((m) => ({
        kode: m.kode, nama: m.nama, jenis: m.jenis, masuk_dasar_bpjs: m.masuk_dasar_bpjs,
        riwayat: per(rKomponen.rows, k.id).filter((r) => String(r.komponen_id) === String(m.id)),
      }));
      // Upah lembur: tiap pengajuan disetujui dihitung dari upah sebulan pada tanggal lembur (gaji pokok + tunjangan
      // bertanda "dasar lembur"), pembagi, dan aturan pengali yang berlaku sampai akhir periode.
      const lemburKaryawan = per(rLembur.rows, k.id);
      let lembur = null;
      if (lemburKaryawan.length) {
        let total = 0n;
        for (const l of lemburKaryawan) {
          const tipe = tipeHariLembur({ tanggal: l.tanggal, jadwal, libur });
          const tahap = aturanBerlaku(rAturan.rows, tipe, akhir).map((a) => ({ ...a, pengali: a.pengali }));
          const masalah = periksaAturan(tahap);
          if (masalah) throw new Error(`Aturan lembur "${TIPE_HARI[tipe]}" ${masalah} (berlaku sampai ${akhir}).`);
          let dasar = nominalPada(per(rGaji.rows, k.id), l.tanggal);
          for (const m of rMaster.rows) {
            if (m.jenis === 'tunjangan' && m.masuk_dasar_lembur) {
              dasar += nominalPada(per(rKomponen.rows, k.id).filter((r) => String(r.komponen_id) === String(m.id)), l.tanggal);
            }
          }
          total += upahLembur({ menit: l.menit, tahap, dasarSen: dasar, pembagi: Number(pembagiLembur.nilai) });
        }
        lembur = { nominal: uang.dariSen(total), menit: lemburKaryawan.reduce((a, l) => a + l.menit, 0), kali: lemburKaryawan.length };
      }
      const hasil = hitungSlip({
        hariKerjaPeriode, karyawan: { tanggal_masuk: k.tanggal_masuk, tanggal_keluar: k.tanggal_keluar },
        gajiPokok: per(rGaji.rows, k.id), komponen, lembur,
        menitTerlambat: rekap.get(String(k.id)).ringkasan.menitTerlambat, tarifPerMenit: param.nilai,
        bpjs: program.map((p) => ({ program: p, ...tarifPerProgram[p] })),
        penyesuaian: per(rAdj.rows, k.id),
      });
      if (hasil.hariKerjaBekerja === 0) { dilewati += 1; continue; }
      slip.push({ karyawan: k, hasil, menitTerlambat: rekap.get(String(k.id)).ringkasan.menitTerlambat });
    } catch (err) {
      galat.push(`${k.nomor_induk} ${k.nama}: ${err.message}`);
    }
  }
  return { slip, dilewati, galat };
}

function jumlahSen(slip, kolom) {
  return uang.dariSen(uang.jumlah(slip.map((s) => uang.keSen(s.hasil[kolom]))));
}

async function pastikanSudahBerakhir(c, periode) {
  const sekarang = await hariIni(c);
  if (sekarang <= periode.tanggal_akhir) {
    throw new GalatBisnis(`Periode belum berakhir (berakhir ${periode.tanggal_akhir}). Penggajian diproses setelah bulan berakhir.`, 409);
  }
}

async function hitung(pengguna, id) {
  pastikanPengelola(pengguna);
  return db.transaksi(async (c) => {
    const periode = await ambilPeriode(c, id, true);
    if (periode.status !== 'terbuka') throw new GalatBisnis('Periode sudah dikunci; hasil tidak bisa dihitung ulang.', 409);
    await pastikanSudahBerakhir(c, periode);
    const { slip, galat, dilewati } = await hitungSemua(c, periode);
    if (galat.length) throw new GalatBisnis(`Perhitungan dibatalkan. ${galat.join(' | ')}`, 422);
    if (!slip.length) throw new GalatBisnis('Tidak ada karyawan yang digaji pada periode ini.', 422);

    // Hasil lama (selagi terbuka) diganti: ditandai terhapus, riwayatnya tetap ada. Satu slip aktif per periode+karyawan.
    await c.query('UPDATE slip_gaji SET deleted_at = now(), updated_at = now() WHERE periode_id = $1 AND deleted_at IS NULL', [id]);
    for (const s of slip) {
      const k = s.karyawan; const h = s.hasil;
      const { rows } = await c.query(
        `INSERT INTO slip_gaji (periode_id, karyawan_id, nomor_induk, nama, jabatan, departemen, hari_kerja_periode, hari_kerja_bekerja,
                                menit_terlambat, gaji_bruto, total_potongan, gaji_bersih, dihitung_oleh)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [id, k.id, k.nomor_induk, k.nama, k.jabatan, k.departemen, h.hariKerjaPeriode, h.hariKerjaBekerja, s.menitTerlambat, h.bruto, h.potongan, h.bersih, pengguna.id]);
      for (const r of h.rincian) {
        await c.query(
          'INSERT INTO slip_gaji_rincian (slip_id, urutan, tipe, kode, nama, nominal, keterangan) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [rows[0].id, r.urutan, r.tipe, r.kode, r.nama, r.nominal, r.keterangan]);
      }
    }
    const ringkas = { jumlah_slip: slip.length, dilewati, total_bruto: jumlahSen(slip, 'bruto'), total_potongan: jumlahSen(slip, 'potongan'), total_bersih: jumlahSen(slip, 'bersih') };
    await audit.catat({ penggunaId: pengguna.id, aksi: 'hitung_gaji', entitas: 'penggajian.periode', entitasId: id, sesudah: ringkas }, c);
    return ringkas;
  });
}

// Kunci hanya sah bila hasil tersimpan masih sama persis dengan hasil hitung ulang dari data terkini.
async function kunciPeriode(pengguna, id) {
  pastikanPengelola(pengguna);
  return db.transaksi(async (c) => {
    const periode = await ambilPeriode(c, id, true);
    if (periode.status !== 'terbuka') throw new GalatBisnis('Periode sudah dikunci.', 409);
    await pastikanSudahBerakhir(c, periode);
    const { rows: tersimpan } = await c.query(
      `SELECT s.id, s.karyawan_id,
              (SELECT string_agg(r.tipe || '|' || r.kode || '|' || r.nominal, ';' ORDER BY r.urutan) FROM slip_gaji_rincian r WHERE r.slip_id = s.id) AS rincian
         FROM slip_gaji s WHERE s.periode_id = $1 AND s.deleted_at IS NULL`, [id]);
    if (!tersimpan.length) throw new GalatBisnis('Belum ada hasil perhitungan. Hitung gaji terlebih dahulu.', 409);

    const { slip, galat } = await hitungSemua(c, periode);
    if (galat.length) throw new GalatBisnis(`Tidak dapat mengunci. ${galat.join(' | ')}`, 422);
    const baru = new Map(slip.map((s) => [String(s.karyawan.id), s.hasil.rincian.map((r) => `${r.tipe}|${r.kode}|${r.nominal}`).join(';')]));
    const lama = new Map(tersimpan.map((t) => [String(t.karyawan_id), t.rincian]));
    const beda = new Set();
    for (const [kid, r] of baru) if (lama.get(kid) !== r) beda.add(kid);
    for (const kid of lama.keys()) if (!baru.has(kid)) beda.add(kid);
    if (beda.size) {
      throw new GalatBisnis(`Data berubah sejak gaji dihitung (${beda.size} slip berbeda). Hitung ulang sebelum mengunci.`, 409);
    }
    await c.query(
      `UPDATE periode_gaji SET status = 'terkunci', dikunci_oleh = $1, dikunci_pada = now(), minta_buka_oleh = NULL,
              minta_buka_pada = NULL, minta_buka_alasan = NULL, updated_at = now() WHERE id = $2`, [pengguna.id, id]);
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'kunci_periode_gaji', entitas: 'penggajian.periode', entitasId: id,
      sesudah: { jumlah_slip: tersimpan.length, total_bersih: jumlahSen(slip, 'bersih') },
    }, c);
  });
}

async function mintaBukaKunci(pengguna, id, alasanMentah) {
  pastikanPengelola(pengguna);
  const alasan = String(alasanMentah || '').trim();
  if (!alasan) throw new GalatBisnis('Alasan membuka kunci wajib diisi.');
  if (alasan.length > 500) throw new GalatBisnis('Alasan maksimal 500 karakter.');
  await db.transaksi(async (c) => {
    const periode = await ambilPeriode(c, id, true);
    if (periode.status !== 'terkunci') throw new GalatBisnis('Periode tidak dalam keadaan terkunci.', 409);
    if (periode.minta_buka_oleh) throw new GalatBisnis('Sudah ada permintaan buka kunci yang menunggu persetujuan.', 409);
    await c.query('UPDATE periode_gaji SET minta_buka_oleh = $1, minta_buka_pada = now(), minta_buka_alasan = $2, updated_at = now() WHERE id = $3', [pengguna.id, alasan, id]);
    await audit.catat({ penggunaId: pengguna.id, aksi: 'minta_buka_kunci_gaji', entitas: 'penggajian.periode', entitasId: id, sesudah: { alasan } }, c);
  });
}

// Hanya admin, dan bukan orang yang memintanya.
async function putuskanBukaKunci(pengguna, id, { keputusan, catatan }) {
  if (pengguna.peran !== 'admin') throw new GalatBisnis('Hanya administrator yang dapat memutuskan permintaan buka kunci.', 403);
  if (!['setuju', 'tolak'].includes(keputusan)) throw new GalatBisnis('Keputusan tidak valid.');
  const cat = String(catatan || '').trim();
  if (cat.length > 500) throw new GalatBisnis('Catatan maksimal 500 karakter.');
  if (keputusan === 'tolak' && !cat) throw new GalatBisnis('Catatan wajib diisi saat menolak.');
  await db.transaksi(async (c) => {
    const periode = await ambilPeriode(c, id, true);
    if (periode.status !== 'terkunci' || !periode.minta_buka_oleh) throw new GalatBisnis('Tidak ada permintaan buka kunci yang menunggu.', 409);
    if (String(periode.minta_buka_oleh) === String(pengguna.id)) {
      throw new GalatBisnis('Anda tidak dapat menyetujui permintaan buka kunci yang Anda ajukan sendiri.', 403);
    }
    const info = { pemohon: periode.minta_buka_oleh, alasan: periode.minta_buka_alasan, keputusan, catatan: cat || null };
    if (keputusan === 'setuju') {
      await c.query(
        `UPDATE periode_gaji SET status = 'terbuka', dikunci_oleh = NULL, dikunci_pada = NULL, minta_buka_oleh = NULL,
                minta_buka_pada = NULL, minta_buka_alasan = NULL, updated_at = now() WHERE id = $1`, [id]);
    } else {
      await c.query('UPDATE periode_gaji SET minta_buka_oleh = NULL, minta_buka_pada = NULL, minta_buka_alasan = NULL, updated_at = now() WHERE id = $1', [id]);
    }
    await audit.catat({
      penggunaId: pengguna.id, aksi: keputusan === 'setuju' ? 'buka_kunci_gaji' : 'tolak_buka_kunci_gaji',
      entitas: 'penggajian.periode', entitasId: id, sebelum: { status: 'terkunci' }, sesudah: info,
    }, c);
  });
}

// --- Penyesuaian periode -----------------------------------------------------------------------

async function daftarPenyesuaian(periodeId) {
  const { rows } = await db.query(
    `SELECT a.id, a.karyawan_id, a.jenis, a.keterangan, a.nominal, k.nomor_induk, k.nama
       FROM penyesuaian_gaji a JOIN karyawan k ON k.id = a.karyawan_id
      WHERE a.periode_id = $1 AND a.deleted_at IS NULL ORDER BY k.nomor_induk, a.id`, [periodeId]);
  return rows;
}

async function tambahPenyesuaian(pengguna, periodeId, input) {
  pastikanPengelola(pengguna);
  if (!/^\d{1,18}$/.test(String(input.karyawan_id || ''))) throw new GalatBisnis('Karyawan wajib dipilih.');
  if (!['pendapatan', 'potongan'].includes(input.jenis)) throw new GalatBisnis('Jenis penyesuaian tidak valid.');
  const keterangan = String(input.keterangan || '').trim();
  if (!keterangan) throw new GalatBisnis('Keterangan wajib diisi.');
  if (keterangan.length > 200) throw new GalatBisnis('Keterangan maksimal 200 karakter.');
  const nominal = String(input.nominal === undefined ? '' : input.nominal).trim();
  if (!POLA_UANG.test(nominal) || Number(nominal) <= 0) throw new GalatBisnis('Nominal harus berupa angka positif (maks. 2 desimal, tanpa pemisah ribuan).');
  await db.transaksi(async (c) => {
    const periode = await ambilPeriode(c, periodeId, true);
    if (periode.status !== 'terbuka') throw new GalatBisnis('Periode sudah dikunci. Buat penyesuaian pada periode berikutnya.', 409);
    const { rows: k } = await c.query(
      'SELECT 1 FROM karyawan WHERE id = $1 AND deleted_at IS NULL AND tanggal_masuk <= $3 AND (tanggal_keluar IS NULL OR tanggal_keluar >= $2)',
      [input.karyawan_id, periode.tanggal_awal, periode.tanggal_akhir]);
    if (!k[0]) throw new GalatBisnis('Karyawan tidak bekerja pada periode ini.', 422);
    const { rows } = await c.query(
      'INSERT INTO penyesuaian_gaji (periode_id, karyawan_id, jenis, keterangan, nominal, dibuat_oleh) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [periodeId, input.karyawan_id, input.jenis, keterangan, nominal, pengguna.id]);
    await audit.catat({
      penggunaId: pengguna.id, aksi: 'tambah_penyesuaian_gaji', entitas: 'penggajian.periode', entitasId: periodeId,
      sesudah: { id: rows[0].id, karyawan_id: input.karyawan_id, jenis: input.jenis, keterangan, nominal },
    }, c);
  });
}

async function hapusPenyesuaian(pengguna, periodeId, id) {
  pastikanPengelola(pengguna);
  await db.transaksi(async (c) => {
    const periode = await ambilPeriode(c, periodeId, true);
    if (periode.status !== 'terbuka') throw new GalatBisnis('Periode sudah dikunci; penyesuaian tidak dapat dihapus.', 409);
    const { rows } = await c.query('SELECT * FROM penyesuaian_gaji WHERE id = $1 AND periode_id = $2 AND deleted_at IS NULL FOR UPDATE', [id, periodeId]);
    if (!rows[0]) throw new GalatBisnis('Penyesuaian tidak ditemukan.', 404);
    await c.query('UPDATE penyesuaian_gaji SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
    await audit.catat({ penggunaId: pengguna.id, aksi: 'hapus_penyesuaian_gaji', entitas: 'penggajian.periode', entitasId: periodeId, sebelum: rows[0] }, c);
  });
}

// Karyawan yang bekerja pada periode (untuk dropdown penyesuaian).
async function karyawanPeriode(periode) {
  const { rows } = await db.query(
    `SELECT id, nomor_induk, nama FROM karyawan WHERE deleted_at IS NULL AND tanggal_masuk <= $2
        AND (tanggal_keluar IS NULL OR tanggal_keluar >= $1) ORDER BY nomor_induk`, [periode.tanggal_awal, periode.tanggal_akhir]);
  return rows;
}

async function detail(pengguna, id) {
  if (!akses.semuaData(pengguna)) throw new GalatBisnis('Anda tidak berhak mengakses halaman ini.', 403);
  const periode = await ambilPeriode(db, id);
  const { rows: slip } = await db.query(
    `SELECT id, karyawan_id, nomor_induk, nama, jabatan, hari_kerja_bekerja, hari_kerja_periode, menit_terlambat, gaji_bruto, total_potongan, gaji_bersih
       FROM slip_gaji WHERE periode_id = $1 AND deleted_at IS NULL ORDER BY nomor_induk`, [id]);
  const total = (kolom) => uang.dariSen(uang.jumlah(slip.map((s) => uang.keSen(s[kolom]))));
  return {
    periode, slip, penyesuaian: await daftarPenyesuaian(id), karyawan: await karyawanPeriode(periode),
    total: { bruto: total('gaji_bruto'), potongan: total('total_potongan'), bersih: total('gaji_bersih') },
    sudahBerakhir: (await hariIni(db)) > periode.tanggal_akhir, hariIni: await hariIni(db),
    adaPermintaan: !!periode.minta_buka_oleh,
  };
}

module.exports = {
  daftarPeriode, buatPeriode, hitung, kunciPeriode, mintaBukaKunci, putuskanBukaKunci,
  tambahPenyesuaian, hapusPenyesuaian, detail, hitungSemua, ambilPeriode,
};
