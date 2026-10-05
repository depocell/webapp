# 🚀 WALKTHROUGH & STATUS PROYEK: WEB REPORT BI

Dokumen ini adalah rekam jejak resmi status pengerjaan sistem **WEB REPORT (`c:\WEB REPORT`)** per **05 Oktober 2026**. Berisi seluruh fitur yang sudah berstatus **DONE**, arsitektur backend/frontend, serta panduan operasional.

---

## 📌 DAFTAR MODUL & STATUS PENGERJAAN

| Modul | Halaman / Hash | Status | Deskripsi Singkat |
| :--- | :--- | :---: | :--- |
| **Overview Dashboard** | `#overview` | **DONE** ✅ | Tren perbandingan harian cabang, ringkasan brand, dan Audit Master widget otomatis. |
| **Daily Summary Report** | `#daily` | **DONE** ✅ | Laporan harian performa cabang & produk, grafik Chart.js berlabel angka, tombol Download PNG HD. |
| **SCO Executive Suite** | `#sco` | **DONE** ✅ | Portal SCO, auto-generate Parquet ke JSON, auto-push ke GitHub Pages (`depocell/SCO`). |
| **Customer & Reseller** | `#reseller` | **DONE** ✅ | Profil lengkap, komposisi produk, analisa % EWALLET, tracking Retensi vs Churn ASTAGA. |
| **Pivot Transaksi Dinamis**| `#transaksi` | **DONE** ✅ | Analisa pivot table bebas dimensi (Cabang, Bulan, Tanggal, Status) dengan metrik dinamis. |
| **Mobile SCO (GitHub)** | GitHub Pages | **DONE** ✅ | Sorting Growth Terendah default di `detil_sco.html`, sort & filter EW di `reseller.html`, sidebar putih di `index.html`. |
| **Analisa Produk** | `#produk` | *Roadmap* ⏳ | Modul berikutnya (analisa per kategori produk, margin, dan tren per SKU). |

---

## 🛠️ RINCIAN IMPLEMENTASI YANG SUDAH SELESAI

### 1. Backend Core & Parquet Engine (`engines/`)
- **Incremental Cache Builder (`engines/transaction_engine.py`)**:
  - Partisi cache bulanan disimpan di `.cache/parts/` (misal: `astaga_2026_01.parquet` s/d `astaga_2026_10.parquet`).
  - Bulan lama otomatis di-freeze. Rebuild cache hanya memproses bulan berjalan (~5–8 detik vs ~216 detik cara lama).
  - Pre-warm saat server boot: data 3,7 juta baris dimuat ke RAM sehingga respons API < 50ms.
- **Audit Master Engine (`engines/overview_engine.py`)**:
  - Otomatis memeriksa transaksi vs Master Reseller & Master Produk.
  - Memberi notifikasi di dashboard jika ada kode reseller atau kode produk yang belum terdaftar di master Excel.
- **Reseller Analytics Engine (`engines/reseller_engine.py`)**:
  - Menghubungkan transaksi dengan `CUSTOMER_ASTAGA.xlsx` (Sheet `Mapping_Agen` dan `Reseller`).
  - Menghitung segmentasi keaktifan:
    - **Aktif Rutin (Retained)**: Transaksi bulan lalu dan bulan ini.
    - **Baru / Reaktivasi**: Baru muncul transaksi di bulan ini.
    - **Pasif / Churn**: Aktif di bulan lalu, tapi 0 transaksi di bulan ini.
  - Menghitung porsi dan persentase **% EWALLET** per reseller.
- **SCO Auto-Sync Engine (`engines/sco_engine.py`)**:
  - Menghasilkan file `data_sco.json` dan `data_reseller.json` langsung dari cache Parquet.
  - Fitur `api_sco_push`: 1-klik push commit ke GitHub Pages repo `https://github.com/depocell/SCO.git`.

---

### 2. Frontend User Interface (`pages/` & `static/`)
- **Single Shell Architecture (`templates/shell.html` & `static/js/app.js`)**:
  - Navigasi mulus berbasis URL Hash (`#overview`, `#daily`, `#sco`, `#reseller`, `#transaksi`).
  - Cache-busting otomatis pada script JavaScript sehingga kode selalu up-to-date saat direfresh.
- **Daily Report HD Export (`pages/daily/`)**:
  - Grafik harian dilengkapi plugin canvas teks: setiap bar menampilkan angka pasti transaksi.
  - Export PNG resolusi tinggi (HD) via `html2canvas` siap dikirim ke manajemen/WhatsApp.
- **Customer & Reseller Analytics (`pages/reseller/`)**:
  - 6 KPI Card ringkasan (Total Terdaftar, Aktif, Retained, Baru, Churn, Total Trx & % EWALLET).
  - Tab Filter Cepat: `Semua Aktif`, `Aktif Rutin`, `Baru/Reaktivasi`, `Pasif/Churn`, `Dominan EWALLET ≥ 50%`.
  - Filter dropdown Cabang & Pencarian realtime (Nama, Kode, SCO, Agen).
  - Modal Drawer: klik baris untuk melihat detail limit, jadwal kunjungan SCO, dan progress bar komposisi produk.
  - Tombol **Export CSV** untuk download data reseller yang sedang difilter.

---

### 3. Mobile Web SCO (`pages/sco/` & GitHub Pages)
- **Detil SCO (`detil_sco.html`)**:
  - Default sorting diubah menjadi **Growth Terendah** (`growth_asc`) saat halaman pertama kali dibuka.
- **Reseller SCO (`reseller.html`)**:
  - Tab Bulan Ini: Default filter aktif di **Dominan EW (≥ 50%)**, urutan default **descending by Total Transaksi**.
  - Tab Bulanan: Nama tab diubah menjadi **% EWALLET 2026**, urutan default **descending by Total Transaksi**.
- **Ringkasan SCO (`index.html`)**:
  - Sidebar diubah ke tema **Putih / Light Grey** (`#ffffff`), border halus `#e2e8f0`.
  - Logo MyAstaga (`logo_myastaga.png`) tampil kontras dan jelas terbaca.

### 4. Optimalisasi Performa Mesin (*High-Performance Tuning*) ⚡
- **In-Memory RAM Cache (`_MEMORY_CACHE`)**:
  - File Parquet 51 MB (3,7 juta transaksi gabungan ASTAGA & OKIPAY) dimuat ke memori saat server boot.
  - Panggilan API berikutnya membaca langsung dari RAM (~0,001 detik vs ~1,5 detik baca disk berulang).
- **Vektorisasi Ekstraksi Bulan Transaksi (`ym`)**:
  - Menggantikan Python string `.dt.strftime('%Y-%m')` yang memakan ~28 detik per brand dengan kalkulasi integer vektorisasi: `(dt.year * 100 + dt.month).map(lookup_dict)`.
  - Durasi pemrosesan turun drastis dari **28 detik menjadi 0,2 detik** (~140x lebih cepat).
- **Master Data Parquet & Fast JSON Cache**:
  - Master `CUSTOMER_ASTAGA.xlsx` dan `CUSTOMER_OKI.xlsx` di-cache ke format `.parquet` dan `.json` terstruktur di folder `.cache/`.
  - Mengeliminasi overhead pembacaan lambat library `openpyxl` saat request masuk, memangkas waktu dari **5,5 detik menjadi < 0,005 detik**.
- **Vektorisasi Agregasi Reseller**:
  - Menggantikan fungsi lambda Python berulang di Reseller Engine dengan **`pd.crosstab` vektorisasi**.
  - Waktu agregasi porsi EWALLET/TELCO/PPOB/PLN terpangkas dari **54 detik menjadi 0,12 detik**.
- **Server Pre-warm Otomatis (`server.py`)**:
  - Thread latar belakang memuat seluruh DataFrame transaksi dan master metadata saat aplikasi dinyalakan, memastikan respons pertama pengguna sudah instan.

#### 📊 Hasil Benchmark Kecepatan (*Before vs After Tuning*):
| Modul / Endpoint | Sebelum Servis 🐢 | Sesudah Servis ⚡ | Peningkatan |
| :--- | :---: | :---: | :---: |
| **Overview Dashboard** (`/api/overview`) | **26,84 detik** | **2,75 detik** | **~10x Lebih Cepat** 🚀 |
| **Reseller Analytics** (`/api/reseller?month=...`) | **13,54 detik** | **1,45 detik** | **~9x Lebih Cepat** 🚀 |
| **Daily Report ASTAGA** (`/api/daily?brand=ASTAGA`) | **9,75 detik** | **1,63 detik** | **~6x Lebih Cepat** 🚀 |
| **Daily Report OKIPAY** (`/api/daily?brand=OKIPAY`) | **6,40 detik** | **0,99 detik** | **~6,5x Lebih Cepat** 🚀 |
| **Pivot Options** (`/api/pivot/options`) | **6,25 detik** | **0,30 detik** | **~20x Lebih Cepat** 🚀 |
| **Pivot Query Table** (`/api/pivot/query`) | **0,45 detik** | **0,22 detik** | **Instan (< 0,3s)** ⚡ |

---

## 🏃 PANDUAN MENJALANKAN SISTEM (LOCAL)

1. **Jalankan Server**:
   ```powershell
   cd "C:\WEB REPORT"
   python server.py
   ```
   *Atau klik ganda file `run_report.bat`.*
2. **Akses Dashboard**:
   Buka browser di alamat:
   **`http://localhost:8000`**

---

## 📂 STRUKTUR FOLDER PENTING

```
C:\WEB REPORT\
├── server.py                 # Entry point server (Starlette + Uvicorn)
├── DEPLOYMENT_STRATEGY.md    # Blueprint panduan deployment 100% gratis
├── WALKTHROUGH.md            # Rekam jejak fitur & performa (file ini)
├── engines/                  # Backend processing engines
│   ├── transaction_engine.py # Engine pembaca & pembuat Parquet + in-memory cache
│   ├── overview_engine.py    # Engine tren harian & audit master
│   ├── daily_engine.py       # Engine daily summary report
│   ├── reseller_engine.py    # Engine profil, ewallet & churn reseller
│   ├── sco_engine.py         # Engine auto-sync & push SCO
│   └── pivot_engine.py       # Engine pivot dinamis
├── pages/                    # Frontend views per module
│   ├── home/                 # Modul Overview
│   ├── daily/                # Modul Daily Report
│   ├── reseller/             # Modul Customer & Reseller
│   ├── transaksi/            # Modul Pivot Transaksi
│   └── sco/                  # Repository git SCO (GitHub Pages)
├── MASTER/                   # Master Excel (Customer & Produk)
└── .cache/                   # Cache Parquet transaksi (Super cepat)
    ├── parts/                # Partisi Parquet per bulan
    ├── cust_astaga.parquet   # Cache master customer cepat
    ├── cust_oki.parquet      # Cache master customer cepat
    └── reseller_meta_cache.json # Cache profil agen & reseller cepat
```

---

*Terakhir diperbarui: 05 Oktober 2026 (Setelah Servis & Optimalisasi Performa Mesin).*
