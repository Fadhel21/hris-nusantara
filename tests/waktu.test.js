const test = require('node:test');
const assert = require('node:assert');
const w = require('../src/modules/absensi/services/waktu');

const JADWAL = [{ tanggal_berlaku: '2000-01-01', jam_masuk: '08:00:00', jam_pulang: '17:00:00', toleransi_menit: 0, hari_kerja: [1, 2, 3, 4, 5] }];

test('waktu: zona WIB, WITA, WIT dari satu instan UTC', () => {
  const t = new Date('2026-10-05T01:30:00Z'); // 08:30 WIB
  assert.deepStrictEqual(w.lokal(t, 'Asia/Jakarta'), { tanggal: '2026-10-05', menit: 510, jam: '08:30' });
  assert.strictEqual(w.lokal(t, 'Asia/Makassar').jam, '09:30');
  assert.strictEqual(w.lokal(t, 'Asia/Jayapura').jam, '10:30');
});

test('waktu: pergantian tanggal mengikuti zona (17:30 UTC = esok hari di WIB)', () => {
  const t = new Date('2026-10-05T17:30:00Z');
  assert.strictEqual(w.lokal(t, 'Asia/Jakarta').tanggal, '2026-10-06');
  assert.strictEqual(w.lokal(t, 'Asia/Jakarta').jam, '00:30');
  assert.strictEqual(w.lokal(new Date('2026-10-05T16:59:59Z'), 'Asia/Jakarta').tanggal, '2026-10-05');
  assert.strictEqual(w.lokal(new Date('2026-10-05T16:30:00Z'), 'Asia/Jayapura').tanggal, '2026-10-06');
});

test('waktu: hari ISO dan rentang bulan', () => {
  assert.strictEqual(w.hariKe('2026-10-05'), 1); // Senin
  assert.strictEqual(w.hariKe('2026-10-11'), 7); // Minggu
  assert.deepStrictEqual(w.rentangBulan('2024-02'), { awal: '2024-02-01', akhir: '2024-02-29' });
  assert.deepStrictEqual(w.rentangBulan('2026-12'), { awal: '2026-12-01', akhir: '2026-12-31' });
  for (const salah of ['2026-13', '2026-1', 'abc', '', null]) assert.strictEqual(w.rentangBulan(salah), null);
  assert.strictEqual(w.daftarTanggal('2026-02-27', '2026-03-02').length, 4);
});

test('waktu: keterlambatan tanpa toleransi', () => {
  const j = JADWAL[0];
  assert.strictEqual(w.menitTerlambat(8 * 60, j), 0); // tepat 08:00
  assert.strictEqual(w.menitTerlambat(8 * 60 + 1, j), 1); // 08:01
  assert.strictEqual(w.menitTerlambat(9 * 60 + 15, j), 75);
  assert.strictEqual(w.menitTerlambat(7 * 60 + 30, j), 0);
});

test('waktu: toleransi 15 menit - dalam toleransi tidak terlambat, lewat dihitung dari jam masuk', () => {
  const j = { ...JADWAL[0], toleransi_menit: 15 };
  assert.strictEqual(w.menitTerlambat(8 * 60 + 15, j), 0);
  assert.strictEqual(w.menitTerlambat(8 * 60 + 16, j), 16);
});

test('waktu: pulang awal', () => {
  const j = JADWAL[0];
  assert.strictEqual(w.menitPulangAwal(17 * 60, j), 0);
  assert.strictEqual(w.menitPulangAwal(16 * 60 + 30, j), 30);
  assert.strictEqual(w.menitPulangAwal(18 * 60, j), 0);
});

test('waktu: jadwal berlaku mengikuti tanggal berlaku (riwayat)', () => {
  const daftar = [
    { tanggal_berlaku: '2000-01-01', jam_masuk: '08:00', jam_pulang: '17:00', toleransi_menit: 0, hari_kerja: [1, 2, 3, 4, 5] },
    { tanggal_berlaku: '2026-11-01', jam_masuk: '09:00', jam_pulang: '18:00', toleransi_menit: 15, hari_kerja: [1, 2, 3, 4, 5, 6] },
  ];
  assert.strictEqual(w.jadwalBerlaku(daftar, '2026-10-31').jam_masuk, '08:00');
  assert.strictEqual(w.jadwalBerlaku(daftar, '2026-11-01').jam_masuk, '09:00');
  assert.strictEqual(w.jadwalBerlaku(daftar, '1999-01-01'), null);
});

function catat(tanggal, jenis, utc, zona = 'Asia/Jakarta') {
  return { id: `${tanggal}-${jenis}`, tanggal, jenis, waktu: new Date(utc), zona_waktu: zona, ada_foto: true };
}

test('waktu: susunHarian - status per hari dalam seminggu', () => {
  // 2026-10-05 Senin ... 2026-10-11 Minggu; hari ini = 2026-10-09 (Jumat)
  const harian = w.susunHarian({
    awal: '2026-10-05', akhir: '2026-10-11', hariIni: '2026-10-09', jadwal: JADWAL,
    libur: new Set(['2026-10-07']), mulaiKerja: '2026-01-05', selesaiKerja: null,
    catatan: [
      catat('2026-10-05', 'masuk', '2026-10-05T01:00:00Z'), // 08:00 -> tepat waktu
      catat('2026-10-05', 'pulang', '2026-10-05T10:00:00Z'), // 17:00
      catat('2026-10-06', 'masuk', '2026-10-06T02:10:00Z'), // 09:10 -> terlambat 70
      catat('2026-10-06', 'pulang', '2026-10-06T09:30:00Z'), // 16:30 -> awal 30
    ],
  });
  const st = Object.fromEntries(harian.map((h) => [h.tanggal, h.status]));
  assert.deepStrictEqual(st, {
    '2026-10-05': 'hadir', '2026-10-06': 'hadir', '2026-10-07': 'libur', '2026-10-08': 'tanpa_catatan',
    '2026-10-09': 'belum', '2026-10-10': 'bukan_hari_kerja', '2026-10-11': 'bukan_hari_kerja',
  });
  assert.strictEqual(harian[0].terlambatMenit, 0);
  assert.strictEqual(harian[1].terlambatMenit, 70);
  assert.strictEqual(harian[1].pulangAwalMenit, 30);
  assert.deepStrictEqual(w.ringkas(harian), { hadir: 2, terlambat: 1, menitTerlambat: 70, pulangAwal: 1, tanpaCatatan: 1, cuti: 0, izin: 0 });
});

test('waktu: hadir di hari libur/akhir pekan tidak dihitung terlambat', () => {
  const harian = w.susunHarian({
    awal: '2026-10-10', akhir: '2026-10-10', hariIni: '2026-10-12', jadwal: JADWAL, libur: new Set(),
    mulaiKerja: '2026-01-05', selesaiKerja: null,
    catatan: [catat('2026-10-10', 'masuk', '2026-10-10T05:00:00Z')], // Sabtu 12:00
  });
  assert.strictEqual(harian[0].status, 'hadir');
  assert.strictEqual(harian[0].terlambatMenit, 0);
});

test('waktu: di luar masa kerja (sebelum masuk / setelah keluar) tidak dianggap tanpa catatan', () => {
  const harian = w.susunHarian({
    awal: '2026-10-05', akhir: '2026-10-09', hariIni: '2026-10-20', jadwal: JADWAL, libur: new Set(), catatan: [],
    mulaiKerja: '2026-10-07', selesaiKerja: '2026-10-08',
  });
  assert.deepStrictEqual(harian.map((h) => h.status),
    ['di_luar_masa_kerja', 'di_luar_masa_kerja', 'tanpa_catatan', 'tanpa_catatan', 'di_luar_masa_kerja']);
});

test('waktu: zona WIT - masuk 08:00 WIT (23:00 UTC hari sebelumnya) tercatat tepat waktu di tanggal lokal', () => {
  const harian = w.susunHarian({
    awal: '2026-10-05', akhir: '2026-10-05', hariIni: '2026-10-06', jadwal: JADWAL, libur: new Set(),
    mulaiKerja: '2026-01-05', selesaiKerja: null,
    catatan: [catat('2026-10-05', 'masuk', '2026-10-04T23:00:00Z', 'Asia/Jayapura')],
  });
  assert.strictEqual(harian[0].masuk.jam, '08:00');
  assert.strictEqual(harian[0].terlambatMenit, 0);
});
