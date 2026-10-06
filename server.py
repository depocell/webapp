"""
server.py — Entry point Web Report
Hanya berisi routing. Semua logic ada di engines/ dan pages/.
Jalankan: python server.py
"""

import os
import sys
import json
import uvicorn
from starlette.applications import Starlette
from starlette.responses import JSONResponse, HTMLResponse
from starlette.routing import Route, Mount
from starlette.staticfiles import StaticFiles

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

import engines.transaction_engine as trx_engine
import engines.overview_engine as overview_engine
import engines.daily_engine as daily_engine
import engines.pivot_engine as pivot_engine
import engines.sco_engine as sco_engine
import engines.reseller_engine as reseller_engine
import engines.agen_engine as agen_engine
import engines.fisik_engine as fisik_engine
import engines.system_engine as system_engine
import engines.analisa_engine as analisa_engine

PAGES_DIR = os.path.join(BASE_DIR, "pages")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

# ─── Routes ──────────────────────────────────────────────────────────────────

async def homepage(request):
    shell_path = os.path.join(TEMPLATES_DIR, "shell.html")
    if os.path.exists(shell_path):
        with open(shell_path, "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    return HTMLResponse("<h1>Web Report</h1><p>Shell belum ditemukan.</p>")


async def api_overview(request):
    """Data komputasi perbandingan Daily Transaksi Sukses per Cabang."""
    year = request.query_params.get("year", "2026")
    try:
        data = overview_engine.calculate_daily_growth(year=year)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_daily_periods(request):
    """Daftar periode yang tersedia untuk brand."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    periods = daily_engine.get_available_periods(brand)
    return JSONResponse({"ok": True, "periods": periods})


async def api_daily(request):
    """Data komputasi lengkap Daily Summary Report."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    curr = request.query_params.get("curr")
    prev = request.query_params.get("prev")
    try:
        data = daily_engine.calculate_daily_report(brand=brand, curr_month=curr, prev_month=prev)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_pivot_options(request):
    """Opsi filter dan dimensi untuk Pivot Table (Channel / Product)."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    piv_type = request.query_params.get("type", "channel").lower()
    opts = pivot_engine.get_options(brand=brand, pivot_type=piv_type)
    return JSONResponse({"ok": True, "data": opts})


async def api_pivot_query(request):
    """Kalkulasi agregasi Pivot Table Dinamis (Channel / Product)."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    row_dim = request.query_params.get("row", "cabang")
    col_dim = request.query_params.get("col", "none")
    metric = request.query_params.get("metric", "trx_count")
    month_filter = request.query_params.get("month", "ALL")
    status_filter = request.query_params.get("status", "ALL")
    cabang_filter = request.query_params.get("cabang", "ALL")
    kategori_filter = request.query_params.get("kategori", "ALL")
    operator_filter = request.query_params.get("operator", "ALL")
    limit = int(request.query_params.get("limit", "100"))
    try:
        res = pivot_engine.execute_pivot(
            brand=brand,
            row_dim=row_dim,
            col_dim=col_dim,
            metric=metric,
            month_filter=month_filter,
            status_filter=status_filter,
            cabang_filter=cabang_filter,
            kategori_filter=kategori_filter,
            operator_filter=operator_filter,
            top_limit=limit
        )
        return JSONResponse({"ok": True, "data": res})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_status(request):
    """Ringkasan status cache semua brand & tahun."""
    try:
        status = trx_engine.get_status()
        years  = {}
        for brand in trx_engine.BRAND_CONFIG:
            try:
                years[brand] = trx_engine.get_available_years(brand)
            except Exception:
                years[brand] = []
        return JSONResponse({
            "ok": True,
            "cache_status": status,
            "available_years": years,
        })
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_trx_build(request):
    """Bangun / rebuild cache parquet transaksi."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    year  = request.query_params.get("year", "2026")
    force = request.query_params.get("force", "0") == "1"

    if brand not in trx_engine.BRAND_CONFIG:
        return JSONResponse({"ok": False, "error": f"Brand tidak dikenal: {brand}"}, status_code=400)

    result = trx_engine.build_cache(brand, year, force=force)
    result["ok"] = result.get("success", False)
    return JSONResponse(result)


async def api_trx_summary(request):
    """Ringkasan cepat data transaksi dari cache."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    year  = request.query_params.get("year", "2026")
    try:
        df = trx_engine.load(brand, year)
        sukses = df[df["status"].astype(str).str.lower().str.contains("sukses", na=False)]
        return JSONResponse({
            "ok":           True,
            "brand":        brand,
            "year":         year,
            "total_rows":   len(df),
            "sukses":       len(sukses),
            "total_jual":   round(sukses["jual"].sum(), 0),
            "total_beli":   round(sukses["beli"].sum(), 0),
            "margin":       round(sukses["jual"].sum() - sukses["beli"].sum(), 0),
            "status_breakdown": df["status"].value_counts().to_dict(),
        })
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_sco_generate(request):
    """Generate ulang data_sco.json dari cache transaksi Parquet."""
    try:
        import importlib
        importlib.reload(sco_engine)
        res = sco_engine.generate_sco_data()
        return JSONResponse(res)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_sco_push(request):
    """Push folder pages/sco ke GitHub Pages (https://github.com/depocell/SCO)."""
    try:
        import importlib
        importlib.reload(sco_engine)
        res = sco_engine.push_to_github()
        return JSONResponse(res)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_sco_check(request):
    """Auto-check: jika data_sco.json stale → regenerate otomatis, else langsung ok."""
    try:
        import importlib
        importlib.reload(sco_engine)
        stale = sco_engine.is_stale()
        if not stale:
            return JSONResponse({"ok": True, "stale": False, "message": "Data SCO sudah up-to-date."})
        # Stale → auto regenerate
        res = sco_engine.generate_sco_data()
        res["stale"] = True
        res["message"] = "Data SCO otomatis diperbarui."
        return JSONResponse(res)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_reseller(request):
    """Data komputasi profil & analisa customer/reseller ASTAGA."""
    month = request.query_params.get("month")
    year = request.query_params.get("year", "2026")
    try:
        data = reseller_engine.calculate_reseller_dashboard(month_code=month, year=year)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_agen(request):
    """Data komputasi profil & analisa Level Agen Induk ASTAGA (Rollup Reseller)."""
    month = request.query_params.get("month")
    year = request.query_params.get("year", "2026")
    try:
        data = agen_engine.calculate_agen_dashboard(month_code=month, year=year)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_fisik(request):
    """Data laporan penjualan produk fisik & sales DSO dari rekapan SISCOM (.ttx)."""
    period = request.query_params.get("period")
    cabang = request.query_params.get("cabang", "ALL")
    channel = request.query_params.get("channel", "ALL")
    try:
        data = fisik_engine.get_fisik_dashboard(
            period_code=period,
            cabang_filter=cabang,
            channel_filter=channel
        )
        return JSONResponse(data)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_system_info(request):
    """Informasi sistem, status cut-off data transaksi & audit kesehatan master file."""
    year = request.query_params.get("year", "2026")
    try:
        data = system_engine.get_system_overview(year=year)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_analisa_data(request):
    """Data analitikal bulanan multi-tahun (2023 s/d 2026) untuk Dashboard Analisa (Chart Only)."""
    brand = request.query_params.get("brand", "ALL")
    year = request.query_params.get("year", "ALL")
    month = request.query_params.get("month", "ALL")
    try:
        data = analisa_engine.query_analisa_data(brand=brand, year=year, month=month)
        return JSONResponse(data)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# ─── Routing ─────────────────────────────────────────────────────────────────

routes = [
    Route("/",                  homepage),
    Route("/api/overview",      api_overview),
    Route("/api/daily/periods", api_daily_periods),
    Route("/api/daily",         api_daily),
    Route("/api/pivot/options", api_pivot_options),
    Route("/api/pivot/query",   api_pivot_query),
    Route("/api/reseller",      api_reseller),
    Route("/api/agen",          api_agen),
    Route("/api/fisik",         api_fisik),
    Route("/api/system/info",   api_system_info),
    Route("/api/analisa/data",  api_analisa_data),
    Route("/api/sco/generate",  api_sco_generate, methods=["GET", "POST"]),
    Route("/api/sco/push",      api_sco_push,     methods=["GET", "POST"]),
    Route("/api/sco/check",     api_sco_check,    methods=["GET", "POST"]),
    Route("/api/status",        api_status),
    Route("/api/trx/build",     api_trx_build,   methods=["GET", "POST"]),
    Route("/api/trx/summary",   api_trx_summary),
    Mount("/pages",             app=StaticFiles(directory=PAGES_DIR), name="pages"),
    Mount("/static",            app=StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static"),
]

app = Starlette(debug=True, routes=routes)

# ─── Prewarm ─────────────────────────────────────────────────────────────────

def _prewarm():
    """Pre-warm cache saat server boot (background thread): Parquet, RAM & Master."""
    import threading, time
    import engines.customer_engine as cust_engine
    import engines.product_engine as prod_engine
    import engines.reseller_engine as res_engine

    def run():
        time.sleep(1)
        print("[BOOT] Pre-warming cache transaksi & RAM 2026...")
        for brand in ["ASTAGA", "OKIPAY"]:
            # 1. Pastikan parquet valid
            trx_engine.build_cache(brand, "2026")
            # 2. Muat langsung ke RAM (_MEMORY_CACHE) dengan kolom ym & is_sukses
            trx_engine.load(brand, "2026")
            # 3. Preload master customer & produk
            cust_engine.get_ar_to_cabang(brand)
            prod_engine.get_product_map(brand)

        # 4. Preload reseller meta
        res_engine.load_master_meta()
        print("[BOOT] Pre-warm RAM & Master selesai! Engine siap sat-set.")

    threading.Thread(target=run, daemon=True).start()


if __name__ == "__main__":
    _prewarm()
    print("Server berjalan di http://localhost:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
