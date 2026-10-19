# HRIS — panduan proyek

Semua komunikasi, komentar, pesan error, UI, dan commit memakai **Bahasa Indonesia**. Remote git hanya `origin` = https://github.com/Fadhel21/hris-nusantara.git (disetujui pemilik); jangan tambah remote lain dan jangan push ke tempat lain. Push hanya bila pemilik meminta.

## Stack (terkunci)
Node.js 20+, Express 4, EJS (render server), HTMX + Alpine.js (file statis di `public/js`, tanpa build), PostgreSQL 16+ lewat `pg` + SQL murni (tanpa ORM), migrasi SQL bernomor + `scripts/migrate.js`, JWT di signed cookie + `bcryptjs`, `node-cron` di `worker/`, `pdfmake` untuk PDF (tanpa Puppeteer), Chart.js atau SVG/CSS.
Dependency yang diizinkan HANYA: express, ejs, pg, bcryptjs, jsonwebtoken, cookie-parser, helmet, dotenv, dayjs, node-cron, nodemailer, pdfmake, chart.js, uuid. Yang lain: tanya dulu.

## Aturan wajib
- Tanpa tahap build, tanpa devDependencies, tanpa library native (node-gyp, sharp, canvas, bcrypt).
- Windows + PowerShell: `path.join()`, nama file huruf kecil, tanpa `.sh`/Makefile, skrip npm hanya `node file.js`.
- Uang `NUMERIC(15,2)`, tidak pernah float; hitung di SQL atau bilangan bulat. Waktu `TIMESTAMPTZ`.
- Tiap tabel: `id BIGSERIAL`, `created_at`, `updated_at`, `deleted_at` (soft delete).
- Skema hanya berubah lewat migrasi baru; migrasi lama tidak diedit (checksum diperiksa).
- Controller tidak menulis SQL; SQL hanya di `services/`. Transaksi lewat `transaksi()` di `src/config/db.js`.
- Tes: `node:test` + `node:assert`, jalankan `npm test`.
- Hemat disk: target ±75 MB. Slip/surat PDF tidak disimpan. Foto dikecilkan di browser (maks 400 px, ±50 KB), disimpan di `uploads/` (di luar git), DB hanya menyimpan path. Dokumen hanya lewat route ber-hak-akses. Ekspor/impor CSV tanpa library. Log tidak tumbuh tanpa batas (hapus otomatis 14 hari oleh worker).

## Aturan HRIS
1. Hak akses berlapis (karyawan→diri sendiri, atasan→bawahan, HR→cakupan cabang/departemen) di middleware DAN service.
2. NIK, NPWP, rekening, gaji: hanya peran berhak, disamarkan di daftar, tidak pernah masuk log.
3. Operasi multi-tabel wajib satu transaksi.
4. Gaji pokok, jabatan, departemen, golongan, status kontrak = riwayat bertanggal berlaku, bukan ditimpa.
5. Satu periode gaji diproses sekali per karyawan; hasil rinci per komponen; setelah dikunci tidak bisa diedit (koreksi via penyesuaian periode berikut atau buka kunci dengan persetujuan + audit).
6. Tarif BPJS, PPh 21, PTKP, UMK, pengali lembur ada di tabel pengaturan bertanggal berlaku. Jangan mengarang angka; tanya pemilik.
7. Absensi: jam server, zona waktu cabang; catatan mentah tidak diedit, koreksi via pengajuan disetujui.
8. Saldo cuti hanya lewat mutasi; tolak pengajuan tumpang tindih / melebihi saldo.
9. Persetujuan dicatat per langkah; tidak boleh menyetujui pengajuan sendiri.
10. Slip gaji: hanya milik sendiri, hanya periode terkunci.
11. Karyawan keluar: nonaktif + tanggal keluar, login dicabut, riwayat tetap.
12. Jejak audit untuk data karyawan, gaji, absensi, saldo cuti, hak akses, pengaturan.

## Perintah (PowerShell)
```powershell
npm install --omit=dev
node scripts/migrate.js     # atau: npm run migrate
npm start                   # server
npm run worker              # worker
npm test
```
