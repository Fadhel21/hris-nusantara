// Aturan alur persetujuan. Fungsi murni (tanpa DB).
// Satu pengajuan punya satu atau lebih langkah berurutan; langkah ditetapkan saat pengajuan dibuat.
const MODE = {
  atasan_fallback_hr: 'Atasan langsung; HR bila atasan kosong',
  atasan_lalu_hr: 'Atasan langsung, lalu HR',
  hr_saja: 'HR saja',
};

// atasan: { karyawanId } bila pemohon punya atasan aktif (berakun), selain itu null.
// Mengembalikan [{ urutan, peran, pemutus_karyawan_id }].
function susunLangkah(mode, atasan) {
  if (!Object.prototype.hasOwnProperty.call(MODE, mode)) throw new Error(`Mode alur persetujuan tidak dikenal: ${mode}`);
  const langkahAtasan = atasan ? { peran: 'atasan', pemutus_karyawan_id: atasan.karyawanId } : null;
  const langkahHr = { peran: 'hr', pemutus_karyawan_id: null };
  let daftar;
  if (mode === 'hr_saja') daftar = [langkahHr];
  else if (mode === 'atasan_fallback_hr') daftar = [langkahAtasan || langkahHr];
  else daftar = langkahAtasan ? [langkahAtasan, langkahHr] : [langkahHr];
  return daftar.map((l, i) => ({ urutan: i + 1, ...l }));
}

// Langkah yang sedang menunggu = urutan terkecil yang berstatus 'menunggu', hanya bila langkah
// sebelumnya sudah disetujui semua.
function langkahBerjalan(langkah) {
  const urut = [...langkah].sort((a, b) => a.urutan - b.urutan);
  for (const l of urut) {
    if (l.status === 'menunggu') return l;
    if (l.status !== 'disetujui') return null;
  }
  return null;
}

// Siapa boleh memutuskan langkah?
//   - Tidak seorang pun boleh memutuskan pengajuannya sendiri (termasuk admin).
//   - admin boleh memutuskan langkah mana pun (penanganan pengajuan yang macet).
//   - langkah 'hr': peran hr.
//   - langkah 'atasan': karyawan yang ditetapkan; atau hr bila atasan itu sudah tidak aktif.
// langkah.pemutus_aktif: false bila atasan yang ditetapkan sudah keluar/tidak punya akun aktif.
function bolehMemutuskan(pengguna, pengajuan, langkah) {
  if (pengguna.karyawanId && String(pengguna.karyawanId) === String(pengajuan.karyawan_id)) {
    return { boleh: false, alasan: 'Anda tidak dapat memutuskan pengajuan Anda sendiri.' };
  }
  if (pengguna.peran === 'admin') return { boleh: true };
  if (langkah.peran === 'hr') {
    return pengguna.peran === 'hr' ? { boleh: true } : { boleh: false, alasan: 'Langkah ini diputuskan oleh HR.' };
  }
  if (pengguna.karyawanId && String(pengguna.karyawanId) === String(langkah.pemutus_karyawan_id)) return { boleh: true };
  if (pengguna.peran === 'hr' && langkah.pemutus_aktif === false) return { boleh: true };
  return { boleh: false, alasan: 'Anda bukan pemberi keputusan untuk pengajuan ini.' };
}

module.exports = { MODE, susunLangkah, langkahBerjalan, bolehMemutuskan };
