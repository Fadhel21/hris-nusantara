// Pemeriksaan peran. Pemeriksaan data per-baris (diri sendiri/bawahan/cakupan) dilakukan di service.
function butuhPeran(...peran) {
  return (req, res, next) => {
    if (req.pengguna && peran.includes(req.pengguna.peran)) return next();
    const err = new Error('Anda tidak berhak mengakses halaman ini.');
    err.status = 403;
    return next(err);
  };
}

module.exports = { butuhPeran };
