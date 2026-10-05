// Logika waktu absensi. Fungsi murni (tanpa DB) agar mudah diuji.
// Waktu masuk/pulang disimpan sebagai TIMESTAMPTZ dari jam server; di sini diubah ke waktu lokal cabang.
const pemformat = new Map();

function ambilPemformat(zona) {
  if (!pemformat.has(zona)) {
    pemformat.set(zona, new Intl.DateTimeFormat('en-CA', {
      timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }));
  }
  return pemformat.get(zona);
}

// Waktu (Date) -> { tanggal: 'YYYY-MM-DD', menit: menit sejak tengah malam, jam: 'HH:MM' } di zona tersebut.
function lokal(waktu, zona) {
  const b = {};
  for (const p of ambilPemformat(zona).formatToParts(new Date(waktu))) b[p.type] = p.value;
  return {
    tanggal: `${b.year}-${b.month}-${b.day}`,
    menit: Number(b.hour) * 60 + Number(b.minute),
    jam: `${b.hour}:${b.minute}`,
  };
}

// 'HH:MM' atau 'HH:MM:SS' -> menit sejak tengah malam.
function menitDariJam(jam) {
  const [h, m] = String(jam).split(':');
  return Number(h) * 60 + Number(m);
}

// ISO: Senin=1 ... Minggu=7
function hariKe(tanggal) {
  return new Date(`${tanggal}T00:00:00Z`).getUTCDay() || 7;
}

function daftarTanggal(awal, akhir) {
  const hasil = [];
  const d = new Date(`${awal}T00:00:00Z`);
  const batas = new Date(`${akhir}T00:00:00Z`);
  while (d <= batas) { hasil.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return hasil;
}

// Jadwal yang berlaku pada tanggal: baris dengan tanggal_berlaku terbaru <= tanggal.
function jadwalBerlaku(daftar, tanggal) {
  let pilih = null;
  for (const j of daftar) {
    if (j.tanggal_berlaku <= tanggal && (!pilih || j.tanggal_berlaku > pilih.tanggal_berlaku)) pilih = j;
  }
  return pilih;
}

// Menit terlambat: bila masuk melewati jam masuk + toleransi, dihitung sejak jam masuk (detik dibuang).
function menitTerlambat(menitMasuk, jadwal) {
  const batas = menitDariJam(jadwal.jam_masuk) + jadwal.toleransi_menit;
  return menitMasuk > batas ? menitMasuk - menitDariJam(jadwal.jam_masuk) : 0;
}

function menitPulangAwal(menitPulang, jadwal) {
  const jam = menitDariJam(jadwal.jam_pulang);
  return menitPulang < jam ? jam - menitPulang : 0;
}

// Menyusun status harian satu karyawan untuk rentang tanggal.
//   catatan: [{ id, tanggal, jenis: 'masuk'|'pulang', waktu, zona_waktu, ada_foto }]
//   libur: Set tanggal libur; hariIni: tanggal 'hari ini' menurut zona karyawan.
//   mulaiKerja/selesaiKerja: tanggal masuk dan keluar karyawan (selesaiKerja boleh null).
// Status: hadir | libur | bukan_hari_kerja | tanpa_catatan | belum | di_luar_masa_kerja
//   ketidakhadiran: Map tanggal -> 'cuti' | 'izin' (hanya pengajuan yang sudah disetujui).
//   koreksi: [{ tanggal, waktu_masuk, waktu_pulang, zona_waktu }] koreksi absensi yang sudah disetujui;
//            nilainya menggantikan catatan mentah pada tanggal itu (catatan mentah sendiri tidak diubah).
function susunHarian({
  awal, akhir, hariIni, jadwal, libur, catatan, mulaiKerja, selesaiKerja, ketidakhadiran = new Map(), koreksi = [],
}) {
  const perHari = new Map();
  for (const c of catatan) {
    if (!perHari.has(c.tanggal)) perHari.set(c.tanggal, {});
    perHari.get(c.tanggal)[c.jenis] = c;
  }
  for (const k of koreksi) {
    if (!perHari.has(k.tanggal)) perHari.set(k.tanggal, {});
    const hari = perHari.get(k.tanggal);
    for (const [jenis, w] of [['masuk', k.waktu_masuk], ['pulang', k.waktu_pulang]]) {
      if (w) hari[jenis] = { id: null, tanggal: k.tanggal, jenis, waktu: w, zona_waktu: k.zona_waktu, ada_foto: false, koreksi: true };
    }
  }
  return daftarTanggal(awal, akhir).map((tanggal) => {
    const j = jadwalBerlaku(jadwal, tanggal);
    const hariKerja = !!j && j.hari_kerja.includes(hariKe(tanggal));
    const adalibur = libur.has(tanggal);
    const { masuk, pulang } = perHari.get(tanggal) || {};
    const baris = {
      tanggal, hariKerja, libur: adalibur, status: '', masuk: null, pulang: null,
      masukId: masuk ? masuk.id : null, pulangId: pulang ? pulang.id : null,
      fotoMasuk: !!(masuk && masuk.ada_foto), fotoPulang: !!(pulang && pulang.ada_foto),
      terlambatMenit: 0, pulangAwalMenit: 0,
      dikoreksi: !!((masuk && masuk.koreksi) || (pulang && pulang.koreksi)),
    };
    if (masuk) baris.masuk = lokal(masuk.waktu, masuk.zona_waktu);
    if (pulang) baris.pulang = lokal(pulang.waktu, pulang.zona_waktu);

    if (tanggal < mulaiKerja || (selesaiKerja && tanggal > selesaiKerja)) baris.status = 'di_luar_masa_kerja';
    else if (masuk) baris.status = 'hadir';
    else if (adalibur) baris.status = 'libur';
    else if (!hariKerja) baris.status = 'bukan_hari_kerja';
    else if (ketidakhadiran.has(tanggal)) baris.status = ketidakhadiran.get(tanggal);
    else if (tanggal >= hariIni) baris.status = 'belum';
    else baris.status = 'tanpa_catatan';

    // Keterlambatan hanya dihitung pada hari kerja biasa (bukan libur).
    if (masuk && hariKerja && !adalibur) {
      baris.terlambatMenit = menitTerlambat(baris.masuk.menit, j);
      if (pulang) baris.pulangAwalMenit = menitPulangAwal(baris.pulang.menit, j);
    }
    return baris;
  });
}

function ringkas(harian) {
  const r = { hadir: 0, terlambat: 0, menitTerlambat: 0, pulangAwal: 0, tanpaCatatan: 0, cuti: 0, izin: 0 };
  for (const h of harian) {
    if (h.status === 'hadir') r.hadir += 1;
    if (h.status === 'cuti') r.cuti += 1;
    if (h.status === 'izin') r.izin += 1;
    if (h.status === 'tanpa_catatan') r.tanpaCatatan += 1;
    if (h.terlambatMenit > 0) { r.terlambat += 1; r.menitTerlambat += h.terlambatMenit; }
    if (h.pulangAwalMenit > 0) r.pulangAwal += 1;
  }
  return r;
}

// 'YYYY-MM' -> { awal, akhir } (tanggal pertama dan terakhir bulan itu). null bila tidak valid.
function rentangBulan(bulan) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(bulan || ''));
  if (!m) return null;
  const akhir = new Date(Date.UTC(+m[1], +m[2], 0)).toISOString().slice(0, 10);
  return { awal: `${m[1]}-${m[2]}-01`, akhir };
}

module.exports = {
  lokal, menitDariJam, hariKe, daftarTanggal, jadwalBerlaku, menitTerlambat, menitPulangAwal,
  susunHarian, ringkas, rentangBulan,
};
