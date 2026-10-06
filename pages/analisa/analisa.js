// pages/analisa/analisa.js — Controller Dashboard Analisa (Chart Only, Tren Daily Trx Berbasis Cut-off Bulan)

const activeFilters = {
  brand: "ASTAGA",
  year: "ALL",
  month: "ALL"
};

let currentAnalisaTab = "distribusi";
let cachedAnalisaData = null;
let rawGoldData = null;

// Registry chart instances untuk pembersihan memori (destroy on re-render)
const chartInstances = {};

function destroyChart(name) {
  if (chartInstances[name]) {
    chartInstances[name].destroy();
    chartInstances[name] = null;
  }
}

// ── PILL FILTER HANDLERS ──
function setPillFilter(filterType, value) {
  activeFilters[filterType] = value;

  // Update visual active pill
  const group = document.getElementById(`pills-${filterType}`);
  if (group) {
    group.querySelectorAll(".filter-pill").forEach(btn => {
      const btnVal = btn.getAttribute(`data-${filterType}`);
      if (btnVal === value) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  fetchAndRenderAnalisa();
}

// ── TAB SWITCHER HANDLER ──
function switchAnalisaTab(tabName) {
  currentAnalisaTab = tabName;

  // Update tab buttons
  ["distribusi", "service", "lain"].forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const sec = document.getElementById(`section-analisa-${t}`);
    if (btn) {
      if (t === tabName) btn.classList.add("active");
      else btn.classList.remove("active");
    }
    if (sec) {
      sec.style.display = (t === tabName) ? "flex" : "none";
    }
  });

  // Update sidebar sub-menu highlight
  document.querySelectorAll(".nav-sub-link").forEach(el => {
    const href = el.getAttribute("href");
    if (href === `#analisa-${tabName}` || (tabName === "distribusi" && href === "#analisa")) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });

  // Render visual jika data sudah tersedia
  if (cachedAnalisaData) {
    renderCurrentTabCharts(cachedAnalisaData);
  } else {
    fetchAndRenderAnalisa();
  }
}

// ── DATA FETCHING (API DENGAN GOLD STATIC FALLBACK) ──
async function fetchAndRenderAnalisa() {
  // 1. Coba fetch dari backend endpoint API
  try {
    const url = `/api/analisa/data?brand=${activeFilters.brand}&year=${activeFilters.year}&month=${activeFilters.month}`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (json && json.ok) {
        cachedAnalisaData = json;
        renderCurrentTabCharts(json);
        return;
      }
    }
  } catch (e) {
    // API endpoint belum aktif di live server, fallback ke Gold Static Data
  }

  // 2. Fallback: Baca Gold Aggregated Data JSON (/pages/analisa/data.json)
  try {
    if (!rawGoldData) {
      const fRes = await fetch(`/pages/analisa/data.json?t=` + Date.now());
      rawGoldData = await fRes.json();
    }
    const processed = filterGoldDataLocal(rawGoldData, activeFilters.brand, activeFilters.year, activeFilters.month);
    cachedAnalisaData = processed;
    renderCurrentTabCharts(processed);
  } catch (err) {
    console.error("Error loading gold data:", err);
  }
}

// ── FALLBACK ENGINE CLIENT-SIDE (Sama persis dengan analisa_engine.py) ──
function filterGoldDataLocal(dataAll, brand, year, month) {
  const brandUpper = (brand || "ALL").toUpperCase();
  const targetBrands = (brandUpper === "ALL" || brandUpper === "GABUNGAN") ? ["ASTAGA", "OKIPAY"] : [brandUpper];
  
  const allYms = Object.keys(dataAll["ASTAGA"] || {}).sort();

  const MONTH_NAMES = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
    "05": "Mei", "06": "Jun", "07": "Jul", "08": "Agu",
    "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
  };

  const MONTH_FULL = {
    "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
    "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
    "09": "September", "10": "Oktober", "11": "November", "12": "Desember"
  };

  // 1. GRANULARITAS HARIAN (DAILY: TGL 1 s/d 30/31)
  if (year !== "ALL" && month !== "ALL") {
    const targetYm = `${year}-${month.padStart(2, "0")}`;
    const sampleItem = (dataAll[targetBrands[0]] && dataAll[targetBrands[0]][targetYm]) ? dataAll[targetBrands[0]][targetYm] : {};
    const sampleDaily = sampleItem.daily || [];
    const isMtd = sampleItem.is_mtd || false;
    const activeDays = sampleItem.active_days || sampleDaily.length;

    const timeline = [];
    let totTrx = 0;
    let totCustSum = 0;
    const categoriesTotal = {};
    const branchesTotal = {};

    sampleDaily.forEach((dObj, dIdx) => {
      const dayNum = dObj.day;
      const dLabel = `Tgl ${dayNum}`;
      let dayTrx = 0;
      let dayCust = 0;
      let daySuksesSum = 0;

      targetBrands.forEach(b => {
        const bItem = (dataAll[b] && dataAll[b][targetYm]) ? dataAll[b][targetYm] : {};
        const bDaily = bItem.daily || [];
        if (dIdx < bDaily.length) {
          const bD = bDaily[dIdx];
          dayTrx += bD.trx || 0;
          dayCust += bD.cust || 0;
          daySuksesSum += bD.sukses_pct || 98.5;
        }
      });

      const tpm = dayCust > 0 ? Number((dayTrx / dayCust).toFixed(2)) : 0;
      totTrx += dayTrx;
      totCustSum += dayCust;

      const dayRatio = sampleItem.trx_count > 0 ? dayTrx / sampleItem.trx_count : 0;
      const dayCats = {};
      const dayBranches = {};

      targetBrands.forEach(b => {
        const bItem = (dataAll[b] && dataAll[b][targetYm]) ? dataAll[b][targetYm] : {};
        Object.entries(bItem.categories || {}).forEach(([cat, cVal]) => {
          const cDay = Math.round(cVal * dayRatio);
          dayCats[cat] = (dayCats[cat] || 0) + cDay;
          categoriesTotal[cat] = (categoriesTotal[cat] || 0) + cDay;
        });
        Object.entries(bItem.branches || {}).forEach(([br, brVal]) => {
          const bDay = Math.round(brVal * dayRatio);
          dayBranches[br] = (dayBranches[br] || 0) + bDay;
          branchesTotal[br] = (branchesTotal[br] || 0) + bDay;
        });
      });

      timeline.push({
        day: dayNum,
        date: dObj.date || `${targetYm}-${String(dayNum).padStart(2, "0")}`,
        label: dLabel,
        trx: dayTrx,
        daily_trx: dayTrx,
        customers: dayCust,
        tpm: tpm,
        sukses_pct: Number((daySuksesSum / targetBrands.length).toFixed(1)),
        dur_sec: 2.8,
        categories: dayCats,
        branches: dayBranches
      });
    });

    const countPts = timeline.length || 1;
    const avgDailyTrx = Math.round(totTrx / countPts);
    const avgDailyCust = Math.round(totCustSum / countPts);
    const avgTpm = Number((timeline.reduce((acc, t) => acc + t.tpm, 0) / countPts).toFixed(2));

    const hourlyHours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
    const hourlyWeights = [
      0.012, 0.008, 0.005, 0.004, 0.006, 0.018, 0.035, 0.062, 0.078, 0.082, 0.085, 0.087,
      0.081, 0.076, 0.075, 0.079, 0.086, 0.092, 0.098, 0.102, 0.094, 0.072, 0.045, 0.022
    ];
    const hourlyDistribution = hourlyHours.map((h, i) => ({
      hour: h,
      trx: Math.round(avgDailyTrx * hourlyWeights[i])
    }));

    const weekdayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
    const weekdayWeights = [0.142, 0.144, 0.141, 0.146, 0.155, 0.158, 0.114];
    const weekdayDistribution = weekdayNames.map((d, i) => ({
      day: d,
      trx: Math.round((totTrx / 4.3) * weekdayWeights[i])
    }));

    const topCategory = Object.keys(categoriesTotal).length > 0 
      ? Object.entries(categoriesTotal).sort((a,b) => b[1] - a[1])[0][0] : "EWALLET";
    const topBranch = Object.keys(branchesTotal).length > 0 
      ? Object.entries(branchesTotal).sort((a,b) => b[1] - a[1])[0][0] : "BSD";

    return {
      ok: true,
      brand: brandUpper,
      year, month,
      granularity: "daily",
      is_mtd: isMtd,
      active_days: activeDays,
      summary: {
        total_trx: totTrx,
        daily_trx_avg: avgDailyTrx,
        avg_monthly_trx: avgDailyTrx,
        avg_monthly_cust: avgDailyCust,
        avg_tpm: avgTpm,
        total_points: countPts,
        granularity_label: `Harian (${MONTH_FULL[month.padStart(2, "0")] || month} ${year})` + (isMtd ? " • MTD 4 Hari" : ""),
        top_category: topCategory,
        top_branch: topBranch
      },
      timeline,
      categories_total: categoriesTotal,
      branches_total: branchesTotal,
      hourly_distribution: hourlyDistribution,
      weekday_distribution: weekdayDistribution,
      status_breakdown: { "Sukses": 98.5, "Gagal Nomor": 0.8, "Gagal Saldo": 0.4, "Timeout Provider": 0.3 }
    };
  }

  // 2. GRANULARITAS TAHUNAN (4 TAHUN: 2023 - 2026)
  if (year === "ALL" && month === "ALL") {
    const years = ["2023", "2024", "2025", "2026"];
    const timeline = [];
    let totTrx = 0;
    let totCustSum = 0;
    let totDaysAll = 0;
    const categoriesTotal = {};
    const branchesTotal = {};

    years.forEach(y => {
      const yYms = allYms.filter(ym => ym.startsWith(`${y}-`));
      let yTrx = 0;
      let yCustDailySum = 0;
      let ySuksesSum = 0;
      let yDays = 0;
      const yCats = {};
      const yBranches = {};

      yYms.forEach(ym => {
        targetBrands.forEach(b => {
          const item = (dataAll[b] && dataAll[b][ym]) ? dataAll[b][ym] : null;
          if (!item) return;
          yTrx += item.trx_count || 0;
          
          // Ambil rata-rata customer aktif harian per bulan
          const bDaily = item.daily || [];
          const bDayCust = bDaily.length > 0
            ? (bDaily.reduce((acc, d) => acc + (d.cust || 0), 0) / bDaily.length)
            : (item.daily_customers || 1200);
          yCustDailySum += bDayCust;
          ySuksesSum += item.sukses_pct || 98.4;

          Object.entries(item.categories || {}).forEach(([cat, cVal]) => {
            yCats[cat] = (yCats[cat] || 0) + cVal;
            categoriesTotal[cat] = (categoriesTotal[cat] || 0) + cVal;
          });

          Object.entries(item.branches || {}).forEach(([br, brVal]) => {
            yBranches[br] = (yBranches[br] || 0) + brVal;
            branchesTotal[br] = (branchesTotal[br] || 0) + brVal;
          });
        });

        const sampleB = dataAll[targetBrands[0]] && dataAll[targetBrands[0]][ym];
        yDays += (sampleB && sampleB.days_count) ? sampleB.days_count : 30;
      });

      const mCount = yYms.length || 1;
      const yAvgCust = Math.round(yCustDailySum / (mCount * targetBrands.length));
      const yDailyTrx = yDays > 0 ? Math.round(yTrx / yDays) : 0;
      const yTpm = yAvgCust > 0 ? Number((yDailyTrx / yAvgCust).toFixed(2)) : 0;
      const ySukses = Number((ySuksesSum / (mCount * targetBrands.length)).toFixed(1));

      totTrx += yTrx;
      totCustSum += yAvgCust;
      totDaysAll += yDays;

      timeline.push({
        year: y,
        label: `Tahun ${y}` + (y === "2026" ? " (YTD/MTD)" : ""),
        trx: yTrx,
        daily_trx: yDailyTrx,
        days_count: yDays,
        customers: yAvgCust,
        tpm: yTpm,
        sukses_pct: ySukses,
        dur_sec: 2.8,
        categories: yCats,
        branches: yBranches
      });
    });

    const countPts = timeline.length || 1;
    const avgYearlyTrx = Math.round(totTrx / countPts);
    const avgYearlyCust = Math.round(totCustSum / countPts);
    const overallDailyTrx = totDaysAll > 0 ? Math.round(totTrx / totDaysAll) : 0;
    const avgTpm = avgYearlyCust > 0 ? Number((overallDailyTrx / avgYearlyCust).toFixed(2)) : 0;

    const hourlyHours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
    const hourlyWeights = [
      0.012, 0.008, 0.005, 0.004, 0.006, 0.018, 0.035, 0.062, 0.078, 0.082, 0.085, 0.087,
      0.081, 0.076, 0.075, 0.079, 0.086, 0.092, 0.098, 0.102, 0.094, 0.072, 0.045, 0.022
    ];
    const hourlyDistribution = hourlyHours.map((h, i) => ({
      hour: h,
      trx: Math.round(overallDailyTrx * hourlyWeights[i])
    }));

    const weekdayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
    const weekdayWeights = [0.142, 0.144, 0.141, 0.146, 0.155, 0.158, 0.114];
    const weekdayDistribution = weekdayNames.map((d, i) => ({
      day: d,
      trx: Math.round((totTrx / 52) * weekdayWeights[i])
    }));

    const topCategory = Object.keys(categoriesTotal).length > 0 
      ? Object.entries(categoriesTotal).sort((a,b) => b[1] - a[1])[0][0] : "EWALLET";
    const topBranch = Object.keys(branchesTotal).length > 0 
      ? Object.entries(branchesTotal).sort((a,b) => b[1] - a[1])[0][0] : "BSD";

    return {
      ok: true,
      brand: brandUpper,
      year: "ALL",
      month: "ALL",
      granularity: "yearly",
      is_mtd: false,
      summary: {
        total_trx: totTrx,
        daily_trx_avg: overallDailyTrx,
        avg_monthly_trx: avgYearlyTrx,
        avg_monthly_cust: avgYearlyCust,
        avg_tpm: avgTpm,
        total_points: countPts,
        granularity_label: "Komparasi Tahunan (2023 - 2026)",
        top_category: topCategory,
        top_branch: topBranch
      },
      timeline,
      categories_total: categoriesTotal,
      branches_total: branchesTotal,
      hourly_distribution: hourlyDistribution,
      weekday_distribution: weekdayDistribution,
      status_breakdown: { "Sukses": 98.4, "Gagal Nomor": 0.8, "Gagal Saldo": 0.5, "Timeout Provider": 0.3 }
    };
  }

  // 3. GRANULARITAS 12 BULAN DI 1 TAHUN (User pilih Tahun spesifik dan Bulan = 'ALL')
  const filteredYms = allYms.filter(ym => {
    const [y, m] = ym.split("-");
    if (year !== "ALL" && y !== year) return false;
    if (month !== "ALL" && m !== month) return false;
    return true;
  });

  const timeline = [];
  let totTrx = 0;
  let totCust = 0;
  let totTpmSum = 0;
  let totDaysSum = 0;
  const categoriesTotal = {};
  const branchesTotal = {};

  filteredYms.forEach(ym => {
    const [y, m] = ym.split("-");
    const mName = MONTH_NAMES[m] || m;
    const isCurMtd = (ym === "2026-10");
    const label = isCurMtd ? `${mName} (MTD-4h)` : mName;

    let ymTrx = 0;
    let ymCust = 0;
    let ymSuksesSum = 0;
    let ymDurSum = 0;
    let ymDailyCust = 0;
    const ymCats = {};
    const ymBranches = {};

    targetBrands.forEach(b => {
      const item = (dataAll[b] && dataAll[b][ym]) ? dataAll[b][ym] : null;
      if (!item) return;

      ymTrx += item.trx_count || 0;
      ymCust += item.active_customers || 0;
      
      const bDaily = item.daily || [];
      const bDayCust = bDaily.length > 0
        ? (bDaily.reduce((acc, d) => acc + (d.cust || 0), 0) / bDaily.length)
        : (item.daily_customers || 1200);
      ymDailyCust += bDayCust;

      ymSuksesSum += item.sukses_pct || 98.4;
      ymDurSum += item.avg_dur_sec || 3.0;

      Object.entries(item.categories || {}).forEach(([cat, cVal]) => {
        ymCats[cat] = (ymCats[cat] || 0) + cVal;
        categoriesTotal[cat] = (categoriesTotal[cat] || 0) + cVal;
      });

      Object.entries(item.branches || {}).forEach(([br, bVal]) => {
        ymBranches[br] = (ymBranches[br] || 0) + bVal;
        branchesTotal[br] = (branchesTotal[br] || 0) + bVal;
      });
    });

    const sampleB = dataAll[targetBrands[0]] && dataAll[targetBrands[0]][ym];
    const numDays = (sampleB && sampleB.days_count) ? sampleB.days_count : 30;

    const dailyTrx = numDays > 0 ? Math.round(ymTrx / numDays) : 0;
    const avgDayCust = Math.round(ymDailyCust / targetBrands.length);
    // TPM Harian = Rata-rata Trx / Hari dibagi Rata-rata Customer / Hari (standar modul #daily)
    const tpm = avgDayCust > 0 ? Number((dailyTrx / avgDayCust).toFixed(2)) : 0;

    totTrx += ymTrx;
    totCust += avgDayCust;
    totTpmSum += tpm;
    totDaysSum += numDays;

    timeline.push({
      ym, year: y, month: m, label,
      is_mtd: isCurMtd,
      days_count: numDays,
      trx: ymTrx,
      daily_trx: dailyTrx,
      customers: avgDayCust,
      tpm: tpm,
      sukses_pct: Number((ymSuksesSum / targetBrands.length).toFixed(1)),
      dur_sec: Number((ymDurSum / targetBrands.length).toFixed(1)),
      categories: ymCats,
      branches: ymBranches
    });
  });

  const countPts = timeline.length || 1;
  const avgMonthlyTrx = Math.round(totTrx / countPts);
  const avgMonthlyCust = Math.round(totCust / countPts);
  const overallDailyTrx = totDaysSum > 0 ? Math.round(totTrx / totDaysSum) : 0;
  const avgTpm = avgMonthlyCust > 0 ? Number((overallDailyTrx / avgMonthlyCust).toFixed(2)) : 0;

  const hourlyHours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
  const hourlyWeights = [
    0.012, 0.008, 0.005, 0.004, 0.006, 0.018, 0.035, 0.062, 0.078, 0.082, 0.085, 0.087,
    0.081, 0.076, 0.075, 0.079, 0.086, 0.092, 0.098, 0.102, 0.094, 0.072, 0.045, 0.022
  ];
  const hourlyDistribution = hourlyHours.map((h, i) => ({
    hour: h,
    trx: Math.round(overallDailyTrx * hourlyWeights[i])
  }));

  const weekdayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  const weekdayWeights = [0.142, 0.144, 0.141, 0.146, 0.155, 0.158, 0.114];
  const weekdayDistribution = weekdayNames.map((d, i) => ({
    day: d,
    trx: Math.round((avgMonthlyTrx / 4.3) * weekdayWeights[i])
  }));

  const topCategory = Object.keys(categoriesTotal).length > 0 
    ? Object.entries(categoriesTotal).sort((a,b) => b[1] - a[1])[0][0] : "EWALLET";
  const topBranch = Object.keys(branchesTotal).length > 0 
    ? Object.entries(branchesTotal).sort((a,b) => b[1] - a[1])[0][0] : "BSD";

  return {
    ok: true,
    brand: brandUpper,
    year, month,
    granularity: "monthly",
    is_mtd: false,
    summary: {
      total_trx: totTrx,
      daily_trx_avg: overallDailyTrx,
      avg_monthly_trx: avgMonthlyTrx,
      avg_monthly_cust: avgMonthlyCust,
      avg_tpm: avgTpm,
      total_points: countPts,
      granularity_label: `Tren 12 Bulan (Tahun ${year})`,
      top_category: topCategory,
      top_branch: topBranch
    },
    timeline,
    categories_total: categoriesTotal,
    branches_total: branchesTotal,
    hourly_distribution: hourlyDistribution,
    weekday_distribution: weekdayDistribution,
    status_breakdown: { "Sukses": 98.4, "Gagal Nomor": 0.8, "Gagal Saldo": 0.5, "Timeout Provider": 0.3 }
  };
}

function renderCurrentTabCharts(data) {
  if (currentAnalisaTab === "distribusi") {
    renderDistribusiTab(data);
  } else if (currentAnalisaTab === "service") {
    renderServiceTab(data);
  } else if (currentAnalisaTab === "lain") {
    renderLainTab(data);
  }
}

// ── ENTRY POINTS DARI ROUTER ──
function loadAnalisa() {
  const hash = window.location.hash || "#analisa";
  if (hash === "#analisa-service") {
    switchAnalisaTab("service");
  } else if (hash === "#analisa-lain") {
    switchAnalisaTab("lain");
  } else {
    switchAnalisaTab("distribusi");
  }
}

function loadAnalisaDistribusi() {
  switchAnalisaTab("distribusi");
}

function loadAnalisaService() {
  switchAnalisaTab("service");
}

function loadAnalisaLain() {
  switchAnalisaTab("lain");
}

// =============================================================================
// 1. TAB: ANALISA DISTRIBUSI (DAILY TRX BERBASIS CUT-OFF BULAN)
// =============================================================================
function renderDistribusiTab(data) {
  const summary = data.summary || {};
  const timeline = data.timeline || [];
  const brandColor = activeFilters.brand === "OKIPAY" ? "#dc2626" : (activeFilters.brand === "ALL" ? "#4f46e5" : "#0284c7");
  const isDaily = data.granularity === "daily";
  const isYearly = data.granularity === "yearly";

  // 1. Update KPI Card Values (Roboto Mono)
  // KPI Card 1: Rata-rata Daily Trx (Cut-off Days)
  const elTrx = document.getElementById("dist-stat-trx");
  if (elTrx) elTrx.textContent = (summary.daily_trx_avg || summary.avg_monthly_trx || 0).toLocaleString("id-ID");

  const elSubTrx = document.getElementById("dist-stat-trx-sub");
  if (elSubTrx) {
    if (isDaily) {
      elSubTrx.textContent = "Rata-rata Trx / Hari (" + (summary.total_trx || 0).toLocaleString("id-ID") + " Total)";
    } else if (isYearly) {
      elSubTrx.textContent = "Daily Trx Rerata Tahunan (" + (summary.total_trx || 0).toLocaleString("id-ID") + " Total)";
    } else {
      elSubTrx.textContent = "Daily Trx Rerata (" + (summary.total_trx || 0).toLocaleString("id-ID") + " Total Trx)";
    }
  }

  // KPI Card 2: Customer Aktif Rata-rata per Hari
  const elCust = document.getElementById("dist-stat-member");
  if (elCust) elCust.textContent = (summary.avg_monthly_cust || 0).toLocaleString("id-ID");

  const elSubCust = document.getElementById("dist-stat-member-sub");
  if (elSubCust) {
    elSubCust.textContent = "Customer Aktif / Hari";
  }

  // KPI Card 3: TPM Harian (Trx per Hari per Customer)
  const elTpm = document.getElementById("dist-stat-tpm");
  if (elTpm) elTpm.textContent = (summary.avg_tpm || 0).toFixed(2);

  const elSubTpm = document.getElementById("dist-stat-tpm-sub");
  if (elSubTpm) {
    elSubTpm.textContent = "Daily Trx / Member (Trx/Hari)";
  }

  // KPI Card 4: Top Cabang
  const elCabang = document.getElementById("dist-stat-top-cabang");
  if (elCabang) elCabang.textContent = summary.top_branch || "-";

  // Update Dynamic Chart Title (D1)
  const elTitle = document.getElementById("dist-trend-title");
  if (elTitle) {
    if (isDaily) {
      elTitle.textContent = `Tren Harian: Volume Transaksi vs Customer Aktif (${summary.granularity_label})`;
    } else if (isYearly) {
      elTitle.textContent = `Tren Daily Trx Tahunan: Trx / Hari vs Customer Aktif (2023 - 2026)`;
    } else {
      elTitle.textContent = `Tren Daily Trx Bulanan: Total Trx / Hari Cut-off (Tahun ${data.year})`;
    }
  }

  // 2. Chart D1: Tren Transaksi (Daily Trx) vs Customer (Combo Bar + Line)
  renderDistTrendChart(timeline, brandColor, isDaily);

  // 3. Chart D2: Kontribusi per Cabang / Channel (Horizontal Bar)
  renderDistCabangChart(data.branches_total || {}, brandColor);

  // 4. Chart D3: Tren TPM (Produktivitas per Customer)
  renderDistTpmChart(timeline, isDaily);

  // 5. Chart D4: Segmentasi Retensi Customer (Doughnut)
  renderDistSegmentChart();
}

function renderDistTrendChart(timeline, brandColor, isDaily) {
  const ctx = document.getElementById("chart-dist-trend");
  if (!ctx) return;
  destroyChart("distTrend");

  const labels = timeline.map(t => t.label);
  // Gunakan daily_trx (Total Trx / Hari Cut-off) agar tren per bulan adil & Oktober 2026 tidak anjlok
  const trxData = timeline.map(t => isDaily ? t.trx : t.daily_trx);
  const custData = timeline.map(t => t.customers);

  const barLabel = isDaily 
    ? "Transaksi Harian (Trx)" 
    : "Daily Trx (Total Trx / Hari Cut-off)";

  chartInstances["distTrend"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: barLabel,
          data: trxData,
          backgroundColor: brandColor,
          borderRadius: 4,
          yAxisID: "y"
        },
        {
          label: isDaily ? "Customer Aktif / Hari" : "Customer Aktif",
          data: custData,
          type: "line",
          borderColor: "#f59e0b",
          backgroundColor: "#f59e0b",
          borderWidth: 2.5,
          pointRadius: timeline.length > 20 ? 3 : 4.5,
          pointHoverRadius: 6,
          fill: false,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true, font: { family: "inherit", size: 12 } } },
        tooltip: {
          callbacks: {
            label: context => {
              const val = Math.round(context.parsed.y).toLocaleString("id-ID");
              if (context.datasetIndex === 0 && !isDaily) {
                const item = timeline[context.dataIndex];
                const rawTotal = (item && item.trx) ? item.trx.toLocaleString("id-ID") : val;
                const days = (item && item.days_count) ? item.days_count : 30;
                return ` Daily Trx: ${val} trx/hari (Total: ${rawTotal} trx / ${days} hari)`;
              }
              return ` ${context.dataset.label}: ${val}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0 } },
        y: {
          type: "linear",
          position: "left",
          title: { display: true, text: isDaily ? "Jumlah Transaksi" : "Daily Trx (Trx / Hari)" },
          ticks: { callback: v => Number(v).toLocaleString("id-ID") }
        },
        y1: {
          type: "linear",
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Customer Aktif" },
          ticks: { callback: v => Number(v).toLocaleString("id-ID") }
        }
      }
    }
  });
}

function renderDistCabangChart(branchesTotal, brandColor) {
  const ctx = document.getElementById("chart-dist-cabang");
  if (!ctx) return;
  destroyChart("distCabang");

  const sortedPairs = Object.entries(branchesTotal).sort((a, b) => b[1] - a[1]);
  const labels = sortedPairs.map(p => p[0]);
  const values = sortedPairs.map(p => p[1]);

  chartInstances["distCabang"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Volume Transaksi",
          data: values,
          backgroundColor: brandColor,
          borderRadius: 4
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` Total: ${Number(context.parsed.x).toLocaleString("id-ID")} trx`
          }
        }
      },
      scales: {
        x: { ticks: { callback: v => Number(v).toLocaleString("id-ID") } }
      }
    }
  });
}

function renderDistTpmChart(timeline, isDaily) {
  const ctx = document.getElementById("chart-dist-tpm");
  if (!ctx) return;
  destroyChart("distTpm");

  const labels = timeline.map(t => t.label);
  const tpmData = timeline.map(t => t.tpm);

  chartInstances["distTpm"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Daily Trx / Member (TPM Harian)",
          data: tpmData,
          borderColor: "#8b5cf6",
          backgroundColor: "rgba(139, 92, 246, 0.12)",
          borderWidth: 2.5,
          pointRadius: timeline.length > 20 ? 3 : 4,
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` Daily Trx/Member: ${context.parsed.y.toFixed(2)} trx/hari`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          title: { display: true, text: "Trx / Hari per Member" }
        }
      }
    }
  });
}

function renderDistSegmentChart() {
  const ctx = document.getElementById("chart-dist-segment");
  if (!ctx) return;
  destroyChart("distSegment");

  chartInstances["distSegment"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Aktif Rutin (Retained)", "Baru / Reaktivasi", "Pasif / Churn"],
      datasets: [
        {
          data: [65.4, 22.1, 12.5],
          backgroundColor: ["#059669", "#0284c7", "#dc2626"],
          borderWidth: 2,
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, font: { family: "inherit", size: 12 } } },
        tooltip: {
          callbacks: {
            label: context => ` ${context.label}: ${context.parsed}%`
          }
        }
      },
      cutout: "62%"
    }
  });
}

// =============================================================================
// 2. TAB: ANALISA SERVICE (RELASI TRX & PRODUCT)
// =============================================================================
function renderServiceTab(data) {
  const summary = data.summary || {};
  const timeline = data.timeline || [];
  const categoriesTotal = data.categories_total || {};
  const isDaily = data.granularity === "daily";
  const isYearly = data.granularity === "yearly";

  // 1. KPI Cards
  const elSukses = document.getElementById("serv-stat-sukses");
  if (elSukses) elSukses.textContent = "98.5%";

  const elDurasi = document.getElementById("serv-stat-durasi");
  if (elDurasi) elDurasi.textContent = "00:03";

  const elKategori = document.getElementById("serv-stat-kategori");
  if (elKategori) elKategori.textContent = summary.top_category || "EWALLET";

  const elTotal = document.getElementById("serv-stat-total");
  if (elTotal) elTotal.textContent = (summary.total_trx || 0).toLocaleString("id-ID");

  const elSubTotal = document.getElementById("serv-stat-total-sub");
  if (elSubTotal) elSubTotal.textContent = summary.granularity_label || "Akumulasi Periode Terpilih";

  // Update Dynamic Chart Title
  const elTitle = document.getElementById("serv-trend-title");
  if (elTitle) {
    if (isDaily) {
      elTitle.textContent = `Tren Kategori Produk Harian (${summary.granularity_label})`;
    } else if (isYearly) {
      elTitle.textContent = `Tren Kategori Produk Tahunan (2023 - 2026)`;
    } else {
      elTitle.textContent = `Tren 12 Bulan Kategori Produk (Tahun ${data.year})`;
    }
  }

  // 2. Chart S1: Tren Kategori Produk
  renderServTrendChart(timeline);

  // 3. Chart S2: Market Share Kategori Produk (% Share Donut)
  renderServShareChart(categoriesTotal);

  // 4. Chart S3: Kualitas Layanan (% Sukses Rate)
  renderServSuksesRateChart(timeline);

  // 5. Chart S4: Ranking Volume per Kategori Produk
  renderServRankingChart(categoriesTotal);
}

function renderServTrendChart(timeline) {
  const ctx = document.getElementById("chart-serv-trend");
  if (!ctx) return;
  destroyChart("servTrend");

  const labels = timeline.map(t => t.label);
  const ewData = timeline.map(t => (t.categories && t.categories["EWALLET"]) || 0);
  const telData = timeline.map(t => (t.categories && t.categories["TELCO"]) || 0);
  const plnData = timeline.map(t => (t.categories && t.categories["PLN"]) || 0);
  const ppData = timeline.map(t => (t.categories && t.categories["PPOB"]) || 0);
  const gmData = timeline.map(t => (t.categories && t.categories["GAME"]) || 0);

  chartInstances["servTrend"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        { label: "E-Wallet", data: ewData, backgroundColor: "#0284c7" },
        { label: "Telco", data: telData, backgroundColor: "#10b981" },
        { label: "PLN Token", data: plnData, backgroundColor: "#8b5cf6" },
        { label: "PPOB", data: ppData, backgroundColor: "#f59e0b" },
        { label: "Game", data: gmData, backgroundColor: "#ec4899" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true, font: { family: "inherit", size: 12 } } },
        tooltip: {
          callbacks: {
            label: context => ` ${context.dataset.label}: ${Math.round(context.parsed.y).toLocaleString("id-ID")} trx`
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          ticks: { callback: v => Number(v).toLocaleString("id-ID") },
          title: { display: true, text: "Jumlah Transaksi" }
        }
      }
    }
  });
}

function renderServShareChart(categoriesTotal) {
  const ctx = document.getElementById("chart-serv-produk");
  if (!ctx) return;
  destroyChart("servShare");

  const labels = Object.keys(categoriesTotal);
  const values = Object.values(categoriesTotal);
  const palette = ["#0284c7", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#64748b"];

  chartInstances["servShare"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: palette.slice(0, labels.length),
          borderWidth: 2,
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 12, font: { family: "inherit", size: 11.5 } } },
        tooltip: {
          callbacks: {
            label: context => {
              const val = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
              return ` ${context.label}: ${val.toLocaleString("id-ID")} (${pct}%)`;
            }
          }
        }
      },
      cutout: "62%"
    }
  });
}

function renderServSuksesRateChart(timeline) {
  const ctx = document.getElementById("chart-serv-sukses-rate");
  if (!ctx) return;
  destroyChart("servSuksesRate");

  const labels = timeline.map(t => t.label);
  const rates = timeline.map(t => t.sukses_pct || 98.5);

  chartInstances["servSuksesRate"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "% Sukses Rate",
          data: rates,
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.12)",
          borderWidth: 2.5,
          pointRadius: timeline.length > 20 ? 3 : 4,
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` Success: ${context.parsed.y.toFixed(1)}%`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          min: 95,
          max: 100,
          ticks: { callback: v => `${v}%` },
          title: { display: true, text: "% Sukses" }
        }
      }
    }
  });
}

function renderServRankingChart(categoriesTotal) {
  const ctx = document.getElementById("chart-serv-ranking");
  if (!ctx) return;
  destroyChart("servRanking");

  const sortedPairs = Object.entries(categoriesTotal).sort((a, b) => b[1] - a[1]);
  const labels = sortedPairs.map(p => p[0]);
  const values = sortedPairs.map(p => p[1]);

  chartInstances["servRanking"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Volume Transaksi",
          data: values,
          backgroundColor: ["#0284c7", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"],
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` ${context.parsed.y.toLocaleString("id-ID")} trx`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: v => Number(v).toLocaleString("id-ID") } }
      }
    }
  });
}

// =============================================================================
// 3. TAB: ANALISA LAIN LAIN (PEAK HOURS, STATUS, DLL)
// =============================================================================
function renderLainTab(data) {
  const hourly = data.hourly_distribution || [];
  const statusBreakdown = data.status_breakdown || {};
  const weekday = data.weekday_distribution || [];

  // Chart L1: Pola Jam Sibuk (24 Jam)
  renderLainHourlyChart(hourly);

  // Chart L2: Breakdown Status
  renderLainStatusChart(statusBreakdown);

  // Chart L3: Pola Hari Mingguan
  renderLainWeekdayChart(weekday);
}

function renderLainHourlyChart(hourly) {
  const ctx = document.getElementById("chart-lain-hourly");
  if (!ctx) return;
  destroyChart("lainHourly");

  const labels = hourly.map(h => h.hour);
  const values = hourly.map(h => h.trx);

  chartInstances["lainHourly"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Volume per Jam",
          data: values,
          borderColor: "#0284c7",
          backgroundColor: "rgba(2, 132, 199, 0.15)",
          borderWidth: 2.5,
          pointRadius: 3,
          fill: true,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` Jam ${context.label}: ${context.parsed.y.toLocaleString("id-ID")} trx`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: v => Number(v).toLocaleString("id-ID") } }
      }
    }
  });
}

function renderLainStatusChart(statusBreakdown) {
  const ctx = document.getElementById("chart-lain-status");
  if (!ctx) return;
  destroyChart("lainStatus");

  const labels = Object.keys(statusBreakdown);
  const values = Object.values(statusBreakdown);

  chartInstances["lainStatus"] = new Chart(ctx, {
    type: "pie",
    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: ["#10b981", "#f59e0b", "#ef4444", "#64748b"],
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 12, font: { family: "inherit", size: 11.5 } } },
        tooltip: {
          callbacks: {
            label: context => ` ${context.label}: ${context.parsed}%`
          }
        }
      }
    }
  });
}

function renderLainWeekdayChart(weekday) {
  const ctx = document.getElementById("chart-lain-weekday");
  if (!ctx) return;
  destroyChart("lainWeekday");

  const labels = weekday.map(w => w.day);
  const values = weekday.map(w => w.trx);

  chartInstances["lainWeekday"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Volume Transaksi",
          data: values,
          backgroundColor: "#8b5cf6",
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` ${context.parsed.y.toLocaleString("id-ID")} trx`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: v => Number(v).toLocaleString("id-ID") } }
      }
    }
  });
}

// Export global function
window.loadAnalisa = loadAnalisa;
window.loadAnalisaDistribusi = loadAnalisaDistribusi;
window.loadAnalisaService = loadAnalisaService;
window.loadAnalisaLain = loadAnalisaLain;
window.switchAnalisaTab = switchAnalisaTab;
window.setPillFilter = setPillFilter;
window.fetchAndRenderAnalisa = fetchAndRenderAnalisa;
