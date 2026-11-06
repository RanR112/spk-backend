'use strict';
// Uji backend Apps Script (spk-backend) di Node: 12 berkas .gs asli dimuat ke sandbox vm
// dengan SpreadsheetApp/Utilities/LockService/ContentService tiruan. Ini simulasi lokal,
// bukan eksekusi di Apps Script sungguhan.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = process.argv[2];
const OUT = process.argv[3];
if (!REPO) { console.error('usage: node backend-test.js <repo-dir> [out.json]'); process.exit(2); }

const FILES = ['config.gs', 'utils.gs', 'sheetHelper.gs', 'settings.gs', 'price.gs', 'recipe.gs',
  'decision.gs', 'AHP.gs', 'SAW.gs', 'recommendation.gs', 'history.gs', 'api.gs'];
const SRC = {};
FILES.forEach(function (f) { SRC[f] = fs.readFileSync(path.join(REPO, f), 'utf8'); });

/* ---------- sandbox tiruan ---------- */
class MockRange {
  constructor(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  setValues(v) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.set(this.r + i, this.c + j, v[i][j]);
    return this;
  }
  setValue(v) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.set(this.r + i, this.c + j, v);
    return this;
  }
  setNumberFormat() { return this; }
}
class MockSheet {
  constructor(name, rows) { this.name = name; this.data = rows.map(function (r) { return r.slice(); }); }
  get(r, c) { const row = this.data[r - 1]; return row && row[c - 1] !== undefined ? row[c - 1] : ''; }
  set(r, c, v) {
    while (this.data.length < r) this.data.push([]);
    const row = this.data[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v;
  }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data.reduce(function (m, r) { return Math.max(m, r.length); }, 0); }
  getRange(r, c, nr, nc) { return new MockRange(this, r, c, nr === undefined ? 1 : nr, nc === undefined ? 1 : nc); }
  getDataRange() { return new MockRange(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  appendRow(row) { this.data.push(row.slice()); }
  clearContents() { this.data = []; return this; }
}
class MockSS {
  constructor(sheets) {
    this.sheets = {};
    const self = this;
    Object.keys(sheets).forEach(function (n) { self.sheets[n] = new MockSheet(n, sheets[n]); });
  }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { this.sheets[n] = new MockSheet(n, []); return this.sheets[n]; }
  getSpreadsheetTimeZone() { return 'Asia/Jakarta'; }
}

function makeEnv(sheetsData, opts) {
  opts = opts || {};
  const ss = new MockSS(sheetsData);
  const sandbox = {
    console: console,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, openById: function () { return ss; } },
    Utilities: {
      formatDate: function (d, tz) {
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      },
      parseDate: function (s) { return new Date(s + 'T00:00:00+07:00'); }
    },
    LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {}, tryLock: function () { return true; } }; } },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: function (t) {
        return { _t: t, setMimeType: function (m) { this._m = m; return this; }, getContent: function () { return this._t; } };
      }
    }
  };
  const ctx = vm.createContext(sandbox);
  FILES.forEach(function (f) {
    let src = SRC[f];
    if (f === 'config.gs' && opts.apiKey !== undefined) {
      src = src.replace("const API_KEY = '';", "const API_KEY = '" + opts.apiKey + "';");
    }
    new vm.Script(src, { filename: f }).runInContext(ctx);
  });
  return {
    ss: ss,
    call: function (name) { return ctx[name].apply(null, Array.prototype.slice.call(arguments, 1)); },
    ev: function (code) { return vm.runInContext(code, ctx); }
  };
}

/* ---------- kerangka uji ---------- */
const results = [];
const info = {};
function T(group, name, fn) {
  try { fn(); results.push({ group: group, name: name, ok: true }); }
  catch (e) { results.push({ group: group, name: name, ok: false, err: e.message }); }
}
function J(x) { return JSON.parse(JSON.stringify(x === undefined ? null : x)); }
function eq(a, b, m) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error((m || 'eq') + ': dapat ' + x + ', diharapkan ' + y);
}
function near(a, b, tol, m) {
  if (!(Math.abs(a - b) <= tol)) throw new Error((m || 'near') + ': dapat ' + a + ', diharapkan ' + b + ' (toleransi ' + tol + ')');
}
function ok(c, m) { if (!c) throw new Error(m || 'kondisi salah'); }
function throwsWith(fn, expected) {
  let msg = null;
  try { fn(); } catch (e) { msg = e.message; }
  if (msg === null) throw new Error('tidak melempar galat; diharapkan memuat: ' + expected);
  if (msg.indexOf(expected) < 0) throw new Error('pesan galat "' + msg + '" tidak memuat "' + expected + '"');
}

/* ---------- data uji sintetis ---------- */
const A_DATES = ['2026-09-01', '2026-09-05', '2026-09-09', '2026-09-13', '2026-09-17', '2026-09-21', '2026-09-25', '2026-09-29', '2026-10-03', '2026-10-07'];
const A_VALS = [1000, 1000, 1000, 200, 200, 200, 200, 200, 200, 200];
function hargaRows() {
  const rows = [['tanggal', 'nama_bahan', 'satuan', 'harga']];
  A_DATES.forEach(function (d, i) { rows.push([d, 'A', 'kg', A_VALS[i]]); });
  A_DATES.slice(0, 8).forEach(function (d) { rows.push([d, 'B', 'liter', 300]); });
  return rows;
}
function produkRows() {
  return [['id_produk', 'nama_produk', 'harga_jual', 'hpp_baseline'],
    ['P1', 'Naik karena HPP', 2000, 600],
    ['P2', 'Naik karena margin', 1000, 690],
    ['P3', 'Promo', 2000, 800],
    ['P4', 'Tahan', 2000, 680],
    ['P5', 'Bahan tanpa harga', 2000, 600],
    ['P6', 'Tanpa resep', 2000, 600],
    ['P7', 'Harga jual nol', 0, 600]];
}
function resepRows() {
  const rows = [['id_produk', 'nama_produk', 'bahan', 'takaran_per_porsi', 'satuan']];
  ['P1', 'P2', 'P3', 'P4', 'P7'].forEach(function (id) {
    rows.push([id, 'x', 'A', 2, 'kg']);
    rows.push([id, 'x', 'B', 1, 'liter']);
  });
  rows.push(['P5', 'x', 'A', 2, 'kg']);
  rows.push(['P5', 'x', 'C', 1, 'kg']);
  return rows;
}
function fullSheets() {
  return {
    Harga_Bahan: hargaRows(),
    Produk: produkRows(),
    Resep: resepRows(),
    Pengaturan: [['parameter', 'nilai', 'keterangan']],
    Riwayat_Keputusan: [['tanggal', 'id_produk', 'nama_produk', 'hpp', 'perubahan_hpp_persen', 'margin_persen', 'keputusan', 'harga_saran', 'keterangan', 'skor_saw', 'peringkat']]
  };
}

/* ====================== 1. Berkas ====================== */
T('berkas', 'repositori berisi tepat 12 berkas .gs yang dimuat', function () {
  const onDisk = fs.readdirSync(REPO).filter(function (f) { return /\.gs$/.test(f); }).sort();
  eq(onDisk, FILES.slice().sort());
});
T('berkas', 'seluruh berkas termuat bersama tanpa galat deklarasi ganda', function () {
  makeEnv(fullSheets());
});
T('berkas', 'handlers_ memuat tepat aksi di READ_ACTIONS + WRITE_ACTIONS (13 aksi)', function () {
  const e = makeEnv(fullSheets());
  const h = e.ev('Object.keys(handlers_()).sort().join(",")');
  const a = e.ev('Object.keys(READ_ACTIONS).concat(Object.keys(WRITE_ACTIONS)).sort().join(",")');
  eq(h, a);
  eq(h.split(',').length, 13);
});

/* ====================== 2. Utilitas ====================== */
(function () {
  const e = makeEnv(fullSheets());
  T('util', 'num_: format angka Indonesia dan Rp', function () {
    eq(e.call('num_', 'Rp 1.500,50'), 1500.5);
    eq(e.call('num_', '1.500'), 1500);
    eq(e.call('num_', '12,5'), 12.5);
    eq(e.call('num_', 7), 7);
    ok(isNaN(e.call('num_', '')), 'string kosong harus NaN');
    ok(isNaN(e.call('num_', 'abc')), 'teks harus NaN');
    ok(isNaN(e.call('num_', null)), 'null harus NaN');
  });
  T('util', 'toIso_: yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy, Date, dan tidak valid', function () {
    eq(e.call('toIso_', '2026-10-02'), '2026-10-02');
    eq(e.call('toIso_', '2026-10-02T10:00:00'), '2026-10-02');
    eq(e.call('toIso_', '02/10/2026'), '2026-10-02');
    eq(e.call('toIso_', '2-10-2026'), '2026-10-02');
    eq(e.call('toIso_', new Date('2026-10-02T00:00:00+07:00')), '2026-10-02');
    eq(e.call('toIso_', 'abc'), '');
    eq(e.call('toIso_', ''), '');
    eq(e.call('toIso_', null), '');
    eq(e.call('toIso_', new Date('x')), '');
  });
  T('util', 'ceilTo_: pembulatan ke atas ke kelipatan', function () {
    eq(e.call('ceilTo_', 12501, 500), 13000);
    eq(e.call('ceilTo_', 12500, 500), 12500);
    eq(e.call('ceilTo_', 10, 0), 10);
  });
  T('util', 'rupiah_, fmt1_, fmt2_, round1_', function () {
    eq(e.call('rupiah_', 1234567), 'Rp1.234.567');
    eq(e.call('fmt1_', 12.34), '12,3');
    eq(e.call('fmt2_', 0.0115), '0,01');
    eq(e.call('round1_', 16.6667), 16.7);
  });
  T('util', 'readTable_ melewati baris kosong dan memakai header', function () {
    const e2 = makeEnv({ Produk: [['id_produk', 'nama_produk'], ['P1', 'a'], ['', ''], ['P2', 'b']] });
    const t = J(e2.call('readTable_', 'Produk'));
    eq(t.length, 2);
    eq(t[1].nama_produk, 'b');
  });
  T('util', 'sheet_ melempar galat jelas bila sheet tidak ada', function () {
    throwsWith(function () { e.call('sheet_', 'TidakAda'); }, 'Sheet "TidakAda" tidak ditemukan');
  });
})();

/* ====================== 3. AHP ====================== */
(function () {
  const e = makeEnv(fullSheets());
  const defMatrix = function () { return e.ev('bangunMatriks_(function (i, j) { return AHP_DEFAULT_MATRIX[i][j]; })'); };

  T('AHP', 'hitungAHP_ matriks bawaan = hitung manual Bab IV (bobot, lambda maks, CI, CR)', function () {
    const h = J(e.call('hitungAHP_', defMatrix()));
    info.ahp_default = h;
    [0.2771, 0.4658, 0.1611, 0.0960].forEach(function (x, i) { near(h.bobot[i], x, 0.00006, 'bobot C' + (i + 1)); });
    near(h.lambda_max, 4.0310, 0.0005, 'lambda maks');
    near(h.ci, 0.0103, 0.0001, 'CI');
    near(h.cr, 0.0115, 0.0001, 'CR');
    eq(h.ri, 0.9);
    eq(h.konsisten, true);
  });
  T('AHP', 'jumlah bobot = 1', function () {
    const h = J(e.call('hitungAHP_', defMatrix()));
    near(h.bobot.reduce(function (a, b) { return a + b; }, 0), 1, 1e-9);
  });
  T('AHP', 'matriks semua 1: bobot sama 0,25 dan CR 0', function () {
    const m = e.ev('bangunMatriks_(function () { return 1; })');
    const h = J(e.call('hitungAHP_', m));
    h.bobot.forEach(function (b) { near(b, 0.25, 1e-9); });
    near(h.cr, 0, 1e-9);
    eq(h.konsisten, true);
  });
  T('AHP', 'matriks bertentangan (siklus 9, 9, 1/9): CR >= 0,1 dan tidak konsisten', function () {
    const up = { '0,1': 9, '0,2': 1 / 9, '0,3': 1, '1,2': 9, '1,3': 1, '2,3': 1 };
    e.ev('globalThis.__up = ' + JSON.stringify(up));
    const m = e.ev('bangunMatriks_(function (i, j) { return globalThis.__up[i + "," + j]; })');
    const h = J(e.call('hitungAHP_', m));
    info.ahp_siklus = { cr: h.cr };
    ok(h.cr >= 0.1, 'CR ' + h.cr);
    eq(h.konsisten, false);
  });
  T('AHP', 'bangunMatriks_: segitiga bawah = kebalikan, diagonal 1', function () {
    const m = J(defMatrix());
    eq(m[0][0], 1);
    near(m[1][0], 1 / m[0][1], 1e-12);
    near(m[3][2], 1 / m[2][3], 1e-12);
  });
  T('AHP', 'bangunMatriks_ menolak nilai > 9, < 1/9, dan NaN', function () {
    throwsWith(function () { e.ev('bangunMatriks_(function () { return 10; })'); }, 'harus di antara 1/9 dan 9');
    throwsWith(function () { e.ev('bangunMatriks_(function () { return 0.05; })'); }, 'harus di antara 1/9 dan 9');
    throwsWith(function () { e.ev('bangunMatriks_(function () { return NaN; })'); }, 'tidak valid');
  });
  T('AHP', 'parseSaaty_: angka, "1/2", "0,5", "1 / 3", teks, Date, pembagi nol', function () {
    eq(e.call('parseSaaty_', 3), 3);
    eq(e.call('parseSaaty_', '1/2'), 0.5);
    eq(e.call('parseSaaty_', '0,5'), 0.5);
    near(e.call('parseSaaty_', '1 / 3'), 1 / 3, 1e-12);
    eq(e.call('parseSaaty_', '3'), 3);
    ok(isNaN(e.call('parseSaaty_', '')), 'kosong');
    ok(isNaN(e.call('parseSaaty_', 'abc')), 'teks');
    ok(isNaN(e.call('parseSaaty_', new Date('2026-02-01'))), 'Date');
    ok(isNaN(e.call('parseSaaty_', '1/0')), 'pembagi nol');
  });
  T('AHP', 'getAhp tanpa sheet Matriks_AHP: sumber default, bobot AHP dipakai', function () {
    const r = J(e.call('getAhp'));
    eq(r.matriks_sumber, 'default');
    eq(r.bobot_dipakai, 'AHP');
    eq(r.gunakan_ahp, true);
    eq(r.konsisten, true);
    eq(r.peringatan, '');
  });
  T('AHP', 'setupMatriksAHP membuat sheet; panggilan kedua ditolak', function () {
    const e2 = makeEnv(fullSheets());
    const r = J(e2.call('setupMatriksAHP'));
    eq(r.sheet, 'Matriks_AHP');
    const a = J(e2.call('getAhp'));
    eq(a.matriks_sumber, 'sheet');
    near(a.cr, 0.0115, 0.0001);
    throwsWith(function () { e2.call('setupMatriksAHP'); }, 'sudah ada');
  });
  T('AHP', 'saveMatriksAHP menerima teks pecahan "1/2" dan menyimpannya sebagai angka', function () {
    const e2 = makeEnv(fullSheets());
    const mat = [[1, '1/2', 2, 3], [2, 1, 3, 4], [0.5, 0.3333, 1, 2], [0.3333, 0.25, 0.5, 1]];
    const r = J(e2.call('saveMatriksAHP', { matriks: mat }));
    eq(r.matriks_sumber, 'sheet');
    near(r.kriteria[0].bobot, 0.2771, 0.0001);
    eq(e2.ss.sheets.Matriks_AHP.get(2, 3), 0.5);
  });
  T('AHP', 'saveMatriksAHP menolak ukuran salah, baris pendek, nilai di luar skala, nilai bukan angka', function () {
    const e2 = makeEnv(fullSheets());
    throwsWith(function () { e2.call('saveMatriksAHP', { matriks: [[1, 2], [0.5, 1]] }); }, 'Matriks harus berukuran 4 x 4.');
    throwsWith(function () { e2.call('saveMatriksAHP', {}); }, 'Matriks harus berukuran 4 x 4.');
    throwsWith(function () { e2.call('saveMatriksAHP', { matriks: [[1, 2, 3], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]] }); }, 'Baris 1 harus punya 4 nilai.');
    throwsWith(function () { e2.call('saveMatriksAHP', { matriks: [[1, 10, 2, 3], [1, 1, 3, 4], [1, 1, 1, 2], [1, 1, 1, 1]] }); }, 'harus di antara 1/9 dan 9');
    throwsWith(function () { e2.call('saveMatriksAHP', { matriks: [[1, 'abc', 2, 3], [1, 1, 3, 4], [1, 1, 1, 2], [1, 1, 1, 1]] }); }, 'tidak valid');
  });
  T('AHP', 'getBobotAHP_: gunakan_ahp=0 memakai bobot manual tanpa peringatan', function () {
    const sh = fullSheets();
    sh.Pengaturan.push(['gunakan_ahp', 0, '']);
    const e2 = makeEnv(sh);
    const b = J(e2.call('getBobotAHP_', e2.call('getSettings_')));
    eq(b.sumber, 'manual');
    eq(b.peringatan, '');
    eq(b.bobot, { C1: 0.35, C2: 0.3, C3: 0.2, C4: 0.15 });
    eq(b.ahp, null);
  });
  T('AHP', 'getBobotAHP_: matriks tidak konsisten -> manual + peringatan CR', function () {
    const sh = fullSheets();
    sh.Matriks_AHP = [['kode', 'C1', 'C2', 'C3', 'C4'],
      ['C1', 1, 9, 1 / 9, 1], ['C2', 1 / 9, 1, 9, 1], ['C3', 9, 1 / 9, 1, 1], ['C4', 1, 1, 1, 1]];
    const e2 = makeEnv(sh);
    const b = J(e2.call('getBobotAHP_', e2.call('getSettings_')));
    eq(b.sumber, 'manual');
    ok(b.peringatan.indexOf('Matriks AHP tidak konsisten') === 0, b.peringatan);
    eq(b.ahp.konsisten, false);
  });
  T('AHP', 'getBobotAHP_: sel berisi Date (Sheets mengubah "1/2" jadi tanggal) -> manual + peringatan "tidak dapat dihitung"', function () {
    const sh = fullSheets();
    sh.Matriks_AHP = [['kode', 'C1', 'C2', 'C3', 'C4'],
      ['C1', 1, new Date('2026-02-01'), 2, 3], ['C2', 2, 1, 3, 4], ['C3', 0.5, 0.3333, 1, 2], ['C4', 0.3333, 0.25, 0.5, 1]];
    const e2 = makeEnv(sh);
    const b = J(e2.call('getBobotAHP_', e2.call('getSettings_')));
    eq(b.sumber, 'manual');
    ok(b.peringatan.indexOf('AHP tidak dapat dihitung') === 0 && b.peringatan.indexOf('C1 vs C2') > 0, b.peringatan);
  });
  T('AHP', 'getBobotAHP_: kolom kriteria hilang -> manual + pesan kolom', function () {
    const sh = fullSheets();
    sh.Matriks_AHP = [['kode', 'C1', 'C2', 'C4'], ['C1', 1, 2, 3], ['C2', 0.5, 1, 4], ['C3', 1, 1, 1], ['C4', 1, 1, 1]];
    const e2 = makeEnv(sh);
    const b = J(e2.call('getBobotAHP_', e2.call('getSettings_')));
    eq(b.sumber, 'manual');
    ok(b.peringatan.indexOf('Kolom "C3" tidak ditemukan') > 0, b.peringatan);
  });
})();

/* ====================== 4. SAW (data Bab VII) ====================== */
(function () {
  const BB7 = [
    ['Ayam Geprek + Nasi', 13.8, 28.49, 44.02],
    ['Pisang Goreng', -15.7, 50.81, 57.15],
    ['Nasi Telur Dadar', 11.2, 48.35, 47.01],
    ['Ayam Goreng + Nasi', 8.2, 45.06, 57.30],
    ['Bakwan Sayur', -10.1, 49.80, 34.91],
    ['Mie Rebus Telur', 11.3, 57.05, 40.60],
    ['Nasi Goreng Spesial', 10.1, 57.06, 27.89],
    ['Mie Goreng', 7.4, 58.21, 38.94],
    ['Es Teh Manis', -0.1, 80.53, 57.64]
  ];
  const EXP_A = [0.9438, 0.6335, 0.5504, 0.5346, 0.5029, 0.4997, 0.4573, 0.4234, 0.2626];
  const EXP_B = [0.9438, 0.6931, 0.6131, 0.6018, 0.5637, 0.5527, 0.5104, 0.4755, 0.3002];

  function run(marginAyam) {
    const e = makeEnv(fullSheets());
    const items = BB7.map(function (r, i) {
      return { nama_produk: r[0], keputusan: 'PERTAHANKAN', perubahan_persen: r[1],
        margin_persen: i === 0 && marginAyam ? marginAyam : r[2], porsi_maks_persen: r[3] };
    });
    const saw = J(e.call('applySAW_', items, e.call('getSettings_')));
    return { items: items, saw: saw };
  }
  T('SAW', 'applySAW_ skenario A (harga jual Rp20.000) = skor Bab VII 7.5.2 (toleransi 0,0012)', function () {
    const r = run(null);
    info.saw_A = r.items.map(function (it) { return [it.nama_produk, it.skor_saw, it.peringkat]; });
    r.items.forEach(function (it, i) { near(it.skor_saw, EXP_A[i], 0.0012, it.nama_produk); eq(it.peringkat, i + 1, 'peringkat ' + it.nama_produk); });
    eq(r.saw.sumber_bobot, 'AHP');
    eq(r.saw.jumlah_alternatif, 9);
  });
  T('SAW', 'applySAW_ skenario B (margin Ayam Geprek 34,99%) = skor Bab VII', function () {
    const r = run(34.99);
    info.saw_B = r.items.map(function (it) { return [it.nama_produk, it.skor_saw, it.peringkat]; });
    r.items.forEach(function (it, i) { near(it.skor_saw, EXP_B[i], 0.0012, it.nama_produk); eq(it.peringkat, i + 1); });
  });
  T('SAW', 'bobot kriteria pada keluaran SAW = bobot AHP dan berjumlah 1', function () {
    const r = run(null);
    const b = r.saw.kriteria.map(function (k) { return k.bobot; });
    [0.277, 0.466, 0.161, 0.096].forEach(function (x, i) { near(b[i], x, 0.0011); });
    near(b.reduce(function (a, c) { return a + c; }, 0), 1, 0.0021);
  });
  T('SAW', 'tipe kriteria: C1, C3, C4 benefit; C2 cost', function () {
    const r = run(null);
    eq(r.saw.kriteria.map(function (k) { return k.tipe; }), ['benefit', 'cost', 'benefit', 'benefit']);
  });
  T('SAW', 'saw_normal berisi r1..r4 dan nilai berada di 0..1', function () {
    const r = run(null);
    r.items.forEach(function (it) {
      eq(Object.keys(it.saw_normal), ['C1', 'C2', 'C3', 'C4']);
      Object.keys(it.saw_normal).forEach(function (k) { ok(it.saw_normal[k] >= 0 && it.saw_normal[k] <= 1, k); });
    });
  });
  T('SAW', 'produk DATA TIDAK LENGKAP tidak ikut SAW; bila semuanya DATA hasilnya null', function () {
    const e = makeEnv(fullSheets());
    const items = [{ keputusan: 'DATA TIDAK LENGKAP' }, { keputusan: 'DATA TIDAK LENGKAP' }];
    eq(e.call('applySAW_', items, e.call('getSettings_')), null);
    const mix = [
      { keputusan: 'DATA TIDAK LENGKAP', skor_saw: null, peringkat: null },
      { keputusan: 'PERTAHANKAN', perubahan_persen: 5, margin_persen: 50, porsi_maks_persen: 40 }
    ];
    const s = J(e.call('applySAW_', mix, e.call('getSettings_')));
    eq(s.jumlah_alternatif, 1);
    eq(mix[0].peringkat, null);
    eq(mix[1].peringkat, 1);
  });
  T('SAW', 'seri skor dipecah oleh |perubahan HPP| terbesar', function () {
    const e = makeEnv(fullSheets());
    const mk = function (p) { return { keputusan: 'PERTAHANKAN', perubahan_persen: p, margin_persen: 50, porsi_maks_persen: 40 }; };
    // C1 berbeda sehingga skor berbeda; untuk seri sejati pakai dua produk identik
    const a = mk(10), b = mk(10);
    e.call('applySAW_', [a, b], e.call('getSettings_'));
    eq(a.skor_saw, b.skor_saw);
    eq([a.peringkat, b.peringkat].sort(), [1, 2]);
  });
  T('SAW', 'margin nol atau negatif tidak menyebabkan pembagian nol (lantai 0,1)', function () {
    const e = makeEnv(fullSheets());
    const items = [
      { keputusan: 'NAIKKAN HARGA', perubahan_persen: 12, margin_persen: -5, porsi_maks_persen: 50 },
      { keputusan: 'PERTAHANKAN', perubahan_persen: 2, margin_persen: 60, porsi_maks_persen: 30 }
    ];
    e.call('applySAW_', items, e.call('getSettings_'));
    items.forEach(function (it) { ok(isFinite(it.skor_saw), 'skor harus berhingga'); });
    eq(items[0].peringkat, 1);
  });
})();

/* ====================== 5. Keputusan (evaluate_) dan rekomendasi ====================== */
(function () {
  const e = makeEnv(fullSheets());
  const rec = J(e.call('getRecommendations'));
  info.rekomendasi = rec.items.map(function (i) { return [i.id_produk, i.keputusan, i.hpp, i.perubahan_persen, i.margin_persen, i.harga_saran, i.skor_saw, i.peringkat]; });
  const byId = {};
  rec.items.forEach(function (i) { byId[i.id_produk] = i; });

  T('keputusan', 'moving average memakai N DATA terakhir (bukan N hari kalender)', function () {
    // A: 10 entri tanggal berselang 4 hari; 7 entri terakhir semuanya 200. Jika memakai 10 entri hasilnya 440.
    const rin = byId.P1.rincian.filter(function (r) { return r.bahan === 'A'; })[0];
    eq(rin.harga_rata2, 200);
    const rinB = byId.P1.rincian.filter(function (r) { return r.bahan === 'B'; })[0];
    eq(rinB.harga_rata2, 300);
  });
  T('keputusan', 'HPP = jumlah (rata-rata x takaran); rincian terurut dari biaya terbesar; porsi bahan termahal', function () {
    eq(byId.P1.hpp, 700);
    eq(byId.P1.rincian.map(function (r) { return r.bahan; }), ['A', 'B']);
    eq(byId.P1.rincian[0].biaya, 400);
    eq(byId.P1.porsi_maks_persen, 57.1);
    eq(byId.P1.rincian[0].porsi_persen, 57.1);
  });
  T('keputusan', 'NAIKKAN karena HPP: perubahan, margin, harga saran (ke atas, kelipatan 500), urgensi Sedang', function () {
    const p = byId.P1;
    eq(p.keputusan, 'NAIKKAN HARGA');
    eq(p.perubahan_persen, 16.7);
    eq(p.margin_persen, 65);
    eq(p.margin_awal_persen, 70);
    eq(p.harga_saran, 2500);   // max(700/0.55=1272,7 ; 700/0.30=2333,3) -> 2500
    eq(p.kenaikan_rp, 500);
    eq(p.urgensi, 'Sedang');   // rasio 16,67/10 = 1,67
    ok(p.keterangan.indexOf('Naikkan harga karena HPP naik 16,7%') === 0, p.keterangan);
  });
  T('keputusan', 'NAIKKAN karena margin < minimum meski HPP naik kecil: urgensi Tinggi', function () {
    const p = byId.P2;
    eq(p.keputusan, 'NAIKKAN HARGA');
    eq(p.perubahan_persen, 1.4);
    eq(p.margin_persen, 30);
    eq(p.harga_saran, 1500);   // 700/0,55 = 1272,7 -> 1500
    eq(p.urgensi, 'Tinggi');
    ok(p.keterangan.indexOf('margin 30,00% di bawah minimum 35,0%') > 0, p.keterangan);
  });
  T('keputusan', 'PROMO: diskon maksimum aman dan hemat per porsi', function () {
    const p = byId.P3;
    eq(p.keputusan, 'BERI PROMO');
    eq(p.perubahan_persen, -12.5);
    eq(p.diskon_maks_persen, 46.1);   // 1 - 700/0,65/2000
    eq(p.hemat_per_porsi, 100);
    eq(p.harga_saran, null);
  });
  T('keputusan', 'PERTAHANKAN bila perubahan dan margin dalam batas', function () {
    eq(byId.P4.keputusan, 'PERTAHANKAN');
    eq(byId.P4.perubahan_persen, 2.9);
    eq(byId.P4.harga_saran, null);
  });
  T('keputusan', 'DATA TIDAK LENGKAP: bahan tanpa harga, resep kosong, harga jual nol', function () {
    eq(byId.P5.keputusan, 'DATA TIDAK LENGKAP');
    eq(byId.P5.keterangan, 'Harga belum tersedia untuk: C.');
    eq(byId.P6.keterangan, 'Resep produk belum diisi di sheet Resep.');
    eq(byId.P7.keterangan, 'Harga jual atau HPP baseline belum valid di sheet Produk.');
    [byId.P5, byId.P6, byId.P7].forEach(function (p) { eq(p.hpp, null); eq(p.peringkat, null); eq(p.skor_saw, null); });
  });
  T('keputusan', 'ringkasan: total 7, naik 2, promo 1, tahan 1, data 3', function () {
    eq(rec.ringkasan, { total: 7, naik: 2, promo: 1, tahan: 1, data: 3 });
  });
  T('keputusan', 'urutan hasil = peringkat SAW 1..4, produk DATA di paling bawah', function () {
    eq(rec.items.slice(0, 4).map(function (i) { return i.peringkat; }), [1, 2, 3, 4]);
    eq(rec.items.slice(4).map(function (i) { return i.id_produk; }), ['P5', 'P6', 'P7']);
  });
  T('keputusan', 'tanggal_data = tanggal harga terbaru dari semua bahan; metode SAW dan bobot AHP', function () {
    eq(rec.tanggal_data, '2026-10-07');
    eq(rec.metode, 'SAW (Simple Additive Weighting)');
    eq(rec.saw.sumber_bobot, 'AHP');
  });
  T('keputusan', 'getDashboard = rekomendasi + daftar bahan', function () {
    const d = J(e.call('getDashboard'));
    eq(d.rekomendasi.items.length, 7);
    eq(d.bahan.length, 2);
  });
  T('keputusan', 'getBahanList: perubahan dibanding 7 data sebelumnya', function () {
    const b = J(e.call('getBahanList'));
    eq(b.map(function (x) { return x.nama; }), ['A', 'B']);
    eq(b[0].perubahan_persen, -80);   // 200 vs 1000 (indeks 9-7 = 2)
    eq(b[0].harga_terakhir, 200);
    eq(b[0].tanggal_terakhir, '2026-10-07');
    eq(b[1].perubahan_persen, 0);
  });
  T('keputusan', 'getTrenData: batas hari min 7, HPP per tanggal memakai data sampai tanggal itu', function () {
    const t1 = J(e.call('getTrenData', 1));
    eq(t1.dates.length, 7);
    const t = J(e.call('getTrenData', 60));
    eq(t.dates.length, 10);
    eq(t.hpp.P1[t.hpp.P1.length - 1], 700);
    eq(t.hpp.P1[0], 2300);   // 2 x 1000 + 1 x 300 pada tanggal pertama
  });
  T('keputusan', 'getTrenData: produk tanpa resep -> HPP null', function () {
    const t = J(e.call('getTrenData', 60));
    eq(t.hpp.P6.every(function (v) { return v === null; }), true);
  });
})();

/* ====================== 6. Pengaturan ====================== */
(function () {
  const PAY = { batas_naik_persen: 10, batas_turun_persen: 10, margin_target_persen: 45, margin_minimum_persen: 35, pembulatan: 500, periode_moving_average_hari: 7 };
  const withP = function (o) { return Object.assign({}, PAY, o); };
  const mk = function () { return makeEnv(fullSheets()); };

  T('pengaturan', 'getSettings_: bawaan bila sheet kosong; nilai sheet menimpa; kunci asing dan non-angka diabaikan', function () {
    const sh = fullSheets();
    sh.Pengaturan.push(['batas_naik_persen', 12, ''], ['kunci_asing', 99, ''], ['pembulatan', 'abc', ''], ['periode_moving_average_hari', 0.2, '']);
    const e = makeEnv(sh);
    const s = J(e.call('getSettings_'));
    eq(s.batas_naik_persen, 12);
    eq(s.pembulatan, 500);
    eq(s.periode_moving_average_hari, 1);   // dibulatkan, minimal 1
    eq(s.kunci_asing, undefined);
    eq(s.gunakan_ahp, 1);
  });
  T('pengaturan', 'savePengaturan valid: menulis 11 kunci; bobot opsional dipertahankan bila tidak dikirim', function () {
    const e = mk();
    const s = J(e.call('savePengaturan', PAY));
    eq(s.bobot_margin, 0.3);
    eq(s.gunakan_ahp, 1);
    eq(e.ss.sheets.Pengaturan.data.length, 12);   // header + 11 kunci
    e.call('savePengaturan', withP({ batas_naik_persen: 15 }));
    eq(e.ss.sheets.Pengaturan.data.length, 12);   // memperbarui, tidak menambah baris
    eq(J(e.call('getPengaturan')).batas_naik_persen, 15);
  });
  T('pengaturan', 'bobot yang sudah tersimpan tetap dipakai bila payload tidak mengirim bobot', function () {
    const sh = fullSheets();
    sh.Pengaturan.push(['bobot_perubahan_hpp', 0.25, ''], ['bobot_margin', 0.4, '']);
    const e = makeEnv(sh);
    const s = J(e.call('savePengaturan', PAY));
    eq(s.bobot_perubahan_hpp, 0.25);
    eq(s.bobot_margin, 0.4);
  });
  const bad = [
    ['batas naik 0', { batas_naik_persen: 0 }, 'Batas naik harus di antara 0 dan 200 persen.'],
    ['batas naik 201', { batas_naik_persen: 201 }, 'Batas naik harus di antara 0 dan 200 persen.'],
    ['batas turun 100', { batas_turun_persen: 100 }, 'Batas turun harus di antara 0 dan 100 persen.'],
    ['batas turun 0', { batas_turun_persen: 0 }, 'Batas turun harus di antara 0 dan 100 persen.'],
    ['margin minimum 95', { margin_minimum_persen: 95 }, 'Margin minimum harus di antara 0 dan 95 persen.'],
    ['margin minimum -1', { margin_minimum_persen: -1 }, 'Margin minimum harus di antara 0 dan 95 persen.'],
    ['margin target 0', { margin_target_persen: 0 }, 'Margin target harus di antara 0 dan 95 persen.'],
    ['margin target < minimum', { margin_target_persen: 30 }, 'Margin target tidak boleh lebih kecil dari margin minimum.'],
    ['pembulatan 0', { pembulatan: 0 }, 'Pembulatan minimal 1 rupiah.'],
    ['periode 7,5', { periode_moving_average_hari: 7.5 }, 'Periode rata-rata harus bilangan bulat 1 sampai 90 hari.'],
    ['periode 91', { periode_moving_average_hari: 91 }, 'Periode rata-rata harus bilangan bulat 1 sampai 90 hari.'],
    ['periode 0', { periode_moving_average_hari: 0 }, 'Periode rata-rata harus bilangan bulat 1 sampai 90 hari.'],
    ['bukan angka', { batas_naik_persen: 'abc' }, 'Nilai "batas_naik_persen" harus berupa angka.'],
    ['bobot negatif', { bobot_margin: -0.1 }, 'Bobot "bobot_margin" harus di antara 0 dan 1.'],
    ['bobot > 1', { bobot_margin: 1.5 }, 'Bobot "bobot_margin" harus di antara 0 dan 1.'],
    ['total bobot 0,9', { bobot_perubahan_hpp: 0.35, bobot_margin: 0.2, bobot_selisih_margin: 0.2, bobot_porsi_bahan: 0.15 }, 'Total bobot kriteria SAW harus 1 (100%). Saat ini 0.9.'],
    ['gunakan_ahp 2', { gunakan_ahp: 2 }, 'gunakan_ahp harus 0 (bobot manual) atau 1 (AHP).']
  ];
  bad.forEach(function (c) {
    T('pengaturan', 'savePengaturan menolak: ' + c[0], function () {
      const e = mk();
      throwsWith(function () { e.call('savePengaturan', withP(c[1])); }, c[2]);
      eq(e.ss.sheets.Pengaturan.data.length, 1);   // tidak ada yang tertulis
    });
  });
  T('pengaturan', 'savePengaturan menerima gunakan_ahp 0 dan bobot total 1 (toleransi 0,001)', function () {
    const e = mk();
    const s = J(e.call('savePengaturan', withP({ gunakan_ahp: 0, bobot_perubahan_hpp: 0.4, bobot_margin: 0.3, bobot_selisih_margin: 0.2, bobot_porsi_bahan: 0.1 })));
    eq(s.gunakan_ahp, 0);
    eq(s.bobot_perubahan_hpp, 0.4);
  });
})();

/* ====================== 7. Harga bahan ====================== */
(function () {
  const mk = function () { return makeEnv(fullSheets()); };
  T('harga', 'addHargaBahan tanggal baru: menambah baris, satuan diambil dari data yang ada', function () {
    const e = mk();
    const before = e.ss.sheets.Harga_Bahan.data.length;
    const r = J(e.call('addHargaBahan', { tanggal: '2026-10-08', bahan: 'A', harga: 250 }));
    eq(r, { status: 'ok', tanggal: '2026-10-08', bahan: 'A', harga: 250 });
    eq(e.ss.sheets.Harga_Bahan.data.length, before + 1);
    const row = e.ss.sheets.Harga_Bahan.data[e.ss.sheets.Harga_Bahan.data.length - 1];
    eq([row[1], row[2], row[3]], ['A', 'kg', 250]);
  });
  T('harga', 'addHargaBahan tanggal + bahan sudah ada: harga diperbarui, baris tidak bertambah', function () {
    const e = mk();
    const before = e.ss.sheets.Harga_Bahan.data.length;
    e.call('addHargaBahan', { tanggal: '2026-10-07', bahan: 'A', harga: 260 });
    eq(e.ss.sheets.Harga_Bahan.data.length, before);
    const found = e.ss.sheets.Harga_Bahan.data.filter(function (r) { return r[0] === '2026-10-07' && r[1] === 'A'; })[0];
    eq(found[3], 260);
  });
  T('harga', 'addHargaBahan menerima tanggal dd/mm/yyyy', function () {
    const e = mk();
    const r = J(e.call('addHargaBahan', { tanggal: '08/10/2026', bahan: 'B', harga: 310 }));
    eq(r.tanggal, '2026-10-08');
  });
  T('harga', 'addHargaBahan menolak: tanggal tidak valid, bahan kosong, harga <= 0, bahan tak dikenal', function () {
    const e = mk();
    throwsWith(function () { e.call('addHargaBahan', { tanggal: 'abc', bahan: 'A', harga: 1 }); }, 'Tanggal tidak valid.');
    throwsWith(function () { e.call('addHargaBahan', { tanggal: '2026-10-08', bahan: '', harga: 1 }); }, 'Pilih bahan terlebih dahulu.');
    throwsWith(function () { e.call('addHargaBahan', { tanggal: '2026-10-08', bahan: 'A', harga: 0 }); }, 'Harga harus lebih dari 0.');
    throwsWith(function () { e.call('addHargaBahan', { tanggal: '2026-10-08', bahan: 'A', harga: 'abc' }); }, 'Harga harus lebih dari 0.');
    throwsWith(function () { e.call('addHargaBahan', { tanggal: '2026-10-08', bahan: 'Z', harga: 5 }); }, 'Bahan "Z" belum ada di sheet Harga_Bahan.');
    throwsWith(function () { e.call('addHargaBahan'); }, 'Tanggal tidak valid.');
  });
  T('harga', 'harga yang baru diinput memengaruhi HPP (moving average ikut berubah)', function () {
    const e = mk();
    e.call('addHargaBahan', { tanggal: '2026-10-08', bahan: 'A', harga: 900 });
    const rec = J(e.call('getRecommendations'));
    const p1 = rec.items.filter(function (i) { return i.id_produk === 'P1'; })[0];
    // 7 data terakhir A: 200 x 6 + 900 = 2100 -> rata-rata 300 ; HPP = 2 x 300 + 300 = 900
    eq(p1.hpp, 900);
    eq(rec.tanggal_data, '2026-10-08');
  });
  T('harga', 'getHargaTerbaru: urut tanggal terbaru, batas limit', function () {
    const e = mk();
    const r3 = J(e.call('getHargaTerbaru', 3));
    eq(r3.length, 3);
    eq(r3[0].tanggal, '2026-10-07');
    eq(J(e.call('getHargaTerbaru', 1000)).length, 18);
    eq(J(e.call('getHargaTerbaru')).length, 15);   // bawaan 15
  });
  T('harga', 'baris harga bertanggal atau berharga tidak valid diabaikan', function () {
    const sh = fullSheets();
    sh.Harga_Bahan.push(['bukan tanggal', 'A', 'kg', 5], ['2026-10-09', 'A', 'kg', 'xyz']);
    const e = makeEnv(sh);
    eq(J(e.call('getBahanList'))[0].tanggal_terakhir, '2026-10-07');
  });
})();

/* ====================== 8. Riwayat ====================== */
(function () {
  T('riwayat', 'simpanKeRiwayat menyimpan hanya produk lengkap; DATA TIDAK LENGKAP dilewati; tanggal = tanggal_data', function () {
    const e = makeEnv(fullSheets());
    const r = J(e.call('simpanKeRiwayat'));
    eq(r, { tanggal: '2026-10-07', disimpan: 4, dilewati: 3 });
    eq(e.ss.sheets.Riwayat_Keputusan.data.length, 5);
  });
  T('riwayat', 'simpan kedua pada tanggal yang sama tidak menggandakan baris (idempoten)', function () {
    const e = makeEnv(fullSheets());
    e.call('simpanKeRiwayat');
    const r = J(e.call('simpanKeRiwayat'));
    eq(r, { tanggal: '2026-10-07', disimpan: 0, dilewati: 7 });
    eq(e.ss.sheets.Riwayat_Keputusan.data.length, 5);
  });
  T('riwayat', 'tanggal data baru (harga baru) -> baris riwayat baru untuk tanggal itu', function () {
    const e = makeEnv(fullSheets());
    e.call('simpanKeRiwayat');
    e.call('addHargaBahan', { tanggal: '2026-10-08', bahan: 'A', harga: 210 });
    const r = J(e.call('simpanKeRiwayat'));
    eq(r.tanggal, '2026-10-08');
    eq(r.disimpan, 4);
    eq(e.ss.sheets.Riwayat_Keputusan.data.length, 9);
  });
  T('riwayat', 'baris riwayat memuat skor_saw dan peringkat; harga_saran kosong untuk non-NAIKKAN', function () {
    const e = makeEnv(fullSheets());
    e.call('simpanKeRiwayat');
    const rows = J(e.call('getRiwayat', 100));
    eq(rows.length, 4);
    rows.forEach(function (r) { ok(typeof r.skor_saw === 'number' && typeof r.peringkat === 'number', r.id_produk); });
    const p3 = rows.filter(function (r) { return r.id_produk === 'P3'; })[0];
    eq(p3.harga_saran, null);
    const p1 = rows.filter(function (r) { return r.id_produk === 'P1'; })[0];
    eq(p1.harga_saran, 2500);
    eq(p1.tanggal, '2026-10-07');
  });
  T('riwayat', 'getRiwayat: limit 2 -> 2 baris; tanpa limit -> bawaan 300', function () {
    const e = makeEnv(fullSheets());
    e.call('simpanKeRiwayat');
    eq(J(e.call('getRiwayat', 2)).length, 2);
    eq(J(e.call('getRiwayat')).length, 4);
  });
  T('riwayat', 'simpanKeRiwayat menolak bila belum ada data harga', function () {
    const sh = fullSheets();
    sh.Harga_Bahan = [['tanggal', 'nama_bahan', 'satuan', 'harga']];
    const e = makeEnv(sh);
    throwsWith(function () { e.call('simpanKeRiwayat'); }, 'Belum ada data harga bahan.');
  });
})();

/* ====================== 9. Gerbang API ====================== */
(function () {
  const e = makeEnv(fullSheets());
  const get = function (env, p) { return JSON.parse(env.call('doGet', { parameter: p }).getContent()); };
  const post = function (env, body) { return JSON.parse(env.call('doPost', { postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent()); };

  T('API', 'doGet tanpa parameter = ping', function () {
    const r = JSON.parse(e.call('doGet').getContent());
    eq(r.ok, true);
    eq(r.data.status, 'ok');
  });
  T('API', 'doGet aksi tidak dikenal: pesan persis seperti yang dilihat frontend', function () {
    eq(get(e, { action: 'getAhpX' }), { ok: false, error: 'Aksi "getAhpX" tidak dikenal.' });
  });
  T('API', 'aksi tulis lewat GET ditolak dengan petunjuk memakai POST', function () {
    eq(get(e, { action: 'addHargaBahan' }), { ok: false, error: 'Aksi "addHargaBahan" harus dikirim dengan metode POST.' });
  });
  T('API', 'aksi baca lewat POST ditolak', function () {
    eq(post(e, { action: 'getRiwayat' }), { ok: false, error: 'Aksi "getRiwayat" tidak dikenal untuk metode POST.' });
  });
  T('API', 'doPost: JSON rusak ditolak dengan pesan jelas', function () {
    eq(post(e, '{bukan json'), { ok: false, error: 'Isi permintaan harus berupa JSON.' });
  });
  T('API', 'GET getAhp dan getDashboard mengembalikan {ok:true,data}', function () {
    const a = get(e, { action: 'getAhp' });
    eq(a.ok, true);
    eq(a.data.konsisten, true);
    const d = get(e, { action: 'getDashboard' });
    eq(d.ok, true);
    eq(d.data.rekomendasi.items.length, 7);
  });
  T('API', 'parameter angka diteruskan: getTrenData?days=1 -> 7 tanggal; getHargaTerbaru?limit=2 -> 2 baris', function () {
    eq(get(e, { action: 'getTrenData', days: '1' }).data.dates.length, 7);
    eq(get(e, { action: 'getHargaTerbaru', limit: '2' }).data.length, 2);
  });
  T('API', 'POST addHargaBahan dan simpanKeRiwayat berjalan lewat doPost', function () {
    const env = makeEnv(fullSheets());
    const a = post(env, { action: 'addHargaBahan', payload: { tanggal: '2026-10-08', bahan: 'B', harga: 320 } });
    eq(a.ok, true);
    const s = post(env, { action: 'simpanKeRiwayat' });
    eq(s.ok, true);
    eq(s.data.disimpan, 4);
  });
  T('API', 'galat validasi dari fungsi dibungkus {ok:false,error}', function () {
    const env = makeEnv(fullSheets());
    const r = post(env, { action: 'savePengaturan', payload: { batas_naik_persen: 0, batas_turun_persen: 10, margin_target_persen: 45, margin_minimum_persen: 35, pembulatan: 500, periode_moving_average_hari: 7 } });
    eq(r, { ok: false, error: 'Batas naik harus di antara 0 dan 200 persen.' });
  });
  T('API', 'API_KEY terisi: tanpa kunci atau kunci salah ditolak, kunci benar diterima (GET dan POST)', function () {
    const k = makeEnv(fullSheets(), { apiKey: 'rahasia' });
    eq(get(k, { action: 'ping' }), { ok: false, error: 'API key tidak valid.' });
    eq(get(k, { action: 'ping', key: 'salah' }), { ok: false, error: 'API key tidak valid.' });
    eq(get(k, { action: 'ping', key: 'rahasia' }).ok, true);
    eq(post(k, { action: 'simpanKeRiwayat' }), { ok: false, error: 'API key tidak valid.' });
    eq(post(k, { action: 'simpanKeRiwayat', key: 'rahasia' }).ok, true);
  });
  T('API', 'API_KEY kosong (seperti di repositori publik): pemeriksaan kunci dinonaktifkan', function () {
    eq(get(e, { action: 'ping', key: 'apa saja' }).ok, true);
  });
})();

/* ---------- ringkasan ---------- */
const pass = results.filter(function (r) { return r.ok; }).length;
const fail = results.length - pass;
const groups = {};
results.forEach(function (r) { groups[r.group] = groups[r.group] || { pass: 0, total: 0 }; groups[r.group].total++; if (r.ok) groups[r.group].pass++; });
results.forEach(function (r) { console.log((r.ok ? 'PASS ' : 'FAIL ') + '[' + r.group + '] ' + r.name + (r.ok ? '' : '\n      -> ' + r.err)); });
console.log('\nRINGKASAN: ' + pass + ' / ' + results.length + ' lulus, ' + fail + ' gagal');
Object.keys(groups).forEach(function (g) { console.log('  ' + g + ': ' + groups[g].pass + ' / ' + groups[g].total); });
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ pass: pass, total: results.length, groups: groups, results: results, info: info }, null, 2));
process.exit(fail ? 1 : 0);
