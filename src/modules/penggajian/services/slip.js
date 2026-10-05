// Slip gaji: tampilan dan PDF. PDF dibuat saat diminta lalu langsung dikirim ke browser (tidak disimpan di disk).
// Akses: admin/HR boleh membuka slip mana pun; karyawan hanya slip miliknya dan hanya untuk periode yang sudah dikunci.
const path = require('node:path');
const pdfmake = require('pdfmake');
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const akses = require('../../karyawan/services/akses');
const { rupiah, tanggal } = require('../../karyawan/services/format');

const NAMA_BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Font bawaan pdfmake (Roboto). Akses berkas lokal dibatasi ke folder font, akses URL dimatikan.
const FOLDER_FONT = path.join(path.dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');
pdfmake.addFonts({
  Roboto: {
    normal: path.join(FOLDER_FONT, 'Roboto-Regular.ttf'), bold: path.join(FOLDER_FONT, 'Roboto-Medium.ttf'),
    italics: path.join(FOLDER_FONT, 'Roboto-Italic.ttf'), bolditalics: path.join(FOLDER_FONT, 'Roboto-MediumItalic.ttf'),
  },
});
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((p) => path.resolve(p).startsWith(FOLDER_FONT));

function namaPeriode(p) {
  return `${NAMA_BULAN[p.bulan]} ${p.tahun}`;
}

async function ambilSlip(pengguna, slipId) {
  const { rows } = await db.query(
    `SELECT s.*, p.tahun, p.bulan, p.tanggal_awal, p.tanggal_akhir, p.status AS status_periode
       FROM slip_gaji s JOIN periode_gaji p ON p.id = s.periode_id
      WHERE s.id = $1 AND s.deleted_at IS NULL AND p.deleted_at IS NULL`, [slipId]);
  const s = rows[0];
  if (!s) throw new GalatBisnis('Slip gaji tidak ditemukan.', 404);
  const pengelola = akses.semuaData(pengguna);
  const milikSendiri = pengguna.karyawanId && String(pengguna.karyawanId) === String(s.karyawan_id);
  // 404 (bukan 403) agar keberadaan slip orang lain tidak bocor; karyawan hanya melihat periode yang sudah dikunci.
  if (!pengelola && !(milikSendiri && s.status_periode === 'terkunci')) throw new GalatBisnis('Slip gaji tidak ditemukan.', 404);
  const { rows: rincian } = await db.query(
    'SELECT urutan, tipe, kode, nama, nominal, keterangan FROM slip_gaji_rincian WHERE slip_id = $1 AND deleted_at IS NULL ORDER BY urutan', [slipId]);
  return {
    slip: s, periode: { tahun: s.tahun, bulan: s.bulan, tanggal_awal: s.tanggal_awal, tanggal_akhir: s.tanggal_akhir, status: s.status_periode },
    pendapatan: rincian.filter((r) => r.tipe === 'pendapatan'), potongan: rincian.filter((r) => r.tipe === 'potongan'),
    beban: rincian.filter((r) => r.tipe === 'beban_perusahaan'), judulPeriode: namaPeriode(s),
    sudahDikunci: s.status_periode === 'terkunci',
  };
}

async function slipSaya(pengguna) {
  if (!pengguna.karyawanId) return [];
  const { rows } = await db.query(
    `SELECT s.id, p.tahun, p.bulan, s.gaji_bruto, s.total_potongan, s.gaji_bersih
       FROM slip_gaji s JOIN periode_gaji p ON p.id = s.periode_id
      WHERE s.karyawan_id = $1 AND s.deleted_at IS NULL AND p.deleted_at IS NULL AND p.status = 'terkunci'
      ORDER BY p.tahun DESC, p.bulan DESC`, [pengguna.karyawanId]);
  return rows;
}

function tabelRincian(baris, kosong) {
  const isi = baris.length
    ? baris.map((r) => [{ text: r.nama + (r.keterangan ? `\n${r.keterangan}` : ''), fontSize: 9 }, { text: rupiah(r.nominal), alignment: 'right', fontSize: 9 }])
    : [[{ text: kosong, italics: true, color: '#666666', fontSize: 9 }, '']];
  return { table: { widths: ['*', 110], body: isi }, layout: 'lightHorizontalLines', margin: [0, 2, 0, 8] };
}

async function buatPdf(pengguna, slipId) {
  const d = await ambilSlip(pengguna, slipId);
  const s = d.slip;
  const dok = {
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    pageMargins: [40, 40, 40, 40],
    info: { title: `Slip Gaji ${d.judulPeriode} - ${s.nama}` },
    content: [
      { text: 'SLIP GAJI', style: 'judul' },
      { text: `Periode ${d.judulPeriode} (${tanggal(s.tanggal_awal)} s.d. ${tanggal(s.tanggal_akhir)})`, margin: [0, 0, 0, 10] },
      {
        columns: [
          [{ text: [{ text: 'Nama: ', bold: true }, s.nama] }, { text: [{ text: 'Nomor induk: ', bold: true }, s.nomor_induk] }],
          [{ text: [{ text: 'Jabatan: ', bold: true }, s.jabatan || '-'] }, { text: [{ text: 'Departemen: ', bold: true }, s.departemen || '-'] }],
        ],
        margin: [0, 0, 0, 8],
      },
      { text: `Hari kerja: ${s.hari_kerja_bekerja} dari ${s.hari_kerja_periode} hari` + (s.menit_terlambat ? ` · Keterlambatan: ${s.menit_terlambat} menit` : ''), fontSize: 9, color: '#444444', margin: [0, 0, 0, 8] },
      { text: 'Pendapatan', style: 'bagian' }, tabelRincian(d.pendapatan, 'Tidak ada pendapatan.'),
      { text: 'Potongan', style: 'bagian' }, tabelRincian(d.potongan, 'Tidak ada potongan.'),
      {
        table: {
          widths: ['*', 110],
          body: [
            [{ text: 'Total pendapatan', fontSize: 9 }, { text: rupiah(s.gaji_bruto), alignment: 'right', fontSize: 9 }],
            [{ text: 'Total potongan', fontSize: 9 }, { text: rupiah(s.total_potongan), alignment: 'right', fontSize: 9 }],
            [{ text: 'GAJI BERSIH', bold: true }, { text: rupiah(s.gaji_bersih), alignment: 'right', bold: true }],
          ],
        },
        layout: 'lightHorizontalLines', margin: [0, 4, 0, 10],
      },
      ...(d.beban.length ? [{ text: 'Iuran ditanggung perusahaan (informasi, tidak mengurangi gaji)', style: 'bagian' }, tabelRincian(d.beban, '')] : []),
      { text: 'Catatan: gaji bersih di atas belum memperhitungkan PPh 21.', italics: true, fontSize: 8, color: '#666666', margin: [0, 8, 0, 0] },
    ],
    styles: { judul: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] }, bagian: { bold: true, margin: [0, 4, 0, 0] } },
  };
  const buffer = await pdfmake.createPdf(dok).getBuffer();
  return { buffer, nama: `slip-gaji-${s.tahun}-${String(s.bulan).padStart(2, '0')}-${s.nomor_induk}.pdf` };
}

module.exports = { NAMA_BULAN, namaPeriode, ambilSlip, slipSaya, buatPdf };
