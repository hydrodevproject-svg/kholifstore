// src/reports.js
import { state, persistSales } from "./state.js";
import { showThemedAlert, showThemedConfirm, showThemedPrompt, reinforceHistoryBarrier } from "./ui.js";
import { showScanToast, debounce, normalizePhoneNumber } from "./utils.js";
import { printThermalReceipt, generateWhatsAppText } from "./printer.js";
import { renderAllMemberData } from "./members.js";

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

  // Event Delegation Terpusat untuk Tombol Edit & Hapus Transaksi
  const tbody = document.getElementById("reportsTableBody");
  if (tbody) {
    tbody.addEventListener("click", async (e) => {
      const editBtn = e.target.closest(".btn-edit-trx");
      if (editBtn) {
        const id = editBtn.getAttribute("data-id");
        const trx = state.salesTransactions.find((t) => t.id === id);
        if (trx) openEditTrxPage(trx);
        return;
      }

      const delBtn = e.target.closest(".btn-del-trx");
      if (delBtn) {
        const id = delBtn.getAttribute("data-id");
        const ok = await showThemedConfirm("Hapus Transaksi", `Yakin ingin menghapus transaksi "${id}"?`);
        if (ok) {
          state.salesTransactions = state.salesTransactions.filter((t) => t.id !== id);
          persistSales();
          renderReports();
          renderAllMemberData();
          showScanToast(`Transaksi ${id} dihapus`);
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
      const trx = state.salesTransactions.find((t) => t.id === id);
      if (!trx) return;

      trx.time = document.getElementById("editTrxTime").value.trim();
      trx.cashier = document.getElementById("editTrxCashier").value.trim();
      trx.total = parseInt(document.getElementById("editTrxTotal").value, 10) || 0;
      trx.status = document.getElementById("editTrxStatus").value;

      persistSales();
      renderReports();
      window.history.back();
      showScanToast(`Transaksi ${id} diperbarui`);
    });
  }

  renderReports();
}

export function renderReports() {
  const tbody = document.getElementById("reportsTableBody");
  if (!tbody) return;

  const searchInput = document.getElementById("reportSearch");
  const q = searchInput ? searchInput.value.toLowerCase().trim() : "";

  const filtered = state.salesTransactions.filter((trx) => {
    const memberName = trx.member ? trx.member.name.toLowerCase() : "";
    return (
      trx.id.toLowerCase().includes(q) ||
      trx.cashier.toLowerCase().includes(q) ||
      memberName.includes(q) ||
      String(trx.total).includes(q) ||
      (trx.status && trx.status.toLowerCase().includes(q))
    );
  });

  const repCountTotal = document.getElementById("repCountTotal");
  if (repCountTotal) repCountTotal.textContent = filtered.length;

  const suksesTrx = state.salesTransactions.filter((t) => t.status !== "Dibatalkan");
  const totalRev = suksesTrx.reduce((acc, t) => acc + t.total, 0);

  let totalHppSold = 0;
  const productSalesMap = {};

  suksesTrx.forEach((trx) => {
    if (trx.items && Array.isArray(trx.items)) {
      trx.items.forEach((item) => {
        const prod = state.productsDB.find((p) => p.name.trim().toLowerCase() === item.name.trim().toLowerCase());
        const costPrice = prod ? Number(prod.costPrice || 0) : 0;
        totalHppSold += costPrice * (item.qty || 1);

        productSalesMap[item.name] = (productSalesMap[item.name] || 0) + (item.qty || 1);
      });
    }
  });

  const grossProfit = Math.max(0, totalRev - totalHppSold);

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
  if (grossEl) grossEl.textContent = `Rp ${grossProfit.toLocaleString("id-ID")}`;
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
        <td><strong>Rp ${trx.total.toLocaleString("id-ID")}</strong></td>
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
      const isUrgent = item.stock <= 15;
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
            <span style="color:var(--text-secondary);">${item.qty} x Rp ${item.price.toLocaleString("id-ID")}</span>
          </div>
          <strong>Rp ${item.subtotal.toLocaleString("id-ID")}</strong>
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
