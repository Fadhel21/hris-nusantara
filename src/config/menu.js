// Menu sidebar. `peran` membatasi tampilan saja; akses sebenarnya diperiksa di route/service.
// `grup` mengelompokkan item di sidebar.
const SEMUA = ['admin', 'hr', 'atasan', 'karyawan'];
const HR = ['admin', 'hr'];

module.exports = [
  { label: 'Beranda', href: '/', peran: SEMUA },
  { grup: 'Karyawan', label: 'Daftar karyawan', href: '/karyawan', peran: ['admin', 'hr', 'atasan'] },
  { grup: 'Karyawan', label: 'Profil saya', href: '/karyawan/saya', peran: ['hr', 'atasan', 'karyawan'] },
  { grup: 'Absensi', label: 'Absen saya', href: '/absensi', peran: SEMUA },
  { grup: 'Absensi', label: 'Rekap tim', href: '/absensi/tim', peran: ['admin', 'hr', 'atasan'] },
  { grup: 'Absensi', label: 'Hari libur', href: '/absensi/libur', peran: HR },
  { grup: 'Absensi', label: 'Pengaturan absensi', href: '/absensi/pengaturan', peran: HR },
  { grup: 'Organisasi', label: 'Struktur', href: '/organisasi/struktur', peran: HR },
  { grup: 'Organisasi', label: 'Perusahaan', href: '/organisasi/perusahaan', peran: HR },
  { grup: 'Organisasi', label: 'Cabang', href: '/organisasi/cabang', peran: HR },
  { grup: 'Organisasi', label: 'Departemen', href: '/organisasi/departemen', peran: HR },
  { grup: 'Organisasi', label: 'Jabatan', href: '/organisasi/jabatan', peran: HR },
  { grup: 'Organisasi', label: 'Golongan', href: '/organisasi/golongan', peran: HR },
];
