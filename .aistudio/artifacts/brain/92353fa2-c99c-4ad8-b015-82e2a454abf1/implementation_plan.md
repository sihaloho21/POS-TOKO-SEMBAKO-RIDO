# PRD & Rencana Implementasi: Modul Penjualan Buah Terintegrasi (POS, Inventaris Susut, & Storage Keuangan Kas Buah)

---

## 📌 Ringkasan Eksekutif & Kebutuhan Pengguna
Fitur **Penjualan Buah** dirancang untuk menambahkan lini bisnis penjualan komoditas segar (*fresh produce*) ke dalam sistem toko, terintegrasi penuh dengan kasir (POS), inventaris, dan pembukuan keuangan.

Sesuai instruksi pengguna, **data bawaan default** difokuskan secara spesifik pada:
1. **Mangga Arum Manis**
2. **Jeruk Berastagi**

Dengan kapabilitas utama:
- **CRUD Lengkap**: Tambah buah lain secara bebas di kemudian hari, ubah harga harian, update stok, dan hapus (role Owner).
- **Storage Keuangan "BUAH"**: Kantong kas terpisah untuk menampung pendapatan penjualan buah dan mencatat modal belanja/kulakan buah.
- **POS Kasir Timbangan Desimal**: Kasir dapat memasukkan berat desimal (misal `1.25 kg`, `0.75 kg`) dengan kalkulasi subtotal otomatis dan tombol cepat penimbangan.
- **Penyesuaian Stok Buah**: Pencatatan buah busuk, sortiran tidak layak jual, atau susut timbangan alami yang langsung memotong stok dan mencatat audit nilai kerugian.

---

## 🎯 User Review & Critical Decisions (Keputusan Desain Kunci)

| # | Poin Keputusan | Opsi Terpilih & Konfigurasi | Rincian & Dampak Sistem |
|---|----------------|-----------------------------|-------------------------|
| **1** | **Data Bawaan (Pre-Seeded Fruits)** | **Mangga Arum Manis** & **Jeruk Berastagi** | Hanya 2 produk unggulan ini yang dimuat sebagai data bawaan awal. Pengguna tetap dapat menambah buah lain kapan saja via menu CRUD. |
| **2** | **Satuan & Format Timbangan POS** | Satuan dasar `KG` dengan presisi desimal hingga 2 digit (misal: `0.45 kg`, `1.80 kg`) + tombol cepat `[+0.25kg]`, `[+0.5kg]`, `[+1kg]`, `[+2kg]`. | Memudahkan kasir menimbang di kasir tanpa harus membulatkan ke angka bulat. |
| **3** | **Storage Keuangan "BUAH"** | Menambahkan `storageId = 'BUAH'` dan `moneyStorageId = 'BUAH'` pada sistem pembukuan kas. | Memisahkan aliran kas buah dari kas warung sembako, kas ikan, dan uang digital. Memungkinkan owner melihat keuntungan bersih spesifik dari jualan buah. |
| **4** | **Hak Akses & Keamanan Data (RBAC)** | - Kasir: Melihat katalog buah, transaksi POS, penyesuaian susut harian.<br>- Owner: Full CRUD, edit HPP, hapus produk buah, rekapitulasi laba rugi kas buah. | Menjamin integritas data dan keamanan operasional harian. |
| **5** | **Penanganan Buah Rusak / Susut (Waste Management)** | Fitur "Catat Buah Susut / Busuk" dengan alasan: `Buah busuk / rusak`, `Susut timbangan alami`, dan `Sortir afkir`. | Nilai kerugian terhitung otomatis $(\text{Qty} \times \text{HPP})$ dan tercatat pada log audit mutasi stok. |

---

## 📋 Data Bawaan Master Buah (Initial Seed Data)

| Nama Buah | Satuan Dasar | Estimasi Harga Modal (HPP) | Estimasi Harga Jual | Minimum Stok Alert | Stok Awal | Keterangan & Karakteristik |
|-----------|--------------|----------------------------|---------------------|--------------------|-----------|----------------------------|
| **Mangga Arum Manis** | KG | Rp 20.000 / kg | Rp 28.000 / kg | 10 kg | 25 kg | Kualitas super matang pohon, harum manis legit, penjualan per kg (desimal). |
| **Jeruk Berastagi** | KG | Rp 16.000 / kg | Rp 22.000 / kg | 15 kg | 30 kg | Segar manis asal Berastagi Medan, kaya air, penjualan per kg (desimal). |

*(Catatan: Pengguna dapat menambah buah lain seperti Semangka, Apel, Pisang, dll. melalui tombol Tambah Buah kapan saja).*

---

## 🏗️ Spesifikasi Kebutuhan Fungsional (Functional Requirements)

### 1. CRUD Master Data & Katalog Buah
- **Create (Tambah Buah)**:
  - Form input lengkap: Nama Buah, Barcode/SKU, Satuan Dasar (`KG`, `GRAM`, `PCS`), Harga Modal (HPP), Harga Jual (Normal Price), Batas Stok Minimum, dan Foto/Ikon Buah.
- **Read (Tampilan Katalog & Filter)**:
  - Tab kategori khusus **"Buah Segar"** pada halaman Inventaris.
  - Kartu/tabel informasi menampilkan: Nama buah, Stok terkini (dalam format kg dengan desimal), HPP, Harga Jual, Estimasi Margin keuntungan (%), dan status ketersediaan.
- **Update (Edit Data Buah & Harga)**:
  - Kemudahan memperbarui harga jual harian mengikuti tren pasar buah.
  - Update HPP saat ada kulakan baru.
- **Delete (Hapus Produk Buah)**:
  - Hanya role `OWNER` yang memiliki izin menghapus produk buah (sesuai Firestore Security Rules).
  - Pilihan nonaktifkan produk jika sudah terdapat riwayat penjualan sebelumnya.

### 2. Integrasi POS Kasir (Point of Sale)
- **Tab Cepat Produk Buah**: Tombol kategori tab `🍎 Buah` di tampilan kasir POS agar kasir dapat memilih Mangga Arum Manis atau Jeruk Berastagi dalam 1 sentuhan.
- **Input Timbangan Desimal**:
  - Kolom kuantitas kasir mendukung angka desimal langsung (contoh: `1.35`).
  - Tombol pintas timbangan: `[+0.25 kg]`, `[+0.5 kg]`, `[+1.0 kg]`, `[+2.0 kg]`, dan `[Reset]`.
  - Kalkulasi instan: $\text{Total Item} = \text{Berat (kg)} \times \text{Harga per kg}$.
- **Cetak Struk Transaksi**:
  - Format struk thermal menyajikan rincian berat yang jelas, contoh:  
    `Mangga Arum Manis`  
    `1.25 kg x Rp 28.000 = Rp 35.000`
- **Alokasi Pembayaran**:
  - Transaksi penjualan buah otomatis membukukan kas masuk ke kantong kas **`BUAH`**.

### 3. Storage Keuangan "BUAH" (Financial Wallet & Ledger)
- **Ringkasan Saldo Kas Buah**:
  - Kartu saldo kantong kas khusus `BUAH` di halaman Keuangan/Dashboard:
    - **Saldo Kas Buah Terkini**
    - **Total Pemasukan Buah** (Omset dari kasir POS)
    - **Total Modal Kulakan Buah** (Cash out pembelian grosir)
    - **Estimasi Laba Kotor Buah**
- **Pencatatan Arus Kas**:
  - **Uang Masuk**: Otomatis tercatat saat kasir menyelesaikan penjualan buah.
  - **Uang Keluar (Kulakan Buah)**: Modal form "Catat Kulakan Buah" untuk mencatat belanja stok ke petani/pasar buah induk langsung dari kas buah.
  - **Transfer Kas**: Kemudahan memindahkan saldo kas dari Kas Buah ke Kas Utama Warung/Rekening Bank.

### 4. Penyesuaian Stok (Stock Adjustment / Susut & Busuk)
- **Pencatatan Buah Rusak / Susut**:
  - Menu penyesuaian cepat dengan kategori alasan:
    - *Buah Busuk / Tidak Layak Jual*
    - *Susut Timbangan / Penguapan Alami*
    - *Sortiran Afkir*
- **Audit & Pemotongan Stok**:
  - Stok fisik otomatis berkurang sesuai kilogram yang dicatat.
  - Terbit mutasi `StockMovement` dengan `segmentId: 'BUAH'` dan nilai kerugian rupiah tercatat rapi di laporan.

---

## 📐 Arsitektur Data & Tipe Sistem (`src/core/types.ts`)

```typescript
// 1. Klasifikasi Produk
export type ProductType = 'SEMBAKO' | 'FISH' | 'SIDE_PRODUCT' | 'DIGITAL' | 'BUNDLE' | 'PACKAGE' | 'FRUIT';

// 2. Storage Keuangan & Kantong Kas
export type MoneyStorageId = 'WARUNG' | 'IKAN' | 'UANG_DIGITAL' | 'BUAH';

// 3. Alasan Penyesuaian Stok Khusus Komoditas Buah
export type StockAdjustmentReason =
  | 'Rusak'
  | 'Hilang'
  | 'Kadaluarsa'
  | 'Ikan mati/tidak layak jual'
  | 'Buah busuk / rusak'
  | 'Susut timbangan alami'
  | 'Sortir afkir'
  | 'Kesalahan stok opname'
  | 'Salah Input'
  | 'Lainnya';
```

---

## 🛠️ Langkah-Langkah Implementasi (Setelah Persetujuan)

1. **Langkah 1**: Perbarui model tipe di `src/core/types.ts` (`ProductType: 'FRUIT'`, `storageId: 'BUAH'`, penambahan alasan stok).
2. **Langkah 2**: Buat helper data bawaan & seed awal untuk **Mangga Arum Manis** dan **Jeruk Berastagi** dengan harga HPP, harga jual, dan stok awal.
3. **Langkah 3**: Buat komponen CRUD Katalog Buah (tampilan tabel/grid, form tambah/edit buah, proteksi hapus role Owner).
4. **Langkah 4**: Perbarui komponen POS Kasir (tambahkan tab kategori `🍎 Buah`, dukung input berat desimal dan tombol pintas timbangan cepat, serta integrasi storage `'BUAH'`).
5. **Langkah 5**: Buat widget / tampilan **Storage Keuangan "BUAH"** (ringkasan saldo kas buah, riwayat mutasi masuk/keluar, dan formulir catat kulakan buah).
6. **Langkah 6**: Integrasikan modul penyesuaian stok buah (catat buah busuk/susut timbangan).
7. **Langkah 7**: Verifikasi build aplikasi dengan `compile_applet` untuk memastikan tidak ada error kompilasi dan sistem berjalan stabil.

---

## ❓ Konfirmasi Persetujuan
Apakah Anda menyetujui dokumen PRD revisi dengan 2 data bawaan (**Mangga Arum Manis** dan **Jeruk Berastagi**) ini?  
Jika sudah sesuai, silakan klik **Proceed** agar kami dapat langsung mengimplementasikan seluruh fiturnya ke dalam aplikasi!
