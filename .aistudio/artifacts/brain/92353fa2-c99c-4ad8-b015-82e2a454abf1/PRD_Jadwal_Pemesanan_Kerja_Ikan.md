# Product Requirements Document (PRD)
## Fitur: Jadwal Kerja & To-Do List Pemesanan Ikan (Fish Prep Orders & Schedule)

**ID Modul:** `prep-orders`  
**Nama Modul:** Jadwal & Pemesanan Ikan (To-Do List Kerja)  
**Aplikasi:** Sistem POS & Manajemen Operasional Toko Sembako & Ikan Basah Riama  
**Platform:** Web App (Offline-First Dexie.js + Firebase Cloud Firestore Sync)  
**Target Pengguna:** Owner, Kasir, dan Petugas Meja Bersih Ikan  

---

## 1. Latar Belakang & Masalah (Executive Summary)

### 1.1 Konteks Bisnis
Toko Sembako & Ikan Basah Riama sering menerima pemesanan ikan sebelum hari-H atau beberapa jam sebelum diambil (pre-order), baik dari pelanggan rumah tangga, warung makan, katering, maupun acara pesta/hajatan. Pemesanan ikan memiliki karakteristik teknis operasional yang sangat unik:
1. **Ukuran / Kaliber Ikan:** Pelanggan meminta ukuran tertentu (misal: ikan nila 1 kg isi 2-3 ekor, lele 1 kg isi 6-8 ekor, atau gurame jumbo 1 ekor/kg).
2. **Kustomisasi Pembersihan (Cleaning):** Permintaan buang sisik, buang insang, bersihkan empedu/isi perut, atau minta hidup/utuh.
3. **Kustomisasi Potongan (Cutting):** Permintaan belah bekakak (belah bakar), potong 2/3/4 bagian, kerat-kerat untuk digoreng, atau difillet.
4. **Jadwal Pengambilan (Time-Sensitive):** Ikan harus dibersihkan mendekati jam pengambilan agar kualitas tetap segar dan es tidak mencair terlalu lama.

### 1.2 Masalah yang Dihadapi Saat Ini
- Pencatatan pesanan ikan masih mengandalkan nota kertas lepas atau pesan chat WhatsApp yang rawan terselip atau lupa dikerjakan.
- Petugas di meja pembersihan ikan sering salah memotong atau salah memilih ukuran ekor per kg karena instruksi lisan yang tidak terdokumentasi.
- Saat jam sibuk (rush hour), kasir tidak memiliki visibilitas pesanan mana yang sudah siap di chiller/meja es dan pesanan mana yang masih harus diproses.

---

## 2. Tujuan Produk (Product Goals)

1. **Perencanaan Operasional Terjadwal (Advance Prep Planning):** Kasir/Owner dapat mencatat pesanan ikan dengan target tanggal dan jam pengambilan secara detail.
2. **To-Do List & Kanban Meja Ikan:** Petugas pembersih ikan memiliki daftar kerja harian yang jelas, lengkap dengan petunjuk ukuran, jumlah kg, dan instruksi potong.
3. **Status Real-Time (Trackability):** Visual status mulai dari `Menunggu / Rencana (PENDING)`, `Sedang Dikerjakan (IN_PROGRESS)`, `Siap Diambil (READY)`, hingga `Selesai / Diambil (COMPLETED)`.
4. **Tiket Kerja Fisik (Printable SPK):** Dapat mencetak slip instruksi kerja 58mm/80mm untuk ditempel pada kantung plastik ikan atau digantung di papan antrian meja ikan.
5. **Kalkulasi Kebutuhan Harian (Daily Prep Aggregate):** Sistem otomatis merangkum total kilogram tiap jenis ikan yang harus disiapkan untuk hari berjalan.

---

## 3. Alur Kerja & Skenario Pengguna (User Flows)

```
[Pelanggan Memesan] 
       │ (Lewat Kasir / WA / Telepon)
       ▼
[Input Jadwal Pemesanan]
       │ ➔ Tentukan Tgl & Jam Pengambilan
       │ ➔ Pilih Jenis Ikan (Nila, Gurame, Lele, dll.)
       │ ➔ Input Berat (Kg) & Target Ekor per Kg
       │ ➔ Checklist Pembersihan (Sisik, Insang, Isi Perut)
       │ ➔ Pilih Jenis Potongan (Belah Bakar, Potong 3, Kerat, dll.)
       │ ➔ Cetak Tiket Kerja SPK (Opsional)
       ▼
[Masuk To-Do List: Status PENDING]
       │
       ▼ (Petugas mulai membersihkan di meja ikan)
[Status: IN PROGRESS (Sedang Dikerjakan)]
       │
       ▼ (Ikan sudah dibersihkan, dipotong, dimasukkan es/plastik)
[Status: READY (Siap Diambil di Chiller)]
       │
       ▼ (Pelanggan datang mengambil & transaksi diselesaikan di POS)
[Status: COMPLETED (Selesai)]
```

---

## 4. Rincian Fitur & Fungsionalitas

### 4.1 Form Input & Edit Pemesanan
- **Data Pemesan:** Nama Pelanggan, No Telepon / WhatsApp, Catatan Alamat (bila diantar). Dapat memilih dari daftar pelanggan (`db.customers`) atau ketik manual.
- **Jadwal Target:**
  - Tanggal Pengambilan/Pengerjaan (`scheduledDate`: YYYY-MM-DD).
  - Jam Pengambilan/Target Selesai (`scheduledTime`: HH:mm, contoh: 08:30 WIB).
- **Rincian Item Ikan (Multi-Item):**
  - Nama Ikan / Produk (Dropdown cepat: Ikan Nila, Gurame, Lele, Patin, Mas, Ikan Laut, Ayam Potong, dll.).
  - Jumlah Berat (Kg) dengan input desimal (contoh: 2.5 kg).
  - Target Ukuran: Ekor per Kg (contoh: "1 kg isi 2-3 ekor", "1 kg isi 4-5 ekor", "Jumbo 1 ekor >1 kg").
  - Opsi Pembersihan:
    - [x] Bersihkan Sisik
    - [x] Buang Insang
    - [x] Buang Isi Perut / Kotoran
    - [ ] Biarkan Utuh / Hidup
  - Opsi Pemotongan:
    - Belah Bakar (Kupu-kupu / Bekakak)
    - Potong 2 / Potong 3 / Potong 4 Bagian
    - Kerat-Kerat Badan (Gurat untuk goreng garing)
    - Fillet / Buang Tulang Utama
    - Utuh (Hanya bersihkan)
  - Catatan Tambahan: Teks bebas (contoh: "Kepala dibelah dua", "Pisahkan empedu jangan sampai pecah", "Beri es batu agak banyak").
- **Prioritas Pesanan:** `NORMAL`, `URGENT` (Mendesak / Mau diambil cepat), `VIP_EVENT` (Pesta / Hajatan).
- **Status Pembayaran:** `UNPAID` (Belum Bayar), `DOWN_PAYMENT` (DP / Uang Muka), `PAID` (Sudah Lunas).

### 4.2 Tampilan Jadwal & Kanban Board
- **Filter Tab Waktu Cepat:**
  - *Hari Ini* (Default): Menampilkan semua tugas yang harus diselesaikan pada tanggal berjalan.
  - *Besok*: Untuk perencanaan stok dan persiapan es/ikan malam hari.
  - *Mendatang*: Untuk memantau pesanan pesta di hari-hari berikutnya.
  - *Terlewat / Overdue*: Menandai pesanan yang jamnya sudah lewat tapi statusnya belum `READY` atau `COMPLETED`.
  - *Semua Jadwal*.
- **Filter Status / Tampilan Kolom Kanban:**
  - Kolom 1: **Rencana / Menunggu (PENDING)**
  - Kolom 2: **Sedang Dikerjakan (IN_PROGRESS)**
  - Kolom 3: **Siap Diambil / Chiller (READY)**
  - Kolom 4: **Selesai (COMPLETED)**
- **Aksi Cepat 1-Klik:** Tombol langsung "Mulai Bersihkan", "Tandai Siap", "Selesaikan", atau "Cetak SPK".

### 4.3 Ringkasan Kebutuhan Bahan (Daily Prep Aggregate Widget)
Widget ringkas di bagian atas halaman yang menghitung total kg ikan berdasarkan jadwal hari terpilih.
Contoh:
- Total Ikan Nila: **12.5 Kg** (3 pesanan)
- Total Ikan Gurame: **6.0 Kg** (2 pesanan)
- Total Ikan Lele: **15.0 Kg** (4 pesanan)
*Manfaat:* Petugas gudang/kolam dapat langsung mengambil jumlah ikan hidup yang pas dari kolam/supplier di pagi hari tanpa harus menghitung satu per satu nota.

### 4.4 Tiket Kerja Meja Ikan (Printable Work Order Slip)
Dapat dicetak menggunakan thermal printer 58mm atau 80mm:
- Header: TOKO SEMBAKO & IKAN BASAH RIAMA
- TIKET KERJA MEJA IKAN (SPK PEMESANAN)
- No. Order & Tanggal/Jam Diambil
- Nama Pemesan & No HP
- Daftar Ikan & Berat (Kg)
- Keterangan Pembersihan & Model Potongan dengan huruf tebal jelas.
- Tanda tangan / checklist petugas meja bersih.

---

## 5. Arsitektur Data & Model Teknis

### 5.1 Interface TypeScript (`src/core/types.ts`)
```typescript
export type PrepOrderStatus = 'PENDING' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'CANCELLED';
export type PrepOrderPriority = 'NORMAL' | 'URGENT' | 'VIP_EVENT';
export type PrepPaymentStatus = 'UNPAID' | 'DOWN_PAYMENT' | 'PAID';

export interface PrepOrderItem {
  itemId: string;
  productName: string; // Misal: Ikan Nila, Gurame, Lele
  productId?: string;
  weightKg: number; // Misal: 3.5 kg
  sizeSpec: string; // Misal: "1 kg 2-3 ekor", "Jumbo", dll.
  cleanScale: boolean; // Bersihkan Sisik
  cleanGills: boolean; // Buang Insang
  cleanGut: boolean; // Buang Isi Perut
  cuttingStyle: 'UTUH' | 'BELAH_BAKAR' | 'POTONG_2' | 'POTONG_3' | 'POTONG_4' | 'KERAT_GORENG' | 'FILLET' | 'CUSTOM';
  customCuttingNotes?: string;
  packagingNotes?: string; // Misal: Plastik per kg, banyak es
  priceEstimated?: number;
}

export interface PrepOrder {
  orderId: string;
  orderNumber: string; // Format: SPK-YYYYMMDD-XXXX
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm (contoh "09:00")
  priority: PrepOrderPriority;
  status: PrepOrderStatus;
  items: PrepOrderItem[];
  totalWeightKg: number;
  totalEstimatedPrice: number;
  paymentStatus: PrepPaymentStatus;
  downPaymentAmount?: number;
  generalNotes?: string;
  assignedStaffName?: string;
  startedAt?: string;
  readyAt?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

### 5.2 Skema Dexie Local Database (Versi 12)
File: `src/core/database.ts`
```typescript
this.version(12).stores({
  prepOrders: 'orderId, orderNumber, customerId, scheduledDate, status, priority, paymentStatus, createdAt'
});
```

### 5.3 Aturan Keamanan Firebase (`firestore.rules`)
```rules
match /prepOrders/{id} {
  allow read, write: if isKasir();
}
```

---

## 6. Desain Antarmuka Pengguna (UI/UX)

1. **Header & Quick Stats:**
   - Total Pesanan Hari Ini, Pesanan Sedang Diproses, Pesanan Siap Diambil, Total Kg Ikan Dibersihkan.
   - Tombol "+ Buat Jadwal / Pesanan Ikan Baru".
2. **Tab Tanggal Cepat & View Mode:**
   - Filter: [Hari Ini] [Besok] [Mendatang] [Semua].
   - Toggle Tampilan: [📋 Tampilan Daftar / To-Do List] vs [📊 Tampilan Papan Kanban].
3. **Card Pesanan yang Informatif:**
   - Header: Waktu Ambil (badge merah jika terlambat / kuning jika <2 jam lagi), Nama Pemesan, Label Prioritas.
   - Body: List item ikan dengan ikon pisau/ikan, tag pembersihan (Sisik, Insang, Isi Perut) dan tag potongan (Belah Bakar, Potong 3, dll.).
   - Footer: Tombol aksi status (Mulai -> Siap -> Selesai) dan tombol Cetak SPK.
4. **Modal Cetak Tiket Kerja:**
   - Pratinjau tiket thermal yang rapi dan siap print langsung via browser printing.

---

## 7. Metrik Keberhasilan & Nilai Bisnis
- **0% Pesanan Terlewat:** Tidak ada lagi pesanan yang lupa dibersihkan sebelum pelanggan tiba.
- **100% Akurasi Pemotongan:** Petugas meja ikan tidak lagi salah memotong pesanan belah bakar atau salah ukuran ekor.
- **Efisiensi Waktu Pelanggan:** Waktu tunggu pelanggan saat mengambil ikan berkurang drastis karena ikan sudah siap dan dikemas rapi di es/chiller.
