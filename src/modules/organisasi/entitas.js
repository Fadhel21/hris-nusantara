// Definisi lima entitas organisasi. Nama tabel/kolom di sini konstanta kode (bukan input pengguna),
// sehingga aman dipakai menyusun SQL di service.
const ZONA_WAKTU = [
  { id: 'Asia/Jakarta', label: 'WIB (Asia/Jakarta)' },
  { id: 'Asia/Makassar', label: 'WITA (Asia/Makassar)' },
  { id: 'Asia/Jayapura', label: 'WIT (Asia/Jayapura)' },
];

const entitas = {
  perusahaan: {
    tabel: 'perusahaan', judul: 'Perusahaan', urut: 't.nama',
    fields: [
      { nama: 'nama', label: 'Nama', tipe: 'text', wajib: true },
      { nama: 'alamat', label: 'Alamat', tipe: 'textarea' },
      { nama: 'telepon', label: 'Telepon', tipe: 'text' },
    ],
    kolom: ['nama', 'telepon'],
    dipakai: [
      { tabel: 'cabang', kolom: 'perusahaan_id', pesan: 'masih punya cabang' },
      { tabel: 'departemen', kolom: 'perusahaan_id', pesan: 'masih punya departemen' },
    ],
  },
  cabang: {
    tabel: 'cabang', judul: 'Cabang', urut: 't.kode',
    fields: [
      { nama: 'perusahaan_id', label: 'Perusahaan', tipe: 'select', wajib: true, ref: { entitas: 'perusahaan', label: 'nama' } },
      { nama: 'kode', label: 'Kode', tipe: 'text', wajib: true },
      { nama: 'nama', label: 'Nama', tipe: 'text', wajib: true },
      { nama: 'alamat', label: 'Alamat', tipe: 'textarea' },
      { nama: 'zona_waktu', label: 'Zona waktu', tipe: 'select', wajib: true, opsi: ZONA_WAKTU },
    ],
    kolom: ['kode', 'nama', 'perusahaan_id', 'zona_waktu'],
    unik: 'Kode cabang sudah dipakai di perusahaan ini.',
    dipakai: [],
  },
  departemen: {
    tabel: 'departemen', judul: 'Departemen', urut: 't.kode',
    fields: [
      { nama: 'perusahaan_id', label: 'Perusahaan', tipe: 'select', wajib: true, ref: { entitas: 'perusahaan', label: 'nama' } },
      { nama: 'kode', label: 'Kode', tipe: 'text', wajib: true },
      { nama: 'nama', label: 'Nama', tipe: 'text', wajib: true },
      { nama: 'induk_id', label: 'Departemen induk', tipe: 'select', ref: { entitas: 'departemen', label: 'nama' } },
    ],
    kolom: ['kode', 'nama', 'induk_id', 'perusahaan_id'],
    hirarki: 'induk_id',
    unik: 'Kode departemen sudah dipakai di perusahaan ini.',
    dipakai: [
      { tabel: 'departemen', kolom: 'induk_id', pesan: 'masih punya sub-departemen' },
      { tabel: 'jabatan', kolom: 'departemen_id', pesan: 'masih punya jabatan' },
    ],
  },
  jabatan: {
    tabel: 'jabatan', judul: 'Jabatan', urut: 't.kode',
    fields: [
      { nama: 'kode', label: 'Kode', tipe: 'text', wajib: true },
      { nama: 'nama', label: 'Nama', tipe: 'text', wajib: true },
      { nama: 'departemen_id', label: 'Departemen', tipe: 'select', ref: { entitas: 'departemen', label: 'nama' } },
      { nama: 'level', label: 'Level', tipe: 'number' },
    ],
    kolom: ['kode', 'nama', 'departemen_id', 'level'],
    unik: 'Kode jabatan sudah dipakai.',
    dipakai: [],
  },
  jenis_cuti: {
    tabel: 'jenis_cuti', judul: 'Jenis cuti', urut: 't.nama',
    fields: [
      { nama: 'kode', label: 'Kode', tipe: 'text', wajib: true },
      { nama: 'nama', label: 'Nama', tipe: 'text', wajib: true },
      { nama: 'jatah_hari', label: 'Jatah per tahun (hari)', tipe: 'number', wajib: true },
      {
        nama: 'potong_saldo', label: 'Memotong saldo', tipe: 'select', wajib: true,
        opsi: [{ id: 'true', label: 'Ya (memakai saldo)' }, { id: 'false', label: 'Tidak (hanya dicatat)' }],
      },
    ],
    kolom: ['kode', 'nama', 'jatah_hari', 'potong_saldo'],
    unik: 'Kode jenis cuti sudah dipakai.',
    dipakai: [
      { tabel: 'pengajuan_cuti', kolom: 'jenis_cuti_id', pesan: 'sudah dipakai pada pengajuan cuti' },
      { tabel: 'saldo_cuti_mutasi', kolom: 'jenis_cuti_id', pesan: 'sudah memiliki saldo' },
    ],
  },
  komponen_gaji: {
    tabel: 'komponen_gaji', judul: 'Komponen gaji', urut: 't.jenis, t.nama',
    fields: [
      { nama: 'kode', label: 'Kode', tipe: 'text', wajib: true },
      { nama: 'nama', label: 'Nama', tipe: 'text', wajib: true },
      {
        nama: 'jenis', label: 'Jenis', tipe: 'select', wajib: true,
        opsi: [{ id: 'tunjangan', label: 'Tunjangan (menambah gaji)' }, { id: 'potongan', label: 'Potongan (mengurangi gaji)' }],
      },
      {
        nama: 'masuk_dasar_bpjs', label: 'Masuk dasar upah BPJS', tipe: 'select', wajib: true,
        opsi: [{ id: 'false', label: 'Tidak' }, { id: 'true', label: 'Ya (hanya untuk tunjangan)' }],
      },
    ],
    kolom: ['kode', 'nama', 'jenis', 'masuk_dasar_bpjs'],
    unik: 'Kode komponen gaji sudah dipakai.',
    dipakai: [{ tabel: 'riwayat_komponen_karyawan', kolom: 'komponen_id', pesan: 'sudah dipakai pada gaji karyawan' }],
  },
  golongan: {
    tabel: 'golongan', judul: 'Golongan', urut: 't.urutan',
    fields: [
      { nama: 'kode', label: 'Kode', tipe: 'text', wajib: true },
      { nama: 'nama', label: 'Nama', tipe: 'text', wajib: true },
      { nama: 'urutan', label: 'Urutan', tipe: 'number', wajib: true },
    ],
    kolom: ['kode', 'nama', 'urutan'],
    unik: 'Kode golongan sudah dipakai.',
    dipakai: [],
  },
};

module.exports = entitas;
