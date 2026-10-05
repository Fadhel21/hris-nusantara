// CRUD generik untuk entitas organisasi (soft delete, audit, transaksi).
const db = require('../../../config/db');
const { GalatBisnis } = require('../../../config/galat');
const audit = require('../../pengguna/services/audit');
const semua = require('../entitas');
const { bersihkan } = require('./validasi');

function ambilDef(kunci) {
  const def = semua[kunci];
  if (!def) throw new GalatBisnis('Data tidak dikenal.', 404);
  return def;
}

function labelOpsi(field, nilai, baris) {
  if (nilai === null || nilai === undefined) return '';
  if (field.ref) return baris[`${field.nama}__label`] || '';
  if (field.opsi) {
    const o = field.opsi.find((x) => x.id === String(nilai));
    return o ? o.label : nilai;
  }
  return String(nilai);
}

// Daftar baris aktif beserta nilai tampilan (`tampil`) untuk kolom di def.kolom.
async function daftar(kunci) {
  const def = ambilDef(kunci);
  const refs = def.fields.filter((f) => f.ref);
  const selectRef = refs.map((f, i) => `, r${i}.${f.ref.label} AS ${f.nama}__label`).join('');
  const joinRef = refs.map((f, i) => ` LEFT JOIN ${semua[f.ref.entitas].tabel} r${i} ON r${i}.id = t.${f.nama}`).join('');
  const { rows } = await db.query(
    `SELECT t.*${selectRef} FROM ${def.tabel} t${joinRef} WHERE t.deleted_at IS NULL ORDER BY ${def.urut}, t.id`);
  return rows.map((b) => {
    const tampil = {};
    for (const nama of def.kolom) {
      const f = def.fields.find((x) => x.nama === nama);
      tampil[nama] = labelOpsi(f, b[nama] === null ? null : b[nama], b);
    }
    return { id: b.id, nilai: b, tampil };
  });
}

async function ambil(kunci, id) {
  const def = ambilDef(kunci);
  const { rows } = await db.query(`SELECT * FROM ${def.tabel} WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!rows[0]) throw new GalatBisnis('Data tidak ditemukan.', 404);
  return rows[0];
}

// Opsi dropdown untuk setiap field: { nama_field: [{ id, label }] }.
async function opsiForm(kunci, kecualiId = null) {
  const def = ambilDef(kunci);
  const hasil = {};
  for (const f of def.fields) {
    if (f.opsi) hasil[f.nama] = f.opsi;
    else if (f.ref) {
      const ref = semua[f.ref.entitas];
      // Saat mengubah, entitas tidak boleh memilih dirinya sendiri (mis. departemen induk).
      const kecuali = ref.tabel === def.tabel && kecualiId !== null;
      const { rows } = await db.query(
        `SELECT id, ${f.ref.label} AS label FROM ${ref.tabel} WHERE deleted_at IS NULL${kecuali ? ' AND id <> $1' : ''} ORDER BY ${f.ref.label}`,
        kecuali ? [kecualiId] : []);
      hasil[f.nama] = rows.map((r) => ({ id: String(r.id), label: r.label }));
    }
  }
  return hasil;
}

async function pastikanRujukanAda(exec, def, nilai) {
  for (const f of def.fields) {
    if (!f.ref || nilai[f.nama] === null) continue;
    const { rowCount } = await exec.query(
      `SELECT 1 FROM ${semua[f.ref.entitas].tabel} WHERE id = $1 AND deleted_at IS NULL`, [nilai[f.nama]]);
    if (!rowCount) throw new GalatBisnis(`${f.label} tidak ditemukan.`);
  }
}

// Mencegah siklus (induk = diri sendiri atau keturunannya) dan induk beda perusahaan.
async function periksaHirarki(exec, def, id, nilai) {
  const induk = nilai[def.hirarki];
  if (induk === null) return;
  if (id !== null) {
    if (String(induk) === String(id)) throw new GalatBisnis('Departemen induk tidak boleh dirinya sendiri.');
    const { rowCount } = await exec.query(
      `WITH RECURSIVE turunan AS (
         SELECT id FROM ${def.tabel} WHERE ${def.hirarki} = $1 AND deleted_at IS NULL
         UNION
         SELECT d.id FROM ${def.tabel} d JOIN turunan t ON d.${def.hirarki} = t.id WHERE d.deleted_at IS NULL
       ) SELECT 1 FROM turunan WHERE id = $2`, [id, induk]);
    if (rowCount) throw new GalatBisnis('Departemen induk tidak boleh berupa sub-departemennya sendiri.');
  }
  if (nilai.perusahaan_id) {
    const { rows } = await exec.query(`SELECT perusahaan_id FROM ${def.tabel} WHERE id = $1`, [induk]);
    if (rows[0] && String(rows[0].perusahaan_id) !== String(nilai.perusahaan_id)) {
      throw new GalatBisnis('Departemen induk harus berada di perusahaan yang sama.');
    }
  }
}

function terjemahkanGalatDb(err, def) {
  if (err.code === '23505') return new GalatBisnis(def.unik || 'Data sudah ada.', 409);
  return err;
}

// id null = buat baru. Mengembalikan id.
async function simpan(kunci, input, pengguna, id = null) {
  const def = ambilDef(kunci);
  const { nilai, galat } = bersihkan(def.fields, input);
  if (galat.length) throw new GalatBisnis(galat.join(' '));
  const nama = def.fields.map((f) => f.nama);

  try {
    return await db.transaksi(async (c) => {
      await pastikanRujukanAda(c, def, nilai);
      if (def.hirarki) await periksaHirarki(c, def, id, nilai);

      if (id === null) {
        const { rows } = await c.query(
          `INSERT INTO ${def.tabel} (${nama.join(', ')}) VALUES (${nama.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
          nama.map((n) => nilai[n]));
        await audit.catat({ penggunaId: pengguna.id, aksi: 'buat', entitas: `organisasi.${kunci}`, entitasId: rows[0].id, sesudah: nilai }, c);
        return rows[0].id;
      }
      const { rows: lama } = await c.query(
        `SELECT ${nama.join(', ')} FROM ${def.tabel} WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
      if (!lama[0]) throw new GalatBisnis('Data tidak ditemukan.', 404);
      await c.query(
        `UPDATE ${def.tabel} SET ${nama.map((n, i) => `${n} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${nama.length + 1}`,
        [...nama.map((n) => nilai[n]), id]);
      await audit.catat({ penggunaId: pengguna.id, aksi: 'ubah', entitas: `organisasi.${kunci}`, entitasId: id, sebelum: lama[0], sesudah: nilai }, c);
      return id;
    });
  } catch (err) {
    throw terjemahkanGalatDb(err, def);
  }
}

async function hapus(kunci, id, pengguna) {
  const def = ambilDef(kunci);
  await db.transaksi(async (c) => {
    const { rows } = await c.query(`SELECT * FROM ${def.tabel} WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
    if (!rows[0]) throw new GalatBisnis('Data tidak ditemukan.', 404);
    for (const p of def.dipakai) {
      const { rowCount } = await c.query(`SELECT 1 FROM ${p.tabel} WHERE ${p.kolom} = $1 AND deleted_at IS NULL LIMIT 1`, [id]);
      if (rowCount) throw new GalatBisnis(`${def.judul} tidak bisa dihapus karena ${p.pesan}.`, 409);
    }
    await c.query(`UPDATE ${def.tabel} SET deleted_at = now(), updated_at = now() WHERE id = $1`, [id]);
    await audit.catat({ penggunaId: pengguna.id, aksi: 'hapus', entitas: `organisasi.${kunci}`, entitasId: id, sebelum: rows[0] }, c);
  });
}

module.exports = { daftar, ambil, opsiForm, simpan, hapus, ambilDef };
