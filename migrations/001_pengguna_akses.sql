-- Pengguna, peran, dan jejak audit.

CREATE TABLE peran (
  id          BIGSERIAL PRIMARY KEY,
  kode        TEXT NOT NULL UNIQUE,
  nama        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

INSERT INTO peran (kode, nama) VALUES
  ('admin', 'Administrator'),
  ('hr', 'HR'),
  ('atasan', 'Atasan'),
  ('karyawan', 'Karyawan');

CREATE TABLE pengguna (
  id                BIGSERIAL PRIMARY KEY,
  username          TEXT NOT NULL,
  email             TEXT,
  password_hash     TEXT NOT NULL,
  peran_id          BIGINT NOT NULL REFERENCES peran(id),
  karyawan_id       BIGINT,            -- FK ditambahkan saat tabel karyawan dibuat
  aktif             BOOLEAN NOT NULL DEFAULT TRUE,
  percobaan_gagal   INTEGER NOT NULL DEFAULT 0,
  terkunci_sampai   TIMESTAMPTZ,
  login_terakhir    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE UNIQUE INDEX pengguna_username_uq ON pengguna (lower(username)) WHERE deleted_at IS NULL;

CREATE TABLE audit_log (
  id           BIGSERIAL PRIMARY KEY,
  pengguna_id  BIGINT REFERENCES pengguna(id),
  aksi         TEXT NOT NULL,
  entitas      TEXT NOT NULL,
  entitas_id   TEXT,
  sebelum      JSONB,
  sesudah      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX audit_log_entitas_idx ON audit_log (entitas, entitas_id);
CREATE INDEX audit_log_created_idx ON audit_log (created_at);
