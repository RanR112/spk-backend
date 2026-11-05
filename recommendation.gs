/**
 * recommendation.gs - Rekomendasi: menggabungkan evaluasi produk, SAW, dan pengurutan hasil.
 */

/**
 * Hasil keputusan untuk semua produk berdasarkan data harga terbaru.
 * Urutan hasil = peringkat SAW (skor tertinggi = paling prioritas ditindak).
 * Produk dengan data tidak lengkap diletakkan di paling bawah.
 */
function getRecommendations() {
  const st = getSettings_();
  const prices = buildPrices_();
  const resep = groupResep_();
  const produk = readTable_(SHEET.PRODUK);

  const items = produk
    .filter(function (p) { return String(p.id_produk).trim() !== ''; })
    .map(function (p) {
      return evaluate_(p, resep[String(p.id_produk).trim()] || [], prices, st, null);
    });

  // Metode SAW: beri skor dan peringkat pada produk yang datanya lengkap.
  const saw = applySAW_(items, st);

  items.sort(function (a, b) {
    const aData = a.keputusan === KEP.DATA;
    const bData = b.keputusan === KEP.DATA;
    if (aData !== bData) return aData ? 1 : -1;
    if (aData && bData) return 0;
    return a.peringkat - b.peringkat;
  });

  const ringkasan = { total: items.length, naik: 0, promo: 0, tahan: 0, data: 0 };
  items.forEach(function (it) {
    if (it.keputusan === KEP.NAIK) ringkasan.naik++;
    else if (it.keputusan === KEP.PROMO) ringkasan.promo++;
    else if (it.keputusan === KEP.TAHAN) ringkasan.tahan++;
    else ringkasan.data++;
  });

  return {
    tanggal_data: latestDate_(prices),
    pengaturan: st,
    metode: 'SAW (Simple Additive Weighting)',
    saw: saw,
    ringkasan: ringkasan,
    items: items
  };
}