-- Penggajian (inti): komponen gaji, tarif BPJS, parameter, periode, slip. PPh 21 dan lembur menyusul.
-- Tidak ada tarif/angka bawaan: seluruh tarif diisi pemilik lewat layar dengan tanggal berlaku.

CREATE TABLE komponen_gaji (
  id                 BIGSERIAL PRIMARY KEY,
  kode               TEXT NOT NULL,
  nama               TEXT NOT NULL,
  jenis              TEXT NOT NULL CHECK (jenis IN ('tunjangan', 'potongan')),
  masuk_dasar_bpjs   BOOLEAN NOT NULL DEFAULT FALSE,   -- hanya bermakna untuk tunjangan
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);
CREATE UNIQUE INDEX komponen_gaji_kode_uq ON komponen_gaji (lower(kode)) WHERE deleted_at IS NULL;

-- Nominal komponen per karyawan, bertanggal berlaku (nominal 0 = komponen dihentikan).
CREATE TABLE riwayat_komponen_karyawan (
  id               BIGSERIAL PRIMARY KEY,
  karyawan_id      BIGINT NOT NULL REFERENCES karyawan(id),
  komponen_id      BIGINT NOT NULL REFERENCES komponen_gaji(id),
  tanggal_berlaku  DATE NOT NULL,
  nominal          NUMERIC(15,2) NOT NULL CHECK (nominal >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX riwayat_komponen_uq ON riwayat_komponen_karyawan (karyawan_id, komponen_id, tanggal_berlaku) WHERE deleted_at IS NULL;

CREATE TABLE tarif_bpjs (
  id                BIGSERIAL PRIMARY KEY,
  program           TEXT NOT NULL CHECK (program IN ('kesehatan', 'jht', 'jp', 'jkk', 'jkm')),
  tarif_karyawan    NUMERIC(7,4) NOT NULL CHECK (tarif_karyawan BETWEEN 0 AND 100),   -- persen
  tarif_perusahaan  NUMERIC(7,4) NOT NULL CHECK (tarif_perusahaan BETWEEN 0 AND 100),
  batas_upah_atas   NUMERIC(15,2) CHECK (batas_upah_atas IS NULL OR batas_upah_atas > 0),
  tanggal_berlaku   DATE NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE UNIQUE INDEX tarif_bpjs_uq ON tarif_bpjs (program, tanggal_berlaku) WHERE deleted_at IS NULL;

CREATE TABLE parameter_gaji (
  id               BIGSERIAL PRIMARY KEY,
  kunci            TEXT NOT NULL CHECK (kunci IN ('potongan_keterlambatan_per_menit')),
  nilai            NUMERIC(15,2) NOT NULL CHECK (nilai >= 0),
  tanggal_berlaku  DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX parameter_gaji_uq ON parameter_gaji (kunci, tanggal_berlaku) WHERE deleted_at IS NULL;

-- Program BPJS yang diikuti tiap karyawan.
CREATE TABLE kepesertaan_bpjs (
  id           BIGSERIAL PRIMARY KEY,
  karyawan_id  BIGINT NOT NULL REFERENCES karyawan(id),
  program      TEXT NOT NULL CHECK (program IN ('kesehatan', 'jht', 'jp', 'jkk', 'jkm')),
  aktif        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX kepesertaan_bpjs_uq ON kepesertaan_bpjs (karyawan_id, program) WHERE deleted_at IS NULL;

CREATE TABLE periode_gaji (
  id                   BIGSERIAL PRIMARY KEY,
  tahun                INTEGER NOT NULL CHECK (tahun BETWEEN 2000 AND 2100),
  bulan                INTEGER NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  tanggal_awal         DATE NOT NULL,
  tanggal_akhir        DATE NOT NULL,
  status               TEXT NOT NULL DEFAULT 'terbuka' CHECK (status IN ('terbuka', 'terkunci')),
  dikunci_oleh         BIGINT REFERENCES pengguna(id),
  dikunci_pada         TIMESTAMPTZ,
  minta_buka_oleh      BIGINT REFERENCES pengguna(id),
  minta_buka_pada      TIMESTAMPTZ,
  minta_buka_alasan    TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ,
  CONSTRAINT periode_tgl_ck CHECK (tanggal_akhir >= tanggal_awal),
  CONSTRAINT periode_kunci_ck CHECK (status = 'terbuka' OR (dikunci_oleh IS NOT NULL AND dikunci_pada IS NOT NULL))
);
CREATE UNIQUE INDEX periode_gaji_uq ON periode_gaji (tahun, bulan) WHERE deleted_at IS NULL;

-- Koreksi/bonus per periode (juga untuk penyesuaian atas kesalahan periode yang sudah dikunci).
CREATE TABLE penyesuaian_gaji (
  id           BIGSERIAL PRIMARY KEY,
  periode_id   BIGINT NOT NULL REFERENCES periode_gaji(id),
  karyawan_id  BIGINT NOT NULL REFERENCES karyawan(id),
  jenis        TEXT NOT NULL CHECK (jenis IN ('pendapatan', 'potongan')),
  keterangan   TEXT NOT NULL,
  nominal      NUMERIC(15,2) NOT NULL CHECK (nominal > 0),
  dibuat_oleh  BIGINT REFERENCES pengguna(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX penyesuaian_periode_idx ON penyesuaian_gaji (periode_id, karyawan_id) WHERE deleted_at IS NULL;

-- Hasil perhitungan per karyawan per periode (satu slip aktif per periode+karyawan).
CREATE TABLE slip_gaji (
  id                   BIGSERIAL PRIMARY KEY,
  periode_id           BIGINT NOT NULL REFERENCES periode_gaji(id),
  karyawan_id          BIGINT NOT NULL REFERENCES karyawan(id),
  nomor_induk          TEXT NOT NULL,
  nama                 TEXT NOT NULL,
  jabatan              TEXT,
  departemen           TEXT,
  hari_kerja_periode   INTEGER NOT NULL,
  hari_kerja_bekerja   INTEGER NOT NULL,
  menit_terlambat      INTEGER NOT NULL DEFAULT 0,
  gaji_bruto           NUMERIC(15,2) NOT NULL,
  total_potongan       NUMERIC(15,2) NOT NULL,
  gaji_bersih          NUMERIC(15,2) NOT NULL,
  dihitung_oleh        BIGINT REFERENCES pengguna(id),
  dihitung_pada        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ,
  CONSTRAINT slip_bersih_ck CHECK (gaji_bersih = gaji_bruto - total_potongan AND gaji_bersih >= 0)
);
CREATE UNIQUE INDEX slip_gaji_uq ON slip_gaji (periode_id, karyawan_id) WHERE deleted_at IS NULL;
CREATE INDEX slip_gaji_karyawan_idx ON slip_gaji (karyawan_id);

CREATE TABLE slip_gaji_rincian (
  id          BIGSERIAL PRIMARY KEY,
  slip_id     BIGINT NOT NULL REFERENCES slip_gaji(id),
  urutan      INTEGER NOT NULL,
  tipe        TEXT NOT NULL CHECK (tipe IN ('pendapatan', 'potongan', 'beban_perusahaan')),
  kode        TEXT NOT NULL,
  nama        TEXT NOT NULL,
  nominal     NUMERIC(15,2) NOT NULL CHECK (nominal >= 0),
  keterangan  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX slip_rincian_uq ON slip_gaji_rincian (slip_id, urutan);

-- Penjaga: slip dan rinciannya tidak boleh dibuat/diubah pada periode yang sudah dikunci, dan tidak pernah dihapus permanen.
CREATE FUNCTION slip_gaji_jaga() RETURNS trigger AS $$
DECLARE
  v_periode BIGINT;
  v_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Slip gaji tidak boleh dihapus permanen.';
  END IF;
  IF TG_TABLE_NAME = 'slip_gaji' THEN
    v_periode := NEW.periode_id;
  ELSE
    SELECT periode_id INTO v_periode FROM slip_gaji WHERE id = NEW.slip_id;
  END IF;
  SELECT status INTO v_status FROM periode_gaji WHERE id = v_periode;
  IF v_status = 'terkunci' THEN
    RAISE EXCEPTION 'Slip gaji pada periode yang sudah dikunci tidak boleh diubah.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER slip_gaji_jaga BEFORE INSERT OR UPDATE OR DELETE ON slip_gaji
  FOR EACH ROW EXECUTE FUNCTION slip_gaji_jaga();
CREATE TRIGGER slip_gaji_rincian_jaga BEFORE INSERT OR UPDATE OR DELETE ON slip_gaji_rincian
  FOR EACH ROW EXECUTE FUNCTION slip_gaji_jaga();

-- Penyesuaian periode juga dibekukan setelah dikunci.
CREATE FUNCTION penyesuaian_gaji_jaga() RETURNS trigger AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Penyesuaian gaji tidak boleh dihapus permanen.';
  END IF;
  SELECT status INTO v_status FROM periode_gaji WHERE id = NEW.periode_id;
  IF v_status = 'terkunci' THEN
    RAISE EXCEPTION 'Penyesuaian pada periode yang sudah dikunci tidak boleh diubah.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER penyesuaian_gaji_jaga BEFORE INSERT OR UPDATE OR DELETE ON penyesuaian_gaji
  FOR EACH ROW EXECUTE FUNCTION penyesuaian_gaji_jaga();

-- Periode: identitas dan rentang tanggal tidak berubah; tidak dihapus permanen.
CREATE FUNCTION periode_gaji_jaga() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Periode gaji tidak boleh dihapus permanen.';
  END IF;
  IF NEW.tahun IS DISTINCT FROM OLD.tahun OR NEW.bulan IS DISTINCT FROM OLD.bulan
     OR NEW.tanggal_awal IS DISTINCT FROM OLD.tanggal_awal OR NEW.tanggal_akhir IS DISTINCT FROM OLD.tanggal_akhir THEN
    RAISE EXCEPTION 'Rentang periode gaji tidak boleh diubah.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER periode_gaji_jaga BEFORE UPDATE OR DELETE ON periode_gaji
  FOR EACH ROW EXECUTE FUNCTION periode_gaji_jaga();
