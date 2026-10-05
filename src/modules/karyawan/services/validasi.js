// Validasi formulir karyawan dan riwayat. Fungsi murni: mengembalikan { nilai, galat }.
const { tanggalValid, uangValid, hariIni } = require('./format');

const JENIS_KONTRAK = ['PKWT', 'PKWTT', 'magang'];

function teks(input, nama) {
  const v = input[nama];
  return v === undefined || v === null ? '' : String(v).trim();
}

// Spesifikasi: { nama, label, wajib, jenis, maks, ... } diproses berurutan.
function proses(spesifikasi, input) {
  const nilai = {};
  const galat = [];
  for (const s of spesifikasi) {
    let v = teks(input, s.nama);
    if (s.hanyaAngka && v !== '') v = v.replace(/[\s.\-]/g, '');
    if (v === '') {
      if (s.wajib) galat.push(`${s.label} wajib diisi.`);
      nilai[s.nama] = null;
      continue;
    }
    const salah = (pesan) => galat.push(`${s.label} ${pesan}`);
    switch (s.jenis) {
      case 'tanggal':
        if (!tanggalValid(v)) { salah('bukan tanggal yang valid.'); continue; }
        if (s.tidakMasaDepan && v > hariIni()) { salah('tidak boleh di masa depan.'); continue; }
        break;
      case 'uang':
        if (!uangValid(v)) { salah('harus berupa angka (maks. 2 desimal, tanpa pemisah ribuan).'); continue; }
        break;
      case 'id':
        if (!/^\d{1,18}$/.test(v)) { salah('tidak valid.'); continue; }
        break;
      case 'pilihan':
        if (!s.pilihan.includes(v)) { salah('tidak valid.'); continue; }
        break;
      default:
        if (v.length > (s.maks || 200)) { salah(`maksimal ${s.maks || 200} karakter.`); continue; }
    }
    if (s.pola && !s.pola.test(v)) { salah(s.pesanPola); continue; }
    nilai[s.nama] = v;
  }
  return { nilai, galat };
}

const DATA_PRIBADI = [
  { nama: 'nama', label: 'Nama', wajib: true },
  { nama: 'nik', label: 'NIK', hanyaAngka: true, pola: /^\d{16}$/, pesanPola: 'harus 16 digit.' },
  { nama: 'npwp', label: 'NPWP', hanyaAngka: true, pola: /^\d{15,16}$/, pesanPola: 'harus 15 atau 16 digit.' },
  { nama: 'tanggal_lahir', label: 'Tanggal lahir', jenis: 'tanggal', tidakMasaDepan: true },
  { nama: 'jenis_kelamin', label: 'Jenis kelamin', jenis: 'pilihan', pilihan: ['L', 'P'] },
  { nama: 'alamat', label: 'Alamat', maks: 500 },
  { nama: 'telepon', label: 'Telepon', pola: /^[0-9+\-\s()]{5,20}$/, pesanPola: 'tidak valid.' },
  { nama: 'email', label: 'Email', pola: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, pesanPola: 'tidak valid.' },
  { nama: 'bank', label: 'Bank', maks: 100 },
  { nama: 'nomor_rekening', label: 'Nomor rekening', hanyaAngka: true, pola: /^\d{5,25}$/, pesanPola: 'harus 5-25 digit.' },
];

const TANGGAL_MASUK = [{ nama: 'tanggal_masuk', label: 'Tanggal masuk', wajib: true, jenis: 'tanggal' }];

const PENEMPATAN = [
  { nama: 'tanggal_berlaku', label: 'Tanggal berlaku', wajib: true, jenis: 'tanggal' },
  { nama: 'cabang_id', label: 'Cabang', wajib: true, jenis: 'id' },
  { nama: 'departemen_id', label: 'Departemen', wajib: true, jenis: 'id' },
  { nama: 'jabatan_id', label: 'Jabatan', wajib: true, jenis: 'id' },
  { nama: 'golongan_id', label: 'Golongan', jenis: 'id' },
  { nama: 'atasan_id', label: 'Atasan', jenis: 'id' },
];

const GAJI = [
  { nama: 'tanggal_berlaku', label: 'Tanggal berlaku', wajib: true, jenis: 'tanggal' },
  { nama: 'gaji_pokok', label: 'Gaji pokok', wajib: true, jenis: 'uang' },
  { nama: 'alasan', label: 'Alasan', maks: 200 },
];

const KONTRAK = [
  { nama: 'jenis', label: 'Jenis kontrak', wajib: true, jenis: 'pilihan', pilihan: JENIS_KONTRAK },
  { nama: 'tanggal_mulai', label: 'Tanggal mulai', wajib: true, jenis: 'tanggal' },
  { nama: 'tanggal_akhir', label: 'Tanggal akhir', jenis: 'tanggal' },
];

const KELUAR = [
  { nama: 'tanggal_keluar', label: 'Tanggal keluar', wajib: true, jenis: 'tanggal' },
  { nama: 'alasan_keluar', label: 'Alasan keluar', wajib: true, maks: 500 },
];

function dataPribadi(input) { return proses(DATA_PRIBADI, input); }
function penempatan(input) { return proses(PENEMPATAN, input); }
function gaji(input) { return proses(GAJI, input); }
function keluar(input) { return proses(KELUAR, input); }

function kontrak(input) {
  const hasil = proses(KONTRAK, input);
  const { jenis, tanggal_mulai: mulai, tanggal_akhir: akhir } = hasil.nilai;
  if (jenis === 'PKWTT' && akhir) hasil.galat.push('Kontrak PKWTT tidak memiliki tanggal akhir.');
  if (jenis && jenis !== 'PKWTT' && !akhir && !hasil.galat.some((g) => g.startsWith('Tanggal akhir'))) {
    hasil.galat.push('Tanggal akhir wajib diisi untuk kontrak PKWT dan magang.');
  }
  if (mulai && akhir && akhir < mulai) hasil.galat.push('Tanggal akhir tidak boleh sebelum tanggal mulai.');
  return hasil;
}

// Formulir tambah karyawan: data pribadi + tanggal masuk + penempatan awal + gaji awal + kontrak awal.
// Penempatan, gaji, dan kontrak awal berlaku sejak tanggal masuk.
function karyawanBaru(input) {
  const a = proses([...DATA_PRIBADI, ...TANGGAL_MASUK], input);
  const masuk = a.nilai.tanggal_masuk;
  const p = proses(PENEMPATAN.filter((s) => s.nama !== 'tanggal_berlaku'), input);
  const g = proses(GAJI.filter((s) => s.nama === 'gaji_pokok'), input);
  const k = kontrak({ ...input, tanggal_mulai: masuk || '' });
  return {
    nilai: { pribadi: a.nilai, penempatan: p.nilai, gaji: g.nilai, kontrak: k.nilai },
    galat: [...a.galat, ...p.galat, ...g.galat, ...k.galat.filter((x) => !x.startsWith('Tanggal mulai'))],
  };
}

module.exports = { dataPribadi, penempatan, gaji, kontrak, keluar, karyawanBaru, JENIS_KONTRAK };
