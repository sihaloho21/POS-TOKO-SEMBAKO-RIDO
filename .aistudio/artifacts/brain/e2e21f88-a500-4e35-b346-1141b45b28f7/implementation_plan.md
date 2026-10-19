# PRD & Implementation Plan: Aturan Loyalty Point & Member Tier pada Menu Pengaturan (Settings)

Product Requirements Document (PRD) dan rencana implementasi arsitektur untuk konfigurasi fleksibel aturan loyalitas pelanggan, rasio perolehan poin belanja, nilai tukar poin dalam rupiah, dan tingkatan member tier beserta benefit diskon di Toko Sembako Riama.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Berdasarkan klarifikasi kebutuhan dari Owner, berikut adalah keputusan kunci yang telah disepakati dan diterapkan dalam rancangan:

- **Confirmed Decision 1 (Rasio & Nilai Tukar Poin)**: Pengaturan menyediakan konfigurasi nominal belanja per 1 poin (misal default Rp 10.000 = 1 Pts), nilai tukar 1 poin dalam Rupiah saat penukaran/potongan (misal default 1 Pts = Rp 100), serta syarat minimum poin untuk melakukan penukaran.
- **Confirmed Decision 2 (Basis Kualifikasi Tier)**: Pengaturan mengizinkan pemilihan tolak ukur penentuan member tier, yaitu: **Akumulasi Poin Seumur Hidup (Lifetime Earned Points)** atau **Total Belanja Seumur Hidup (Lifetime Spend)**.
- **Confirmed Decision 3 (Fitur Konfigurasi Per Tier)**: Setiap tingkatan tier (misal Bronze, Silver, Gold, Platinum) dapat dikonfigurasi: nama tier, ambang batas minimal kualifikasi, persentase diskon belanja member (%), warna aksen kartu/badge, dan daftar deskripsi keuntungan/perks.
- **Confirmed Decision 4 (Proteksi Akun Reseller)**: Sesuai aturan bisnis toko sembako grosir, akun pelanggan tipe Reseller tetap dikecualikan dari perolehan poin belanja otomatis untuk mencegah margin ganda.

---

## 1. Overview & Core Concept

### What It Does
Fitur ini menambahkan tab baru **"Loyalty & Member Tier"** di halaman **Settings (Pengaturan)** yang memungkinkan Owner toko menentukan dan memodifikasi seluruh parameter program loyalitas secara dinamis tanpa mengubah kode program. Parameter ini langsung terintegrasi secara otomatis ke:
1. **Mesin Kalkulasi Transaksi POS (`TransactionEngine` & `LoyaltyEngine`)**: Menghitung poin yang diperoleh saat kasir menyelesaikan penjualan, serta menghitung diskon member otomatis di keranjang POS berdasarkan tier pelanggan yang dipilih.
2. **Halaman Pelanggan & Riwayat Poin (`LoyaltyHistory` & `Customers`)**: Menampilkan status tier, progres menuju tier berikutnya, dan nilai rupiah dari poin aktif yang dimiliki pelanggan secara akurat.
3. **Struk Belanja Kasir**: Menampilkan perolehan poin transaksi dan saldo poin akhir pelanggan sesuai pengaturan cetak struk.

### Target Audience & Persona
- **Owner Toko**: Pemilik toko yang ingin meningkatkan retensi pelanggan setia, mengatur program promosi loyalti yang menguntungkan tanpa merusak margin laba, dan memberikan insentif belanja.
- **Kasir**: Petugas kasir yang melayani transaksi belanja dan dapat menginformasikan keuntungan tier pelanggan atau diskon member yang otomatis teraplikasi.
- **Pelanggan Toko**: Pembeli eceran/langganan yang termotivasi berbelanja lebih banyak untuk naik level tier dan mendapatkan potongan harga.

### Key Value
- **Fleksibilitas Promosi**: Mengubah rasio poin kapan saja (misal saat promo hari raya atau penyesuaian inflasi harga sembako).
- **Otomatisasi Diskon Member**: Diskon tier langsung teraplikasi di POS tanpa kasir perlu menghitung diskon manual.
- **Ketahanan Offline-First**: Aturan disimpan di local IndexedDB (Dexie) dan disinkronkan ke Firebase Firestore sehingga transaksi POS tetap bekerja 100% saat jaringan internet offline.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Navigasi ke Tab Loyalty di Settings**:
   - Owner membuka menu **Settings**.
   - Muncul tab navigasi baru: `Receipt & Branding`, `Payment Methods`, dan `Loyalty & Member Tier`.
   - Mengklik `Loyalty & Member Tier` menampilkan dashboard pengaturan terbagi dalam 2 seksi utama:
     - **Seksi 1: Aturan Perolehan & Penukaran Poin (Earning & Redemption Rules)**
     - **Seksi 2: Konfigurasi Tingkatan Member Tier & Diskon (Tier Levels & Benefits)**

2. **Mengatur Rasio & Nilai Poin**:
   - Owner mengatur:
     - *Nomor Aktifasi Program*: Sakelar aktif/nonaktif loyalty program.
     - *Nominal Belanja per 1 Poin*: Input angka rupiah (misal Rp 10.000).
     - *Nilai Tukar 1 Poin ke Rupiah*: Input angka rupiah (misal Rp 100/poin).
     - *Minimal Poin untuk Penukaran*: Batas minimal poin sebelum dapat ditukarkan (misal 50 Pts).
     - *Pengecualian Reseller*: Checklist opsi apakah akun reseller mendapat poin atau dikecualikan.
     - *Tolak Ukur Kualifikasi Tier*: Pilihan radio button: "Akumulasi Poin Terkumpul Seumur Hidup" vs "Total Akumulasi Belanja (Rp)".
   - Menekan tombol **"Simpan Aturan Poin"** dengan status sukses dan toast notifikasi.

3. **Mengatur Tingkatan Member Tier**:
   - Ditampilkan daftar kartu tier (default: Bronze, Silver, Gold, Platinum).
   - Setiap kartu menampilkan:
     - Nama Tier & Warna Aksentuasi (Bronze/Silver/Gold/Platinum).
     - Ambang batas minimal kualifikasi (dalam Pts atau Rp).
     - Persentase diskon belanja member (misal 0%, 2%, 5%, 8%).
     - Daftar poin keuntungan (perks) yang dapat ditambah/dihapus/diedit secara bebas.
   - Owner dapat mengedit tier yang ada atau menekan tombol **"+ Tambah Tier Baru"** untuk skema kustom.
   - Validasi bertingkat otomatis: memastikan ambang batas tier berurutan (misal Tier Silver > Bronze, Gold > Silver) untuk mencegah ambiguitas kenaikan tier.

4. **Integrasi POS & Keranjang**:
   - Saat kasir memilih pelanggan terdaftar pada transaksi POS:
     - Sistem langsung mendeteksi tier pelanggan.
     - Jika tier memiliki diskon member belanja (misal 5%), POS otomatis menerapkan diskon tier tersebut pada subtotal penjualan ritel non-reseller.
     - Preview poin yang akan didapat langsung dihitung menggunakan rumus dinamis dari pengaturan.

### Visual Identity & Theme
- **Gaya Desain**: SaaS retail utility dengan tipografi kontras tinggi, sans-serif neutral, angka tabular mono (`font-mono tabular-nums`) untuk nominal uang dan angka poin.
- **Pemberian Warna**:
  - Bronze: Amber hangat (`amber-700` / `amber-800`)
  - Silver: Slate dingin premium (`slate-400` / `slate-600`)
  - Gold: Kuning emas elegan (`amber-500` / `yellow-600`)
  - Platinum: Indigo/Violet royal (`indigo-600` / `purple-700`)
- **Restraint Anti-Slop**: Tidak menggunakan pill-badge berlapis atau kapsul warna buram statis; menggunakan bar progres garis tajam, label teks tebal dengan hierarki tipografi jelas, dan layout grid 2-kolom responsif.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Model Penyimpanan Pengaturan (Single Document Pattern)
- **Pendekatan Terpilih**: Menggunakan dokumen terdedikasi `loyalty_settings` pada tabel Dexie `settings` (ID: `'loyalty'`) dan disinkronkan ke dokumen Firestore `/settings/loyalty`.
- **Alasan**:
  - Menghindari modifikasi skema multi-tabel yang rumit.
  - Memastikan pembacaan aturan di POS berkecepatan mikro-detik (< 1ms) tanpa latency query jaringan.
  - Jika belum ada pengaturan yang disimpan, fallback transparan ke `DEFAULT_LOYALTY_SETTINGS` memastikan aplikasi tidak pernah crash atau error null.

### Decision 2: Tolak Ukur Tier Seumur Hidup (Lifetime) vs Saldo Berjalan (Current Balance)
- **Pendekatan Terpilih**: Kualifikasi tier default menggunakan **Akumulasi Poin Seumur Hidup (Lifetime Earned Points)** atau **Total Belanja Seumur Hidup (Lifetime Spend)** sesuai pilihan Owner, bukan saldo poin aktif saat ini.
- **Alasan**:
  - Pelanggan tidak dihukum turun peringkat tier hanya karena mereka menukarkan poin reward mereka untuk potongan belanja. Ini adalah standar industri terbaik (*gamification loyalty*) yang mendorong pelanggan aktif menukarkan poin tanpa takut kehilangan hak istimewa tier-nya.

### Decision 3: Integrasi Otomatis Diskon Member di POS
- **Pendekatan Terpilih**: Diskon persentase dari tier member otomatis disugesti di kasir POS dengan opsi toggle aktif/nonaktif transparan pada ringkasan pembayaran.
- **Alasan**: Kasir tidak perlu menghitung manual di kalkulator; integritas sistem tetap terjaga, dan receipt mencantumkan rincian potongan member tier.

---

## 4. Technical Architecture & Data Strategy

### Technical Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SETTINGS: LOYALTY & TIER                        │
│                                                                        │
│   [ Aturan Poin Pts ]               [ Konfigurasi Member Tier ]        │
│   - Belanja per 1 Pts (Rp)          - Nama Tier (Bronze, Silver, ...)  │
│   - Nilai Tukar 1 Pts (Rp)          - Ambang Batas Min Pts / Belanja   │
│   - Minimal Tukar Pts               - Diskon Belanja Member (%)        │
│   - Pengecualian Reseller           - Daftar Keuntungan / Perks        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Menyimpan & Update
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             LOCAL DEXIE DB (db.settings.get('loyalty'))                │
│             + SYNC ENGINE -> FIRESTORE (/settings/loyalty)             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Live Reactivity
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        LOYALTY ENGINE (Dynamic)                        │
│  - calculatePoints(transaction, settings)                              │
│  - getCustomerStats(customerId, settings)                              │
│  - getTierDiscount(customer, settings)                                 │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
       ┌────────────────────────┐       ┌─────────────────────────┐
       │   POS & TRANSACTIONS   │       │   CUSTOMER PROFILE      │
       │  - Hitung Poin Masuk   │       │  - Badge Tier Pelanggan │
       │  - Auto-Diskon Member  │       │  - Progress Bar ke Next │
       │  - Cetak Struk Poin    │       │  - Riwayat & Tukar Pts  │
       └────────────────────────┘       └─────────────────────────┘
```

### Data Model & Types

```typescript
export interface MemberTierConfig {
  id: string;
  name: string;
  minThreshold: number; // Minimal Poin atau Rupiah Belanja
  discountPercent: number; // Diskon belanja (%)
  colorScheme: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'EMERALD' | 'BLUE';
  perks: string[];
}

export interface LoyaltySettingsConfig {
  id: 'loyalty';
  isEnabled: boolean;
  pointsPerAmount: number; // Misal Rp 10.000 per 1 poin
  pointRedemptionValue: number; // Misal 1 poin = Rp 100
  minRedemptionPoints: number; // Misal minimal 50 poin untuk redeem
  qualificationBasis: 'LIFETIME_POINTS' | 'LIFETIME_SPEND';
  excludeReseller: boolean;
  tiers: MemberTierConfig[];
  updatedAt: string;
  updatedBy?: string;
}
```

### Nilai Bawaan (Default Values):
- `pointsPerAmount`: 10.000
- `pointRedemptionValue`: 100
- `minRedemptionPoints`: 50
- `qualificationBasis`: `'LIFETIME_POINTS'`
- `excludeReseller`: `true`
- `tiers`:
  1. **Bronze**: Min 0 Pts, Diskon 0%, Perks: "Akses Promo Sembako Reguler", "Kupon Belanja Bulanan"
  2. **Silver**: Min 50 Pts, Diskon 2%, Perks: "Diskon Member 2%", "Bonus Poin Produk Sponsor"
  3. **Gold**: Min 200 Pts, Diskon 5%, Perks: "Diskon Member 5%", "Prioritas Stok", "Bonus Dobel Poin Hari Khusus"
  4. **Platinum**: Min 500 Pts, Diskon 8%, Perks: "Diskon Member 8%", "Bebas Antri Prioritas", "Hadiah Sembako Tahunan", "Layanan Pesan Antar Bebas Biaya"

---

## 5. Implementation Steps (Execution Plan)

1. **Definisi Type & Service Loyalty Settings**:
   - Tambahkan type `LoyaltySettingsConfig` dan `MemberTierConfig` di `src/core/types.ts`.
   - Buat service `LoyaltySettingsService` untuk mengelola fetch, update, validasi, dan fallback nilai default ke Dexie & Firestore sync.

2. **Refactor `LoyaltyEngine`**:
   - Perbarui method `calculatePoints()`, `getCustomerStats()`, dan `calculatePointsForAmount()` agar membaca konfigurasi dinamis dari `LoyaltySettingsService`.
   - Tambahkan fungsi bantuan `getTierForCustomer()` dan `getApplicableTierDiscount()` untuk integrasi ke POS.

3. **Buat Komponen UI `LoyaltySettings.tsx` di `src/app/settings/`**:
   - Form konfigurasi aturan dasar: rasio belanja/poin, nilai tukar rupiah, batas minimum tukar, tolak ukur tier.
   - Editor visual kartu tier member: form input minimal ambang batas, persentase diskon belanja, pilihan warna tema, serta input list keuntungan (perks) dinamis dengan tombol tambah/hapus.
   - Tombol "Simpan Perubahan" dan "Reset ke Bawaan".

4. **Integrasikan ke Menu Settings (`src/app/settings/Settings.tsx`)**:
   - Tambahkan tab navigasi ke-3: **Loyalty & Tier** dengan ikon piala (`Trophy`/`Award`).
   - Tautkan komponen `LoyaltySettings` dengan proteksi akses Owner.

5. **Hubungkan ke Tampilan Pelanggan (`LoyaltyHistory.tsx` & `Customers.tsx`)**:
   - Perbarui tampilan kartu loyalitas pelanggan agar mencerminkan nama tier kustom, threshold dinamis, dan perkiraan konversi poin ke nilai rupiah.

6. **Verifikasi & Testing**:
   - Uji perubahan nominal belanja per 1 poin (misal ubah jadi Rp 5.000) dan pastikan kalkulasi poin di POS langsung berubah.
   - Uji penambahan/modifikasi tingkatan tier dan pastikan status tier pelanggan langsung beradaptasi secara real-time.
   - Jalankan `compile_applet` dan `lint_applet` untuk menjamin tidak ada regresi tipe TypeScript.
