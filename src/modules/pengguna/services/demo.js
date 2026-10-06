// Akun demo untuk mencoba aplikasi. Password SENGAJA ditampilkan di halaman masuk, jadi akun ini hanya
// boleh ada di lingkungan pengembangan/percobaan (panel tampil hanya bila DEMO_AKUN=true, dan DEMO_AKUN
// ditolak saat NODE_ENV=production). Dibuat lewat `node scripts/seed-demo.js`.
const PASSWORD_DEMO = 'Demo#2026';

const AKUN_DEMO = [
  { username: 'demo.admin', peran: 'admin', label: 'Administrator', deskripsi: 'Seluruh pengaturan, akun, dan penggajian.', karyawan: null },
  { username: 'demo.hr', peran: 'hr', label: 'HR', deskripsi: 'Data karyawan, absensi, cuti, dan penggajian.', karyawan: { nama: 'Hana Rahma (Demo HR)', gaji: '9000000' } },
  { username: 'demo.atasan', peran: 'atasan', label: 'Atasan', deskripsi: 'Rekap dan persetujuan untuk tim sendiri.', karyawan: { nama: 'Arga Pratama (Demo Atasan)', gaji: '12000000' } },
  { username: 'demo.karyawan', peran: 'karyawan', label: 'Karyawan', deskripsi: 'Absen, pengajuan, dan slip gaji milik sendiri.', karyawan: { nama: 'Kirana Putri (Demo Karyawan)', gaji: '7000000' } },
];

module.exports = { PASSWORD_DEMO, AKUN_DEMO };
