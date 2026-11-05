/**
 * decision.gs - Mesin keputusan: hitung HPP, perubahan HPP, margin, jenis tindakan, dan harga saran per produk.
 */

/**
 * Menilai satu produk (menghasilkan nilai kriteria dan jenis tindakan).
 *   HPP sekarang      = jumlah (rata-rata N harga terakhir tiap bahan x takaran)
 *   Perubahan HPP (%) = (HPP sekarang - HPP baseline) / HPP baseline x 100
 *   Margin (%)        = (harga jual - HPP sekarang) / harga jual x 100
 *
 *   NAIKKAN : perubahan HPP >= batas naik  ATAU  margin < margin minimum
 *   PROMO   : perubahan HPP <= -batas turun
 *   TAHAN   : selain itu
 *
 * Urutan prioritas antar produk ditentukan oleh SAW (applySAW_), bukan di sini.
 */
function evaluate_(p, resepRows, prices, st, upTo) {
  const id = String(p.id_produk).trim();
  const jual = num_(p.harga_jual);
  const base = num_(p.hpp_baseline);

  const item = {
    id_produk: id,
    nama_produk: String(p.nama_produk),
    harga_jual: jual,
    hpp_baseline: base,
    hpp: null,
    perubahan_persen: null,
    margin_persen: null,
    margin_awal_persen: null,
    porsi_maks_persen: null,
    skor_saw: null,
    peringkat: null,
    saw_normal: null,
    keputusan: KEP.DATA,
    urgensi: '',
    harga_saran: null,
    kenaikan_rp: null,
    diskon_maks_persen: null,
    hemat_per_porsi: null,
    keterangan: '',
    rincian: []
  };

  if (!(jual > 0) || !(base > 0)) {
    item.keterangan = 'Harga jual atau HPP baseline belum valid di sheet Produk.';
    return item;
  }
  if (!resepRows.length) {
    item.keterangan = 'Resep produk belum diisi di sheet Resep.';
    return item;
  }

  let hpp = 0;
  const missing = [];
  resepRows.forEach(function (r) {
    const b = prices[r.bahan];
    const avg = b ? avgLast_(b.series, st.periode_moving_average_hari, upTo) : null;
    if (avg === null) {
      missing.push(r.bahan);
      return;
    }
    const biaya = avg * r.takaran;
    hpp += biaya;
    item.rincian.push({
      bahan: r.bahan,
      satuan: r.satuan,
      takaran: r.takaran,
      harga_rata2: Math.round(avg),
      biaya: Math.round(biaya),
      porsi_persen: 0
    });
  });

  if (missing.length) {
    item.keterangan = 'Harga belum tersedia untuk: ' + missing.join(', ') + '.';
    item.rincian = [];
    return item;
  }

  item.rincian.forEach(function (r) {
    r.porsi_persen = round1_(r.biaya / hpp * 100);
  });
  item.rincian.sort(function (a, b) { return b.biaya - a.biaya; });
  item.porsi_maks_persen = item.rincian.length ? item.rincian[0].porsi_persen : 0;

  const chg = (hpp - base) / base * 100;
  const margin = (jual - hpp) / jual * 100;
  const marginAwal = (jual - base) / jual * 100;

  item.hpp = Math.round(hpp);
  item.perubahan_persen = round1_(chg);
  item.margin_persen = round1_(margin);
  item.margin_awal_persen = round1_(marginAwal);

  const naikByHpp = chg >= st.batas_naik_persen;
  const naikByMargin = margin < st.margin_minimum_persen;

  if (naikByHpp || naikByMargin) {
    // Harga saran: memenuhi margin target DAN mempertahankan margin awal produk.
    const targetMargin = hpp / (1 - st.margin_target_persen / 100);
    const jagaMarginAwal = hpp / (1 - marginAwal / 100);
    const saran = ceilTo_(Math.max(targetMargin, jagaMarginAwal), st.pembulatan);

    const ratio = Math.max(chg / st.batas_naik_persen, naikByMargin ? 2 : 0);
    item.keputusan = KEP.NAIK;
    item.urgensi = ratio >= 2 ? 'Tinggi' : (ratio >= 1.3 ? 'Sedang' : 'Rendah');
    item.harga_saran = saran;
    item.kenaikan_rp = saran - jual;

    const alasan = [];
    if (naikByHpp) alasan.push('HPP naik ' + fmt1_(chg) + '% (batas ' + fmt1_(st.batas_naik_persen) + '%)');
    if (naikByMargin) alasan.push('margin ' + fmt2_(margin) + '% di bawah minimum ' + fmt1_(st.margin_minimum_persen) + '%');
    item.keterangan = 'Naikkan harga karena ' + alasan.join(' dan ') + '. Saran harga ' + rupiah_(saran) +
      ' (naik ' + rupiah_(saran - jual) + ').';
  } else if (chg <= -st.batas_turun_persen) {
    const hargaMinAman = hpp / (1 - st.margin_minimum_persen / 100);
    const diskon = Math.max(0, (1 - hargaMinAman / jual) * 100);
    const hemat = base - hpp;

    item.keputusan = KEP.PROMO;
    item.diskon_maks_persen = Math.floor(diskon * 10) / 10;
    item.hemat_per_porsi = Math.round(hemat);
    item.keterangan = 'HPP turun ' + fmt1_(Math.abs(chg)) + '%, hemat ' + rupiah_(hemat) +
      ' per porsi. Margin naik dari ' + fmt1_(marginAwal) + '% menjadi ' + fmt1_(margin) +
      '%. Diskon maksimal yang masih aman ' + fmt1_(item.diskon_maks_persen) + '% (harga tidak di bawah ' +
      rupiah_(Math.ceil(hargaMinAman)) + ').';
  } else {
    item.keputusan = KEP.TAHAN;
    item.keterangan = 'HPP berubah ' + (chg >= 0 ? '+' : '') + fmt1_(chg) + '%, masih dalam batas wajar (naik ' +
      fmt1_(st.batas_naik_persen) + '% / turun ' + fmt1_(st.batas_turun_persen) + '%).';
  }
  return item;
}