// Tap In / Tap Out: kamera langsung (getUserMedia), lokasi (bila diizinkan), foto dikecilkan lalu dikirim.
// Waktu TIDAK dikirim dari perangkat; server memakai jamnya sendiri. Membutuhkan gambar.js.
// Bila kamera tidak tersedia (izin ditolak / bukan HTTPS), jatuh ke input berkas dengan capture="user".
(function () {
  // ---- Jam di kepala kartu: dikoreksi dengan jam server (header Date) agar sama dengan yang dicatat ----
  var jam = document.querySelector('[data-jam]');
  if (jam) {
    var selisih = 0;
    var format;
    try { format = new Intl.DateTimeFormat('id-ID', { timeZone: jam.dataset.zona, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch (e) { format = null; }
    var ganti = function () {
      var t = new Date(Date.now() + selisih);
      jam.textContent = format ? format.format(t).replace(/\./g, ':') : t.toLocaleTimeString('id-ID');
    };
    fetch('/sehat', { cache: 'no-store', credentials: 'same-origin' }).then(function (r) {
      var d = r.headers.get('Date');
      if (d) selisih = new Date(d).getTime() - Date.now();
    }).catch(function () { /* pakai jam perangkat sebagai tampilan saja */ }).then(function () { ganti(); setInterval(ganti, 1000); });
    ganti();
  }

  var wadah = document.querySelector('[data-absen]');
  if (!wadah) return;
  var input = wadah.querySelector('[data-foto]');
  var pesan = wadah.querySelector('[data-pesan]');
  var tombol = wadah.querySelectorAll('button[data-aksi]');
  var video = wadah.querySelector('[data-video]');
  var lapis = wadah.querySelector('[data-lapis]');
  var teksKamera = wadah.querySelector('[data-kamera-teks]');
  var nyalakan = wadah.querySelector('[data-nyalakan]');
  var kilat = wadah.querySelector('[data-kilat]');
  var teksLokasi = wadah.querySelector('[data-lokasi-teks]');
  var stream = null;
  var siap = false;
  var sibuk = false;
  var awalDisabled = [];
  tombol.forEach(function (t) { awalDisabled.push(t.disabled); });

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

  // Pemanasan: memicu izin lokasi lebih awal dan memberi tahu pengguna statusnya.
  if (navigator.permissions && navigator.permissions.query && teksLokasi) {
    navigator.permissions.query({ name: 'geolocation' }).then(function (s) {
      var perbarui = function () {
        teksLokasi.textContent = s.state === 'granted' ? 'Lokasi akan dicatat bersama absen.'
          : s.state === 'denied' ? 'Izin lokasi ditolak; absen tetap bisa, tanpa lokasi.' : 'Lokasi dicatat bila Anda mengizinkan.';
      };
      perbarui(); s.onchange = perbarui;
    }).catch(function () { /* abaikan */ });
  }

  function aturTombol(nonaktif) {
    tombol.forEach(function (t, i) { t.disabled = nonaktif || awalDisabled[i]; });
  }

  // ---- Kamera ----
  function matikanKamera() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    siap = false;
  }

  function nyalakanKamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      lapis.classList.add('tampil');
      teksKamera.textContent = 'Kamera langsung tidak tersedia di peramban ini. Tap In/Out akan membuka kamera perangkat.';
      return;
    }
    lapis.classList.add('tampil');
    teksKamera.textContent = 'Menyalakan kamera…';
    nyalakan.hidden = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false })
      .then(function (s) {
        stream = s;
        video.srcObject = s;
        return video.play().catch(function () { /* autoplay ditangani atribut */ });
      })
      .then(function () {
        siap = true;
        lapis.classList.remove('tampil');
      })
      .catch(function (e) {
        siap = false;
        teksKamera.textContent = e && e.name === 'NotAllowedError'
          ? 'Izin kamera ditolak. Izinkan kamera di pengaturan peramban, lalu coba lagi.'
          : 'Kamera tidak dapat dinyalakan.';
        nyalakan.hidden = false;
      });
  }
  nyalakan.addEventListener('click', nyalakanKamera);
  window.addEventListener('pagehide', matikanKamera);
  document.addEventListener('visibilitychange', function () { if (document.hidden) matikanKamera(); else if (!stream && !sibuk) nyalakanKamera(); });
  nyalakanKamera();

  // Mengambil bingkai saat ini (tidak dicerminkan) sebagai Blob JPEG.
  function ambilBingkai() {
    return new Promise(function (selesai, gagal) {
      var w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return gagal(new Error('Kamera belum siap.'));
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(video, 0, 0, w, h);
      // Wajah harus terdeteksi bila peramban mendukung FaceDetector (opsional; tidak semua peramban punya).
      var cek = Promise.resolve(true);
      if (window.FaceDetector) {
        cek = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 }).detect(c)
          .then(function (w2) { return w2.length > 0; }).catch(function () { return true; });
      }
      cek.then(function (ada) {
        if (!ada) return gagal(new Error('Wajah tidak terdeteksi. Pastikan wajah terlihat jelas di dalam bingkai.'));
        c.toBlob(function (b) { return b ? selesai(b) : gagal(new Error('Gagal mengambil foto.')); }, 'image/jpeg', 0.9);
      });
    });
  }

  function kirimFoto(aksi, berkas) {
    var url = aksi === 'masuk' ? wadah.dataset.urlMasuk : wadah.dataset.urlPulang;
    sibuk = true;
    aturTombol(true);
    tampilkan('Mengambil lokasi dan mengirim…', false);
    return Promise.all([lokasi(), Gambar.kecilkan(berkas, 400, 0.8)])
      .then(function (hasil) {
        var k = hasil[0];
        var q = k ? '?lat=' + k.latitude + '&lon=' + k.longitude + '&akurasi=' + Math.round(k.accuracy) : '';
        return Gambar.kirim(url + q, hasil[1], 'image/jpeg');
      })
      .then(function () { matikanKamera(); location.reload(); })
      .catch(function (e) {
        sibuk = false;
        tampilkan(e.message, true);
        aturTombol(false);
      });
  }

  var aksiBerkas = null;
  tombol.forEach(function (t) {
    t.addEventListener('click', function () {
      var aksi = t.dataset.aksi;
      if (sibuk) return;
      if (!siap) { aksiBerkas = aksi; input.value = ''; input.click(); return; }
      kilat.classList.remove('nyala'); void kilat.offsetWidth; kilat.classList.add('nyala');
      ambilBingkai().then(function (blob) { return kirimFoto(aksi, blob); })
        .catch(function (e) { tampilkan(e.message, true); });
    });
  });

  // Cadangan: kamera perangkat lewat input berkas.
  input.addEventListener('change', function () {
    var file = input.files[0];
    if (!file || !aksiBerkas) return;
    kirimFoto(aksiBerkas, file);
  });
})();
