# PRD: Integrasi ShopeePayLater untuk Pembelian Barang (Kulakan)

Fitur ini memungkinkan Owner untuk mencatat pembelian barang menggunakan metode ShopeePayLater (SPayLater) dengan tenor 1 atau 3 bulan (bunga 0%), pencatatan jadwal cicilan otomatis setiap tanggal 25, dan pemantauan total tagihan aktif.

### User Review & Critical Decisions

> [!IMPORTANT]
> Pembayaran cicilan SPayLater akan memotong saldo kas toko (misal: Kas Ikan atau Kas Warung) pada saat jatuh tempo dikonfirmasi secara manual oleh user. Sistem akan memberikan pengingat visual untuk tagihan yang mendekati tanggal 25.

-   **Konfirmasi UI**: Menu "Purchases" akan memiliki tab baru bernama **"Hutang PayLater"**.
-   **Logika Jatuh Tempo**: Jika belanja hari ini, cicilan pertama jatuh tempo pada **tanggal 25 bulan berikutnya**. Untuk tenor 3 bulan, cicilan 2 dan 3 jatuh tempo pada tanggal 25 di bulan-bulan selanjutnya.
-   **Penyimpanan Dana**: Saat membayar cicilan, user dapat memilih sumber dana (Kas Warung / Ikan / Digital).

---

### 1. Overview & Core Concept

-   **What It Does**: Memberikan fleksibilitas pembayaran kulakan dengan memisahkan pencatatan stok yang masuk hari ini dengan aliran kas keluar yang tertunda (deferred payment).
-   **Key Value**: Membantu Owner mengelola likuiditas kas kecil. Barang (seperti ikan) bisa dijual terlebih dahulu untuk mengumpulkan uang pembayaran cicilan.

---

### 2. User Experience & Visual Design

-   **Alur Input Pembelian**:
    1.  Buka menu **Purchases > Input Baru**.
    2.  Pilih Supplier dan scan/input barang.
    3.  Pada bagian **Status Pembayaran**, tambahkan opsi **"ShopeePayLater"**.
    4.  Pilih Tenor: **1 Bulan (1x)** atau **3 Bulan (3x)**.
    5.  Sistem menampilkan estimasi nominal per cicilan dan tanggal jatuh tempo (25 per bulan).
-   **Alur Monitoring & Pelunasan**:
    1.  Buka menu **Purchases > Hutang PayLater**.
    2.  Lihat ringkasan: **Total Limit Terpakai** dan **Total Tagihan Bulan Ini**.
    3.  Daftar cicilan diurutkan berdasarkan tanggal jatuh tempo terdekat.
    4.  Klik **"Bayar Cicilan"** -> Pilih Kas (Warung/Ikan) -> Konfirmasi.

---

### 3. Key Product Decisions & Trade-Offs

-   **Decision 1: Dedicated Ledger for PayLater**
    -   *Approach*: Menambahkan tabel `payLaterBills` di database lokal (Dexie).
    -   *Why*: Karena satu pembelian SPayLater menghasilkan beberapa jadwal pembayaran (installments), struktur `Purchase` standar tidak cukup untuk melacak status tiap bulan.
-   **Decision 2: Manual Payment Confirmation**
    -   *Approach*: User harus mengklik "Bayar" secara manual di sistem saat mereka membayar tagihan di aplikasi Shopee.
    -   *Why*: Sistem POS tidak terhubung langsung dengan API Shopee, sehingga sinkronisasi kas harus dilakukan manual untuk akurasi saldo laci.

---

### 4. Technical Architecture

```
┌─────────────────────────────────┐      ┌─────────────────────────────┐
│       Purchases Component       │─────▶│      PayLaterService        │
│ (Selector SPayLater 1x/3x)      │      │ (Logic Cicilan & Due Date)  │
└─────────────────────────────────┘      └──────────────┬──────────────┘
                                                        │
                                         ┌──────────────▼──────────────┐
                                         │      Dexie DB (New Table)   │
                                         │ - payLaterBills             │
                                         │ - installments              │
                                         └─────────────────────────────┘
```

-   **Schema Baru**:
    -   `PayLaterBill`: `id, purchaseId, totalAmount, tenor, status, createdAt`.
    -   `PayLaterInstallment`: `id, billId, amount, dueDate, status, paidAt, storageId`.
-   **Integrasi Finance**: Setiap pelunasan cicilan akan mencatatkan `FinanceEvent` tipe `OUT` pada storage yang dipilih.
