/**
 * settings.gs - Pengaturan: baca dan simpan parameter keputusan serta bobot SAW (sheet Pengaturan).
 */

function getSettings_() {
  const out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { out[k] = DEFAULT_SETTINGS[k]; });
  readTable_(SHEET.SETTING).forEach(function (r) {
    const k = String(r.parameter || '').trim();
    const v = num_(r.nilai);
    if (DEFAULT_SETTINGS.hasOwnProperty(k) && !isNaN(v)) out[k] = v;
  });
  out.periode_moving_average_hari = Math.max(1, Math.round(out.periode_moving_average_hari));
  return out;
}

function getPengaturan() {
  return getSettings_();
}

function savePengaturan(payload) {
  payload = payload || {};
  const current = getSettings_();
  const s = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    let raw = payload[k];
    // Bobot SAW dan gunakan_ahp bersifat opsional di payload: bila tidak dikirim, pakai nilai yang sekarang.
    if ((raw === undefined || raw === null || raw === '') && OPTIONAL_KEYS.indexOf(k) >= 0) {
      raw = current[k];
    }
    const v = num_(raw);
    if (isNaN(v)) throw new Error('Nilai "' + k + '" harus berupa angka.');
    s[k] = v;
  });

  if (s.batas_naik_persen <= 0 || s.batas_naik_persen > 200) throw new Error('Batas naik harus di antara 0 dan 200 persen.');
  if (s.batas_turun_persen <= 0 || s.batas_turun_persen >= 100) throw new Error('Batas turun harus di antara 0 dan 100 persen.');
  if (s.margin_minimum_persen < 0 || s.margin_minimum_persen >= 95) throw new Error('Margin minimum harus di antara 0 dan 95 persen.');
  if (s.margin_target_persen <= 0 || s.margin_target_persen >= 95) throw new Error('Margin target harus di antara 0 dan 95 persen.');
  if (s.margin_target_persen < s.margin_minimum_persen) throw new Error('Margin target tidak boleh lebih kecil dari margin minimum.');
  if (s.pembulatan < 1) throw new Error('Pembulatan minimal 1 rupiah.');
  if (s.periode_moving_average_hari < 1 || s.periode_moving_average_hari > 90 ||
      Math.round(s.periode_moving_average_hari) !== s.periode_moving_average_hari) {
    throw new Error('Periode rata-rata harus bilangan bulat 1 sampai 90 hari.');
  }

  // Validasi bobot SAW: tiap bobot 0..1 dan totalnya 1.
  let totalBobot = 0;
  BOBOT_KEYS.forEach(function (k) {
    if (s[k] < 0 || s[k] > 1) throw new Error('Bobot "' + k + '" harus di antara 0 dan 1.');
    totalBobot += s[k];
  });
  if (Math.abs(totalBobot - 1) > 0.001) {
    throw new Error('Total bobot kriteria SAW harus 1 (100%). Saat ini ' + (Math.round(totalBobot * 1000) / 1000) + '.');
  }
  if (s.gunakan_ahp !== 0 && s.gunakan_ahp !== 1) throw new Error('gunakan_ahp harus 0 (bobot manual) atau 1 (AHP).');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SHEET.SETTING);
    const cm = colMap_(sh);
    const last = sh.getLastRow();
    const vals = last >= 2 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];
    Object.keys(s).forEach(function (k) {
      let found = false;
      for (let i = 0; i < vals.length; i++) {
        if (String(vals[i][cm.parameter - 1]).trim() === k) {
          sh.getRange(i + 2, cm.nilai).setValue(s[k]);
          found = true;
          break;
        }
      }
      if (!found) appendByHeader_(sh, { parameter: k, nilai: s[k], keterangan: '' });
    });
  } finally {
    lock.releaseLock();
  }
  return getSettings_();
}