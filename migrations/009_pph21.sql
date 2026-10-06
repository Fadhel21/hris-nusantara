-- PPh 21 (TER bulanan + penyesuaian masa pajak terakhir). Tidak ada tarif/PTKP bawaan: seluruh tabel
-- diisi pemilik lewat impor CSV. PPh 21 baru dihitung mulai periode yang ditetapkan (pph21_mulai); kosong = belum aktif.

ALTER TABLE komponen_gaji ADD COLUMN kena_pajak BOOLEAN NOT NULL DEFAULT TRUE;   -- tunjangan masuk penghasilan bruto pajak

ALTER TABLE tarif_bpjs
  ADD COLUMN perusahaan_kena_pajak BOOLEAN NOT NULL DEFAULT FALSE,               -- bagian perusahaan = penghasilan bruto pajak
  ADD COLUMN iuran_karyawan_pengurang_pajak BOOLEAN NOT NULL DEFAULT FALSE;      -- iuran karyawan = pengurang penghasilan

ALTER TABLE parameter_gaji DROP CONSTRAINT parameter_gaji_kunci_check;
ALTER TABLE parameter_gaji ADD CONSTRAINT parameter_gaji_kunci_check CHECK (kunci IN (
  'potongan_keterlambatan_per_menit', 'pembagi_upah_jam_lembur', 'lembur_maks_menit_per_hari',
  'biaya_jabatan_persen', 'biaya_jabatan_maks_per_bulan', 'pembulatan_pkp', 'pengali_tanpa_npwp'));

-- Data pajak per slip, dipakai menghitung masa pajak terakhir (YTD).
ALTER TABLE slip_gaji
  ADD COLUMN bruto_pajak NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN iuran_pengurang_pajak NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN pph21 NUMERIC(15,2) NOT NULL DEFAULT 0,                              -- boleh negatif (kelebihan potong)
  ADD COLUMN metode_pajak TEXT CHECK (metode_pajak IN ('TER', 'MASA_AKHIR'));     -- NULL = PPh 21 belum dihitung pada slip ini

-- PTKP per status dan kategori TER-nya.
CREATE TABLE ptkp_status (
  id               BIGSERIAL PRIMARY KEY,
  kode             TEXT NOT NULL,
  ptkp_tahunan     NUMERIC(15,2) NOT NULL CHECK (ptkp_tahunan >= 0),
  kategori_ter     TEXT NOT NULL CHECK (kategori_ter IN ('A', 'B', 'C')),
  tanggal_berlaku  DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX ptkp_status_uq ON ptkp_status (upper(kode), tanggal_berlaku) WHERE deleted_at IS NULL;

CREATE TABLE tarif_ter (
  id               BIGSERIAL PRIMARY KEY,
  kategori         TEXT NOT NULL CHECK (kategori IN ('A', 'B', 'C')),
  batas_bawah      NUMERIC(15,2) NOT NULL CHECK (batas_bawah >= 0),
  batas_atas       NUMERIC(15,2),
  tarif            NUMERIC(7,4) NOT NULL CHECK (tarif BETWEEN 0 AND 100),         -- persen
  tanggal_berlaku  DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT tarif_ter_rentang_ck CHECK (batas_atas IS NULL OR batas_atas >= batas_bawah)
);
CREATE UNIQUE INDEX tarif_ter_uq ON tarif_ter (kategori, batas_bawah, tanggal_berlaku) WHERE deleted_at IS NULL;

CREATE TABLE lapisan_pph21 (
  id               BIGSERIAL PRIMARY KEY,
  batas_bawah      NUMERIC(15,2) NOT NULL CHECK (batas_bawah >= 0),
  batas_atas       NUMERIC(15,2),
  tarif            NUMERIC(7,4) NOT NULL CHECK (tarif BETWEEN 0 AND 100),
  tanggal_berlaku  DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT lapisan_rentang_ck CHECK (batas_atas IS NULL OR batas_atas > batas_bawah)
);
CREATE UNIQUE INDEX lapisan_pph21_uq ON lapisan_pph21 (batas_bawah, tanggal_berlaku) WHERE deleted_at IS NULL;

-- Status pajak karyawan bertanggal berlaku (kode mengacu ke ptkp_status.kode).
CREATE TABLE riwayat_status_pajak (
  id               BIGSERIAL PRIMARY KEY,
  karyawan_id      BIGINT NOT NULL REFERENCES karyawan(id),
  kode_status      TEXT NOT NULL,
  tanggal_berlaku  DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX status_pajak_uq ON riwayat_status_pajak (karyawan_id, tanggal_berlaku) WHERE deleted_at IS NULL;

-- Saldo awal pajak untuk bulan-bulan sebelum PPh 21 dihitung di sistem ini (YTD hingga bulan `sampai_bulan`).
CREATE TABLE saldo_awal_pajak (
  id                      BIGSERIAL PRIMARY KEY,
  karyawan_id             BIGINT NOT NULL REFERENCES karyawan(id),
  tahun                   INTEGER NOT NULL CHECK (tahun BETWEEN 2000 AND 2100),
  sampai_bulan            INTEGER NOT NULL CHECK (sampai_bulan BETWEEN 1 AND 11),
  bruto_ytd               NUMERIC(15,2) NOT NULL CHECK (bruto_ytd >= 0),
  iuran_pengurang_ytd     NUMERIC(15,2) NOT NULL CHECK (iuran_pengurang_ytd >= 0),
  pph21_ytd               NUMERIC(15,2) NOT NULL CHECK (pph21_ytd >= 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ
);
CREATE UNIQUE INDEX saldo_awal_pajak_uq ON saldo_awal_pajak (karyawan_id, tahun) WHERE deleted_at IS NULL;

-- Periode (YYYY-MM) pertama yang dihitung PPh 21-nya. Kosong = belum aktif.
INSERT INTO pengaturan_sistem (kunci, nilai) VALUES ('pph21_mulai', '');
