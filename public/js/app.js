// Menyertakan token CSRF pada setiap permintaan HTMX.
document.addEventListener('htmx:configRequest', function (e) {
  var meta = document.querySelector('meta[name="csrf-token"]');
  if (meta) e.detail.headers['X-CSRF-Token'] = meta.content;
});
