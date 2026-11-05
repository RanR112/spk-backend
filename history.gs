/**
 * history.gs - Riwayat keputusan: simpan hasil ke sheet Riwayat_Keputusan dan baca kembali.
 */

/** Simpan hasil keputusan saat ini ke sheet Riwayat_Keputusan (satu baris per produk per tanggal data). */
function simpanKeRiwayat() {
  const rec = getRecommendations();
  const tanggal = rec.tanggal_data;
  if (!tanggal) throw new Error('Belum ada data harga bahan.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SHEET.RIWAYAT);
    const cm = colMap_(sh);
    const last = sh.getLastRow();
    const exist = {};
    if (last >= 2) {
      sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().forEach(function (r) {
        exist[toIso_(r[cm.tanggal - 1]) + '|' + String(r[cm.id_produk - 1]).trim()] = true;
      });
    }

    const tz = ss_().getSpreadsheetTimeZone();
    let saved = 0;
    let skipped = 0;
    rec.items.forEach(function (it) {
      if (it.keputusan === KEP.DATA || exist[tanggal + '|' + it.id_produk]) {
        skipped++;
        return;
      }
      const row = appendByHeader_(sh, {
        tanggal: Utilities.parseDate(tanggal, tz, 'yyyy-MM-dd'),
        id_produk: it.id_produk,
        nama_produk: it.nama_produk,
        hpp: it.hpp,
        perubahan_hpp_persen: it.perubahan_persen,
        margin_persen: it.margin_persen,
        keputusan: it.keputusan,
        harga_saran: it.harga_saran === null ? '' : it.harga_saran,
        keterangan: it.keterangan,
        skor_saw: it.skor_saw === null ? '' : it.skor_saw,
        peringkat: it.peringkat === null ? '' : it.peringkat
      });
      sh.getRange(row, cm.tanggal).setNumberFormat('yyyy-mm-dd');
      saved++;
    });
    return { tanggal: tanggal, disimpan: saved, dilewati: skipped };
  } finally {
    lock.releaseLock();
  }
}

function getRiwayat(limit) {
  limit = Math.max(1, Math.min(500, Math.round(num_(limit)) || 300));
  const rows = readTable_(SHEET.RIWAYAT).map(function (r, i) {
    const saran = num_(r.harga_saran);
    const skor = num_(r.skor_saw);
    const rank = num_(r.peringkat);
    return {
      tanggal: toIso_(r.tanggal),
      id_produk: String(r.id_produk),
      nama_produk: String(r.nama_produk),
      hpp: num_(r.hpp),
      perubahan_hpp_persen: num_(r.perubahan_hpp_persen),
      margin_persen: num_(r.margin_persen),
      keputusan: String(r.keputusan),
      harga_saran: isNaN(saran) ? null : saran,
      keterangan: String(r.keterangan || ''),
      skor_saw: isNaN(skor) ? null : skor,
      peringkat: isNaN(rank) ? null : rank,
      urut: i
    };
  });
  rows.sort(function (a, b) {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
    return a.urut - b.urut;
  });
  return rows.slice(0, limit);
}