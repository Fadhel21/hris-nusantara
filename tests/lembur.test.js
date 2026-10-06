const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/modules/penggajian/services/lembur');
const uang = require('../src/modules/penggajian/services/uang');
const { hitungSlip } = require('../src/modules/penggajian/services/hitung');

const JADWAL5 = [{ tanggal_berlaku: '2000-01-01', jam_masuk: '08:00', jam_pulang: '17:00', toleransi_menit: 0, hari_kerja: [1, 2, 3, 4, 5] }];
const JADWAL6 = [{ tanggal_berlaku: '2000-01-01', jam_masuk: '08:00', jam_pulang: '17:00', toleransi_menit: 0, hari_kerja: [1, 2, 3, 4, 5, 6] }];
const aturan = (tipe) => L.PRESET_KEPMENAKER.aturan.filter((a) => a.tipe_hari === tipe);

test('lembur: tipe hari menurut jadwal dan libur', () => {
  const libur = new Set(['2026-10-07']);
  assert.strictEqual(L.tipeHari({ tanggal: '2026-10-05', jadwal: JADWAL5, libur }), 'hari_kerja'); // Senin
  assert.strictEqual(L.tipeHari({ tanggal: '2026-10-07', jadwal: JADWAL5, libur }), 'libur_5hari'); // libur nasional
  assert.strictEqual(L.tipeHari({ tanggal: '2026-10-10', jadwal: JADWAL5, libur }), 'libur_5hari'); // Sabtu
  assert.strictEqual(L.tipeHari({ tanggal: '2026-10-10', jadwal: JADWAL6, libur }), 'hari_kerja'); // Sabtu = hari kerja di jadwal 6 hari
  assert.strictEqual(L.tipeHari({ tanggal: '2026-10-11', jadwal: JADWAL6, libur }), 'libur_6hari'); // Minggu
  assert.strictEqual(L.tipeHari({ tanggal: '2026-10-07', jadwal: JADWAL6, libur }), 'libur_6hari');
});

test('lembur: pemeriksaan kelengkapan aturan', () => {
  assert.strictEqual(L.periksaAturan(aturan('hari_kerja')), null);
  assert.strictEqual(L.periksaAturan(aturan('libur_5hari')), null);
  assert.strictEqual(L.periksaAturan(aturan('libur_6hari')), null);
  assert.match(L.periksaAturan([]), /belum diisi/);
  assert.match(L.periksaAturan([{ menit_dari: 30, menit_sampai: null, pengali: '1' }]), /mulai dari menit 0/);
  assert.match(L.periksaAturan([{ menit_dari: 0, menit_sampai: 60, pengali: '1' }, { menit_dari: 90, menit_sampai: null, pengali: '2' }]), /tidak bersambung/);
  assert.match(L.periksaAturan([{ menit_dari: 0, menit_sampai: 60, pengali: '1' }]), /terakhir harus terbuka/);
  assert.match(L.periksaAturan([{ menit_dari: 0, menit_sampai: null, pengali: '1' }, { menit_dari: 60, menit_sampai: null, pengali: '2' }]), /terbuka sebelum/);
});

// Upah sebulan 17.300.000 / 173 = 100.000 per jam (angka bulat agar mudah diverifikasi manual).
const DASAR = uang.keSen('17300000');

test('lembur: hari kerja 1 jam = 1,5 x 100.000; 3 jam = 150.000 + 2 x 200.000', () => {
  const t = aturan('hari_kerja');
  assert.strictEqual(uang.dariSen(L.upahLembur({ menit: 60, tahap: t, dasarSen: DASAR, pembagi: 173 })), '150000.00');
  assert.strictEqual(uang.dariSen(L.upahLembur({ menit: 180, tahap: t, dasarSen: DASAR, pembagi: 173 })), '550000.00');
});

test('lembur: potongan menit - 90 menit hari kerja = 60 x 1,5 + 30 x 2 menit', () => {
  // 100.000/jam: 1 jam x 1,5 = 150.000; 30 menit x 2 = 100.000 => 250.000
  assert.strictEqual(uang.dariSen(L.upahLembur({ menit: 90, tahap: aturan('hari_kerja'), dasarSen: DASAR, pembagi: 173 })), '250000.00');
});

test('lembur: hari libur 5 hari kerja - 8 jam x2, jam ke-9 x3, jam ke-10 dst x4', () => {
  const t = aturan('libur_5hari');
  assert.strictEqual(uang.dariSen(L.upahLembur({ menit: 480, tahap: t, dasarSen: DASAR, pembagi: 173 })), '1600000.00'); // 8 x 200.000
  assert.strictEqual(uang.dariSen(L.upahLembur({ menit: 540, tahap: t, dasarSen: DASAR, pembagi: 173 })), '1900000.00'); // + 300.000
  assert.strictEqual(uang.dariSen(L.upahLembur({ menit: 660, tahap: t, dasarSen: DASAR, pembagi: 173 })), '2700000.00'); // + 2 x 400.000
});

test('lembur: hari libur 6 hari kerja - 7 jam x2, jam ke-8 x3, jam ke-9 dst x4', () => {
  const t = aturan('libur_6hari');
  assert.strictEqual(uang.dariSen(L.upahLembur({ menit: 420, tahap: t, dasarSen: DASAR, pembagi: 173 })), '1400000.00');
  assert.strictEqual(uang.dariSen(L.upahLembur({ menit: 600, tahap: t, dasarSen: DASAR, pembagi: 173 })), '2500000.00'); // 1.400.000 + 300.000 + 2 x 400.000
});

test('lembur: pembulatan half-up per tahap dan tanpa float', () => {
  // 5.000.000 / 173 = 28.901,7341/jam; 1 jam x 1,5 = 43.352,601 -> 43352.60
  assert.strictEqual(uang.dariSen(L.upahLembur({ menit: 60, tahap: aturan('hari_kerja'), dasarSen: uang.keSen('5000000'), pembagi: 173 })), '43352.60');
  assert.strictEqual(L.upahLembur({ menit: 0, tahap: aturan('hari_kerja'), dasarSen: DASAR, pembagi: 173 }), 0n);
});

test('lembur: aturan tidak lengkap atau pembagi salah ditolak, bukan dihitung diam-diam', () => {
  assert.throws(() => L.upahLembur({ menit: 60, tahap: [], dasarSen: DASAR, pembagi: 173 }), /tidak lengkap/);
  assert.throws(() => L.upahLembur({ menit: 60, tahap: aturan('hari_kerja'), dasarSen: DASAR, pembagi: 0 }), /Pembagi/);
});

test('lembur: aturan yang berlaku mengikuti tanggal berlaku terbaru', () => {
  const semua = [
    { tipe_hari: 'hari_kerja', menit_dari: 0, menit_sampai: null, pengali: '1.50', tanggal_berlaku: '2026-01-01' },
    { tipe_hari: 'hari_kerja', menit_dari: 0, menit_sampai: 60, pengali: '2.00', tanggal_berlaku: '2026-06-01' },
    { tipe_hari: 'hari_kerja', menit_dari: 60, menit_sampai: null, pengali: '3.00', tanggal_berlaku: '2026-06-01' },
  ];
  assert.strictEqual(L.aturanBerlaku(semua, 'hari_kerja', '2026-05-31').length, 1);
  assert.strictEqual(L.aturanBerlaku(semua, 'hari_kerja', '2026-06-30').length, 2);
  assert.strictEqual(L.aturanBerlaku(semua, 'hari_kerja', '2025-12-31').length, 0);
  assert.strictEqual(L.aturanBerlaku(semua, 'libur_5hari', '2026-06-30').length, 0);
  assert.strictEqual(L.menitKeTeks(150), '2 jam 30 menit');
  assert.strictEqual(L.menitKeTeks(60), '1 jam');
});

test('hitung: upah lembur menjadi pendapatan, tidak masuk dasar BPJS, dan ikut gaji bersih', () => {
  const hari = [];
  for (let d = new Date('2026-10-01T00:00:00Z'); d <= new Date('2026-10-31T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay(); if (w >= 1 && w <= 5) hari.push(d.toISOString().slice(0, 10));
  }
  const s = hitungSlip({
    hariKerjaPeriode: hari, karyawan: { tanggal_masuk: '2026-01-05', tanggal_keluar: null },
    gajiPokok: [{ tanggal_berlaku: '2026-01-05', nominal: '5000000' }], komponen: [], menitTerlambat: 0, tarifPerMenit: '0',
    bpjs: [{ program: 'jht', tarif_karyawan: '2', tarif_perusahaan: '0', batas_upah_atas: null }], penyesuaian: [],
    lembur: { nominal: '550000.00', menit: 180, kali: 1 },
  });
  const per = Object.fromEntries(s.rincian.map((r) => [r.kode, r]));
  assert.strictEqual(per.LEMBUR.nominal, '550000.00');
  assert.strictEqual(per.LEMBUR.keterangan, '3 jam (1 pengajuan)');
  assert.strictEqual(per.BPJS_JHT.nominal, '100000.00'); // 2% x 5.000.000, lembur tidak masuk dasar
  assert.strictEqual(s.bruto, '5550000.00');
  assert.strictEqual(s.bersih, '5450000.00');
});
