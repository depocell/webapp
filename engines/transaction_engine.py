"""
transaction_engine.py
Membaca file transaksi Excel dari C:\\RAW DATA (ASTAGA & OKIPAY),
sheet GROSS, 10 kolom yang disepakati, lalu cache ke parquet.

Engine: openpyxl read_only=True + iter_rows() → cepat untuk file besar.

Kolom output (unified):
  trx_id, tgl_entry, product_id, qty, ar_id,
  modul_id, status, tgl_stat, beli, jual
"""

import os
import glob
import pandas as pd
import openpyxl
from datetime import datetime

# ─── Konfigurasi Path ────────────────────────────────────────────────────────
RAW_DATA_ROOT = r"C:\RAW DATA"
CACHE_DIR     = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache")

# ─── Mapping kolom per brand ─────────────────────────────────────────────────
BRAND_CONFIG = {
    "ASTAGA": {
        "subfolder": "ASTAGA",
        "col_map": {
            "TRX_ID":    "trx_id",
            "TGL.ENTRY": "tgl_entry",
            "PRODUCT_ID":"product_id",
            "QTY":       "qty",
            "AR_ID":     "ar_id",
            "MODUL_ID":  "modul_id",
            "STATUS":    "status",
            "TGL.STAT":  "tgl_stat",
            "BELI":      "beli",
            "JUAL":      "jual",
        },
    },
    "OKIPAY": {
        "subfolder": "OKIPAY",
        "col_map": {
            "TRX ID":       "trx_id",
            "TGL ENTRI":    "tgl_entry",
            "KODE PRODUK":  "product_id",
            "QTY":          "qty",
            "KODE RESELLER":"ar_id",
            "MODUL_ID":     "modul_id",
            "STAT":         "status",
            "TGL STAT":     "tgl_stat",
            "HARGA BELI":   "beli",
            "HARGA JUAL":   "jual",
        },
    },
}

UNIFIED_COLS = ["trx_id", "tgl_entry", "product_id", "qty",
                "ar_id", "modul_id", "status", "tgl_stat", "beli", "jual"]

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _cache_path(brand: str, year: str) -> str:
    return os.path.join(CACHE_DIR, f"trx_{brand.lower()}_{year}.parquet")


def _detect_sheet_name(xlsx_path: str, col_map: dict) -> str | None:
    """
    Deteksi nama sheet GROSS menggunakan openpyxl read_only (hanya baca 1 baris header).
    Cepat karena hanya parsing header, tidak membaca seluruh data.
    """
    wanted_upper = {k.upper() for k in col_map.keys()}
    try:
        wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            header = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), None)
            if not header:
                continue
            cols = {str(h).strip().upper() for h in header if h}
            # Sheet valid kalau mengandung TRX_ID atau TRX ID
            if "TRX_ID" in cols or "TRX ID" in cols:
                wb.close()
                return sheet_name
        wb.close()
    except Exception as e:
        print(f"  [WARN] Gagal deteksi sheet {os.path.basename(xlsx_path)}: {e}")
    return None


def _read_gross_fast(xlsx_path: str, col_map: dict) -> pd.DataFrame:
    """
    Hybrid: openpyxl read_only untuk deteksi sheet (1 header row saja),
    lalu calamine untuk baca data penuh — 7-8x lebih cepat dari openpyxl penuh.
    """
    # Step 1: Deteksi nama sheet
    target_sheet = _detect_sheet_name(xlsx_path, col_map)
    if target_sheet is None:
        print(f"  [SKIP] Sheet GROSS tidak ditemukan: {os.path.basename(xlsx_path)}")
        return pd.DataFrame()

    # Step 2: Baca data dengan calamine (Rust-based, jauh lebih cepat)
    src_cols = list(col_map.keys())
    try:
        df = pd.read_excel(
            xlsx_path,
            sheet_name=target_sheet,
            engine="calamine",
            usecols=src_cols,
        )
    except Exception as e:
        print(f"  [ERROR] calamine gagal baca {os.path.basename(xlsx_path)}: {e}")
        return pd.DataFrame()

    # Rename ke unified columns
    df.columns = [str(c).strip() for c in df.columns]
    df = df.rename(columns=col_map)

    # Pastikan semua unified columns ada
    for col in UNIFIED_COLS:
        if col not in df.columns:
            df[col] = None

    df = df[UNIFIED_COLS]

    # Buang baris kosong
    df = df.dropna(subset=["trx_id"])
    df = df[df["trx_id"].astype(str).str.strip().ne("")]

    return df


# ─── Public API ──────────────────────────────────────────────────────────────

def get_available_years(brand: str) -> list[str]:
    """Kembalikan list tahun yang tersedia di folder RAW DATA brand."""
    cfg  = BRAND_CONFIG[brand.upper()]
    base = os.path.join(RAW_DATA_ROOT, cfg["subfolder"])
    if not os.path.isdir(base):
        return []
    years = [
        d for d in os.listdir(base)
        if os.path.isdir(os.path.join(base, d)) and d.isdigit() and len(d) == 4
    ]
    return sorted(years, reverse=True)


def _mini_cache_path(brand: str, year: str, xlsx_basename: str) -> str:
    """Path cache parquet per file bulanan, misal: .cache/parts/astaga_2026_0126.parquet"""
    parts_dir = os.path.join(CACHE_DIR, "parts")
    name = f"{brand.lower()}_{year}_{os.path.splitext(xlsx_basename)[0]}.parquet"
    return os.path.join(parts_dir, name)


def build_cache(brand: str, year: str, force: bool = False) -> dict:
    """
    Baca file Excel tahun tertentu → gabung → simpan ke parquet.
    INCREMENTAL: hanya baca ulang file yang berubah (mtime lebih baru dari mini-cache).
    """
    brand   = brand.upper()
    cfg     = BRAND_CONFIG[brand]
    col_map = cfg["col_map"]
    folder  = os.path.join(RAW_DATA_ROOT, cfg["subfolder"], year)
    out     = _cache_path(brand, year)

    if not os.path.isdir(folder):
        return {"success": False, "error": f"Folder tidak ditemukan: {folder}"}

    xlsx_files = sorted(glob.glob(os.path.join(folder, "*.xlsx")))
    xlsx_files = [f for f in xlsx_files
                  if "TEMPLATE" not in os.path.basename(f).upper()
                  and not os.path.basename(f).startswith("~$")]

    if not xlsx_files:
        return {"success": False, "error": f"Tidak ada file Excel di {folder}"}

    # Cek apakah SEMUA cache masih valid (combined + semua mini-cache)
    if not force and os.path.exists(out):
        cache_mtime = os.path.getmtime(out)
        if all(os.path.getmtime(f) <= cache_mtime for f in xlsx_files):
            row_count = pd.read_parquet(out).shape[0]
            return {
                "success": True, "cached": True,
                "brand": brand, "year": year, "rows": row_count,
                "message": "Cache masih valid, tidak perlu rebuild.",
            }

    # INCREMENTAL: cek per file, hanya baca yang berubah
    os.makedirs(os.path.join(CACHE_DIR, "parts"), exist_ok=True)
    frames = []
    files_read = 0
    files_cached = 0
    t_start = datetime.now()

    for f in xlsx_files:
        fname = os.path.basename(f)
        mini = _mini_cache_path(brand, year, fname)

        # Cek apakah mini-cache masih valid untuk file ini
        if not force and os.path.exists(mini) and os.path.getmtime(mini) >= os.path.getmtime(f):
            # Mini-cache valid → pakai langsung (instan)
            df = pd.read_parquet(mini)
            frames.append(df)
            files_cached += 1
            print(f"  [CACHE] {brand}/{year} -- {fname} -> {len(df):,} baris (instan)")
        else:
            # File baru/berubah → baca dari Excel
            size_mb = os.path.getsize(f) / (1024 * 1024)
            print(f"  [READ]  {brand}/{year} -- {fname} ({size_mb:.1f} MB)")
            t0 = datetime.now()
            df = _read_gross_fast(f, col_map)
            elapsed = (datetime.now() - t0).total_seconds()

            if not df.empty:
                df["_source_file"] = fname

                # Konversi tipe data per file (agar mini-cache sudah bersih)
                for col in ["tgl_entry", "tgl_stat"]:
                    if col in df.columns:
                        df[col] = pd.to_datetime(df[col], errors="coerce")
                for col in ["qty", "beli", "jual"]:
                    if col in df.columns:
                        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
                for col in ["ar_id", "product_id", "status", "modul_id"]:
                    if col in df.columns:
                        df[col] = df[col].astype(str).str.replace("\xa0", "", regex=False).str.strip()

                # Simpan mini-cache
                df.to_parquet(mini, index=False)
                frames.append(df)
                files_read += 1
                print(f"          -> {len(df):,} baris, {elapsed:.1f}s")
            else:
                files_read += 1
                print(f"          -> kosong, {elapsed:.1f}s")

    if not frames:
        return {"success": False, "error": "Tidak ada data berhasil dibaca."}

    combined = pd.concat(frames, ignore_index=True)

    # Pastikan tipe data konsisten di combined
    for col in ["tgl_entry", "tgl_stat"]:
        combined[col] = pd.to_datetime(combined[col], errors="coerce")
    for col in ["qty", "beli", "jual"]:
        combined[col] = pd.to_numeric(combined[col], errors="coerce").fillna(0)

    os.makedirs(CACHE_DIR, exist_ok=True)
    combined.to_parquet(out, index=False)

    total_sec = (datetime.now() - t_start).total_seconds()
    msg = (f"Incremental: {files_read} file dibaca, {files_cached} dari cache, "
           f"{len(combined):,} baris dalam {total_sec:.0f} detik.")
    print(f"  [OK] {msg}")
    return {
        "success": True, "cached": False,
        "brand": brand, "year": year,
        "rows": len(combined), "files_read": files_read,
        "files_cached": files_cached,
        "elapsed_sec": round(total_sec, 1),
        "message": msg,
    }


# ─── In-Memory RAM Cache (Instan < 0.001s) ──────────────────────────────────
_MEMORY_CACHE: dict = {}
_MEMORY_MTIME: dict = {}

def clear_memory_cache(brand: str = None, year: str = None):
    """Bersihkan cache memori jika cache di-rebuild."""
    global _MEMORY_CACHE, _MEMORY_MTIME
    if brand and year:
        _MEMORY_CACHE.pop((brand.upper(), str(year)), None)
        _MEMORY_MTIME.pop((brand.upper(), str(year)), None)
    else:
        _MEMORY_CACHE.clear()
        _MEMORY_MTIME.clear()


def load(brand: str, year: str) -> pd.DataFrame:
    """Load dari RAM jika valid, atau baca dari cache parquet. Auto-build jika file Excel lebih baru."""
    brand = brand.upper()
    year = str(year)
    key = (brand, year)
    path = _cache_path(brand, year)

    # 1. Cek apakah ada di RAM dan file parquet belum berubah
    if os.path.exists(path):
        mtime = os.path.getmtime(path)
        if key in _MEMORY_CACHE and _MEMORY_MTIME.get(key) == mtime:
            return _MEMORY_CACHE[key]

    # 2. Cek/build jika perlu
    result = build_cache(brand, year, force=False)
    if not result.get("success", False):
        if not os.path.exists(path):
            raise FileNotFoundError(result.get("error", "Gagal memuat cache"))

    # 3. Muat ke RAM & pre-hitung kolom pembantu (ym, is_sukses)
    df = pd.read_parquet(path)
    if "is_sukses" not in df.columns and "status" in df.columns:
        df["is_sukses"] = df["status"].astype(str).str.lower().str.contains("sukses", na=False)
    if "ym" not in df.columns and "tgl_entry" in df.columns:
        # Fast extraction (0.3s vs 28s)
        ym_int = df["tgl_entry"].dt.year * 100 + df["tgl_entry"].dt.month
        unique_ym = ym_int.dropna().unique()
        ym_map = {val: f"{int(val) // 100}-{int(val) % 100:02d}" for val in unique_ym}
        df["ym"] = ym_int.map(ym_map)

    _MEMORY_CACHE[key] = df
    _MEMORY_MTIME[key] = os.path.getmtime(path)
    return df


def get_status() -> dict:
    """Ringkasan status cache semua brand & tahun."""
    status = {}
    for brand in BRAND_CONFIG:
        status[brand] = {}
        try:
            years = get_available_years(brand)
        except Exception:
            years = []
        for year in years:
            path = _cache_path(brand, year)
            if os.path.exists(path):
                df = pd.read_parquet(path)
                status[brand][year] = {
                    "cached":  True,
                    "rows":    len(df),
                    "size_mb": round(os.path.getsize(path) / (1024 * 1024), 2),
                }
            else:
                status[brand][year] = {"cached": False, "rows": 0}
    return status
