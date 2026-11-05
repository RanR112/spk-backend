/**
 * price.gs - Data harga bahan: baca/susun deret harga, input harga, daftar bahan, dan data tren.
 */

function buildPrices_() {
  const map = {};
  readTable_(SHEET.HARGA).forEach(function (r) {
    const d = toIso_(r.tanggal);
    const v = num_(r.harga);
    const name = String(r.nama_bahan || '').trim();
    if (!d || !name || isNaN(v)) return;
    if (!map[name]) map[name] = { satuan: String(r.satuan || ''), series: [] };
    map[name].series.push({ d: d, v: v });
  });
  Object.keys(map).forEach(function (k) {
    map[k].series.sort(function (a, b) { return a.d < b.d ? -1 : (a.d > b.d ? 1 : 0); });
  });
  return map;
}

/** Rata-rata `win` harga terakhir (sampai tanggal upTo bila diberikan). */
function avgLast_(series, win, upTo) {
  let end = series.length - 1;
  if (upTo) {
    while (end >= 0 && series[end].d > upTo) end--;
  }
  if (end < 0) return null;
  const start = Math.max(0, end - win + 1);
  let sum = 0;
  for (let i = start; i <= end; i++) sum += series[i].v;
  return sum / (end - start + 1);
}

function latestDate_(prices) {
  let max = '';
  Object.keys(prices).forEach(function (k) {
    const s = prices[k].series;
    if (s.length && s[s.length - 1].d > max) max = s[s.length - 1].d;
  });
  return max;
}

/** Input harga bahan terbaru. Jika tanggal + bahan sudah ada, harganya diperbarui. */
function addHargaBahan(payload) {
  payload = payload || {};
  const tanggal = toIso_(payload.tanggal);
  const bahan = String(payload.bahan || '').trim();
  const harga = num_(payload.harga);

  if (!tanggal) throw new Error('Tanggal tidak valid.');
  if (!bahan) throw new Error('Pilih bahan terlebih dahulu.');
  if (!(harga > 0)) throw new Error('Harga harus lebih dari 0.');

  const prices = buildPrices_();
  if (!prices[bahan]) throw new Error('Bahan "' + bahan + '" belum ada di sheet ' + SHEET.HARGA + '.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SHEET.HARGA);
    const cm = colMap_(sh);
    const last = sh.getLastRow();
    let updated = false;

    if (last >= 2) {
      const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
      for (let i = 0; i < vals.length; i++) {
        if (toIso_(vals[i][cm.tanggal - 1]) === tanggal &&
            String(vals[i][cm.nama_bahan - 1]).trim() === bahan) {
          sh.getRange(i + 2, cm.harga).setValue(harga);
          updated = true;
          break;
        }
      }
    }

    if (!updated) {
      const row = appendByHeader_(sh, {
        tanggal: Utilities.parseDate(tanggal, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd'),
        nama_bahan: bahan,
        satuan: prices[bahan].satuan,
        harga: harga
      });
      sh.getRange(row, cm.tanggal).setNumberFormat('yyyy-mm-dd');
      sh.getRange(row, cm.harga).setNumberFormat('#,##0');
    }
  } finally {
    lock.releaseLock();
  }
  return { status: 'ok', tanggal: tanggal, bahan: bahan, harga: harga };
}

/** Beberapa baris input harga terbaru (urut tanggal terbaru). */
function getHargaTerbaru(limit) {
  limit = Math.max(1, Math.min(100, Math.round(num_(limit)) || 15));
  const rows = [];
  readTable_(SHEET.HARGA).forEach(function (r, i) {
    const d = toIso_(r.tanggal);
    const v = num_(r.harga);
    if (!d || isNaN(v)) return;
    rows.push({ tanggal: d, bahan: String(r.nama_bahan), satuan: String(r.satuan), harga: v, urut: i });
  });
  rows.sort(function (a, b) {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
    return b.urut - a.urut;
  });
  return rows.slice(0, limit);
}

/** Daftar bahan beserta harga terakhir dan perubahannya (dibanding 7 data sebelumnya). */
function getBahanList() {
  const prices = buildPrices_();
  return Object.keys(prices).sort().map(function (nama) {
    const s = prices[nama].series;
    const last = s[s.length - 1];
    const refIdx = Math.max(0, s.length - 1 - 7);
    const ref = s[refIdx];
    const chg = s.length > 1 && ref.v > 0 ? (last.v - ref.v) / ref.v * 100 : 0;
    return {
      nama: nama,
      satuan: prices[nama].satuan,
      harga_terakhir: last.v,
      tanggal_terakhir: last.d,
      pembanding_tanggal: ref.d,
      perubahan_persen: round1_(chg)
    };
  });
}

/** Data untuk grafik: harga bahan dan HPP produk per tanggal. */
function getTrenData(days) {
  days = Math.max(7, Math.min(365, Math.round(num_(days)) || 60));
  const st = getSettings_();
  const prices = buildPrices_();
  const resep = groupResep_();
  const produk = readTable_(SHEET.PRODUK);

  const seen = {};
  Object.keys(prices).forEach(function (b) {
    prices[b].series.forEach(function (x) { seen[x.d] = 1; });
  });
  const dates = Object.keys(seen).sort().slice(-days);

  const bahan = {};
  Object.keys(prices).sort().forEach(function (b) {
    const m = {};
    prices[b].series.forEach(function (x) { m[x.d] = x.v; });
    bahan[b] = {
      satuan: prices[b].satuan,
      values: dates.map(function (d) { return m[d] === undefined ? null : m[d]; })
    };
  });

  const hpp = {};
  const info = [];
  produk.forEach(function (p) {
    const id = String(p.id_produk).trim();
    if (!id) return;
    const rs = resep[id] || [];
    info.push({
      id_produk: id,
      nama_produk: String(p.nama_produk),
      harga_jual: num_(p.harga_jual),
      hpp_baseline: num_(p.hpp_baseline)
    });
    hpp[id] = dates.map(function (d) {
      if (!rs.length) return null;
      let tot = 0;
      for (let i = 0; i < rs.length; i++) {
        const b = prices[rs[i].bahan];
        const a = b ? avgLast_(b.series, st.periode_moving_average_hari, d) : null;
        if (a === null) return null;
        tot += a * rs[i].takaran;
      }
      return Math.round(tot);
    });
  });

  return {
    dates: dates,
    bahan: bahan,
    produk: info,
    hpp: hpp,
    periode_ma: st.periode_moving_average_hari,
    batas_naik_persen: st.batas_naik_persen,
    batas_turun_persen: st.batas_turun_persen
  };
}