# Product Requirements Document (PRD)
## Sistem Pengaturan Biaya Admin (Fee) Produk Digital & Tarif Bertingkat Berbasis Nominal
### Toko Sembako & Ikan Riama — Modul Layanan Digital (Agen PPOB & Finansial)

---

### 1. Ringkasan Eksekutif (Executive Summary)
Dokumen ini menetapkan spesifikasi produk dan rancangan teknis untuk fitur **Pengaturan Biaya Admin (Fee Configuration)** pada modul **Layanan Digital** di sistem Toko Sembako & Ikan Riama.

Melalui fitur ini, pemilik toko (**Role: OWNER**) memiliki kendali penuh secara mandiri untuk:
1. **Menentukan Tarif Admin Tetap (Flat Fee):** Untuk produk digital standar seperti **Pulsa**, **Paket Data**, dan **Token PLN**.
2. **Menentukan Tarif Admin Bertingkat Berbasis Rentang Nominal (Tiered Range Fee):** Khusus untuk transaksi finansial bernilai dinamis yaitu **Transfer Bank**, **Top Up E-Wallet**, dan **Tarik Tunai**. Biaya admin disesuaikan secara otomatis berdasarkan besaran nominal uang yang ditransfer atau ditarik (contoh: Rp 10.000 – Rp 500.000 fee Rp 3.000; Rp 500.001 – Rp 1.000.000 fee Rp 5.000; dst.).
3. **Kalkulasi Otomatis di Kasir (Auto-Calculate Engine):** Saat kasir menginput nominal transaksi pokok (*principal*), sistem secara instan dan sub-detik menentukan biaya admin yang tepat dari tier aktif, menghilangkan risiko salah hitung atau ketidakkonsistenan antar kasir.
4. **Pencatatan Akuntansi Isolasi 4 Kas Toko (Strict Multi-Vault Isolation):** Sistem keuangan toko terbagi menjadi 4 storage kas yang terpisah secara independen: **Kas Warung (`WARUNG`)**, **Kas Ikan (`IKAN`)**, **Kas Buah (`BUAH`)**, dan **Kas Digital (`UANG_DIGITAL`)**. Seluruh arus perputaran uang dan pendapatan jasa admin (*service revenue*) dari Layanan Digital dicatat eksklusif ke dalam **Storage KAS DIGITAL (`UANG_DIGITAL`)** dan sama sekali tidak mencampuri atau mencemari Kas Warung, Ikan, maupun Buah.

---

### 2. Latar Belakang & Masalah Bisnis (Problem Statement)

#### 2.1. Kondisi Saat Ini (As-Is)
- Pada kode saat ini (`src/app/digital/DigitalServices.tsx`), biaya admin masih bernilai **hardcoded default Rp 2.000** untuk semua jenis layanan digital tanpa pembeda.
- Toko melayani transaksi perbankan dan remitansi agen (Transfer ke sesama/antar bank, Tarik Tunai dari transfer pembeli, dan Top Up dompet digital seperti DANA, OVO, GoPay, ShopeePay).
- Risiko bisnis: Transaksi Tarik Tunai atau Transfer Bank nominal besar (misal Rp 2.000.000 atau Rp 5.000.000) memerlukan likuiditas uang tunai dan saldo rekening toko yang tinggi serta memiliki biaya modal operasional yang lebih besar. Memberlakukan biaya admin seragam Rp 2.000 untuk transaksi jutaan rupiah merugikan toko dan tidak sesuai standar pasar keagenan keuangan mikro.

#### 2.2. Kebutuhan Solusi (To-Be)
- Dibutuhkan panel pengaturan khusus di mana Owner dapat membuat aturan rentang nominal (*nominal tier brackets*).
- Setiap tier memiliki batas bawah nominal (*Min Amount*), batas atas nominal (*Max Amount*), dan tarif biaya admin (*Fee Amount*).
- Sistem harus fleksibel: Owner dapat menambah, mengedit, atau menghapus baris rentang nominal kapan pun, dan perubahan langsung berlaku di kasir secara *realtime* di semua perangkat.

---

### 3. Matriks Peran & Hak Akses (User Persona & Permission Guard)

| Peran (Role) | Hak Akses Pengaturan Biaya Admin | Hak Akses Transaksi Kasir Digital | Keterangan |
|---|:---:|:---:|---|
| **OWNER** | **Full Access (CRUD)** | Ya | Mengatur flat fee, membuat/mengubah/menghapus tier rentang nominal transfer, topup, dan tarik tunai. |
| **KASIR** | **Read-Only (Auto-Applied)** | Ya | Mengoperasikan layanan kasir; biaya admin terisi otomatis sesuai aturan Owner. Kasir tidak dapat mengubah rumus master fee. |
| **STAFF** | **No Access** | Terbatas | Tidak dapat mengubah konfigurasi biaya admin. |

---

### 4. Klasifikasi Layanan Digital & Model Penetapan Biaya

Layanan digital dikelompokkan menjadi dua model penetapan tarif:

```
                                  ┌─────────────────────────────┐
                                  │   LAYANAN DIGITAL TOKO      │
                                  └──────────────┬──────────────┘
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   ▼                                                           ▼
       [ MODEL 1: FLAT FEE ]                                    [ MODEL 2: TIERED RANGE FEE ]
(Tarif Admin Tetap per Kategori)                             (Tarif Bertingkat Berdasarkan Nominal)
    • Pulsa                                                      • Transfer Bank
    • Paket Data                                                 • Top Up E-Wallet
    • Token Listrik PLN                                          • Tarik Tunai
```

#### 4.1. Model 1: Flat Fee (Biaya Tetap per Transaksi)
Digunakan untuk produk utilitas telekomunikasi & listrik:
- **PULSA:** Biaya default yang ditambahkan di atas harga modal nominal (contoh: Flat Rp 2.000).
- **PAKET_DATA:** Flat fee (contoh: Flat Rp 2.000).
- **TOKEN_LISTRIK:** Biaya admin loket PLN (contoh: Flat Rp 2.500 atau Rp 3.000).

#### 4.2. Model 2: Tiered Range Fee (Tarif Bertingkat Berdasarkan Nominal)
Digunakan untuk transaksi agen finansial tunai & digital:
- **TRANSFER (Transfer Bank):**
  - Rentang 1: Rp 1 s/d Rp 500.000 ➔ Fee Rp 5.000
  - Rentang 2: Rp 500.001 s/d Rp 1.000.000 ➔ Fee Rp 7.000
  - Rentang 3: Rp 1.000.001 s/d Rp 2.500.000 ➔ Fee Rp 10.000
  - Rentang 4: Rp 2.500.001 s/d Rp 5.000.000 ➔ Fee Rp 15.000
  - Rentang 5: Di atas Rp 5.000.000 ➔ Fee Rp 20.000 (atau sesuai kebijakan toko)
- **TOPUP (Top Up E-Wallet: DANA, OVO, ShopeePay, GoPay):**
  - Rentang 1: Rp 1 s/d Rp 250.000 ➔ Fee Rp 2.000
  - Rentang 2: Rp 250.001 s/d Rp 500.000 ➔ Fee Rp 3.000
  - Rentang 3: Rp 500.001 s/d Rp 1.000.000 ➔ Fee Rp 5.000
  - Rentang 4: Di atas Rp 1.000.000 ➔ Fee Rp 7.000
- **TARIK_TUNAI (Penarikan Uang Tunai dari Transfer Pembeli):**
  - Rentang 1: Rp 1 s/d Rp 500.000 ➔ Fee Rp 5.000
  - Rentang 2: Rp 500.001 s/d Rp 1.000.000 ➔ Fee Rp 8.000
  - Rentang 3: Rp 1.000.001 s/d Rp 2.000.000 ➔ Fee Rp 12.000
  - Rentang 4: Di atas Rp 2.000.000 ➔ Fee Rp 15.000 + Rp 5.000/juta tambahan (atau per-tier tetap)

*Catatan: Seluruh angka batas nominal dan tarif biaya di atas dapat diubah, ditambah, atau dikurangi oleh Owner secara bebas dan dinamis.*

---

### 5. Arsitektur Model Data & Skema Database

Konfigurasi disimpan pada tabel `settings` (atau koleksi Firestore `settings/digital_fee_config`) dan di-cache pada IndexedDB Dexie untuk performa lokal sub-10ms.

#### 5.1. Skema TypeScript (`src/core/types.ts`)

```typescript
export type DigitalServiceType = 
  | 'PULSA' 
  | 'PAKET_DATA' 
  | 'TOKEN_LISTRIK' 
  | 'TOPUP' 
  | 'TRANSFER' 
  | 'TARIK_TUNAI';

/**
 * Entitas aturan rentang nominal untuk layanan bertingkat
 */
export interface DigitalFeeTier {
  id: string;              // UUID e.g. "tier-trf-001"
  minAmount: number;       // Batas minimum nominal pokok (contoh: 1 atau 500001)
  maxAmount: number;       // Batas maksimum nominal pokok (contoh: 500000 atau Infinity/0 untuk tanpa batas)
  feeAmount: number;       // Biaya admin yang dikenakan (contoh: 5000)
  label?: string;          // Label opsional, misal "Hingga 500 Ribu"
}

/**
 * Pengaturan per tipe layanan digital
 */
export interface DigitalServiceConfigItem {
  serviceType: DigitalServiceType;
  label: string;
  pricingModel: 'FLAT' | 'TIERED';
  flatFee: number;                  // Berlaku jika pricingModel === 'FLAT'
  tiers: DigitalFeeTier[];          // Berlaku jika pricingModel === 'TIERED'
  fallbackFee: number;              // Biaya default jika nominal berada di luar semua tier
  isEnabled: boolean;               // Sakelar aktifkan/nonaktifkan layanan
  updatedAt: string;
  updatedBy: string;
}

/**
 * Root konfigurasi seluruh biaya layanan digital toko
 */
export interface DigitalFeeSettings {
  id: 'digital_fee_config';
  configs: Record<DigitalServiceType, DigitalServiceConfigItem>;
  allowCashierManualOverride: boolean; // Apakah kasir diizinkan mengubah fee manual saat transaksi? (default: false)
  updatedAt: string;
  updatedBy: string;
}
```

#### 5.2. Default Baseline Data (Initial Seeding)
Sistem memiliki nilai dasar siap pakai (*ready-to-use*) saat inisialisasi awal toko:
- `PULSA`: Flat Rp 2.000
- `PAKET_DATA`: Flat Rp 2.000
- `TOKEN_LISTRIK`: Flat Rp 3.000
- `TRANSFER`: Tiered (≤500k: Rp 5.000; ≤1jt: Rp 7.000; ≤2.5jt: Rp 10.000; ≤5jt: Rp 15.000; >5jt: Rp 20.000)
- `TOPUP`: Tiered (≤250k: Rp 2.000; ≤500k: Rp 3.000; ≤1jt: Rp 5.000; >1jt: Rp 7.000)
- `TARIK_TUNAI`: Tiered (≤500k: Rp 5.000; ≤1jt: Rp 8.000; ≤2jt: Rp 12.000; >2jt: Rp 15.000)

---

### 6. Rincian Kebutuhan Fungsional (Functional Specifications)

#### 6.1. Panel Konfigurasi Biaya Admin di Menu Settings (`Settings.tsx` & `DigitalServices.tsx`)
- Tersedia Tab / Menu Khusus: **"Tarif & Biaya Admin Digital"** di halaman Settings (khusus role Owner).
- Alternatif akses cepat: Ikon gerigi pengaturan di halaman `DigitalServices.tsx` yang hanya muncul bagi Owner.
- Tampilan kartu untuk setiap kategori produk:
  1. Header kartu menampilkan ikon, nama layanan, dan badge model (`FLAT` atau `BERTINGKAT`).
  2. Input Flat Fee untuk Pulsa, Paket Data, dan Token PLN.
  3. Tabel interaktif rentang nominal untuk Transfer Bank, Top Up E-Wallet, dan Tarik Tunai.

#### 6.2. Manajemen Baris Tier Rentang Nominal (Interaksi UI Owner)
- **Tombol "Tambah Rentang / Tier":**
  - Menambahkan baris baru dengan input:
    - *Nominal Dari (Min):* Angka rupiah.
    - *Nominal Sampai (Max):* Angka rupiah (atau checkbox *"Ke Atas / Tanpa Batas"*).
    - *Biaya Admin (Fee):* Angka rupiah.
- **Validasi Otomatis (Anti-Overlap):**
  - Sistem memvalidasi agar tidak terjadi tumpang-tindih rentang nominal (contoh: Rentang 1 sampai 500.000, maka Rentang 2 otomatis dimulai dari 500.001).
  - Peringatan instan jika `minAmount >= maxAmount`.
- **Tombol Hapus & Urutan:**
  - Ikon tempat sampah di setiap baris tier untuk menghapus rentang.
  - Tiers otomatis diurutkan secara ascending berdasarkan `minAmount`.

#### 6.3. Mesin Kalkulasi Biaya Otomatis di Transaksi Kasir (`DigitalFeeEngine`)
- Dibuat helper service `DigitalFeeEngine.calculateFee(serviceType, principalAmount, customConfigs?)`.
- **Algoritma Pencocokan:**
  ```typescript
  if (config.pricingModel === 'FLAT') {
    return config.flatFee;
  }
  // Model TIERED:
  const matchedTier = config.tiers.find(tier => 
    principalAmount >= tier.minAmount && 
    (tier.maxAmount === 0 || tier.maxAmount === Infinity || principalAmount <= tier.maxAmount)
  );
  return matchedTier ? matchedTier.feeAmount : config.fallbackFee;
  ```
- **Live Re-calculation di Form Transaksi:**
  - Saat kasir mengetik nominal pokok (contoh mengetik `750000` di menu Transfer Bank), input *Biaya Admin* langsung terisi otomatis menjadi `7000` tanpa perlu kasir mencari tabel manual.
  - Total transaksi (`Pokok + Admin = Rp 757.000`) diperbarui secara *realtime* di layar kasir.
  - Menampilkan badge keterangan tier di bawah input: *"Rentang Rp 500.001 - Rp 1.000.000 (Fee Otomatis: Rp 7.000)"*.

#### 6.4. Proteksi Hak Akses Kasir (Manual Override Policy)
- Owner dapat memilih sakelar: **"Izinkan Kasir Mengubah Biaya Admin Manual"** (Aktif/Nonaktif).
  - Jika Nonaktif (Default Rekomendasi): Input Biaya Admin berstatus *read-only* bagi kasir untuk mencegah kecurangan/penyimpangan tarif.
  - Jika Aktif: Kasir dapat melakukan diskon atau penyesuaian biaya admin dalam kondisi khusus, namun setiap selisih tarif dicatat dalam `AuditEngine`.

#### 6.5. Integrasi Pembukuan Akuntansi & Pemisahan 4 Storage Kas (`Finance.tsx`)
Toko Sembako & Ikan Riama memiliki 4 storage kas yang **berdiri sendiri dan terisolasi**:
1. `WARUNG` (Kas Warung / Sembako)
2. `IKAN` (Kas Ikan)
3. `BUAH` (Kas Buah)
4. `UANG_DIGITAL` (Kas Layanan Digital / E-Money / Rekening Agen)

Seluruh operasional Layanan Digital **sepenuhnya berada di dalam Storage KAS DIGITAL (`UANG_DIGITAL`)** dan **TIDAK MENCAMPURI Kas Warung (`WARUNG`)**:
1. **Layanan Pulsa, Paket Data, Token Listrik, Top Up E-Wallet, & Transfer Bank:**
   - Penerimaan dari pelanggan (`Principal + Fee`) masuk ke **`UANG_DIGITAL`** (`IN`).
   - Pengurangan modal saldo digital toko yang dikirimkan ke pelanggan (`Principal`) keluar dari **`UANG_DIGITAL`** (`OUT`).
   - Laba jasa admin tercatat sebagai `SERVICE_REVENUE` sebesar `Fee` pada storage **`UANG_DIGITAL`**.
   - **Kas Warung (`WARUNG`), Ikan (`IKAN`), Buah (`BUAH`) = 0 mutasi** (terlindungi, tidak tercampur).
2. **Layanan Tarik Tunai:**
   - Pelanggan mentransfer uang ke rekening digital toko sebesar (`Principal + Fee`) ➔ Masuk ke **`UANG_DIGITAL`** (`IN`).
   - Kasir menyerahkan uang tunai pos digital sebesar `Principal` ke pelanggan ➔ Keluar dari **`UANG_DIGITAL`** (`OUT`).
   - Laba jasa admin tercatat sebagai `SERVICE_REVENUE` sebesar `Fee` pada storage **`UANG_DIGITAL`**.
   - **Kas Warung (`WARUNG`) = 0 mutasi** (terlindungi, tidak tercampur).

*Catatan:* Apabila kasir sewaktu-waktu membutuhkan pertukaran likuiditas uang fisik antara Kas Warung dan Kas Digital (misal kas fisik digital sedang kosong dan meminjam dari laci Warung), pencatatan dilakukan secara transparan dan sadar melalui fitur **Internal Transfer** (`WARUNG` ⇄ `UANG_DIGITAL`) di modul Keuangan, BUKAN digabung atau tercampur otomatis saat kasir memproses transaksi layanan digital.

---

### 7. Alur Pengguna (User Flows)

#### 7.1. Alur 1: Owner Mengatur Tarif Bertingkat Transfer Bank
1. Owner membuka menu **Settings** ➔ Tab **Tarif Layanan Digital**.
2. Memilih tab **Transfer Bank**.
3. Melihat tabel tier default atau mengedit nominal:
   - Baris 1: Rp 1 - Rp 500.000 ➔ Fee Rp 5.000
   - Baris 2: Rp 500.001 - Rp 1.000.000 ➔ Fee Rp 7.500 *(Owner menaikkan tarif)*
   - Klik *"Tambah Rentang"* ➔ Rp 1.000.001 ke atas ➔ Fee Rp 12.000.
4. Klik tombol **"Simpan Pengaturan Tarif"**.
5. Sistem menyimpan ke Dexie & Cloud Firestore (`cloudSetDoc`), memicu sinkronisasi seketika ke seluruh perangkat toko. Notifikasi sukses muncul: *"Tarif Layanan Digital Berhasil Diperbarui"*.

#### 7.2. Alur 2: Kasir Memproses Layanan Tarik Tunai Rp 1.500.000
1. Kasir membuka menu **Digital Services** ➔ Memilih kartu **Tarik Tunai**.
2. Memasukkan Nomor Referensi/HP Pelanggan: `081298765432 (BCA a.n Budi)`.
3. Memasukkan Nominal Penarikan: `1500000`.
4. Sistem secara otomatis mencocokkan tier Rp 1.000.001 – Rp 2.000.000 dan mengisi **Biaya Admin: Rp 12.000**.
5. Sistem menampilkan ringkasan:
   - *Uang Fisik Diberikan ke Pembeli:* Rp 1.500.000
   - *Total Harus Ditransfer Pembeli ke Toko:* Rp 1.512.000
   - *Pendapatan Admin Toko:* Rp 12.000
6. Kasir memverifikasi transfer masuk ke rekening toko dan menekan **"Proses Transaksi"**.
7. Struk dicetak dan mutasi keuangan tercatat otomatis pada storage `UANG_DIGITAL` serta pendapatan jasa (`SERVICE_REVENUE`) masuk ke Kas Digital tanpa mencampuri Kas Warung, Ikan, atau Buah.

---

### 8. Desain Antarmuka & Komponen UI (UI/UX Blueprint)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ⚙️ PENGATURAN BIAYA ADMIN & TARIF LAYANAN DIGITAL (KHUSUS OWNER)            │
├─────────────────────────────────────────────────────────────────────────────┤
│  [ Pulsa ]  [ Paket Data ]  [ Token PLN ]  [★ Transfer Bank] [ Top Up ] [ Tarik Tunai ]│
├─────────────────────────────────────────────────────────────────────────────┤
│  Layanan Terpilih: 📤 TRANSFER BANK                                         │
│  Model Tarif: [●] Bertingkat Berdasarkan Nominal (Tiered)   ( ) Tarif Tetap (Flat)│
│                                                                             │
│  Tabel Rentang Nominal & Biaya Admin:                                       │
│  ┌───────────────────────┬───────────────────────┬──────────────┬────────┐  │
│  │ Nominal Dari (Min)    │ Nominal Sampai (Max)  │ Biaya Admin  │ Aksi   │  │
│  ├───────────────────────┼───────────────────────┼──────────────┼────────┤  │
│  │ Rp 1                  │ Rp 500.000            │ Rp 5.000     │ [Hapus]│  │
│  │ Rp 500.001            │ Rp 1.000.000          │ Rp 7.500     │ [Hapus]│  │
│  │ Rp 1.000.001          │ Rp 2.500.000          │ Rp 10.000    │ [Hapus]│  │
│  │ Rp 2.500.001          │ ~ Tidak Terbatas      │ Rp 15.000    │ [Hapus]│  │
│  └───────────────────────┴───────────────────────┴──────────────┴────────┘  │
│  [+ Tambah Rentang Nominal Baru]                                             │
│                                                                             │
│  Biaya Cadangan (Fallback): [ Rp 5.000 ]                                    │
│  [x] Kunci Biaya Admin di Kasir (Kasir tidak boleh ubah fee manual)         │
│                                                                             │
│                                     [Batal]   [💾 Simpan Pengaturan Tarif]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 9. Kebutuhan Non-Fungsional & Keamanan (Non-Functional Requirements)

1. **Keamanan Role Guard:**
   - Seluruh mutasi konfigurasi fee memeriksa identitas pengguna aktif (`assertOwner(currentUser?.role)`).
   - Setiap perubahan dicatat ke dalam `AuditEngine` dengan payload sebelum dan sesudah perubahan.
2. **Kinerja & Responsivitas Sub-Detik:**
   - Kalkulasi fee di sisi kasir berjalan *synchronous* (< 5ms) melalui memorized state tanpa menunggu respons jaringan.
3. **Penyimpanan Lokal & Cloud Realtime:**
   - Konfigurasi tersimpan di Dexie IndexedDB `settings` dan disinkronkan ke Firestore `settings/digital_fee_config`.
   - Menggunakan `useFirestoreCollection` atau live listener sehingga perubahan tarif oleh Owner di HP langsung aktif di komputer kasir tanpa *refresh* manual.
4. **Validasi Formulir:**
   - Mencegah input angka negatif, rentang nominal bersilangan, atau nilai kosong.

---

### 10. Rencana Tahapan Implementasi (Implementation Plan)

- **Tahap 1 (Data Types & Service Helper):**
  - Pembaruan `src/core/types.ts` untuk mendukung `DigitalFeeTier` dan `DigitalServiceConfigItem`.
  - Pembuatan service `src/core/services/digital-fee-service.ts` yang memuat logika CRUD konfigurasi dan fungsi `calculateFee`.
- **Tahap 2 (UI Panel Pengaturan Owner):**
  - Pembuatan komponen `DigitalFeeSettingsModal.tsx` atau tab pengaturan di `Settings.tsx` / tombol kelola di `DigitalServices.tsx`.
  - Form tabel rentang bertingkat dengan input mata uang rupiah, validasi overlap, dan tombol tambah/hapus baris.
- **Tahap 3 (Integrasi Kasir Layanan Digital):**
  - Integrasi fungsi `DigitalFeeService.calculateFee` ke formulir transaksi di `DigitalServices.tsx`.
  - Pembaruan tampilan form dengan preview perhitungan instan dan badge rentang aktif.
- **Tahap 4 (Verifikasi & Uji Coba):**
  - Pengujian input berbagai rentang nominal (kecil, sedang, besar, dan di luar batas).
  - Verifikasi ketepatan pencatatan mutasi kas terisolasi UANG_DIGITAL dan audit log.

---

### 11. Kriteria Penerimaan (Acceptance Criteria)

- [x] Owner dapat menentukan Flat Fee untuk Pulsa, Paket Data, dan Token PLN.
- [x] Owner dapat menentukan Tarif Bertingkat (Tiered Fee) berbeda-beda untuk Transfer Bank, Top Up E-Wallet, dan Tarik Tunai.
- [x] Owner dapat menambah, mengubah rentang nominal (Min - Max), dan menghapus baris tier secara mandiri.
- [x] Saat kasir mengetik nominal pokok di menu Digital Services, biaya admin otomatis terisi sesuai rentang tier yang aktif.
- [x] Seluruh transaksi layanan digital tercatat eksklusif di storage KAS DIGITAL (`UANG_DIGITAL`) dan pendapatan jasa `SERVICE_REVENUE` masuk ke Kas Digital tanpa mencemari Kas Warung, Ikan, atau Buah.
- [x] Kasir non-owner tidak dapat mengubah konfigurasi master biaya admin.
- [x] Data tersimpan di Dexie IndexedDB dan tersinkronisasi ke Cloud Firestore secara *realtime*.
