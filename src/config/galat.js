// Galat bisnis: pesan aman ditampilkan ke pengguna. status 422 = input tidak valid, 409 = bentrok.
class GalatBisnis extends Error {
  constructor(pesan, status = 422) {
    super(pesan);
    this.name = 'GalatBisnis';
    this.status = status;
  }
}

module.exports = { GalatBisnis };
