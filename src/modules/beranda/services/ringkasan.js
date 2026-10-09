// Data beranda per peran. Setiap kartu diambil terpisah dan gagal dengan aman: satu sumber data yang bermasalah
// tidak boleh membuat seluruh beranda gagal. Hanya data yang berhak dilihat peran itu yang diambil.
const db = require('../../../config/db');
const menu = require('../../../config/menu');
const { IKON_GRUP } = require('../../../config/ikon');
const catat = require('../../absensi/services/catat');
const saldo = require('../../cuti/services/saldo');
const pengajuan = require('../../persetujuan/services/pengajuan');
const slip = require('../../penggajian/services/slip');
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

async function untuk(pengguna, { modeKaryawan = false } = {}) {
  const menuPengguna = menu.untukPengguna(pengguna, modeKaryawan);
  const kartu = [];
  const punyaKaryawan = !!pengguna.karyawanId;
  const tahun = Number(waktu.lokal(new Date(), 'Asia/Jakarta').tanggal.slice(0, 4));

  if (punyaKaryawan) {
    const absen = await aman(() => catat.statusHariIni(pengguna));
    if (absen) {
      let nilai = 'Belum absen'; let ket = 'Absen masuk dengan foto'; let nada = 'peringatan';
      if (absen.masuk && !absen.pulang) { nilai = `Masuk ${absen.masuk.jam}`; ket = 'Jangan lupa absen pulang'; nada = 'sukses'; }
      if (absen.masuk && absen.pulang) { nilai = `${absen.masuk.jam} – ${absen.pulang.jam}`; ket = 'Absen hari ini lengkap'; nada = 'sukses'; }
      if (!absen.adaPenempatan) { nilai = 'Belum bisa absen'; ket = 'Penempatan cabang belum diatur'; nada = 'bahaya'; }
      kartu.push({ label: 'Absen hari ini', nilai, ket, href: '/absensi', ikon: 'absensi', nada });
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
  if (!modeKaryawan && inbox && (inbox.length || ['admin', 'hr', 'atasan'].includes(pengguna.peran))) {
    kartu.push({
      label: 'Menunggu keputusan Anda', nilai: String(inbox.length), ket: inbox.length ? 'Buka untuk menyetujui atau menolak' : 'Semua sudah diputuskan',
      href: '/persetujuan', ikon: 'perisai', nada: inbox.length ? 'bahaya' : 'sukses',
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
    aksiUtama,
    sapaan: sapaanWaktu(), nama: (await aman(() => namaKaryawan(pengguna))) || pengguna.username,
    peran: LABEL_PERAN[pengguna.peran] || pengguna.peran, kartu, pintasan: pintasan(menuPengguna), grupMenu: menuLengkap(menuPengguna),
    tanggal: waktu.lokal(new Date(), 'Asia/Jakarta').tanggal, modeKaryawan,
  };
}

module.exports = { untuk };
