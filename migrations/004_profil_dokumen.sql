-- Keluarga, pendidikan, dan dokumen karyawan (berkas disimpan di uploads/, DB hanya menyimpan path).

CREATE TABLE keluarga (
  id             BIGSERIAL PRIMARY KEY,
  karyawan_id    BIGINT NOT NULL REFERENCES karyawan(id),
  nama           TEXT NOT NULL,
  hubungan       TEXT NOT NULL CHECK (hubungan IN ('pasangan', 'anak', 'ayah', 'ibu', 'saudara', 'lainnya')),
  tanggal_lahir  DATE,
  pekerjaan      TEXT,
  telepon        TEXT,
  tanggungan     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX keluarga_karyawan_idx ON keluarga (karyawan_id) WHERE deleted_at IS NULL;

CREATE TABLE pendidikan (
  id           BIGSERIAL PRIMARY KEY,
  karyawan_id  BIGINT NOT NULL REFERENCES karyawan(id),
  jenjang      TEXT NOT NULL CHECK (jenjang IN ('SD', 'SMP', 'SMA/SMK', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3')),
  institusi    TEXT NOT NULL,
  jurusan      TEXT,
  tahun_masuk  INTEGER,
  tahun_lulus  INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  CONSTRAINT pendidikan_tahun_ck CHECK (tahun_masuk IS NULL OR tahun_lulus IS NULL OR tahun_lulus >= tahun_masuk)
);
CREATE INDEX pendidikan_karyawan_idx ON pendidikan (karyawan_id) WHERE deleted_at IS NULL;

CREATE TABLE dokumen_karyawan (
  id            BIGSERIAL PRIMARY KEY,
  karyawan_id   BIGINT NOT NULL REFERENCES karyawan(id),
  jenis         TEXT NOT NULL CHECK (jenis IN ('ktp', 'kk', 'npwp', 'ijazah', 'kontrak', 'lainnya')),
  nama_asli     TEXT NOT NULL,
  path          TEXT NOT NULL UNIQUE,      -- relatif terhadap folder uploads/
  tipe_mime     TEXT NOT NULL,
  ukuran        INTEGER NOT NULL CHECK (ukuran > 0),
  diunggah_oleh BIGINT REFERENCES pengguna(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX dokumen_karyawan_idx ON dokumen_karyawan (karyawan_id) WHERE deleted_at IS NULL;
