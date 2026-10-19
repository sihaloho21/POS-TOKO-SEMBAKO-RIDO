# Sistem Investigasi & Penyelesaian Selisih Kas Laci Kasir (Cash Discrepancy & Staff Receivable)

Sistem investigasi dan audit bagi Owner untuk memeriksa selisih uang fisik di laci kasir serta mengeksekusi kebijakan pembebanan selisih yang tidak terselesaikan langsung ke kasir sebagai piutang karyawan (kasbon / tanggung jawab kasir).

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Keputusan Kebijakan Toko yang Telah Dikonfirmasi:**
> **Kebijakan Selisih Tak Terselesaikan**: Jika selisih kas fisik di laci kasir tidak ditemukan penyebab transaksinya, Owner menyetujui kebijakan: **Bebankan ke kasir atau catat piutang kasir (kasbon/tanggung jawab kasir)**.

### Rincian Kebijakan yang Diterapkan:
1. **Pembebanan Otomatis ke Piutang Kasir**:
   - Jika saat tutup shift kasir mengalami selisih minus (uang fisik lebih sedikit dari *Expected Cash*), dan investigasi transaksi tidak menemukan kekeliruan sistem/struk, Owner dapat mengklik tombol **"Bebankan ke Kasir (Catat Piutang Kasir)"**.
   - Sistem secara otomatis membuat entri piutang karyawan (*Staff Receivable / Kasbon*) atas nama kasir yang bertugas pada shift tersebut.
   - Status resolusi shift tercatat sebagai `CHARGED_TO_CASHIER`.
2. **Audit Lengkap Sebelum Pembebanan**:
   - Sebelum memutuskan pembebanan, Owner dibekali panel periksa detail:
     - **Kalkulator Pecahan Fisik (*Denomination Counter*)**: Memastikan kasir tidak sekadar salah hitung lembaran uang Rp 100rb, 50rb, 20rb, dst.
     - **Rekap Arus Kas Laci**: Modal Awal + Penjualan Tunai + Bayar Piutang Tunai - Kas Keluar - Retur Tunai.
     - **Daftar Transaksi Shift**: Memeriksa struk yang dibatalkan, diskon khusus, atau transaksi cash.
3. **Otorisasi Owner**:
   - Setiap pembebanan selisih ke kasir membutuhkan otorisasi PIN Owner demi mencegah penyalahgunaan wewenang antar kasir.

---

## 1. Overview & Core Concept

### What It Does
Ketika kasir melakukan penutupan shift (*Clock Out*):
1. Kasir menghitung uang fisik di laci (dibantu lembar pecahan uang *Denomination Counter*).
2. Jika ada selisih, kasir wajib mengisi alasan awal (*Discrepancy Reason*).
3. Pada halaman **Riwayat & Performa Shift**, Owner melihat badge mencolok jika ada shift yang mengalami selisih belum terselesaikan (*Pending / Butuh Tindakan*).
4. Owner membuka modal **Audit Laci Kasir**, meninjau arus kas dan struk.
5. Jika selisih tidak dapat dijelaskan, Owner memilih aksi **Bebankan ke Kasir**:
   - Sistem mencatat piutang kasir di modul Piutang (`receivables`).
   - Saldo kas laci disesuaikan via `financeEvents` bertipe `ADJUSTMENT`.
   - Jejak audit mencatat bahwa selisih telah diselesaikan dengan dibebankan ke kasir.

### Target Audience & Persona
- **Owner Toko Sembako**: Memastikan tidak ada kebocoran uang kas di laci kasir dan memiliki dasar pencatatan resmi saat memotong gaji atau menagih kasbon kasir.
- **Kasir**: Memiliki transparansi data hitungan dan rincian transaksi sehingga tidak ada tuduhan sepihak tanpa dasar catatan.

### Key Value
- **Disiplin Kasir**: Kasir lebih berhati-hati dan teliti saat bertransaksi dan memberi uang kembalian.
- **Pencatatan Finansial Akurat**: Selisih minus tidak dibiarkan menguap tanpa pertanggungjawaban di pembukuan toko.

---

## 2. User Experience & Visual Design

### Alur Kerja Utama (User Flows)

```
[ Kasir Clock Out ] ──> Selisih Terdeteksi (Minus / Defisit)
                               │
                               ▼
[ Riwayat Shift Owner ] ──> Badge "⚠️ Selisih Kas (Belum Selesai)"
                               │
                               ▼
[ Klik "Audit Laci & Selesaikan" ]
  │
  ├─ Tab 1: Rekap Arus Kas (Modal Awal + Penjualan Tunai - Kas Keluar - Retur)
  ├─ Tab 2: Cek Pecahan Uang Fisik (Denomination Sheet)
  ├─ Tab 3: Riwayat Transaksi Shift (Filter Cash Only)
  │
  ▼
[ Form Tindakan Owner ]
  ├─ [★ PILIHAN UTAMA] "Bebankan ke Kasir (Catat Piutang/Kasbon)"
  │    ├─ Input Catatan Kesepakatan (misal: "Potong gaji akhir bulan")
  │    └─ Masukkan PIN Owner ──> Piutang Karyawan Terbuat Otomatis
  │
  └─ [ALTERNATIF] "Toleransi Toko" (Untuk selisih receh/kembalian bulat)
```

### Rincian Antarmuka (UI Components)

1. **Tombol & Indikator di `ShiftHistory.tsx` & `ShiftReport.tsx`**:
   - Kolom status rekonsiliasi yang interaktif.
   - Jika `discrepancy < 0` dan belum diselesaikan: Tombol merah/amber tegas bertuliskan **"Periksa Selisih & Tindak Lanjut"**.
   - Jika sudah dibebankan: Badge hijau tua bertuliskan **"✓ Dibebankan ke Kasir (Piutang Tercatat)"**.

2. **Modal Audit & Resolusi (`CashDiscrepancyAuditModal.tsx`)**:
   - Header jelas dengan nama kasir, jam mulai s/d tutup shift, dan total selisih kas.
   - Komponen kalkulator lembaran uang (*Denomination Counter*) untuk verifikasi fisik.
   - Kartu rincian formula arus kas warung.
   - Panel tindakan pembebanan piutang dengan konfirmasi nominal, tanggal jatuh tempo potong kasbon, dan verifikasi PIN Owner.

---

## 3. Key Product Decisions & Trade-Offs

### Keputusan 1: Mekanisme Pencatatan Piutang Karyawan
- **Pendekatan Terpilih**: Mencatat entri piutang resmi ke dalam tabel `receivables` / pelanggan internal bertipe `KARYAWAN` (nama kasir bersangkutan).
- **Alasan**: Terintegrasi langsung dengan menu **Buku Piutang / Pelunasan Hutang** yang sudah ada di aplikasi. Owner dapat memantau kapan kasir menyetor atau ketika gajian tiba dapat dipotong langsung secara transparan.

### Keputusan 2: Pemisahan Event Audit Keuangan
- **Pendekatan Terpilih**: Mengaitkan selisih shift dengan `FinanceEvent` bertipe `ADJUSTMENT` dan referensi `staffDebtId`.
- **Alasan**: Laporan kas toko tetap seimbang (laci fisik disesuaikan dengan uang riil, sedangkan selisih dipindahkan ke akun Piutang Karyawan).

---

## 4. Technical Architecture & Data Strategy

### Diagram Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                 TUTUP SHIFT (ClockOutModal)                 │
│  - Input uang fisik (dengan bantuan lembar pecahan uang)    │
│  - Input alasan selisih kasir                               │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   DATABASE LOKAL (Dexie.js)                 │
│  - db.shifts: discrepancy, discrepancyReason, approvalStatus│
│  - db.receivables: entri piutang kasir jika dibebankan      │
│  - db.financeEvents: ADJUSTMENT saldo laci warung           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             WORKBENCH INVESTIGASI & TINDAK LANJUT           │
│             (CashDiscrepancyAuditModal.tsx)                 │
│  - Menghitung ulang pecahan fisik bersama kasir             │
│  - Mengecek mutasi struk & petty cash                       │
│  - Eksekusi: "Bebankan ke Kasir (Catat Piutang)"            │
│  - Meminta verifikasi PIN Owner                             │
└─────────────────────────────────────────────────────────────┘
```

### Rencana Langkah Pengerjaan (Execution Steps)

1. **Step 1 - Service Layer**:
   - Tambahkan fungsi `resolveDiscrepancyToStaffReceivable` di `ShiftService`:
     - Memverifikasi PIN Owner.
     - Membuat / mengaitkan profil kasir ke entri `receivables`.
     - Mengubah status shift menjadi `CHARGED_TO_CASHIER` dan mencatat audit trail.
2. **Step 2 - Denomination Helper di Tutup Shift**:
   - Tambahkan kalkulator pecahan uang (lembar Rp 100k, 50k, 20k, 10k, 5k, 2k, 1k, koin) di modal penutupan shift.
3. **Step 3 - Modal Audit & Tindak Lanjut Owner (`CashDiscrepancyAuditModal.tsx`)**:
   - Tampilan periksa transaksi kas, breakdown expected cash, dan form pembebanan piutang kasir.
4. **Step 4 - Integrasi UI di `ShiftHistory.tsx` & `ShiftReport.tsx`**:
   - Tombol buka audit selisih, filter shift yang memiliki selisih kas, dan badge status resolusi.
5. **Step 5 - Uji & Verifikasi Build**:
   - Jalankan `compile_applet` dan `lint_applet` untuk memastikan seluruh fitur terintegrasi sempurna.
