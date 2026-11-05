/**
 * recipe.gs - Data resep: mengelompokkan resep per produk (sheet Resep).
 */

function groupResep_() {
  const g = {};
  readTable_(SHEET.RESEP).forEach(function (r) {
    const id = String(r.id_produk || '').trim();
    const b = String(r.bahan || '').trim();
    const q = num_(r.takaran_per_porsi);
    if (!id || !b || isNaN(q)) return;
    if (!g[id]) g[id] = [];
    g[id].push({ bahan: b, takaran: q, satuan: String(r.satuan || '') });
  });
  return g;
}