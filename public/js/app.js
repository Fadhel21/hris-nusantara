// Kelompok menu di sidebar: terbuka bila berisi halaman aktif, atau bila terakhir dibuka pengguna.
document.addEventListener('alpine:init', function () {
  Alpine.data('grupMenu', function (nama, aktifAwal) {
    var kunci = 'hris.menu.' + nama;
    function baca() { try { return localStorage.getItem(kunci) === '1'; } catch (e) { return false; } }
    return {
      buka: aktifAwal || baca(),
      // Kelompok yang sedang dikunjungi ikut diingat terbuka, sehingga tetap terbuka saat pindah ke kelompok lain.
      init: function () {
        if (aktifAwal) { try { localStorage.setItem(kunci, '1'); } catch (e) { /* penyimpanan dinonaktifkan */ } }
      },
      alih: function () {
        this.buka = !this.buka;
        try { localStorage.setItem(kunci, this.buka ? '1' : '0'); } catch (e) { /* penyimpanan dinonaktifkan */ }
      }
    };
  });
});

// Menyertakan token CSRF pada setiap permintaan HTMX.
document.addEventListener('htmx:configRequest', function (e) {
  var meta = document.querySelector('meta[name="csrf-token"]');
  if (meta) e.detail.headers['X-CSRF-Token'] = meta.content;
});

// Menampilkan pesan galat dari server (respons 4xx/5xx) kepada pengguna.
document.addEventListener('htmx:responseError', function (e) {
  var doc = new DOMParser().parseFromString(e.detail.xhr.responseText || '', 'text/html');
  alert((doc.body.textContent || '').trim() || 'Terjadi kesalahan.');
});
