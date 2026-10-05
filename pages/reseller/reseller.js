// pages/reseller/reseller.js — Controller Analisa Customer & Reseller ASTAGA

let resellerState = {
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

window.loadReseller = async function(monthCode = null) {
  const tbody = document.getElementById('reseller-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding: 40px; color: var(--text-muted);"><div class="loader">Memuat data Customer &amp; Reseller ASTAGA...</div></td></tr>`;
  }

  try {
    let url = '/api/reseller?year=2026';
    if (monthCode) {
      url += `&month=${encodeURIComponent(monthCode)}`;
    }
    const res = await fetch(url + '&t=' + Date.now());
    const json = await res.json();

    if (!json.ok) {
      throw new Error(json.error || 'Gagal memuat data reseller');
    }

    resellerState.raw = json.data;
    renderResellerHeaderAndKPI();
    renderResellerControls();
    applyResellerFilters();
  } catch (err) {
    console.error('Error loadReseller:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding: 30px; color: var(--negative);">Terjadi kesalahan: ${err.message}</td></tr>`;
    }
  }
};

function renderResellerHeaderAndKPI() {
  const data = resellerState.raw;
  if (!data || !data.kpi) return;

  const k = data.kpi;
  const elReg = document.getElementById('kpi-total-registered');
  const elAct = document.getElementById('kpi-active-current');
  const elRate = document.getElementById('kpi-active-rate');
  const elRet = document.getElementById('kpi-retained');
  const elNew = document.getElementById('kpi-new-reactivated');
  const elChu = document.getElementById('kpi-churned');
  const elTrx = document.getElementById('kpi-total-trx');
  const elPew = document.getElementById('kpi-pct-ewallet');

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

  const elCS = document.getElementById('count-semua-aktif');
  const elCR = document.getElementById('count-rutin');
  const elCB = document.getElementById('count-baru');
  const elCC = document.getElementById('count-churn');
  const elCE = document.getElementById('count-ewallet');

  if (elCS) elCS.textContent = formatIDR(countSemua);
  if (elCR) elCR.textContent = formatIDR(countRutin);
  if (elCB) elCB.textContent = formatIDR(countBaru);
  if (elCC) elCC.textContent = formatIDR(countChurn);
  if (elCE) elCE.textContent = formatIDR(countEwallet);
}

function renderResellerControls() {
  const data = resellerState.raw;
  if (!data) return;

  // Month selector
  const mSelect = document.getElementById('reseller-month-select');
  if (mSelect && data.available_months) {
    mSelect.innerHTML = data.available_months.map(m => {
      const isSel = m === data.selected_month ? 'selected' : '';
      return `<option value="${m}" ${isSel}>${m}</option>`;
    }).join('');
  }

  // Cabang selector
  const cSelect = document.getElementById('reseller-cabang-select');
  if (cSelect && data.all_cabangs) {
    const currentVal = resellerState.selectedCabang;
    let opts = '<option value="ALL">Semua Cabang</option>';
    data.all_cabangs.forEach(c => {
      const isSel = c === currentVal ? 'selected' : '';
      opts += `<option value="${c}" ${isSel}>${c}</option>`;
    });
    cSelect.innerHTML = opts;
  }
}

window.onResellerMonthChange = function(monthCode) {
  if (!monthCode) return;
  window.loadReseller(monthCode);
};

window.setResellerTab = function(tabName, btnElem) {
  resellerState.activeTab = tabName;
  resellerState.page = 1;

  document.querySelectorAll('#status-filter-pills .reseller-tab').forEach(b => b.classList.remove('active'));
  if (btnElem) btnElem.classList.add('active');

  applyResellerFilters();
};

window.applyResellerFilters = function() {
  const data = resellerState.raw;
  if (!data) return;

  const cSelect = document.getElementById('reseller-cabang-select');
  if (cSelect) resellerState.selectedCabang = cSelect.value;

  const sInput = document.getElementById('reseller-search-input');
  if (sInput) resellerState.searchQuery = sInput.value.trim().toLowerCase();

  let source = [];
  if (resellerState.activeTab === 'churn') {
    source = data.churn_rows || [];
  } else if (resellerState.activeTab === 'rutin') {
    source = (data.rows || []).filter(r => r.activity_status === 'Aktif Rutin');
  } else if (resellerState.activeTab === 'baru') {
    source = (data.rows || []).filter(r => r.activity_status === 'Baru / Reaktivasi');
  } else if (resellerState.activeTab === 'ewallet_high') {
    source = (data.rows || []).filter(r => (r.pct_ewallet || 0) >= 50);
  } else {
    source = data.rows || [];
  }

  // Filter Cabang
  if (resellerState.selectedCabang !== 'ALL') {
    source = source.filter(r => (r.cabang || '').toUpperCase() === resellerState.selectedCabang.toUpperCase());
  }

  // Filter Search
  if (resellerState.searchQuery) {
    const q = resellerState.searchQuery;
    source = source.filter(r => {
      const k = (r.kode || '').toLowerCase();
      const n = (r.name || '').toLowerCase();
      const s = (r.sco || '').toLowerCase();
      const a = (r.agen_name || '').toLowerCase();
      return k.includes(q) || n.includes(q) || s.includes(q) || a.includes(q);
    });
  }

  resellerState.filteredRows = source;
  resellerState.page = 1;
  renderResellerTable();
};

function renderResellerTable() {
  const tbody = document.getElementById('reseller-tbody');
  const countEl = document.getElementById('table-row-count');
  const pageInfo = document.getElementById('table-page-info');
  const pageNum = document.getElementById('page-current-num');
  const btnPrev = document.getElementById('btn-page-prev');
  const btnNext = document.getElementById('btn-page-next');
  const titleEl = document.getElementById('table-title');

  const total = resellerState.filteredRows.length;
  if (countEl) countEl.textContent = `${formatIDR(total)} reseller`;

  if (titleEl) {
    const tabLabels = {
      semua_aktif: 'Daftar Semua Reseller Aktif',
      rutin: 'Reseller Aktif Rutin (Retained)',
      baru: 'Reseller Baru / Reaktivasi',
      churn: 'Reseller Pasif / Churn (Bulan Lalu Aktif, Bulan Ini 0)',
      ewallet_high: 'Reseller Dominan EWALLET (Porsi ≥ 50%)'
    };
    titleEl.textContent = tabLabels[resellerState.activeTab] || 'Daftar Reseller';
  }

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding: 30px; color: var(--text-muted);">Tidak ada data reseller yang cocok dengan filter.</td></tr>`;
    if (pageInfo) pageInfo.textContent = 'Menampilkan 0 dari 0 data';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }

  const startIdx = (resellerState.page - 1) * resellerState.pageSize;
  const endIdx = Math.min(startIdx + resellerState.pageSize, total);
  const pageRows = resellerState.filteredRows.slice(startIdx, endIdx);

  if (pageInfo) {
    pageInfo.textContent = `Menampilkan ${startIdx + 1} - ${endIdx} dari ${formatIDR(total)} data`;
  }
  if (pageNum) pageNum.textContent = resellerState.page;
  if (btnPrev) btnPrev.disabled = resellerState.page <= 1;
  if (btnNext) btnNext.disabled = endIdx >= total;

  let html = '';
  pageRows.forEach((r, idx) => {
    const rowNum = startIdx + idx + 1;
    const isChurn = resellerState.activeTab === 'churn' || r.activity_status === 'Pasif / Churn';

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

    // Mini Product Composition
    let compHtml = '';
    if (isChurn) {
      compHtml = `<span style="font-size: 11.5px; color: var(--text-muted);">Bln lalu: ${formatIDR(r.prev_trx || 0)} trx</span>`;
    } else {
      compHtml = `
        <div style="font-size: 11.5px; display: flex; gap: 6px; flex-wrap: wrap;">
          <span style="color: #1d4ed8; font-weight: 600;">EW: ${formatIDR(r.ewallet_trx || 0)}</span>
          <span style="color: #15803d;">TEL: ${formatIDR(r.telco_trx || 0)}</span>
          <span style="color: #a16207;">PP: ${formatIDR(r.ppob_trx || 0)}</span>
          <span style="color: #7e22ce;">PLN: ${formatIDR(r.token_trx || 0)}</span>
        </div>
      `;
    }

    html += `
      <tr style="cursor: pointer;" onclick="openResellerModal('${encodeURIComponent(r.kode)}')">
        <td class="text-center" style="color: var(--text-muted); font-size: 12px;">${rowNum}</td>
        <td>
          <div style="font-weight: 700; color: var(--text-main); font-size: 13.5px;">${escapeHtml(r.kode)}</div>
          <div style="font-size: 12px; color: var(--text-muted); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(r.name)}">
            ${escapeHtml(r.name)}
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge" style="font-size: 11px; padding: 2px 7px;">${escapeHtml(r.cabang || '-')}</span>
          </div>
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 3px;">
            SCO: <strong>${escapeHtml(r.sco || '-')}</strong>
          </div>
        </td>
        <td>
          <div style="font-size: 12px; font-weight: 600; color: var(--text-main);">
            ${escapeHtml(r.jadwal || '-')}
          </div>
          <div style="font-size: 11.5px; color: var(--text-muted);">
            Limit: Rp ${formatIDR(r.limit || 0)}
          </div>
        </td>
        <td class="text-right font-semibold" style="font-size: 13.5px; color: var(--text-main);">
          ${formatIDR(r.total_trx || 0)}
        </td>
        <td class="text-right font-semibold" style="color: #2563eb;">
          ${formatIDR(r.ewallet_trx || 0)}
        </td>
        <td class="text-right">
          ${ewBadge}
        </td>
        <td>
          ${compHtml}
        </td>
        <td class="text-center">
          ${statusBadge}
        </td>
        <td class="text-center">
          <button type="button" class="reseller-btn-page" style="padding: 3px 8px; font-size: 11px;" onclick="event.stopPropagation(); openResellerModal('${encodeURIComponent(r.kode)}')">
            Detail
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

window.prevResellerPage = function() {
  if (resellerState.page > 1) {
    resellerState.page--;
    renderResellerTable();
  }
};

window.nextResellerPage = function() {
  const maxPage = Math.ceil(resellerState.filteredRows.length / resellerState.pageSize);
  if (resellerState.page < maxPage) {
    resellerState.page++;
    renderResellerTable();
  }
};

window.openResellerModal = function(encodedKode) {
  const kode = decodeURIComponent(encodedKode);
  const data = resellerState.raw;
  if (!data) return;

  // Cari di rows atau churn_rows
  let item = (data.rows || []).find(r => r.kode === kode);
  if (!item) {
    item = (data.churn_rows || []).find(r => r.kode === kode);
  }
  if (!item) return;

  document.getElementById('modal-reseller-title').textContent = item.name || item.kode;
  document.getElementById('modal-reseller-kode').textContent = `Kode Reseller: ${item.kode}`;
  document.getElementById('modal-cabang').textContent = item.cabang || '-';
  document.getElementById('modal-sco').textContent = item.sco || '-';
  document.getElementById('modal-agen-id').textContent = `${item.agen_id || '-'} (${item.agen_name || '-'})`;
  document.getElementById('modal-jadwal').textContent = item.jadwal || '-';
  document.getElementById('modal-limit').textContent = `Rp ${formatIDR(item.limit || 0)}`;

  const statusEl = document.getElementById('modal-status');
  if (statusEl) {
    statusEl.textContent = item.activity_status || '-';
    if (item.activity_status === 'Pasif / Churn') {
      statusEl.className = 'pill negative';
    } else if (item.activity_status === 'Baru / Reaktivasi') {
      statusEl.className = 'pill';
      statusEl.style.background = '#e0f2fe';
      statusEl.style.color = '#0369a1';
    } else {
      statusEl.className = 'pill positive';
    }
  }

  // Komposisi
  const tot = item.total_trx || 0;
  const ew = item.ewallet_trx || 0;
  const pctEw = item.pct_ewallet || 0;

  document.getElementById('modal-ewallet-trx').textContent = formatIDR(ew);
  document.getElementById('modal-ewallet-pct').textContent = formatPct(pctEw);
  document.getElementById('modal-telco-trx').textContent = formatIDR(item.telco_trx || 0);
  document.getElementById('modal-ppob-trx').textContent = formatIDR(item.ppob_trx || 0);
  document.getElementById('modal-token-trx').textContent = formatIDR(item.token_trx || 0);

  document.getElementById('modal-bar-pct').textContent = formatPct(pctEw);
  document.getElementById('modal-bar-tot').textContent = formatIDR(tot);

  const fillEl = document.getElementById('modal-bar-fill');
  if (fillEl) {
    fillEl.style.width = `${Math.min(pctEw, 100)}%`;
    if (pctEw >= 50) {
      fillEl.style.background = '#dc2626';
    } else {
      fillEl.style.background = '#2563eb';
    }
  }

  const modal = document.getElementById('reseller-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeResellerModal = function() {
  const modal = document.getElementById('reseller-modal');
  if (modal) modal.style.display = 'none';
};

// Tutup modal jika klik di luar box
document.addEventListener('click', function(e) {
  const modal = document.getElementById('reseller-modal');
  if (modal && modal.style.display === 'flex' && e.target === modal) {
    modal.style.display = 'none';
  }
});

window.exportResellerData = function() {
  const rows = resellerState.filteredRows;
  if (!rows || rows.length === 0) {
    alert('Tidak ada data untuk diekspor.');
    return;
  }

  const period = (resellerState.raw && resellerState.raw.selected_month) || '2026';
  const headers = ['Kode', 'Nama', 'Cabang', 'SCO', 'Agen ID', 'Jadwal', 'Limit', 'Total Trx', 'Trx EWALLET', '% EWALLET', 'Trx Telco', 'Trx PPOB', 'Trx PLN', 'Status Keaktifan'];
  
  const csvLines = [headers.join(',')];
  rows.forEach(r => {
    const line = [
      `"${r.kode || ''}"`,
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${r.cabang || ''}"`,
      `"${r.sco || ''}"`,
      `"${r.agen_id || ''}"`,
      `"${r.jadwal || ''}"`,
      r.limit || 0,
      r.total_trx || 0,
      r.ewallet_trx || 0,
      r.pct_ewallet || 0,
      r.telco_trx || 0,
      r.ppob_trx || 0,
      r.token_trx || 0,
      `"${r.activity_status || ''}"`
    ];
    csvLines.push(line.join(','));
  });

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Reseller_ASTAGA_${period}_${resellerState.activeTab}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
