// Validasi dan pembersihan input formulir berdasarkan definisi field. Fungsi murni (tanpa DB).
const MAKS_TEKS = 200;
const MAKS_AREA = 500;
const MAKS_ANGKA = 2147483647;

// Mengembalikan { nilai, galat }. nilai: objek siap simpan; galat: daftar pesan.
function bersihkan(fields, input) {
  const nilai = {};
  const galat = [];
  for (const f of fields) {
    const mentah = input[f.nama] === undefined || input[f.nama] === null ? '' : String(input[f.nama]).trim();
    if (mentah === '') {
      if (f.wajib) galat.push(`${f.label} wajib diisi.`);
      nilai[f.nama] = null;
      continue;
    }
    if (f.tipe === 'number') {
      if (!/^\d{1,10}$/.test(mentah) || Number(mentah) > MAKS_ANGKA) galat.push(`${f.label} harus berupa bilangan bulat tidak negatif.`);
      else nilai[f.nama] = Number(mentah);
    } else if (f.tipe === 'select') {
      if (f.opsi) {
        if (!f.opsi.some((o) => o.id === mentah)) galat.push(`${f.label} tidak valid.`);
        else nilai[f.nama] = mentah;
      } else if (!/^\d{1,18}$/.test(mentah)) galat.push(`${f.label} tidak valid.`);
      else nilai[f.nama] = mentah;
    } else {
      const maks = f.tipe === 'textarea' ? MAKS_AREA : MAKS_TEKS;
      if (mentah.length > maks) galat.push(`${f.label} maksimal ${maks} karakter.`);
      else nilai[f.nama] = mentah;
    }
  }
  return { nilai, galat };
}

module.exports = { bersihkan };
