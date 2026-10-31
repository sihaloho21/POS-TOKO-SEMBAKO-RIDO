# PRD: Modul Terpisah Jadwal Pemesanan & To-Do List (Ikan, Buah, dan Sembako)

**Versi**: 1.0.0  
**Tanggal**: 30 Oktober 2026  
**Status**: Proposal Perencanaan (Menunggu Persetujuan)  
**Pemilik Sistem**: Ridho Haloho (Owner)  
**Modul**: Menu Terpisah — *Jadwal & To-Do Pemesanan* (`order-schedule`)

---

## 1. Latar Belakang & Ringkasan Eksekutif

Toko Harapan Jaya melayani 3 lini bisnis harian dengan karakteristik penanganan yang berbeda:
1. **Ikan Segar / Hidup**: Membutuhkan persiapan fisik (membersihkan sisik, insang, isi perut, penentuan potong/belah, hitungan ekor per kg) dan tenggat waktu pengambilan/pengantaran ketat agar mutu tetap segar.
2. **Buah-buahan Segar**: Membutuhkan seleksi tingkat kematangan (matang pohon, mengkal, siap makan), sortir kualitas fisik (mulus, tanpa memar), serta pengemasan khusus (kotak, mika, keranjang buah/parcel).
3. **Produk Sembako**: Membutuhkan penyiapan kuantitas per sak/karton/bal/pcs, penimbangan repack (gula/beras eceran), dan pemisahan per paket sembako sedekah/bansos.

Sistem saat ini memerlukan **Menu Terpisah yang Berdedikasi** di navigasi sidebar (*Jadwal & To-Do Pemesanan*) agar kasir dan tim operasional memiliki checklist to-do yang jelas: siapa pemesannya, kapan harus diambil/dikirim, berapa jumlah (kg/pcs), bagaimana spesifikasi pengerjaannya, dan apa status pengerjaannya saat ini.

---

## 2. Tujuan Bisnis & Pengguna

- **Mencegah Kesalahan Persiapan**: Tim operasional tidak lagi salah potong ikan, salah kematangan buah, atau salah jumlah sembako.
- **Ketepatan Waktu**: Pelanggan yang datang mengambil di toko atau minta diantar mendapatkan pesanan yang sudah siap pada jam yang dijanjikan.
- **Transparansi Status**: Owner dan Kasir dapat memantau secara real-time berapa pesanan yang menunggu (Pending), sedang dikerjakan (In Progress), siap diambil/dikirim (Ready), dan sudah selesai diserahkan (Completed).
- **Akses Fleksibel**:
  - **Owner**: Kontrol penuh (tambah, edit jadwal, batalkan, hapus, cetak SPK, kelola biaya/DP).
  - **Kasir**: Dapat melihat daftar tugas hari ini, menambahkan pesanan pelanggan saat bertugas di POS, mengubah status pengerjaan (Check-off to-do), dan mencetak surat perintah kerja/label pesanan.

---

## 3. Spesifikasi Fungsional Per Kategori Produk

### 3.1. Kategori IKAN (Fish Prep & Order)
- **Produk Target**: Ikan Nila, Ikan Lele, Ikan Mas, Ikan Gurame, Ikan Patin, Bandeng, Bawal, dll.
- **Kuantitas**: Berat dalam **Kilogram (Kg)** & estimasi per kg berapa ekor (misal: "1 kg isi 2-3 ekor", "Jumbo 1 ekor/kg").
- **Catatan Spesifikasi Penanganan**:
  - Pembersihan:
    - [x] Bersihkan Sisik
    - [x] Buang Insang
    - [x] Buang Isi Perut / Kotoran
  - Model Potongan:
    - Utuh Bersih (untuk digoreng/dibakar utuh)
    - Kerat-kerat (untuk goreng renyah)
    - Potong 2 / 3 / 4 Bagian (untuk gulai/sop)
    - Belah Bakar (kupu-kupu / belah punggung)
    - Fillet (daging tanpa tulang)
    - Potongan Khusus (Catatan kustom)
  - Pengemasan: Bungkus plastik es batu, bungkus plastik biasa, atau kemasan boks.

### 3.2. Kategori BUAH (Fruit Prep & Order)
- **Produk Target**: Mangga Arum Manis, Jeruk Berastagi, Semangka Merah, Melon Madu, Apel Fuji, Pisang Barangan, Alpukat Mentega, dll.
- **Kuantitas**: Dalam **Kilogram (Kg)** atau **Pieces / Biji (Pcs)** atau **Keranjang / Dus**.
- **Catatan Spesifikasi Penanganan**:
  - Tingkat Kematangan:
    - Matang Pohon / Siap Makan Hari Ini (Manis empuk)
    - Mengkal / Renyah (Asam manis gurih)
    - Setengah Matang (Tahan simpan 2-3 hari)
    - Mentah (Untuk rujak / simpan lama)
  - Sortir Kualitas:
    - Grade Super / Mulus (Tanpa bintik/cacat kulit)
    - Ukuran Besar / Jumbo
    - Ukuran Sedang / Campur
  - Pengemasan:
    - Kantong Buah Standar
    - Mika / Keranjang Buah / Parcel Cantik
    - Kardus Buah Rapi

### 3.3. Kategori SEMBAKO (Grocery Prep & Order)
- **Produk Target**: Beras (5kg, 10kg, 25kg), Minyak Goreng (1L, 2L, Dus), Gula Pasir, Tepung Terigu, Telur Ayam (Kg/Ikat/Piring), Mie Instan (Karton), Kopi, dll.
- **Kuantitas**: Dalam **Pcs**, **Karton / Dus**, **Karung / Sak**, **Bal**, atau **Kg**.
- **Catatan Spesifikasi Penanganan**:
  - Repack / Timbang Ulang: Eceran 1/2 kg, 1 kg dengan kemasan plastik rapi berlabel.
  - Paket Bundling / Bansos: Gabungkan beras 5kg + minyak 2L + gula 1kg ke dalam 1 kantong kardus/tas bingkisan.
  - Kontrol Mutu: Kemasan tersegel utuh, tidak bocor, expired date panjang.

---

## 4. Parameter & Struktur Data Pemesanan

Setiap jadwal pesanan atau kartu to-do mencakup atribut utama berikut:

| Field | Tipe Data | Deskripsi |
|---|---|---|
| `orderId` | String (UUID) | ID unik pesanan |
| `orderNumber` | String | Nomor referensi (misal: `ORD-20261030-001`) |
| `category` | Enum (`IKAN` \| `BUAH` \| `SEMBAKO` \| `CAMPURAN`) | Kategori lini bisnis utama |
| `customerName` | String | Nama pemesan |
| `customerPhone` | String (Opsional) | Nomor WhatsApp/Telepon untuk konfirmasi |
| `fulfillmentType` | Enum (`PICKUP` \| `DELIVERY`) | **Ambil di Tempat** atau **Kirim ke Alamat** |
| `deliveryAddress` | String (Opsional) | Alamat pengiriman jika tipe Delivery |
| `scheduledDate` | String (`YYYY-MM-DD`) | **Tanggal Kirim atau Tanggal Diambil** |
| `scheduledTime` | String (`HH:mm`) | Jam target pengambilan atau pengiriman |
| `items` | Array of Object | Daftar produk, kuantitas (kg/pcs), harga perkiraan |
| `totalQtyKg` | Number | Akumulasi berat (jika berbasis timbangan kg) |
| `totalQtyPcs` | Number | Akumulasi pcs/kemasan |
| `specifications` | Object | Detail teknis: kebersihan, potongan, kematangan, sortir, repack |
| `status` | Enum | `PENDING`, `IN_PROGRESS`, `READY`, `COMPLETED`, `CANCELLED` |
| `assignedStaff` | String (Opsional) | Nama kasir/karyawan yang bertanggung jawab |
| `notes` | String | Catatan khusus dari pelanggan |
| `paymentStatus` | Enum (`UNPAID` \| `DOWN_PAYMENT` \| `PAID`) | Status pembayaran pesanan |
| `downPayment` | Number | Uang muka / DP yang telah disetor (bila ada) |
| `totalEstimatedPrice` | Number | Estimasi total harga pesanan |

---

## 5. Alur Operasional (Lifecycle To-Do List)

```text
[1. PENDING] ➔ [2. IN_PROGRESS] ➔ [3. READY] ➔ [4. COMPLETED]
     │                 │              │
     └─────────────────┴──────────────┴────➔ [5. CANCELLED]
```

1. **PENDING (Menunggu Pengerjaan)**:
   - Pesanan dicatat kasir/owner melalui formulir cepat.
   - Muncul di tab "Hari Ini" atau sesuai filter kalender.
2. **IN_PROGRESS (Sedang Dikerjakan)**:
   - Petugas/kasir mengklik tombol "Mulai Kerjakan".
   - Ikan sedang disisik/dipotong, buah sedang disortir/dikemas, sembako sedang dipacking.
3. **READY (Siap Diambil / Siap Kirim)**:
   - Pengerjaan selesai, produk sudah terbungkus rapi dan diletakkan di rak pickup / siap antar.
   - Tersedia tombol cepat untuk kirim pesan notifikasi WhatsApp ke pelanggan: *"Halo [Nama], pesanan Anda telah siap diambil di Toko Harapan Jaya!"*.
4. **COMPLETED (Selesai)**:
   - Pelanggan mengambil barang atau kurir telah selesai mengantar.
   - Transaksi dapat diselesaikan atau disinkronkan ke kasir POS jika ada pelunasan sisa tagihan.
5. **CANCELLED (Dibatalkan)**:
   - Jika pesanan dibatalkan sebelum diproses, dengan pencatatan alasan pembatalan.

---

## 6. Rancangan Tampilan UI (Dedicated Menu)

1. **Posisi Navigasi Sidebar**:
   - Menu baru berdedikasi: **"Jadwal & To-Do Pemesanan"** (Label: `Jadwal & To-Do`, Icon: `CalendarClock`).
   - Dapat diakses oleh Owner dan Kasir (dengan batasan hak akses edit biaya oleh Owner).
2. **Filter & Header Dashboard**:
   - Filter Kategori: Tab `Semua`, `🐟 Ikan`, `🍎 Buah`, `📦 Sembako`.
   - Filter Waktu: `Hari Ini`, `Besok`, `Minggu Ini`, `Semua / Pilih Kalender`.
   - Filter Status: `Semua`, `Menunggu`, `Dikerjakan`, `Siap`, `Selesai`.
   - Tipe Layanan: `Semua`, `🚗 Diantar (Delivery)`, `🏪 Ambil di Toko (Pickup)`.
3. **Tampilan Ganda (Dual View)**:
   - **Mode Kanban / Kartu To-Do**: Kartu visual berdesain bersih dengan badge prioritas, waktu pengerjaan, kuantitas kg/pcs, detail spesifikasi, dan tombol aksi 1-klik untuk ubah status.
   - **Mode Tabel Terstruktur**: Tampilan daftar baris dengan sorting tanggal, nomor pesanan, nama pelanggan, kontak, spesifikasi, dan aksi cepat.
4. **Cetak Surat Perintah Kerja (SPK) / Label Kerja**:
   - Tombol "Cetak SPK" untuk mencetak lembar kerja persiapan langsung ke printer struk atau kertas A4 untuk ditempel pada kantong/boks pesanan.
