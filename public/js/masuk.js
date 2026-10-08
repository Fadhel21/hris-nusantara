// Halaman masuk: state formulir (Alpine).
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
