# Product Requirements Document (PRD)
## Launch-Ready Data Cleansing Suite: Reset & Bulk Delete Data Percobaan (Khusus Role Owner)

---

### 1. Ringkasan Eksekutif (Executive Summary)
Dokumen ini menetapkan spesifikasi produk dan teknis untuk penyediaan rangkaian fitur **Hapus Massal (Bulk Delete via Checkbox)** dan **Reset Data Percobaan (Data Cleansing for Official Launch)** pada 5 modul utama sistem Toko Sembako & Ikan Riama:
1. **Riwayat & Performa Shift** (`ShiftHistory`)
2. **Riwayat Transaksi Penjualan / Sales** (`TransactionHistory` & POS `SalesHistory`)
3. **Database Pelanggan** (`Customers`)
4. **Fish Management** (Riwayat Kematian & Siklus Pengadaan Ikan)
5. **Buku Kas & Finance Ledger** (`Finance`)

Fitur ini dirancang khusus agar pemilik toko (**Role: OWNER**) dapat secara mandiri, leluasa, dan aman membersihkan seluruh data *trial*, data simulasi uji coba kasir, nota fiktif, serta saldo uji coba sebelum aplikasi resmi diluncurkan (*official professional launch*), tanpa merusak konfigurasi sistem, skema database, maupun master katalog barang yang sah.

---

### 2. Latar Belakang & Masalah (Problem Statement)
Selama fase pengembangan dan pelatihan staf kasir:
- Ratusan transaksi penjualan simulasi, nota hold, dan pembatalan telah tercatat.
- Riwayat pembukaan/penutupan shift kasir dipenuhi angka selisih fiktif.
- Data pelanggan berisi kontak acak atau akun uji coba diskon reseller.
- Siklus pengadaan ikan dan catatan kematian ikan berisi angka simulasi.
- Finance Ledger mencatat pergerakan modal, kasbon, dan prive uji coba.

Tanpa adanya fitur seleksi massal (checkbox multi-delete) dan tombol reset resmi, pemilik toko terpaksa menghapus data satu per satu secara manual atau mengalami distorsi laporan laba-rugi pada hari pertama peluncuran resmi.

---

### 3. Matriks Otoritas & Keamanan (Role & Permissions Guard)
- **Role OWNER (Wajib):**
  - Satu-satunya peran yang berhak melihat tombol reset data dan mengeksekusi penghapusan massal.
  - Setiap tindakan reset total dilindungi dialog konfirmasi bertingkat (*double confirmation*) yang menampilkan ringkasan data yang akan dihapus.
- **Role KASIR / STAFF:**
  - Sama sekali **tidak memiliki akses** ke tombol Hapus Massal maupun Reset Data.
  - Checkbox multi-select dinonaktifkan atau disembunyikan untuk staf kasir.
  - Upaya pemanggilan API/service langsung dari non-owner akan ditolak (*permission denied exception*).

---

### 4. Rincian Kebutuhan Fungsional per Modul

#### 4.1. Modul 1: Riwayat & Performa Shift (`ShiftHistory.tsx`)
- **Fitur Checkbox Multi-Select:**
  - Checkbox pada setiap baris sesi shift (tabel riwayat shift).
  - Master checkbox di header tabel untuk memilih seluruh shift yang sedang tampil.
  - Bilah aksi massal muncul saat ≥ 1 shift dipilih: tombol *"Hapus ({count}) Shift Terpilih"*.
- **Aksi Reset Total (Owner Only):**
  - Tombol *"Reset Semua Riwayat Shift"* berwarna merah di bilah aksi atas.
  - Menghapus seluruh data shift lama dari IndexedDB lokal dan Cloud Firestore (`shifts`).
  - Sesi shift aktif saat ini (jika sedang dibuka) dapat dipertahankan atau ditutup bersih.

#### 4.2. Modul 2: Riwayat Transaksi Sales (`TransactionHistory.tsx` & `SalesHistory.tsx`)
- **Fitur Checkbox Multi-Select:**
  - Checkbox di setiap baris nota transaksi.
  - Master checkbox di header tabel.
  - Bilah aksi muncul saat transaksi dicentang: tombol *"Hapus ({count}) Nota Terpilih"*.
- **Aksi Reset Total (Owner Only):**
  - Tombol *"Reset Semua Transaksi Sales"* dengan modal konfirmasi.
  - Menghapus transaksi terpilih / seluruh transaksi (`transactions`), nota retur, dan merapikan mutasi stok terkait transaksi percobaan.
- **Integritas:**
  - Piutang yang terkait dengan transaksi uji coba otomatis dibersihkan agar saldo piutang kembali 0.

#### 4.3. Modul 3: Database Pelanggan (`Customers.tsx`)
- **Fitur Checkbox Multi-Select:**
  - Checkbox di setiap baris pelanggan.
  - Master checkbox di header tabel.
  - Tombol *"Hapus ({count}) Pelanggan Terpilih"*.
- **Aksi Reset Total (Owner Only):**
  - Tombol *"Reset Database Pelanggan"*.
  - Menghapus data member uji coba beserta riwayat poin (`loyaltyHistory`), saldo kasbon lama, dan penyesuaian tier.
  - Menyisakan entitas aman (opsional: pelanggan umum).

#### 4.4. Modul 4: Fish Management (`FishManagement.tsx`)
- **Pembersihan Data Kematian (Death Log):**
  - Checkbox pada tabel riwayat kematian ikan untuk menghapus log mati simulasi.
- **Pembersihan Siklus Pengadaan (Procurement Cycles):**
  - Kemampuan menghapus batch pengadaan simulasi (`fishProcurementCycles`).
- **Aksi Reset Total (Owner Only):**
  - Tombol *"Reset Riwayat Ikan & Siklus"*: Mengosongkan death logs, riwayat WAC lama, dan siklus selesai, menyisakan stok ikan master saat ini.

#### 4.5. Modul 5: Finance Ledger (`Finance.tsx`)
- **Fitur Checkbox Multi-Select:**
  - Checkbox di tabel mutasi kas & finance events.
  - Master checkbox di header tabel.
  - Tombol *"Hapus ({count}) Mutasi Kas Terpilih"*.
- **Aksi Reset Total (Owner Only):**
  - Tombol *"Reset Buku Kas (Ledger)"*: Menghapus semua rekaman `financeEvents` simulasi (setoran modal, prive, transfer internal, dan beban operasional palsu) sehingga saldo kas bersih dimulai dari awal.

---

### 5. Arsitektur Teknis & Alur Data

```
[Owner UI Action] 
       │ (Checkbox Multi-Select / Tombol Reset Total)
       ▼
[Modal Konfirmasi Keamanan (Double Confirm)]
       │
       ▼
[DataResetService]
       ├── 1. Validasi Role: Wajib OWNER
       ├── 2. Eksekusi Batch Delete di IndexedDB lokal (Dexie):
       │       ├── db.shifts.bulkDelete()
       │       ├── db.transactions.bulkDelete()
       │       ├── db.customers.bulkDelete()
       │       ├── db.financeEvents.bulkDelete()
       │       └── db.fishProcurementCycles.bulkDelete()
       ├── 3. Eksekusi Live Sync Deletion ke Cloud Firestore:
       │       ├── cloudDeleteDoc('shifts', id)
       │       ├── cloudDeleteDoc('transactions', id)
       │       ├── cloudDeleteDoc('customers', id)
       │       ├── cloudDeleteDoc('financeEvents', id)
       │       └── cloudDeleteDoc('fishProcurementCycles', id)
       └── 4. Catat Audit Log Resmi ke AuditEngine:
               action: 'RESET_MODULE_DATA' / 'BULK_DELETE_DATA'
               referenceId: 'OFFICIAL_LAUNCH_CLEANSE'
```

---

### 6. Jaminan Stabilitas & Non-Disruption
1. **Master Produk & Harga Tetap Aman:** Fitur reset transaksi dan ledger tidak akan menghapus master data SKU barang sembako atau ikan yang telah diinput kecuali pemilik toko sengaja menghapusnya di menu inventaris.
2. **Offline-Ready:** Jika koneksi internet terputus, pembersihan lokal tetap instan (sub-50ms) dan antrian `syncQueue` akan menyelaraskan penghapusan ke cloud begitu online.
3. **Audit Trail Tersimpan:** Seluruh aksi reset massal mencatat waktu eksekusi, ID Owner, dan jumlah rekaman yang dibersihkan di tabel `auditLogs`.

---

### 7. Kriteria Penerimaan (Acceptance Criteria)
- [x] Menu Riwayat Shift menyediakan checkbox baris & master, tombol Hapus Terpilih, serta tombol Reset Semua Riwayat Shift (Owner only).
- [x] Menu Riwayat Transaksi Sales (POS & Transactions) menyediakan checkbox baris & master, tombol Hapus Terpilih, serta tombol Reset Transaksi (Owner only).
- [x] Menu Database Pelanggan menyediakan checkbox baris & master, tombol Hapus Terpilih, serta tombol Reset Pelanggan (Owner only).
- [x] Menu Fish Management menyediakan opsi pembersihan log kematian dan reset siklus uji coba (Owner only).
- [x] Menu Finance Ledger menyediakan checkbox mutasi kas, tombol Hapus Terpilih, serta tombol Reset Buku Kas (Owner only).
- [x] Seluruh perubahan terhapus seketika di Dexie lokal dan Cloud Firestore secara realtime.
- [x] Staf berstatus Kasir tidak memiliki wewenang atau visibilitas terhadap fitur reset ini.
