// Menu sidebar. `peran` membatasi tampilan saja; akses sebenarnya diperiksa di route/service.
// `grup` mengelompokkan item di sidebar.
const SEMUA = ['admin', 'hr', 'atasan', 'karyawan'];
const HR = ['admin', 'hr'];

module.exports = [
  { label: 'Beranda', ikon: 'beranda', href: '/', peran: SEMUA },
  { grup: 'Karyawan', label: 'Daftar karyawan', ikon: 'karyawan', href: '/karyawan', peran: ['admin', 'hr', 'atasan'] },
  { grup: 'Karyawan', label: 'Profil saya', ikon: 'profil', href: '/karyawan/saya', peran: ['hr', 'atasan', 'karyawan'] },
  { grup: 'Pengajuan', label: 'Pengajuan saya', ikon: 'pengajuan', href: '/pengajuan', peran: SEMUA },
  { grup: 'Pengajuan', label: 'Persetujuan', ikon: 'persetujuan', href: '/persetujuan', peran: SEMUA },
  { grup: 'Pengajuan', label: 'Jenis cuti', ikon: 'jenis', href: '/organisasi/jenis_cuti', peran: HR },
  { grup: 'Pengajuan', label: 'Jatah & saldo cuti', ikon: 'saldo', href: '/cuti/jatah', peran: HR },
  { grup: 'Pengajuan', label: 'Alur persetujuan', ikon: 'alur', href: '/persetujuan/pengaturan', peran: ['admin'] },
  { grup: 'Penggajian', label: 'Slip gaji saya', ikon: 'slip', href: '/slip-saya', peran: SEMUA },
  { grup: 'Penggajian', label: 'Periode gaji', ikon: 'periode', href: '/penggajian', peran: HR },
  { grup: 'Penggajian', label: 'Komponen gaji', ikon: 'komponen', href: '/organisasi/komponen_gaji', peran: HR },
  { grup: 'Penggajian', label: 'Pengaturan penggajian', ikon: 'pengaturan', href: '/penggajian/pengaturan', peran: HR },
  { grup: 'Penggajian', label: 'Pajak (PPh 21)', ikon: 'pajak', href: '/penggajian/pajak', peran: HR },
  { grup: 'Absensi', label: 'Absen saya', ikon: 'lokasi', href: '/absensi', peran: SEMUA },
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
