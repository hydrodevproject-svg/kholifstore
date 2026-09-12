// src/reports.js
import { 
  state, 
  persistSales, 
  deleteSaleDoc, 
  persistProducts, 
  persistFinance, 
  persistMembers 
} from "./state.js";
import { showThemedAlert, showThemedConfirm, showThemedPrompt, reinforceHistoryBarrier } from "./ui.js";
import { showScanToast, debounce, normalizePhoneNumber } from "./utils.js";
import { printThermalReceipt, generateWhatsAppText } from "./printer.js";
import { renderAllMemberData } from "./members.js";
import { renderProducts, deductProductStockFIFO } from "./pos.js";
import { renderAllInventoryData } from "./inventory.js";
import { renderFinanceDashboard } from "./finance.js";

let reportsCurrentPage = 1;
const REPORTS_PAGE_SIZE = 20;

export function initReportsModule() {
  const reportSearch = document.getElementById("reportSearch");
  if (reportSearch) {
    reportSearch.addEventListener("input", debounce(() => {
      reportsCurrentPage = 1;
      renderReports();
    }, 80));
  }

  const tbody = document.getElementById("reportsTableBody");
  if (tbody) {
    tbody.addEventListener("click", async (e) => {
      const editBtn = e.target.closest(".btn-edit-trx");
      if (editBtn) {
        const id = editBtn.getAttribute("data-id");
        const trx = state.salesTransactions.find((t) => String(t.id) === String(id));
        if (trx) openEditTrxPage(trx);
        return;
      }

      const delBtn = e.target.closest(".btn-del-trx");
      if (delBtn) {
        const id = delBtn.getAttribute("data-id");
        const trx = state.salesTransactions.find((t) => String(t.id) === String(id));
        if (!trx) return;

        const ok = await showThemedConfirm(
          "Hapus Transaksi",
          `Yakin ingin menghapus transaksi "${id}"? Stok barang dan kas akan dikembalikan jika transaksi berstatus Sukses.`
        );
        if (ok) {
          if (trx.status !== "Dibatalkan") {
            restoreTransactionStock(trx);
            revertFinanceAndMember(trx, "Penghapusan Transaksi");
          }
          state.salesTransactions = state.salesTransactions.filter((t) => String(t.id) !== String(id));
          deleteSaleDoc(id);
          persistSales();
          renderReports();
          renderAllMemberData();
          showScanToast(`Transaksi ${id} dihapus & stok dikembalikan`);
        }
      }
    });
  }

  const btnBackEditTrxPage = document.getElementById("btnBackEditTrxPage");
  if (btnBackEditTrxPage) {
    btnBackEditTrxPage.onclick = () => window.history.back();
  }

  const btnReprintTrxEdit = document.getElementById("btnReprintTrxEdit");
  if (btnReprintTrxEdit) {
    btnReprintTrxEdit.onclick = () => {
      if (state.currentEditingTrx) printThermalReceipt(state.currentEditingTrx);
    };
  }

  const btnSendWaTrxEdit = document.getElementById("btnSendWaTrxEdit");
  if (btnSendWaTrxEdit) {
    btnSendWaTrxEdit.onclick = async () => {
      if (!state.currentEditingTrx) return;
      let target = normalizePhoneNumber(state.currentEditingTrx.member?.phone || state.currentEditingTrx.member?.wa || "");
      if (!target || target.length < 9) {
        const inp = await showThemedPrompt("Kirim Nota WA", "Masukkan nomor WhatsApp tujuan:", "08");
        if (!inp) return;
        target = normalizePhoneNumber(inp);
      }
      if (target && target.length >= 9) {
        window.open(`https://wa.me/${target}?text=${generateWhatsAppText(state.currentEditingTrx)}`, "_blank");
      }
    };
  }

  const cardBestSellerClickable = document.getElementById("cardBestSellerClickable");
  if (cardBestSellerClickable) {
    cardBestSellerClickable.onclick = () => openFastMovingPage();
  }

  const btnBackFast = document.getElementById("btnBackFastMovingPage");
  if (btnBackFast) {
    btnBackFast.onclick = () => window.history.back();
  }

  const editTrxForm = document.getElementById("editTrxForm");
  if (editTrxForm) {
    editTrxForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = document.getElementById("editTrxId").value;
      const trx = state.salesTransactions.find((t) => String(t.id) === String(id));
      if (!trx) return;

      const oldStatus = trx.status || "Sukses";
      const newStatus = document.getElementById("editTrxStatus").value;

      trx.time = document.getElementById("editTrxTime").value.trim();
      trx.cashier = document.getElementById("editTrxCashier").value.trim();
      trx.total = parseInt(document.getElementById("editTrxTotal").value, 10) || 0;
      trx.status = newStatus;

      if (oldStatus !== "Dibatalkan" && newStatus === "Dibatalkan") {
        restoreTransactionStock(trx);
        revertFinanceAndMember(trx, "Pembatalan Transaksi");
        showScanToast(`Transaksi ${id} dibatalkan & stok dikembalikan`);
      } else if (oldStatus === "Dibatalkan" && newStatus === "Sukses") {
        reDeductTransactionStock(trx);
        reApplyFinanceAndMember(trx);
        showScanToast(`Transaksi ${id} diaktifkan kembali & stok dipotong`);
      } else {
        showScanToast(`Transaksi ${id} diperbarui`);
      }

      persistSales(trx);
      renderReports();
      window.history.back();
    });
  }

  renderReports();
}

function restoreTransactionStock(trx) {
  if (!trx || !Array.isArray(trx.items)) return;

  const modifiedProducts = [];

  trx.items.forEach((item) => {
    const prod = state.productsDB.find(
      (p) => (item.id !== undefined && String(p.id) === String(item.id)) || 
             (p.name && p.name.trim().toLowerCase() === String(item.name || "").trim().toLowerCase())
    );
    if (prod) {
      prod.stock = (Number(prod.stock) || 0) + (Number(item.qty) || 0);

      const restoreCost = Number(item.costPrice) || Number(prod.costPrice) || 0;
      const restorePrice = Number(item.price) || Number(prod.price) || 0;

      if (Array.isArray(prod.batches) && prod.batches.length > 0) {
        const lastBatch = prod.batches[prod.batches.length - 1];
        lastBatch.qty = (Number(lastBatch.qty) || 0) + (Number(item.qty) || 0);
      } else {
        prod.batches = [{
          id: `BATCH-RESTORE-${Date.now()}`,
          nota: "BATAL-TRX",
          buyPrice: restoreCost,
          sellPrice: restorePrice,
          qty: Number(item.qty) || 0,
          expireDate: ""
        }];
      }
      modifiedProducts.push(prod);
    }
  });

  persistProducts(modifiedProducts);
  renderProducts();
  renderAllInventoryData();
}

function reDeductTransactionStock(trx) {
  if (!trx || !Array.isArray(trx.items)) return;

  const modifiedProducts = [];

  trx.items.forEach((item) => {
    const prod = state.productsDB.find(
      (p) => (item.id !== undefined && String(p.id) === String(item.id)) || 
             (p.name && p.name.trim().toLowerCase() === String(item.name || "").trim().toLowerCase())
    );
    if (prod) {
      deductProductStockFIFO(prod, item.qty || 1);
      modifiedProducts.push(prod);
    }
  });

  persistProducts(modifiedProducts);
  renderProducts();
  renderAllInventoryData();
}

function revertFinanceAndMember(trx, reason = "Pembatalan") {
  const totalAmt = Number(trx.total) || 0;
  const now = new Date();
  const timeStr = `${now.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} • ${now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;

  if (!state.financeDB) state.financeDB = { cashBalance: 0, digitalBalance: 0, logs: [] };
  if (!Array.isArray(state.financeDB.logs)) state.financeDB.logs = [];

  if (trx.paymentMethod === "Tunai") {
    state.financeDB.cashBalance = Math.max(0, (Number(state.financeDB.cashBalance) || 0) - totalAmt);
    state.financeDB.logs.unshift({
      id: `FIN-REV-${Date.now()}`,
      time: timeStr,
      type: `${reason} (Tunai)`,
      amount: totalAmt,
      note: `${reason} Struk: ${trx.id}`,
      admin: state.currentUser ? state.currentUser.name : "Admin"
    });
    persistFinance();
    renderFinanceDashboard();
  } else if (trx.paymentMethod === "Transfer / QRIS") {
    state.financeDB.digitalBalance = Math.max(0, (Number(state.financeDB.digitalBalance) || 0) - totalAmt);
    state.financeDB.logs.unshift({
      id: `FIN-REV-${Date.now()}`,
      time: timeStr,
      type: `${reason} (QRIS)`,
      amount: totalAmt,
      note: `${reason} Struk: ${trx.id}`,
      admin: state.currentUser ? state.currentUser.name : "Admin"
    });
    persistFinance();
    renderFinanceDashboard();
  } else if (trx.paymentMethod === "Piutang / Kasbon" && trx.member?.id) {
    const mbr = state.membersDB.find((m) => String(m.id) === String(trx.member.id));
    if (mbr) {
      mbr.debt = Math.max(0, (Number(mbr.debt) || 0) - totalAmt);
      persistMembers();
    }
  }

  if (trx.member?.id) {
    const mbr = state.membersDB.find((m) => String(m.id) === String(trx.member.id));
    if (mbr) {
      const earnedPts = Math.floor(totalAmt / 1000);
      mbr.points = Math.max(0, (Number(mbr.points) || 0) - earnedPts);
      persistMembers();
      renderAllMemberData();
    }
  }
}

function reApplyFinanceAndMember(trx) {
  const totalAmt = Number(trx.total) || 0;
  const now = new Date();
  const timeStr = `${now.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} • ${now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;

  if (!state.financeDB) state.financeDB = { cashBalance: 0, digitalBalance: 0, logs: [] };
  if (!Array.isArray(state.financeDB.logs)) state.financeDB.logs = [];

  if (trx.paymentMethod === "Tunai") {
    state.financeDB.cashBalance = (Number(state.financeDB.cashBalance) || 0) + totalAmt;
    state.financeDB.logs.unshift({
      id: `FIN-${Date.now()}`,
      time: timeStr,
      type: "Aktivasi Ulang (Tunai)",
      amount: totalAmt,
      note: `Re-aktivasi Struk: ${trx.id}`,
      admin: state.currentUser ? state.currentUser.name : "Admin"
    });
    persistFinance();
    renderFinanceDashboard();
  } else if (trx.paymentMethod === "Transfer / QRIS") {
    state.financeDB.digitalBalance = (Number(state.financeDB.digitalBalance) || 0) + totalAmt;
    state.financeDB.logs.unshift({
      id: `FIN-${Date.now()}`,
      time: timeStr,
      type: "Aktivasi Ulang (QRIS)",
      amount: totalAmt,
      note: `Re-aktivasi Struk: ${trx.id}`,
      admin: state.currentUser ? state.currentUser.name : "Admin"
    });
    persistFinance();
    renderFinanceDashboard();
  } else if (trx.paymentMethod === "Piutang / Kasbon" && trx.member?.id) {
    const mbr = state.membersDB.find((m) => String(m.id) === String(trx.member.id));
    if (mbr) {
      mbr.debt = (Number(mbr.debt) || 0) + totalAmt;
      persistMembers();
    }
  }

  if (trx.member?.id) {
    const mbr = state.membersDB.find((m) => String(m.id) === String(trx.member.id));
    if (mbr) {
      const earnedPts = Math.floor(totalAmt / 1000);
      mbr.points = (Number(mbr.points) || 0) + earnedPts;
      persistMembers();
      renderAllMemberData();
    }
  }
}

export function renderReports() {
  const tbody = document.getElementById("reportsTableBody");
  if (!tbody) return;

  const searchInput = document.getElementById("reportSearch");
  const q = searchInput ? searchInput.value.toLowerCase().trim() : "";

  const filtered = state.salesTransactions.filter((trx) => {
    const memberName = trx.member ? trx.member.name.toLowerCase() : "";
    return (
      String(trx.id).toLowerCase().includes(q) ||
      String(trx.cashier || "").toLowerCase().includes(q) ||
      memberName.includes(q) ||
      String(trx.total).includes(q) ||
      (trx.status && trx.status.toLowerCase().includes(q))
    );
  });

  const repCountTotal = document.getElementById("repCountTotal");
  if (repCountTotal) repCountTotal.textContent = filtered.length;

  const suksesTrx = state.salesTransactions.filter((t) => t.status !== "Dibatalkan");
  const totalRev = suksesTrx.reduce((acc, t) => acc + Number(t.total || 0), 0);

  let totalHppSold = 0;
  const productSalesMap = {};

  suksesTrx.forEach((trx) => {
    if (trx.items && Array.isArray(trx.items)) {
      trx.items.forEach((item) => {
        const qty = Number(item.qty || 1);

        let itemCost = 0;
        if (item.totalCost !== undefined) {
          itemCost = Number(item.totalCost);
        } else if (item.costPrice !== undefined) {
          itemCost = Number(item.costPrice) * qty;
        } else {
          const prod = state.productsDB.find((p) => p.name.trim().toLowerCase() === String(item.name || "").trim().toLowerCase());
          itemCost = (prod ? Number(prod.costPrice || 0) : 0) * qty;
        }

        totalHppSold += itemCost;
        productSalesMap[item.name] = (productSalesMap[item.name] || 0) + qty;
      });
    }
  });

  // Perhitungan laba kotor riil tanpa manipulasi batas minimum Rp 0
  const grossProfit = totalRev - totalHppSold;

  const totalOperationalExpense = (state.financeDB?.logs || [])
    .filter((l) => l.type === "Biaya Operasional")
    .reduce((acc, l) => acc + Number(l.amount || 0), 0);

  const netProfit = grossProfit - totalOperationalExpense;

  let bestItemName = "-";
  let maxQty = 0;
  Object.keys(productSalesMap).forEach((name) => {
    if (productSalesMap[name] > maxQty) {
      maxQty = productSalesMap[name];
      bestItemName = name;
    }
  });

  const revEl = document.getElementById("statTotalRevenue");
  const grossEl = document.getElementById("statGrossProfit");
  const netEl = document.getElementById("statNetProfit");
  const bestEl = document.getElementById("statBestSeller");

  if (revEl) revEl.textContent = `Rp ${totalRev.toLocaleString("id-ID")}`;
  if (grossEl) {
    grossEl.textContent = `${grossProfit < 0 ? '-' : ''}Rp ${Math.abs(grossProfit).toLocaleString("id-ID")}`;
    grossEl.style.color = grossProfit >= 0 ? "var(--brand-accent)" : "var(--brand-danger)";
  }
  if (netEl) {
    netEl.textContent = `${netProfit < 0 ? '-' : ''}Rp ${Math.abs(netProfit).toLocaleString("id-ID")}`;
    netEl.style.color = netProfit >= 0 ? "#16a34a" : "var(--brand-danger)";
  }
  if (bestEl) bestEl.textContent = bestItemName !== "-" ? `${bestItemName} (${maxQty}x)` : "-";

  const totalItems = filtered.length;
  let paginationContainer = document.getElementById("reportsPagination");
  if (!paginationContainer) {
    paginationContainer = document.createElement("div");
    paginationContainer.id = "reportsPagination";
    tbody.closest(".threads-card")?.appendChild(paginationContainer);
  }

  if (totalItems === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding:16px;">Tidak ada riwayat transaksi penjualan.</td></tr>`;
    if (paginationContainer) paginationContainer.innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(totalItems / REPORTS_PAGE_SIZE) || 1;
  if (reportsCurrentPage > totalPages) reportsCurrentPage = totalPages;
  if (reportsCurrentPage < 1) reportsCurrentPage = 1;

  const startIndex = (reportsCurrentPage - 1) * REPORTS_PAGE_SIZE;
  const pageItems = filtered.slice(startIndex, startIndex + REPORTS_PAGE_SIZE);

  const canModify = state.currentUser && (state.currentUser.role === "admin" || state.currentUser.role === "master_it");

  tbody.innerHTML = pageItems.map((trx) => {
    const statusVal = trx.status || "Sukses";
    const statusClass = statusVal === "Dibatalkan" ? "badge-status-dibatalkan" : "badge-status-sukses";
    return `
      <tr>
        <td><strong>${trx.id}</strong></td>
        <td>${trx.time}</td>
        <td>
          <strong>${trx.cashier}</strong><br>
          <small style="color:var(--text-secondary);">${trx.member ? `👤 ${trx.member.name}` : "Non-Member"}</small>
        </td>
        <td><strong>Rp ${Number(trx.total || 0).toLocaleString("id-ID")}</strong></td>
        <td><span class="badge-mono ${statusClass}">${statusVal}</span></td>
        <td style="text-align: right;">
          ${canModify ? `
            <button type="button" class="btn-table-action btn-edit-trx" data-id="${trx.id}">Edit</button>
            <button type="button" class="btn-table-action btn-delete btn-del-trx" data-id="${trx.id}">Hapus</button>
          ` : `<span class="badge-mono">Lihat</span>`}
        </td>
      </tr>
    `;
  }).join("");

  if (paginationContainer) {
    const startNum = startIndex + 1;
    const endNum = Math.min(startIndex + REPORTS_PAGE_SIZE, totalItems);

    paginationContainer.innerHTML = `
      <div class="pagination-bar">
        <span>Menampilkan <strong>${startNum} - ${endNum}</strong> dari <strong>${totalItems}</strong> transaksi</span>
        <div class="pagination-controls">
          <button type="button" class="btn-page-nav" id="btnReportsPrev" ${reportsCurrentPage <= 1 ? "disabled" : ""}>Sebelumnya</button>
          <span style="font-weight:700; color:var(--text-primary); padding: 0 4px;">${reportsCurrentPage} / ${totalPages}</span>
          <button type="button" class="btn-page-nav" id="btnReportsNext" ${reportsCurrentPage >= totalPages ? "disabled" : ""}>Selanjutnya</button>
        </div>
      </div>
    `;

    document.getElementById("btnReportsPrev")?.addEventListener("click", () => {
      if (reportsCurrentPage > 1) {
        reportsCurrentPage--;
        renderReports();
        document.getElementById("view-reports")?.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    document.getElementById("btnReportsNext")?.addEventListener("click", () => {
      if (reportsCurrentPage < totalPages) {
        reportsCurrentPage++;
        renderReports();
        document.getElementById("view-reports")?.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }
}

function openFastMovingPage() {
  const tbody = document.getElementById("fastMovingTableBody");
  if (!tbody) return;

  const salesCountMap = {};
  state.salesTransactions.filter((t) => t.status !== "Dibatalkan").forEach((trx) => {
    (trx.items || []).forEach((it) => {
      salesCountMap[it.name] = (salesCountMap[it.name] || 0) + (it.qty || 1);
    });
  });

  const list = (state.productsDB || []).map((p) => {
    const sold = salesCountMap[p.name] || 0;
    return { ...p, soldQty: sold };
  });

  list.sort((a, b) => b.soldQty - a.soldQty);

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-secondary); padding: 14px;">Belum ada data transaksi barang.</td></tr>`;
  } else {
    tbody.innerHTML = list.slice(0, 50).map((item) => {
      const isUrgent = (Number(item.stock) || 0) <= 15;
      return `
        <tr>
          <td><strong>${item.name}</strong><br><small style="color:var(--text-secondary);">${item.cat}</small></td>
          <td><strong>${item.soldQty}</strong> pcs</td>
          <td><strong>${item.stock}</strong> pcs</td>
          <td>
            <span class="badge-mono ${isUrgent ? 'badge-status-dibatalkan' : 'badge-status-sukses'}">
              ${isUrgent ? '⚠️ Segera Restock!' : 'Aman'}
            </span>
          </td>
        </tr>
      `;
    }).join("");
  }

  document.getElementById("fastMovingPageScreen")?.classList.add("active");
  reinforceHistoryBarrier();
}

function openEditTrxPage(trx) {
  state.currentEditingTrx = trx;
  document.getElementById("editTrxId").value = trx.id;
  document.getElementById("editTrxDisplayId").value = trx.id;
  document.getElementById("editTrxTime").value = trx.time;
  document.getElementById("editTrxCashier").value = trx.cashier;
  document.getElementById("editTrxTotal").value = trx.total;
  document.getElementById("editTrxStatus").value = trx.status || "Sukses";

  const listEl = document.getElementById("editTrxItemsList");
  if (listEl) {
    listEl.innerHTML = "";
    if (trx.items && trx.items.length > 0) {
      trx.items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "trx-item-row";
        row.innerHTML = `
          <div>
            <strong>${item.name}</strong><br>
            <span style="color:var(--text-secondary);">${item.qty} x Rp ${Number(item.price || 0).toLocaleString("id-ID")}</span>
          </div>
          <strong>Rp ${Number(item.subtotal || 0).toLocaleString("id-ID")}</strong>
        `;
        listEl.appendChild(row);
      });
    } else {
      listEl.innerHTML = `<div style="text-align:center; color:var(--text-secondary); font-size:11.5px;">Rincian barang tidak tercatat.</div>`;
    }
  }

  document.getElementById("editTrxPageScreen")?.classList.add("active");
  reinforceHistoryBarrier();
}
