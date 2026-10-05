"""
product_engine.py
Membaca dan menyediakan mapping master produk dari MASTER/PRODUCT_*.xlsx
untuk ASTAGA dan OKIPAY dengan cache Parquet cepat.
"""

import os
import pandas as pd

BASE_DIR   = os.path.dirname(os.path.dirname(__file__))
MASTER_DIR = os.path.join(BASE_DIR, "MASTER")
CACHE_DIR  = os.path.join(BASE_DIR, ".cache")

PRODUCT_FILES = {
    "ASTAGA": os.path.join(MASTER_DIR, "PRODUCT_ASTAGA.xlsx"),
    "OKIPAY": os.path.join(MASTER_DIR, "PRODUCT_OKI.xlsx"),
}

_PROD_MAP: dict[str, dict] = {}


def get_product_map(brand: str) -> dict:
    """
    Kembalikan dict {product_id: {'kategori': ..., 'operator': ...}}
    """
    brand = brand.upper()
    if brand in _PROD_MAP:
        return _PROD_MAP[brand]

    path = PRODUCT_FILES.get(brand)
    if not path or not os.path.exists(path):
        return {}

    p_cache = os.path.join(CACHE_DIR, f"prod_{brand.lower()}.parquet")

    # Cek apakah cache parquet masih valid terhadap mtime Excel
    excel_mtime = os.path.getmtime(path)
    if os.path.exists(p_cache) and os.path.getmtime(p_cache) >= excel_mtime:
        try:
            df_cache = pd.read_parquet(p_cache)
            # Fast vectorized dict creation (<0.005s)
            pids = df_cache["product_id"].tolist()
            kats = df_cache["kategori"].tolist()
            ops  = df_cache["operator"].tolist()
            mapping = {p: {"kategori": k, "operator": o} for p, k, o in zip(pids, kats, ops)}
            _PROD_MAP[brand] = mapping
            return mapping
        except Exception:
            pass

    mapping = {}
    try:
        with pd.ExcelFile(path, engine="openpyxl") as xl:
            target_sheet = next((s for s in xl.sheet_names if "prod" in s.lower() or "sheet" in s.lower()), xl.sheet_names[0])
            df = pd.read_excel(xl, sheet_name=target_sheet)

        cols_map = {str(c).strip().lower(): str(c).strip() for c in df.columns}
        kode_col = cols_map.get("kode produk") or cols_map.get("kode product") or cols_map.get("product id") or cols_map.get("id produk")
        kat_col  = cols_map.get("kategori") or cols_map.get("category")
        op_col   = cols_map.get("operator") or cols_map.get("provider")

        rows_to_cache = []
        for _, r in df.iterrows():
            pid = str(r.get(kode_col, "")).replace("\xa0", "").strip().upper()
            if pid and pid != "NAN":
                kat = str(r.get(kat_col, "LAINNYA")).strip().upper()
                op  = str(r.get(op_col, "LAINNYA")).strip().upper()
                mapping[pid] = {
                    "kategori": kat,
                    "operator": op
                }
                rows_to_cache.append({
                    "product_id": pid,
                    "kategori": kat,
                    "operator": op
                })

        # Save parquet cache
        if rows_to_cache:
            os.makedirs(CACHE_DIR, exist_ok=True)
            pd.DataFrame(rows_to_cache).to_parquet(p_cache, index=False)

    except Exception as e:
        print(f"[ERROR] Gagal memuat master produk {brand}: {e}")

    _PROD_MAP[brand] = mapping
    return mapping


def clear_cache():
    _PROD_MAP.clear()
