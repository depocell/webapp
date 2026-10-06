// pages/agen/agen.js — Controller Analisa Toko Induk Agen ASTAGA (Rollup Reseller)

let agenState = {
  raw: null,
  activeTab: 'semua_aktif',
  selectedCabang: 'ALL',
  searchQuery: '',
  page: 1,
  pageSize: 50,
  filteredRows: []
};

function formatIDR(val) {
  if (!val || isNaN(val)) return '0';
  return Number(val).toLocaleString('id-ID');
}

function formatPct(val) {
  if (val === undefined || val === null || isNaN(val)) return '0%';
  return Number(val).toFixed(1).replace('.', ',') + '%';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.loadAgen = async function(monthCode = null) {
  const tbody = document.getElementById('agen-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 40px; color: var(--text-muted);"><div class="loader">Memuat data transaksi Induk Agen ASTAGA...</div></td></tr>`;
  }

  try {
    let url = '/api/agen?year=2026';
    if (monthCode) {
      url += `&month=${encodeURIComponent(monthCode)}`;
    }
    const res = await fetch(url + '&t=' + Date.now());
    const json = await res.json();

    if (!json.ok) {
      throw new Error(json.error || 'Gagal memuat data agen');
    }

    agenState.raw = json.data;
    renderAgenHeaderAndKPI();
    renderAgenControls();
    applyAgenFilters();
  } catch (err) {
    console.error('Error loadAgen:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 30px; color: var(--negative);">Terjadi kesalahan: ${err.message}</td></tr>`;
    }
  }
};

function renderAgenHeaderAndKPI() {
  const data = agenState.raw;
  if (!data || !data.kpi) return;

  const k = data.kpi;
  const elReg = document.getElementById('kpi-agen-registered');
  const elAct = document.getElementById('kpi-agen-active');
  const elRate = document.getElementById('kpi-agen-active-rate');
  const elRet = document.getElementById('kpi-agen-retained');
  const elNew = document.getElementById('kpi-agen-new');
  const elChu = document.getElementById('kpi-agen-churn');
  const elTrx = document.getElementById('kpi-agen-trx');
  const elPew = document.getElementById('kpi-agen-pct-ew');

  if (elReg) elReg.textContent = formatIDR(k.total_registered);
  if (elAct) elAct.textContent = formatIDR(k.active_current);
  if (elRate && k.total_registered > 0) {
    const actRate = ((k.active_current / k.total_registered) * 100).toFixed(1).replace('.', ',');
    elRate.textContent = `${actRate}% dari total master`;
  }
  if (elRet) elRet.textContent = formatIDR(k.retained);
  if (elNew) elNew.textContent = formatIDR(k.new_reactivated);
  if (elChu) elChu.textContent = formatIDR(k.churned);
  if (elTrx) elTrx.textContent = formatIDR(k.total_trx) + ' trx';
  if (elPew) elPew.textContent = `${formatPct(k.avg_pct_ewallet)} EWALLET (${formatIDR(k.total_ewallet)} trx)`;

  // Tab counts
  const countSemua = data.rows ? data.rows.length : 0;
  const countRutin = data.rows ? data.rows.filter(r => r.activity_status === 'Aktif Rutin').length : 0;
  const countBaru = data.rows ? data.rows.filter(r => r.activity_status === 'Baru / Reaktivasi').length : 0;
  const countChurn = data.churn_rows ? data.churn_rows.length : 0;
  const countEwallet = data.rows ? data.rows.filter(r => (r.pct_ewallet || 0) >= 50).length : 0;

  const elCS = document.getElementById('count-agen-semua-aktif');
  const elCR = document.getElementById('count-agen-rutin');
  const elCB = document.getElementById('count-agen-baru');
  const elCC = document.getElementById('count-agen-churn');
  const elCE = document.getElementById('count-agen-ewallet');

  if (elCS) elCS.textContent = formatIDR(countSemua);
  if (elCR) elCR.textContent = formatIDR(countRutin);
  if (elCB) elCB.textContent = formatIDR(countBaru);
  if (elCC) elCC.textContent = formatIDR(countChurn);
  if (elCE) elCE.textContent = formatIDR(countEwallet);
}

function renderAgenControls() {
  const data = agenState.raw;
  if (!data) return;

  // Month selector
  const mSelect = document.getElementById('agen-month-select');
  if (mSelect && data.available_months) {
    mSelect.innerHTML = data.available_months.map(m => {
      const isSel = m === data.selected_month ? 'selected' : '';
      return `<option value="${m}" ${isSel}>${m}</option>`;
    }).join('');
  }

  // Cabang selector
  const cSelect = document.getElementById('agen-cabang-select');
  if (cSelect && data.all_cabangs) {
    const currentVal = agenState.selectedCabang;
    let opts = '<option value="ALL">Semua Cabang</option>';
    data.all_cabangs.forEach(c => {
      const isSel = c === currentVal ? 'selected' : '';
      opts += `<option value="${c}" ${isSel}>${c}</option>`;
    });
    cSelect.innerHTML = opts;
  }
}

window.onAgenMonthChange = function(monthCode) {
  if (!monthCode) return;
  window.loadAgen(monthCode);
};

window.setAgenTab = function(tabName, btnElem) {
  agenState.activeTab = tabName;
  agenState.page = 1;

  document.querySelectorAll('#agen-status-filter-pills .reseller-tab').forEach(b => b.classList.remove('active'));
  if (btnElem) btnElem.classList.add('active');

  applyAgenFilters();
};

window.applyAgenFilters = function() {
  const data = agenState.raw;
  if (!data) return;

  const cSelect = document.getElementById('agen-cabang-select');
  if (cSelect) agenState.selectedCabang = cSelect.value;

  const sInput = document.getElementById('agen-search-input');
  if (sInput) agenState.searchQuery = sInput.value.trim().toLowerCase();

  let source = [];
  if (agenState.activeTab === 'churn') {
    source = data.churn_rows || [];
  } else if (agenState.activeTab === 'rutin') {
    source = (data.rows || []).filter(r => r.activity_status === 'Aktif Rutin');
  } else if (agenState.activeTab === 'baru') {
    source = (data.rows || []).filter(r => r.activity_status === 'Baru / Reaktivasi');
  } else if (agenState.activeTab === 'ewallet_high') {
    source = (data.rows || []).filter(r => (r.pct_ewallet || 0) >= 50);
  } else {
    source = data.rows || [];
  }

  // Filter Cabang
  if (agenState.selectedCabang !== 'ALL') {
    source = source.filter(r => (r.cabang || '').toUpperCase() === agenState.selectedCabang.toUpperCase());
  }

  // Filter Search
  if (agenState.searchQuery) {
    const q = agenState.searchQuery;
    source = source.filter(r => {
      const k = (r.agen_id || '').toLowerCase();
      const n = (r.agen_name || '').toLowerCase();
      const s = (r.sco || '').toLowerCase();
      const c = (r.cabang || '').toLowerCase();
      return k.includes(q) || n.includes(q) || s.includes(q) || c.includes(q);
    });
  }

  // Toggle Clear Button
  const btnClear = document.getElementById('btn-clear-agen-search');
  if (btnClear) {
    btnClear.style.display = sInput && sInput.value ? 'flex' : 'none';
  }

  agenState.filteredRows = source;
  agenState.page = 1;
  renderAgenTable();
};

window.clearAgenSearch = function() {
  const sInput = document.getElementById('agen-search-input');
  if (sInput) {
    sInput.value = '';
    sInput.focus();
  }
  window.applyAgenFilters();
};

function renderAgenTable() {
  const tbody = document.getElementById('agen-tbody');
  const countEl = document.getElementById('agen-table-row-count');
  const pageInfo = document.getElementById('agen-table-page-info');
  const pageNum = document.getElementById('agen-page-current-num');
  const btnPrev = document.getElementById('btn-agen-page-prev');
  const btnNext = document.getElementById('btn-agen-page-next');
  const titleEl = document.getElementById('agen-table-title');

  const total = agenState.filteredRows.length;
  if (countEl) countEl.textContent = `${formatIDR(total)} agen`;

  if (titleEl) {
    const tabLabels = {
      semua_aktif: 'Daftar Semua Agen Aktif',
      rutin: 'Agen Aktif Rutin (Retained)',
      baru: 'Agen Baru / Reaktivasi',
      churn: 'Agen Pasif / Churn (Bulan Lalu Aktif, Bulan Ini 0)',
      ewallet_high: 'Agen Dominan EWALLET (Porsi ≥ 50%)'
    };
    titleEl.textContent = tabLabels[agenState.activeTab] || 'Daftar Agen';
  }

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 30px; color: var(--text-muted);">Tidak ada data agen yang cocok dengan filter.</td></tr>`;
    if (pageInfo) pageInfo.textContent = 'Menampilkan 0 dari 0 data';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }

  const startIdx = (agenState.page - 1) * agenState.pageSize;
  const endIdx = Math.min(startIdx + agenState.pageSize, total);
  const pageRows = agenState.filteredRows.slice(startIdx, endIdx);

  if (pageInfo) {
    pageInfo.textContent = `Menampilkan ${startIdx + 1} - ${endIdx} dari ${formatIDR(total)} data`;
  }
  if (pageNum) pageNum.textContent = agenState.page;
  if (btnPrev) btnPrev.disabled = agenState.page <= 1;
  if (btnNext) btnNext.disabled = endIdx >= total;

  let html = '';
  pageRows.forEach((r, idx) => {
    const rowNum = startIdx + idx + 1;
    const isChurn = agenState.activeTab === 'churn' || r.activity_status === 'Pasif / Churn';

    // Status Pill
    let statusBadge = '';
    if (isChurn) {
      statusBadge = `<span class="pill negative">Pasif / Churn</span>`;
    } else if (r.activity_status === 'Baru / Reaktivasi') {
      statusBadge = `<span class="pill" style="background: #e0f2fe; color: #0369a1;">Baru / Reaktivasi</span>`;
    } else {
      statusBadge = `<span class="pill positive">Aktif Rutin</span>`;
    }

    // % EWALLET Badge
    const pctEw = r.pct_ewallet || 0;
    let ewBadge = '';
    if (isChurn) {
      ewBadge = `<span style="color: var(--text-muted);">-</span>`;
    } else if (pctEw >= 50) {
      ewBadge = `<span class="pill badge-ewallet-high">${formatPct(pctEw)}</span>`;
    } else {
      ewBadge = `<span class="pill badge-ewallet-normal">${formatPct(pctEw)}</span>`;
    }

    // Utilisasi Downline Reseller
    const totalAnak = r.total_reseller || 1;
    const aktifAnak = r.active_reseller || 0;
    const pctAnak = r.pct_active_reseller || 0;

    let utilizasiHtml = '';
    if (isChurn) {
      utilizasiHtml = `<span style="color: var(--text-muted); font-size: 11.5px;">0 / ${totalAnak} (0%)</span>`;
    } else {
      const barColor = pctAnak >= 50 ? '#10b981' : (pctAnak >= 20 ? '#0284c7' : '#f59e0b');
      utilizasiHtml = `
        <div style="font-size: 12px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; justify-content: center; gap: 4px;">
          <span>${aktifAnak} / ${totalAnak}</span>
          <span style="font-size: 11px; color: var(--text-muted); font-weight: 500;">(${formatPct(pctAnak)})</span>
        </div>
        <div style="height: 4px; background: #e2e8f0; border-radius: 99px; margin-top: 3px; overflow: hidden; width: 75px; margin-left: auto; margin-right: auto;">
          <div style="height: 100%; width: ${Math.min(pctAnak, 100)}%; background: ${barColor};"></div>
        </div>
      `;
    }

    // Mini Product Composition Bar
    const tot = r.total_trx || 0;
    let compBars = '<span style="color: var(--text-muted);">-</span>';
    if (!isChurn && tot > 0) {
      const pEw = ((r.ewallet_trx || 0) / tot) * 100;
      const pTe = ((r.telco_trx || 0) / tot) * 100;
      const pPp = ((r.ppob_trx || 0) / tot) * 100;
      const pPl = ((r.token_trx || 0) / tot) * 100;

      compBars = `
        <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: #e2e8f0; width: 90px;" title="EW: ${formatPct(pEw)} | Telco: ${formatPct(pTe)} | PPOB: ${formatPct(pPp)} | PLN: ${formatPct(pPl)}">
          <div style="width: ${pEw}%; background: #2563eb;"></div>
          <div style="width: ${pTe}%; background: #16a34a;"></div>
          <div style="width: ${pPp}%; background: #eab308;"></div>
          <div style="width: ${pPl}%; background: #9333ea;"></div>
        </div>
        <div style="display: flex; gap: 6px; font-size: 10.5px; color: var(--text-muted); margin-top: 2px;">
          <span>EW: ${formatPct(pEw)}</span>
          <span>TL: ${formatPct(pTe)}</span>
        </div>
      `;
    }

    const trStyle = "cursor: pointer; transition: background 0.15s ease;";
    html += `
      <tr style="${trStyle}" onclick="openAgenModal('${escapeHtml(r.agen_id)}')">
        <td class="text-center" style="color: var(--text-muted); font-size: 12px;">${rowNum}</td>
        <td>
          <strong style="color: var(--text-main); font-size: 13.5px; display: block;">${escapeHtml(r.agen_name || r.agen_id)}</strong>
          <span style="font-size: 11.5px; color: var(--text-muted); font-family: monospace;">${escapeHtml(r.agen_id)}</span>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-main); font-size: 13px;">${escapeHtml(r.cabang)}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">SCO: ${escapeHtml(r.sco)}</div>
        </td>
        <td>
          <div style="font-size: 12px; color: var(--text-main); font-weight: 500;">${escapeHtml(r.jadwal || '-')}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">Limit: Rp ${formatIDR(r.limit)}</div>
        </td>
        <td class="text-center">
          ${utilizasiHtml}
        </td>
        <td class="text-right font-semibold" style="font-size: 14px; color: var(--text-main);">
          ${isChurn ? `<span style="color: var(--text-muted);">0</span> <span style="font-size: 11px; color: var(--text-muted); display: block;">(Bln lalu: ${formatIDR(r.prev_trx)})</span>` : formatIDR(r.total_trx)}
        </td>
        <td class="text-right" style="color: #1e40af; font-weight: 600;">
          ${isChurn ? '-' : formatIDR(r.ewallet_trx)}
        </td>
        <td class="text-right">
          ${ewBadge}
        </td>
        <td>
          ${compBars}
        </td>
        <td class="text-center">
          ${statusBadge}
        </td>
        <td class="text-center" onclick="event.stopPropagation();">
          <button type="button" onclick="openAgenModal('${escapeHtml(r.agen_id)}')" style="background: none; border: 1px solid var(--surface-border); border-radius: 6px; padding: 4px 8px; font-size: 11.5px; font-weight: 600; color: var(--primary); cursor: pointer;">
            Detail
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

window.prevAgenPage = function() {
  if (agenState.page > 1) {
    agenState.page--;
    renderAgenTable();
    const scroller = document.querySelector('.table-container');
    if (scroller) scroller.scrollTop = 0;
  }
};

window.nextAgenPage = function() {
  const total = agenState.filteredRows.length;
  if (agenState.page * agenState.pageSize < total) {
    agenState.page++;
    renderAgenTable();
    const scroller = document.querySelector('.table-container');
    if (scroller) scroller.scrollTop = 0;
  }
};

window.openAgenModal = function(agenId) {
  const data = agenState.raw;
  if (!data) return;

  const item = [...(data.rows || []), ...(data.churn_rows || [])].find(x => x.agen_id === agenId);
  if (!item) return;

  const modal = document.getElementById('agen-modal');
  if (!modal) return;

  // Header modal
  document.getElementById('modal-agen-title').textContent = item.agen_name || item.agen_id;
  document.getElementById('modal-agen-kode').textContent = `AGEN ID: ${item.agen_id}`;

  // Profil
  document.getElementById('modal-agen-cabang').textContent = item.cabang || '-';
  document.getElementById('modal-agen-sco').textContent = `${item.sco || '-'} / ${item.dso || '-'}`;
  document.getElementById('modal-agen-jadwal').textContent = item.jadwal || '-';
  document.getElementById('modal-agen-limit').textContent = `Rp ${formatIDR(item.limit)}`;

  const elStat = document.getElementById('modal-agen-status');
  if (elStat) {
    elStat.textContent = item.status || 'NON MM';
    elStat.className = item.status && item.status.includes('MM') ? 'pill positive' : 'pill';
  }

  const elUtil = document.getElementById('modal-agen-utilisasi');
  if (elUtil) {
    elUtil.textContent = `${item.active_reseller || 0} / ${item.total_reseller || 1} Anak Aktif (${formatPct(item.pct_active_reseller)})`;
  }

  // Transaksi
  const tot = item.total_trx || 0;
  const ew = item.ewallet_trx || 0;
  const pctEw = item.pct_ewallet || 0;

  document.getElementById('modal-agen-ewallet-trx').textContent = formatIDR(ew);
  document.getElementById('modal-agen-ewallet-pct').textContent = formatPct(pctEw);
  document.getElementById('modal-agen-telco-trx').textContent = formatIDR(item.telco_trx || 0);
  document.getElementById('modal-agen-ppob-trx').textContent = formatIDR(item.ppob_trx || 0);
  document.getElementById('modal-agen-token-trx').textContent = formatIDR(item.token_trx || 0);

  document.getElementById('modal-agen-bar-pct').textContent = formatPct(pctEw);
  document.getElementById('modal-agen-bar-tot').textContent = formatIDR(tot);
  document.getElementById('modal-agen-bar-fill').style.width = `${Math.min(pctEw, 100)}%`;

  // Render Tabel Reseller Downline (Children)
  const childTbody = document.getElementById('modal-child-tbody');
  const childCount = document.getElementById('modal-child-count');
  const children = item.children || [];

  if (childCount) childCount.textContent = children.length;

  if (childTbody) {
    if (children.length === 0) {
      childTbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding: 16px; color: var(--text-muted);">Tidak ada reseller downline terdaftar di bawah agen ini.</td></tr>`;
    } else {
      let cHtml = '';
      children.forEach((c, cIdx) => {
        const isAct = c.is_active;
        const badge = isAct ? `<span class="pill positive" style="font-size: 11px;">Aktif</span>` : `<span class="pill" style="font-size: 11px; background: #f1f5f9; color: #94a3b8;">0 Trx</span>`;
        cHtml += `
          <tr>
            <td class="text-center" style="color: var(--text-muted);">${cIdx + 1}</td>
            <td style="font-family: monospace; font-weight: 600;">${escapeHtml(c.kode)}</td>
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td class="text-right" style="font-weight: 700; color: ${isAct ? 'var(--text-main)' : 'var(--text-muted)'};">${formatIDR(c.trx_month)}</td>
            <td class="text-center">${badge}</td>
          </tr>
        `;
      });
      childTbody.innerHTML = cHtml;
    }
  }

  modal.style.display = 'flex';
};

window.closeAgenModal = function() {
  const modal = document.getElementById('agen-modal');
  if (modal) modal.style.display = 'none';
};

document.addEventListener('click', function(e) {
  const modal = document.getElementById('agen-modal');
  if (modal && modal.style.display === 'flex' && e.target === modal) {
    modal.style.display = 'none';
  }
});

function ensureXlsxLoaded() {
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/static/js/xlsx.full.min.js';
    s.onload = () => resolve();
    s.onerror = (err) => reject(err);
    document.head.appendChild(s);
  });
}

window.exportAgenExcel = async function() {
  const rows = agenState.filteredRows;
  if (!rows || rows.length === 0) {
    alert('Tidak ada data agen yang cocok dengan filter untuk diekspor.');
    return;
  }

  const period = (agenState.raw && agenState.raw.selected_month) || '2026';
  const isChurn = agenState.activeTab === 'churn';

  const tabLabels = {
    semua_aktif: 'Semua_Aktif',
    rutin: 'Aktif_Rutin',
    baru: 'Baru_Reaktivasi',
    churn: 'Pasif_Churn',
    ewallet_high: 'Dominan_EWALLET'
  };
  const tabName = tabLabels[agenState.activeTab] || agenState.activeTab;
  const cabangName = agenState.selectedCabang === 'ALL' ? 'Semua_Cabang' : agenState.selectedCabang.replace(/\s+/g, '_');

  try {
    await ensureXlsxLoaded();
  } catch (err) {
    console.warn('XLSX library gagal dimuat, fallback CSV:', err);
    return exportAgenCSVFallback();
  }

  const headers = isChurn ? [
    'No',
    'Agen ID',
    'Nama Toko Induk',
    'Cabang',
    'SCO',
    'DSO',
    'Jadwal Kunjungan',
    'Limit Plafon (Rp)',
    'Status Toko',
    'Total Reseller Anak',
    'Trx Bulan Lalu',
    'Trx Bulan Ini',
    'Status Keaktifan'
  ] : [
    'No',
    'Agen ID',
    'Nama Toko Induk',
    'Cabang',
    'SCO',
    'DSO',
    'Jadwal Kunjungan',
    'Limit Plafon (Rp)',
    'Status Toko',
    'Total Reseller Anak',
    'Anak Aktif Bulan Ini',
    '% Anak Aktif',
    'Total Trx Rollup',
    'Trx EWALLET',
    '% EWALLET',
    'Trx TELCO',
    'Trx PPOB',
    'Trx TOKEN PLN',
    'Status Keaktifan'
  ];

  const sheetData = [headers];

  rows.forEach((r, idx) => {
    if (isChurn) {
      sheetData.push([
        idx + 1,
        r.agen_id || '',
        r.agen_name || '',
        r.cabang || '',
        r.sco || '-',
        r.dso || '-',
        r.jadwal || '-',
        Number(r.limit) || 0,
        r.status || '-',
        Number(r.total_reseller) || 0,
        Number(r.prev_trx) || 0,
        0,
        r.activity_status || 'Pasif / Churn'
      ]);
    } else {
      sheetData.push([
        idx + 1,
        r.agen_id || '',
        r.agen_name || '',
        r.cabang || '',
        r.sco || '-',
        r.dso || '-',
        r.jadwal || '-',
        Number(r.limit) || 0,
        r.status || '-',
        Number(r.total_reseller) || 0,
        Number(r.active_reseller) || 0,
        Number(r.pct_active_reseller ? (r.pct_active_reseller / 100).toFixed(3) : 0),
        Number(r.total_trx) || 0,
        Number(r.ewallet_trx) || 0,
        Number(r.pct_ewallet ? (r.pct_ewallet / 100).toFixed(3) : 0),
        Number(r.telco_trx) || 0,
        Number(r.ppob_trx) || 0,
        Number(r.token_trx) || 0,
        r.activity_status || 'Aktif Rutin'
      ]);
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Formatting % columns
  if (!isChurn) {
    for (let r = 1; r < sheetData.length; r++) {
      const cellPctAnak = XLSX.utils.encode_cell({ r: r, c: 11 });
      if (ws[cellPctAnak]) ws[cellPctAnak].z = '0.0%';

      const cellPctEw = XLSX.utils.encode_cell({ r: r, c: 14 });
      if (ws[cellPctEw]) ws[cellPctEw].z = '0.0%';
    }
  }

  // Formatting Limit Column (index 7)
  for (let r = 1; r < sheetData.length; r++) {
    const cellLimit = XLSX.utils.encode_cell({ r: r, c: 7 });
    if (ws[cellLimit]) ws[cellLimit].z = '#,##0';
  }

  // Auto-width kolom
  const colWidths = headers.map((h, colIdx) => {
    let maxLen = h.length;
    sheetData.forEach(row => {
      const val = row[colIdx] != null ? String(row[colIdx]) : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  const sheetTitle = isChurn ? 'Agen Churn' : 'Induk Agen Rollup';
  XLSX.utils.book_append_sheet(wb, ws, sheetTitle);

  const filename = `Agen_ASTAGA_${period}_${tabName}_${cabangName}.xlsx`;
  XLSX.writeFile(wb, filename);
};

function exportAgenCSVFallback() {
  const rows = agenState.filteredRows;
  const period = (agenState.raw && agenState.raw.selected_month) || '2026';
  const headers = ['Agen ID', 'Nama Toko Induk', 'Cabang', 'SCO', 'DSO', 'Jadwal', 'Limit', 'Status Toko', 'Total Reseller', 'Anak Aktif', 'Total Trx Rollup', 'Trx EWALLET', '% EWALLET', 'Status'];

  const csvLines = [headers.join(',')];
  rows.forEach(r => {
    const line = [
      `"${r.agen_id || ''}"`,
      `"${(r.agen_name || '').replace(/"/g, '""')}"`,
      `"${r.cabang || ''}"`,
      `"${r.sco || ''}"`,
      `"${r.dso || ''}"`,
      `"${r.jadwal || ''}"`,
      r.limit || 0,
      `"${r.status || ''}"`,
      r.total_reseller || 0,
      r.active_reseller || 0,
      r.total_trx || 0,
      r.ewallet_trx || 0,
      r.pct_ewallet || 0,
      `"${r.activity_status || ''}"`
    ];
    csvLines.push(line.join(','));
  });

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Agen_ASTAGA_${period}_${agenState.activeTab}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
