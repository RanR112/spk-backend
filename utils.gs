/**
 * utils.gs - Utilitas umum: konversi tanggal/angka, pembulatan, dan format teks.
 */

function toIso_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(v === null || v === undefined ? '' : v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

function num_(v) {
  if (typeof v === 'number') return v;
  let s = String(v === null || v === undefined ? '' : v).replace(/\s|Rp/gi, '');
  if (s === '') return NaN;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

function round1_(n) { return Math.round(n * 10) / 10; }

function ceilTo_(x, k) {
  k = k > 0 ? k : 1;
  return Math.ceil(x / k - 1e-9) * k;
}

function fmt1_(n) { return (Math.round(n * 10) / 10).toFixed(1).replace('.', ','); }

function fmt2_(n) { return (Math.round(n * 100) / 100).toFixed(2).replace('.', ','); }

function rupiah_(n) {
  return 'Rp' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}