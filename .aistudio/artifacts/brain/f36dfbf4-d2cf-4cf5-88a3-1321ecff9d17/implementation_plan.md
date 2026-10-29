# PRD: Sistem Titipan Barang (Bagi Hasil)

Dokumen ini menjelaskan spesifikasi fitur Titipan Barang untuk mengelola produk yang dititipkan oleh Sales dengan sistem bagi hasil.

## 1. Konsep Utama
- **Siklus Titipan**: Dimulai saat barang datang, dan berakhir saat Sales melakukan penagihan (Setoran).
- **Sistem Reset**: Setiap kali setoran dibayar, stok lama dianggap "selesai" (sisa dikembalikan ke sales), dan stok baru diinput untuk memulai siklus berikutnya.

## 2. Fitur CRUD (Manajemen Data)
- **Create**: Menambah barang baru (Nama, Supplier/Sales, Harga Modal, Harga Jual).
- **Read**: Daftar barang titipan dengan status stok saat ini.
- **Update**: Mengubah informasi harga atau nama barang.
- **Delete**: Menghapus barang (hanya jika tidak ada setoran menggantung).

## 3. Logika Perhitungan Otomatis (Setoran)
Saat Sales berkunjung, Owner/Kasir menginput **Sisa Stok**:
- **Jumlah Terjual** = `Stok Awal (Siklus Ini) - Sisa Stok`.
- **Total Setoran** = `Jumlah Terjual x Harga Modal Sales`.
- **Total Keuntungan** = `Jumlah Terjual x (Harga Jual - Harga Modal)`.

## 4. Alur Proses Setoran & Reset
1. User menginput **Sisa Stok**.
2. Sistem menampilkan ringkasan: **Terjual, Setoran, dan Keuntungan**.
3. User menekan **"Bayar & Mulai Siklus Baru"**.
4. **Logika Backend**:
   - Saldo **Kas Warung** berkurang sebesar **Total Setoran**.
   - Stok barang lama di-reset menjadi 0.
   - User menginput **Stok Baru** yang dititipkan Sales hari ini.
   - Stok barang diperbarui sesuai input Stok Baru tersebut untuk siklus selanjutnya.

## 5. Antarmuka Pengguna (UI)
- **Informasi Keuntungan**: Field khusus yang menunjukkan total profit yang didapat toko dari produk tersebut.
- **Histori**: Catatan tanggal barang datang dan tanggal setoran dilakukan.
- **Status Visual**: Indikator jika barang perlu segera dilakukan setoran.

---
**Catatan Teknis**: 
- Data tersimpan di Dexie (Local) dan sinkron ke Firestore.
- Transaksi tercatat di `FinanceEvent` sebagai pengeluaran (`OUT`) dari storage `WARUNG`.
