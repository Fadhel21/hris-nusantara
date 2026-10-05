const test = require('node:test');
const assert = require('node:assert');
const alur = require('../src/modules/persetujuan/services/alur');
const { hariDihitung, perTahun } = require('../src/modules/cuti/services/hitung');
const waktu = require('../src/modules/absensi/services/waktu');

const ATASAN = { karyawanId: '7' };

test('alur: atasan_fallback_hr - atasan ada -> satu langkah atasan; kosong -> HR', () => {
  assert.deepStrictEqual(alur.susunLangkah('atasan_fallback_hr', ATASAN), [{ urutan: 1, peran: 'atasan', pemutus_karyawan_id: '7' }]);
  assert.deepStrictEqual(alur.susunLangkah('atasan_fallback_hr', null), [{ urutan: 1, peran: 'hr', pemutus_karyawan_id: null }]);
});

test('alur: atasan_lalu_hr dua tingkat; hr_saja satu tingkat; mode asing ditolak', () => {
  assert.deepStrictEqual(alur.susunLangkah('atasan_lalu_hr', ATASAN).map((l) => l.peran), ['atasan', 'hr']);
  assert.deepStrictEqual(alur.susunLangkah('atasan_lalu_hr', null).map((l) => l.peran), ['hr']);
  assert.deepStrictEqual(alur.susunLangkah('hr_saja', ATASAN).map((l) => l.peran), ['hr']);
  assert.throws(() => alur.susunLangkah('semua_boleh', null), /tidak dikenal/);
});

test('alur: langkah berjalan = urutan terkecil yang menunggu; berhenti bila ada yang ditolak', () => {
  const l = (urutan, status) => ({ urutan, status });
  assert.strictEqual(alur.langkahBerjalan([l(1, 'menunggu'), l(2, 'menunggu')]).urutan, 1);
  assert.strictEqual(alur.langkahBerjalan([l(2, 'menunggu'), l(1, 'disetujui')]).urutan, 2);
  assert.strictEqual(alur.langkahBerjalan([l(1, 'disetujui'), l(2, 'disetujui')]), null);
  assert.strictEqual(alur.langkahBerjalan([l(1, 'ditolak'), l(2, 'menunggu')]), null);
});

test('alur: tidak ada yang boleh memutuskan pengajuannya sendiri (termasuk admin dan HR)', () => {
  const pengajuan = { karyawan_id: '5' };
  for (const peran of ['admin', 'hr', 'atasan', 'karyawan']) {
    const r = alur.bolehMemutuskan({ peran, karyawanId: '5' }, pengajuan, { peran: 'hr', pemutus_karyawan_id: null });
    assert.strictEqual(r.boleh, false, peran);
    assert.match(r.alasan, /sendiri/);
  }
  assert.strictEqual(alur.bolehMemutuskan({ peran: 'atasan', karyawanId: '5' }, pengajuan, { peran: 'atasan', pemutus_karyawan_id: '5' }).boleh, false);
});

test('alur: langkah atasan hanya untuk atasan yang ditetapkan (atau admin; HR bila atasan tak aktif)', () => {
  const pengajuan = { karyawan_id: '5' };
  const langkah = { peran: 'atasan', pemutus_karyawan_id: '7', pemutus_aktif: true };
  assert.strictEqual(alur.bolehMemutuskan({ peran: 'atasan', karyawanId: '7' }, pengajuan, langkah).boleh, true);
  assert.strictEqual(alur.bolehMemutuskan({ peran: 'karyawan', karyawanId: '7' }, pengajuan, langkah).boleh, true);
  assert.strictEqual(alur.bolehMemutuskan({ peran: 'atasan', karyawanId: '8' }, pengajuan, langkah).boleh, false);
  assert.strictEqual(alur.bolehMemutuskan({ peran: 'hr', karyawanId: '9' }, pengajuan, langkah).boleh, false);
  assert.strictEqual(alur.bolehMemutuskan({ peran: 'hr', karyawanId: '9' }, pengajuan, { ...langkah, pemutus_aktif: false }).boleh, true);
  assert.strictEqual(alur.bolehMemutuskan({ peran: 'admin', karyawanId: null }, pengajuan, langkah).boleh, true);
});

test('alur: langkah HR hanya untuk HR (dan admin); atasan/karyawan ditolak', () => {
  const pengajuan = { karyawan_id: '5' };
  const langkah = { peran: 'hr', pemutus_karyawan_id: null };
  assert.strictEqual(alur.bolehMemutuskan({ peran: 'hr', karyawanId: '9' }, pengajuan, langkah).boleh, true);
  assert.strictEqual(alur.bolehMemutuskan({ peran: 'admin', karyawanId: null }, pengajuan, langkah).boleh, true);
  assert.strictEqual(alur.bolehMemutuskan({ peran: 'atasan', karyawanId: '7' }, pengajuan, langkah).boleh, false);
  assert.strictEqual(alur.bolehMemutuskan({ peran: 'karyawan', karyawanId: '8' }, pengajuan, langkah).boleh, false);
});

const JADWAL = [{ tanggal_berlaku: '2000-01-01', jam_masuk: '08:00', jam_pulang: '17:00', toleransi_menit: 0, hari_kerja: [1, 2, 3, 4, 5] }];

test('cuti: hanya hari kerja yang dihitung (Jumat-Senin = 2 hari)', () => {
  const h = hariDihitung({ mulai: '2026-10-09', akhir: '2026-10-12', jadwal: JADWAL, libur: new Set() });
  assert.deepStrictEqual(h, ['2026-10-09', '2026-10-12']);
});

test('cuti: hari libur tidak dihitung', () => {
  const h = hariDihitung({ mulai: '2026-10-05', akhir: '2026-10-09', jadwal: JADWAL, libur: new Set(['2026-10-07']) });
  assert.strictEqual(h.length, 4);
  assert.ok(!h.includes('2026-10-07'));
});

test('cuti: rentang hanya akhir pekan/libur -> 0 hari', () => {
  assert.strictEqual(hariDihitung({ mulai: '2026-10-10', akhir: '2026-10-11', jadwal: JADWAL, libur: new Set() }).length, 0);
  assert.strictEqual(hariDihitung({ mulai: '2026-10-05', akhir: '2026-10-05', jadwal: JADWAL, libur: new Set(['2026-10-05']) }).length, 0);
});

test('cuti: jadwal 6 hari kerja menghitung Sabtu; jadwal baru berlaku mulai tanggalnya', () => {
  const jadwal = [...JADWAL, { tanggal_berlaku: '2026-10-08', jam_masuk: '08:00', jam_pulang: '17:00', toleransi_menit: 0, hari_kerja: [1, 2, 3, 4, 5, 6] }];
  const h = hariDihitung({ mulai: '2026-10-03', akhir: '2026-10-10', jadwal, libur: new Set() }); // Sabtu 3 s.d. Sabtu 10
  assert.ok(!h.includes('2026-10-03'), 'Sabtu sebelum jadwal baru bukan hari kerja');
  assert.ok(h.includes('2026-10-10'), 'Sabtu sesudah jadwal baru adalah hari kerja');
});

test('cuti: pengelompokan per tahun saat rentang melewati pergantian tahun', () => {
  const h = hariDihitung({ mulai: '2026-12-30', akhir: '2027-01-04', jadwal: JADWAL, libur: new Set(['2027-01-01']) });
  assert.deepStrictEqual(perTahun(h), { 2026: 2, 2027: 1 }); // 30, 31 Des; hanya 4 Jan (1 Jan libur, 2-3 Jan akhir pekan)
});

test('waktu: cuti/izin disetujui tidak dihitung tanpa catatan; koreksi menggantikan catatan mentah', () => {
  const harian = waktu.susunHarian({
    awal: '2026-10-05', akhir: '2026-10-08', hariIni: '2026-10-20', jadwal: JADWAL, libur: new Set(), catatan: [],
    mulaiKerja: '2026-01-05', selesaiKerja: null,
    ketidakhadiran: new Map([['2026-10-05', 'cuti'], ['2026-10-06', 'izin']]),
    koreksi: [{ tanggal: '2026-10-07', waktu_masuk: new Date('2026-10-07T01:00:00Z'), waktu_pulang: new Date('2026-10-07T10:00:00Z'), zona_waktu: 'Asia/Jakarta' }],
  });
  assert.deepStrictEqual(harian.map((h) => h.status), ['cuti', 'izin', 'hadir', 'tanpa_catatan']);
  assert.strictEqual(harian[2].dikoreksi, true);
  assert.strictEqual(harian[2].masuk.jam, '08:00');
  assert.strictEqual(harian[2].terlambatMenit, 0);
  const r = waktu.ringkas(harian);
  assert.deepStrictEqual([r.cuti, r.izin, r.hadir, r.tanpaCatatan], [1, 1, 1, 1]);
});

test('waktu: koreksi menimpa jam mentah (terlambat -> tepat waktu), foto mentah tidak ikut', () => {
  const harian = waktu.susunHarian({
    awal: '2026-10-07', akhir: '2026-10-07', hariIni: '2026-10-20', jadwal: JADWAL, libur: new Set(),
    mulaiKerja: '2026-01-05', selesaiKerja: null,
    catatan: [{ id: 9, tanggal: '2026-10-07', jenis: 'masuk', waktu: new Date('2026-10-07T03:00:00Z'), zona_waktu: 'Asia/Jakarta', ada_foto: true }],
    koreksi: [{ tanggal: '2026-10-07', waktu_masuk: new Date('2026-10-07T00:55:00Z'), waktu_pulang: null, zona_waktu: 'Asia/Jakarta' }],
  });
  assert.strictEqual(harian[0].masuk.jam, '07:55');
  assert.strictEqual(harian[0].terlambatMenit, 0);
  assert.strictEqual(harian[0].fotoMasuk, false);
});
