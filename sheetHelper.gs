/**
 * sheetHelper.gs - Helper akses Google Spreadsheet: buka spreadsheet/sheet, baca tabel, tulis baris.
 */

let SS_CACHE_ = null;

/* ========================= API (Web App) ========================= */

/**
 * Script ini hanya berperan sebagai API JSON. Website ada di folder terpisah
 * dan memanggil URL Web App ini lewat fetch().
 *
 *   GET  ?action=NAMA_AKSI[&key=...][&days=60|&limit=15]  -> membaca data
 *   POST body JSON {"action":"NAMA_AKSI","key":"...","payload":{...}}  -> menulis data
 *        (kirim dengan Content-Type: text/plain agar browser tidak melakukan preflight CORS)
 *
 * Respons selalu JSON: {"ok":true,"data":...} atau {"ok":false,"error":"pesan"}
 */

function ss_() {
  if (!SS_CACHE_) {
    SS_CACHE_ = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  }
  return SS_CACHE_;
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tidak ditemukan. Periksa nama sheet di spreadsheet.');
  return sh;
}

function readTable_(name) {
  const values = sheet_(name).getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values[0].map(function (h) { return String(h).trim(); });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    let empty = true;
    for (let j = 0; j < r.length; j++) {
      if (r[j] !== '' && r[j] !== null) { empty = false; break; }
    }
    if (empty) continue;
    const o = {};
    head.forEach(function (h, j) { o[h] = r[j]; });
    rows.push(o);
  }
  return rows;
}

/** Peta nama kolom -> nomor kolom (mulai 1). */
function colMap_(sh) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const m = {};
  head.forEach(function (h, i) { m[String(h).trim()] = i + 1; });
  return m;
}

/** Tambah baris di bawah data, urutan kolom mengikuti header. Mengembalikan nomor baris baru. */
function appendByHeader_(sh, obj) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = head.map(function (h) {
    const k = String(h).trim();
    return obj.hasOwnProperty(k) ? obj[k] : '';
  });
  sh.appendRow(row);
  return sh.getLastRow();
}