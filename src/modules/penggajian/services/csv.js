// Parser CSV buatan sendiri (tanpa library) dan validasi tabel pajak (PTKP, TER, lapisan PPh 21).
// Fungsi murni: tidak menyentuh database. Pemisah koma atau titik koma dikenali otomatis.
const { tanggalValid } = require('../../karyawan/services/format');
const { periksaLapisan, periksaTer } = require('./pph21');
const uang = require('./uang');

const MAKS_BARIS = 5000;
const POLA_UANG = /^\d{1,13}(\.\d{1,2})?$/;
const POLA_TARIF = /^\d{1,3}(\.\d{1,4})?$/;

// Mengurai teks CSV menjadi larik baris (larik sel). Mendukung sel berkutip, kutip ganda "" , dan baris kosong diabaikan.
function bacaCsv(teks) {
  const isi = String(teks).replace(/^﻿/, '');
  const barisPertama = isi.split(/\r?\n/).find((b) => b.trim() !== '') || '';
  const pemisah = (barisPertama.match(/;/g) || []).length > (barisPertama.match(/,/g) || []).length ? ';' : ',';
  const hasil = [];
  let baris = [];
  let sel = '';
  let dalamKutip = false;
  for (let i = 0; i < isi.length; i += 1) {
    const c = isi[i];
    if (dalamKutip) {
      if (c === '"') {
        if (isi[i + 1] === '"') { sel += '"'; i += 1; } else dalamKutip = false;
      } else sel += c;
    } else if (c === '"') dalamKutip = true;
    else if (c === pemisah) { baris.push(sel); sel = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && isi[i + 1] === '\n') i += 1;
      baris.push(sel); sel = '';
      if (baris.some((x) => x.trim() !== '')) hasil.push(baris.map((x) => x.trim()));
      baris = [];
    } else sel += c;
  }
  baris.push(sel);
  if (baris.some((x) => x.trim() !== '')) hasil.push(baris.map((x) => x.trim()));
  if (dalamKutip) throw new Error('Tanda kutip tidak ditutup.');
  return { baris: hasil, pemisah };
}

const FORMAT = {
  ptkp: ['kode', 'ptkp_tahunan', 'kategori_ter', 'tanggal_berlaku'],
  ter: ['kategori', 'batas_bawah', 'batas_atas', 'tarif', 'tanggal_berlaku'],
  lapisan: ['batas_bawah', 'batas_atas', 'tarif', 'tanggal_berlaku'],
};

const KATEGORI = ['A', 'B', 'C'];

// Mengembalikan { data, galat, ringkasan }. galat berisi pesan beserta nomor baris (baris 1 = judul kolom).
function validasi(jenis, teks) {
  if (!Object.prototype.hasOwnProperty.call(FORMAT, jenis)) return { data: [], galat: ['Jenis tabel tidak dikenal.'], ringkasan: [] };
  let parsed;
  try { parsed = bacaCsv(teks); } catch (e) { return { data: [], galat: [e.message], ringkasan: [] }; }
  const { baris } = parsed;
  const galat = [];
  if (!baris.length) return { data: [], galat: ['Berkas kosong.'], ringkasan: [] };
  const judul = baris[0].map((x) => x.toLowerCase());
  const kolom = FORMAT[jenis];
  if (judul.length !== kolom.length || kolom.some((k, i) => judul[i] !== k)) {
    return { data: [], galat: [`Judul kolom harus persis: ${kolom.join(',')} (urutan sama).`], ringkasan: [] };
  }
  if (baris.length - 1 > MAKS_BARIS) return { data: [], galat: [`Maksimal ${MAKS_BARIS} baris data.`], ringkasan: [] };
  if (baris.length === 1) return { data: [], galat: ['Tidak ada baris data.'], ringkasan: [] };

  const data = [];
  baris.slice(1).forEach((sel, idx) => {
    const no = idx + 2;
    if (sel.length !== kolom.length) { galat.push(`Baris ${no}: jumlah kolom ${sel.length}, seharusnya ${kolom.length}.`); return; }
    const r = Object.fromEntries(kolom.map((k, i) => [k, sel[i]]));
    const salah = (m) => galat.push(`Baris ${no}: ${m}`);
    let ok = true;
    const uangWajib = (k) => { if (!POLA_UANG.test(r[k])) { salah(`${k} harus angka (maks. 2 desimal, tanpa pemisah ribuan): "${r[k]}"`); ok = false; } };
    const tarifWajib = () => {
      if (!POLA_TARIF.test(r.tarif) || Number(r.tarif) > 100) { salah(`tarif harus 0-100 (maks. 4 desimal): "${r.tarif}"`); ok = false; }
    };
    if (!tanggalValid(r.tanggal_berlaku)) { salah(`tanggal_berlaku tidak valid (YYYY-MM-DD): "${r.tanggal_berlaku}"`); ok = false; }
    if (jenis === 'ptkp') {
      if (!/^[A-Za-z0-9/]{1,12}$/.test(r.kode)) { salah(`kode status tidak valid: "${r.kode}"`); ok = false; }
      uangWajib('ptkp_tahunan');
      if (!KATEGORI.includes(r.kategori_ter)) { salah(`kategori_ter harus A, B, atau C: "${r.kategori_ter}"`); ok = false; }
    } else if (jenis === 'ter') {
      if (!KATEGORI.includes(r.kategori)) { salah(`kategori harus A, B, atau C: "${r.kategori}"`); ok = false; }
      uangWajib('batas_bawah');
      if (r.batas_atas !== '') uangWajib('batas_atas');
      tarifWajib();
    } else {
      uangWajib('batas_bawah');
      if (r.batas_atas !== '') uangWajib('batas_atas');
      tarifWajib();
    }
    if (ok) data.push({ ...r, batas_atas: r.batas_atas === '' ? null : r.batas_atas, _baris: no });
  });
  if (galat.length) return { data, galat, ringkasan: [] };

  // Pemeriksaan per kelompok (tanggal berlaku, dan kategori untuk TER).
  const kelompok = new Map();
  for (const r of data) {
    const kunci = jenis === 'ter' ? `${r.tanggal_berlaku}|${r.kategori}` : r.tanggal_berlaku;
    if (!kelompok.has(kunci)) kelompok.set(kunci, []);
    kelompok.get(kunci).push(r);
  }
  if (jenis === 'ptkp') {
    const lihat = new Set();
    for (const r of data) {
      const k = `${r.kode.toUpperCase()}|${r.tanggal_berlaku}`;
      if (lihat.has(k)) galat.push(`Baris ${r._baris}: status ${r.kode} ganda pada tanggal berlaku ${r.tanggal_berlaku}.`);
      lihat.add(k);
    }
  } else {
    for (const [kunci, baris2] of kelompok) {
      const periksa = jenis === 'ter' ? periksaTer(baris2) : periksaLapisan(baris2);
      if (periksa) galat.push(`Kelompok ${kunci.replace('|', ' kategori ')}: ${periksa}.`);
      const urut = [...baris2].sort((a, b) => (uang.keSen(a.batas_bawah) < uang.keSen(b.batas_bawah) ? -1 : 1));
      for (let i = 0; i < urut.length; i += 1) {
        const atas = urut[i].batas_atas;
        if (atas !== null && uang.keSen(atas) < uang.keSen(urut[i].batas_bawah)) galat.push(`Baris ${urut[i]._baris}: batas_atas lebih kecil dari batas_bawah.`);
        if (jenis === 'ter' && atas !== null && i + 1 < urut.length && uang.keSen(atas) >= uang.keSen(urut[i + 1].batas_bawah)) {
          galat.push(`Baris ${urut[i]._baris}: rentang tumpang tindih dengan baris berikutnya.`);
        }
      }
    }
  }
  const ringkasan = [...kelompok.entries()].map(([kunci, b]) => ({ kelompok: kunci.replace('|', ' kategori '), baris: b.length }));
  return { data, galat, ringkasan };
}

module.exports = { FORMAT, bacaCsv, validasi, MAKS_BARIS };
