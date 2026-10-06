// Ikon SVG inline (garis, 24x24). Dekoratif secara bawaan: aria-hidden; beri label teks di sebelahnya.
const BENTUK = {
  beranda: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  karyawan: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  pengajuan: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3h6v3H9z"/><path d="m9 13 2 2 4-4"/>',
  penggajian: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/><circle cx="17" cy="14.5" r="1.4"/>',
  absensi: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  organisasi: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h2a2 2 0 0 1 2 2v10"/><path d="M8 7h4M8 11h4M8 15h4M2 21h20"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  tutup: '<path d="M6 6l12 12M18 6 6 18"/>',
  keluar: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  kalender: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  dokumen: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  perisai: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  grafik: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V7M17 16v-3"/>',
  panah: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

// Mengembalikan markup <svg>. ukuran dalam px.
function ikon(nama, ukuran = 20) {
  const isi = BENTUK[nama] || BENTUK.dokumen;
  return `<svg class="ikon" viewBox="0 0 24 24" width="${ukuran}" height="${ukuran}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${isi}</svg>`;
}

// Ikon tiap kelompok menu.
const IKON_GRUP = { Karyawan: 'karyawan', Pengajuan: 'pengajuan', Penggajian: 'penggajian', Absensi: 'absensi', Organisasi: 'organisasi' };

module.exports = { ikon, IKON_GRUP, BENTUK };
