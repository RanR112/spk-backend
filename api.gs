/**
 * api.gs - Lapisan API Web App: doGet/doPost, pemetaan aksi ke fungsi, dan respons JSON.
 */

/*
 * Script ini hanya berperan sebagai API JSON. Website ada di folder terpisah
 * dan memanggil URL Web App ini lewat fetch().
 *
 *   GET  ?action=NAMA_AKSI[&key=...][&days=60|&limit=15]  -> membaca data
 *   POST body JSON {"action":"NAMA_AKSI","key":"...","payload":{...}}  -> menulis data
 *        (kirim dengan Content-Type: text/plain agar browser tidak melakukan preflight CORS)
 *
 * Respons selalu JSON: {"ok":true,"data":...} atau {"ok":false,"error":"pesan"}
 */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    checkKey_(p.key);
    const action = String(p.action || 'ping');
    if (!READ_ACTIONS.hasOwnProperty(action)) {
      throw new Error(WRITE_ACTIONS[action]
        ? 'Aksi "' + action + '" harus dikirim dengan metode POST.'
        : 'Aksi "' + action + '" tidak dikenal.');
    }
    const param = READ_ACTIONS[action];
    const fn = handlers_()[action];
    const data = param ? fn(p[param]) : fn();
    return json_({ ok: true, data: data === undefined ? null : data });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    let body = {};
    try {
      body = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : '{}');
    } catch (parseErr) {
      throw new Error('Isi permintaan harus berupa JSON.');
    }
    checkKey_(body.key);
    const action = String(body.action || '');
    if (!WRITE_ACTIONS.hasOwnProperty(action)) {
      throw new Error('Aksi "' + action + '" tidak dikenal untuk metode POST.');
    }
    const data = handlers_()[action](body.payload);
    return json_({ ok: true, data: data === undefined ? null : data });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/** Peta nama aksi -> fungsi. Hanya nama di READ_ACTIONS / WRITE_ACTIONS yang pernah mencapai peta ini. */
function handlers_() {
  return {
    ping: ping,
    getDashboard: getDashboard,
    getRecommendations: getRecommendations,
    getBahanList: getBahanList,
    getPengaturan: getPengaturan,
    getTrenData: getTrenData,
    getHargaTerbaru: getHargaTerbaru,
    getRiwayat: getRiwayat,
    getAhp: getAhp,
    addHargaBahan: addHargaBahan,
    savePengaturan: savePengaturan,
    simpanKeRiwayat: simpanKeRiwayat,
    saveMatriksAHP: saveMatriksAHP
  };
}

function checkKey_(key) {
  if (API_KEY && String(key || '') !== API_KEY) {
    throw new Error('API key tidak valid.');
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ping() {
  return { status: 'ok', waktu: new Date().toISOString() };
}

/** Satu panggilan untuk dashboard: rekomendasi dan daftar bahan (mengurangi bolak-balik jaringan). */
function getDashboard() {
  return { rekomendasi: getRecommendations(), bahan: getBahanList() };
}