# PRD: Transisi Arsitektur Realtime Cloud-First (Direct Firestore & Zero Interval Sync)

**Versi**: 2.0.0  
**Tanggal**: 31 Oktober 2026  
**Status**: Proposal Arsitektur (Menunggu Persetujuan Eksekusi)  
**Pemilik Sistem**: Ridho Haloho (Owner)  
**Target Platform**: Multi-Device Web POS & Management (PC Kasir, Tablet Toko, Smartphone Owner)  

---

## 1. Latar Belakang & Masalah Bisnis

### 1.1. Kelemahan Filosofi Sebelumnya (Local-First Offline-First)
Pada filosofi *local-first*, data transaksi, stok, kasbon, dan perubahan harga pertama kali disimpan ke dalam database IndexedDB (Dexie) di memori lokal masing-masing perangkat. Proses sinkronisasi mengandalkan:
1. **Sync Queue berkala (Interval-based background sync)** yang memiliki latensi penundaan.
2. Tombol manual **"Push / Upload Antrean Sinkronisasi"** atau **"Tarik Data Cloud"**.
3. **Risiko Diskrepansi Antar-Perangkat**: Jika Kasir A menjual produk di komputer 1, perubahan stok tidak langsung tampak di tablet Owner atau komputer Kasir 2 sampai antrean sinkronisasi selesai diproses.
4. Terjadinya status konflik (*Conflict Resolution*) jika dua perangkat mengedit item yang sama secara lokal.

### 1.2. Kebutuhan Baru: Realtime Cloud-First
Owner menghendaki:
> *"Semua perubahan langsung di-update di database cloud, tidak perlu upload atau push sync queue. Perubahan terjadi secara realtime tanpa ada interval. Website diakses di perangkat mana pun, data di dalamnya selalu sama dan tersinkron secara instan."*

---

## 2. Tujuan & Sasaran Sistem Baru

1. **Konsistensi Data Global Mutlak (Single Source of Truth)**:
   - Database Cloud Firestore (`solid-sprite-dq6d2 / ai-studio-ridosembakobusin-f36dfbf4-d2cf-4cf5-88a3-1321ecff9d17`) menjadi sumber data utama dan langsung.
   - Tidak ada lagi antrean penundaan (*no sync queue delays*).
2. **Reaktivitas Instan (Sub-Detik Realtime)**:
   - Menggunakan listener `onSnapshot` Firestore bawaan SDK Google.
   - Setiap kali terjadi penjualan, penyesuaian stok, pembayaran kasbon, atau input pesanan jadwal baru di Perangkat A, layar Perangkat B dan C langsung ter-update secara otomatis dalam hitungan milidetik tanpa perlu me-refresh halaman.
3. **Zero Data Loss Migration**:
   - Seluruh data lokal yang telah ada (produk sembako, ikan, buah, pelanggan, transaksi penjualan, catatan kasbon, riwayat shift) dimigrasikan secara otomatis ke Firestore pada saat transisi pertama kali dijalankan.
4. **Enforcement Konektivitas Online Terkendali**:
   - Sistem mewajibkan status online. Jika koneksi WiFi/seluler terputus, aplikasi menampilkan banner/modal peringatan koneksi terputus dan mencegah terjadinya inkonsistensi transaksi hingga koneksi internet kembali pulih.

---

## 3. Keputusan Kunci Pengguna (User Confirmed Decisions)

Berdasarkan klarifikasi:
1. **Respons Terhadap Gangguan Internet**:
   - Sistem mewajibkan status online (*Online Required*). Jika internet terputus, sistem menampilkan peringatan interaktif dan memblokir checkout POS sementara guna menjamin data tidak terpecah (*split-brain prevention*).
2. **Penanganan Data Lokal Yang Ada**:
   - Dilakukan **One-Time Auto-Migration** dari database Dexie lokal ke cloud Firestore secara otomatis dan aman saat pengguna login/membuka sistem, sehingga tidak ada data yang hilang.
3. **Arsitektur Antarmuka UI**:
   - Seluruh view/komponen utama (POS, Inventori, Buah, Ikan, Transaksi, Jadwal & To-Do, Kasbon, Shift) beralih dari `useLiveQuery` (Dexie) ke custom realtime hook `useFirestoreCollection` dan `useFirestoreDoc` yang berbasis `onSnapshot` Firestore.

---

## 4. Rincian Koleksi Data Firestore (Cloud Database Schema)

Semua entitas data utama dipetakan langsung ke koleksi Firestore tingkat atas:

| Koleksi Firestore | Deskripsi Entitas | Metode Tulis | Listener Realtime |
|---|---|---|---|
| `/products` | Katalog Sembako, Ikan, & Buah (Stok, Harga, WAC) | `setDoc` / `updateDoc` | `onSnapshot(query(collection('products')))` |
| `/transactions` | Transaksi Penjualan POS Kasir | `setDoc` (ID Struk) | `onSnapshot` per shift / hari |
| `/prepOrders` | Jadwal & To-Do Pemesanan (Ikan, Buah, Sembako) | `setDoc` / `updateDoc` | `onSnapshot(collection('prepOrders'))` |
| `/customers` | Data Pelanggan & Saldo Kasbon | `setDoc` / `updateDoc` | `onSnapshot(collection('customers'))` |
| `/shifts` | Sesi Kasir (Clock-in, Kas Awal, Penutupan) | `setDoc` / `updateDoc` | `onSnapshot(doc('shifts', shiftId))` |
| `/receivables` | Piutang & Kasbon Pelanggan | `setDoc` / `updateDoc` | `onSnapshot(collection('receivables'))` |
| `/staffDebts` | Kasbon & Pinjaman Karyawan | `setDoc` / `updateDoc` | `onSnapshot(collection('staffDebts'))` |
| `/suppliers` | Data Pemasok & Hutang Pembelian | `setDoc` / `updateDoc` | `onSnapshot(collection('suppliers'))` |
| `/purchases` | Faktur Pembelian Stok Baru | `setDoc` / `updateDoc` | `onSnapshot(collection('purchases'))` |
| `/stockMovements` | Kartu Stok & Audit Log Perubahan | `setDoc` / `addDoc` | `onSnapshot` filtered |
| `/auditLogs` | Jejak Audit Keamanan & Akses | `addDoc` | Owner Only View |
| `/settings` | Konfigurasi Toko & Jam Operasional | `setDoc(doc('settings', 'store'))` | `onSnapshot` |

---

## 5. Alur Transisi & Eksekusi

```text
[Fase 1: Cloud Bridge & Direct Service Layer]
  │──> Buat hook realtime: useFirestoreCollection & useFirestoreDoc
  │──> Buat Direct Firestore Service Layer (bypass Sync Queue)
  │
[Fase 2: One-Time Data Migration Engine]
  │──> Deteksi data lokal di Dexie
  │──> Batch write ke Firestore (Idempotent & non-destructive)
  │──> Tandai flag migrationCompleted = true
  │
[Fase 3: Refactoring Komponen UI ke Realtime Listener]
  │──> POS, Inventory, Fruit, Fish, Prep Orders, Shift, Dashboard
  │──> Perubahan di Perangkat A langsung tampil di Perangkat B via onSnapshot
  │
[Fase 4: Online Health & Connection Enforcement]
  │──> Indikator status "Cloud Realtime Active" (Hijau Berkedip Halus)
  │──> Modal "Koneksi Terputus" jika internet hilang (Mencegah transaksi split-brain)
  │
[Fase 5: Pembersihan Sinkronisasi Lama]
  │──> Hapus background interval polling (SyncEngine.start interval)
  │──> Sembunyikan badge antrean pending sync yang tidak relevan lagi
```
