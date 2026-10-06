// Impor tabel pajak dari CSV dalam dua tahap: periksa dulu, lalu simpan. Isi berkas dikirim sebagai teks (tanpa multipart);
// server memvalidasi ulang saat menyimpan.
(function () {
  function csrf() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  }

  function kirim(url, teks) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv', 'X-CSRF-Token': csrf(), 'Accept': 'application/json' },
      body: teks,
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok && !j.galat) throw new Error('Permintaan gagal.');
        return { status: r.status, data: j };
      });
    });
  }

  function tulis(wadah, galat, ringkasan, tersimpan) {
    var html = '';
    if (Array.isArray(galat) && galat.length) {
      html += '<p class="galat" role="alert"><strong>' + galat.length + ' masalah ditemukan:</strong></p><ul class="daftar-galat">';
      galat.slice(0, 50).forEach(function (g) { html += '<li></li>'; });
      html += '</ul>';
    } else if (typeof galat === 'string') {
      html += '<p class="galat" role="alert"></p>';
    }
    wadah.innerHTML = html;
    var li = wadah.querySelectorAll('li');
    if (Array.isArray(galat)) galat.slice(0, 50).forEach(function (g, i) { li[i].textContent = g; });
    if (typeof galat === 'string') wadah.querySelector('p').textContent = galat;
    if (Array.isArray(galat) && galat.length > 50) {
      var p = document.createElement('p'); p.className = 'redup'; p.textContent = '… dan ' + (galat.length - 50) + ' masalah lain.'; wadah.appendChild(p);
    }
    if (Array.isArray(galat) && !galat.length && ringkasan && ringkasan.length) {
      var ok = document.createElement('p');
      ok.className = 'info';
      ok.textContent = (tersimpan ? 'Tersimpan. ' : 'Berkas valid. ') + ringkasan.map(function (r) { return r.kelompok + ': ' + r.baris + ' baris'; }).join('; ');
      wadah.appendChild(ok);
    }
  }

  document.querySelectorAll('[data-impor]').forEach(function (kotak) {
    var jenis = kotak.dataset.impor;
    var input = kotak.querySelector('input[type=file]');
    var hasil = kotak.querySelector('[data-hasil]');
    var tombolSimpan = kotak.querySelector('[data-simpan]');
    var tombolPeriksa = kotak.querySelector('[data-periksa]');
    var url = '/penggajian/pajak/impor/' + encodeURIComponent(jenis);
    var teksTerakhir = null;

    function baca() {
      var f = input.files[0];
      if (!f) return Promise.reject(new Error('Pilih berkas CSV terlebih dahulu.'));
      if (f.size > 1024 * 1024) return Promise.reject(new Error('Ukuran berkas maksimal 1 MB.'));
      return f.text();
    }

    input.addEventListener('change', function () { tombolSimpan.hidden = true; hasil.innerHTML = ''; teksTerakhir = null; });

    tombolPeriksa.addEventListener('click', function () {
      tombolSimpan.hidden = true;
      baca().then(function (teks) {
        teksTerakhir = teks;
        return kirim(url + '?mode=validasi', teks);
      }).then(function (r) {
        tulis(hasil, r.data.galat || [], r.data.ringkasan, false);
        tombolSimpan.hidden = !(r.status === 200 && (r.data.galat || []).length === 0);
      }).catch(function (e) { tulis(hasil, e.message); });
    });

    tombolSimpan.addEventListener('click', function () {
      if (teksTerakhir === null) return;
      tombolSimpan.disabled = true;
      kirim(url + '?mode=simpan', teksTerakhir).then(function (r) {
        tulis(hasil, r.data.galat || [], r.data.ringkasan, !!r.data.tersimpan);
        if (r.data.tersimpan) setTimeout(function () { location.reload(); }, 1200);
        else tombolSimpan.disabled = false;
      }).catch(function (e) { tulis(hasil, e.message); tombolSimpan.disabled = false; });
    });
  });
})();
