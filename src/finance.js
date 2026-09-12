// src/finance.js
import { state, persistFinance } from "./state.js";
import { showThemedAlert, reinforceHistoryBarrier } from "./ui.js";
import { showScanToast } from "./utils.js";

const MAX_FINANCE_LOGS_RENDER = 50;

export function initFinanceModule() {
  document.querySelectorAll("[data-fin-sub]").forEach((card) => {
    card.onclick = () => openFinanceSubMenu(card.getAttribute("data-fin-sub"));
  });

  const btnBack = document.getElementById("btnBackFinSubMenu");
  if (btnBack) {
    btnBack.onclick = () => closeFinanceSubMenu();
  }

  const inAmount = document.getElementById("finInputAmount");
  if (inAmount) {
    inAmount.addEventListener("input", (e) => {
      const raw = e.target.value.replace(/\D/g, "");
      e.target.value = raw ? parseInt(raw, 10).toLocaleString("id-ID") : "";
    });
  }

  const form = document.getElementById("financeActionForm");
  if (form) {
    form.addEventListener("submit", handleSaveFinanceAction);
  }

  renderFinanceDashboard();
}

export function openFinanceSubMenu(subId) {
  state.activeFinSubMenuId = subId;
  const menuView = document.getElementById("financeMenuView");
  const detailView = document.getElementById("financeDetailView");
  const sTitle = document.getElementById("financeSubTitle");
  const inType = document.getElementById("finActionType");
  const inNote = document.getElementById("finInputNote");
  const bannerText = document.getElementById("finInfoBannerText");
  const form = document.getElementById("financeActionForm");

  form.reset();
  inType.value = subId;

  if (subId === "finSubWithdrawProfit") {
    sTitle.textContent = "Tarik Keuntungan Toko";
    inNote.placeholder = "Cth: Bagi hasil keuntungan bulan ini";
    bannerText.textContent = "Penarikan dividen atau keuntungan akan mengurangi saldo kas fisik toko saat ini.";
  } else if (subId === "finSubWithdrawCapital") {
    sTitle.textContent = "Tarik Modal Usaha";
    inNote.placeholder = "Cth: Penarikan kembali modal awal";
    bannerText.textContent = "Penarikan modal pokok usaha akan langsung mengurangi kas fisik toko.";
  } else if (subId === "finSubOperationalExpense") {
    sTitle.textContent = "Tarik Biaya Operasional (Tunai)";
    inNote.placeholder = "Cth: Beli kantong kresek, bayar listrik, bensin";
    bannerText.textContent = "Pengeluaran ini akan langsung dicatat sebagai beban operasional pada laporan laba bersih.";
  } else if (subId === "finSubDepositCapital") {
    sTitle.textContent = "Setor Modal Kas Toko";
    inNote.placeholder = "Cth: Tambahan modal kas kecil / kembalian kasir";
    bannerText.textContent = "Uang tunai yang disetorkan akan menambah total saldo kas fisik yang dapat digunakan.";
  } else if (subId === "finSubSettleDigital") {
    sTitle.textContent = "Pencairan Saldo QRIS / Bank";
    inNote.placeholder = "Cth: Penarikan QRIS ke rekening owner / setor ke laci kasir";
    bannerText.textContent = "Transaksi ini akan memotong saldo QRIS atau transfer yang telah terkumpul di sistem.";
  }

  menuView?.classList.add("hidden");
  detailView?.classList.remove("hidden");
  reinforceHistoryBarrier();
}

export function closeFinanceSubMenu() {
  state.activeFinSubMenuId = null;
  document.getElementById("financeDetailView")?.classList.add("hidden");
  document.getElementById("financeMenuView")?.classList.remove("hidden");
  renderFinanceDashboard();
}

export function renderFinanceDashboard() {
  const statCash = document.getElementById("finStatCashOnHand");
  const statDigital = document.getElementById("finStatDigitalBalance");
  const statAsset = document.getElementById("finStatInventoryAsset");
  const tbody = document.getElementById("financeLogsTableBody");
  const badgeLogs = document.getElementById("badgeTotalFinLogs");

  const currentCash = Number(state.financeDB?.cashBalance) || 0;
  const currentDigital = Number(state.financeDB?.digitalBalance) || 0;

  if (statCash) statCash.textContent = `Rp ${currentCash.toLocaleString("id-ID")}`;
  if (statDigital) statDigital.textContent = `Rp ${currentDigital.toLocaleString("id-ID")}`;

  let totalAsset = 0;
  const products = state.productsDB || [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (p) {
      totalAsset += (Number(p.costPrice) || 0) * (Number(p.stock) || 0);
    }
  }

  if (statAsset) statAsset.textContent = `Rp ${totalAsset.toLocaleString("id-ID")}`;

  const logs = state.financeDB?.logs || [];
  if (badgeLogs) badgeLogs.textContent = `${logs.length} Mutasi`;

  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-secondary); padding: 16px;">Belum ada catatan mutasi kas keuangan.</td></tr>`;
    return;
  }

  const displayLogs = logs.slice(0, MAX_FINANCE_LOGS_RENDER);
  tbody.innerHTML = displayLogs.map((l) => {
    const isIncome = l.type.includes("Setor") || l.type.includes("Penjualan");
    return `
      <tr>
        <td>${l.time}</td>
        <td><strong>${l.type}</strong></td>
        <td style="color: ${isIncome ? '#16a34a' : 'var(--brand-danger)'}; font-weight:800;">
          ${isIncome ? '+' : '-'} Rp ${Number(l.amount).toLocaleString("id-ID")}
        </td>
        <td>${l.admin}</td>
        <td><small>${l.note}</small></td>
      </tr>
    `;
  }).join("");
}

async function handleSaveFinanceAction(e) {
  e.preventDefault();
  const subId = document.getElementById("finActionType").value;
  const rawAmt = document.getElementById("finInputAmount").value.replace(/\D/g, "");
  const amount = parseInt(rawAmt, 10) || 0;
  const note = document.getElementById("finInputNote").value.trim();

  if (amount <= 0) {
    await showThemedAlert("Nominal Salah", "Masukkan nominal uang yang valid lebih dari Rp 0.", "error");
    return;
  }

  const currentCash = Number(state.financeDB.cashBalance) || 0;
  const currentDigital = Number(state.financeDB.digitalBalance) || 0;

  if (subId === "finSubSettleDigital") {
    if (currentDigital < amount) {
      await showThemedAlert("Saldo Digital Kurang", `Saldo QRIS atau transfer saat ini hanya Rp ${currentDigital.toLocaleString("id-ID")}.`, "error");
      return;
    }
    state.financeDB.digitalBalance = Math.max(0, currentDigital - amount);
  } else if (subId === "finSubDepositCapital") {
    state.financeDB.cashBalance = currentCash + amount;
  } else {
    if (currentCash < amount) {
      await showThemedAlert("Saldo Kas Kurang", `Saldo kas fisik saat ini hanya Rp ${currentCash.toLocaleString("id-ID")}.`, "error");
      return;
    }
    state.financeDB.cashBalance = Math.max(0, currentCash - amount);
  }

  let actionName = "Mutasi Kas";
  if (subId === "finSubWithdrawProfit") actionName = "Tarik Keuntungan";
  else if (subId === "finSubWithdrawCapital") actionName = "Tarik Modal";
  else if (subId === "finSubOperationalExpense") actionName = "Biaya Operasional";
  else if (subId === "finSubDepositCapital") actionName = "Setor Modal";
  else if (subId === "finSubSettleDigital") actionName = "Pencairan QRIS";

  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  if (!Array.isArray(state.financeDB.logs)) state.financeDB.logs = [];
  state.financeDB.logs.unshift({
    id: `FIN-${Date.now()}`,
    time: `${dateStr} • ${timeStr}`,
    type: actionName,
    amount,
    note,
    admin: state.currentUser ? state.currentUser.name : "Admin"
  });

  persistFinance();
  closeFinanceSubMenu();
  showScanToast(`${actionName} berhasil dicatat`);
}
