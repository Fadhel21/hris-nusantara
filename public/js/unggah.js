// Unggah foto dan dokumen karyawan. Berkas dikirim sebagai raw body (tanpa multipart).
// Foto dikecilkan di browser (maks. 400 px, JPEG) sebelum dikirim; gambar dokumen yang besar
// juga dikecilkan agar muat dalam batas 2 MB.
(function () {
  var MAKS_DOKUMEN = 2 * 1024 * 1024;

  function csrf() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  }

  // Mengecilkan gambar ke sisi terpanjang `sisi` px lalu menjadikannya JPEG.
  function kecilkan(file, sisi, kualitas) {
    return new Promise(function (selesai, gagal) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var skala = Math.min(1, sisi / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * skala));
        c.height = Math.max(1, Math.round(img.height * skala));
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; // PNG transparan -> latar putih
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (blob) { return blob ? selesai(blob) : gagal(new Error('Gagal memproses gambar.')); }, 'image/jpeg', kualitas);
      };
      img.onerror = function () { URL.revokeObjectURL(url); gagal(new Error('Berkas bukan gambar yang valid.')); };
      img.src = url;
    });
  }

  function kirim(url, blob, tipe) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': tipe, 'X-CSRF-Token': csrf(), 'Accept': 'application/json' },
      body: blob,
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.galat || 'Unggah gagal.');
        return j;
      });
    });
  }

  // Foto profil
  document.querySelectorAll('[data-unggah-foto]').forEach(function (input) {
    var pesan = document.querySelector('[data-pesan-foto]');
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) return;
      if (pesan) pesan.textContent = 'Mengunggah…';
      kecilkan(file, 400, 0.8)
        .then(function (blob) { return kirim(input.dataset.url, blob, 'image/jpeg'); })
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
        siap = kecilkan(file, 2000, 0.85).then(function (b) { return { blob: b, tipe: 'image/jpeg' }; });
      } else if (/^(application\/pdf|image\/(jpeg|png))$/.test(file.type)) {
        siap = Promise.resolve({ blob: file, tipe: file.type });
      } else {
        return tampilkan('Format berkas harus PDF, JPG, atau PNG.');
      }
      siap.then(function (b) {
        if (b.blob.size > MAKS_DOKUMEN) throw new Error('Ukuran berkas maksimal 2 MB.');
        var url = form.dataset.url + '?jenis=' + encodeURIComponent(jenis) + '&nama=' + encodeURIComponent(file.name);
        return kirim(url, b.blob, b.tipe);
      }).then(function () { location.reload(); })
        .catch(function (err) { tampilkan(err.message); });
    });
  });
})();
