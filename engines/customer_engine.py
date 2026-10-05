"""
customer_engine.py
Load dan cache master customer (Agen & Reseller) dari MASTER/*.xlsx.
Menyediakan mapping: ar_id -> cabang untuk kedua brand.
"""

import os
import pandas as pd

BASE_DIR    = os.path.dirname(os.path.dirname(__file__))
MASTER_DIR  = os.path.join(BASE_DIR, "MASTER")
CACHE_DIR   = os.path.join(BASE_DIR, ".cache")

MASTER_FILES = {
    "ASTAGA": os.path.join(MASTER_DIR, "CUSTOMER_ASTAGA.xlsx"),
    "OKIPAY": os.path.join(MASTER_DIR, "CUSTOMER_OKI.xlsx"),
}

# In-memory cache
_CABANG_MAP: dict[str, dict] = {}
_CABANG_MTIME: dict[str, float] = {}


def _load_reseller_sheet(brand: str) -> pd.DataFrame:
    """Baca sheet Reseller dari CUSTOMER master, return df dengan Kode Reseller & Cabang (cached via Parquet)."""
    path = MASTER_FILES[brand]
    p_cache = os.path.join(CACHE_DIR, f"cust_{brand.lower()}.parquet")
    mtime = os.path.getmtime(path) if os.path.exists(path) else 0

    if os.path.exists(p_cache) and os.path.getmtime(p_cache) >= mtime:
        try:
            return pd.read_parquet(p_cache)
        except Exception:
            pass

    # Baca via calamine / openpyxl
    df_r = pd.DataFrame()
    df_a = pd.DataFrame()
    engine_list = ["calamine", "openpyxl"]
    
    for eng in engine_list:
        try:
            with pd.ExcelFile(path, engine=eng) as wb:
                s_res = next((s for s in wb.sheet_names if "reseller" in s.lower()), None)
                s_agen = next((s for s in wb.sheet_names if "agen" in s.lower()), None)
                if s_res:
                    df_r = pd.read_excel(wb, sheet_name=s_res)
                if s_agen:
                    df_a = pd.read_excel(wb, sheet_name=s_agen)
            if not df_r.empty:
                break
        except Exception:
            continue

    if df_r.empty:
        return pd.DataFrame(columns=["ar_id", "cabang"])

    df_r.columns = [str(c).strip() for c in df_r.columns]
    if not df_a.empty:
        df_a.columns = [str(c).strip() for c in df_a.columns]

    # Kode Reseller = AR_ID transaksi
    kode_col = next((c for c in df_r.columns if "kode reseller" in c.lower() or c.lower() in ("kode reseller", "kode_reseller")), None)
    cabang_col = next((c for c in df_r.columns if c.lower() == "cabang"), None)
    agen_id_col = next((c for c in df_r.columns if "agen id" in c.lower() or "agen_id" in c.lower()), None)

    if not kode_col:
        return pd.DataFrame(columns=["ar_id", "cabang"])

    # Buat mapping Agen ID -> CABANG dari sheet Agen
    agen_to_cabang = {}
    if not df_a.empty:
        a_id_col = next((c for c in df_a.columns if "agen id" in c.lower() or "agen_id" in c.lower()), None)
        a_cab_col = next((c for c in df_a.columns if c.lower() == "cabang"), None)
        if a_id_col and a_cab_col:
            clean_aids = df_a[a_id_col].fillna("").astype(str).str.strip().str.replace("\xa0", "", regex=False).str.upper()
            clean_acabs = df_a[a_cab_col].fillna("").astype(str).str.strip().str.replace("\xa0", "", regex=False)
            agen_to_cabang = dict(zip(clean_aids, clean_acabs))

    df_r["_ar_id"] = df_r[kode_col].fillna("").astype(str).str.strip().str.replace("\xa0", "", regex=False).str.upper()
    
    # Ambil cabang dari Reseller jika ada, atau fallback ke mapping Agen ID
    if cabang_col:
        cabang_series = df_r[cabang_col].fillna("").astype(str).str.strip().str.replace("\xa0", "", regex=False)
    else:
        cabang_series = pd.Series([""] * len(df_r))

    if agen_id_col and agen_to_cabang:
        r_aids = df_r[agen_id_col].fillna("").astype(str).str.strip().str.replace("\xa0", "", regex=False).str.upper()
        mapped_cabang = r_aids.map(agen_to_cabang).fillna("")
        cabang_series = cabang_series.where(cabang_series.ne(""), mapped_cabang)

    result = pd.DataFrame({
        "ar_id": df_r["_ar_id"],
        "cabang": cabang_series
    })
    result = result[result["ar_id"].ne("")]
    result = result.drop_duplicates("ar_id")

    os.makedirs(CACHE_DIR, exist_ok=True)
    try:
        result.to_parquet(p_cache, index=False)
    except Exception:
        pass

    return result


def get_ar_to_cabang(brand: str) -> dict:
    """
    Kembalikan dict {ar_id: cabang} untuk brand tertentu.
    Di-cache di memory — auto reload jika file master diupdate.
    """
    brand = brand.upper()
    path = MASTER_FILES.get(brand, "")
    current_mtime = os.path.getmtime(path) if os.path.exists(path) else 0

    if brand not in _CABANG_MAP or _CABANG_MTIME.get(brand, 0) < current_mtime:
        df = _load_reseller_sheet(brand)
        _CABANG_MAP[brand] = dict(zip(df["ar_id"], df["cabang"]))
        _CABANG_MTIME[brand] = current_mtime
    return _CABANG_MAP[brand]


def clear_cache():
    """Reset in-memory cache (pakai setelah master diupdate)."""
    _CABANG_MAP.clear()


def get_cabang_list(brand: str) -> list[str]:
    """Daftar cabang unik untuk brand, diurutkan alfabetis."""
    mapping = get_ar_to_cabang(brand)
    return sorted(set(v for v in mapping.values() if v and v.lower() not in ("nan", "")))
