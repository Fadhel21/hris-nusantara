-- Karyawan dan riwayat bertanggal (penempatan, gaji, kontrak).

-- Penghitung nomor induk per tahun masuk (format TAHUN-0001).
CREATE TABLE urutan_nomor_induk (
  id          BIGSERIAL PRIMARY KEY,
  tahun       INTEGER NOT NULL UNIQUE,
  terakhir    INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE karyawan (
  id              BIGSERIAL PRIMARY KEY,
  nomor_induk     TEXT NOT NULL UNIQUE,
  nama            TEXT NOT NULL,
  nik             TEXT,                -- sensitif
  npwp            TEXT,                -- sensitif
  tanggal_lahir   DATE,
  jenis_kelamin   TEXT CHECK (jenis_kelamin IN ('L', 'P')),
  alamat          TEXT,
  telepon         TEXT,
  email           TEXT,
  bank            TEXT,
  nomor_rekening  TEXT,                -- sensitif
  tanggal_masuk   DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'keluar')),
  tanggal_keluar  DATE,
  alasan_keluar   TEXT,
  foto_path       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT karyawan_keluar_ck CHECK (
    (status = 'aktif' AND tanggal_keluar IS NULL) OR (status = 'keluar' AND tanggal_keluar IS NOT NULL)
  ),
  CONSTRAINT karyawan_tgl_keluar_ck CHECK (tanggal_keluar IS NULL OR tanggal_keluar >= tanggal_masuk)
);
CREATE UNIQUE INDEX karyawan_nik_uq ON karyawan (nik) WHERE deleted_at IS NULL AND nik IS NOT NULL;
CREATE INDEX karyawan_nama_idx ON karyawan (lower(nama));

-- Riwayat penempatan: yang berlaku adalah baris dengan tanggal_berlaku terbaru <= tanggal acuan.
CREATE TABLE riwayat_penempatan (
  id               BIGSERIAL PRIMARY KEY,
  karyawan_id      BIGINT NOT NULL REFERENCES karyawan(id),
  tanggal_berlaku  DATE NOT NULL,
  cabang_id        BIGINT NOT NULL REFERENCES cabang(id),
  departemen_id    BIGINT NOT NULL REFERENCES departemen(id),
  jabatan_id       BIGINT NOT NULL REFERENCES jabatan(id),
  golongan_id      BIGINT REFERENCES golongan(id),
  atasan_id        BIGINT REFERENCES karyawan(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT penempatan_bukan_diri_ck CHECK (atasan_id IS NULL OR atasan_id <> karyawan_id)
);
CREATE UNIQUE INDEX penempatan_tgl_uq ON riwayat_penempatan (karyawan_id, tanggal_berlaku) WHERE deleted_at IS NULL;
CREATE INDEX penempatan_atasan_idx ON riwayat_penempatan (atasan_id) WHERE deleted_at IS NULL;

CREATE TABLE riwayat_gaji (
  id               BIGSERIAL PRIMARY KEY,
  karyawan_id      BIGINT NOT NULL REFERENCES karyawan(id),
  tanggal_berlaku  DATE NOT NULL,
  gaji_pokok       NUMERIC(15,2) NOT NULL CHECK (gaji_pokok >= 0),
  alasan           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX gaji_tgl_uq ON riwayat_gaji (karyawan_id, tanggal_berlaku) WHERE deleted_at IS NULL;

CREATE TABLE riwayat_kontrak (
  id               BIGSERIAL PRIMARY KEY,
  karyawan_id      BIGINT NOT NULL REFERENCES karyawan(id),
  jenis            TEXT NOT NULL CHECK (jenis IN ('PKWT', 'PKWTT', 'magang')),
  tanggal_mulai    DATE NOT NULL,
  tanggal_akhir    DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT kontrak_tgl_ck CHECK (tanggal_akhir IS NULL OR tanggal_akhir >= tanggal_mulai),
  CONSTRAINT kontrak_jenis_ck CHECK ((jenis = 'PKWTT') = (tanggal_akhir IS NULL))
);
CREATE UNIQUE INDEX kontrak_tgl_uq ON riwayat_kontrak (karyawan_id, tanggal_mulai) WHERE deleted_at IS NULL;

-- Satu akun login per karyawan.
ALTER TABLE pengguna ADD CONSTRAINT pengguna_karyawan_fk FOREIGN KEY (karyawan_id) REFERENCES karyawan(id);
CREATE UNIQUE INDEX pengguna_karyawan_uq ON pengguna (karyawan_id) WHERE deleted_at IS NULL AND karyawan_id IS NOT NULL;
