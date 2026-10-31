# Rencana Implementasi: Menu Terpisah "Jadwal & To-Do Pemesanan" (Ikan, Buah, Sembako)

Dokumen ini merinci rencana teknis pembuatan menu terpisah berdedikasi untuk manajemen **Jadwal Pemesanan dan To-Do List Operasional** bagi lini bisnis **Ikan**, **Buah**, dan **Sembako** di Toko Harapan Jaya.

---

## 1. Lingkup & Sasaran

1. **Menu Terpisah di Navigasi Sidebar**:
   - Menambahkan menu baru bernama **"Jadwal & To-Do"** (`order-schedule`) di `DashboardLayout.tsx` dan router `App.tsx`.
   - Menggunakan ikon yang representatif (`CalendarClock` atau `ClipboardList`).
   - Dapat diakses oleh **Owner** maupun **Kasir** (kasir dapat melihat to-do harian, menyelesaikan checklist, dan menambah pesanan saat ada pemesanan dari pembeli).
2. **Kategori Multi-Produk**:
   - **Ikan**: Tanggal kirim/ambil, berat (Kg), estimasi ekor/kg, opsi pembersihan (sisik, insang, isi perut), model potongan (utuh, kerat, potong 2/3/4, belah bakar, fillet), catatan boks/es.
   - **Buah**: Tanggal kirim/ambil, berat (Kg) atau Pcs/Keranjang, tingkat kematangan (matang pohon, mengkal, setengah matang, siap makan), sortir grade super/mulus, kemasan parcel/dus/plastik.
   - **Sembako**: Tanggal kirim/ambil, jumlah (Pcs, Sak, Karton, Bal, Dus, Kg), repack/timbang eceran, paket bundling/bansos, pemeriksaan segel dan mutu.
3. **Detail Pemesanan Sesuai Arahan Pengguna**:
   - **Tipe Pengambilan**: Tanggal Kirim (*Delivery* ke alamat pembeli) ATAU Tanggal Diambil di Tempat (*Pick-up* di toko).
   - **Kuantitas**: Jumlah Kg atau Pcs/Karton/Dus.
   - **Catatan Spesifikasi**: Formulir dinamis sesuai kategori yang dipilih.
   - **Status Lifecycle To-Do**:
     - `PENDING` (Menunggu Pengerjaan)
     - `IN_PROGRESS` (Sedang Dikerjakan/Dibersihkan)
     - `READY` (Siap Diambil/Dikirim)
     - `COMPLETED` (Selesai Diserahkan)
     - `CANCELLED` (Dibatalkan)
4. **Fitur Operasional Tambahan**:
   - Filter Waktu Cepat: *Hari Ini*, *Besok*, *Minggu Ini*, *Semua*.
   - Filter Kategori: Tab Cepat *Semua*, *🐟 Ikan*, *🍎 Buah*, *📦 Sembako*.
   - Filter Tipe: *Semua*, *🏪 Ambil di Toko*, *🚗 Kirim ke Alamat*.
   - Dual View: Tampilan Kartu Kanban To-Do & Tampilan Tabel Lengkap.
   - Aksi 1-Klik: Ubah status langsung dari kartu tugas.
   - Cetak SPK / Surat Perintah Kerja untuk ditempel di kemasan pesanan.
   - Quick WhatsApp reminder ("Pesanan telah siap diambil").

---

## 2. Rincian Perubahan Kode

### A. Data Layer & Schema (`src/core/types.ts` & `src/core/database.ts`)
- Memperluas tipe `PrepOrder` / membuat entitas fleksibel `ScheduleOrder`:
  - `category`: `'IKAN' | 'BUAH' | 'SEMBAKO' | 'CAMPURAN'`
  - `fulfillmentType`: `'PICKUP' | 'DELIVERY'`
  - `deliveryAddress?: string`
  - `scheduledDate`: string (`YYYY-MM-DD`)
  - `scheduledTime`: string (`HH:mm`)
  - `quantityUnit`: `'KG' | 'PCS' | 'DUS' | 'SAK' | 'IKAT' | 'KERANJANG'`
  - `quantityValue`: number
  - `fishSpecs?`: `{ cleanScale, cleanGills, cleanGut, cuttingStyle, piecesCount, fishPerKg }`
  - `fruitSpecs?`: `{ ripenessLevel, qualityGrade, packagingType }`
  - `sembakoSpecs?`: `{ repackRequired, repackWeight, bundlePackage, packagingNotes }`
  - `status`: `'PENDING' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'CANCELLED'`
  - `paymentStatus`: `'UNPAID' | 'DOWN_PAYMENT' | 'PAID'`
  - `assignedStaffName?: string`
- Mendukung penyimpanan offline IndexedDB Dexie yang sudah memiliki index pencarian cepat.

### B. Modul Komponen Utama (`src/app/schedule/OrderScheduleManagement.tsx`)
- Membuat direktori baru `src/app/schedule/`:
  - `OrderScheduleManagement.tsx`: Halaman utama berisi header statistik (Pesanan Hari Ini, Sedang Dikerjakan, Siap Diambil/Kirim, Selesai), filter tabs kategori, date picker, search, dan dual view toggle.
  - `OrderScheduleCard.tsx`: Komponen kartu to-do interaktif dengan checklist spesifikasi visual, penanda waktu kirim/ambil, dan tombol cepat ganti status.
  - `OrderScheduleModal.tsx`: Formulir pembuatan dan pengubahan pesanan dengan tab kategori otomatis yang memunculkan opsi spesifikasi yang relevan (Ikan/Buah/Sembako).
  - `OrderSchedulePrintModal.tsx`: Tampilan cetak Surat Perintah Kerja (SPK) dan label tempel pesanan.

### C. Registrasi Navigasi & Routing
- `src/app/layout/DashboardLayout.tsx`:
  - Menambahkan menu `order-schedule` di daftar `navItems` dengan icon `CalendarClock`.
  - Terbuka untuk Owner dan Kasir (dengan badge jumlah pesanan yang perlu dikerjakan hari ini).
- `src/App.tsx`:
  - Mendaftarkan rute case `'order-schedule'` ke `OrderScheduleManagement`.

---

## 3. Rencana Verifikasi & Pengujian

1. **Pengujian Pembuatan Jadwal Pesanan**:
   - Buat pesanan Ikan (misal: Ikan Nila 5 Kg, 1 kg isi 3 ekor, dibersihkan sisik & isi perut, belah bakar, diambil di tempat jam 11:00).
   - Buat pesanan Buah (misal: Mangga Arum Manis 10 Kg, matang pohon manis, grade super mulus, kemasan parcel, kirim jam 14:00).
   - Buat pesanan Sembako (misal: Beras 50 Kg / 2 sak 25kg + Minyak Goreng 2 karton, kemasan utuh, kirim jam 16:00).
2. **Pengujian Alur To-Do List**:
   - Majukan status dari PENDING -> IN_PROGRESS -> READY -> COMPLETED.
   - Verifikasi filter kategori (klik Tab Ikan hanya menampilkan ikan, Buah hanya buah, Sembako hanya sembako).
   - Verifikasi filter tanggal (Hari Ini vs Kalender).
3. **Pengujian Cetak SPK & Respon Cepat**:
   - Buka modal cetak dan verifikasi format layout SPK rapi untuk ditempel pada boks/kantong.
4. **Verifikasi Build & Kode**:
   - Jalankan `npm run lint` / `tsc --noEmit` untuk memastikan tipe data bebas error.
   - Jalankan `compile_applet` untuk memastikan kompilasi bundle Vite sukses 100%.

---

*Silakan klik tombol **Proceed** di bawah atau berikan revisi tambahan jika ada detail yang ingin disesuaikan sebelum implementasi dimulai.*
