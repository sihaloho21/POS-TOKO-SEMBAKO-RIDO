# Arsitektur Realtime Cloud-First (Direct Firestore & Zero Interval Sync)

Transformasi arsitektur sistem Toko Harapan Jaya dari model *Local-First Offline-First* (antrean sinkronisasi bertahap / *sync queue interval*) menjadi **Realtime Cloud-First Database**. Seluruh data disimpan langsung ke Google Cloud Firestore dan disiarkan secara instan (*sub-second onSnapshot*) ke semua perangkat (komputer kasir, tablet gudang, smartphone owner) tanpa penundaan atau tombol manual upload.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Konfirmasi Pilihan Pengguna (Telah Diverifikasi):
> - **Penegakan Konektivitas Online**: Sistem mewajibkan koneksi online aktif (*Strict Online Required*). Jika internet terputus, sistem menampilkan modal peringatan koneksi terputus dan mengunci checkout kasir sementara demi mencegah terjadinya perbedaan data (*split-brain*).
> - **Migrasi Data Lokal Eksisting**: Dilakukan migrasi otomatis sekali jalan (*One-Time Cloud Data Migration*) dari IndexedDB/Dexie ke Cloud Firestore saat pertama kali diaktifkan agar seluruh produk, riwayat penjualan, dan jadwal pesanan yang tersimpan di perangkat tidak hilang.
> - **Model Realtime Antarmuka**: Menggunakan listener langsung `onSnapshot` Firestore SDK. Perubahan harga/stok atau pesanan baru di satu perangkat akan langsung memicu re-render otomatis di seluruh layar perangkat lain secara *real-time* tanpa interval *polling*.

---

## 1. Overview & Core Concept

- **Apa yang Dibangun**:
  Sistem kasir dan manajemen ritel multi-perangkat yang tersambung langsung secara *real-time* ke Google Cloud Firestore. Setiap aksi kasir (scan barang, bayar, void), perubahan stok gudang, penambahan buah/ikan, serta pengerjaan to-do langsung memperbarui dokumen cloud dan terdistribusi seketika ke seluruh perangkat lain.
- **Target Pengguna**:
  - **Owner**: Mengawasi omzet harian, stok berjalan, laba ikan mati, dan kasbon pelanggan dari laptop atau smartphone dari mana saja dengan data 100% mutakhir.
  - **Kasir**: Melayani penjualan di POS dengan kepastian data harga, diskon, dan stok yang selalu sinkron dengan gudang dan kasir lain.
  - **Tim Persiapan / Dapur**: Melihat pesanan ikan, buah, dan sembako yang masuk secara *live* di papan to-do tanpa perlu me-refresh browser.
- **Nilai Utama**:
  - Tidak ada lagi keterlambatan data akibat antrean sinkronisasi (*Zero Sync Latency*).
  - Tidak ada lagi risiko konflik revisi offline (*Zero Local Branching Conflicts*).
  - Satu sumber kebenaran data terpusat (*Single Global Cloud Truth*).

---

## 2. User Experience & Visual Design

### 2.1. Alur Pengguna (User Flows)
1. **Status Koneksi Realtime yang Jelas**:
   - Di bilah navigasi atas (top bar) terdapat indikator status: **"Cloud Realtime Terhubung"** dengan lampu hijau berkedip halus (*pulse*).
   - Pengguna mengetahui secara visual bahwa sistem sedang terhubung langsung ke Google Cloud.
2. **Pengalaman Transaksi Instan Multi-Perangkat**:
   - Ketika Kasir di PC Toko menginput transaksi penjualan beras 5kg, stok di tablet gudang berkurang seketika dalam hitungan milidetik.
   - Ketika Owner mengubah harga Mangga Arum Manis dari smartphonenya, monitor kasir seketika menampilkan harga baru tanpa perlu *reload*.
3. **Peringatan Koneksi Terputus (Offline Safety Curtain)**:
   - Jika kabel LAN atau sinyal WiFi terputus, banner/modal ramah muncul: *"Koneksi Cloud Terputus — Memeriksa Jaringan Internet..."*.
   - Tombol checkout ditahan sejenak sampai koneksi pulih, memastikan nomor struk dan pembukuan uang kas tidak ganda.
4. **Proses Migrasi Otomatis Transparan**:
   - Pada pembukaan pertama kali, sistem menjalankan migrasi aman data lokal ke Firestore di latar belakang dengan progress bar halus. Pengguna diberitahu *"Data lokal berhasil diamankan ke Cloud!"*.

### 2.2. Tema Visual & Umpan Balik Interaktif
- **Aesthetic Direction**: *Enterprise Utilitarian Clean* — Palet warna Slate, Blue, dan Emerald khas sistem ritel modern, bebas dari elemen dekoratif berlebih.
- **Status Indicator Tokens**:
  - `bg-emerald-500 animate-pulse`: Status Cloud Realtime Aktif & Tersinkron.
  - `bg-amber-500`: Sedang Menyambung Ulang Jaringan.
  - `bg-rose-500`: Internet Terputus (Harap hubungkan kembali).
- **Toast Notifications**: Pemberitahuan ringkas saat data berhasil disimpan langsung ke cloud.

---

## 3. Key Product Decisions & Trade-Offs

- **Keputusan 1: Menonaktifkan Sync Queue Bertahap & Beralih ke Direct Cloud Write**
  - *Pendekatan*: Menghilangkan interval looping `SyncEngine.start()` yang sebelumnya memeriksa antrean setiap beberapa detik. Semua pemanggilan service (misal: buat pesanan, potong stok, simpan kasir shift) langsung memanggil API Firestore (`setDoc`, `updateDoc`, `runTransaction`).
  - *Alasan*: Menjawab kebutuhan utama Owner agar tidak ada interval penundaan dan data di seluruh perangkat selalu identik.
  - *Alternatif yang Ditinggalkan*: Background interval polling (ditinggalkan karena lambat dan berpotensi memicu konflik data).

- **Keputusan 2: Hook Reaktif Realtime Terpadu (`useFirestoreRealtime`)**
  - *Pendekatan*: Menyediakan custom React hook pembungkus `onSnapshot` Firestore yang secara otomatis mengelola *subscription* dan *cleanup listener* saat komponen mount/unmount.
  - *Alasan*: Kompatibel dengan arsitektur React, mencegah kebocoran memori (*memory leaks*), dan memberikan reaktivitas instan.
  - *Alternatif yang Ditinggalkan*: Pemanggilan manual `getDocs()` berulang kali (memboroskan kuota baca dan tidak realtime).

- **Keputusan 3: One-Time Seamless Migration Engine**
  - *Pendekatan*: Script migrasi yang membaca seluruh tabel Dexie lokal (produk, transaksi, pelanggan, supplier, kasbon, prepOrders) dan memindahkannya ke koleksi Firestore menggunakan `writeBatch` Firestore yang aman dan idempoten.
  - *Alasan*: Melindungi data bisnis yang sudah ada agar tidak ada satu pun riwayat transaksi atau stok yang terhapus saat berpindah arsitektur.

---

## 4. Technical Architecture & Data Strategy

### 4.1. Diagram Arsitektur Sistem Baru

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PERANGKAT PENGGUNA                              │
│   (PC Kasir POS • Tablet Gudang • Laptop Owner • HP Smartphone)        │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                     ANTARMUKA REACT                            │   │
│   │   [POS]  [Inventori]  [Buah & Ikan]  [Jadwal & To-Do]  [Shift] │   │
│   └───────────────▲────────────────────────────────┬───────────────┘   │
│                   │ onSnapshot (Realtime Listeners)│ Direct Writes     │
│                   │ Sub-detik update               │ (setDoc/updateDoc)│
│   ┌───────────────┴────────────────────────────────▼───────────────┐   │
│   │                DIRECT FIRESTORE SERVICE LAYER                  │   │
│   │   • ProductService       • TransactionService                  │   │
│   │   • PrepOrderService     • ShiftService                        │   │
│   │   • CustomerService      • ReceivablesService                  │   │
│   │   • Auto-Migration Hook  • Connection Guard Modal              │   │
│   └────────────────────────────────┬───────────────────────────────┘   │
└────────────────────────────────────┼───────────────────────────────────┘
                                     │ HTTPS / WebSocket (gRPC-Web)
                                     │ Sub-second bi-directional stream
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    GOOGLE CLOUD FIRESTORE DATABASE                     │
│    Project: solid-sprite-dq6d2                                         │
│    Database: ai-studio-ridosembakobusin-f36dfbf4-d2cf-4cf5-88a3-1321ec │
│                                                                        │
│    /products      /transactions    /prepOrders     /shifts             │
│    /customers     /receivables     /staffDebts     /suppliers          │
│    /purchases     /stockMovements  /auditLogs      /settings           │
│                                                                        │
│    Enforced by: firestore.rules (Role-Based Access Control)            │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2. Rencana Eksekusi Kode Bertahap

1. **Langkah 1: Service Provider & Realtime Hooks (`src/core/firestore-realtime.ts`)**:
   - Membangun hook `useFirestoreCollection<T>(collectionName, queryConstraints)` dan `useFirestoreDoc<T>(collectionName, docId)`.
   - Menghubungkan listener `onSnapshot` yang mengembalikan state realtime, status loading, dan error.

2. **Langkah 2: Mesin Migrasi Satu Kali (`src/core/services/cloud-migration-service.ts`)**:
   - Memeriksa flag `hasMigratedToCloud` di Firestore atau localStorage.
   - Jika belum migrasi, membaca seluruh record di Dexie lokal (`products`, `customers`, `transactions`, `prepOrders`, `suppliers`, `shifts`, `receivables`, dll.).
   - Melakukan batch upload langsung ke Firestore secara aman dan efisien.

3. **Langkah 3: Transformasi Layanan Tulis Langsung (Direct Firestore Services)**:
   - Mengubah `ProductService`, `PrepOrderService`, `ShiftService`, `TransactionEngine`, dan `ReceivablesService` agar langsung menulis ke Firestore via `setDoc` / `updateDoc` / `deleteDoc` (menggantikan antrean sync queue).

4. **Langkah 4: Integrasi Komponen UI**:
   - Menggantikan `useLiveQuery` pada halaman utama (`POS`, `OrderScheduleManagement`, `Inventory`, `FishManagement`, `FruitManagement`, `Customers`, `DashboardLayout`) dengan realtime hook `useFirestoreCollection`.
   - Menambahkan visual status bar **"Cloud Realtime Active"** di `DashboardLayout.tsx`.

5. **Langkah 5: Peringatan Koneksi & Pembersihan Sync Engine Lama**:
   - Menonaktifkan background timer `SyncEngine.start()` berkala yang lama.
   - Menghapus badge antrean pending sync lama di sidebar karena data kini langsung terkirim secara instan.
   - Menampilkan modal peringatan koneksi terputus saat perangkat kehilangan akses internet.

6. **Langkah 6: Verifikasi & Audit**:
   - Jalankan `compile_applet` dan `lint_applet` untuk memastikan nol error kompilasi dan tipe data TypeScript valid.
