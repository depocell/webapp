# 📘 STRATEGI & BLUEPRINT DEPLOYMENT ONLINE (WEB REPORT)

Dokumen ini merangkum arsitektur, kalkulasi performa, dan opsi deployment **100% GRATIS** untuk mempublikasikan Web Report ke pimpinan/manajemen secara online.

---

## 1. Ringkasan Arsitektur: Localhost vs Online

Web Report dirancang dengan konsep **Single Codebase (Satu Aplikasi, Dua Mode)**:

```
┌──────────────────────────────────────────────┐
│          LAPTOP LOKAL (ADMINISTRATOR)        │
│ • Baca & olah Excel mentah baru              │
│ • Rebuild cache Parquet (~5-8 detik)         │
│ • Fitur Khusus: Tombol "🚀 Push ke Online"   │
└──────────────────────┬───────────────────────┘
                       │
                       │ Upload Parquet matang (~84 MB)
                       ▼
┌──────────────────────────────────────────────┐
│           SERVER ONLINE (CLOUD / VPS)        │
│ • Backend Python + Parquet                   │
│ • Melayani Manajemen / User (24/7)           │
│ • Fitur Rebuild dimatikan (View-Only BI)     │
│ • Akses: Overview, Daily, Pivot, Reseller    │
└──────────────────────────────────────────────┘
                       ▲
                       │
┌──────────────────────┴───────────────────────┐
│        MOBILE SCO (GITHUB PAGES - STATIS)    │
│ • Khusus Tim Sales / SCO Lapangan            │
│ • Ringan di HP, tanpa data sensitif internal │
│ • https://depocell.github.io/SCO/            │
└──────────────────────────────────────────────┘
```

---

## 2. Kalkulasi Beban Backend & Resource

| Metrik | Angka Riil Sistem Kita | Dampak Terhadap Server |
| :--- | :--- | :--- |
| **Jumlah Baris Data** | **3,7 Juta Baris** (2,2 Juta ASTAGA + 1,5 Juta OKIPAY) | Sangat aman untuk engine columnar Parquet |
| **Ukuran Storage Disk** | **~84 MB** (ASTAGA 51 MB, OKIPAY 32 MB) | Tidak makan tempat (Free tier cloud kasih 512 MB - 50 GB) |
| **Konsumsi RAM di Server** | **~150 MB – 250 MB** saat dimuat ke memori | VPS termurah (RAM 1-2 GB) hanya terpakai < 20% |
| **Kecepatan Query / Agregasi** | **~0,1 – 0,3 Detik** (Pandas/Parquet) | User klik filter di web, respon data instan |
| **Estimasi Egress (Bandwidth)** | **< 500 MB / bulan** | Server hanya mengirim data JSON agregasi (10–50 KB per request) |

---

## 3. Pilihan Deployment 100% Gratis (Tanpa Biaya Bulanan)

### 🥇 OPSI 1: Hugging Face Spaces (Docker / Python) — *Rekomendasi Utama Cloud*
*Platform cloud AI & Data terbesar, menyediakan hosting Python gratis tanpa kartu kredit.*
- **Spesifikasi Gratis**:
  - **RAM**: **16 GB** (Sangat melimpah, kita cuma butuh 250 MB)
  - **CPU**: 2 vCPU
  - **Storage**: **50 GB Persistent Disk**
  - **Egress / Bandwidth**: Gratis & sangat longgar untuk dashboard
- **Biaya**: **Rp 0 (Gratis Selamanya)**
- **Kelebihan**: Nyala 24/7 online, URL langsung HTTPS (misal: `https://depocell-webreport.hf.space`), tanpa verifikasi kartu kredit.

---

### 🥈 OPSI 2: Cloudflare Tunnel (Self-Hosted PC Kantor) — *Paling Praktis Tanpa Upload*
*Jika ada PC atau laptop di kantor yang sering menyala pada jam kerja.*
- **Cara Kerja**:
  - Install aplikasi kecil `cloudflared` di PC lokal.
  - Web Report lokal (`localhost:8000`) dipancarkan aman ke internet dengan domain HTTPS (misal: `report.depocell.com` atau subdomain acak Cloudflare).
- **Spesifikasi**:
  - **Storage**: Menggunakan harddisk PC lokal (100% unlimited).
  - **Egress**: **100% Unlimited** lewat jaringan global Cloudflare.
- **Biaya**: **Rp 0**
- **Kelebihan**: Data Parquet tidak perlu di-upload ke pihak ketiga, 100% aman di komputer sendiri.

---

### 🥉 OPSI 3: Koyeb / Render (PaaS Free Tier)
*Platform cloud aplikasi modern dengan integrasi Git.*
- **Spesifikasi Gratis**:
  - **RAM**: 512 MB (Cukup untuk Parquet kita).
  - **Egress**: 55 GB – 100 GB / bulan (Kita cuma butuh < 1 GB).
  - **Storage**: Berbasis Git repository.
- **Biaya**: **Rp 0**
- **Catatan**: 
  - **Koyeb**: Instance Always-on (tidak tidur).
  - **Render**: Tidur jika 15 menit idle (bangun butuh ~30-40 detik saat pertama dibuka).

---

### 🏅 OPSI 4: Oracle Cloud "Always Free" (VPS Penuh)
*Server Linux VPS mandiri gratis seumur hidup dari Oracle.*
- **Spesifikasi Gratis**:
  - **CPU**: 4 ARM vCPU / 2 AMD vCPU
  - **RAM**: Hingga 24 GB RAM
  - **Storage**: 200 GB SSD
  - **Egress**: 10 TB / bulan
- **Biaya**: **Rp 0**
- **Catatan**: Membutuhkan kartu kredit/debit untuk verifikasi akun awal ($1 hold temporer lalu di-refund).

---

## 4. Keamanan & Proteksi Saat Online

1. **Environment Mode (`MODE=production`)**:
   - Di server online, tombol `Sync Cache` dan `Rebuild Parquet` otomatis disembunyikan dan endpoint API-nya dinonaktifkan.
2. **Autentikasi Sederhana**:
   - Sebelum masuk ke dashboard, dapat dipasang halaman PIN / Password sederhana (misal 1 password bersama untuk internal manajemen) agar tidak bisa diintip sembarang orang di internet.
3. **Pemisahan Tim Sales**:
   - Tim sales lapangan tetap hanya diberikan link SCO Mobile di GitHub Pages (`https://depocell.github.io/SCO/`), sehingga mereka tidak bisa melihat laporan finansial pusat dan pivot global.

---

*Dokumen ini dibuat otomatis pada: 05 Oktober 2026 sebagai panduan roadmap sistem WEB REPORT.*
