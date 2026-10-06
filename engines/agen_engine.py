"""
engines/agen_engine.py
Engine Analisa Induk Agen khusus ASTAGA (Rollup / Agregasi Seluruh Reseller Anak).
Mencakup:
1. Agregasi Transaksi Rollup per Agen Induk (Akumulasi seluruh reseller anak)
2. Utilisasi Reseller: Berapa anak yang aktif transaksi vs total anak terdaftar di Agen
3. Profil Agen: SCO, DSO, Cabang, Jadwal Kunjungan, Plafon Limit Kredit, Status Toko
4. Tracking Keaktifan Agen: Aktif Rutin, Baru / Reaktivasi, Pasif / Churn vs Bulan Lalu
5. Breakdown Komposisi Produk (% EWALLET, TELCO, PPOB, TOKEN PLN)
"""

import os
import json
import pandas as pd
import numpy as np
from typing import Dict, Any, List
import engines.transaction_engine as te
import engines.product_engine as pe
import engines.reseller_engine as re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, ".cache")


def calculate_agen_dashboard(month_code: str = None, year: str = "2026") -> Dict[str, Any]:
    """
    Hitung statistik terpadu Level Induk Agen ASTAGA (Rollup / Agregasi Reseller):
    - Metrik Keaktifan Agen (Total, Aktif, Rutin, Baru, Churn)
    - Tabel Agen dengan utilisasi anak (% Reseller Aktif), limit, SCO, cabang, % EWALLET
    - Daftar reseller anak per agen untuk modal drilldown
    """
    df = te.load("ASTAGA", year)
    reseller_meta, agen_meta = re.load_master_meta()
    prod_map = pe.get_product_map("ASTAGA")

    # Sukses only & month tagging
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

    # Mapping Reseller ID -> Agen ID
    # Jika reseller tidak punya Agen id terdaftar, default Agen id = Reseller ID itu sendiri
    reseller_to_agen = {}
    for rid, rmeta in reseller_meta.items():
        aid = rmeta.get("agen_id")
        reseller_to_agen[rid] = aid if aid else rid

    # Mapping Agen -> Daftar Seluruh Reseller Anak yang terdaftar di master
    agen_children_registered = {}
    for rid, rmeta in reseller_meta.items():
        aid = reseller_to_agen.get(rid, rid)
        agen_children_registered.setdefault(aid, []).append({
            "kode": rid,
            "name": rmeta.get("name", rid),
            "group": rmeta.get("group", "-"),
            "cabang": rmeta.get("cabang", "-")
        })

    df_curr = df_sukses[df_sukses["ym"] == month_code].copy()
    df_prev = df_sukses[df_sukses["ym"] == prev_month].copy() if prev_month else pd.DataFrame()

    # Tag transaksi ke Agen ID
    df_curr["agen_id"] = df_curr["ar_id"].map(reseller_to_agen).fillna(df_curr["ar_id"])
    if not df_prev.empty:
        df_prev["agen_id"] = df_prev["ar_id"].map(reseller_to_agen).fillna(df_prev["ar_id"])

    curr_agens = set(df_curr["agen_id"].unique())
    prev_agens = set(df_prev["agen_id"].unique()) if not df_prev.empty else set()

    retained_set = curr_agens & prev_agens
    new_set = curr_agens - prev_agens
    churn_set = prev_agens - curr_agens

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

    df_curr["cat"] = df_curr["product_id"].map(map_category)

    # Agregasi cepat per agen_id
    ct = pd.crosstab(df_curr["agen_id"], df_curr["cat"])
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

    # Hitung keaktifan anak (jumlah reseller unik bertransaksi per agen)
    active_children_count = df_curr.groupby("agen_id")["ar_id"].nunique().to_dict()

    # Hitung detail transaksi per reseller anak untuk modal drilldown
    anak_trx_counts = df_curr.groupby(["agen_id", "ar_id"]).size().to_dict()

    rows = []
    for _, r in ct.iterrows():
        aid = r["agen_id"]
        ameta = agen_meta.get(aid, {
            "agen_name": aid,
            "cabang": "UNKNOWN",
            "sco": "-",
            "dso": "-",
            "jadwal": "-",
            "limit": 0.0,
            "status": "-"
        })

        tot = int(r["total_trx"])
        ew = int(r["ewallet_trx"])
        pct_ew = round((ew / tot * 100), 1) if tot > 0 else 0.0

        activity_status = "Baru / Reaktivasi" if aid in new_set else "Aktif Rutin"

        # Anak-anak reseller terdaftar
        reg_children = agen_children_registered.get(aid, [])
        total_child = len(reg_children)
        # Jika tidak terdaftar di sheet reseller, anggap agen bertransaksi sebagai 1 outlet
        if total_child == 0:
            total_child = 1

        active_child = int(active_children_count.get(aid, 0))
        pct_active_child = round((active_child / total_child * 100), 1) if total_child > 0 else 0.0

        # Siapkan list anak dengan transaksi bulan ini untuk modal drilldown
        children_list = []
        for c in reg_children:
            cid = c["kode"]
            c_trx = int(anak_trx_counts.get((aid, cid), 0))
            children_list.append({
                "kode": cid,
                "name": c["name"],
                "cabang": c.get("cabang", ameta.get("cabang", "-")),
                "trx_month": c_trx,
                "is_active": c_trx > 0
            })
        children_list.sort(key=lambda x: x["trx_month"], reverse=True)

        rows.append({
            "agen_id": aid,
            "agen_name": ameta["agen_name"],
            "cabang": ameta["cabang"],
            "sco": ameta["sco"],
            "dso": ameta.get("dso", "-"),
            "jadwal": ameta["jadwal"],
            "limit": ameta["limit"],
            "status": ameta["status"],
            "total_reseller": total_child,
            "active_reseller": active_child,
            "pct_active_reseller": pct_active_child,
            "total_trx": tot,
            "ewallet_trx": ew,
            "pct_ewallet": pct_ew,
            "telco_trx": int(r["telco_trx"]),
            "ppob_trx": int(r["ppob_trx"]),
            "token_trx": int(r["token_trx"]),
            "activity_status": activity_status,
            "children": children_list
        })

    # Tambahkan Agen Churned/Pasif (Bulan lalu bertransaksi, tapi bulan ini 0 transaksi)
    churn_rows = []
    if prev_month and not df_prev.empty:
        df_prev_counts = df_prev[df_prev["agen_id"].isin(churn_set)]["agen_id"].value_counts().to_dict()
        for cid in churn_set:
            ameta = agen_meta.get(cid, {
                "agen_name": cid,
                "cabang": "UNKNOWN",
                "sco": "-",
                "dso": "-",
                "jadwal": "-",
                "limit": 0.0,
                "status": "-"
            })
            reg_children = agen_children_registered.get(cid, [])
            total_child = len(reg_children) if len(reg_children) > 0 else 1

            churn_rows.append({
                "agen_id": cid,
                "agen_name": ameta["agen_name"],
                "cabang": ameta["cabang"],
                "sco": ameta["sco"],
                "dso": ameta.get("dso", "-"),
                "jadwal": ameta["jadwal"],
                "limit": ameta["limit"],
                "status": ameta["status"],
                "total_reseller": total_child,
                "active_reseller": 0,
                "pct_active_reseller": 0.0,
                "total_trx": 0,
                "prev_trx": int(df_prev_counts.get(cid, 0)),
                "activity_status": "Pasif / Churn",
                "children": []
            })

    rows.sort(key=lambda x: x["total_trx"], reverse=True)
    churn_rows.sort(key=lambda x: x["prev_trx"], reverse=True)

    all_cabangs = sorted(list(set(r["cabang"] for r in rows if r["cabang"] and r["cabang"] != "UNKNOWN")))

    tot_trx_all = int(ct["total_trx"].sum()) if not ct.empty else 0
    tot_ew_all = int(ct["ewallet_trx"].sum()) if not ct.empty else 0
    avg_ew = float(round((tot_ew_all / tot_trx_all * 100), 1)) if tot_trx_all > 0 else 0.0

    return {
        "ok": True,
        "selected_month": month_code,
        "prev_month": prev_month,
        "available_months": available_months,
        "kpi": {
            "total_registered": int(len(agen_meta)),
            "active_current": int(len(curr_agens)),
            "retained": int(len(retained_set)),
            "new_reactivated": int(len(new_set)),
            "churned": int(len(churn_set)),
            "total_trx": tot_trx_all,
            "total_ewallet": tot_ew_all,
            "avg_pct_ewallet": avg_ew
        },
        "all_cabangs": all_cabangs,
        "rows": rows,
        "churn_rows": churn_rows
    }
