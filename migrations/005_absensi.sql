-- Absensi: jadwal kerja (bertanggal berlaku), hari libur, pengaturan sistem, dan catatan absensi.

CREATE TABLE jadwal_kerja (
  id               BIGSERIAL PRIMARY KEY,
  tanggal_berlaku  DATE NOT NULL,
  jam_masuk        TIME NOT NULL,
  jam_pulang       TIME NOT NULL,
  toleransi_menit  INTEGER NOT NULL DEFAULT 0 CHECK (toleransi_menit BETWEEN 0 AND 240),
  hari_kerja       SMALLINT[] NOT NULL,       -- ISO: 1 = Senin ... 7 = Minggu
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT jadwal_jam_ck CHECK (jam_pulang > jam_masuk),
  CONSTRAINT jadwal_hari_ck CHECK (cardinality(hari_kerja) > 0 AND hari_kerja <@ ARRAY[1,2,3,4,5,6,7]::smallint[])
);
CREATE UNIQUE INDEX jadwal_tgl_uq ON jadwal_kerja (tanggal_berlaku) WHERE deleted_at IS NULL;

-- Jadwal awal: 08:00-17:00, toleransi 0 menit (keputusan pemilik). Hari kerja Senin-Jumat adalah
-- nilai awal yang dapat diubah HR dengan menambah jadwal baru.
INSERT INTO jadwal_kerja (tanggal_berlaku, jam_masuk, jam_pulang, toleransi_menit, hari_kerja)
VALUES ('2000-01-01', '08:00', '17:00', 0, ARRAY[1,2,3,4,5]::smallint[]);

CREATE TABLE hari_libur (
  id          BIGSERIAL PRIMARY KEY,
  tanggal     DATE NOT NULL,
  keterangan  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX hari_libur_tgl_uq ON hari_libur (tanggal) WHERE deleted_at IS NULL;

CREATE TABLE pengaturan_sistem (
  id          BIGSERIAL PRIMARY KEY,
  kunci       TEXT NOT NULL UNIQUE,
  nilai       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
-- Masa simpan foto absensi: 3 bulan (keputusan pemilik).
INSERT INTO pengaturan_sistem (kunci, nilai) VALUES ('retensi_foto_absensi_bulan', '3');

-- Catatan mentah absensi: hanya ditambah, tidak diedit. Koreksi lewat pengajuan yang disetujui.
CREATE TABLE absensi_catat (
  id           BIGSERIAL PRIMARY KEY,
  karyawan_id  BIGINT NOT NULL REFERENCES karyawan(id),
  tanggal      DATE NOT NULL,                 -- tanggal lokal menurut zona cabang saat absen
  jenis        TEXT NOT NULL CHECK (jenis IN ('masuk', 'pulang')),
  waktu        TIMESTAMPTZ NOT NULL DEFAULT now(),   -- jam server, bukan jam perangkat
  zona_waktu   TEXT NOT NULL CHECK (zona_waktu IN ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
  foto_path    TEXT,                          -- dikosongkan worker setelah masa simpan
  latitude     NUMERIC(9,6) CHECK (latitude BETWEEN -90 AND 90),
  longitude    NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
  akurasi_m    INTEGER CHECK (akurasi_m >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX absensi_catat_uq ON absensi_catat (karyawan_id, tanggal, jenis) WHERE deleted_at IS NULL;
CREATE INDEX absensi_catat_tgl_idx ON absensi_catat (tanggal);
CREATE INDEX absensi_catat_foto_idx ON absensi_catat (waktu) WHERE foto_path IS NOT NULL;

-- Penjaga di level database: hanya foto_path (dikosongkan) dan updated_at yang boleh berubah.
CREATE FUNCTION absensi_catat_tolak_ubah() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Catatan absensi tidak boleh dihapus.';
  END IF;
  IF NEW.karyawan_id IS DISTINCT FROM OLD.karyawan_id OR NEW.tanggal IS DISTINCT FROM OLD.tanggal
     OR NEW.jenis IS DISTINCT FROM OLD.jenis OR NEW.waktu IS DISTINCT FROM OLD.waktu
     OR NEW.zona_waktu IS DISTINCT FROM OLD.zona_waktu OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude OR NEW.akurasi_m IS DISTINCT FROM OLD.akurasi_m
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR (NEW.foto_path IS NOT NULL AND NEW.foto_path IS DISTINCT FROM OLD.foto_path) THEN
    RAISE EXCEPTION 'Catatan absensi tidak boleh diubah.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER absensi_catat_jaga BEFORE UPDATE OR DELETE ON absensi_catat
  FOR EACH ROW EXECUTE FUNCTION absensi_catat_tolak_ubah();
