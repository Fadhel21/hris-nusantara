// Absen masuk/pulang: ambil foto, ambil lokasi (bila diizinkan), kecilkan foto, kirim.
// Waktu TIDAK dikirim dari perangkat; server memakai jamnya sendiri. Membutuhkan gambar.js.
(function () {
  var wadah = document.querySelector('[data-absen]');
  if (!wadah) return;
  var input = wadah.querySelector('[data-foto]');
  var pesan = wadah.querySelector('[data-pesan]');
  var tombol = wadah.querySelectorAll('button[data-aksi]');
  var aksi = null;

  function tampilkan(teks, galat) {
    pesan.textContent = teks;
    pesan.className = galat ? 'galat' : 'redup';
  }

  function lokasi() {
    return new Promise(function (selesai) {
      if (!navigator.geolocation) return selesai(null);
      navigator.geolocation.getCurrentPosition(
        function (p) { selesai(p.coords); },
        function () { selesai(null); },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });
  }

  tombol.forEach(function (t) {
    t.addEventListener('click', function () {
      aksi = t.dataset.aksi;
      input.value = '';
      input.click();
    });
  });

  input.addEventListener('change', function () {
    var file = input.files[0];
    if (!file || !aksi) return;
    var url = aksi === 'masuk' ? wadah.dataset.urlMasuk : wadah.dataset.urlPulang;
    tombol.forEach(function (t) { t.disabled = true; });
    tampilkan('Mengambil lokasi dan mengirim…', false);
    Promise.all([lokasi(), Gambar.kecilkan(file, 400, 0.8)])
      .then(function (hasil) {
        var koordinat = hasil[0];
        var q = koordinat
          ? '?lat=' + koordinat.latitude + '&lon=' + koordinat.longitude + '&akurasi=' + Math.round(koordinat.accuracy)
          : '';
        return Gambar.kirim(url + q, hasil[1], 'image/jpeg');
      })
      .then(function () { location.reload(); })
      .catch(function (e) {
        tampilkan(e.message, true);
        tombol.forEach(function (t) { t.disabled = false; });
      });
  });
})();
