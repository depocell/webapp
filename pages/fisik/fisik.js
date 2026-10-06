let fisikState = {
  data: null,
  period: "",
  cabang: "ALL",
  channel: "ALL"
};

function formatRupiah(val) {
  if (val === null || val === undefined) return "Rp 0";
  return "Rp " + Math.round(val).toLocaleString("id-ID");
}

function formatQty(val) {
  if (val === null || val === undefined) return "0";
  return Math.round(val).toLocaleString("id-ID");
}

async function loadFisik() {
  const container = document.getElementById("content-area");
  if (!container) return;

  const url = `/api/fisik?period=${encodeURIComponent(fisikState.period)}&cabang=${encodeURIComponent(fisikState.cabang)}&channel=${encodeURIComponent(fisikState.channel)}`;

  try {
    const res = await fetch(url);
    const json = await res.json();

    if (!json.ok) {
      alert("Gagal memuat data produk fisik: " + (json.error || "Unknown error"));
      return;
    }

    fisikState.data = json;
    fisikState.period = json.period_code;

    renderFisikUI();
  } catch (err) {
    console.error("Error loading fisik data:", err);
  }
}

function renderFisikUI() {
  const data = fisikState.data;
  if (!data) return;

  // 1. Update Subtitle
  const subEl = document.getElementById("fisik-period-subtitle");
  if (subEl) {
    subEl.innerText = `Periode Data SISCOM: ${data.date_range || data.period_code} | Total ${data.raw_rows.length} Baris Produk`;
  }

  // 2. Populate Period Dropdown jika kosong
  const selPeriod = document.getElementById("fisik-select-period");
  if (selPeriod && selPeriod.options.length === 0) {
    selPeriod.innerHTML = "";
    (data.available_periods || []).forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.code;
      opt.innerText = p.label;
      if (p.code === data.period_code) opt.selected = true;
      selPeriod.appendChild(opt);
    });
  }

  // 3. Populate Cabang Dropdown jika belum lengkap
  const selCabang = document.getElementById("fisik-select-cabang");
  if (selCabang && selCabang.options.length <= 1) {
    (data.filters.branches || []).forEach(b => {
      if (b && b !== "UNKNOWN") {
        const opt = document.createElement("option");
        opt.value = b;
        opt.innerText = b;
        selCabang.appendChild(opt);
      }
    });
    selCabang.value = fisikState.cabang;
  }

  // 4. Populate Channel Dropdown jika belum lengkap
  const selChannel = document.getElementById("fisik-select-channel");
  if (selChannel && selChannel.options.length <= 1) {
    (data.filters.channels || []).forEach(c => {
      if (c && c !== "UNKNOWN") {
        const opt = document.createElement("option");
        opt.value = c;
        opt.innerText = c;
        selChannel.appendChild(opt);
      }
    });
    selChannel.value = fisikState.channel;
  }

  // 5. Update KPI Cards (Ringkas 3 Card)
  const kpi = data.kpi || {};
  const qtyEl = document.getElementById("kpi-total-qty");
  const nettoEl = document.getElementById("kpi-total-netto");
  const salesNettoEl = document.getElementById("kpi-sales-netto");
  const salesSubEl = document.getElementById("kpi-sales-sub");

  if (qtyEl) qtyEl.innerText = formatQty(kpi.total_fisik_qty);
  if (nettoEl) nettoEl.innerText = formatRupiah(kpi.total_fisik_netto);
  if (salesNettoEl) salesNettoEl.innerText = formatRupiah(kpi.sales_netto);
  if (salesSubEl) salesSubEl.innerText = `${formatQty(kpi.sales_qty)} pcs (${kpi.sales_ratio}% porsi)`;

  // 6. Render Tabel Channel & Sales
  renderChannelTable(data.summary.channels, kpi.total_fisik_netto);

  // 7. Render Tabel Cabang
  renderCabangTable(data.summary.branches);

  // 8. Render Tabel Operator
  renderOperatorTable(data.summary.operators);

  // 9. Render Tabel Top Products
  renderProductTable(data.summary.top_products);

  // 10. Render Raw Rows
  renderRawTable(data.raw_rows);
}

function renderChannelTable(channels, totalNetto) {
  const tbody = document.getElementById("tbody-channel");
  if (!tbody) return;

  if (!channels || channels.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Tidak ada data channel.</td></tr>`;
    return;
  }

  let html = "";
  channels.forEach(c => {
    let badgeClass = "badge";
    let badgeStyle = "background: rgba(148, 163, 184, 0.2);";
    let groupLabel = "Lainnya";

    if (c.group === "SALES_LAPANGAN") {
      badgeStyle = "background: rgba(16, 185, 129, 0.2); color: #10b981; font-weight: 600;";
      groupLabel = "Sales / DSO";
    } else if (c.group === "WALK_IN") {
      badgeStyle = "background: rgba(59, 130, 246, 0.2); color: #3b82f6;";
      groupLabel = "Toko (Walk In)";
    } else if (c.group === "TRANSFER") {
      badgeStyle = "background: rgba(245, 158, 11, 0.2); color: #f59e0b;";
      groupLabel = "Transfer";
    }

    const porsi = totalNetto > 0 ? ((c.netto / totalNetto) * 100).toFixed(1) : 0;

    html += `
      <tr>
        <td style="font-weight: 600;">${c.channel}</td>
        <td><span class="${badgeClass}" style="${badgeStyle}">${groupLabel}</span></td>
        <td style="text-align: right;">${formatQty(c.items)}</td>
        <td style="text-align: right; font-weight: 600;">${formatQty(c.qty)}</td>
        <td style="text-align: right; font-weight: 600;">${formatRupiah(c.netto)}</td>
        <td style="text-align: right; color: var(--text-muted);">${porsi}%</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderCabangTable(branches) {
  const tbody = document.getElementById("tbody-cabang");
  if (!tbody) return;

  if (!branches || branches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Tidak ada data cabang.</td></tr>`;
    return;
  }

  let html = "";
  branches.forEach(b => {
    html += `
      <tr>
        <td style="font-weight: 600;">${b.cabang}</td>
        <td style="text-align: right;">${formatQty(b.qty)}</td>
        <td style="text-align: right; font-weight: 600;">${formatRupiah(b.netto)}</td>
        <td style="text-align: right; color: #10b981;">${formatQty(b.sales_qty)}</td>
        <td style="text-align: right; font-weight: 600; color: #10b981;">${formatRupiah(b.sales_netto)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderOperatorTable(operators) {
  const tbody = document.getElementById("tbody-operator");
  if (!tbody) return;

  if (!operators || operators.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Tidak ada data.</td></tr>`;
    return;
  }

  let html = "";
  operators.forEach(op => {
    html += `
      <tr>
        <td style="font-weight: 600;">${op.operator}</td>
        <td style="text-align: right; color: var(--text-muted);">${formatQty(op.items)}</td>
        <td style="text-align: right;">${formatQty(op.qty)}</td>
        <td style="text-align: right; font-weight: 600;">${formatRupiah(op.netto)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

let allTopProducts = [];

function renderProductTable(products) {
  allTopProducts = products || [];
  filterProductTable();
}

function filterProductTable() {
  const tbody = document.getElementById("tbody-product");
  const searchInput = document.getElementById("fisik-search-prod");
  const keyword = (searchInput ? searchInput.value : "").trim().toLowerCase();

  if (!tbody) return;

  let filtered = allTopProducts;
  if (keyword) {
    filtered = filtered.filter(p => p.produk.toLowerCase().includes(keyword) || p.operator.toLowerCase().includes(keyword));
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Tidak ada produk yang cocok.</td></tr>`;
    return;
  }

  let html = "";
  filtered.forEach((p, idx) => {
    html += `
      <tr>
        <td style="text-align: center; color: var(--text-muted);">${idx + 1}</td>
        <td style="font-weight: 600;">${p.produk}</td>
        <td><span class="badge" style="background: rgba(148, 163, 184, 0.15);">${p.operator}</span></td>
        <td><span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">${p.tipe}</span></td>
        <td style="text-align: right; font-weight: 600;">${formatQty(p.qty)}</td>
        <td style="text-align: right; font-weight: 600;">${formatRupiah(p.netto)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderRawTable(rows) {
  const tbody = document.getElementById("tbody-raw");
  const countBadge = document.getElementById("raw-row-count");
  if (!tbody) return;

  if (countBadge) countBadge.innerText = `${rows.length} Baris`;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;">Tidak ada baris data.</td></tr>`;
    return;
  }

  let html = "";
  rows.forEach((r, idx) => {
    const isSales = r.channel_group === "SALES_LAPANGAN";
    html += `
      <tr style="${isSales ? 'background: rgba(16, 185, 129, 0.05);' : ''}">
        <td style="text-align: center; color: var(--text-muted);">${idx + 1}</td>
        <td style="white-space: nowrap;">${r.cabang}</td>
        <td style="white-space: nowrap; font-weight: 600; ${isSales ? 'color: #10b981;' : ''}">${r.channel}</td>
        <td style="font-weight: 500;">${r.produk}</td>
        <td><span class="badge" style="background: rgba(148, 163, 184, 0.15);">${r.operator}</span></td>
        <td>${r.tipe}</td>
        <td style="text-align: right; font-weight: 600;">${formatQty(r.qty)}</td>
        <td style="text-align: right;">${formatRupiah(r.gross)}</td>
        <td style="text-align: right; color: var(--text-muted);">${formatRupiah(r.diskon)}</td>
        <td style="text-align: right; font-weight: 600;">${formatRupiah(r.netto)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function changeFisikFilter() {
  const selPeriod = document.getElementById("fisik-select-period");
  const selCabang = document.getElementById("fisik-select-cabang");
  const selChannel = document.getElementById("fisik-select-channel");

  if (selPeriod) fisikState.period = selPeriod.value;
  if (selCabang) fisikState.cabang = selCabang.value;
  if (selChannel) fisikState.channel = selChannel.value;

  loadFisik();
}
