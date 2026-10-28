# Product Requirements Document (PRD)
## Modul: Penggajian Karyawan & Histori Gaji (Owner-Only Payroll Management)
**Aplikasi**: Toko Sembako Riama (POS & Retail Management System)  
**Versi Dokumen**: 1.0  
**Tanggal**: 28 Oktober 2026  
**Status**: Usulan / Menunggu Persetujuan Owner (Pending Approval)

---

## 1. Latar Belakang & Tujuan (Background & Objectives)
Dalam operasional Toko Sembako Riama, pengeluaran gaji karyawan dan pembagian bonus insentif merupakan wewenang mutlak dari pemilik toko (**Owner**). Setiap karyawan dapat menerima gaji pokok serta berbagai jenis bonus berdasarkan performa nyata (penjualan ikan, transaksi digital, kebersihan toko, kedisiplinan, maupun lembur).

### Tujuan Utama:
1. **Fleksibilitas Penentuan Manual**: Memberikan kendali penuh kepada Owner untuk menginput nominal gaji pokok dan rincian bonus karyawan setiap periode tanpa rumus kaku yang membatasi diskresi owner.
2. **Kategori Bonus Dinamis**: Menyediakan master kategori bonus yang lengkap (Kebersihan, Penjualan Ikan, Penjualan Digital, Disiplin, Lembur, dsb.) serta dapat ditambah/disesuaikan oleh Admin/Owner sewaktu-waktu.
3. **Pencatatan Gaji Periode Lampau (Backdated Entry)**: Memungkinkan Owner memasukkan data penggajian bulan-bulan atau tahun-tahun sebelumnya agar pembukuan histori karyawan masa lalu tercatat rapi dan lengkap.
4. **Keamanan & Privasi Tingkat Tinggi (Owner-Only)**: Modul dan riwayat gaji bersifat rahasia, hanya dapat diakses oleh akun dengan role `OWNER`. Role Kasir, Gudang, atau Manager tidak dapat melihat menu, data, maupun laporan gaji.
5. **Keamanan Integritas Kas**: Menjaga agar pencatatan gaji lampau tidak merusak atau mengurangi saldo kas berjalan toko hari ini.

---

## 2. Hak Akses Pengguna (Role-Based Access Control)

| Role | Akses Menu Gaji | Input Gaji Berjalan | Input Gaji Lampau | Kelola Kategori Bonus | Cetak Slip Gaji |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **OWNER** | **Ya (Penuh)** | **Ya** | **Ya** | **Ya** | **Ya** |
| **ADMIN / MANAGER** | Tidak | Tidak | Tidak | Ya (Hanya Master Bonus)* | Tidak |
| **KASIR** | Tidak | Tidak | Tidak | Tidak | Tidak |
| **WAREHOUSE** | Tidak | Tidak | Tidak | Tidak | Tidak |

*\*Catatan: Pengelolaan master kategori bonus dapat diatur lewat menu Master Pengaturan oleh Admin/Owner, namun seluruh nominal dan pencatatan gajian 100% eksklusif hanya untuk Owner.*

---

## 3. Fitur Utama & Kebutuhan Fungsional (Core Features)

### 3.1. Halaman Manajemen Penggajian (Owner Payroll Dashboard)
- **Ringkasan Finansial**:
  - Total Pengeluaran Gaji Bulan Ini
  - Total Gaji Pokok vs Total Bonus yang Diberikan
  - Jumlah Karyawan yang Sudah Digaji vs Belum Digaji pada periode aktif
- **Filter & Navigasi**:
  - Filter Periode: Bulan (Januari – Desember) dan Tahun (misal: 2023, 2024, 2025, 2026, dst.)
  - Filter Karyawan: Semua Karyawan atau nama karyawan tertentu
  - Filter Jenis Catatan: Semua / Gaji Berjalan / Histori Masa Lalu
- **Tabel Rekapitulasi Gaji**:
  - Tanggal Bayar, Nama Karyawan, Periode (Bulan/Tahun), Gaji Pokok, Rincian Bonus, Total Diterima, Status Pembayaran, Metode Pembayaran (Tunai/Transfer), Aksi (Detail, Edit, Cetak Slip, Hapus).

---

### 3.2. Form Input Gaji Manual (Gaji Berjalan & Gaji Masa Lalu)
Form modal yang mudah digunakan oleh Owner dengan kolom:
1. **Pilih Karyawan**:
   - Pilihan dari daftar akun karyawan yang terdaftar di sistem.
   - Opsi *Input Nama Manual* (untuk karyawan lepas/borongan/mantan karyawan yang tidak memiliki akun login sistem).
2. **Periode Gaji**:
   - Bulan & Tahun gaji yang dibayarkan (bebas memilih tahun lampau, misal: *Oktober 2024* atau *Agustus 2025*).
3. **Tanggal Pembayaran Nyata**:
   - Date picker bebas (bisa tanggal hari ini atau tanggal di masa lampau).
4. **Gaji Pokok (Base Salary)**:
   - Input angka rupiah manual oleh Owner.
5. **Rincian Bonus Dinamis (Multi-item Bonuses)**:
   - Tombol `+ Tambah Bonus`.
   - Tiap baris bonus memiliki:
     - Dropdown Kategori Bonus
     - Input Nominal (Rp)
     - Catatan/Keterangan singkat (misal: *"Target 150 kg ikan nila tercapai"*, *"Bonus shift malam"*).
     - Tombol Hapus baris bonus.
6. **Potongan / Kasbon (Opsional)**:
   - Input potongan jika ada karyawan yang memiliki cicilan kasbon atau potongan izin.
7. **Kalkulasi Otomatis (Real-time Calculation)**:
   - $\text{Total Diterima} = \text{Gaji Pokok} + \sum(\text{Bonus}) - \text{Potongan}$
8. **Metode Pembayaran**:
   - Tunai (Kas Warung), Tunai (Kas Ikan), Transfer Bank, atau Dompet Digital.
9. **Opsi Dampak Saldo Kas Toko (PENTING untuk Data Lampau)**:
   - Switch: `[x] Catat ke Arus Kas Toko Sekarang (Finance Event)`
   - *Default untuk input masa lalu*: **TIDAK AKTIF** (hanya tersimpan sebagai arsip histori pembukuan, tanpa memotong saldo kas toko yang ada di laci/brankas saat ini).

---

### 3.3. Pengelolaan Kategori Bonus (Dynamic Bonus Categories)
Master daftar bonus yang siap pakai dan bisa ditambah/diubah sewaktu-waktu:
- **Daftar Kategori Bawaan (Default)**:
  1. *Bonus Kebersihan* (Kerapian & higienitas toko/lapak ikan)
  2. *Bonus Penjualan Ikan* (Insentif volume/omset ikan basah)
  3. *Bonus Penjualan Digital* (Insentif transaksi pulsa, token PLN, transfer)
  4. *Bonus Disiplin* (Kehadiran tepat waktu & nihil absen)
  5. *Bonus Lembur* (Jam kerja ekstra saat ramai/bongkar muat)
- **Kemampuan Kustomisasi**:
  - Tombol Tambah Kategori Baru (misal: *Bonus Hari Raya / THR*, *Bonus Akhir Tahun*, *Bonus Loyalitas*).
  - Status Aktif/Nonaktif agar kategori lama yang tidak dipakai tidak mengotori pilihan dropdown.

---

### 3.4. Riwayat & Rekam Jejak Karyawan (Employee Salary History)
- Riwayat penggajian lengkap per karyawan sejak awal bekerja.
- Indikator khusus untuk membedakan data penggajian reguler vs data historis yang diinput susulan:
  - Badge hijau: `REGULER`
  - Badge oranye: `HISTORI LAMPAU`
- Fitur pencarian cepat dan ekspor data (CSV / Excel).

---

### 3.5. Cetak Slip Gaji (Receipt / Slip Printing)
- Format Cetak Slip Gaji Resmi Toko Sembako Riama:
  - Header: Nama Toko, Alamat, Kontak
  - Identitas: Nama Karyawan, Periode Gaji, Tanggal Pembayaran
  - Tabel Rincian:
    - Gaji Pokok: Rp xxx
    - Bonus Kebersihan: Rp xxx
    - Bonus Penjualan Ikan: Rp xxx
    - Bonus Penjualan Digital: Rp xxx
    - (Daftar bonus lainnya sesuai yang diinput)
    - Total Bonus: Rp xxx
    - Potongan: (Rp xxx)
    - **TOTAL DITERIMA (TAKE HOME PAY): Rp xxx**
  - Footer: Tanda Tangan Penerima (Karyawan) & Tanda Tangan Mengetahui (Owner).
  - Mendukung cetak ke Printer Thermal (58mm/80mm) dan format A4/PDF.

---

## 4. Skema Data & Arsitektur Teknis (Data Architecture)

### 4.1. Tabel `payrollRecords` (Dexie & Firestore)
```typescript
export interface PayrollBonusItem {
  categoryId: string;
  categoryName: string;
  amount: number;
  notes?: string;
}

export interface PayrollRecord {
  id: string;                    // UUID
  employeeId?: string;           // ID Akun karyawan (opsional jika non-akun)
  employeeName: string;          // Nama lengkap karyawan
  periodMonth: number;           // 1 - 12
  periodYear: number;            // contoh: 2024, 2025, 2026
  paymentDate: string;           // Tanggal pembayaran (YYYY-MM-DD)
  baseSalary: number;            // Nominal gaji pokok
  bonuses: PayrollBonusItem[];   // Rincian bonus
  totalBonus: number;            // Total penjumlahan bonus
  deductions: number;            // Total potongan kasbon / izin (jika ada)
  totalAmount: number;           // baseSalary + totalBonus - deductions
  paymentMethod: 'CASH_WARUNG' | 'CASH_IKAN' | 'TRANSFER' | 'DIGITAL';
  notes?: string;
  isBackdated: boolean;          // true jika input histori masa lalu
  affectCashBalance: boolean;    // true jika memotong financeEvents kas saat ini
  createdBy: string;             // Owner userId
  createdAt: string;
  updatedAt: string;
}
```

### 4.2. Tabel `bonusCategories` (Dexie & Firestore)
```typescript
export interface BonusCategory {
  id: string;
  name: string;                  // Nama kategori bonus
  description?: string;
  isSystem: boolean;             // true jika kategori bawaan toko
  isActive: boolean;             // true jika aktif muncul di dropdown
  createdAt: string;
}
```

---

## 5. Rencana Alur Kerja Pengguna (User Flow)

```
[Owner Login]
      │
      ▼
[Menu Sidebar: "Penggajian Karyawan"] (Hanya tampil jika role == 'OWNER')
      │
      ├──► [Lihat Rekapitulasi & Filter Periode/Tahun]
      │
      ├──► [Tombol: "+ Input Gaji Karyawan"]
      │         │
      │         ├── Pilih Karyawan (atau ketik nama baru)
      │         ├── Pilih Periode (Bulan & Tahun: bisa tahun lalu / sekarang)
      │         ├── Input Tanggal Pembayaran
      │         ├── Input Gaji Pokok (Rp)
      │         ├── Klik "+ Tambah Bonus" ──► Pilih Kategori (Kebersihan, Ikan, Digital, dll) & Isi Nominal
      │         ├── Tentukan apakah memotong Saldo Kas Toko saat ini (Centang/Tidak)
      │         └── Simpan Gaji ──► Data Tersimpan & Tersinkronisasi ke Cloud
      │
      ├──► [Tombol: "Kelola Kategori Bonus"] ──► Tambah / Edit Kategori Bonus Baru
      │
      └──► [Aksi Baris Tabel]:
                ├── Lihat Detail Rincian Gaji
                ├── Cetak Slip Gaji (Thermal 58/80mm atau A4)
                └── Edit / Hapus Rekord Gaji
```

---

## 6. Kriteria Keberhasilan (Acceptance Criteria)
1. **Keamanan Role**: Jika user login sebagai Kasir atau Gudang, menu gaji tidak muncul di sidebar, dan rute `/payroll` ditolak langsung.
2. **Input Manual Fleksibel**: Owner dapat memasukkan angka Gaji Pokok berapapun dan menambahkan kombinasi bonus apapun tanpa dipaksa formula otomatis.
3. **Pilihan Kategori Lengkap**: Pilihan bonus awal mencakup *Kebersihan, Penjualan Ikan, Penjualan Digital, Disiplin, Lembur*, serta dapat ditambah kategori kustom baru.
4. **Dukungan Data Masa Lalu**: Owner dapat menginput riwayat gaji tahun 2024 atau 2025 secara manual lengkap dengan rincian bonus dan tanggal lampau.
5. **Perlindungan Saldo Kas**: Penginputan histori masa lalu tidak mengurangi saldo kas hari ini jika opsi pemotongan kas dinonaktifkan.
6. **Slip Gaji Rapi**: Slip gaji memuat rincian terpisah antara gaji pokok dan masing-masing jenis bonus yang didapatkan.

---

## 7. Tahapan Eksekusi Berikutnya (Setelah Persetujuan)
- **Langkah 1**: Pembuatan Model Tipe (`src/core/types.ts`) & Migrasi Tabel Dexie (`LocalDatabase`).
- **Langkah 2**: Pembuatan Service Penggajian & Seeding Kategori Bonus Bawaan (`payroll-service.ts`).
- **Langkah 3**: Pembuatan UI Halaman Penggajian Owner (`src/app/payroll/PayrollManagement.tsx`) dan Modal Input Gaji Multi-Bonus.
- **Langkah 4**: Pembuatan Modal Manajemen Kategori Bonus & Modal Cetak Slip Gaji.
- **Langkah 5**: Integrasi menu Sidebar khusus Role Owner dan pengujian menyeluruh (Lint & Build).
