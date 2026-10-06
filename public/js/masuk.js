// Halaman masuk: state formulir (Alpine) dan miring ikon 3D mengikuti penunjuk.
// Tanpa library animasi; hanya mengubah transform. Dinonaktifkan bila pengguna memilih prefers-reduced-motion.
document.addEventListener('alpine:init', function () {
  Alpine.data('masuk', function () {
    return {
      username: '',
      password: '',
      tampil: false,
      memuat: false,
      capslock: false,
      pesan: '',
      init: function () {
        var self = this;
        // Pertahankan username yang dirender server (mis. setelah salah password).
        if (this.$refs.username && this.$refs.username.value) this.username = this.$refs.username.value;
        // Setelah navigasi mundur (bfcache) tombol tidak boleh tetap "memproses".
        window.addEventListener('pageshow', function () { self.memuat = false; });
      },
      isi: function (username, password, label) {
        this.username = username;
        this.password = password;
        this.tampil = false;
        this.pesan = 'Formulir diisi dengan akun ' + label + '. Tekan tombol Masuk.';
        var kirim = this.$refs.kirim;
        this.$nextTick(function () { if (kirim) kirim.focus(); });
      }
    };
  });
});

(function () {
  var kurangiGerak = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var penunjukHalus = window.matchMedia('(pointer: fine)').matches;
  var visual = document.querySelector('.masuk-visual');
  var miring = document.querySelector('.miring');
  if (!visual || !miring || kurangiGerak || !penunjukHalus) return;

  var bingkai = null;
  visual.addEventListener('pointermove', function (e) {
    var r = visual.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width - 0.5;
    var y = (e.clientY - r.top) / r.height - 0.5;
    if (bingkai) cancelAnimationFrame(bingkai);
    bingkai = requestAnimationFrame(function () {
      miring.style.setProperty('--ry', (x * 22).toFixed(1) + 'deg');
      miring.style.setProperty('--rx', (-y * 16).toFixed(1) + 'deg');
    });
  });
  visual.addEventListener('pointerleave', function () {
    if (bingkai) cancelAnimationFrame(bingkai);
    miring.style.setProperty('--ry', '0deg');
    miring.style.setProperty('--rx', '0deg');
  });
})();
