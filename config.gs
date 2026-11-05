/**
 * config.gs - Konfigurasi: ID spreadsheet, nama sheet, konstanta keputusan, pengaturan default, daftar aksi API.
 *
 * Catatan: semua file .gs di project ini berbagi satu scope global. Konstanta di sini
 * hanya dipakai di dalam fungsi, jadi urutan file di editor Apps Script tidak memengaruhi hasil.
 *
 * Sheet yang dibutuhkan (nama dan kolom harus sama):
 *   Harga_Bahan        : tanggal | nama_bahan | satuan | harga
 *   Produk             : id_produk | nama_produk | harga_jual | hpp_baseline
 *   Resep              : id_produk | nama_produk | bahan | takaran_per_porsi | satuan
 *   Pengaturan         : parameter | nilai | keterangan
 *   Riwayat_Keputusan  : tanggal | id_produk | nama_produk | hpp | perubahan_hpp_persen |
 *                        margin_persen | keputusan | harga_saran | keterangan | skor_saw | peringkat
 *   Matriks_AHP        : kode | C1 | C2 | C3 | C4   (opsional; isi segitiga atas saja, lihat AHP.gs)
 */

// Kosongkan jika script dibuat dari Extensions > Apps Script di dalam spreadsheet.
// Isi dengan ID spreadsheet jika script dibuat sebagai project terpisah.
const SPREADSHEET_ID = '';

const SHEET = {
  HARGA: 'Harga_Bahan',
  PRODUK: 'Produk',
  RESEP: 'Resep',
  SETTING: 'Pengaturan',
  RIWAYAT: 'Riwayat_Keputusan',
  AHP: 'Matriks_AHP'
};

const KEP = {
  NAIK: 'NAIKKAN HARGA',
  PROMO: 'BERI PROMO',
  TAHAN: 'PERTAHANKAN',
  DATA: 'DATA TIDAK LENGKAP'
};

const DEFAULT_SETTINGS = {
  batas_naik_persen: 10,
  batas_turun_persen: 10,
  margin_target_persen: 45,
  margin_minimum_persen: 35,
  pembulatan: 500,
  periode_moving_average_hari: 7,
  // Bobot kriteria SAW (total harus 1)
  bobot_perubahan_hpp: 0.35,
  bobot_margin: 0.30,
  bobot_selisih_margin: 0.20,
  bobot_porsi_bahan: 0.15,
  // 1 = bobot SAW dari AHP (sheet Matriks_AHP); 0 = pakai bobot manual di atas
  gunakan_ahp: 1
};

// Kunci pengaturan yang merupakan bobot SAW.
const BOBOT_KEYS = ['bobot_perubahan_hpp', 'bobot_margin', 'bobot_selisih_margin', 'bobot_porsi_bahan'];

// Pengaturan yang boleh tidak dikirim dalam payload savePengaturan (nilai sekarang dipertahankan).
const OPTIONAL_KEYS = BOBOT_KEYS.concat(['gunakan_ahp']);

// Kriteria SAW/AHP (urutan = urutan baris/kolom matriks AHP). manual_key = bobot cadangan di Pengaturan.
const AHP_KRITERIA = [
  { kode: 'C1', nama: 'Perubahan HPP (absolut, %)', manual_key: 'bobot_perubahan_hpp' },
  { kode: 'C2', nama: 'Margin saat ini (%)', manual_key: 'bobot_margin' },
  { kode: 'C3', nama: 'Selisih margin dari target (%)', manual_key: 'bobot_selisih_margin' },
  { kode: 'C4', nama: 'Porsi bahan termahal terhadap HPP (%)', manual_key: 'bobot_porsi_bahan' }
];

// Matriks perbandingan berpasangan default (dipakai bila sheet Matriks_AHP belum ada).
// Hanya segitiga atas yang dibaca; segitiga bawah dihitung sebagai kebalikannya.
const AHP_DEFAULT_MATRIX = [
  [1,   1 / 2, 2,     3],
  [2,   1,     3,     4],
  [1 / 2, 1 / 3, 1,   2],
  [1 / 3, 1 / 4, 1 / 2, 1]
];

// Random Index Saaty (indeks = ukuran matriks) dan batas konsistensi.
const AHP_RI = { 1: 0, 2: 0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49 };
const AHP_CR_MAKS = 0.1;

// Kunci sederhana agar API tidak dipakai sembarang orang. Kosongkan untuk menonaktifkan.
// Nilai yang sama harus diisi di website/assets/config.js.
// Catatan: kunci ini terlihat di kode website, jadi hanya pagar ringan, bukan keamanan penuh.
const API_KEY = '';

// Daftar aksi yang boleh dipanggil dari luar (nama aksi -> nama parameter angka, bila ada).
const READ_ACTIONS = {
  ping: null,
  getDashboard: null,
  getRecommendations: null,
  getBahanList: null,
  getPengaturan: null,
  getTrenData: 'days',
  getHargaTerbaru: 'limit',
  getRiwayat: 'limit',
  getAhp: null
};

const WRITE_ACTIONS = {
  addHargaBahan: true,
  savePengaturan: true,
  simpanKeRiwayat: true,
  saveMatriksAHP: true
};