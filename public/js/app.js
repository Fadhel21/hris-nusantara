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
