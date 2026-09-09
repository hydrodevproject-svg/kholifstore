// src/app.js
import { 
  state, 
  loadInitialStateFromDB,
  saveUserSession, 
  clearUserSession, 
  getValidSession, 
  initFirebaseSync, 
  persistAccounts, 
  persistFeatures, 
  persistSales,
  persistProducts,
  persistMembers,
  persistCategories,
  persistPurchases,
  persistFinance
} from "./state.js";
import { 
  loadViews, 
  initDrawer, 
  initGlobalDialogEvents, 
  showThemedAlert, 
  showThemedConfirm, 
  showThemedPrompt, 
  reinforceHistoryBarrier 
} from "./ui.js";
import { initPrinterSettings } from "./printer.js";
import { initInventoryModule, renderAllInventoryData, closeInvSubMenu } from "./inventory.js";
import { initPurchasesModule, renderPurchasesTable, renderSupplierDebtsTable, selectPurchProductFromScanner } from "./purchases.js";
import { initMembersModule, renderAllMemberData, closeMemberSubMenu } from "./members.js";
import { initPosModule, renderCategories, renderProducts, renderCart, addToCart, attachMember } from "./pos.js";
import { initReportsModule, renderReports } from "./reports.js";
import { initFinanceModule, renderFinanceDashboard, closeFinanceSubMenu } from "./finance.js";
import { playScannerBeep, showScanToast, debounce, hashPassword } from "./utils.js";

const MAX_CONSOLE_RENDER = 50;

export const debouncedUpdateMetrics = debounce(() => {
  updateMetricsDashboard();
}, 250);

async function bootstrap() {
  await loadViews();
  await loadInitialStateFromDB();

  initInventoryModule();
  initPurchasesModule();
  initMembersModule();
  initPosModule();
  initReportsModule();
  initFinanceModule();
  initPrinterSettings();

  initGlobalDialogEvents({
    closeMasterItSubMenu: () => closeMasterItSubMenu(),
    closeMemberSubMenu: () => closeMemberSubMenu(),
    closeInvSubMenu: () => closeInvSubMenu(),
    closeFinanceSubMenu: () => closeFinanceSubMenu(),
    closeSettingsSubMenu: () => {
      state.activeSettingsSubMenuId = null;
      document.getElementById("settingsDetailView")?.classList.add("hidden");
      document.getElementById("settingsMenuView")?.classList.remove("hidden");
    },
    switchView: (viewId) => switchView(viewId)
  });

  initDrawer();
  initNavigation();
  initSessionAndLogin();
  initSettingsModule();
  initHardwareScanner();

  reinforceHistoryBarrier();

  initFirebaseSync({
    onProductsChange: () => {
      renderProducts();
      renderAllInventoryData();
      renderConsoleTable();
      renderFinanceDashboard();
      debouncedUpdateMetrics();
    },
    onMembersChange: () => {
      renderAllMemberData();
      renderConsoleTable();
      debouncedUpdateMetrics();
    },
    onSalesChange: () => {
      renderAllMemberData();
      renderReports();
      renderConsoleTable();
      renderFinanceDashboard();
      debouncedUpdateMetrics();
    },
    onAccountsChange: () => {
      renderAccountsTable();
      renderConsoleTable();
      debouncedUpdateMetrics();
    },
    onCategoriesChange: () => {
      renderCategories();
      renderConsoleTable();
      debouncedUpdateMetrics();
    },
    onPurchasesChange: () => {
      renderPurchasesTable();
      renderConsoleTable();
      renderFinanceDashboard();
      debouncedUpdateMetrics();
    },
    onSupplierDebtsChange: () => {
      renderSupplierDebtsTable();
      debouncedUpdateMetrics();
    },
    onOpnamesChange: () => {
      renderAllInventoryData();
      debouncedUpdateMetrics();
    },
    onFinanceChange: () => {
      renderFinanceDashboard();
      renderReports();
      debouncedUpdateMetrics();
    },
    onFeaturesChange: () => {
      applyFeatureGate();
      renderCart();
      debouncedUpdateMetrics();
    }
  });

  updateMetricsDashboard();
}

function initNavigation() {
  document.querySelectorAll(".nav-menu-item").forEach((btn) => {
    btn.onclick = () => {
      document.getElementById("appDrawer")?.classList.remove("open");
      document.getElementById("drawerBackdrop")?.classList.remove("open");
      switchView(btn.getAttribute("data-view"));
    };
  });
}

export function switchView(viewId) {
  document.getElementById("appDrawer")?.classList.remove("open");
  document.getElementById("drawerBackdrop")?.classList.remove("open");

  state.currentViewId = viewId;
  document.querySelectorAll(".app-view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nav-menu-item").forEach((m) => m.classList.toggle("active", m.getAttribute("data-view") === viewId));
  
  const target = document.getElementById(viewId);
  if (target) target.classList.add("active");

  const isTabletOrDesktop = document.body.classList.contains("mode-tablet") || window.innerWidth >= 1024;
  if (viewId === "view-pos") {
    document.getElementById("headerSearchBox")?.classList.remove("hidden");
    const hTitle = document.getElementById("headerCurrentTitle");
    if (hTitle) hTitle.style.display = "none";
    if (!isTabletOrDesktop) document.getElementById("btnOpenCartMobile")?.classList.remove("hidden");
  } else {
    document.getElementById("headerSearchBox")?.classList.add("hidden");
    const hTitle = document.getElementById("headerCurrentTitle");
    if (hTitle) hTitle.style.display = "block";
    document.getElementById("btnOpenCartMobile")?.classList.add("hidden");

    if (viewId === "view-members") {
      if (hTitle) hTitle.textContent = "MEMBER";
      closeMemberSubMenu();
      renderAllMemberData();
    } else if (viewId === "view-purchases") {
      if (hTitle) hTitle.textContent = "PEMBELIAN";
      renderPurchasesTable();
      renderSupplierDebtsTable();
    } else if (viewId === "view-inventory") {
      if (hTitle) hTitle.textContent = "PERSEDIAAN";
      closeInvSubMenu();
      renderAllInventoryData();
    } else if (viewId === "view-reports") {
      if (hTitle) hTitle.textContent = "LAPORAN";
      renderReports();
    } else if (viewId === "view-finance") {
      if (hTitle) hTitle.textContent = "KEUANGAN";
      closeFinanceSubMenu();
      renderFinanceDashboard();
    } else if (viewId === "view-settings") {
      if (hTitle) hTitle.textContent = "PENGATURAN";
      state.activeSettingsSubMenuId = null;
      closeMasterItSubMenu();
      document.getElementById("settingsDetailView")?.classList.add("hidden");
      document.getElementById("settingsMenuView")?.classList.remove("hidden");
      if (state.currentUser) {
        document.getElementById("setProfileName").textContent = state.currentUser.name;
        document.getElementById("setProfileUser").textContent = state.currentUser.username;
        document.getElementById("setProfileRole").textContent = state.currentUser.role.replace("_", " ").toUpperCase();
      }
    }
  }
}

function initSessionAndLogin() {
  const posLoginForm = document.getElementById("posLoginForm");
  if (posLoginForm) {
    posLoginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const u = document.getElementById("loginUsername").value.trim().toLowerCase();
      const p = document.getElementById("loginPassword").value.trim();
      const hashedInput = await hashPassword(p);

      const acc = state.accountsDB.find((a) => {
        const matchUser = a.username.toLowerCase() === u;
        const matchPass = a.password === p || a.password === hashedInput;
        return matchUser && matchPass;
      });

      if (!acc) {
        const errMsg = document.getElementById("loginErrorMessage");
        if (errMsg) {
          errMsg.textContent = "Username atau password salah!";
          errMsg.classList.remove("hidden");
        }
        return;
      }

      // Otomatis migrasikan password lama plain-text ke hash SHA-256
      if (acc.password === p) {
        acc.password = hashedInput;
        persistAccounts();
      }

      // Amankan sesi: buang field password sebelum disimpan ke storage lokal
      const { password, ...safeUser } = acc;
      state.currentUser = { ...safeUser };
      saveUserSession(state.currentUser);
      document.getElementById("loginScreen")?.classList.add("hidden");

      setupUserSessionUI();
      switchView("view-pos");
      reinforceHistoryBarrier();
    });
  }

  const btnLogout = document.getElementById("btnDrawerLogout");
  if (btnLogout) {
    btnLogout.onclick = () => {
      clearUserSession();
      state.currentUser = null;
      document.getElementById("appDrawer")?.classList.remove("open");
      document.getElementById("drawerBackdrop")?.classList.remove("open");
      document.getElementById("loginScreen")?.classList.remove("hidden");
    };
  }

  const cached = getValidSession();
  if (cached) {
    const { password, ...safeUser } = cached;
    state.currentUser = safeUser;
    document.getElementById("loginScreen")?.classList.add("hidden");
    setupUserSessionUI();
    switchView("view-pos");
    reinforceHistoryBarrier();
  }

  const switchTabletMode = document.getElementById("switchTabletMode");
  const storedTabletPref = localStorage.getItem("kholif_pos_tablet_mode");
  const isLargeScreen = window.innerWidth >= 1024;
  const isTabletMode = storedTabletPref !== null ? storedTabletPref === "true" : isLargeScreen;

  if (switchTabletMode) {
    switchTabletMode.checked = isTabletMode;
    switchTabletMode.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      localStorage.setItem("kholif_pos_tablet_mode", isChecked ? "true" : "false");
      applyDeviceMode(isChecked);
    });
  }
  applyDeviceMode(isTabletMode);

  window.addEventListener("resize", () => {
    if (localStorage.getItem("kholif_pos_tablet_mode") === null) {
      applyDeviceMode(window.innerWidth >= 1024);
    }
  });

  const btnTogglePassword = document.getElementById("btnTogglePassword");
  const loginPassword = document.getElementById("loginPassword");
  const eyeIcon = document.getElementById("eyeIcon");

  if (btnTogglePassword && loginPassword && eyeIcon) {
    btnTogglePassword.onclick = () => {
      const isPass = loginPassword.getAttribute("type") === "password";
      loginPassword.setAttribute("type", isPass ? "text" : "password");

      if (isPass) {
        eyeIcon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
        btnTogglePassword.setAttribute("title", "Sembunyikan Sandi");
      } else {
        eyeIcon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
        btnTogglePassword.setAttribute("title", "Lihat Sandi");
      }
    };
  }

  setInterval(() => {
    const liveClock = document.getElementById("liveClock");
    if (liveClock) liveClock.textContent = new Date().toLocaleTimeString("id-ID", { hour12: false });

    if (state.currentUser && !getValidSession()) {
      state.currentUser = null;
      document.getElementById("loginScreen")?.classList.remove("hidden");
      document.getElementById("appDrawer")?.classList.remove("open");
      showThemedAlert("Sesi Berakhir", "Sesi kasir 24 jam telah selesai. Silakan masuk kembali.", "info");
    }
  }, 1000);
}

function applyDeviceMode(isTablet) {
  if (isTablet) {
    document.body.classList.remove("mode-mobile");
    document.body.classList.add("mode-tablet");
    document.getElementById("btnOpenCartMobile")?.classList.add("hidden");
  } else {
    document.body.classList.remove("mode-tablet");
    document.body.classList.add("mode-mobile");
    if (state.currentViewId === "view-pos") {
      document.getElementById("btnOpenCartMobile")?.classList.remove("hidden");
    }
  }
}

function setupUserSessionUI() {
  if (!state.currentUser) return;
  const lblRole = document.getElementById("lblUserRole");
  const drwName = document.getElementById("drawerUserName");
  const drwRole = document.getElementById("drawerUserRole");

  if (lblRole) lblRole.textContent = state.currentUser.role.replace("_", " ").toUpperCase();
  if (drwName) drwName.textContent = state.currentUser.name;
  if (drwRole) drwRole.textContent = state.currentUser.role.replace("_", " ").toUpperCase();

  const btnOpenAddProductPage = document.getElementById("btnOpenAddProductPage");
  if (btnOpenAddProductPage) {
    btnOpenAddProductPage.classList.toggle("hidden", state.currentUser.role === "cashier");
  }

  const cardSubPosSettings = document.getElementById("cardSubPosSettings");
  if (cardSubPosSettings) {
    const canManagePos = state.currentUser.role === "admin" || state.currentUser.role === "master_it";
    cardSubPosSettings.classList.toggle("hidden", !canManagePos);
  }

  const cardSubFinanceSettings = document.getElementById("cardSubFinanceSettings");
  if (cardSubFinanceSettings) {
    const canManageFinance = state.currentUser.role === "admin" || state.currentUser.role === "master_it";
    cardSubFinanceSettings.classList.toggle("hidden", !canManageFinance);
  }

  const cardSubMasterIt = document.getElementById("cardSubMasterIt");
  if (cardSubMasterIt) {
    cardSubMasterIt.classList.toggle("hidden", state.currentUser.role !== "master_it");
  }

  const cardSubBackup = document.getElementById("cardSubBackup");
  if (cardSubBackup) {
    cardSubBackup.classList.toggle("hidden", state.currentUser.role !== "master_it");
  }

  applyFeatureGate();
}

function applyFeatureGate() {
  document.querySelectorAll("[data-feature]").forEach((el) => {
    const key = el.getAttribute("data-feature");
    const feat = state.featuresConfig[key];
    let canAccess = false;
    if (feat && feat.enabled) {
      if (state.currentUser && state.currentUser.role === "master_it") canAccess = true;
      else if (state.currentUser && feat.allowedRoles.includes(state.currentUser.role)) canAccess = true;
    }
    el.classList.toggle("hidden", !canAccess);
  });
}

function initSettingsModule() {
  document.querySelectorAll("#settingsMenuView .settings-menu-card").forEach((c) => {
    c.onclick = () => openSettingsSubMenu(c.getAttribute("data-sub"));
  });

  const btnBack = document.getElementById("btnBackSubMenu");
  if (btnBack) {
    btnBack.onclick = () => {
      if (state.activeMasterItSubMenuId !== null) {
        closeMasterItSubMenu();
        return;
      }
      state.activeSettingsSubMenuId = null;
      document.getElementById("settingsDetailView")?.classList.add("hidden");
      document.getElementById("settingsMenuView")?.classList.remove("hidden");
    };
  }

  const posTogglesContainer = document.getElementById("posOperationalToggles");
  if (posTogglesContainer) {
    posTogglesContainer.addEventListener("change", (e) => {
      const sw = e.target.closest(".op-toggle-switch");
      if (!sw) return;
      const id = sw.getAttribute("data-id");
      if (state.featuresConfig[id]) {
        state.featuresConfig[id].enabled = sw.checked;
        persistFeatures();
        applyFeatureGate();
        renderCart();
      }
    });
  }

  const btnMonthlyClosing = document.getElementById("btnMonthlyClosingFinance");
  if (btnMonthlyClosing) {
    btnMonthlyClosing.onclick = async () => {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const monthName = now.toLocaleDateString("id-ID", { month: "long", year: "numeric" });

      const monthSales = state.salesTransactions.filter((t) => {
        if (t.status === "Dibatalkan") return false;
        const d = t.timestamp ? new Date(t.timestamp) : new Date();
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      const totalRev = monthSales.reduce((acc, t) => acc + (t.total || 0), 0);
      let totalHpp = 0;
      monthSales.forEach((trx) => {
        if (Array.isArray(trx.items)) {
          trx.items.forEach((item) => {
            const qty = Number(item.qty || 1);
            if (item.totalCost !== undefined) {
              totalHpp += Number(item.totalCost);
            } else if (item.costPrice !== undefined) {
              totalHpp += Number(item.costPrice) * qty;
            } else {
              const prod = state.productsDB.find((p) => p.name.trim().toLowerCase() === item.name.trim().toLowerCase());
              totalHpp += (prod ? Number(prod.costPrice || 0) : 0) * qty;
            }
          });
        }
      });
      const grossProfit = Math.max(0, totalRev - totalHpp);

      const totalOpex = (state.financeDB?.logs || [])
        .filter((l) => l.type === "Biaya Operasional")
        .reduce((acc, l) => acc + Number(l.amount || 0), 0);

      const netProfit = grossProfit - totalOpex;

      const confirm = await showThemedConfirm(
        "Tutup Buku Bulanan",
        `Periode: ${monthName}\n\n• Omzet Penjualan: Rp ${totalRev.toLocaleString("id-ID")}\n• Total HPP Modal: Rp ${totalHpp.toLocaleString("id-ID")}\n• Laba Kotor: Rp ${grossProfit.toLocaleString("id-ID")}\n• Biaya Operasional: Rp ${totalOpex.toLocaleString("id-ID")}\n• Estimasi Laba Bersih: Rp ${netProfit.toLocaleString("id-ID")}\n\nLakukan pembukuan tutup buku periode ini?`,
        "Proses Tutup Buku",
        "Batal"
      );

      if (!confirm) return;

      const fullDateTimeStr = `${now.toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })} • ${now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;

      if (!Array.isArray(state.financeDB.logs)) state.financeDB.logs = [];
      state.financeDB.logs.unshift({
        id: `FIN-CLOSE-M-${Date.now()}`,
        time: fullDateTimeStr,
        type: "Tutup Buku Bulanan",
        amount: netProfit,
        note: `Tutup Buku ${monthName} (Omzet: Rp ${totalRev.toLocaleString("id-ID")}, Laba Bersih: Rp ${netProfit.toLocaleString("id-ID")})`,
        admin: state.currentUser ? state.currentUser.name : "Admin"
      });

      persistFinance();
      renderFinanceDashboard();
      debouncedUpdateMetrics();
      await showThemedAlert("Tutup Buku Selesai", `Tutup buku bulanan untuk ${monthName} berhasil dibukukan ke log keuangan.`, "info");
    };
  }

  const btnAnnualClosing = document.getElementById("btnAnnualClosingFinance");
  if (btnAnnualClosing) {
    btnAnnualClosing.onclick = async () => {
      const now = new Date();
      const currentYear = now.getFullYear();

      const yearSales = state.salesTransactions.filter((t) => {
        if (t.status === "Dibatalkan") return false;
        const d = t.timestamp ? new Date(t.timestamp) : new Date();
        return d.getFullYear() === currentYear;
      });

      const totalRev = yearSales.reduce((acc, t) => acc + (t.total || 0), 0);
      let totalHpp = 0;
      yearSales.forEach((trx) => {
        if (Array.isArray(trx.items)) {
          trx.items.forEach((item) => {
            const qty = Number(item.qty || 1);
            if (item.totalCost !== undefined) {
              totalHpp += Number(item.totalCost);
            } else if (item.costPrice !== undefined) {
              totalHpp += Number(item.costPrice) * qty;
            } else {
              const prod = state.productsDB.find((p) => p.name.trim().toLowerCase() === item.name.trim().toLowerCase());
              totalHpp += (prod ? Number(prod.costPrice || 0) : 0) * qty;
            }
          });
        }
      });
      const grossProfit = Math.max(0, totalRev - totalHpp);

      const totalOpex = (state.financeDB?.logs || [])
        .filter((l) => l.type === "Biaya Operasional")
        .reduce((acc, l) => acc + Number(l.amount || 0), 0);

      const netProfit = grossProfit - totalOpex;

      const confirm = await showThemedConfirm(
        "Tutup Buku Tahunan",
        `Tahun Buku: ${currentYear}\n\n• Total Omzet Tahunan: Rp ${totalRev.toLocaleString("id-ID")}\n• Total HPP Modal: Rp ${totalHpp.toLocaleString("id-ID")}\n• Laba Kotor Tahunan: Rp ${grossProfit.toLocaleString("id-ID")}\n• Beban Operasional: Rp ${totalOpex.toLocaleString("id-ID")}\n• Akumulasi Laba Bersih: Rp ${netProfit.toLocaleString("id-ID")}\n\nLakukan tutup buku tahunan untuk membukukan laporan akhir tahun?`,
        "Tutup Buku Tahunan",
        "Batal"
      );

      if (!confirm) return;

      const fullDateTimeStr = `${now.toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })} • ${now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;

      if (!Array.isArray(state.financeDB.logs)) state.financeDB.logs = [];
      state.financeDB.logs.unshift({
        id: `FIN-CLOSE-Y-${Date.now()}`,
        time: fullDateTimeStr,
        type: "Tutup Buku Tahunan",
        amount: netProfit,
        note: `Tutup Buku Tahun ${currentYear} (Total Omzet: Rp ${totalRev.toLocaleString("id-ID")}, Laba Bersih: Rp ${netProfit.toLocaleString("id-ID")})`,
        admin: state.currentUser ? state.currentUser.name : "Admin"
      });

      persistFinance();
      renderFinanceDashboard();
      debouncedUpdateMetrics();
      await showThemedAlert("Tutup Buku Tahunan Selesai", `Tutup buku tahunan periode ${currentYear} berhasil dibukukan ke log keuangan.`, "info");
    };
  }

  const btnResetFinance = document.getElementById("btnResetFinanceData");
  if (btnResetFinance) {
    btnResetFinance.onclick = async () => {
      const ok = await showThemedConfirm(
        "Reset Data Keuangan",
        "PERINGATAN! Semua riwayat mutasi kas akan dihapus dan saldo kas fisik toko akan dikembalikan ke Rp 0.",
        "Reset Keuangan",
        "Batal"
      );
      if (!ok) return;

      const conf = await showThemedPrompt("Konfirmasi Reset", "Ketik kata 'RESET' dengan huruf kapital untuk menyetujui:", "", "Ketik RESET");
      if (conf === "RESET") {
        state.financeDB = { cashBalance: 0, digitalBalance: 0, logs: [] };
        persistFinance();
        renderFinanceDashboard();
        debouncedUpdateMetrics();
        showScanToast("Data keuangan dan kas fisik di-reset");
      } else {
        showScanToast("Reset keuangan dibatalkan");
      }
    };
  }

  initMasterItModule();

  const btnBackup = document.getElementById("btnBackupTransactions");
  if (btnBackup) {
    btnBackup.onclick = async () => {
      if (!state.salesTransactions || state.salesTransactions.length === 0) {
        await showThemedAlert("Tidak Ada Data", "Belum ada data transaksi yang dapat dicadangkan.", "info");
        return;
      }
      const payload = {
        store: "Kholif Store",
        backupDate: new Date().toISOString(),
        records: state.salesTransactions.length,
        data: state.salesTransactions
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      a.setAttribute("href", dataStr);
      a.setAttribute("download", `backup-transaksi-kholifstore-${dateStr}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      showScanToast("Berkas cadangan berhasil diunduh");
    };
  }

  const btnTriggerImport = document.getElementById("btnTriggerImportInventory");
  const fileInputImport = document.getElementById("inputImportInventoryFile");
  const btnTemplate = document.getElementById("btnDownloadTemplateImport");

  if (btnTriggerImport && fileInputImport) {
    btnTriggerImport.onclick = () => {
      fileInputImport.value = "";
      fileInputImport.click();
    };

    fileInputImport.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await handleImportInventoryFile(file);
    };
  }

  if (btnTemplate) {
    btnTemplate.onclick = () => downloadInventoryCsvTemplate();
  }

  const btnClear = document.getElementById("btnClearAllTransactions");
  if (btnClear) {
    btnClear.onclick = async () => {
      if (!state.salesTransactions || state.salesTransactions.length === 0) {
        await showThemedAlert("Data Bersih", "Riwayat transaksi sudah kosong.", "info");
        return;
      }
      const ok = await showThemedConfirm("Hapus Seluruh Data", "PERINGATAN! Semua riwayat transaksi akan dihapus permanen.", "Hapus Semua", "Batal");
      if (!ok) return;

      const conf = await showThemedPrompt("Konfirmasi", "Ketik kata 'HAPUS' dengan huruf kapital untuk menyetujui:", "", "Ketik HAPUS");
      if (conf === "HAPUS") {
        state.salesTransactions = [];
        persistSales();
        renderAllMemberData();
        renderReports();
        renderFinanceDashboard();
        debouncedUpdateMetrics();
        showScanToast("Semua data transaksi dikosongkan");
      } else {
        showScanToast("Penghapusan dibatalkan");
      }
    };
  }
}

async function handleImportInventoryFile(file) {
  const fileName = file.name.toLowerCase();
  showScanToast("Membaca berkas persediaan...");

  try {
    let rawItems = [];

    if (fileName.endsWith(".json")) {
      const text = await file.text();
      const parsed = JSON.parse(text);
      rawItems = Array.isArray(parsed) ? parsed : (parsed.data || parsed.products || [parsed]);
    } else if (fileName.endsWith(".csv")) {
      const text = await file.text();
      rawItems = parseCSV(text);
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      rawItems = await parseExcel(file);
    } else {
      await showThemedAlert("Format Tidak Didukung", "Silakan pilih berkas format .xlsx, .xls, .csv, atau .json.", "error");
      return;
    }

    if (!rawItems || rawItems.length === 0) {
      await showThemedAlert("Berkas Kosong", "Tidak ditemukan baris data produk di dalam berkas.", "error");
      return;
    }

    let addedCount = 0;
    let updatedCount = 0;
    let newCategoriesAdded = false;

    rawItems.forEach((row, i) => {
      const item = normalizeProductRow(row);
      if (!item) return;

      if (item.cat && !state.categoriesDB.some((c) => c.toLowerCase() === item.cat.toLowerCase())) {
        state.categoriesDB.push(item.cat);
        newCategoriesAdded = true;
      }

      const existingIdx = state.productsDB.findIndex((p) => 
        (p.barcode && String(p.barcode) === String(item.barcode)) ||
        (p.name && p.name.toLowerCase().trim() === item.name.toLowerCase().trim())
      );

      if (existingIdx !== -1) {
        const existing = state.productsDB[existingIdx];
        existing.barcode = item.barcode;
        existing.name = item.name;
        existing.cat = item.cat;
        existing.costPrice = item.costPrice;
        existing.price = item.price;
        existing.stock = item.stock;
        existing.batches = item.stock > 0 ? [{
          id: `BATCH-${Date.now()}-${i}`,
          nota: "IMPORT",
          buyPrice: item.costPrice,
          sellPrice: item.price,
          qty: item.stock,
          expireDate: ""
        }] : [];
        updatedCount++;
      } else {
        const newId = Date.now() + i;
        state.productsDB.unshift({
          id: newId,
          barcode: item.barcode,
          name: item.name,
          cat: item.cat,
          costPrice: item.costPrice,
          price: item.price,
          stock: item.stock,
          batches: item.stock > 0 ? [{
            id: `BATCH-${Date.now()}-${i}`,
            nota: "IMPORT",
            buyPrice: item.costPrice,
            sellPrice: item.price,
            qty: item.stock,
            expireDate: ""
          }] : []
        });
        addedCount++;
      }
    });

    if (addedCount === 0 && updatedCount === 0) {
      await showThemedAlert("Gagal Import", "Kolom nama barang tidak ditemukan atau format kolom belum sesuai.", "error");
      return;
    }

    if (newCategoriesAdded) persistCategories();
    persistProducts();
    renderProducts();
    renderAllInventoryData();
    renderFinanceDashboard();
    debouncedUpdateMetrics();

    await showThemedAlert(
      "Import Persediaan Sukses",
      `Berhasil memproses ${addedCount + updatedCount} barang:\n• ${addedCount} barang baru ditambahkan\n• ${updatedCount} data barang diperbarui`,
      "info"
    );
  } catch (err) {
    console.error("Gagal import berkas:", err);
    await showThemedAlert("Gagal Memproses Berkas", "Terjadi kesalahan: " + err.message, "error");
  }
}

function parseCSV(text) {
  const lines = text.split(/\r\n|\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const separator = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(separator).map((h) => h.replace(/^["']|["']$/g, "").trim().toLowerCase());

  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const regex = new RegExp(`(?:^|${separator})(\"(?:[^\"]|\"\")*\"|[^${separator}]*)`, "g");
    const values = [];
    let match;
    while ((match = regex.exec(lines[i])) !== null) {
      let val = match[1] || "";
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      values.push(val.trim());
    }
    if (values.length > 0) {
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] !== undefined ? values[idx] : "";
      });
      result.push(row);
    }
  }
  return result;
}

async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("Gagal mengunduh pustaka pembaca Excel. Pastikan koneksi internet aktif."));
    document.head.appendChild(script);
  });
}

async function parseExcel(file) {
  const XLSX = await loadXLSX();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet);
}

function normalizeProductRow(row) {
  const getVal = (keys, fallback = "") => {
    for (const k of keys) {
      const matchKey = Object.keys(row).find((rk) => rk.toLowerCase().trim() === k.toLowerCase().trim());
      if (matchKey && row[matchKey] !== undefined && row[matchKey] !== null && String(row[matchKey]).trim() !== "") {
        return row[matchKey];
      }
    }
    return fallback;
  };

  const name = String(getVal(["name", "nama", "nama barang", "nama_barang", "produk", "product"], "")).trim();
  if (!name) return null;

  const barcode = String(getVal(["barcode", "kode", "kode barcode", "kode_barcode", "ean", "sku"], "")).trim() || `899${Math.floor(1000 + Math.random() * 9000)}`;
  const cat = String(getVal(["cat", "kategori", "category"], state.categoriesDB[0] || "Bahan Kue")).trim();
  const costPrice = Math.max(0, parseInt(String(getVal(["costprice", "cost_price", "hpp", "modal", "harga modal", "harga_modal", "harga beli", "harga_beli"], 0)).replace(/\D/g, ""), 10) || 0);
  const price = Math.max(0, parseInt(String(getVal(["price", "harga", "harga jual", "harga_jual", "sellprice", "sell_price", "jual"], 0)).replace(/\D/g, ""), 10) || 0);
  const stock = Math.max(0, parseInt(String(getVal(["stock", "stok", "qty", "jumlah"], 0)).replace(/\D/g, ""), 10) || 0);

  return { barcode, name, cat, costPrice, price, stock };
}

function downloadInventoryCsvTemplate() {
  const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(
    "Barcode,Nama Barang,Kategori,HPP,Harga Jual,Stok\n" +
    "8991001,Tepung Terigu Kholif 1kg,Bahan Kue,11000,14000,100\n" +
    "8991002,Gula Halus Murni 500g,Bahan Kue,9500,12000,80\n" +
    "8991003,Kotak Box Kraft M (10pcs),Kemasan,18000,22000,150\n"
  );
  const a = document.createElement("a");
  a.setAttribute("href", csvContent);
  a.setAttribute("download", "template-import-persediaan-kholifstore.csv");
  document.body.appendChild(a);
  a.click();
  a.remove();
  showScanToast("Template CSV berhasil diunduh");
}

function openSettingsSubMenu(subId) {
  state.activeSettingsSubMenuId = subId;
  document.getElementById("panelSubProfile")?.classList.add("hidden");
  document.getElementById("panelSubPrinterSettings")?.classList.add("hidden");
  document.getElementById("panelSubPosSettings")?.classList.add("hidden");
  document.getElementById("panelSubFinanceSettings")?.classList.add("hidden");
  document.getElementById("panelSubMasterIt")?.classList.add("hidden");
  document.getElementById("panelSubBackup")?.classList.add("hidden");

  let title = "Pengaturan";
  if (subId === "subProfile") {
    document.getElementById("panelSubProfile")?.classList.remove("hidden");
    title = "Profil Pengguna";
    if (state.currentUser) {
      document.getElementById("setProfileName").textContent = state.currentUser.name;
      document.getElementById("setProfileUser").textContent = state.currentUser.username;
      document.getElementById("setProfileRole").textContent = state.currentUser.role.replace("_", " ").toUpperCase();
    }
  } else if (subId === "subPrinterSettings") {
    document.getElementById("panelSubPrinterSettings")?.classList.remove("hidden");
    title = "Setup Printer Kasir";
  } else if (subId === "subPosSettings") {
    document.getElementById("panelSubPosSettings")?.classList.remove("hidden");
    title = "Operasional Kasir";
    renderOperationalToggles();
  } else if (subId === "subFinanceSettings") {
    document.getElementById("panelSubFinanceSettings")?.classList.remove("hidden");
    title = "Tutup Buku & Kas";
  } else if (subId === "subMasterIt") {
    document.getElementById("panelSubMasterIt")?.classList.remove("hidden");
    title = "Master IT Panel";
    closeMasterItSubMenu();
    updateMasterItBadges();
  } else if (subId === "subBackup") {
    document.getElementById("panelSubBackup")?.classList.remove("hidden");
    title = "Database & Backup";
  }

  const sTitle = document.getElementById("settingsSubTitle");
  if (sTitle) sTitle.textContent = title;
  document.getElementById("settingsMenuView")?.classList.add("hidden");
  document.getElementById("settingsDetailView")?.classList.remove("hidden");
  reinforceHistoryBarrier();
}

function renderOperationalToggles() {
  const container = document.getElementById("posOperationalToggles");
  if (!container) return;

  const desc = {
    feat_pajak: "PPN (11%) otomatis pada kalkulasi kasir",
    feat_diskon: "Potongan diskon tunai di kasir",
    feat_tahan_pesanan: "Simpan antrean keranjang sementara"
  };

  container.innerHTML = Object.values(state.featuresConfig).filter((feat) => {
    return !(state.currentUser.role === "admin" && !feat.allowedRoles.includes("admin"));
  }).map((feat) => `
    <div class="settings-toggle-row">
      <div class="toggle-info">
        <strong>${feat.name}</strong>
        <span>${desc[feat.id] || "Modul operasional"}</span>
      </div>
      <label class="threads-switch">
        <input type="checkbox" class="op-toggle-switch" data-id="${feat.id}" ${feat.enabled ? "checked" : ""} />
        <span class="threads-slider"></span>
      </label>
    </div>
  `).join("");
}

function initMasterItModule() {
  document.querySelectorAll("[data-it-sub]").forEach((card) => {
    card.onclick = () => openMasterItSubMenu(card.getAttribute("data-it-sub"));
  });

  const btnBackMasterIt = document.getElementById("btnBackMasterItSubMenu");
  if (btnBackMasterIt) {
    btnBackMasterIt.onclick = () => closeMasterItSubMenu();
  }

  const itAccountsTbody = document.getElementById("itAccountsTableBody");
  if (itAccountsTbody) {
    itAccountsTbody.addEventListener("click", async (e) => {
      const editBtn = e.target.closest(".btn-edit-acc");
      if (editBtn) {
        const u = editBtn.getAttribute("data-u");
        const acc = state.accountsDB.find((a) => a.username === u);
        if (!acc) return;

        const newPass = await showThemedPrompt("Ubah Password", `Masukkan password baru untuk akun ${acc.name} (${u}):`, "");
        if (newPass && newPass.trim() !== "") {
          acc.password = await hashPassword(newPass.trim());
          persistAccounts();
          renderAccountsTable();
          showScanToast("Password akun diperbarui");
        }
        return;
      }

      const delBtn = e.target.closest(".btn-del-acc");
      if (delBtn) {
        const u = delBtn.getAttribute("data-u");
        const ok = await showThemedConfirm("Hapus Akun", `Hapus akun staf "${u}"?`);
        if (ok) {
          state.accountsDB = state.accountsDB.filter((a) => a.username !== u);
          persistAccounts();
          renderAccountsTable();
          updateMasterItBadges();
          showScanToast("Akun dihapus");
        }
      }
    });
  }

  const itFeaturesContainer = document.getElementById("itFeatureCardsList");
  if (itFeaturesContainer) {
    itFeaturesContainer.addEventListener("change", (e) => {
      const swEnable = e.target.closest(".it-toggle-enable");
      if (swEnable) {
        const id = swEnable.getAttribute("data-id");
        state.featuresConfig[id].enabled = swEnable.checked;
        persistFeatures();
        applyFeatureGate();
        renderCart();
        return;
      }

      const swRole = e.target.closest(".it-toggle-role");
      if (swRole) {
        const id = swRole.getAttribute("data-id");
        const role = swRole.getAttribute("data-role");
        if (swRole.checked) {
          if (!state.featuresConfig[id].allowedRoles.includes(role)) {
            state.featuresConfig[id].allowedRoles.push(role);
          }
        } else {
          state.featuresConfig[id].allowedRoles = state.featuresConfig[id].allowedRoles.filter((r) => r !== role);
        }
        persistFeatures();
        applyFeatureGate();
        renderCart();
      }
    });

    itFeaturesContainer.addEventListener("click", async (e) => {
      const elimBtn = e.target.closest(".btn-eliminate-module");
      if (!elimBtn) return;
      const id = elimBtn.getAttribute("data-id");
      const ok = await showThemedConfirm("Eliminasi Modul", `Eliminasi fitur "${state.featuresConfig[id].name}"?`);
      if (ok) {
        delete state.featuresConfig[id];
        persistFeatures();
        applyFeatureGate();
        renderCart();
        renderItFeaturesCards();
        updateMasterItBadges();
      }
    });
  }

  const consoleTbody = document.getElementById("consoleDataTableBody");
  if (consoleTbody) {
    consoleTbody.addEventListener("click", async (e) => {
      const editBtn = e.target.closest(".btn-console-edit");
      if (editBtn) {
        const idx = Number(editBtn.getAttribute("data-idx"));
        const tableName = document.getElementById("consoleTableSelect")?.value || "products";
        const search = document.getElementById("consoleSearchInput")?.value.toLowerCase().trim() || "";
        const dataset = getConsoleCollection(tableName);
        const filtered = dataset.filter((item) => {
          const raw = typeof item === "string" ? item : JSON.stringify(item);
          return raw.toLowerCase().includes(search);
        });
        const target = filtered[idx];
        if (target) openConsoleEditorModal(false, target);
        return;
      }

      const delBtn = e.target.closest(".btn-console-del");
      if (delBtn) {
        const idx = Number(delBtn.getAttribute("data-idx"));
        const tableName = document.getElementById("consoleTableSelect")?.value || "products";
        const search = document.getElementById("consoleSearchInput")?.value.toLowerCase().trim() || "";
        const dataset = getConsoleCollection(tableName);
        const filtered = dataset.filter((item) => {
          const raw = typeof item === "string" ? item : JSON.stringify(item);
          return raw.toLowerCase().includes(search);
        });
        const target = filtered[idx];
        if (!target) return;

        const ok = await showThemedConfirm("Hapus Data Console", "Apakah Anda yakin ingin menghapus data ini dari koleksi database?");
        if (ok) {
          const fullDataset = getConsoleCollection(tableName);
          const realIdx = fullDataset.indexOf(target);
          if (realIdx !== -1) {
            fullDataset.splice(realIdx, 1);
            saveConsoleCollection(tableName);
            renderConsoleTable();
            debouncedUpdateMetrics();
            showScanToast("Data berhasil dihapus via Console");
          }
        }
      }
    });
  }

  const formCreateUser = document.getElementById("formCreateUser");
  if (formCreateUser) {
    formCreateUser.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("newAccName").value.trim();
      const username = document.getElementById("newAccUser").value.trim().toLowerCase();
      const rawPassword = document.getElementById("newAccPass").value.trim();
      const role = document.getElementById("newAccRole").value;

      if (state.accountsDB.some((a) => a.username === username)) {
        await showThemedAlert("Username Terpakai", "Username tersebut sudah terdaftar untuk karyawan lain.", "info");
        return;
      }

      const hashedPassword = await hashPassword(rawPassword);
      state.accountsDB.push({ name, username, password: hashedPassword, role });
      persistAccounts();
      renderAccountsTable();
      updateMasterItBadges();
      formCreateUser.reset();
      showScanToast(`Akun "${name}" dibuat`);
    });
  }

  const btnRefreshMetrics = document.getElementById("btnRefreshMetrics");
  if (btnRefreshMetrics) {
    btnRefreshMetrics.onclick = () => {
      updateMetricsDashboard();
      showScanToast("Metrik database diperbarui");
    };
  }

  const consoleSelect = document.getElementById("consoleTableSelect");
  if (consoleSelect) {
    consoleSelect.onchange = () => renderConsoleTable();
  }

  const consoleSearch = document.getElementById("consoleSearchInput");
  if (consoleSearch) {
    consoleSearch.addEventListener("input", debounce(() => renderConsoleTable(), 80));
  }

  const btnConsoleAdd = document.getElementById("btnConsoleAddNewEntry");
  if (btnConsoleAdd) {
    btnConsoleAdd.onclick = () => openConsoleEditorModal(true);
  }

  const btnCloseModal = document.getElementById("btnCloseConsoleModal");
  if (btnCloseModal) {
    btnCloseModal.onclick = () => document.getElementById("consoleEditModal")?.classList.remove("open");
  }

  const formConsole = document.getElementById("consoleEditorForm");
  if (formConsole) {
    formConsole.addEventListener("submit", handleSaveConsoleEntry);
  }
}

export function openMasterItSubMenu(subId) {
  state.activeMasterItSubMenuId = subId;
  const menuView = document.getElementById("masterItMenuView");
  const detailView = document.getElementById("masterItDetailView");
  const subTitle = document.getElementById("masterItSubTitle");

  document.getElementById("panelItSubAccounts")?.classList.add("hidden");
  document.getElementById("panelItSubFeatures")?.classList.add("hidden");
  document.getElementById("panelItSubMetrics")?.classList.add("hidden");
  document.getElementById("panelItSubConsole")?.classList.add("hidden");

  let titleText = "Detail Otoritas IT";
  if (subId === "itSubAccounts") {
    document.getElementById("panelItSubAccounts")?.classList.remove("hidden");
    titleText = "Kelola Akun Staf";
    renderAccountsTable();
  } else if (subId === "itSubFeatures") {
    document.getElementById("panelItSubFeatures")?.classList.remove("hidden");
    titleText = "Hak Akses Fitur Modul";
    renderItFeaturesCards();
  } else if (subId === "itSubMetrics") {
    document.getElementById("panelItSubMetrics")?.classList.remove("hidden");
    titleText = "Kapasitas DB & Metrik Server";
    updateMetricsDashboard();
  } else if (subId === "itSubConsole") {
    document.getElementById("panelItSubConsole")?.classList.remove("hidden");
    titleText = "Console Database Aplikasi";
    renderConsoleTable();
  }

  if (subTitle) subTitle.textContent = titleText;
  if (menuView) menuView.classList.add("hidden");
  if (detailView) detailView.classList.remove("hidden");
  reinforceHistoryBarrier();
}

export function closeMasterItSubMenu() {
  state.activeMasterItSubMenuId = null;
  document.getElementById("masterItDetailView")?.classList.add("hidden");
  document.getElementById("masterItMenuView")?.classList.remove("hidden");
  updateMasterItBadges();
}

function updateMasterItBadges() {
  const badgeAcc = document.getElementById("badgeItAccountsCount");
  if (badgeAcc) badgeAcc.textContent = `${state.accountsDB.length} Akun`;

  const badgeFeat = document.getElementById("badgeItFeaturesCount");
  if (badgeFeat) badgeFeat.textContent = `${Object.keys(state.featuresConfig).length} Modul`;
}

export function updateMetricsDashboard() {
  const totalDocs = 
    state.productsDB.length +
    state.categoriesDB.length +
    state.membersDB.length +
    state.purchasesDB.length +
    state.supplierDebtsDB.length +
    state.stockOpnamesDB.length +
    state.salesTransactions.length +
    state.accountsDB.length +
    (state.financeDB?.logs?.length || 0);

  const payloadStr = JSON.stringify({
    products: state.productsDB,
    categories: state.categoriesDB,
    members: state.membersDB,
    purchases: state.purchasesDB,
    debts: state.supplierDebtsDB,
    opnames: state.stockOpnamesDB,
    sales: state.salesTransactions,
    accounts: state.accountsDB,
    finance: state.financeDB,
    features: state.featuresConfig
  });

  const bytes = new Blob([payloadStr]).size;
  const kb = bytes / 1024;
  const mb = kb / 1024;

  const maxQuotaMB = 1024;
  const storagePercent = ((mb / maxQuotaMB) * 100).toFixed(2);

  const optimalDocsLimit = 5000;
  const docsPercent = Math.min(100, Math.round((totalDocs / optimalDocsLimit) * 100));

  const txtStoragePercent = document.getElementById("txtStoragePercent");
  const barStorageProgress = document.getElementById("barStorageProgress");
  const txtStorageUsage = document.getElementById("txtStorageUsage");
  const badgeDbStoragePercent = document.getElementById("badgeDbStoragePercent");

  if (txtStoragePercent) txtStoragePercent.textContent = `${storagePercent}%`;
  if (barStorageProgress) barStorageProgress.style.width = `${Math.max(1, storagePercent)}%`;
  if (txtStorageUsage) txtStorageUsage.textContent = `~${kb.toFixed(2)} KB (Estimasi) / 1.024 MB`;
  if (badgeDbStoragePercent) badgeDbStoragePercent.textContent = `${storagePercent}%`;

  const txtDocsPercent = document.getElementById("txtDocsPercent");
  const barDocsProgress = document.getElementById("barDocsProgress");
  const txtDocsCount = document.getElementById("txtDocsCount");

  if (txtDocsPercent) txtDocsPercent.textContent = `${docsPercent}%`;
  if (barDocsProgress) barDocsProgress.style.width = `${Math.max(1, docsPercent)}%`;
  if (txtDocsCount) txtDocsCount.textContent = `${totalDocs} Dokumen Terdaftar`;

  const valLastSyncTime = document.getElementById("valLastSyncTime");
  if (valLastSyncTime) {
    if (state.lastSyncTimestamp) {
      const d = new Date(state.lastSyncTimestamp);
      valLastSyncTime.textContent = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " (Tersinkronisasi)";
    } else {
      valLastSyncTime.textContent = "Baru saja";
    }
  }
}

function renderAccountsTable() {
  const tbody = document.getElementById("itAccountsTableBody");
  if (!tbody) return;
  tbody.innerHTML = state.accountsDB.map((acc) => {
    const isMaster = acc.role === "master_it";
    return `
      <tr>
        <td><strong>${acc.name}</strong></td>
        <td>${acc.username}</td>
        <td><code>••••••••</code></td>
        <td><span class="badge-mono">${acc.role.replace("_", " ")}</span></td>
        <td style="text-align: right;">
          ${isMaster ? "<small>Akun Utama</small>" : `
            <button type="button" class="btn-table-action btn-edit-acc" data-u="${acc.username}">Ubah Sandi</button>
            <button type="button" class="btn-table-action btn-delete btn-del-acc" data-u="${acc.username}">Hapus</button>
          `}
        </td>
      </tr>
    `;
  }).join("");
}

function renderItFeaturesCards() {
  const container = document.getElementById("itFeatureCardsList");
  if (!container) return;

  container.innerHTML = Object.values(state.featuresConfig).map((feat) => `
    <div class="feature-module-card">
      <div class="module-header">
        <div class="module-title-box">
          <strong>${feat.name}</strong>
          <small>${feat.id}</small>
        </div>
        <button type="button" class="btn-eliminate-module" data-id="${feat.id}">Eliminasi</button>
      </div>
      <div class="module-controls-grid">
        <div class="control-item">
          <span>Status</span>
          <label class="threads-switch threads-switch-sm">
            <input type="checkbox" class="it-toggle-enable" data-id="${feat.id}" ${feat.enabled ? "checked" : ""} />
            <span class="threads-slider"></span>
          </label>
        </div>
        <div class="control-item">
          <span>Admin</span>
          <label class="threads-switch threads-switch-sm">
            <input type="checkbox" class="it-toggle-role" data-id="${feat.id}" data-role="admin" ${feat.allowedRoles.includes("admin") ? "checked" : ""} />
            <span class="threads-slider"></span>
          </label>
        </div>
        <div class="control-item">
          <span>Kasir</span>
          <label class="threads-switch threads-switch-sm">
            <input type="checkbox" class="it-toggle-role" data-id="${feat.id}" data-role="cashier" ${feat.allowedRoles.includes("cashier") ? "checked" : ""} />
            <span class="threads-slider"></span>
          </label>
        </div>
      </div>
    </div>
  `).join("");
}

function getConsoleCollection(tableName) {
  switch (tableName) {
    case "products": return state.productsDB;
    case "categories": return state.categoriesDB;
    case "members": return state.membersDB;
    case "purchases": return state.purchasesDB;
    case "sales": return state.salesTransactions;
    case "accounts": return state.accountsDB;
    default: return [];
  }
}

function saveConsoleCollection(tableName) {
  switch (tableName) {
    case "products":
      persistProducts();
      renderProducts();
      renderAllInventoryData();
      renderFinanceDashboard();
      break;
    case "categories":
      persistCategories();
      renderCategories();
      break;
    case "members":
      persistMembers();
      renderAllMemberData();
      break;
    case "purchases":
      persistPurchases();
      renderPurchasesTable();
      renderSupplierDebtsTable();
      renderFinanceDashboard();
      break;
    case "sales":
      persistSales();
      renderReports();
      renderAllMemberData();
      renderFinanceDashboard();
      break;
    case "accounts":
      persistAccounts();
      renderAccountsTable();
      break;
  }
}

function renderConsoleTable() {
  const tbody = document.getElementById("consoleDataTableBody");
  const countEl = document.getElementById("consoleItemCount");
  const tableName = document.getElementById("consoleTableSelect")?.value || "products";
  const search = document.getElementById("consoleSearchInput")?.value.toLowerCase().trim() || "";

  if (!tbody) return;

  const dataset = getConsoleCollection(tableName);
  const filtered = dataset.filter((item) => {
    const raw = typeof item === "string" ? item : JSON.stringify(item);
    return !search || raw.toLowerCase().includes(search);
  });

  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-secondary); padding: 18px;">Tidak ada data entitas dalam koleksi "${tableName}".</td></tr>`;
    return;
  }

  const displayList = filtered.slice(0, MAX_CONSOLE_RENDER);
  tbody.innerHTML = displayList.map((item, idx) => {
    let key = `ROW-${idx}`;
    let preview = "";

    if (tableName === "categories") {
      key = item;
      preview = `Kategori: <strong>${item}</strong>`;
    } else {
      key = item.id || item.username || item.barcode || item.nota || `IDX-${idx}`;
      preview = `<span class="console-json-preview">${JSON.stringify(item)}</span>`;
    }

    return `
      <tr>
        <td><strong>${key}</strong></td>
        <td>${preview}</td>
        <td style="text-align: right;">
          <button type="button" class="btn-table-action btn-console-edit" data-idx="${idx}">Edit</button>
          <button type="button" class="btn-table-action btn-delete btn-console-del" data-idx="${idx}">Hapus</button>
        </td>
      </tr>
    `;
  }).join("");
}

function openConsoleEditorModal(isNew = true, existingItem = null) {
  const modal = document.getElementById("consoleEditModal");
  const modalTitle = document.getElementById("consoleModalTitle");
  const idInp = document.getElementById("consoleEntryId");
  const textarea = document.getElementById("consoleJsonPayload");
  const tableName = document.getElementById("consoleTableSelect")?.value || "products";

  if (isNew) {
    modalTitle.textContent = `Tambah Data Baru (${tableName})`;
    idInp.value = "";
    if (tableName === "categories") {
      textarea.value = JSON.stringify({ name: "Kategori Baru" }, null, 2);
    } else if (tableName === "products") {
      textarea.value = JSON.stringify({
        id: Date.now(),
        barcode: `899${Math.floor(1000 + Math.random() * 9000)}`,
        name: "Nama Barang Baru",
        cat: state.categoriesDB[0] || "Bahan Kue",
        costPrice: 10000,
        price: 13000,
        stock: 0,
        batches: []
      }, null, 2);
    } else {
      textarea.value = JSON.stringify({ id: `ID-${Date.now()}` }, null, 2);
    }
  } else {
    modalTitle.textContent = `Edit Data Console (${tableName})`;
    idInp.value = existingItem.id || existingItem.username || existingItem || "EXISTING";
    textarea.value = typeof existingItem === "string" ? JSON.stringify({ name: existingItem }, null, 2) : JSON.stringify(existingItem, null, 2);
  }

  modal?.classList.add("open");
  reinforceHistoryBarrier();
  setTimeout(() => textarea?.focus(), 150);
}

async function handleSaveConsoleEntry(e) {
  e.preventDefault();
  const tableName = document.getElementById("consoleTableSelect")?.value || "products";
  const rawJson = document.getElementById("consoleJsonPayload")?.value.trim();
  const entryId = document.getElementById("consoleEntryId")?.value;

  try {
    const parsed = JSON.parse(rawJson);
    const dataset = getConsoleCollection(tableName);

    if (tableName === "categories") {
      const catName = parsed.name || parsed;
      if (!catName || typeof catName !== "string") {
        throw new Error("Kategori harus memiliki atribut nama berupa string.");
      }
      if (entryId && entryId !== "") {
        const idx = dataset.indexOf(entryId);
        if (idx !== -1) dataset[idx] = catName;
      } else {
        dataset.push(catName);
      }
    } else {
      if (entryId && entryId !== "") {
        const idx = dataset.findIndex((x) => String(x.id || x.username) === String(entryId));
        if (idx !== -1) {
          dataset[idx] = parsed;
        } else {
          dataset.push(parsed);
        }
      } else {
        dataset.push(parsed);
      }
    }

    saveConsoleCollection(tableName);
    document.getElementById("consoleEditModal")?.classList.remove("open");
    renderConsoleTable();
    debouncedUpdateMetrics();
    showScanToast("Perubahan data Console berhasil disimpan");
  } catch (err) {
    await showThemedAlert("Format JSON Salah", "Format teks JSON tidak valid. Periksa kembali tanda kurung dan koma:\n" + err.message, "error");
  }
}

function initHardwareScanner() {
  let barcodeBuffer = "";
  let lastKeyStrokeTime = Date.now();

  window.addEventListener("keydown", (e) => {
    const activeEl = document.activeElement;
    const activeTag = activeEl ? activeEl.tagName : "";
    const activeId = activeEl ? activeEl.id : "";

    const allowedScannerInputs = [
      "productSearch",
      "prodFormBarcode",
      "purchProductSearchInput",
      "opnameProductSearchInput",
      "posMemberSearchInput"
    ];

    if (activeTag === "TEXTAREA") return;
    if (activeTag === "INPUT" && !allowedScannerInputs.includes(activeId)) {
      return;
    }

    const currentTime = Date.now();
    if (currentTime - lastKeyStrokeTime > 60) barcodeBuffer = "";
    lastKeyStrokeTime = currentTime;

    if (e.key === "Enter") {
      if (barcodeBuffer.length >= 3) {
        e.preventDefault();
        processScannedBarcode(barcodeBuffer.trim());
        barcodeBuffer = "";
        if (activeEl && allowedScannerInputs.includes(activeId) && activeId !== "prodFormBarcode") {
          activeEl.value = "";
        }
      }
      return;
    }

    if (e.key.length === 1) barcodeBuffer += e.key;
  });

  const searchEl = document.getElementById("productSearch");
  if (searchEl) {
    searchEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = searchEl.value.trim();
        if (val) processScannedBarcode(val);
        searchEl.value = "";
        state.searchQuery = "";
        renderProducts();
        searchEl.blur();
      }
    });

    searchEl.addEventListener("input", debounce((e) => {
      state.searchQuery = e.target.value;
      renderProducts();
    }, 60));
  }
}

async function processScannedBarcode(code) {
  // 1. Layar Form Tambah / Edit Barang Baru
  const prodPage = document.getElementById("productPageScreen");
  const prodBarcodeInp = document.getElementById("prodFormBarcode");
  if (prodPage && prodPage.classList.contains("active") && prodBarcodeInp) {
    prodBarcodeInp.value = code;
    playScannerBeep(true);
    showScanToast(`Barcode: ${code}`);
    return;
  }

  // 2. Layar Pemilih Barang Faktur Pembelian Supplier
  const purchPicker = document.getElementById("purchProductPickerScreen");
  if (purchPicker && purchPicker.classList.contains("active")) {
    const prod = state.productsDB.find((p) => p && (String(p.barcode) === code || String(p.id) === code));
    if (prod) {
      playScannerBeep(true);
      showScanToast(`Dipilih: ${prod.name}`);
      selectPurchProductFromScanner(prod);
    } else {
      playScannerBeep(false);
      await showThemedAlert("Tidak Ditemukan", `Barang dengan barcode "${code}" belum terdaftar di katalog.`, "error");
    }
    return;
  }

  // 3. Layar Pemilih Barang Audit Stok Opname
  const opnamePicker = document.getElementById("opnameProductPickerScreen");
  if (opnamePicker && opnamePicker.classList.contains("active")) {
    const prod = state.productsDB.find((p) => p && (String(p.barcode) === code || String(p.id) === code));
    if (prod) {
      playScannerBeep(true);
      document.getElementById("opnameSelectedProductId").value = prod.id;
      document.getElementById("opnameSelectedProductName").textContent = prod.name;
      document.getElementById("opnameSystemStock").value = `${prod.stock} pcs`;
      window.history.back();
      showScanToast(`Audit: ${prod.name}`);
      setTimeout(() => document.getElementById("opnamePhysicalStock")?.focus(), 200);
    } else {
      playScannerBeep(false);
      await showThemedAlert("Tidak Ditemukan", `Barang dengan barcode "${code}" tidak ditemukan.`, "error");
    }
    return;
  }

  // 4. Layar Pemilih Member di Meja Kasir
  const memberPicker = document.getElementById("posMemberPickerScreen");
  if (memberPicker && memberPicker.classList.contains("active")) {
    const matchedMember = state.membersDB.find((m) => m.phone === code || m.id === code);
    if (matchedMember) {
      attachMember(matchedMember);
      playScannerBeep(true);
      window.history.back();
    } else {
      playScannerBeep(false);
      await showThemedAlert("Member Tidak Ditemukan", `Member dengan ID / WA "${code}" tidak ditemukan.`, "error");
    }
    return;
  }

  // 5. Layar Utama POS (Meja Kasir)
  const matchedMember = state.membersDB.find((m) => m.phone === code || m.id === code);
  if (matchedMember) {
    attachMember(matchedMember);
    playScannerBeep(true);
    return;
  }

  const prod = state.productsDB.find((p) => String(p.barcode) === code || String(p.id) === code);
  if (prod) {
    const ok = await addToCart(prod, true);
    if (ok) {
      playScannerBeep(true);
      showScanToast(`${prod.name} (+1)`);
      setTimeout(() => {
        const cardEl = document.querySelector(`[data-cart-id="${prod.id}"]`);
        if (cardEl) {
          cardEl.classList.remove("item-scanned");
          void cardEl.offsetWidth;
          cardEl.classList.add("item-scanned");
        }
      }, 50);
    } else {
      playScannerBeep(false);
    }
  } else {
    playScannerBeep(false);
    await showThemedAlert("Tidak Ditemukan", `Barang atau Member "${code}" tidak ditemukan.`, "error");
  }
}

window.addEventListener("DOMContentLoaded", bootstrap);
