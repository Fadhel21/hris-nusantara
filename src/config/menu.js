// Menu sidebar. `peran` membatasi tampilan saja; akses sebenarnya diperiksa di route/service.
module.exports = [
  { label: 'Beranda', href: '/', peran: ['admin', 'hr', 'atasan', 'karyawan'] },
];
