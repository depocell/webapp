// transaksi.js — Controller untuk Pivot Table by Channel & Pivot Table by Product

let pivotBrand = "ASTAGA";
let pivotSubPage = "channel";
let lastPivotData = null;

function formatMoney(num) {
  if (num === null || num === undefined || isNaN(num)) return "Rp 0";
  return "Rp " + Number(num).toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function formatInt(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return Number(num).toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function switchPivotSubPage(sub) {
  pivotSubPage = sub;

  const btnChan = document.getElementById("tab-piv-channel");
  const btnProd = document.getElementById("tab-piv-product");
  const titleEl = document.getElementById("piv-main-title");
  const descEl  = document.getElementById("piv-main-desc");
  const boxKat  = document.getElementById("piv-box-kategori");
  const boxOp   = document.getElementById("piv-box-operator");

  if (sub === "product") {
    if (btnChan) btnChan.className = "subpage-tab";
    if (btnProd) btnProd.className = "subpage-tab active-subpage-tab";
    if (titleEl) titleEl.textContent = "Pivot Table by Product";
    if (descEl) descEl.textContent = "Analisis multidimensi fleksibel transaksi berdasarkan Kategori Produk, Operator, Paket, dan Suplier";
    if (boxKat) boxKat.style.display = "block";
    if (boxOp) boxOp.style.display = "block";
  } else {
    if (btnChan) btnChan.className = "subpage-tab active-subpage-tab";
    if (btnProd) btnProd.className = "subpage-tab";
    if (titleEl) titleEl.textContent = "Pivot Table by Channel";
    if (descEl) descEl.textContent = "Analisis multidimensi fleksibel berdasarkan Cabang, Induk / Agen, Reseller, dan Channel Distribusi";
    if (boxKat) boxKat.style.display = "none";
    if (boxOp) boxOp.style.display = "none";
  }

  loadPivotOptions();
}

async function loadPivotOptions() {
  try {
    const res = await fetch(`/api/pivot/options?brand=${pivotBrand}&type=${pivotSubPage}`);
    const json = await res.json();
    if (!json.ok || !json.data) return;

    const d = json.data;

    // 1. Populate Row Dimension
    const rowSel = document.getElementById("piv-row-dim");
    if (rowSel && d.dimensions) {
      const prevRow = rowSel.value;
      rowSel.innerHTML = "";
      d.dimensions.forEach(dim => {
        const opt = document.createElement("option");
        opt.value = dim.id;
        opt.textContent = dim.label;
        rowSel.appendChild(opt);
      });
      if (prevRow && d.dimensions.some(dim => dim.id === prevRow)) {
        rowSel.value = prevRow;
      }
    }

    // 2. Populate Column Dimension
    const colSel = document.getElementById("piv-col-dim");
    if (colSel && d.column_dimensions) {
      const prevCol = colSel.value;
      colSel.innerHTML = "";
      d.column_dimensions.forEach(dim => {
        const opt = document.createElement("option");
        opt.value = dim.id;
        opt.textContent = dim.label;
        colSel.appendChild(opt);
      });
      if (prevCol && d.column_dimensions.some(dim => dim.id === prevCol)) {
        colSel.value = prevCol;
      } else {
        colSel.value = "none";
      }
    }

    // 3. Populate Metrics
    const metricSel = document.getElementById("piv-metric");
    if (metricSel && d.metrics && d.metrics.length > 0) {
      const prevMetric = metricSel.value;
      metricSel.innerHTML = "";
      d.metrics.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.label;
        metricSel.appendChild(opt);
      });
      if (prevMetric && d.metrics.some(m => m.id === prevMetric)) {
        metricSel.value = prevMetric;
      }
    }

    // 4. Populate Month Filter
    const monthSel = document.getElementById("piv-filter-month");
    const prevMonth = monthSel.value;
    monthSel.innerHTML = `<option value="ALL">Semua Bulan (2026)</option>`;
    (d.months || []).forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = `Bulan ${m}`;
      monthSel.appendChild(opt);
    });
    if (prevMonth && (prevMonth === "ALL" || (d.months && d.months.includes(prevMonth)))) {
      monthSel.value = prevMonth;
    } else if (d.months && d.months.length > 0) {
      monthSel.value = d.months[0];
    }

    // 5. Populate Status Filter
    const statusSel = document.getElementById("piv-filter-status");
    const prevStatus = statusSel.value;
    statusSel.innerHTML = `<option value="ALL">Semua Status</option>`;
    (d.statuses || []).forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      statusSel.appendChild(opt);
    });
    if (prevStatus && (prevStatus === "ALL" || (d.statuses && d.statuses.includes(prevStatus)))) {
      statusSel.value = prevStatus;
    }

    // 6. Populate Cabang Filter
    const cabangSel = document.getElementById("piv-filter-cabang");
    const prevCabang = cabangSel.value;
    cabangSel.innerHTML = `<option value="ALL">Semua Cabang</option>`;
    (d.cabangs || []).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      cabangSel.appendChild(opt);
    });
    if (prevCabang && (prevCabang === "ALL" || (d.cabangs && d.cabangs.includes(prevCabang)))) {
      cabangSel.value = prevCabang;
    }

    // 7. Populate Kategori & Operator Filters (Khusus Sub Page Product)
    const katSel = document.getElementById("piv-filter-kategori");
    if (katSel && d.kategoris) {
      const prevKat = katSel.value;
      katSel.innerHTML = `<option value="ALL">Semua Kategori</option>`;
      d.kategoris.forEach(k => {
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = k;
        katSel.appendChild(opt);
      });
      if (prevKat && (prevKat === "ALL" || d.kategoris.includes(prevKat))) {
        katSel.value = prevKat;
      }
    }

    const opSel = document.getElementById("piv-filter-operator");
    if (opSel && d.operators) {
      const prevOp = opSel.value;
      opSel.innerHTML = `<option value="ALL">Semua Operator</option>`;
      d.operators.forEach(o => {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        opSel.appendChild(opt);
      });
      if (prevOp && (prevOp === "ALL" || d.operators.includes(prevOp))) {
        opSel.value = prevOp;
      }
    }

    runPivot();
  } catch (err) {
    console.error("Gagal load opsi pivot:", err);
  }
}

async function runPivot() {
  const rowDim = document.getElementById("piv-row-dim").value;
  const colDim = document.getElementById("piv-col-dim").value;
  const metric = document.getElementById("piv-metric").value;
  const monthFilter = document.getElementById("piv-filter-month").value;
  const statusFilter = document.getElementById("piv-filter-status").value;
  const cabangFilter = document.getElementById("piv-filter-cabang").value;
  const limit = document.getElementById("piv-limit").value;

  const katSel = document.getElementById("piv-filter-kategori");
  const kategoriFilter = (pivotSubPage === "product" && katSel) ? katSel.value : "ALL";

  const opSel = document.getElementById("piv-filter-operator");
  const operatorFilter = (pivotSubPage === "product" && opSel) ? opSel.value : "ALL";

  const tbody = document.getElementById("piv-tbody");
  tbody.innerHTML = `<tr><td class="loader" colspan="10">Menghitung agregasi ${pivotSubPage === "product" ? "Product" : "Channel"} pivot table...</td></tr>`;

  try {
    const params = new URLSearchParams({
      brand: pivotBrand,
      type: pivotSubPage,
      row: rowDim,
      col: colDim,
      metric: metric,
      month: monthFilter,
      status: statusFilter,
      cabang: cabangFilter,
      kategori: kategoriFilter,
      operator: operatorFilter,
      limit: limit
    });

    const res = await fetch(`/api/pivot/query?${params.toString()}`);
    const json = await res.json();

    if (!json.ok || !json.data) throw new Error(json.error || "Gagal menjalankan pivot");

    const data = json.data;
    lastPivotData = data;

    // Update Summary Strip
    if (data.summary) {
      document.getElementById("piv-sum-trx").textContent = formatInt(data.summary.total_trx);
      document.getElementById("piv-sum-daily-trx").textContent = `Daily: ${formatInt(Math.round(data.summary.daily_trx))} / hari`;
      document.getElementById("piv-sum-jual").textContent = formatMoney(data.summary.total_jual);
      document.getElementById("piv-sum-daily-jual").textContent = `Daily: ${formatMoney(data.summary.daily_jual)} / hari`;
      document.getElementById("piv-sum-margin").textContent = formatMoney(data.summary.total_margin);
      document.getElementById("piv-sum-daily-margin").textContent = `Daily: ${formatMoney(data.summary.daily_margin)} / hari`;
      document.getElementById("piv-sum-rate").textContent = `${data.summary.sukses_rate.toFixed(1)}%`;
      document.getElementById("piv-sum-days").textContent = `${data.summary.active_days} Hari Aktif`;
    }

    document.getElementById("piv-exec-time").textContent = `Selesai dalam ${data.elapsed_ms} ms`;
    document.getElementById("piv-table-title").textContent = `Tabel Hasil Pivot (${pivotSubPage === "product" ? "Product" : "Channel"})`;

    // Render Table
    renderPivotTable(data, metric);

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td class="loader text-negative" colspan="10">Error: ${err.message}</td></tr>`;
  }
}

function renderPivotTable(data, metric) {
  const thead = document.getElementById("piv-thead");
  const tbody = document.getElementById("piv-tbody");
  const tfoot = document.getElementById("piv-tfoot");

  const rowOption = document.getElementById("piv-row-dim").selectedOptions[0];
  const rowLabelText = rowOption ? rowOption.text : "Baris";

  if (data.is_2d) {
    // 2D Pivot Table Render
    let headHtml = `<tr><th>${rowLabelText}</th>`;
    data.columns.forEach(col => {
      headHtml += `<th class="text-right">${col}</th>`;
    });
    headHtml += `</tr>`;
    thead.innerHTML = headHtml;

    let bodyHtml = "";
    if (!data.rows || data.rows.length === 0) {
      bodyHtml = `<tr><td colspan="${data.columns.length + 1}" class="loader">Tidak ada data ditemukan untuk filter ini</td></tr>`;
    } else {
      data.rows.forEach(r => {
        bodyHtml += `<tr><td class="font-semibold">${r._row_label}</td>`;
        data.columns.forEach(col => {
          const val = r[col] || 0;
          let formatted = formatInt(val);
          if (metric.includes("jual") || metric.includes("beli") || metric.includes("margin")) {
            formatted = formatMoney(val);
          } else if (metric === "daily_trx") {
            formatted = formatInt(Math.round(val));
          } else if (metric === "sukses_pct") {
            formatted = `${Number(val).toFixed(1)}%`;
          }
          bodyHtml += `<td class="text-right">${formatted}</td>`;
        });
        bodyHtml += `</tr>`;
      });
    }
    tbody.innerHTML = bodyHtml;

    if (data.total_row) {
      const tot = data.total_row;
      let footHtml = `<tr><td>TOTAL</td>`;
      data.columns.forEach(col => {
        const val = tot[col] || 0;
        let formatted = formatInt(val);
        if (metric.includes("jual") || metric.includes("beli") || metric.includes("margin")) {
          formatted = formatMoney(val);
        } else if (metric === "daily_trx") {
          formatted = formatInt(Math.round(val));
        } else if (metric === "sukses_pct") {
          formatted = `${Number(val).toFixed(1)}%`;
        }
        footHtml += `<td class="text-right">${formatted}</td>`;
      });
      footHtml += `</tr>`;
      tfoot.innerHTML = footHtml;
    } else {
      tfoot.innerHTML = "";
    }

  } else {
    // 1D Breakdown Table Render
    const headHtml = `
      <tr>
        <th>${rowLabelText}</th>
        <th class="text-right">Total Trx</th>
        <th class="text-right" style="color: #2563eb;">Daily Trx</th>
        <th class="text-right">Omzet Jual</th>
        <th class="text-right" style="color: #0284c7;">Daily Revenue</th>
        <th class="text-right">Margin (Laba)</th>
        <th class="text-right" style="color: #16a34a;">Daily Margin</th>
        <th class="text-right">Total Qty</th>
        <th class="text-right">% Sukses</th>
      </tr>
    `;
    thead.innerHTML = headHtml;

    let bodyHtml = "";
    if (!data.rows || data.rows.length === 0) {
      bodyHtml = `<tr><td colspan="9" class="loader">Tidak ada data ditemukan untuk filter ini</td></tr>`;
    } else {
      data.rows.forEach(r => {
        bodyHtml += `
          <tr>
            <td class="font-semibold">${r._row_label}</td>
            <td class="text-right">${formatInt(r.trx_count)}</td>
            <td class="text-right" style="color: #2563eb; font-weight: 600;">${formatInt(Math.round(r.daily_trx))}</td>
            <td class="text-right">${formatMoney(r.jual_sum)}</td>
            <td class="text-right" style="color: #0284c7; font-weight: 600;">${formatMoney(r.daily_jual)}</td>
            <td class="text-right">${formatMoney(r.margin_sum)}</td>
            <td class="text-right" style="color: #16a34a; font-weight: 700;">${formatMoney(r.daily_margin)}</td>
            <td class="text-right">${formatInt(r.qty_sum)}</td>
            <td class="text-right">${r.sukses_pct.toFixed(1)}%</td>
          </tr>
        `;
      });
    }
    tbody.innerHTML = bodyHtml;

    if (data.total_row) {
      const tot = data.total_row;
      tfoot.innerHTML = `
        <tr>
          <td>TOTAL</td>
          <td class="text-right">${formatInt(tot.trx_count)}</td>
          <td class="text-right" style="color: #2563eb; font-weight: 800;">${formatInt(Math.round(tot.daily_trx))}</td>
          <td class="text-right">${formatMoney(tot.jual_sum)}</td>
          <td class="text-right" style="color: #0284c7; font-weight: 800;">${formatMoney(tot.daily_jual)}</td>
          <td class="text-right">${formatMoney(tot.margin_sum)}</td>
          <td class="text-right" style="color: #16a34a; font-weight: 800;">${formatMoney(tot.daily_margin)}</td>
          <td class="text-right">${formatInt(tot.qty_sum)}</td>
          <td class="text-right">${tot.sukses_pct.toFixed(1)}%</td>
        </tr>
      `;
    } else {
      tfoot.innerHTML = "";
    }
  }
}

function exportPivotCSV() {
  const table = document.getElementById("piv-result-table");
  if (!table) return;

  let csv = [];
  const rows = table.querySelectorAll("tr");
  for (let i = 0; i < rows.length; i++) {
    const row = [];
    const cols = rows[i].querySelectorAll("td, th");
    for (let j = 0; j < cols.length; j++) {
      let data = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, "").trim();
      data = data.replace(/"/g, '""');
      row.push('"' + data + '"');
    }
    csv.push(row.join(","));
  }

  const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csv.join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `pivot_${pivotSubPage}_${pivotBrand}_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function switchPivotBrand(b) {
  pivotBrand = b;
  const btnA = document.getElementById("btn-piv-astaga");
  const btnO = document.getElementById("btn-piv-oki");

  if (b === "ASTAGA") {
    btnA.className = "brand-pill active-brand-astaga";
    btnO.className = "brand-pill";
  } else {
    btnA.className = "brand-pill";
    btnO.className = "brand-pill active-brand-oki";
  }

  loadPivotOptions();
}

// Global exports for shell router
window.loadTransaksi = function() {
  switchPivotSubPage("channel");
};
window.switchPivotSubPage = switchPivotSubPage;
window.switchPivotBrand = switchPivotBrand;
window.runPivot = runPivot;
window.exportPivotCSV = exportPivotCSV;
