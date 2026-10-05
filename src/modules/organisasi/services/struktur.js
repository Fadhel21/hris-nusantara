// Struktur organisasi: pohon departemen per perusahaan, lengkap dengan cabang dan jabatan.
const db = require('../../../config/db');

// Menyusun daftar datar (id, induk_id) menjadi pohon. Induk yang tidak ada dianggap akar.
function susunPohon(baris) {
  const peta = new Map(baris.map((b) => [String(b.id), { ...b, anak: [] }]));
  const akar = [];
  for (const node of peta.values()) {
    const induk = node.induk_id === null || node.induk_id === undefined ? null : peta.get(String(node.induk_id));
    if (induk) induk.anak.push(node);
    else akar.push(node);
  }
  return akar;
}

async function ambilStruktur() {
  const [perusahaan, cabang, departemen, jabatan] = await Promise.all([
    db.query('SELECT id, nama FROM perusahaan WHERE deleted_at IS NULL ORDER BY nama'),
    db.query("SELECT id, perusahaan_id, kode, nama, zona_waktu FROM cabang WHERE deleted_at IS NULL ORDER BY kode"),
    db.query('SELECT id, perusahaan_id, induk_id, kode, nama FROM departemen WHERE deleted_at IS NULL ORDER BY kode'),
    db.query('SELECT id, departemen_id, kode, nama FROM jabatan WHERE deleted_at IS NULL ORDER BY level NULLS LAST, kode'),
  ]);
  return perusahaan.rows.map((p) => {
    const dept = departemen.rows
      .filter((d) => String(d.perusahaan_id) === String(p.id))
      .map((d) => ({ ...d, jabatan: jabatan.rows.filter((j) => String(j.departemen_id) === String(d.id)) }));
    return {
      ...p,
      cabang: cabang.rows.filter((c) => String(c.perusahaan_id) === String(p.id)),
      departemen: susunPohon(dept),
    };
  });
}

module.exports = { susunPohon, ambilStruktur };
