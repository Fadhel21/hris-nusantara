// Data beranda per peran. Setiap kartu diambil terpisah dan gagal dengan aman: satu sumber data yang bermasalah
// tidak boleh membuat seluruh beranda gagal. Hanya data yang berhak dilihat peran itu yang diambil.
const db = require('../../../config/db');
const menu = require('../../../config/menu');
const { IKON_GRUP } = require('../../../config/ikon');
const catat = require('../../absensi/services/catat');
const saldo = require('../../cuti/services/saldo');
const pengajuan = require('../../persetujuan/services/pengajuan');
const slip = require('../../penggajian/services/slip');
const akses = require('../../karyawan/services/akses');
const waktu = require('../../absensi/services/waktu');

const LABEL_PERAN = { admin: 'Administrator', hr: 'HR', atasan: 'Atasan', karyawan: 'Karyawan' };

function sapaanWaktu() {
  const jam = Math.floor(waktu.lokal(new Date(), 'Asia/Jakarta').menit / 60);
  if (jam < 11) return 'Selamat pagi';
  if (jam < 15) return 'Selamat siang';
  if (jam < 19) return 'Selamat sore';
  return 'Selamat malam';
}

async function aman(fungsi) {
  try { return await fungsi(); } catch (err) { return null; }
}

async function namaKaryawan(pengguna) {
  if (!pengguna.karyawanId) return null;
  const { rows } = await db.query('SELECT nama FROM karyawan WHERE id = $1 AND deleted_at IS NULL', [pengguna.karyawanId]);
  return rows[0] ? rows[0].nama : null;
}

// Urutan pintasan yang dicoba; yang tidak boleh diakses peran itu dilewati (menu sudah disaring per peran).
const URUTAN_PINTASAN = [
  '/absensi', '/pengajuan', '/persetujuan', '/slip-saya', '/karyawan', '/absensi/tim',
  '/penggajian', '/cuti/jatah', '/organisasi/struktur', '/absensi/libur',
];
// Semua menu yang boleh diakses peran ini, dikelompokkan seperti sidebar (untuk kisi ikon di beranda).
function menuLengkap(menuPengguna) {
  const peta = new Map();
  for (const m of menuPengguna) {
    if (!m.grup) continue;
    if (!peta.has(m.grup)) peta.set(m.grup, { nama: m.grup, slug: m.grup.toLowerCase(), ikon: IKON_GRUP[m.grup] || 'dokumen', item: [] });
    peta.get(m.grup).item.push({ label: m.label, href: m.href, ikon: m.ikon || 'dokumen' });
  }
  return [...peta.values()];
}

function pintasan(menuPengguna) {
  const hasil = [];
  for (const href of URUTAN_PINTASAN) {
    const m = menuPengguna.find((x) => x.href === href);
    if (m) hasil.push({ label: m.label, href: m.href, ikon: m.ikon || 'dokumen' });
    if (hasil.length >= 8) break;
  }
  return hasil;
}

async function profilSaya(karyawanId) {
  const { rows } = await db.query(
    `SELECT k.nama, k.nomor_induk, j.nama AS jabatan, d.nama AS departemen, c.nama AS cabang
       FROM karyawan k
       LEFT JOIN ${akses.PENEMPATAN_SAAT_INI} s ON s.karyawan_id = k.id
       LEFT JOIN jabatan j ON j.id = s.jabatan_id
       LEFT JOIN departemen d ON d.id = s.departemen_id
       LEFT JOIN cabang c ON c.id = s.cabang_id
      WHERE k.id = $1 AND k.deleted_at IS NULL`, [karyawanId]);
  return rows[0] || null;
}

async function jadwalBerlaku(tanggal) {
  const { rows } = await db.query(
    `SELECT to_char(jam_masuk, 'HH24:MI') AS masuk, to_char(jam_pulang, 'HH24:MI') AS pulang
       FROM jadwal_kerja WHERE deleted_at IS NULL AND tanggal_berlaku <= $1 ORDER BY tanggal_berlaku DESC, id DESC LIMIT 1`, [tanggal]);
  return rows[0] || null;
}

// Kehadiran seluruh karyawan aktif hari ini (admin/HR). Tanggal dibandingkan dengan kolom tanggal lokal catatan absensi.
async function kehadiranHariIni(tanggal) {
  const { rows } = await db.query(
    `SELECT
       (SELECT count(*)::int FROM karyawan WHERE deleted_at IS NULL AND status = 'aktif') AS total,
       (SELECT count(DISTINCT karyawan_id)::int FROM absensi_catat WHERE deleted_at IS NULL AND jenis = 'masuk' AND tanggal = $1) AS hadir,
       (SELECT count(DISTINCT p.karyawan_id)::int FROM pengajuan p
          JOIN pengajuan_cuti pc ON pc.pengajuan_id = p.id
         WHERE p.deleted_at IS NULL AND p.status = 'disetujui' AND $1::date BETWEEN pc.tanggal_mulai AND pc.tanggal_akhir) AS cuti`, [tanggal]);
  const r = rows[0];
  return { total: r.total, hadir: r.hadir, cuti: r.cuti, belum: Math.max(0, r.total - r.hadir - r.cuti), persen: r.total ? Math.round((r.hadir * 100) / r.total) : 0 };
}

const LABEL_JENIS = { cuti: 'Cuti', izin: 'Izin', lembur: 'Lembur', koreksi: 'Koreksi absensi' };
function tugasDari(inbox) {
  return inbox.slice(0, 5).map((p) => ({
    id: p.id, nama: p.nama_karyawan, inisial: String(p.nama_karyawan || '?').charAt(0).toUpperCase(),
    jenis: p.jenis === 'cuti' && p.jenis_cuti ? `Cuti ${p.jenis_cuti}` : (LABEL_JENIS[p.jenis] || p.jenis), tanggal: p.tanggal_mulai,
  }));
}

async function untuk(pengguna, { modeKaryawan = false } = {}) {
  const menuPengguna = menu.untukPengguna(pengguna, modeKaryawan);
  const kartu = [];
  let inboxTerakhir = null;
  const punyaKaryawan = !!pengguna.karyawanId;
  const tahun = Number(waktu.lokal(new Date(), 'Asia/Jakarta').tanggal.slice(0, 4));

  let absen = null;
  if (punyaKaryawan) {
    absen = await aman(() => catat.statusHariIni(pengguna));
    if (absen) {
      let nilai = 'Belum absen'; let ket = 'Absen masuk dengan foto'; let nada = 'peringatan';
      if (absen.masuk && !absen.pulang) { nilai = `Masuk ${absen.masuk.jam}`; ket = 'Jangan lupa absen pulang'; nada = 'sukses'; }
      if (absen.masuk && absen.pulang) { nilai = `${absen.masuk.jam} – ${absen.pulang.jam}`; ket = 'Absen hari ini lengkap'; nada = 'sukses'; }
      if (!absen.adaPenempatan) { nilai = 'Belum bisa absen'; ket = 'Penempatan cabang belum diatur'; nada = 'bahaya'; }
      kartu.push({ label: 'Absen hari ini', nilai, ket, href: '/absensi', ikon: 'absensi', nada, kunci: 'absen' });
    }
    const rincian = await aman(() => saldo.rincian(pengguna.karyawanId, tahun));
    if (rincian) {
      const total = rincian.reduce((a, r) => a + r.tersedia, 0);
      kartu.push({
        label: `Saldo cuti ${tahun}`, nilai: rincian.length ? `${total} hari` : '—',
        ket: rincian.length ? 'Tersedia, setelah pengajuan yang menunggu' : 'Belum ada jenis cuti bersaldo', href: '/pengajuan', ikon: 'kalender', nada: '',
      });
    }
    const saya = await aman(() => pengajuan.daftarSaya(pengguna));
    if (saya) {
      const menunggu = saya.filter((p) => p.status === 'menunggu').length;
      kartu.push({ label: 'Pengajuan saya', nilai: String(menunggu), ket: menunggu ? 'Menunggu persetujuan' : 'Tidak ada yang menunggu', href: '/pengajuan', ikon: 'pengajuan', nada: menunggu ? 'peringatan' : '' });
    }
    const slipSaya = await aman(() => slip.slipSaya(pengguna));
    if (slipSaya && slipSaya[0]) {
      kartu.push({
        label: 'Slip gaji terakhir', nilai: `${slip.NAMA_BULAN[slipSaya[0].bulan]} ${slipSaya[0].tahun}`,
        ket: 'Lihat rincian dan unduh PDF', href: '/slip-saya', ikon: 'penggajian', nada: '',
      });
    }
  }

  // Pengajuan yang menunggu keputusan pengguna ini (atasan, HR, admin, atau siapa pun yang ditetapkan sebagai pemutus).
  const inbox = await aman(() => pengajuan.inbox(pengguna));
  inboxTerakhir = inbox;
  if (!modeKaryawan && inbox && (inbox.length || ['admin', 'hr', 'atasan'].includes(pengguna.peran))) {
    kartu.push({
      label: 'Menunggu keputusan Anda', nilai: String(inbox.length), ket: inbox.length ? 'Buka untuk menyetujui atau menolak' : 'Semua sudah diputuskan',
      href: '/persetujuan', ikon: 'perisai', nada: inbox.length ? 'bahaya' : 'sukses', kunci: 'inbox',
    });
  }

  if (!modeKaryawan && ['admin', 'hr'].includes(pengguna.peran)) {
    const aktif = await aman(async () => (await db.query("SELECT count(*)::int AS n FROM karyawan WHERE deleted_at IS NULL AND status = 'aktif'")).rows[0].n);
    if (aktif !== null) kartu.push({ label: 'Karyawan aktif', nilai: String(aktif), ket: 'Terdaftar di sistem', href: '/karyawan', ikon: 'karyawan', nada: '' });
    const periode = await aman(async () => (await db.query(
      'SELECT tahun, bulan, status FROM periode_gaji WHERE deleted_at IS NULL ORDER BY tahun DESC, bulan DESC LIMIT 1')).rows[0]);
    if (periode) {
      kartu.push({
        label: 'Periode gaji terbaru', nilai: `${slip.NAMA_BULAN[periode.bulan]} ${periode.tahun}`,
        ket: periode.status === 'terkunci' ? 'Sudah dikunci' : 'Masih terbuka', href: '/penggajian', ikon: 'penggajian', nada: periode.status === 'terkunci' ? 'sukses' : 'peringatan',
      });
    }
    const semuaMenunggu = await aman(async () => (await db.query("SELECT count(*)::int AS n FROM pengajuan WHERE status = 'menunggu' AND deleted_at IS NULL")).rows[0].n);
    if (semuaMenunggu !== null) {
      kartu.push({ label: 'Pengajuan menunggu (semua)', nilai: String(semuaMenunggu), ket: 'Dari seluruh karyawan', href: '/persetujuan?tab=tim&status=menunggu', ikon: 'pengajuan', nada: '' });
    }
  }

  const hariIni = waktu.lokal(new Date(), 'Asia/Jakarta').tanggal;
  const profil = punyaKaryawan ? await aman(() => profilSaya(pengguna.karyawanId)) : null;
  const jadwal = punyaKaryawan ? await aman(() => jadwalBerlaku(hariIni)) : null;
  const inboxAktif = !modeKaryawan && inboxTerakhir ? inboxTerakhir : null;
  const tugas = inboxAktif ? tugasDari(inboxAktif) : [];
  const jumlahTugas = inboxAktif ? inboxAktif.length : 0;
  const kehadiran = !modeKaryawan && ['admin', 'hr'].includes(pengguna.peran) ? await aman(() => kehadiranHariIni(hariIni)) : null;
  const absenRingkas = absen ? { masuk: absen.masuk ? absen.masuk.jam : null, pulang: absen.pulang ? absen.pulang.jam : null, zona: absen.zona, adaPenempatan: absen.adaPenempatan } : null;

  // Tombol utama di sorotan: Tap In / Tap Out / lihat absensi, hanya bila ada kartu absensi yang valid.
  let aksiUtama = null;
  const kartuAbsen = kartu.find((k) => k.href === '/absensi');
  if (kartuAbsen && kartuAbsen.nada !== 'bahaya') {
    let label = 'Lihat absensi';
    if (kartuAbsen.nilai === 'Belum absen') label = 'Tap In sekarang';
    else if (kartuAbsen.ket.startsWith('Jangan')) label = 'Tap Out';
    aksiUtama = { label, href: '/absensi', ikon: label === 'Tap Out' ? 'tapout' : 'tapin' };
  }

  return {
    aksiUtama, profil, jadwal, tugas, jumlahTugas, kehadiran, absenRingkas, punyaKaryawan,
    sapaan: sapaanWaktu(), nama: (await aman(() => namaKaryawan(pengguna))) || pengguna.username,
    peran: LABEL_PERAN[pengguna.peran] || pengguna.peran, kartu, pintasan: pintasan(menuPengguna), grupMenu: menuLengkap(menuPengguna),
    tanggal: waktu.lokal(new Date(), 'Asia/Jakarta').tanggal, modeKaryawan,
  };
}

module.exports = { untuk };
