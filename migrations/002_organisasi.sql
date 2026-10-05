-- Struktur organisasi: perusahaan, cabang, departemen, jabatan, golongan.

CREATE TABLE perusahaan (
  id          BIGSERIAL PRIMARY KEY,
  nama        TEXT NOT NULL,
  alamat      TEXT,
  telepon     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE cabang (
  id             BIGSERIAL PRIMARY KEY,
  perusahaan_id  BIGINT NOT NULL REFERENCES perusahaan(id),
  kode           TEXT NOT NULL,
  nama           TEXT NOT NULL,
  alamat         TEXT,
  -- Zona waktu dipakai absensi: WIB, WITA, atau WIT.
  zona_waktu     TEXT NOT NULL DEFAULT 'Asia/Jakarta'
                 CHECK (zona_waktu IN ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE UNIQUE INDEX cabang_kode_uq ON cabang (perusahaan_id, lower(kode)) WHERE deleted_at IS NULL;

CREATE TABLE departemen (
  id             BIGSERIAL PRIMARY KEY,
  perusahaan_id  BIGINT NOT NULL REFERENCES perusahaan(id),
  induk_id       BIGINT REFERENCES departemen(id),
  kode           TEXT NOT NULL,
  nama           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE UNIQUE INDEX departemen_kode_uq ON departemen (perusahaan_id, lower(kode)) WHERE deleted_at IS NULL;

CREATE TABLE jabatan (
  id             BIGSERIAL PRIMARY KEY,
  departemen_id  BIGINT REFERENCES departemen(id),
  kode           TEXT NOT NULL,
  nama           TEXT NOT NULL,
  level          INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE UNIQUE INDEX jabatan_kode_uq ON jabatan (lower(kode)) WHERE deleted_at IS NULL;

CREATE TABLE golongan (
  id          BIGSERIAL PRIMARY KEY,
  kode        TEXT NOT NULL,
  nama        TEXT NOT NULL,
  urutan      INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX golongan_kode_uq ON golongan (lower(kode)) WHERE deleted_at IS NULL;
