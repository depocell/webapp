// app.js — Single Shell Router & Navigation

const ROUTES = {
  "#overview": {
    title: "Overview Dashboard",
    pageUrl: "/pages/home/index.html",
    scriptUrl: "/pages/home/home.js",
    initFn: "loadOverview"
  },
  "#daily": {
    title: "Daily Summary Report",
    pageUrl: "/pages/daily/index.html",
    scriptUrl: "/pages/daily/daily.js",
    initFn: "loadDaily"
  },
  "#analisa": {
    title: "Dashboard Analisa",
    pageUrl: "/pages/analisa/index.html",
    scriptUrl: "/pages/analisa/analisa.js",
    initFn: "loadAnalisa"
  },
  "#analisa-distribusi": {
    title: "Dashboard Analisa — Distribusi",
    pageUrl: "/pages/analisa/index.html",
    scriptUrl: "/pages/analisa/analisa.js",
    initFn: "loadAnalisaDistribusi"
  },
  "#analisa-service": {
    title: "Dashboard Analisa — Service",
    pageUrl: "/pages/analisa/index.html",
    scriptUrl: "/pages/analisa/analisa.js",
    initFn: "loadAnalisaService"
  },
  "#analisa-lain": {
    title: "Dashboard Analisa — Lain Lain",
    pageUrl: "/pages/analisa/index.html",
    scriptUrl: "/pages/analisa/analisa.js",
    initFn: "loadAnalisaLain"
  },
  "#sco": {
    title: "SCO Executive Suite",
    pageUrl: "/pages/sco/sco_view.html",
    scriptUrl: "/pages/sco/sco.js",
    initFn: "initScoView"
  },
  "#reseller": {
    title: "Agen & Reseller",
    pageUrl: "/pages/reseller/index.html",
    scriptUrl: "/pages/reseller/reseller.js",
    initFn: "loadReseller"
  },
  "#agen": {
    title: "Agen & Reseller",
    pageUrl: "/pages/agen/index.html",
    scriptUrl: "/pages/agen/agen.js",
    initFn: "loadAgen"
  },
  "#produk": {
    title: "Produk Fisik",
    pageUrl: "/pages/fisik/index.html",
    scriptUrl: "/pages/fisik/fisik.js",
    initFn: "loadFisik"
  },
  "#transaksi": {
    title: "Pivot Transaksi Dinamis",
    pageUrl: "/pages/transaksi/index.html",
    scriptUrl: "/pages/transaksi/transaksi.js",
    initFn: "loadTransaksi"
  },
  "#settings": {
    title: "Sistem & Pengaturan",
    pageUrl: "/pages/settings/index.html",
    scriptUrl: "/pages/settings/settings.js",
    initFn: "loadSettings"
  }
};

const loadedScripts = new Set();

function loadScript(url) {
  return new Promise((resolve, reject) => {
    // Cari dan hapus script lama jika nama file sama (abaikan query ?t=)
    const baseSrc = url.split("?")[0];
    const existing = Array.from(document.querySelectorAll("script")).find(s => s.src && s.src.includes(baseSrc));
    if (existing) {
      existing.remove();
    }

    const script = document.createElement("script");
    script.src = url;
    script.onload = () => {
      resolve();
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

async function navigate() {
  let hash = window.location.hash || "#overview";
  if (!ROUTES[hash]) hash = "#overview";

  const route = ROUTES[hash];

  // Update Breadcrumb & Document Title
  document.getElementById("page-title").textContent = route.title;
  document.title = `${route.title} — Web Report`;

  // Update Active Link in Sidebar (highlight #reseller link for both #reseller and #agen, highlight #analisa for its sub-routes)
  document.querySelectorAll(".nav-link").forEach(link => {
    const href = link.getAttribute("href");
    if (
      href === hash ||
      ((hash === "#agen" || hash === "#reseller") && href === "#reseller") ||
      (hash.startsWith("#analisa") && href === "#analisa")
    ) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  // Update Active Sub-Link under Analisa
  document.querySelectorAll(".nav-sub-link").forEach(subLink => {
    const subHref = subLink.getAttribute("href");
    if (subHref === hash || (hash === "#analisa" && subHref === "#analisa-distribusi")) {
      subLink.classList.add("active");
    } else {
      subLink.classList.remove("active");
    }
  });

  const contentArea = document.getElementById("content-area");

  if (route.pageUrl) {
    contentArea.innerHTML = `<div class="loader">Memuat halaman...</div>`;
    try {
      const res = await fetch(route.pageUrl + "?t=" + Date.now());
      if (!res.ok) throw new Error("Gagal mengambil template halaman");
      const html = await res.text();
      contentArea.innerHTML = html;

      if (route.scriptUrl) {
        await loadScript(route.scriptUrl + "?t=" + Date.now());
        if (route.initFn && typeof window[route.initFn] === "function") {
          window[route.initFn]();
        }
      }
    } catch (err) {
      contentArea.innerHTML = `<div class="card placeholder-card"><h3>Terjadi Kesalahan</h3><p>${err.message}</p></div>`;
    }
  } else {
    contentArea.innerHTML = `
      <div class="card placeholder-card">
        <h3>${route.title}</h3>
        <p>${route.placeholder}</p>
      </div>
    `;
  }
}

window.addEventListener("hashchange", navigate);
document.addEventListener("DOMContentLoaded", () => {
  if (!window.location.hash) {
    window.location.hash = "#overview";
  }
  navigate();
});
