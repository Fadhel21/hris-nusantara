// Pemeriksaan berkas unggahan. Fungsi murni: isi berkas dicek dari byte awalnya (magic number),
// bukan dari nama atau Content-Type kiriman klien.
const PNG_AWAL = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function deteksiTipe(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(PNG_AWAL)) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

// Membaca lebar/tinggi JPEG dari segmen SOF. null bila tidak ditemukan/rusak.
function dimensiJpeg(buf) {
  let i = 2;
  while (i + 9 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1];
    if (m === 0xff) { i += 1; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { tinggi: buf.readUInt16BE(i + 5), lebar: buf.readUInt16BE(i + 7) };
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const panjang = buf.readUInt16BE(i + 2);
    if (panjang < 2) return null;
    i += 2 + panjang;
  }
  return null;
}

// Nama berkas asli hanya untuk tampilan: buang direktori, karakter kontrol, dan tanda kutip.
function bersihkanNama(nama) {
  const dasar = String(nama || '').split(/[\\/]/).pop();
  const bersih = dasar.replace(/[\u0000-\u001f\u007f"<>:*?|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150);
  return bersih || 'dokumen';
}

module.exports = { deteksiTipe, dimensiJpeg, bersihkanNama };
