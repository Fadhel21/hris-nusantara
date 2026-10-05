// Fungsi gambar bersama (foto profil, dokumen, absensi): pengecilan di browser dan pengiriman raw body.
window.Gambar = (function () {
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

  // Mengirim berkas sebagai raw body; galat server (JSON {galat}) dilempar sebagai Error.
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

  return { kecilkan: kecilkan, kirim: kirim };
})();
