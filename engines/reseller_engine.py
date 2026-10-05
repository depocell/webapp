"""
engines/reseller_engine.py
Engine Analisa Customer & Reseller khusus ASTAGA.
Mencakup:
1. Ringkasan & Profil Customer (Pencarian, Cabang, Status Limit, Jadwal, SCO)
2. Analisa Komposisi Produk & % EWALLET per Reseller (Monthly & Yearly)
3. Tracking Keaktifan Reseller: Aktif, Reseller Baru/Reaktivasi, Pasif/Churn vs Bulan Lalu
"""

import os
import json
import pandas as pd
import numpy as np
from typing import Dict, Any, List
import engines.transaction_engine as te
import engines.product_engine as pe

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, ".cache")
MASTER_DIR = os.path.join(BASE_DIR, "MASTER")
CUST_ASTAGA = os.path.join(MASTER_DIR, "CUSTOMER_ASTAGA.xlsx")


_RESELLER_META_CACHE = None
_AGEN_META_CACHE = None
_META_MTIME = 0


def load_master_meta():
    """Load profil master customer & reseller ASTAGA (cached in RAM & fast JSON)."""
    global _RESELLER_META_CACHE, _AGEN_META_CACHE, _META_MTIME
    mtime = os.path.getmtime(CUST_ASTAGA) if os.path.exists(CUST_ASTAGA) else 0
    if _RESELLER_META_CACHE is not None and _META_MTIME == mtime:
        return _RESELLER_META_CACHE, _AGEN_META_CACHE

    json_cache = os.path.join(CACHE_DIR, "reseller_meta_cache.json")
    if os.path.exists(json_cache) and os.path.getmtime(json_cache) >= mtime:
        try:
            with open(json_cache, "r", encoding="utf-8") as fp:
                cached_data = json.load(fp)
            _RESELLER_META_CACHE = cached_data["reseller"]
            _AGEN_META_CACHE = cached_data["agen"]
            _META_MTIME = mtime
            return _RESELLER_META_CACHE, _AGEN_META_CACHE
        except Exception:
            pass

    engine_choice = "calamine"
    try:
        xl = pd.ExcelFile(CUST_ASTAGA, engine="calamine")
    except Exception:
        xl = pd.ExcelFile(CUST_ASTAGA, engine="openpyxl")

    with xl:
        s_res = next((s for s in xl.sheet_names if "reseller" in s.lower()), "Reseller")
        df_r = pd.read_excel(xl, sheet_name=s_res)
        s_agen = "Mapping_Agen" if "Mapping_Agen" in xl.sheet_names else ("Agen" if "Agen" in xl.sheet_names else xl.sheet_names[0])
        df_a = pd.read_excel(xl, sheet_name=s_agen)

    for c in ["Kode Reseller", "Reseller Name", "Group", "Agen id", "Cabang"]:
        if c in df_r.columns:
            df_r[c] = df_r[c].fillna("").astype(str).str.replace("\xa0", " ").str.strip()

    for c in ["AGEN ID", "AGEN NAME", "CABANG", "SCO", "JADWAL", "LIMIT", "STATUS"]:
        if c in df_a.columns:
            df_a[c] = df_a[c].fillna("").astype(str).str.replace("\xa0", " ").str.strip()

    # Agen profiles
    agen_meta = {}
    for _, row in df_a.iterrows():
        aid = row["AGEN ID"]
        try:
            lim_val = float(row.get("LIMIT", 0))
        except Exception:
            lim_val = 0.0
        agen_meta[aid] = {
            "agen_name": row.get("AGEN NAME", aid),
            "cabang": row.get("CABANG", "UNKNOWN"),
            "sco": row.get("SCO", "-"),
            "jadwal": row.get("JADWAL", "-"),
            "limit": lim_val,
            "status": row.get("STATUS", "-")
        }

    # Reseller meta
    reseller_meta = {}
    for _, row in df_r.iterrows():
        rid = row["Kode Reseller"]
        aid = row.get("Agen id", "")
        am = agen_meta.get(aid, {})
        reseller_meta[rid] = {
            "kode": rid,
            "name": row.get("Reseller Name", rid),
            "group": row.get("Group", "-"),
            "cabang": row.get("Cabang", am.get("cabang", "UNKNOWN")),
            "agen_id": aid,
            "agen_name": am.get("agen_name", "-"),
            "sco": am.get("sco", "-"),
            "jadwal": am.get("jadwal", "-"),
            "limit": am.get("limit", 0.0),
            "status": am.get("status", "-")
        }

    _RESELLER_META_CACHE = reseller_meta
    _AGEN_META_CACHE = agen_meta
    _META_MTIME = mtime

    os.makedirs(CACHE_DIR, exist_ok=True)
    try:
        with open(json_cache, "w", encoding="utf-8") as fp:
            json.dump({"reseller": reseller_meta, "agen": agen_meta}, fp)
    except Exception:
        pass

    return reseller_meta, agen_meta


def calculate_reseller_dashboard(month_code: str = None, year: str = "2026") -> Dict[str, Any]:
    """
    Hitung statistik terpadu Customer & Reseller ASTAGA:
    - Metrik Keaktifan (Total, Aktif, Baru, Pasif/Churn)
    - Tabel Reseller dengan pencarian, filter status & cabang, serta % EWALLET
    """
    df = te.load("ASTAGA", year)
    reseller_meta, _ = load_master_meta()
    prod_map = pe.get_product_map("ASTAGA")

    # Sukses only & month tagging (cached on df)
    if "is_sukses" not in df.columns:
        df["is_sukses"] = df["status"].astype(str).str.lower().str.contains("sukses", na=False)
    if "ym" not in df.columns:
        df["ym"] = df["tgl_entry"].dt.strftime("%Y-%m")

    df_sukses = df[df["is_sukses"]]
    available_months = sorted([str(m) for m in df_sukses["ym"].dropna().unique().tolist() if str(m).startswith(str(year))])
    if not available_months:
        return {"ok": False, "error": "Tidak ada data transaksi"}

    if not month_code or month_code not in available_months:
        month_code = available_months[-1]

    idx = available_months.index(month_code)
    prev_month = available_months[idx - 1] if idx > 0 else None

    df_curr = df_sukses[df_sukses["ym"] == month_code]
    df_prev = df_sukses[df_sukses["ym"] == prev_month] if prev_month else pd.DataFrame()

    curr_resellers = set(df_curr["ar_id"].unique())
    prev_resellers = set(df_prev["ar_id"].unique()) if not df_prev.empty else set()

    retained_set = curr_resellers & prev_resellers
    new_set = curr_resellers - prev_resellers
    churn_set = prev_resellers - curr_resellers

    # Map Kategori Produk
    def map_category(pid):
        p_upper = str(pid).strip().upper()
        info = prod_map.get(p_upper)
        if info and info.get("kategori"):
            k = info["kategori"].strip().upper()
            if "EWALLET" in k: return "EWALLET"
            if "PPOB" in k: return "PPOB"
            if "TELCO" in k: return "TELCO"
            if "PLN" in k: return "TOKEN PLN"
            if "TRANSFER" in k: return "TRANSFER STOK"
            if "GAME" in k: return "VOUCHER GAME"
            return k
        return "LAINNYA"

    df_curr_copy = df_curr.copy()
    df_curr_copy["cat"] = df_curr_copy["product_id"].map(map_category)

    # Aggregasi per reseller di bulan berjalan secara vektorisasi super cepat (<0.1s)
    ct = pd.crosstab(df_curr_copy["ar_id"], df_curr_copy["cat"])
    for col in ["EWALLET", "TELCO", "PPOB", "TOKEN PLN"]:
        if col not in ct.columns:
            ct[col] = 0
    ct["total_trx"] = ct.sum(axis=1)
    ct = ct.rename(columns={
        "EWALLET": "ewallet_trx",
        "TELCO": "telco_trx",
        "PPOB": "ppob_trx",
        "TOKEN PLN": "token_trx"
    }).reset_index()
    agg_reseller = ct

    # Gabungkan dengan data master
    rows = []
    for _, r in agg_reseller.iterrows():
        rid = r["ar_id"]
        meta = reseller_meta.get(rid, {
            "name": rid,
            "group": "-",
            "cabang": "UNKNOWN",
            "agen_id": "-",
            "agen_name": "-",
            "sco": "-",
            "jadwal": "-",
            "limit": 0.0,
            "status": "-"
        })

        tot = int(r["total_trx"])
        ew = int(r["ewallet_trx"])
        pct_ew = round((ew / tot * 100), 1) if tot > 0 else 0.0

        activity_status = "Baru / Reaktivasi" if rid in new_set else "Aktif Rutin"

        rows.append({
            "kode": rid,
            "name": meta["name"],
            "group": meta["group"],
            "cabang": meta["cabang"],
            "agen_id": meta.get("agen_id", "-"),
            "agen_name": meta.get("agen_name", "-"),
            "sco": meta["sco"],
            "jadwal": meta["jadwal"],
            "limit": meta["limit"],
            "total_trx": tot,
            "ewallet_trx": ew,
            "pct_ewallet": pct_ew,
            "telco_trx": int(r["telco_trx"]),
            "ppob_trx": int(r["ppob_trx"]),
            "token_trx": int(r["token_trx"]),
            "activity_status": activity_status
        })

    # Tambahkan reseller churned/pasif (yang ada di bulan lalu tapi 0 di bulan ini)
    churn_rows = []
    if prev_month:
        df_prev_counts = df_prev[df_prev["ar_id"].isin(churn_set)]["ar_id"].value_counts().to_dict()
        for cid in churn_set:
            meta = reseller_meta.get(cid, {
                "name": cid,
                "group": "-",
                "cabang": "UNKNOWN",
                "agen_id": "-",
                "agen_name": "-",
                "sco": "-",
                "jadwal": "-",
                "limit": 0.0
            })
            churn_rows.append({
                "kode": cid,
                "name": meta["name"],
                "group": meta["group"],
                "cabang": meta["cabang"],
                "agen_id": meta.get("agen_id", "-"),
                "agen_name": meta.get("agen_name", "-"),
                "sco": meta["sco"],
                "jadwal": meta["jadwal"],
                "limit": meta["limit"],
                "total_trx": 0,
                "prev_trx": int(df_prev_counts.get(cid, 0)),
                "activity_status": "Pasif / Churn"
            })

    rows.sort(key=lambda x: x["total_trx"], reverse=True)
    churn_rows.sort(key=lambda x: x["prev_trx"], reverse=True)

    # Cabang-cabang yang tersedia
    all_cabangs = sorted(list(set(r["cabang"] for r in rows if r["cabang"])))

    return {
        "ok": True,
        "selected_month": month_code,
        "prev_month": prev_month,
        "available_months": available_months,
        "kpi": {
            "total_registered": int(len(reseller_meta)),
            "active_current": int(len(curr_resellers)),
            "retained": int(len(retained_set)),
            "new_reactivated": int(len(new_set)),
            "churned": int(len(churn_set)),
            "total_trx": int(agg_reseller["total_trx"].sum()),
            "total_ewallet": int(agg_reseller["ewallet_trx"].sum()),
            "avg_pct_ewallet": float(round((agg_reseller["ewallet_trx"].sum() / agg_reseller["total_trx"].sum() * 100), 1)) if agg_reseller["total_trx"].sum() > 0 else 0.0
        },
        "all_cabangs": all_cabangs,
        "rows": rows,
        "churn_rows": churn_rows
    }
