// Dimuat sinkron di <head>: menerapkan kelompok menu yang diingat SEBELUM halaman pertama dicat,
// supaya sidebar tidak berkedip (tertutup lalu terbuka) setiap berpindah halaman.
(function () {
  var css = '';
  try {
    for (var i = 0; i < localStorage.length; i += 1) {
      var kunci = localStorage.key(i);
      if (kunci.indexOf('hris.menu.') !== 0 || localStorage.getItem(kunci) !== '1') continue;
      var id = 'grup-' + kunci.slice(10).toLowerCase().replace(/[^a-z0-9_-]/g, '');
      css += '#' + id + '.nav-sub.tertutup{display:block}'
        + '.nav-grup-judul[aria-controls="' + id + '"] .nav-chevron{transform:rotate(180deg)}';
    }
  } catch (e) { /* penyimpanan dinonaktifkan */ }
  if (css) { var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }
})();
