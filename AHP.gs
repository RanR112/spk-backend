/**
 * AHP.gs - Analytical Hierarchy Process: menghitung bobot kriteria SAW dari matriks
 * perbandingan berpasangan (skala Saaty 1-9) beserta uji konsistensi.
 *
 * Matriks disimpan di sheet "Matriks_AHP" (kode | C1 | C2 | C3 | C4).
 *   - Isi HANYA segitiga atas (di atas diagonal): baris i, kolom j dengan i < j.
 *     Nilai = seberapa lebih penting kriteria baris dibanding kriteria kolom.
 *     (1 = sama penting, 3 = sedikit, 5 = lebih, 7 = sangat, 9 = mutlak; kebalikannya 1/3, 1/5, ...)
 *   - Diagonal = 1 dan segitiga bawah dihitung otomatis (kebalikan), jadi isinya diabaikan.
 *   - Tulis pecahan sebagai desimal (0,5) atau rumus (=1/2). Teks "1/2" bisa dibaca Sheets sebagai tanggal.
 * Bila sheet belum ada, matriks default di config.gs dipakai. Jalankan setupMatriksAHP() sekali
 * dari editor untuk membuat sheet-nya.
 */

/** Hitung bobot AHP dari matriks n x n. Mengembalikan bobot, lambda maks, CI, CR, dan status konsisten. */
function hitungAHP_(matrix) {
  const n = matrix.length;
  const colSum = [];
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += matrix[i][j];
    colSum.push(s);
  }

  // Bobot = rata-rata baris dari matriks yang dinormalisasi per kolom.
  const w = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += matrix[i][j] / colSum[j];
    w.push(s / n);
  }

  // Lambda maks = rata-rata ((A.w)_i / w_i).
  let lambda = 0;
  for (let i = 0; i < n; i++) {
    let aw = 0;
    for (let j = 0; j < n; j++) aw += matrix[i][j] * w[j];
    lambda += aw / w[i];
  }
  lambda = lambda / n;

  const ci = n > 1 ? Math.max(0, (lambda - n) / (n - 1)) : 0;
  const ri = AHP_RI[n] || 0;
  const cr = ri > 0 ? ci / ri : 0;

  return {
    bobot: w,
    lambda_max: lambda,
    ci: ci,
    ri: ri,
    cr: cr,
    konsisten: cr < AHP_CR_MAKS
  };
}

/** Ubah isi sel menjadi angka Saaty. Mendukung angka, "0,5", dan "1/2". NaN bila tidak valid. */
function parseSaaty_(v) {
  if (typeof v === 'number') return v;
  if (Object.prototype.toString.call(v) === '[object Date]') return NaN;
  const s = String(v === null || v === undefined ? '' : v).trim();
  if (s === '') return NaN;
  const f = s.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/);
  if (f) {
    const a = parseFloat(f[1].replace(',', '.'));
    const b = parseFloat(f[2].replace(',', '.'));
    return b > 0 ? a / b : NaN;
  }
  if (/^[\d.,]+$/.test(s)) return num_(s);
  return NaN;
}

/** Periksa satu nilai perbandingan: harus di antara 1/9 dan 9. */
function cekNilaiSaaty_(x, label) {
  if (isNaN(x)) {
    throw new Error('Nilai perbandingan ' + label + ' tidak valid. Isi dengan angka (mis. 3 atau 0,5), bukan teks pecahan seperti "1/2".');
  }
  if (x < 1 / 9 - 1e-9 || x > 9 + 1e-9) {
    throw new Error('Nilai perbandingan ' + label + ' harus di antara 1/9 dan 9.');
  }
}

/** Bangun matriks penuh dari segitiga atas. */
function bangunMatriks_(upper) {
  const n = AHP_KRITERIA.length;
  const m = [];
  for (let i = 0; i < n; i++) {
    m.push([]);
    for (let j = 0; j < n; j++) m[i].push(i === j ? 1 : 0);
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const x = upper(i, j);
      cekNilaiSaaty_(x, AHP_KRITERIA[i].kode + ' vs ' + AHP_KRITERIA[j].kode);
      m[i][j] = x;
      m[j][i] = 1 / x;
    }
  }
  return m;
}

/** Baca matriks dari sheet Matriks_AHP; bila sheet tidak ada, pakai matriks default. */
function readAhpMatrix_() {
  const sh = ss_().getSheetByName(SHEET.AHP);
  if (!sh) {
    return {
      matrix: bangunMatriks_(function (i, j) { return AHP_DEFAULT_MATRIX[i][j]; }),
      sumber: 'default'
    };
  }

  const v = sh.getDataRange().getValues();
  const head = (v[0] || []).map(function (h) { return String(h).trim(); });
  const colIdx = {};
  AHP_KRITERIA.forEach(function (k) {
    const c = head.indexOf(k.kode);
    if (c < 0) throw new Error('Kolom "' + k.kode + '" tidak ditemukan di sheet ' + SHEET.AHP + '.');
    colIdx[k.kode] = c;
  });
  const rowIdx = {};
  for (let r = 1; r < v.length; r++) rowIdx[String(v[r][0]).trim()] = r;
  AHP_KRITERIA.forEach(function (k) {
    if (rowIdx[k.kode] === undefined) throw new Error('Baris "' + k.kode + '" tidak ditemukan di sheet ' + SHEET.AHP + '.');
  });

  const matrix = bangunMatriks_(function (i, j) {
    const kr = AHP_KRITERIA[i].kode;
    const kc = AHP_KRITERIA[j].kode;
    return parseSaaty_(v[rowIdx[kr]][colIdx[kc]]);
  });
  return { matrix: matrix, sumber: 'sheet' };
}

/**
 * Bobot yang dipakai SAW.
 *   - gunakan_ahp = 1 dan matriks konsisten (CR < 0,1) -> bobot AHP
 *   - selain itu                                      -> bobot manual dari Pengaturan, plus peringatan
 */
function getBobotAHP_(st) {
  const manual = {};
  AHP_KRITERIA.forEach(function (k) { manual[k.kode] = st[k.manual_key]; });

  if (!st.gunakan_ahp) {
    return { bobot: manual, sumber: 'manual', ahp: null, peringatan: '' };
  }

  try {
    const r = readAhpMatrix_();
    const h = hitungAHP_(r.matrix);
    const info = ringkasAHP_(h, r);
    if (!h.konsisten) {
      return {
        bobot: manual,
        sumber: 'manual',
        ahp: info,
        peringatan: 'Matriks AHP tidak konsisten (CR ' + fmt2_(h.cr) + ' >= ' + fmt1_(AHP_CR_MAKS) +
          '). Bobot manual dipakai. Perbaiki penilaian di sheet ' + SHEET.AHP + '.'
      };
    }
    const bobot = {};
    AHP_KRITERIA.forEach(function (k, i) { bobot[k.kode] = h.bobot[i]; });
    return { bobot: bobot, sumber: 'AHP', ahp: info, peringatan: '' };
  } catch (err) {
    return {
      bobot: manual,
      sumber: 'manual',
      ahp: null,
      peringatan: 'AHP tidak dapat dihitung: ' + String(err && err.message ? err.message : err) + ' Bobot manual dipakai.'
    };
  }
}

function ringkasAHP_(h, r) {
  return {
    matriks_sumber: r.sumber,
    kriteria: AHP_KRITERIA.map(function (k, i) {
      return { kode: k.kode, nama: k.nama, bobot: Math.round(h.bobot[i] * 10000) / 10000 };
    }),
    matriks: r.matrix.map(function (row) {
      return row.map(function (x) { return Math.round(x * 10000) / 10000; });
    }),
    lambda_max: Math.round(h.lambda_max * 10000) / 10000,
    ci: Math.round(h.ci * 10000) / 10000,
    ri: h.ri,
    cr: Math.round(h.cr * 10000) / 10000,
    ambang_cr: AHP_CR_MAKS,
    konsisten: h.konsisten
  };
}

/* ========================= API publik ========================= */

/** Bobot AHP, matriks, dan hasil uji konsistensi (untuk ditampilkan di dashboard). */
function getAhp() {
  const st = getSettings_();
  const r = readAhpMatrix_();
  const h = hitungAHP_(r.matrix);
  const dipakai = getBobotAHP_(st);
  const out = ringkasAHP_(h, r);
  out.gunakan_ahp = !!st.gunakan_ahp;
  out.bobot_dipakai = dipakai.sumber;
  out.peringatan = dipakai.peringatan;
  return out;
}

/**
 * Simpan matriks perbandingan. payload.matriks = array n x n (hanya segitiga atas yang dibaca;
 * pecahan boleh berupa angka atau teks "1/2"). Mengembalikan hasil getAhp().
 */
function saveMatriksAHP(payload) {
  payload = payload || {};
  const n = AHP_KRITERIA.length;
  const input = payload.matriks;
  if (!Array.isArray(input) || input.length !== n) {
    throw new Error('Matriks harus berukuran ' + n + ' x ' + n + '.');
  }
  const matrix = bangunMatriks_(function (i, j) {
    if (!Array.isArray(input[i]) || input[i].length !== n) {
      throw new Error('Baris ' + (i + 1) + ' harus punya ' + n + ' nilai.');
    }
    return parseSaaty_(input[i][j]);
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    tulisSheetAhp_(matrix);
  } finally {
    lock.releaseLock();
  }
  return getAhp();
}

/** Jalankan sekali dari editor Apps Script untuk membuat sheet Matriks_AHP berisi matriks default. */
function setupMatriksAHP() {
  if (ss_().getSheetByName(SHEET.AHP)) {
    throw new Error('Sheet ' + SHEET.AHP + ' sudah ada. Hapus atau ubah langsung di sheet-nya.');
  }
  tulisSheetAhp_(bangunMatriks_(function (i, j) { return AHP_DEFAULT_MATRIX[i][j]; }));
  return { status: 'ok', sheet: SHEET.AHP };
}

function tulisSheetAhp_(matrix) {
  const n = AHP_KRITERIA.length;
  let sh = ss_().getSheetByName(SHEET.AHP);
  if (!sh) sh = ss_().insertSheet(SHEET.AHP);
  const rows = [['kode'].concat(AHP_KRITERIA.map(function (k) { return k.kode; }))];
  for (let i = 0; i < n; i++) {
    rows.push([AHP_KRITERIA[i].kode].concat(matrix[i].map(function (x) { return Math.round(x * 1e6) / 1e6; })));
  }
  sh.clearContents();
  sh.getRange(1, 1, rows.length, n + 1).setValues(rows);
  sh.getRange(2, 2, n, n).setNumberFormat('0.####');
  sh.getRange(n + 3, 1).setValue('Isi hanya segitiga atas (di atas diagonal). Segitiga bawah dihitung otomatis dan diabaikan.');
  sh.getRange(n + 4, 1).setValue('Skala: 1 sama penting, 3 sedikit lebih, 5 lebih, 7 sangat, 9 mutlak; kebalikannya 1/3, 1/5, 1/7, 1/9 (tulis desimal).');
}