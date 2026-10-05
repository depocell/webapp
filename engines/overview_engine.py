"""
overview_engine.py
Menghitung perbandingan performa Daily Transaksi Sukses per Cabang/Channel:
Bulan Berjalan vs Bulan Lalu untuk ASTAGA & OKIPAY.

Definisi:
  Daily = Total Sukses / Distinct Count Hari Aktif
  Growth (+/-) = Daily Bln Ini - Daily Bln Lalu
  Growth % = ((Daily Bln Ini - Daily Bln Lalu) / Daily Bln Lalu) * 100
"""

import pandas as pd
from typing import Dict, Any, List
import engines.transaction_engine as te
import engines.customer_engine as ce

def calculate_daily_growth(year: str = "2026") -> Dict[str, Any]:
    """
    Menghitung tabel perbandingan Daily Trx Sukses per Cabang
    untuk ASTAGA dan OKIPAY.
    """
    result = {
        "year": year,
        "brands": {}
    }

    for brand in ["ASTAGA", "OKIPAY"]:
        df = te.load(brand, year)
        cabang_map = ce.get_ar_to_cabang(brand)

        if "is_sukses" not in df.columns:
            df["is_sukses"] = df["status"].astype(str).str.lower().str.contains("sukses", na=False)
        if "ym" not in df.columns:
            df["ym"] = df["tgl_entry"].dt.strftime("%Y-%m")

        df_sukses = df[df["is_sukses"]]

        # Urutkan bulan yang tersedia
        available_months = sorted([str(m) for m in df_sukses["ym"].dropna().unique().tolist() if str(m).startswith(str(year))])
        if len(available_months) >= 2:
            curr_ym = available_months[-1]
            prev_ym = available_months[-2]
        elif len(available_months) == 1:
            curr_ym = available_months[0]
            prev_ym = available_months[0]
        else:
            curr_ym = ""
            prev_ym = ""

        df_curr = df_sukses[df_sukses["ym"] == curr_ym].copy()
        df_prev = df_sukses[df_sukses["ym"] == prev_ym].copy()

        # Map cabang HANYA pada 2 bulan berjalan (10x lebih cepat)
        df_curr["cabang"] = df_curr["ar_id"].astype(str).map(cabang_map).fillna("UNKNOWN")
        df_prev["cabang"] = df_prev["ar_id"].astype(str).map(cabang_map).fillna("UNKNOWN")

        days_curr = max(int(df_curr["tgl_entry"].dt.day.nunique()), 1)
        days_prev = max(int(df_prev["tgl_entry"].dt.day.nunique()), 1)

        grp_curr = df_curr.groupby("cabang")["trx_id"].count()
        grp_prev = df_prev.groupby("cabang")["trx_id"].count()

        all_cabangs = sorted(list(set(grp_curr.index).union(set(grp_prev.index))))
        # Jangan taruh UNKNOWN di atas jika ada
        if "UNKNOWN" in all_cabangs:
            all_cabangs.remove("UNKNOWN")
            all_cabangs.append("UNKNOWN")

        rows: List[Dict[str, Any]] = []
        tot_c_count = 0
        tot_p_count = 0

        for c in all_cabangs:
            c_cnt = int(grp_curr.get(c, 0))
            p_cnt = int(grp_prev.get(c, 0))
            tot_c_count += c_cnt
            tot_p_count += p_cnt

            d_curr = c_cnt / days_curr
            d_prev = p_cnt / days_prev
            diff = d_curr - d_prev
            pct = (diff / d_prev * 100) if d_prev > 0 else 0.0

            rows.append({
                "cabang": c,
                "total_curr": c_cnt,
                "total_prev": p_cnt,
                "daily_curr": round(d_curr, 2),
                "daily_prev": round(d_prev, 2),
                "growth_val": round(diff, 2),
                "growth_pct": round(pct, 2)
            })

        tot_d_curr = tot_c_count / days_curr
        tot_d_prev = tot_p_count / days_prev
        tot_diff = tot_d_curr - tot_d_prev
        tot_pct = (tot_diff / tot_d_prev * 100) if tot_d_prev > 0 else 0.0

        total_row = {
            "cabang": "TOTAL",
            "total_curr": tot_c_count,
            "total_prev": tot_p_count,
            "daily_curr": round(tot_d_curr, 2),
            "daily_prev": round(tot_d_prev, 2),
            "growth_val": round(tot_diff, 2),
            "growth_pct": round(tot_pct, 2)
        }

        result["brands"][brand] = {
            "curr_month": curr_ym,
            "prev_month": prev_ym,
            "days_curr": days_curr,
            "days_prev": days_prev,
            "rows": rows,
            "total": total_row
        }

    # Cek kode reseller & kode produk yang belum ada di master
    result["unmapped"] = check_unmapped_entities(year=year)

    return result


_UNMAPPED_CACHE: Dict[str, Any] = {}
_UNMAPPED_TIME: float = 0.0

def check_unmapped_entities(year: str = "2026", force: bool = False) -> Dict[str, Any]:
    """
    Mendeteksi kode reseller (ar_id) atau kode produk (product_id) pada transaksi
    yang belum terdaftar di Master Customer atau Master Produk (di-cache di RAM).
    """
    global _UNMAPPED_CACHE, _UNMAPPED_TIME
    import time
    import engines.product_engine as pe

    now = time.time()
    if not force and year in _UNMAPPED_CACHE and (now - _UNMAPPED_TIME) < 300:
        return _UNMAPPED_CACHE[year]

    unmapped_summary = {}

    for brand in ["ASTAGA", "OKIPAY"]:
        df = te.load(brand, year)
        cust_map = ce.get_ar_to_cabang(brand)
        prod_map = pe.get_product_map(brand)

        # Reseller
        trx_ar = set(df["ar_id"].dropna().unique())
        master_ar = set(cust_map.keys())
        missing_ar = sorted(list(trx_ar - master_ar))

        # Produk
        trx_prod = set(df["product_id"].dropna().unique())
        master_prod = set(prod_map.keys())
        missing_prod = sorted(list(trx_prod - master_prod))

        # Hitung frekuensi secara vektorisasi instan (<0.05s)
        missing_ar_details = []
        if missing_ar:
            ar_vc = df["ar_id"].value_counts()
            for ar_code in missing_ar:
                cnt = int(ar_vc.get(ar_code, 0))
                if cnt > 0:
                    missing_ar_details.append({
                        "code": str(ar_code),
                        "trx_count": cnt
                    })
            missing_ar_details.sort(key=lambda x: x["trx_count"], reverse=True)

        missing_prod_details = []
        if missing_prod:
            prod_vc = df["product_id"].value_counts()
            for p_code in missing_prod:
                cnt = int(prod_vc.get(p_code, 0))
                if cnt > 0:
                    missing_prod_details.append({
                        "code": str(p_code),
                        "trx_count": cnt
                    })
            missing_prod_details.sort(key=lambda x: x["trx_count"], reverse=True)

        unmapped_summary[brand] = {
            "resellers": missing_ar_details,
            "resellers_count": len(missing_ar_details),
            "products": missing_prod_details,
            "products_count": len(missing_prod_details),
        }

    _UNMAPPED_CACHE[year] = unmapped_summary
    _UNMAPPED_TIME = now
    return unmapped_summary

