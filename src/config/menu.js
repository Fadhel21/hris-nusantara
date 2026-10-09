// Menu sidebar. `peran` membatasi tampilan saja; akses sebenarnya diperiksa di route/service.
// `grup` mengelompokkan item di sidebar. `perluKaryawan` = hanya tampil untuk akun yang tertaut ke data karyawan.
// Pakai `untukPengguna(pengguna)` untuk menyaring menu per akun.
const SEMUA = ['admin', 'hr', 'atasan', 'karyawan'];
const HR = ['admin', 'hr'];

const DAFTAR = [
  { label: 'Beranda', ikon: 'beranda', href: '/', peran: SEMUA },
  { grup: 'Karyawan', label: 'Daftar karyawan', ikon: 'karyawan', href: '/karyawan', peran: ['admin', 'hr', 'atasan'] },
  { grup: 'Karyawan', label: 'Profil saya', perluKaryawan: true, ikon: 'profil', href: '/karyawan/saya', peran: ['hr', 'atasan', 'karyawan'] },
  { grup: 'Pengajuan', label: 'Pengajuan saya', perluKaryawan: true, ikon: 'pengajuan', href: '/pengajuan', peran: SEMUA },
  { grup: 'Pengajuan', label: 'Persetujuan', ikon: 'persetujuan', href: '/persetujuan', peran: SEMUA },
  { grup: 'Pengajuan', label: 'Jenis cuti', ikon: 'jenis', href: '/organisasi/jenis_cuti', peran: HR },
  { grup: 'Pengajuan', label: 'Jatah & saldo cuti', ikon: 'saldo', href: '/cuti/jatah', peran: HR },
  { grup: 'Pengajuan', label: 'Alur persetujuan', ikon: 'alur', href: '/persetujuan/pengaturan', peran: ['admin'] },
  { grup: 'Penggajian', label: 'Slip gaji saya', perluKaryawan: true, ikon: 'slip', href: '/slip-saya', peran: SEMUA },
  { grup: 'Penggajian', label: 'Periode gaji', ikon: 'periode', href: '/penggajian', peran: HR },
  { grup: 'Penggajian', label: 'Komponen gaji', ikon: 'komponen', href: '/organisasi/komponen_gaji', peran: HR },
  { grup: 'Penggajian', label: 'Pengaturan penggajian', ikon: 'pengaturan', href: '/penggajian/pengaturan', peran: HR },
  { grup: 'Penggajian', label: 'Pajak (PPh 21)', ikon: 'pajak', href: '/penggajian/pajak', peran: HR },
  { grup: 'Absensi', label: 'Absen saya', perluKaryawan: true, ikon: 'tapin', href: '/absensi', peran: SEMUA },
  { grup: 'Absensi', label: 'Rekap tim', ikon: 'grafik', href: '/absensi/tim', peran: ['admin', 'hr', 'atasan'] },
  { grup: 'Absensi', label: 'Hari libur', ikon: 'libur', href: '/absensi/libur', peran: HR },
  { grup: 'Absensi', label: 'Pengaturan absensi', ikon: 'pengaturan', href: '/absensi/pengaturan', peran: HR },
  { grup: 'Organisasi', label: 'Struktur', ikon: 'struktur', href: '/organisasi/struktur', peran: HR },
  { grup: 'Organisasi', label: 'Perusahaan', ikon: 'organisasi', href: '/organisasi/perusahaan', peran: HR },
  { grup: 'Organisasi', label: 'Cabang', ikon: 'cabang', href: '/organisasi/cabang', peran: HR },
  { grup: 'Organisasi', label: 'Departemen', ikon: 'departemen', href: '/organisasi/departemen', peran: HR },
  { grup: 'Organisasi', label: 'Jabatan', ikon: 'jabatan', href: '/organisasi/jabatan', peran: HR },
  { grup: 'Organisasi', label: 'Golongan', ikon: 'golongan', href: '/organisasi/golongan', peran: HR },
];

// Mode karyawan: tampilan layanan mandiri (hanya menu pribadi). Hanya mengubah tampilan; hak akses tetap diperiksa di route/service.
DAFTAR.untukPengguna = (pengguna, modeKaryawan = false) => DAFTAR.filter((m) => {
  if (!m.peran.includes(pengguna.peran)) return false;
  if (m.perluKaryawan && !pengguna.karyawanId) return false;
  if (modeKaryawan && m.href !== '/' && !m.perluKaryawan) return false;
  return true;
});

// Siapa yang boleh berganti mode: peran selain karyawan yang punya data karyawan.
DAFTAR.bisaGantiMode = (pengguna) => !!pengguna && pengguna.peran !== 'karyawan' && !!pengguna.karyawanId;

module.exports = DAFTAR;
