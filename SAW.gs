/**
 * SAW.gs - Metode SAW (Simple Additive Weighting): skor preferensi dan peringkat prioritas produk.
 */

/**
 * SAW (Simple Additive Weighting) untuk memprioritaskan produk yang paling perlu ditindak.
 *
 *   Alternatif : produk dengan data lengkap
 *   Kriteria   : (skor lebih tinggi = produk lebih mendesak ditindak)
 *     C1  Perubahan HPP absolut (%)        benefit  -> semakin besar gejolak HPP, semakin mendesak
 *     C2  Margin saat ini (%)              cost     -> semakin kecil margin, semakin mendesak
 *     C3  Selisih margin dari target (%)   benefit  -> semakin jauh di bawah target, semakin mendesak
 *     C4  Porsi bahan termahal thd HPP (%) benefit  -> semakin terpusat pada satu bahan, semakin rentan
 *
 *   Normalisasi : benefit  r = x / max(x)      cost  r = min(x) / x
 *   Skor        : V = sum( w_j * r_j )  ; peringkat 1 = V terbesar
 *
 * Mengisi item.skor_saw, item.peringkat, item.saw_normal pada tiap produk, dan
 * mengembalikan ringkasan kriteria (bobot, nilai referensi max/min) untuk ditampilkan.
 */
function applySAW_(items, st) {
  const valid = items.filter(function (it) { return it.keputusan !== KEP.DATA; });
  if (!valid.length) return null;

  const kriteria = [
    {
      kode: 'C1', nama: 'Perubahan HPP (absolut, %)', tipe: 'benefit', bobot: st.bobot_perubahan_hpp,
      nilai: function (it) { return Math.abs(it.perubahan_persen); }
    },
    {
      kode: 'C2', nama: 'Margin saat ini (%)', tipe: 'cost', bobot: st.bobot_margin,
      // Lantai 0,1 agar pembagian aman bila margin nol atau negatif (margin terburuk = paling mendesak).
      nilai: function (it) { return Math.max(it.margin_persen, 0.1); }
    },
    {
      kode: 'C3', nama: 'Selisih margin dari target (%)', tipe: 'benefit', bobot: st.bobot_selisih_margin,
      nilai: function (it) { return Math.max(0, st.margin_target_persen - it.margin_persen); }
    },
    {
      kode: 'C4', nama: 'Porsi bahan termahal terhadap HPP (%)', tipe: 'benefit', bobot: st.bobot_porsi_bahan,
      nilai: function (it) { return it.porsi_maks_persen || 0; }
    }
  ];

  // Bobot: dari AHP bila aktif dan konsisten; selain itu bobot manual dari Pengaturan.
  const sb = getBobotAHP_(st);
  kriteria.forEach(function (k) { k.bobot = sb.bobot[k.kode]; });

  // Normalisasi total bobot menjadi 1 (pengaman bila sheet Pengaturan diedit manual).
  let totalBobot = 0;
  kriteria.forEach(function (k) { totalBobot += k.bobot; });
  if (!(totalBobot > 0)) {
    kriteria.forEach(function (k) { k.bobot = 1 / kriteria.length; });
  } else {
    kriteria.forEach(function (k) { k.bobot = k.bobot / totalBobot; });
  }

  // Matriks keputusan X dan nilai referensi (max untuk benefit, min untuk cost).
  kriteria.forEach(function (k) {
    k.x = valid.map(function (it) { return k.nilai(it); });
    k.referensi = k.tipe === 'benefit' ? Math.max.apply(null, k.x) : Math.min.apply(null, k.x);
  });

  // Matriks ternormalisasi R dan skor preferensi V.
  valid.forEach(function (it, i) {
    let v = 0;
    it.saw_normal = {};
    kriteria.forEach(function (k) {
      const x = k.x[i];
      let r;
      if (k.tipe === 'benefit') r = k.referensi > 0 ? x / k.referensi : 0;
      else r = x > 0 ? k.referensi / x : 0;
      it.saw_normal[k.kode] = Math.round(r * 1000) / 1000;
      v += k.bobot * r;
    });
    it.skor_saw = Math.round(v * 1000) / 1000;
  });

  // Perankingan: skor tertinggi = peringkat 1 (seri dipecah dengan |perubahan HPP| terbesar).
  const ranked = valid.slice().sort(function (a, b) {
    if (b.skor_saw !== a.skor_saw) return b.skor_saw - a.skor_saw;
    return Math.abs(b.perubahan_persen) - Math.abs(a.perubahan_persen);
  });
  ranked.forEach(function (it, i) { it.peringkat = i + 1; });

  return {
    jumlah_alternatif: valid.length,
    sumber_bobot: sb.sumber,
    ahp: sb.ahp,
    peringatan: sb.peringatan,
    kriteria: kriteria.map(function (k) {
      return {
        kode: k.kode,
        nama: k.nama,
        tipe: k.tipe,
        bobot: Math.round(k.bobot * 1000) / 1000,
        referensi: Math.round(k.referensi * 100) / 100
      };
    })
  };
}