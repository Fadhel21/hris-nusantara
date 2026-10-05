// Unggah foto dan dokumen karyawan. Berkas dikirim sebagai raw body (tanpa multipart).
// Foto dikecilkan di browser (maks. 400 px, JPEG) sebelum dikirim; gambar dokumen yang besar
// juga dikecilkan agar muat dalam batas 2 MB. Membutuhkan gambar.js.
(function () {
  var MAKS_DOKUMEN = 2 * 1024 * 1024;

  // Foto profil
  document.querySelectorAll('[data-unggah-foto]').forEach(function (input) {
    var pesan = document.querySelector('[data-pesan-foto]');
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) return;
      if (pesan) pesan.textContent = 'Mengunggah…';
      Gambar.kecilkan(file, 400, 0.8)
        .then(function (blob) { return Gambar.kirim(input.dataset.url, blob, 'image/jpeg'); })
        .then(function () { location.reload(); })
        .catch(function (e) { if (pesan) pesan.textContent = e.message; input.value = ''; });
    });
  });

  // Dokumen
  document.querySelectorAll('form[data-unggah-dokumen]').forEach(function (form) {
    var pesan = form.querySelector('[data-pesan-dokumen]');
    function tampilkan(teks) { pesan.textContent = teks; pesan.hidden = !teks; }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      tampilkan('');
      var file = form.elements.berkas.files[0];
      var jenis = form.elements.jenis.value;
      if (!file || !jenis) return tampilkan('Pilih jenis dan berkas.');

      var siap;
      if (/^image\/(jpeg|png)$/.test(file.type) && file.size > MAKS_DOKUMEN) {
        siap = Gambar.kecilkan(file, 2000, 0.85).then(function (b) { return { blob: b, tipe: 'image/jpeg' }; });
      } else if (/^(application\/pdf|image\/(jpeg|png))$/.test(file.type)) {
        siap = Promise.resolve({ blob: file, tipe: file.type });
      } else {
        return tampilkan('Format berkas harus PDF, JPG, atau PNG.');
      }
      siap.then(function (b) {
        if (b.blob.size > MAKS_DOKUMEN) throw new Error('Ukuran berkas maksimal 2 MB.');
        var url = form.dataset.url + '?jenis=' + encodeURIComponent(jenis) + '&nama=' + encodeURIComponent(file.name);
        return Gambar.kirim(url, b.blob, b.tipe);
      }).then(function () { location.reload(); })
        .catch(function (err) { tampilkan(err.message); });
    });
  });
})();
