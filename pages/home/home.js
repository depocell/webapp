// home.js — Logika tampilan Overview Dashboard

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return Number(Math.round(num)).toLocaleString("id-ID", {
    maximumFractionDigits: 0
  });
}

function formatGrowthVal(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  const r = Math.round(num);
  const prefix = r > 0 ? "+" : "";
  return prefix + formatNumber(r);
}

function formatGrowthPct(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return "0.0%";
  const prefix = pct > 0 ? "+" : "";
  return `${prefix}${Number(pct).toFixed(1)}%`;
}

function renderTable(brandKey, data) {
  const tbody = document.getElementById(`tbody-${brandKey.toLowerCase()}`);
  const meta = document.getElementById(`meta-${brandKey.toLowerCase()}`);

  if (!tbody) return;

  if (!data) {
    tbody.innerHTML = `<tr><td colspan="5" class="loader">Data tidak tersedia</td></tr>`;
    return;
  }

  if (meta) {
    meta.textContent = `${data.curr_month} (${data.days_curr} hari) vs ${data.prev_month} (${data.days_prev} hari)`;
  }

  let html = "";
  data.rows.forEach(row => {
    const isPos = row.growth_val >= 0;
    const pillClass = isPos ? "positive" : "negative";

    html += `
      <tr>
        <td class="font-semibold">${row.cabang}</td>
        <td class="text-right">${formatNumber(row.daily_curr)}</td>
        <td class="text-right">${formatNumber(row.daily_prev)}</td>
        <td class="text-right">
          <span class="pill ${pillClass}">${formatGrowthVal(row.growth_val)}</span>
        </td>
        <td class="text-right">
          <span class="pill ${pillClass}">${formatGrowthPct(row.growth_pct)}</span>
        </td>
      </tr>
    `;
  });

  if (data.total) {
    const tot = data.total;
    const isTotPos = tot.growth_val >= 0;
    const totPillClass = isTotPos ? "positive" : "negative";

    html += `
      <tr class="total-row">
        <td>${tot.cabang}</td>
        <td class="text-right">${formatNumber(tot.daily_curr)}</td>
        <td class="text-right">${formatNumber(tot.daily_prev)}</td>
        <td class="text-right">
          <span class="pill ${totPillClass}">${formatGrowthVal(tot.growth_val)}</span>
        </td>
        <td class="text-right">
          <span class="pill ${totPillClass}">${formatGrowthPct(tot.growth_pct)}</span>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

async function loadOverview() {
  const tbodyAstaga = document.getElementById("tbody-astaga");
  const tbodyOkipay = document.getElementById("tbody-okipay");

  if (tbodyAstaga) tbodyAstaga.innerHTML = `<tr><td colspan="5" class="loader">Memuat data ASTAGA...</td></tr>`;
  if (tbodyOkipay) tbodyOkipay.innerHTML = `<tr><td colspan="5" class="loader">Memuat data OKIPAY...</td></tr>`;

  try {
    const res = await fetch("/api/overview");
    if (!res.ok) throw new Error("Gagal mengambil data dari server");
    const json = await res.json();

    if (json.ok && json.data) {
      renderTable("astaga", json.data.brands["ASTAGA"]);
      renderTable("okipay", json.data.brands["OKIPAY"]);

      const now = new Date();
      const updatedEl = document.getElementById("last-updated");
      if (updatedEl) {
        updatedEl.textContent = `Tahun ${json.data.year} • Diperbarui ${now.toLocaleTimeString("id-ID")}`;
      }

      // Render informasi kode baru / unmapped jika ada
      if (json.data.unmapped) {
        renderUnmappedAudit(json.data.unmapped);
      }
    } else {
      throw new Error(json.error || "Format respon tidak valid");
    }
  } catch (err) {
    console.error(err);
    if (tbodyAstaga) {
      tbodyAstaga.innerHTML = `<tr><td colspan="5" class="loader text-negative">Error: ${err.message}</td></tr>`;
    }
    if (tbodyOkipay) {
      tbodyOkipay.innerHTML = `<tr><td colspan="5" class="loader text-negative">Error: ${err.message}</td></tr>`;
    }
  }
}

function renderUnmappedAudit(unmappedData) {
  const section = document.getElementById("unmapped-audit-section");
  const totalBadge = document.getElementById("unmapped-total-badge");
  if (!section) return;

  let totalMissing = 0;

  ["astaga", "okipay"].forEach(brandLower => {
    const brandKey = brandLower.toUpperCase();
    const data = unmappedData[brandKey] || { resellers: [], products: [] };
    const rCount = data.resellers_count || 0;
    const pCount = data.products_count || 0;
    const brandTotal = rCount + pCount;
    totalMissing += brandTotal;

    const brandBadge = document.getElementById(`${brandLower}-unmapped-badge`);
    const brandList = document.getElementById(`${brandLower}-unmapped-list`);

    if (brandBadge) {
      brandBadge.textContent = `${brandTotal} item baru`;
      brandBadge.style.background = brandTotal > 0 ? "#fef3c7" : "#dcfce7";
      brandBadge.style.color = brandTotal > 0 ? "#b45309" : "#15803d";
      brandBadge.style.border = brandTotal > 0 ? "1px solid #fde68a" : "1px solid #bbf7d0";
    }

    if (brandList) {
      if (brandTotal === 0) {
        brandList.innerHTML = `<span style="color: #16a34a;">✅ Semua kode reseller & produk sudah terdaftar di Master.</span>`;
      } else {
        let html = "";
        
        if (rCount > 0) {
          html += `<div style="margin-bottom: 8px;">
            <div style="font-weight: 600; color: #b45309; margin-bottom: 4px;">👤 Kode Reseller Belum Ada di Master Customer (${rCount}):</div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">`;
          data.resellers.forEach(item => {
            html += `<span style="background: var(--surface); border: 1px solid var(--surface-border); border-radius: 4px; padding: 2px 7px; font-family: monospace; font-size: 11.5px;">
              <strong>${item.code}</strong> <span style="color: var(--text-muted); font-size: 10px;">(${item.trx_count} trx)</span>
            </span>`;
          });
          html += `</div></div>`;
        }

        if (pCount > 0) {
          html += `<div>
            <div style="font-weight: 600; color: #b45309; margin-bottom: 4px;">📦 Kode Produk Belum Ada di Master Produk (${pCount}):</div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">`;
          data.products.forEach(item => {
            html += `<span style="background: var(--surface); border: 1px solid var(--surface-border); border-radius: 4px; padding: 2px 7px; font-family: monospace; font-size: 11.5px;">
              <strong>${item.code}</strong> <span style="color: var(--text-muted); font-size: 10px;">(${item.trx_count} trx)</span>
            </span>`;
          });
          html += `</div></div>`;
        }

        brandList.innerHTML = html;
      }
    }
  });

  if (totalBadge) {
    totalBadge.textContent = `${totalMissing} Item Belum Ada di Master`;
  }

  // Tampilkan section jika ada item yang missing
  section.style.display = totalMissing > 0 ? "block" : "none";
}

// Export global function
window.loadOverview = loadOverview;

