# Product Requirements Document (PRD)
## Fitur: Hapus Produk Massal (Bulk Inventory Delete) — Seleksi Checkbox ≥ 2 Produk

---

### 1. Ringkasan Eksekutif (Executive Summary)
Dokumen ini mendefinisikan spesifikasi kebutuhan produk untuk penambahan fitur **Hapus Produk Massal (Bulk Delete)** pada modul Inventaris Toko Sembako Riama. Fitur ini dirancang untuk memungkinkan pengguna dengan hak akses **Owner** menghapus beberapa produk sekaligus melalui penandaan checkbox (khususnya ketika memilih minimal 2 produk atau lebih) secara cepat, aman, dan terintegrasi dengan database lokal (Dexie IndexedDB) dan Cloud Firestore secara realtime.

Pemberian fitur ini dilakukan dengan prinsip **Zero Disruption / Zero Regression**, menjamin tidak ada gangguan terhadap transaksi yang sudah berjalan, data piutang pelanggan, pencatatan kasir, riwayat mutasi stok, maupun siklus pengadaan ikan hidup.

---

### 2. Latar Belakang & Masalah Pengguna (Problem Statement)
Sebelum penambahan fitur ini:
1. **Penghapusan Produk Lambat & Repetitif:** Pemilik toko harus menekan ikon sampah satu per satu di setiap baris produk dan mengonfirmasi dialog secara berulang jika ingin membersihkan SKU usang, produk uji coba, atau produk yang tidak lagi dijual.
2. **Ketiadaan Aksi Massal untuk Delete:** Pada bilah aksi atas hanya tersedia fitur "Penyesuaian Harga Massal" saat checkbox dipilih, sedangkan kebutuhan pembersihan inventaris dalam jumlah banyak belum terfasilitasi.
3. **Pencegahan Ketidaksengajaan:** Penghapusan produk memerlukan mekanisme pengaman (safety guard) khusus dengan validasi seleksi ≥ 2 item, konfirmasi rincian produk, serta pencatatan audit log lengkap.

---

### 3. Jaminan Tanpa Gangguan (Non-Disruption Guarantee)
Implementasi fitur ini **TIDAK MENGUBAH / MENGGANGGU**:
1. **Transaksi Masa Lalu (Sales Transactions & POS):**
   - Transaksi penjualan masa lalu menyimpan snapshot data item (nama, barcode, harga, qty, subtotal) secara mandiri di tabel `transactions`.
   - Menghapus produk dari katalog master tidak akan merusak struk, nota penjualan, atau perhitungan omset/laba historis.
2. **Manajemen Piutang & Kasbon Kasir (Receivables):**
   - Nota piutang dan cicilan pelanggan merujuk pada `transactionId` atau `receivableId`, sehingga saldo piutang tetap 100% akurat.
3. **Pencegahan Regenerasi Data Otomatis (Anti-Resurrection):**
   - Setiap ID produk yang dihapus secara massal dicatat ke dalam daftar hitam `deleted_product_ids` pada tabel `settings`.
   - Hal ini memastikan seeder default atau live sync tidak akan pernah memunculkan kembali produk yang telah dihapus pemilik toko.
4. **Fitur Inventaris Lainnya:**
   - Single Delete (ikon sampah per baris) tetap berfungsi normal.
   - Penyesuaian Harga Massal (Bulk Price Adjustment) tetap berfungsi normal.
   - Modul Ikan Basah/Hidup (`FishManagement`), modul Buah (`FruitManagement`), dan Scanner Barcode tetap beroperasi tanpa distorsi.

---

### 4. Hak Akses & Keamanan Peran (User Roles & Permissions)
- **Role OWNER:**
  - Memiliki otoritas penuh untuk mencentang produk dan mengeksekusi Hapus Massal.
  - Tombol "Hapus Massal (X)" aktif dan membuka modal konfirmasi.
- **Role KASIR / STAFF:**
  - Dapat melihat checkbox untuk keperluan seleksi penyesuaian harga (jika diizinkan), namun tombol Hapus Massal disembunyikan atau dinonaktifkan dengan indikator gembok (*Owner Only*).
  - Kasir tidak dapat menghapus aset master toko.

---

### 5. Alur & Pengalaman Pengguna (User Flow & UX/UI)

#### 5.1. Seleksi Produk (Checkbox Interaction)
- Kolom pertama pada tabel master inventaris menyediakan checkbox pada setiap baris produk.
- Header tabel menyediakan master checkbox untuk memilih/membatalkan seluruh produk yang sedang ditampilkan sesuai filter/pencarian aktif.
- State seleksi melacak array `selectedIds: string[]`.

#### 5.2. Pemicu Aksi Hapus Massal (Trigger Condition: ≥ 2 Produk)
- Saat pengguna memilih **1 produk**:
  - Tombol Hapus Massal belum aktif/belum muncul (karena penghapusan 1 produk cukup menggunakan tombol hapus baris yang ada).
- Saat pengguna memilih **≥ 2 produk**:
  - Tombol **"Hapus Massal ({count})"** berwarna merah (Rose-600) muncul secara elegan di samping tombol "Penyesuaian Harga".
  - **Floating / Sticky Action Bar** muncul di bagian bawah layar:
    - Menampilkan teks: `"{count} produk dipilih"`
    - Tombol `"Batal Pilihan"`
    - Tombol `"Penyesuaian Harga ({count})"`
    - Tombol `"Hapus Massal ({count})"` dengan ikon tempat sampah.

#### 5.3. Modal Konfirmasi Hapus Massal (Safety Dialog)
Ketika tombol Hapus Massal ditekan, sebuah modal konfirmasi bertingkat muncul:
1. **Judul:** "Konfirmasi Hapus {count} Produk Massal"
2. **Peringatan Tegas:** Penjelasan bahwa produk yang dipilih akan dihapus permanen dari master inventaris dan sinkronisasi cloud, namun riwayat transaksi kasir yang lampau tetap aman.
3. **Daftar Ringkas Produk:** Menampilkan hingga 5 nama produk beserta SKU dan stok terkini, dengan badge `+X produk lainnya` jika lebih dari 5.
4. **Tombol Aksi:**
   - "Batal": Menutup modal tanpa menghapus data.
   - "Ya, Hapus {count} Produk": Mengeksekusi proses batch delete dengan status indikator loading.

#### 5.4. Pasca Eksekusi
- Pesan toast notifikasi sukses: `"Berhasil menghapus {count} produk dari inventaris."`
- Pilihan checkbox direset (`selectedIds = []`).
- Tampilan tabel langsung ter-refresh secara reaktif melalui Dexie Live Query dan Firestore Realtime Listener.

---

### 6. Arsitektur Teknis & Alur Data (Technical Architecture)

```
[UI: Inventory Checkbox Selection (>= 2)]
                │
                ▼ (Klik 'Hapus Massal')
   [Modal Konfirmasi Keamanan]
                │
                ▼ (Konfirmasi Owner)
     [ProductService.bulkDeleteProducts(selectedIds, userId, role)]
        ├── 1. Baca metadata produk untuk audit trail
        ├── 2. Simpan ID ke `settings.deleted_product_ids` (Cegah auto-seed)
        ├── 3. Hapus batch dari IndexedDB lokal:
        │       ├── db.products.bulkDelete / delete(id)
        │       ├── db.productCosts.delete(id)
        │       └── db.stockMovements.where('productId').equals(id).delete()
        ├── 4. Kirim log ke `AuditEngine`:
        │       action: 'BULK_DELETE_PRODUCTS'
        │       before: [Daftar produk terhapus]
        │       reason: 'Penghapusan massal oleh Owner'
        └── 5. Cloud Sync Realtime:
                ├── cloudDeleteDoc('products', id)
                └── cloudDeleteDoc('productCosts', id)
```

---

### 7. Penanganan Kasus Tepi (Edge Cases)
1. **Pilihan Melebihi 50 Item:**
   - Eksekusi menggunakan iterasi batch teratur dan asinkron tanpa memblokir thread antarmuka (UI tidak freeze).
2. **Koneksi Offline Saat Hapus Massal:**
   - Dexie IndexedDB menghapus seketika dalam sub-50ms (Zero-Latency UI).
   - Perintah hapus dimasukkan ke `syncQueue` dengan status `PENDING`, dan otomatis disinkronkan ke Firestore begitu koneksi internet pulih.
3. **Filter Pencarian Aktif Saat Memilih:**
   - Master checkbox hanya memilih item yang lolos kriteria filter saat ini, mencegah pengguna tidak sengaja memilih produk yang tersembunyi.
4. **Pembatalan Cepat:**
   - Tombol "Batal Pilihan" tersedia di floating bar untuk memudahkan membatalkan semua pilihan dengan 1 klik.

---

### 8. Kriteria Penerimaan (Acceptance Criteria)
- [x] Terdapat checkbox di setiap baris dan di header tabel master inventaris.
- [x] Tombol "Hapus Massal" hanya aktif/muncul ketika produk yang dicentang berjumlah **2 atau lebih (≥ 2)**.
- [x] Tombol dan fungsi hanya dapat dieksekusi oleh pengguna berstatus **Owner**.
- [x] Muncul dialog konfirmasi yang merinci jumlah dan nama produk yang akan dihapus.
- [x] Produk langsung terhapus dari tabel lokal dan cloud Firestore tanpa reload halaman.
- [x] ID produk terhapus tersimpan di blacklist seeder `deleted_product_ids`.
- [x] Log audit `BULK_DELETE_PRODUCTS` tercatat di riwayat audit.
- [x] Tidak ada error pada fitur Penjualan, Piutang, Laporan Keuangan, maupun Konversi Satuan.
