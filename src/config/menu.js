// Menu sidebar. `peran` membatasi tampilan saja; akses sebenarnya diperiksa di route/service.
// `grup` mengelompokkan item di sidebar.
const SEMUA = ['admin', 'hr', 'atasan', 'karyawan'];
const HR = ['admin', 'hr'];

module.exports = [
  { label: 'Beranda', href: '/', peran: SEMUA },
  { grup: 'Organisasi', label: 'Struktur', href: '/organisasi/struktur', peran: HR },
  { grup: 'Organisasi', label: 'Perusahaan', href: '/organisasi/perusahaan', peran: HR },
  { grup: 'Organisasi', label: 'Cabang', href: '/organisasi/cabang', peran: HR },
  { grup: 'Organisasi', label: 'Departemen', href: '/organisasi/departemen', peran: HR },
  { grup: 'Organisasi', label: 'Jabatan', href: '/organisasi/jabatan', peran: HR },
  { grup: 'Organisasi', label: 'Golongan', href: '/organisasi/golongan', peran: HR },
];
