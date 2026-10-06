"""
fisik_engine.py
Membaca dan memproses laporan rekapan penjualan SISCOM (file .ttx di pages/fisik/)
Menyediakan breakdown:
- Produk Fisik vs Deposit Saldo
- Breakdown per Cabang / Depo
- Breakdown per Channel / Sales (DSO, Sales Canvasser, Walk In, Transfer)
- Breakdown per Operator & Kategori Produk
- Ranking Produk Terlaris
"""

import os
import glob
import re
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
FISIK_DIR = os.path.join(BASE_DIR, "pages", "fisik")


def get_available_periods():
    """
    Daftar periode file .ttx yang ada di folder pages/fisik/
    Contoh: '0926.ttx' -> {'code': '0926', 'label': 'September 2026', 'file': '0926.ttx'}
    """
    files = glob.glob(os.path.join(FISIK_DIR, "*.ttx"))
    periods = []
    
    month_names = {
        "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
        "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
        "09": "September", "10": "Oktober", "11": "November", "12": "Desember"
    }

    for f in sorted(files, reverse=True):
        fname = os.path.basename(f)
        code = os.path.splitext(fname)[0]
        label = code
        if len(code) == 4 and code.isdigit():
            mm = code[:2]
            yy = "20" + code[2:]
            m_label = month_names.get(mm, f"Bulan {mm}")
            label = f"{m_label} {yy}"
        periods.append({
            "code": code,
            "label": label,
            "filename": fname
        })
    return periods


def _parse_num(val_str):
    try:
        return float(str(val_str).replace(",", "").strip())
    except Exception:
        return 0.0


def _detect_operator(prod_name):
    pn = prod_name.upper()
    if any(k in pn for k in ["ISAT", "INDOSAT", "IM3", "OREDOO", "MOBO"]):
        return "INDOSAT"
    if any(k in pn for k in ["SIMPATI", "TELKOMSEL", "AS "]):
        return "TELKOMSEL"
    if any(k in pn for k in ["AXIS", "AIGO"]):
        return "AXIS"
    if any(k in pn for k in ["XL"]):
        return "XL"
    if any(k in pn for k in ["THREE", "TRI"]):
        return "TRI"
    if any(k in pn for k in ["SMART", "SMARTFREN"]):
        return "SMARTFREN"
    if any(k in pn for k in ["GTECH", "MODEM"]):
        return "AKSESORIS"
    if "DEPOSIT" in pn:
        return "DEPOSIT/SALDO"
    return "LAINNYA"


def _detect_type(prod_name):
    pn = prod_name.upper()
    if "DEPOSIT" in pn:
        return "DEPOSIT"
    if pn.startswith("VOUCHER") or pn.startswith("V."):
        return "VOUCHER"
    if pn.startswith("PERDANA") or pn.startswith("P."):
        return "PERDANA"
    if any(k in pn for k in ["GTECH", "MODEM"]):
        return "HARDWARE"
    return "LAINNYA"


def load_fisik_data(period_code=None):
    """
    Parse file .ttx secara utuh ke list of record.
    """
    periods = get_available_periods()
    if not periods:
        return {"ok": False, "error": "Tidak ada file .ttx di folder pages/fisik"}

    if not period_code:
        period_code = periods[0]["code"]

    target_file = os.path.join(FISIK_DIR, f"{period_code}.ttx")
    if not os.path.exists(target_file):
        # Fallback file pertama
        target_file = os.path.join(FISIK_DIR, periods[0]["filename"])
        period_code = periods[0]["code"]

    with open(target_file, "rb") as f:
        content = f.read().replace(b"\x00", b"").decode("utf-8", errors="ignore")

    lines = [l.strip() for l in content.splitlines() if l.strip()]

    title = "Rekapitulasi Penjualan"
    date_range = ""
    cur_branch = "UNKNOWN"
    cur_channel = "UNKNOWN"
    
    rows = []

    for l in lines:
        if "REKAPITULASI" in l.upper():
            title = l.strip('" ')
            continue
        if re.search(r"\d{2}/\d{2}/\d{4}\s*-\s*\d{2}/\d{2}/\d{4}", l):
            date_range = l.strip('" ')
            continue
        if "Grand Total" in l:
            break

        parts = [p.strip().strip('"') for p in l.split("\t")]
        if not parts or len(parts) < 2:
            continue

        # Header Cabang (dimulai angka: 1, 2, 3...)
        if parts[0].isdigit() and len(parts) >= 3:
            cur_branch = parts[1]
            cur_channel = "UNKNOWN"
            continue

        p0 = parts[0]
        is_channel = any(k in p0 for k in ["WALK IN", "DSO", "SALES", "TRANSFER"])
        is_product_prefix = any(p0.startswith(k) for k in ["VOUCHER", "PERDANA", "P.", "V.", "GTECH", "MODEM", "DEPOSIT"])

        if is_channel and not is_product_prefix:
            cur_channel = p0
            continue

        # Baris Produk/Item
        prod_name = parts[1] if parts[0].isdigit() else parts[0]
        
        # TAKEOUT DEPOSIT: Abaikan mutlak semua transaksi deposit/saldo non-fisik
        if "DEPOSIT" in prod_name.upper():
            continue

        qty_str = parts[2] if parts[0].isdigit() else parts[1]
        gross_str = parts[3] if parts[0].isdigit() and len(parts) > 3 else (parts[2] if len(parts) > 2 else "0")
        diskon_str = parts[4] if len(parts) > 4 else "0"
        netto_str = parts[-1]

        qty = _parse_num(qty_str)
        gross = _parse_num(gross_str)
        diskon = _parse_num(diskon_str)
        netto = _parse_num(netto_str)

        op = _detect_operator(prod_name)
        tipe = _detect_type(prod_name)

        # Golongan Channel: SALES_LAPANGAN (DSO / SALES) vs TOKO (WALK IN) vs TRANSFER
        ch_upper = cur_channel.upper()
        if "DSO" in ch_upper or "SALES" in ch_upper:
            channel_group = "SALES_LAPANGAN"
        elif "WALK IN" in ch_upper:
            channel_group = "WALK_IN"
        elif "TRANSFER" in ch_upper:
            channel_group = "TRANSFER"
        else:
            channel_group = "LAINNYA"

        rows.append({
            "cabang": cur_branch,
            "channel": cur_channel,
            "channel_group": channel_group,
            "produk": prod_name,
            "operator": op,
            "tipe": tipe,
            "qty": qty,
            "gross": gross,
            "diskon": diskon,
            "netto": netto
        })

    return {
        "ok": True,
        "period_code": period_code,
        "available_periods": periods,
        "title": title,
        "date_range": date_range,
        "total_records": len(rows),
        "rows": rows
    }


def get_fisik_dashboard(period_code=None, channel_filter="ALL", cabang_filter="ALL"):
    """
    Kompilasi ringkasan dan tabel untuk Dashboard Produk Fisik & Sales DSO.
    Deposit sudah di-takeout mutlak.
    """
    raw = load_fisik_data(period_code)
    if not raw.get("ok"):
        return raw

    all_rows = raw["rows"]
    active_rows = all_rows

    # Filter Cabang
    if cabang_filter != "ALL":
        active_rows = [r for r in active_rows if r["cabang"] == cabang_filter]

    # Filter Channel
    if channel_filter != "ALL":
        active_rows = [r for r in active_rows if r["channel"] == channel_filter]

    # 1. KPI Metrik Utama (Fisik Murni)
    total_fisik_qty = sum(r["qty"] for r in active_rows)
    total_fisik_netto = sum(r["netto"] for r in active_rows)

    sales_rows = [r for r in active_rows if r["channel_group"] == "SALES_LAPANGAN"]
    sales_qty = sum(r["qty"] for r in sales_rows)
    sales_netto = sum(r["netto"] for r in sales_rows)

    walkin_rows = [r for r in active_rows if r["channel_group"] == "WALK_IN"]
    walkin_qty = sum(r["qty"] for r in walkin_rows)
    walkin_netto = sum(r["netto"] for r in walkin_rows)

    transfer_rows = [r for r in active_rows if r["channel_group"] == "TRANSFER"]
    transfer_qty = sum(r["qty"] for r in transfer_rows)
    transfer_netto = sum(r["netto"] for r in transfer_rows)

    # 2. Ringkasan per Channel / Sales Person
    by_channel = defaultdict(lambda: {"qty": 0.0, "netto": 0.0, "gross": 0.0, "items": 0, "cabang_list": set(), "group": ""})
    for r in active_rows:
        ch = r["channel"]
        by_channel[ch]["qty"] += r["qty"]
        by_channel[ch]["netto"] += r["netto"]
        by_channel[ch]["gross"] += r["gross"]
        by_channel[ch]["items"] += 1
        by_channel[ch]["cabang_list"].add(r["cabang"])
        by_channel[ch]["group"] = r["channel_group"]

    channel_list = []
    for ch, v in by_channel.items():
        channel_list.append({
            "channel": ch,
            "group": v["group"],
            "cabang": ", ".join(sorted(list(v["cabang_list"]))),
            "items": v["items"],
            "qty": v["qty"],
            "netto": v["netto"],
            "gross": v["gross"]
        })
    channel_list.sort(key=lambda x: x["netto"], reverse=True)

    # 3. Ringkasan per Cabang
    by_cabang = defaultdict(lambda: {"qty": 0.0, "netto": 0.0, "items": 0, "sales_qty": 0.0, "sales_netto": 0.0})
    for r in active_rows:
        cb = r["cabang"]
        by_cabang[cb]["qty"] += r["qty"]
        by_cabang[cb]["netto"] += r["netto"]
        by_cabang[cb]["items"] += 1
        if r["channel_group"] == "SALES_LAPANGAN":
            by_cabang[cb]["sales_qty"] += r["qty"]
            by_cabang[cb]["sales_netto"] += r["netto"]

    cabang_list = []
    for cb, v in by_cabang.items():
        cabang_list.append({
            "cabang": cb,
            "items": v["items"],
            "qty": v["qty"],
            "netto": v["netto"],
            "sales_qty": v["sales_qty"],
            "sales_netto": v["sales_netto"]
        })
    cabang_list.sort(key=lambda x: x["netto"], reverse=True)

    # 4. Ringkasan per Operator (Telco)
    by_operator = defaultdict(lambda: {"qty": 0.0, "netto": 0.0, "items": 0})
    for r in active_rows:
        op = r["operator"]
        by_operator[op]["qty"] += r["qty"]
        by_operator[op]["netto"] += r["netto"]
        by_operator[op]["items"] += 1

    operator_list = []
    for op, v in by_operator.items():
        operator_list.append({
            "operator": op,
            "items": v["items"],
            "qty": v["qty"],
            "netto": v["netto"]
        })
    operator_list.sort(key=lambda x: x["netto"], reverse=True)

    # 5. Ranking Produk Terlaris
    by_product = defaultdict(lambda: {"qty": 0.0, "netto": 0.0, "operator": "", "tipe": "", "channels": set()})
    for r in active_rows:
        p = r["produk"]
        by_product[p]["qty"] += r["qty"]
        by_product[p]["netto"] += r["netto"]
        by_product[p]["operator"] = r["operator"]
        by_product[p]["tipe"] = r["tipe"]
        by_product[p]["channels"].add(r["channel"])

    product_list = []
    for p, v in by_product.items():
        product_list.append({
            "produk": p,
            "operator": v["operator"],
            "tipe": v["tipe"],
            "qty": v["qty"],
            "netto": v["netto"],
            "channel_count": len(v["channels"])
        })
    product_list.sort(key=lambda x: x["netto"], reverse=True)

    # Opsi filter unik untuk UI
    unique_branches = sorted(list(set(r["cabang"] for r in all_rows)))
    unique_channels = sorted(list(set(r["channel"] for r in all_rows)))

    return {
        "ok": True,
        "period_code": raw["period_code"],
        "available_periods": raw["available_periods"],
        "date_range": raw["date_range"],
        "kpi": {
            "total_fisik_qty": total_fisik_qty,
            "total_fisik_netto": total_fisik_netto,
            "sales_qty": sales_qty,
            "sales_netto": sales_netto,
            "sales_ratio": round((sales_netto / total_fisik_netto * 100), 1) if total_fisik_netto > 0 else 0,
            "walkin_qty": walkin_qty,
            "walkin_netto": walkin_netto,
            "transfer_qty": transfer_qty,
            "transfer_netto": transfer_netto,
        },
        "filters": {
            "branches": unique_branches,
            "channels": unique_channels
        },
        "summary": {
            "channels": channel_list,
            "branches": cabang_list,
            "operators": operator_list,
            "top_products": product_list[:50]
        },
        "raw_rows": active_rows[:300]  # Berikan sampel raw data untuk inspeksi detail
    }
