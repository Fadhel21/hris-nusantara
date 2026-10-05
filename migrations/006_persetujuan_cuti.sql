-- Mesin persetujuan, cuti (saldo berbasis mutasi), izin, dan koreksi absensi.

-- Master jenis cuti. Jumlah jatah diisi HR; tidak ada angka bawaan.
CREATE TABLE jenis_cuti (
  id            BIGSERIAL PRIMARY KEY,
  kode          TEXT NOT NULL,
  nama          TEXT NOT NULL,
  jatah_hari    INTEGER NOT NULL DEFAULT 0 CHECK (jatah_hari BETWEEN 0 AND 365),
  potong_saldo  BOOLEAN NOT NULL DEFAULT TRUE,   -- FALSE: dicatat saja, tidak memakai saldo
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX jenis_cuti_kode_uq ON jenis_cuti (lower(kode)) WHERE deleted_at IS NULL;

-- Kepala pengajuan (generik; detail per jenis ada di tabel pengajuan_*).
CREATE TABLE pengajuan (
  id               BIGSERIAL PRIMARY KEY,
  jenis            TEXT NOT NULL CHECK (jenis IN ('cuti', 'izin', 'koreksi_absensi', 'lembur', 'klaim', 'pinjaman')),
  karyawan_id      BIGINT NOT NULL REFERENCES karyawan(id),
  status           TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'disetujui', 'ditolak', 'dibatalkan')),
  alasan           TEXT,
  diajukan_oleh    BIGINT REFERENCES pengguna(id),
  diputuskan_pada  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX pengajuan_karyawan_idx ON pengajuan (karyawan_id, created_at DESC);
CREATE INDEX pengajuan_status_idx ON pengajuan (status) WHERE status = 'menunggu';

-- Langkah persetujuan (ditetapkan saat pengajuan dibuat sehingga perubahan pengaturan tidak memengaruhi yang berjalan).
CREATE TABLE pengajuan_langkah (
  id                   BIGSERIAL PRIMARY KEY,
  pengajuan_id         BIGINT NOT NULL REFERENCES pengajuan(id),
  urutan               INTEGER NOT NULL,
  peran                TEXT NOT NULL CHECK (peran IN ('atasan', 'hr')),
  pemutus_karyawan_id  BIGINT REFERENCES karyawan(id),
  status               TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'disetujui', 'ditolak')),
  diputuskan_oleh      BIGINT REFERENCES pengguna(id),
  diputuskan_pada      TIMESTAMPTZ,
  catatan              TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ,
  CONSTRAINT langkah_atasan_ck CHECK (peran <> 'atasan' OR pemutus_karyawan_id IS NOT NULL),
  CONSTRAINT langkah_putusan_ck CHECK (status = 'menunggu' OR (diputuskan_oleh IS NOT NULL AND diputuskan_pada IS NOT NULL))
);
CREATE UNIQUE INDEX langkah_urutan_uq ON pengajuan_langkah (pengajuan_id, urutan);

CREATE TABLE pengajuan_cuti (
  id             BIGSERIAL PRIMARY KEY,
  pengajuan_id   BIGINT NOT NULL UNIQUE REFERENCES pengajuan(id),
  jenis_cuti_id  BIGINT NOT NULL REFERENCES jenis_cuti(id),
  tanggal_mulai  DATE NOT NULL,
  tanggal_akhir  DATE NOT NULL,
  jumlah_hari    INTEGER NOT NULL CHECK (jumlah_hari > 0),   -- hari kerja non-libur saat diajukan
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT cuti_tgl_ck CHECK (tanggal_akhir >= tanggal_mulai)
);

CREATE TABLE pengajuan_izin (
  id             BIGSERIAL PRIMARY KEY,
  pengajuan_id   BIGINT NOT NULL UNIQUE REFERENCES pengajuan(id),
  kategori       TEXT NOT NULL CHECK (kategori IN ('sakit', 'keperluan_pribadi', 'lainnya')),
  tanggal_mulai  DATE NOT NULL,
  tanggal_akhir  DATE NOT NULL,
  jumlah_hari    INTEGER NOT NULL CHECK (jumlah_hari > 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT izin_tgl_ck CHECK (tanggal_akhir >= tanggal_mulai)
);

-- Hari kerja yang dicakup cuti/izin. Indeks unik mencegah dua pengajuan aktif pada hari yang sama.
-- Baris dilepas (soft delete) bila pengajuan ditolak/dibatalkan.
CREATE TABLE ketidakhadiran_hari (
  id            BIGSERIAL PRIMARY KEY,
  pengajuan_id  BIGINT NOT NULL REFERENCES pengajuan(id),
  karyawan_id   BIGINT NOT NULL REFERENCES karyawan(id),
  tanggal       DATE NOT NULL,
  jenis         TEXT NOT NULL CHECK (jenis IN ('cuti', 'izin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX ketidakhadiran_uq ON ketidakhadiran_hari (karyawan_id, tanggal) WHERE deleted_at IS NULL;
CREATE INDEX ketidakhadiran_pengajuan_idx ON ketidakhadiran_hari (pengajuan_id);

CREATE TABLE pengajuan_koreksi (
  id            BIGSERIAL PRIMARY KEY,
  pengajuan_id  BIGINT NOT NULL UNIQUE REFERENCES pengajuan(id),
  tanggal       DATE NOT NULL,
  jam_masuk     TIME,
  jam_pulang    TIME,
  zona_waktu    TEXT NOT NULL CHECK (zona_waktu IN ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT koreksi_isi_ck CHECK (jam_masuk IS NOT NULL OR jam_pulang IS NOT NULL),
  CONSTRAINT koreksi_urut_ck CHECK (jam_masuk IS NULL OR jam_pulang IS NULL OR jam_pulang > jam_masuk)
);

-- Koreksi absensi yang sudah disetujui. Catatan mentah (absensi_catat) tidak diubah; rekap memakai
-- nilai koreksi bila ada. Koreksi baru pada tanggal yang sama menggantikan yang lama (soft delete).
CREATE TABLE absensi_koreksi (
  id            BIGSERIAL PRIMARY KEY,
  karyawan_id   BIGINT NOT NULL REFERENCES karyawan(id),
  tanggal       DATE NOT NULL,
  waktu_masuk   TIMESTAMPTZ,
  waktu_pulang  TIMESTAMPTZ,
  zona_waktu    TEXT NOT NULL CHECK (zona_waktu IN ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
  pengajuan_id  BIGINT NOT NULL REFERENCES pengajuan(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT absensi_koreksi_isi_ck CHECK (waktu_masuk IS NOT NULL OR waktu_pulang IS NOT NULL)
);
CREATE UNIQUE INDEX absensi_koreksi_uq ON absensi_koreksi (karyawan_id, tanggal) WHERE deleted_at IS NULL;

-- Saldo cuti hanya berubah lewat mutasi (saldo = jumlah seluruh mutasi per karyawan/jenis/tahun).
CREATE TABLE saldo_cuti_mutasi (
  id             BIGSERIAL PRIMARY KEY,
  karyawan_id    BIGINT NOT NULL REFERENCES karyawan(id),
  jenis_cuti_id  BIGINT NOT NULL REFERENCES jenis_cuti(id),
  tahun          INTEGER NOT NULL,
  jenis_mutasi   TEXT NOT NULL CHECK (jenis_mutasi IN ('jatah', 'pakai', 'batal', 'hangus', 'bawaan')),
  jumlah         INTEGER NOT NULL,
  tanggal        DATE NOT NULL,
  keterangan     TEXT,
  pengajuan_id   BIGINT REFERENCES pengajuan(id),
  dibuat_oleh    BIGINT REFERENCES pengguna(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT mutasi_tanda_ck CHECK (
    (jenis_mutasi IN ('jatah', 'batal', 'bawaan') AND jumlah > 0) OR (jenis_mutasi IN ('pakai', 'hangus') AND jumlah < 0))
);
CREATE INDEX mutasi_saldo_idx ON saldo_cuti_mutasi (karyawan_id, jenis_cuti_id, tahun);
CREATE UNIQUE INDEX mutasi_jatah_uq ON saldo_cuti_mutasi (karyawan_id, jenis_cuti_id, tahun) WHERE jenis_mutasi = 'jatah';
CREATE UNIQUE INDEX mutasi_hangus_uq ON saldo_cuti_mutasi (karyawan_id, jenis_cuti_id, tahun) WHERE jenis_mutasi = 'hangus';
CREATE UNIQUE INDEX mutasi_pakai_uq ON saldo_cuti_mutasi (pengajuan_id, tahun) WHERE jenis_mutasi = 'pakai';
CREATE UNIQUE INDEX mutasi_batal_uq ON saldo_cuti_mutasi (pengajuan_id, tahun) WHERE jenis_mutasi = 'batal';

CREATE FUNCTION mutasi_cuti_tolak_ubah() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Mutasi saldo cuti tidak boleh diubah atau dihapus; koreksi dengan mutasi baru.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mutasi_cuti_jaga BEFORE UPDATE OR DELETE ON saldo_cuti_mutasi
  FOR EACH ROW EXECUTE FUNCTION mutasi_cuti_tolak_ubah();

-- Alur persetujuan: atasan_fallback_hr (atasan langsung, HR bila atasan kosong), atasan_lalu_hr, hr_saja.
INSERT INTO pengaturan_sistem (kunci, nilai) VALUES ('alur_persetujuan', 'atasan_fallback_hr');
