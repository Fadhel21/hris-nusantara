-- Lembur: pengajuan (lewat mesin persetujuan), aturan pengali bertanggal berlaku, dan parameter pendukung.
-- Tidak ada aturan bawaan di migrasi: pemilik mengisinya lewat layar (atau menerapkan preset Kepmenaker 102/2004 secara eksplisit).

ALTER TABLE komponen_gaji ADD COLUMN masuk_dasar_lembur BOOLEAN NOT NULL DEFAULT FALSE;  -- tunjangan tetap yang masuk upah sebulan

ALTER TABLE parameter_gaji DROP CONSTRAINT parameter_gaji_kunci_check;
ALTER TABLE parameter_gaji ADD CONSTRAINT parameter_gaji_kunci_check CHECK (kunci IN (
  'potongan_keterlambatan_per_menit', 'pembagi_upah_jam_lembur', 'lembur_maks_menit_per_hari'));

-- Pengali per tahap menit lembur untuk tiap tipe hari. Tahap harus mulai dari 0, bersambung, dan berakhir terbuka (sampai NULL).
CREATE TABLE aturan_lembur (
  id               BIGSERIAL PRIMARY KEY,
  tipe_hari        TEXT NOT NULL CHECK (tipe_hari IN ('hari_kerja', 'libur_5hari', 'libur_6hari')),
  menit_dari       INTEGER NOT NULL CHECK (menit_dari >= 0),
  menit_sampai     INTEGER,
  pengali          NUMERIC(5,2) NOT NULL CHECK (pengali > 0 AND pengali <= 20),
  tanggal_berlaku  DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT aturan_lembur_rentang_ck CHECK (menit_sampai IS NULL OR menit_sampai > menit_dari)
);
CREATE UNIQUE INDEX aturan_lembur_uq ON aturan_lembur (tipe_hari, menit_dari, tanggal_berlaku) WHERE deleted_at IS NULL;

CREATE TABLE pengajuan_lembur (
  id            BIGSERIAL PRIMARY KEY,
  pengajuan_id  BIGINT NOT NULL UNIQUE REFERENCES pengajuan(id),
  tanggal       DATE NOT NULL,
  jam_mulai     TIME NOT NULL,
  jam_selesai   TIME NOT NULL,
  menit         INTEGER NOT NULL CHECK (menit > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT lembur_jam_ck CHECK (jam_selesai > jam_mulai)
);
CREATE INDEX pengajuan_lembur_tgl_idx ON pengajuan_lembur (tanggal);
