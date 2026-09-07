// src/reports.js
import { state, persistSales } from "./state.js";
import { showThemedAlert, showThemedConfirm, showThemedPrompt, reinforceHistoryBarrier } from "./ui.js";
import { showScanToast, debounce } from "./utils.js";
import { printThermalReceipt, generateWhatsAppText } from "./printer.js";
import { renderAllMemberData } from "./members.js";

export function initReportsModule() {
  const reportSearch = document.getElementById("reportSearch");
  if (reportSearch) {
    reportSearch.addEventListener("input", debounce(() => renderReports(), 80));
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
      let target = state.currentEditingTrx.member?.phone ? state.currentEditingTrx.member.phone.replace(/^0/, "62").replace(/\D/g, "") : "";
      if (!target) {
        const inp = await showThemedPrompt("Kirim Nota WA", "Masukkan nomor WhatsApp tujuan:", "08");
        if (!inp) return;
        target = inp.replace(/^0/, "62").replace(/\D/g, "");
      }
      window.open(`https://wa.me/${target}?text=${generateWhatsAppText(state.currentEditingTrx)}`, "_blank");
    };
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

  const revEl = document.getElementById("statTotalRevenue");
  const countEl = document.getElementById("statTotalTransactions");
  const bestEl = document.getElementById("statBestSeller");

  if (revEl) revEl.textContent = `Rp ${totalRev.toLocaleString("id-ID")}`;
  if (countEl) countEl.textContent = suksesTrx.length;
  if (bestEl) bestEl.textContent = state.productsDB[0]?.name ? state.productsDB[0].name.substring(0, 18) + "..." : "-";

  const canModify = state.currentUser && (state.currentUser.role === "admin" || state.currentUser.role === "master_it");

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding:16px;">Tidak ada riwayat transaksi penjualan.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((trx) => {
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
            <button class="btn-table-action btn-edit-trx" data-id="${trx.id}">Edit</button>
            <button class="btn-table-action btn-delete btn-del-trx" data-id="${trx.id}">Hapus</button>
          ` : `<span class="badge-mono">Lihat</span>`}
        </td>
      </tr>
    `;
  }).join("");

  if (canModify) {
    tbody.querySelectorAll(".btn-edit-trx").forEach((btn) => {
      btn.onclick = () => {
        const trx = state.salesTransactions.find((t) => t.id === btn.getAttribute("data-id"));
        if (trx) openEditTrxPage(trx);
      };
    });
    tbody.querySelectorAll(".btn-del-trx").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-id");
        const ok = await showThemedConfirm("Hapus Transaksi", `Yakin ingin menghapus transaksi "${id}"?`);
        if (ok) {
          state.salesTransactions = state.salesTransactions.filter((t) => t.id !== id);
          persistSales();
          renderReports();
          renderAllMemberData();
          showScanToast(`Transaksi ${id} dihapus`);
        }
      };
    });
  }
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
