// src/members.js
import { state, persistMembers } from "./state.js";
import { showThemedAlert, showThemedConfirm, showThemedPrompt, reinforceHistoryBarrier } from "./ui.js";
import { showScanToast, debounce } from "./utils.js";
import { generateWhatsAppText } from "./printer.js";

export function initMembersModule() {
  const memberMenuView = document.getElementById("memberMenuView");
  const memberDetailView = document.getElementById("memberDetailView");
  const btnBackMemberSubMenu = document.getElementById("btnBackMemberSubMenu");
  const memberSubTitle = document.getElementById("memberSubTitle");

  const panelSubMemberList = document.getElementById("panelSubMemberList");
  const panelSubMemberDebt = document.getElementById("panelSubMemberDebt");
  const panelSubMemberOrders = document.getElementById("panelSubMemberOrders");

  function openMemberSubMenu(subId) {
    state.activeMemberSubMenuId = subId;
    panelSubMemberList.classList.add("hidden");
    panelSubMemberDebt.classList.add("hidden");
    panelSubMemberOrders.classList.add("hidden");

    let title = "Member & Pelanggan";
    if (subId === "subMemberList") {
      panelSubMemberList.classList.remove("hidden");
      title = "Daftar Member Pelanggan";
      renderMemberList();
    } else if (subId === "subMemberDebt") {
      panelSubMemberDebt.classList.remove("hidden");
      title = "Buku Kasbon & Piutang Member";
      renderMemberDebts();
    } else if (subId === "subMemberOrders") {
      panelSubMemberOrders.classList.remove("hidden");
      title = "Riwayat Belanja Member";
      renderMemberOrders();
    }

    memberSubTitle.textContent = title;
    memberMenuView.classList.add("hidden");
    memberDetailView.classList.remove("hidden");
    reinforceHistoryBarrier();
  }

  document.querySelectorAll("[data-member-sub]").forEach((card) => {
    card.onclick = () => openMemberSubMenu(card.getAttribute("data-member-sub"));
  });

  if (btnBackMemberSubMenu) {
    btnBackMemberSubMenu.onclick = () => window.history.back();
  }

  const memberSearch = document.getElementById("memberSearch");
  if (memberSearch) {
    memberSearch.addEventListener("input", debounce(() => renderMemberList(), 80));
  }

  initMemberFormEvents();
  renderAllMemberData();
}

export function closeMemberSubMenu() {
  state.activeMemberSubMenuId = null;
  document.getElementById("memberDetailView")?.classList.add("hidden");
  document.getElementById("memberMenuView")?.classList.remove("hidden");
  renderAllMemberData();
}

export function renderAllMemberData() {
  renderMemberList();
  renderMemberDebts();
  renderMemberOrders();

  const countBadge = document.getElementById("badgeTotalMemberCount");
  if (countBadge) countBadge.textContent = `${state.membersDB.length} Akun`;

  const inDebtCount = state.membersDB.filter((m) => m.debt > 0).length;
  const debtBadge = document.getElementById("badgeTotalDebtCount");
  if (debtBadge) debtBadge.textContent = `${inDebtCount} Kasbon`;

  const memberOrdersCount = state.salesTransactions.filter((t) => t.member && t.member.name).length;
  const orderBadge = document.getElementById("badgeTotalMemberOrders");
  if (orderBadge) orderBadge.textContent = `${memberOrdersCount} Transaksi`;
}

export function renderMemberList() {
  const tbody = document.getElementById("memberTableBody");
  if (!tbody) return;

  const searchInput = document.getElementById("memberSearch");
  const q = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const filtered = state.membersDB.filter(
    (m) => m.name.toLowerCase().includes(q) || m.phone.includes(q) || m.id.toLowerCase().includes(q)
  );

  const totalEl = document.getElementById("memberCountTotal");
  if (totalEl) totalEl.textContent = filtered.length;

  tbody.innerHTML = filtered.map((m) => `
    <tr>
      <td><strong>${m.name}</strong><br><small style="color:var(--text-secondary);">${m.phone}</small></td>
      <td><span class="badge-mono">${m.tier}</span></td>
      <td><strong>${m.points}</strong> Poin</td>
      <td><strong style="color: ${m.debt > 0 ? 'var(--brand-danger)' : 'var(--text-primary)'};">Rp ${m.debt.toLocaleString("id-ID")}</strong></td>
      <td style="text-align: right;">
        <button class="btn-table-action btn-edit-mbr" data-id="${m.id}">Edit</button>
        <button class="btn-table-action btn-delete btn-del-mbr" data-id="${m.id}">Hapus</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".btn-edit-mbr").forEach((btn) => {
    btn.onclick = () => {
      const mbr = state.membersDB.find((x) => x.id === btn.getAttribute("data-id"));
      if (mbr) openEditMemberModal(mbr);
    };
  });

  tbody.querySelectorAll(".btn-del-mbr").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-id");
      const confirmed = await showThemedConfirm("Hapus Member", "Apakah Anda yakin ingin menghapus member ini dari database?");
      if (confirmed) {
        state.membersDB = state.membersDB.filter((x) => x.id !== id);
        persistMembers();
        renderAllMemberData();
        showScanToast("Member berhasil dihapus");
      }
    };
  });
}

export function renderMemberDebts() {
  const tbody = document.getElementById("memberDebtTableBody");
  if (!tbody) return;

  const inDebt = state.membersDB.filter((m) => m.debt > 0);
  if (inDebt.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-secondary); padding: 18px;">Tidak ada kasbon member yang tertunda. Semua lunas!</td></tr>`;
    return;
  }

  tbody.innerHTML = inDebt.map((m) => `
    <tr>
      <td><strong>${m.name}</strong></td>
      <td>${m.phone}</td>
      <td><strong style="color:var(--brand-danger);">Rp ${m.debt.toLocaleString("id-ID")}</strong></td>
      <td><span class="badge-mono" style="background:#fee2e2; color:var(--brand-danger);">Belum Lunas</span></td>
      <td style="text-align: right;">
        <button class="btn-table-action btn-pay-debt" data-id="${m.id}">Lunasi Kasbon</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".btn-pay-debt").forEach((btn) => {
    btn.onclick = async () => {
      const mbr = state.membersDB.find((x) => x.id === btn.getAttribute("data-id"));
      if (!mbr) return;
      const payInput = await showThemedPrompt(
        "Pelunasan Kasbon",
        `Sisa piutang ${mbr.name}: Rp ${mbr.debt.toLocaleString("id-ID")}\nMasukkan nominal pelunasan:`,
        mbr.debt
      );
      const payVal = parseInt(payInput, 10);
      if (payVal > 0) {
        mbr.debt = Math.max(0, mbr.debt - payVal);
        persistMembers();
        renderAllMemberData();
        showScanToast("Pembayaran kasbon dicatat");
      }
    };
  });
}

export function renderMemberOrders() {
  const tbody = document.getElementById("memberOrdersTableBody");
  if (!tbody) return;

  const memberTrx = state.salesTransactions.filter((t) => t.member && t.member.name);
  if (memberTrx.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding: 18px;">Belum ada riwayat belanja member tercatat.</td></tr>`;
    return;
  }

  tbody.innerHTML = memberTrx.map((trx) => {
    const pts = Math.floor(trx.total / 1000);
    return `
      <tr>
        <td><strong>${trx.id}</strong></td>
        <td><strong>${trx.member.name}</strong><br><small style="color:var(--text-secondary);">${trx.member.phone || '-'}</small></td>
        <td>${trx.time}</td>
        <td><strong>Rp ${trx.total.toLocaleString("id-ID")}</strong></td>
        <td><span class="badge-mono" style="color:var(--brand-success); background:#ecfdf5;">+${pts} Poin</span></td>
        <td style="text-align: right;">
          <button class="btn-table-action btn-wa-send" data-id="${trx.id}">WA Nota</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".btn-wa-send").forEach((btn) => {
    btn.onclick = async () => {
      const trx = state.salesTransactions.find((x) => x.id === btn.getAttribute("data-id"));
      if (!trx) return;
      let targetPhone = trx.member?.phone ? trx.member.phone.replace(/^0/, "62").replace(/\D/g, "") : "";
      if (!targetPhone) {
        const inp = await showThemedPrompt("Kirim Nota WA", "Masukkan nomor WhatsApp tujuan:", "08");
        if (!inp) return;
        targetPhone = inp.replace(/^0/, "62").replace(/\D/g, "");
      }
      window.open(`https://wa.me/${targetPhone}?text=${generateWhatsAppText(trx)}`, "_blank");
    };
  });
}

function openEditMemberModal(m) {
  document.getElementById("memberFormId").value = m.id;
  document.getElementById("memberFormName").value = m.name;
  document.getElementById("memberFormPhone").value = m.phone;
  document.getElementById("memberFormTier").value = m.tier;
  document.getElementById("memberFormPoints").value = m.points;
  document.getElementById("memberModalTitle").textContent = "Edit Data Member";
  document.getElementById("addMemberModal").classList.add("open");
  reinforceHistoryBarrier();
}

function initMemberFormEvents() {
  const btnOpen = document.getElementById("btnOpenAddMemberModal");
  const btnClose = document.getElementById("btnCloseAddMemberModal");
  const form = document.getElementById("memberForm");
  const modal = document.getElementById("addMemberModal");

  if (btnOpen) {
    btnOpen.onclick = () => {
      form.reset();
      document.getElementById("memberFormId").value = "";
      document.getElementById("memberModalTitle").textContent = "Tambah Member Baru";
      modal.classList.add("open");
      reinforceHistoryBarrier();
    };
  }

  if (btnClose) btnClose.onclick = () => modal.classList.remove("open");

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = document.getElementById("memberFormId").value || `MBR-${Math.floor(100 + Math.random() * 900)}`;
      const name = document.getElementById("memberFormName").value.trim();
      const phone = document.getElementById("memberFormPhone").value.trim();
      const tier = document.getElementById("memberFormTier").value;
      const points = parseInt(document.getElementById("memberFormPoints").value, 10) || 0;

      let discount = 0;
      if (tier.includes("5%")) discount = 5;
      else if (tier.includes("10%")) discount = 10;
      else if (tier.includes("15%")) discount = 15;

      const existingIdx = state.membersDB.findIndex((x) => x.id === id);
      if (existingIdx !== -1) {
        state.membersDB[existingIdx] = { ...state.membersDB[existingIdx], name, phone, tier, discount, points };
      } else {
        state.membersDB.push({ id, name, phone, tier, discount, points, debt: 0 });
      }

      persistMembers();
      renderAllMemberData();
      modal.classList.remove("open");
      showScanToast(`Member "${name}" disimpan`);
    });
  }
}
