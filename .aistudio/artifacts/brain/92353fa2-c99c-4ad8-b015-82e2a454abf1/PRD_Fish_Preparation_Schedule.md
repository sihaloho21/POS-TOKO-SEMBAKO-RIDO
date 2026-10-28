# Product Requirements Document (PRD)
## Modul: Jadwal Pemesanan & To-Do List Pengolahan Ikan (Fish Pre-Order & Preparation Schedule)
**Aplikasi**: Toko Sembako Riama (POS & Retail Management System)  
**Versi Dokumen**: 1.0  
**Tanggal**: 28 Oktober 2026  
**Status**: Usulan Rancangan (Pending User Review & Approval)

---

## 1. Latar Belakang & Masalah (Background & Problem Statement)

Di Toko Sembako Riama, penjualan ikan basah/hidup (Nila, Mas, Gurame, Lele, Patin) memiliki karakteristik layanan yang berbeda dari barang sembako biasa:
1. **Pemesanan Lebih Awal (Pre-Order)**: Banyak pelanggan (rumah makan, katering, arisan, pesta keluarga, atau langganan mingguan) memesan ikan untuk diambil atau diantar pada tanggal dan jam tertentu di masa mendatang.
2. **Kebutuhan Pengolahan Spesifik (Preparation Instructions)**:
   - Pelanggan meminta penanganan khusus: **dibersihkan sisik & insang**, **dibuang isi perut**, **dipotong (potong 2, potong 3, belah punggung bakar, fillet, atau dikerat bumbu)**.
   - Ada juga yang meminta **ikan tetap hidup** dengan packing kantong oksigen.
3. **Spesifikasi Ukuran (Grading / Ukuran per Kg)**:
   - Pelanggan membutuhkan ukuran tertentu, misalnya: *Isi 2 ekor/kg* (ikan besar), *Isi 3-4 ekor/kg* (ukuran sedang untuk bakar), atau *Isi 6-8 ekor/kg* (ukuran kecil/pecel).
4. **Masalah Saat Ini**:
   - Catatan pesanan seringkali tercecer di kertas nota sobekan atau chat WhatsApp kasir.
   - Pekerja kolam/lapak ikan sering bingung pesanan mana yang harus disiapkan duluan saat pagi hari, berapa kilogram yang harus dibersihkan, atau bagaimana instruksi potongnya, sehingga rawan salah potong atau terlambat saat pelanggan datang mengambil.

---

## 2. Tujuan Fitur (Objectives & Goals)

1. **Perencanaan Kerja Terstruktur (To-Do List & Scheduling)**:
   - Menyediakan papan jadwal kerja terpusat (*To-Do List*) berdasarkan tanggal, bulan, tahun, dan target jam selesai/pengambilan.
2. **Instruksi Pengolahan Akurat & Lengkap**:
   - Memastikan setiap pesanan memiliki detail: jenis ikan, bobot total (kg), estimasi jumlah ekor, grading ukuran per kg, instruksi kebersihan, dan jenis potongan.
3. **Kemudahan Monitoring Pekerja Lapak & Kasir**:
   - Pekerja lapak ikan dapat melihat to-do list harian, mengubah status pesanan dari `MENUNGGU` ➔ `SEDANG DIKERJAKAN` ➔ `SELESAI (SIAP DIAMBIL/DIANTAR)`.
   - Kasir langsung tahu kapan pesanan sudah siap diambil oleh pelanggan saat pelanggan tiba di toko.
4. **Cetak Tiket Kerja Thermal (Kitchen/Preparation Ticket)**:
   - Mencetak label tiket mini (58mm/80mm) yang ditempelkan di kantong ikan saat proses pembersihan dan penimbangan di lapak ikan.

---

## 3. Hak Akses & Alur Kerja Pengguna (User Roles & Workflow)

| Peran (Role) | Buat Jadwal / Pesanan | Ubah Status To-Do List | Cetak Tiket Kerja | Integrasi ke Kasir POS |
| :--- | :---: | :---: | :---: | :---: |
| **KASIR** | Ya | Ya | Ya | Ya (Saat pelunasan) |
| **PETUGAS LAPAK / GUDANG** | Ya | Ya (Centang Selesai) | Ya | Tidak |
| **OWNER / MANAGER** | Ya (Penuh) | Ya (Penuh) | Ya | Ya |

### Alur Kerja (Workflow):
```
[Pelanggan Memesan (Datang/WA/Telepon)]
               │
               ▼
[Kasir/Staff Input ke Form Jadwal Pemesanan]
 (Tgl & Jam Selesai, Nama Pemesan, Jenis Ikan, xx Kg, Ukuran/Grading, Bersihkan/Potong)
               │
               ▼
[Papan To-Do List Lapak Ikan] (Status: "MENUNGGU")
   - Cetak Tiket Label Kerja (Tempel di Wadah/Baskom)
               │
               ▼
[Petugas Kolam Menimbang & Mengolah]
   - Klik "Mulai Kerjakan" (Status: "SEDANG DIKERJAKAN")
   - Bersihkan sisik/insang, potong sesuai instruksi (misal: belah punggung)
               │
               ▼
[Selesai Pengolahan]
   - Klik "Selesai / Siap Diambil" (Status: "SIAP DIAMBIL")
   - Ikan disimpan di chiller / wadah bersih siap serah
               │
               ▼
[Pelanggan Datang / Kurir Berangkat]
   - Kasir buka POS ➔ Muat dari Jadwal ➔ Pelunasan Selesai (Status: "SELESAI")
```

---

## 4. Kebutuhan Fungsional & Fitur Utama (Core Features)

### 4.1. Form Input Jadwal & Pemesanan (Task Input Modal)
Kolom formulir yang terstruktur dan cepat diisi:
1. **Waktu & Target Pengambilan**:
   - Tanggal target (Date Picker: Tgl/Bln/Thn).
   - Waktu target (Time Picker: misal Jam 09:30 WIB).
   - Jenis Penyerahan: *Ambil di Toko (Pickup)* atau *Diantar (Delivery)*.
2. **Data Pemesan**:
   - Nama Pelanggan (pilih dari database pelanggan atau input nama baru).
   - Nomor Telepon / WhatsApp.
   - Alamat pengantaran / keterangan lokasi (jika delivery).
3. **Spesifikasi Ikan & Volume**:
   - Pilihan Jenis Ikan: *Nila*, *Mas*, *Gurame*, *Lele*, *Patin*, atau Komoditas Kustom.
   - Total Berat: `xx` Kg (contoh: 15.5 kg).
   - Estimasi Total Ekor (opsional, misal: 45 ekor).
4. **Grading / Ukuran per Kg**:
   - Pilihan cepat chip / dropdown:
     - *Isi 1 - 2 ekor/kg (Besar / Jumbo)*
     - *Isi 3 - 4 ekor/kg (Sedang / Standar Bakar)*
     - *Isi 5 - 6 ekor/kg (Kecil)*
     - *Isi 7 - 10 ekor/kg (Khusus Lele Pecel)*
     - *Kustom (Input manual)*
5. **Checklist Instruksi Pengolahan (Cleaning & Cutting Checklist)**:
   - `[x] Dibersihkan Sisik & Insang`
   - `[x] Dikeluarkan Kotoran / Isi Perut`
   - Pilihan Jenis Potongan:
     - *Ikan Utuh (Tidak dipotong)*
     - *Potong 2 bagian*
     - *Potong 3 bagian*
     - *Belah Punggung (Model Ikan Bakar)*
     - *Fillet Daging*
     - *Kerat Garis Bumbu (Sayat badan)*
   - Status Kondisi:
     - *Mati Bersih (Chilled / Siap Masak)*
     - *Ikan Hidup (Plastik Oksigen - Tidak Dibersihkan)*
     - *Tambah Es Batu Ekstra*
6. **Catatan Khusus**:
   - Kolom teks bebas (misal: *"Pisahkan kepala di kantong tersendiri"*, *"Pesanan untuk hajatan Bu RT"*).
7. **Status Pembayaran & Uang Muka (DP)**:
   - Belum Bayar / DP Uang Muka (Rp) / Lunas.

---

### 4.2. Papan Jadwal & To-Do List (Schedule Board)
Tampilan visual yang intuitif bagi staf toko:
1. **Tab Filter Waktu Cepat**:
   - **Hari Ini (Today)**: Fokus utama tugas yang harus diselesaikan segera.
   - **Besok (Tomorrow)**: Rencana persiapan bahan/stok ikan di kolam untuk esok hari.
   - **Mendatang (Upcoming)**: Jadwal minggu ini / bulan ini.
   - **Riwayat Selesai (Completed History)**.
2. **Ringkasan Beban Kerja Harian (Daily Summary Banner)**:
   - Contoh: *"Total Tugas Hari Ini: 8 Pesanan • Total Berat: 62.5 kg (Nila: 35 kg, Gurame: 15 kg, Lele: 12.5 kg)"*.
3. **Kartu Tugas Visual (Task Cards)**:
   - Header jam target dengan badge warna (Merah = mendesak / < 1 jam lagi, Biru = normal, Hijau = selesai).
   - Identitas pemesan & nomor kontak.
   - Badge spesifikasi jelas: `[15 kg Nila]` • `[Isi 3-4 ekor/kg]` • `[Belah Punggung]`.
   - Tombol satu-klik ubah status:
     - `Mulai Olah` ➔ `Tandai Siap Ambil` ➔ `Selesai / Lunas`.

---

### 4.3. Cetak Tiket Kerja Lapak Ikan (Preparation Thermal Slip)
- Dicetak langsung ke printer kasir thermal (58mm atau 80mm).
- Format ringkas & jelas untuk ditempelkan di kantong/baskom pengerjaan:
  ```
  ================================
      TIKET PENGERJAAN IKAN
        TOKO SEMBAKO RIAMA
  ================================
  No Pesanan : #JADWAL-1028-003
  Tgl & Jam  : 28/10/2026 - 10:30 WIB
  Pemesan    : Ibu Sri (0812-XXXX-XXXX)
  --------------------------------
  KOMODITAS  : IKAN NILA
  BERAT      : 12.0 KG
  GRADING    : ISI 3-4 EKOR/KG
  --------------------------------
  INSTRUKSI PENGOLAHAN:
  [V] Bersihkan Sisik & Insang
  [V] Buang Isi Perut
  [V] POTONG: BELAH PUNGGUNG
  --------------------------------
  CATATAN:
  Kepala tetap dipasang, cuci bersih.
  STATUS: MENUNGGU
  ================================
  ```

---

### 4.4. Integrasi dengan Stok Ikan & POS Kasir
1. **Pengecekan Stok Kolam (Stock Feasibility Check)**:
   - Saat kasir menerima pesanan 30 kg Nila untuk besok, sistem menampilkan sisa stok Nila saat ini di kolam sehingga kasir tahu apakah stok aman atau perlu restock dari supplier.
2. **Koneksi ke POS (Checkout)**:
   - Ketika pelanggan datang mengambil, kasir cukup klik *"Proses ke Kasir POS"*, item ikan langsung terisi di keranjang kasir dengan berat nyata dan potongan DP otomatis dihitung.

---

## 5. Struktur Data & Arsitektur Teknis (Data Model)

### Tabel `preparationTasks` (Dexie & Firestore)
```typescript
export type PreparationCuttingType = 
  | 'NONE' 
  | 'POTONG_2' 
  | 'POTONG_3' 
  | 'BELAH_PUNGGUNG' 
  | 'FILLET' 
  | 'KERAT_BUMBU';

export type PreparationCondition = 
  | 'CLEAN_CHILLED' 
  | 'LIVE_OXYGEN' 
  | 'LIVE_REGULAR';

export type PreparationTaskStatus = 
  | 'PENDING'       // Menunggu giliran
  | 'IN_PROGRESS'   // Sedang dibersihkan / dipotong
  | 'PREPARED'      // Sudah selesai diolah, siap diambil/diantar
  | 'COMPLETED'     // Sudah diserahkan & lunas
  | 'CANCELLED';    // Dibatalkan

export interface PreparationTask {
  id: string;                     // UUID
  taskNumber: string;             // Format: TIKET-YYMMDD-XXX
  scheduledDate: string;          // YYYY-MM-DD (Tanggal pengerjaan/ambil)
  scheduledTime: string;          // HH:mm (Waktu target selesai)
  customerName: string;           // Nama pemesan
  customerPhone?: string;         // No kontak WA/Telepon
  deliveryType: 'PICKUP' | 'DELIVERY';
  deliveryAddress?: string;       // Alamat kirim jika delivery
  
  // Spesifikasi Ikan
  fishType: string;               // NILA, MAS, GURAME, LELE, PATIN, dll.
  productId?: string;             // Link ke tabel products jika ada
  weightKg: number;               // Berat dalam kilogram
  estimatedCount?: number;        // Estimasi jumlah ekor
  sizeGrading: string;            // Contoh: "3-4 ekor/kg", "1-2 ekor/kg"
  
  // Instruksi Pengolahan
  isCleaned: boolean;             // Bersihkan sisik & insang
  isGutted: boolean;              // Buang isi perut
  cuttingType: PreparationCuttingType;
  condition: PreparationCondition;
  extraIce: boolean;              // Tambah es batu
  customNotes?: string;           // Catatan bebas dari pelanggan
  
  // Status & Pembayaran
  status: PreparationTaskStatus;
  paymentStatus: 'UNPAID' | 'DOWN_PAYMENT' | 'PAID';
  downPaymentAmount: number;      // Nominal uang muka jika ada
  totalPrice?: number;            // Estimasi harga jual
  
  // Audit
  assignedStaffId?: string;       // Petugas yang mengerjakan
  completedAt?: string;           // Waktu selesai pengolahan
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## 6. Penempatan Navigasi di Sistem
Terdapat 2 titik akses mudah:
1. **Tab Baru di Menu Fish Management**:
   - Menambahkan tab ke-5: `JADWAL & TO-DO LIST IKAN` di halaman *Fish Management*.
2. **Widget Cepat di POS / Kasir Dashboard**:
   - Menampilkan kartu notifikasi: *"Ada 3 pesanan ikan yang harus siap sebelum jam 11:00"* sehingga staf toko selalu waspada terhadap komitmen pesanan pelanggan.

---

## 7. Kriteria Keberhasilan (Acceptance Criteria)
1. Kasir atau staf dapat membuat jadwal pemesanan ikan untuk tanggal hari ini maupun tanggal di masa mendatang dengan rincian lengkap (kg, grading ukuran, dan instruksi potong).
2. Tampilan to-do list harian mengelompokkan pesanan dengan rapi dan mengurutkannya berdasarkan jam target penyelesaian.
3. Petugas lapak ikan dapat mencentang status pekerjaan (`Sedang Dikerjakan` ➔ `Siap Diambil`) dengan satu sentuhan.
4. Tiket kerja thermal dapat dicetak dalam format ringkas untuk ditempel pada kantong ikan pelanggan.
5. Filter dan pencarian memudahkan pencarian pesanan berdasarkan nama pelanggan, tanggal, atau jenis ikan.
