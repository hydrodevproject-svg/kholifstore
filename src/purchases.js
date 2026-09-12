// src/purchases.js
import { 
  state, 
  persistPurchases, 
  persistSupplierDebts, 
  persistProducts,
  persistFinance 
} from "./state.js";
import { showThemedAlert, showThemedConfirm, showThemedPrompt, reinforceHistoryBarrier } from "./ui.js";
import { showScanToast, debounce } from "./utils.js";
import { renderAllInventoryData } from "./inventory.js";
import { renderFinanceDashboard } from "./finance.js";

let tempPurchaseItems = [];
let activeSelectedProduct = null;
const MAX_PURCH_PICKER_RENDER = 40;

export function initPurchasesModule() {
  document.querySelectorAll("[data-purchase-tab]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("[data-purchase-tab]").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".purchase-tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const target = document.getElementById(btn.getAttribute("data-purchase-tab"));
      if (target) target.classList.add("active");
    };
  });

  const purchTbody = document.getElementById("purchaseTableBody");
  if (purchTbody) {
    purchTbody.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-edit-purch");
      if (!btn) return;
      const purch = state.purchasesDB.find((x) => String(x.id) === String(btn.getAttribute("data-id")));
      if (purch) openEditPurchaseModal(purch);
    });
  }

  const debtTbody = document.getElementById("supplierDebtTableBody");
  if (debtTbody) {
    debtTbody.addEventListener("click", async (e) => {
      const btn = e.target.closest(".btn-pay-supplier-debt");
      if (!btn) return;
      const debt = state.supplierDebtsDB.find((x) => String(x.id) === String(btn.getAttribute("data-id")));
      if (!debt) return;

      const currentRemaining = Number(debt.remainingDebt) || 0;
      const inputVal = await showThemedPrompt(
        "Pelunasan Hutang Supplier",
        `Sisa hutang kepada ${debt.supplier}: Rp ${currentRemaining.toLocaleString("id-ID")}\nMasukkan nominal pembayaran:`,
        currentRemaining
      );
      const paid = parseInt(inputVal, 10);
      if (paid > 0) {
        debt.remainingDebt = Math.max(0, currentRemaining - paid);
        if (debt.remainingDebt === 0) {
          state.purchasesDB.forEach((p) => {
            if (p.nota === debt.nota) p.paidStatus = "Lunas";
          });
          persistPurchases();
          renderPurchasesTable();
        }
        persistSupplierDebts();
        renderSupplierDebtsTable();

        // Potong kas laci fisik toko dan bukukan ke log keuangan
        if (!state.financeDB) state.financeDB = { cashBalance: 0, digitalBalance: 0, logs: [] };
        state.financeDB.cashBalance = Math.max(0, (Number(state.financeDB.cashBalance) || 0) - paid);
        
        const now = new Date();
        const fullDateTimeStr = `${now.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} • ${now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
        if (!Array.isArray(state.financeDB.logs)) state.financeDB.logs = [];
        state.financeDB.logs.unshift({
          id: `FIN-SUPP-DEBT-${Date.now()}`,
          time: fullDateTimeStr,
          type: "Bayar Hutang Supplier",
          amount: paid,
          note: `Pelunasan hutang supplier ${debt.supplier} (Faktur: ${debt.nota})`,
          admin: state.currentUser ? state.currentUser.name : "Admin"
        });
        persistFinance();
        renderFinanceDashboard();

        showScanToast("Pembayaran hutang dicatat & kas dipotong");
      }
    });
  }

  const itemsContainer = document.getElementById("purchItemsListContainer");
  if (itemsContainer) {
    itemsContainer.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-del-purch-item");
      if (!btn) return;
      const idx = Number(btn.getAttribute("data-idx"));
      tempPurchaseItems.splice(idx, 1);
      renderPurchaseItemsList();
      showScanToast("Barang dihapus dari faktur");
    });
  }

  const pickerOptionsList = document.getElementById("purchProductOptionsList");
  if (pickerOptionsList) {
    pickerOptionsList.addEventListener("click", (e) => {
      const card = e.target.closest(".cat-select-card");
      if (!card) return;
      const pId = card.getAttribute("data-product-id");
      const prod = state.productsDB.find((p) => p && String(p.id) === String(pId));
      if (prod) {
        selectPurchProductFromScanner(prod);
      }
    });
  }

  initAddPurchaseEvents();
  initEditPurchaseEvents();
  renderPurchasesTable();
  renderSupplierDebtsTable();
}

export function selectPurchProductFromScanner(prod) {
  activeSelectedProduct = prod;
  openPurchItemDetailModal(prod);
}

export function refreshProductPriceFromBatches(prod) {
  if (!prod.batches || prod.batches.length === 0) return;
  const activeBatch = prod.batches.find((b) => (Number(b.qty) || 0) > 0);
  if (activeBatch) {
    prod.costPrice = activeBatch.buyPrice;
    prod.price = activeBatch.sellPrice;
  }
}

export function generateAutoFaktur() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(100 + Math.random() * 900);
  return `INV/${y}${m}${d}/${rand}`;
}

export function renderPurchasesTable() {
  const tbody = document.getElementById("purchaseTableBody");
  if (!tbody) return;

  if (state.purchasesDB.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-secondary); padding: 18px;">Belum ada data faktur pembelian.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.purchasesDB.map((p) => {
    const costPrice = Number(p.costPrice || 0);
    const sellPrice = Number(p.sellPrice || 0);
    return `
      <tr>
        <td><strong>${p.nota}</strong><br><small style="color:var(--text-secondary);">${p.id}</small></td>
        <td><strong>${p.supplier}</strong></td>
        <td>${p.productName}<br><small style="color:var(--text-secondary);">${p.qty} pcs • Exp: ${p.expireDate || '-'}</small></td>
        <td>Rp ${costPrice.toLocaleString("id-ID")}</td>
        <td><strong>Rp ${sellPrice.toLocaleString("id-ID")}</strong></td>
        <td><span class="badge-mono ${p.paidStatus === 'Lunas' ? 'badge-exp-safe' : 'badge-exp-danger'}">${p.paidStatus}</span></td>
        <td style="text-align: right;">
          <button type="button" class="btn-table-action btn-edit-purch" data-id="${p.id}">Edit</button>
        </td>
      </tr>
    `;
  }).join("");
}

export function renderSupplierDebtsTable() {
  const tbody = document.getElementById("supplierDebtTableBody");
  if (!tbody) return;

  if (state.supplierDebtsDB.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding: 18px;">Tidak ada hutang dagang supplier yang tertunda.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.supplierDebtsDB.map((d) => `
    <tr>
      <td><strong>${d.supplier}</strong></td>
      <td>${d.nota}</td>
      <td><span class="badge-mono">${d.dueDate || '-'}</span></td>
      <td>Rp ${Number(d.total || 0).toLocaleString("id-ID")}</td>
      <td><strong style="color:var(--brand-danger);">Rp ${Number(d.remainingDebt || 0).toLocaleString("id-ID")}</strong></td>
      <td style="text-align: right;">
        <button type="button" class="btn-table-action btn-pay-supplier-debt" data-id="${d.id}">Bayar Hutang</button>
      </td>
    </tr>
  `).join("");
}

function initAddPurchaseEvents() {
  const purchaseScreen = document.getElementById("purchasePageScreen");
  const btnOpenAddPurchaseModal = document.getElementById("btnOpenAddPurchaseModal");
  const btnBackPurchasePage = document.getElementById("btnBackPurchasePage");
  const purchaseForm = document.getElementById("purchaseForm");
  const btnOpenPurchProductPicker = document.getElementById("btnOpenPurchProductPicker");
  const purchPaymentMethod = document.getElementById("purchPaymentMethod");
  const wrapPurchDueDate = document.getElementById("wrapPurchDueDate");
  const btnAutoNota = document.getElementById("btnAutoGenerateNota");
  const inNota = document.getElementById("purchNota");

  if (btnAutoNota && inNota) {
    btnAutoNota.onclick = () => {
      inNota.value = generateAutoFaktur();
      showScanToast("No. Faktur otomatis dibuat");
    };
  }

  if (btnOpenAddPurchaseModal) {
    btnOpenAddPurchaseModal.onclick = () => {
      purchaseForm.reset();
      tempPurchaseItems = [];
      renderPurchaseItemsList();
      if (wrapPurchDueDate) wrapPurchDueDate.classList.add("hidden");
      if (inNota) inNota.value = generateAutoFaktur();

      purchaseScreen?.classList.add("active");
      reinforceHistoryBarrier();
    };
  }

  if (btnBackPurchasePage) {
    btnBackPurchasePage.onclick = () => window.history.back();
  }

  if (btnOpenPurchProductPicker) {
    btnOpenPurchProductPicker.onclick = () => openPurchProductPicker();
  }

  if (purchPaymentMethod) {
    purchPaymentMethod.onchange = () => {
      wrapPurchDueDate.classList.toggle("hidden", purchPaymentMethod.value !== "Hutang");
    };
  }

  if (purchaseForm) {
    purchaseForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (tempPurchaseItems.length === 0) {
        await showThemedAlert("Belum Ada Barang", "Silakan tambahkan minimal satu barang masuk ke dalam faktur ini!", "error");
        return;
      }

      const nota = document.getElementById("purchNota").value.trim();
      const supplier = document.getElementById("purchSupplier").value.trim();
      const method = purchPaymentMethod.value;
      const dueDate = method === "Hutang" ? document.getElementById("purchDueDate").value : "-";

      if (method === "Hutang" && !dueDate) {
        await showThemedAlert("Jatuh Tempo Wajib", "Tentukan tanggal jatuh tempo untuk pembelian tempo hutang!", "error");
        return;
      }

      let grandTotalPurch = 0;
      const modifiedProducts = [];

      tempPurchaseItems.forEach((it, idx) => {
        const prod = state.productsDB.find((p) => String(p.id) === String(it.productId));
        if (prod) {
          if (!prod.batches) prod.batches = [];
          prod.batches.push({
            id: `BATCH-${Date.now()}-${idx}`,
            nota,
            supplier,
            buyPrice: it.costPrice,
            sellPrice: it.sellPrice,
            qty: it.qty,
            expireDate: it.expireDate
          });
          prod.stock = (Number(prod.stock) || 0) + it.qty;
          refreshProductPriceFromBatches(prod);
          modifiedProducts.push(prod);
        }

        const itemTotal = it.qty * it.costPrice;
        grandTotalPurch += itemTotal;

        state.purchasesDB.unshift({
          id: `PURCH-${Math.floor(1000 + Math.random() * 9000)}`,
          nota,
          supplier,
          productId: it.productId,
          productName: it.productName,
          qty: it.qty,
          costPrice: it.costPrice,
          sellPrice: it.sellPrice,
          expireDate: it.expireDate,
          paymentMethod: method,
          total: itemTotal,
          paidStatus: method === "Hutang" ? "Belum Lunas" : "Lunas",
          dueDate
        });
      });

      // Penanganan keuangan saat pembelian tunai
      if (method === "Tunai") {
        if (!state.financeDB) state.financeDB = { cashBalance: 0, digitalBalance: 0, logs: [] };
        const currentCash = Number(state.financeDB.cashBalance) || 0;

        if (currentCash < grandTotalPurch) {
          const proceed = await showThemedConfirm(
            "Saldo Kas Kurang",
            `Saldo kas laci (Rp ${currentCash.toLocaleString("id-ID")}) lebih kecil dari total belanja (Rp ${grandTotalPurch.toLocaleString("id-ID")}). Tetap simpan faktur dan potong kas?`,
            "Tetap Simpan",
            "Batal"
          );
          if (!proceed) return;
        }

        state.financeDB.cashBalance = Math.max(0, currentCash - grandTotalPurch);
        const now = new Date();
        const fullDateTimeStr = `${now.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} • ${now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
        if (!Array.isArray(state.financeDB.logs)) state.financeDB.logs = [];
        state.financeDB.logs.unshift({
          id: `FIN-PURCH-${Date.now()}`,
          time: fullDateTimeStr,
          type: "Belanja Kulakan (Tunai)",
          amount: grandTotalPurch,
          note: `Faktur Pembelian: ${nota} (${supplier})`,
          admin: state.currentUser ? state.currentUser.name : "Admin"
        });
        persistFinance();
        renderFinanceDashboard();
      }

      persistProducts(modifiedProducts);
      persistPurchases();

      if (method === "Hutang") {
        state.supplierDebtsDB.unshift({
          id: `DEBT-${Date.now()}`,
          nota,
          supplier,
          total: grandTotalPurch,
          remainingDebt: grandTotalPurch,
          dueDate
        });
        persistSupplierDebts();
      }

      tempPurchaseItems = [];
      window.history.back();
      renderPurchasesTable();
      renderSupplierDebtsTable();
      renderAllInventoryData();
      await showThemedAlert("Faktur Disimpan", `Berhasil memproses faktur ${nota} dengan total Rp ${grandTotalPurch.toLocaleString("id-ID")}.`);
    });
  }

  initPurchProductPickerEvents();
  initPurchItemDetailEvents();
}

function renderPurchaseItemsList() {
  const container = document.getElementById("purchItemsListContainer");
  const badgeCount = document.getElementById("badgePurchItemsCount");
  const totalQtyDisplay = document.getElementById("purchTotalQtyDisplay");
  const grandTotalDisplay = document.getElementById("purchGrandTotalDisplay");

  if (!container) return;

  if (badgeCount) badgeCount.textContent = `${tempPurchaseItems.length} Item`;

  if (tempPurchaseItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state" id="purchEmptyState" style="padding: 24px 12px;">
        <p>Belum ada barang ditambahkan</p>
        <span>Sentuh tombol <strong>+ Tambah Barang</strong> di atas untuk memasukkan barang ke faktur ini</span>
      </div>
    `;
    if (totalQtyDisplay) totalQtyDisplay.textContent = "0 pcs";
    if (grandTotalDisplay) grandTotalDisplay.textContent = "Rp 0";
    return;
  }

  let totalQty = 0;
  let grandTotal = 0;

  container.innerHTML = tempPurchaseItems.map((item, idx) => {
    const sub = item.qty * item.costPrice;
    totalQty += item.qty;
    grandTotal += sub;

    return `
      <div class="purch-item-card">
        <div class="purch-item-info">
          <strong>${item.productName}</strong>
          <span>${item.qty} pcs x Rp ${item.costPrice.toLocaleString("id-ID")} • Jual: Rp ${item.sellPrice.toLocaleString("id-ID")}</span><br>
          <small style="color:var(--text-secondary); font-size:10.5px;">Exp: ${item.expireDate || '-'}</small>
        </div>
        <div class="purch-item-right">
          <div class="purch-item-subtotal">Rp ${sub.toLocaleString("id-ID")}</div>
          <button type="button" class="btn-del-purch-item" data-idx="${idx}" title="Hapus Barang">Hapus</button>
        </div>
      </div>
    `;
  }).join("");

  if (totalQtyDisplay) totalQtyDisplay.textContent = `${totalQty} pcs`;
  if (grandTotalDisplay) grandTotalDisplay.textContent = `Rp ${grandTotal.toLocaleString("id-ID")}`;
}

function initPurchProductPickerEvents() {
  const btnBack = document.getElementById("btnBackPurchProductPicker");
  const searchInput = document.getElementById("purchProductSearchInput");

  if (btnBack) {
    btnBack.onclick = () => window.history.back();
  }

  if (searchInput) {
    searchInput.addEventListener("input", debounce((e) => {
      renderPurchProductOptions(e.target.value.toLowerCase().trim());
    }, 60));
  }
}

function openPurchProductPicker() {
  const searchInput = document.getElementById("purchProductSearchInput");
  if (searchInput) searchInput.value = "";
  renderPurchProductOptions("");
  document.getElementById("purchProductPickerScreen")?.classList.add("active");
  reinforceHistoryBarrier();
  setTimeout(() => searchInput?.focus(), 150);
}

function renderPurchProductOptions(q = "") {
  const container = document.getElementById("purchProductOptionsList");
  if (!container) return;

  const filtered = state.productsDB.filter((p) => {
    if (!p) return false;
    const name = (p.name || "").toLowerCase();
    const barcode = String(p.barcode || "").toLowerCase();
    const cat = (p.cat || "").toLowerCase();
    return !q || name.includes(q) || barcode.includes(q) || cat.includes(q);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 30px 16px;">
        <p>Barang tidak ditemukan</p>
        <span>Coba cari dengan kata kunci lain atau barcode</span>
      </div>
    `;
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.slice(0, MAX_PURCH_PICKER_RENDER).forEach((p) => {
    const card = document.createElement("div");
    card.className = "cat-select-card";
    card.setAttribute("data-product-id", p.id);
    card.innerHTML = `
      <div>
        <strong style="display:block; font-size:13.5px; color:var(--text-primary);">${p.name}</strong>
        <small style="color:var(--text-secondary); font-size:11px;">Stok: ${p.stock} pcs • HPP: Rp ${(p.costPrice || 0).toLocaleString("id-ID")}</small>
      </div>
      <div class="cat-radio-circle"></div>
    `;
    frag.appendChild(card);
  });

  container.innerHTML = "";
  container.appendChild(frag);
}

function openPurchItemDetailModal(prod) {
  const modal = document.getElementById("purchItemDetailModal");
  const nameEl = document.getElementById("modalItemProdName");
  const stockEl = document.getElementById("modalItemProdStock");
  const qtyInp = document.getElementById("modalItemQty");
  const costInp = document.getElementById("modalItemCostPrice");
  const sellInp = document.getElementById("modalItemSellPrice");
  const expInp = document.getElementById("modalItemExpireDate");

  if (nameEl) nameEl.textContent = prod.name;
  if (stockEl) stockEl.textContent = `Stok saat ini: ${prod.stock} pcs`;
  if (qtyInp) qtyInp.value = "";
  if (costInp) costInp.value = prod.costPrice || 0;
  if (sellInp) sellInp.value = prod.price || 0;
  if (expInp) expInp.value = "";

  modal?.classList.add("open");
  reinforceHistoryBarrier();
  setTimeout(() => qtyInp?.focus(), 150);
}

function initPurchItemDetailEvents() {
  const modal = document.getElementById("purchItemDetailModal");
  const btnClose = document.getElementById("btnClosePurchItemDetailModal");
  const form = document.getElementById("purchItemDetailForm");

  if (btnClose) {
    btnClose.onclick = () => modal?.classList.remove("open");
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!activeSelectedProduct) return;

      const qty = parseInt(document.getElementById("modalItemQty").value, 10) || 0;
      const costPrice = parseInt(document.getElementById("modalItemCostPrice").value, 10) || 0;
      const sellPrice = parseInt(document.getElementById("modalItemSellPrice").value, 10) || 0;
      const expireDate = document.getElementById("modalItemExpireDate").value;

      if (qty <= 0) {
        alert("Jumlah Qty masuk harus lebih dari 0!");
        return;
      }

      tempPurchaseItems.push({
        productId: activeSelectedProduct.id,
        productName: activeSelectedProduct.name,
        barcode: activeSelectedProduct.barcode,
        qty,
        costPrice,
        sellPrice,
        expireDate
      });

      modal?.classList.remove("open");
      window.history.back();
      renderPurchaseItemsList();
      showScanToast(`${activeSelectedProduct.name} (+${qty}) dimasukkan`);
      activeSelectedProduct = null;
    });
  }
}

function openEditPurchaseModal(purch) {
  state.currentEditingPurchase = purch;
  const modal = document.getElementById("editPurchaseModal");
  document.getElementById("editPurchId").value = purch.id;
  document.getElementById("editPurchProductId").value = purch.productId;
  document.getElementById("editPurchOldQty").value = purch.qty;
  document.getElementById("editPurchNota").value = purch.nota;
  document.getElementById("editPurchSupplier").value = purch.supplier;
  document.getElementById("editPurchProductName").value = purch.productName;
  document.getElementById("editPurchQty").value = purch.qty;
  document.getElementById("editPurchCostPrice").value = purch.costPrice;
  document.getElementById("editPurchSellPrice").value = purch.sellPrice;
  document.getElementById("editPurchExpireDate").value = purch.expireDate || "";
  document.getElementById("editPurchPaymentMethod").value = purch.paymentMethod;
  document.getElementById("editPurchDueDate").value = purch.dueDate !== "-" ? purch.dueDate : "";

  document.getElementById("wrapEditPurchDueDate").classList.toggle("hidden", purch.paymentMethod !== "Hutang");

  modal.classList.add("open");
  reinforceHistoryBarrier();
}

function initEditPurchaseEvents() {
  const modal = document.getElementById("editPurchaseModal");
  const btnClose = document.getElementById("btnCloseEditPurchaseModal");
  const form = document.getElementById("editPurchaseForm");
  const methodSelect = document.getElementById("editPurchPaymentMethod");

  if (btnClose) btnClose.onclick = () => modal.classList.remove("open");

  if (methodSelect) {
    methodSelect.onchange = () => {
      document.getElementById("wrapEditPurchDueDate").classList.toggle("hidden", methodSelect.value !== "Hutang");
    };
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const purchId = document.getElementById("editPurchId").value;
      const prodId = document.getElementById("editPurchProductId").value;
      const oldQty = parseInt(document.getElementById("editPurchOldQty").value, 10);
      const newQty = parseInt(document.getElementById("editPurchQty").value, 10);
      const costPrice = parseInt(document.getElementById("editPurchCostPrice").value, 10);
      const sellPrice = parseInt(document.getElementById("editPurchSellPrice").value, 10);
      const expireDate = document.getElementById("editPurchExpireDate").value;
      const paymentMethod = methodSelect.value;
      const dueDate = paymentMethod === "Hutang" ? document.getElementById("editPurchDueDate").value : "-";

      const purch = state.purchasesDB.find((p) => String(p.id) === String(purchId));
      const prod = state.productsDB.find((p) => String(p.id) === String(prodId));

      if (!purch || !prod) return;

      const diffQty = newQty - oldQty;
      const oldNota = purch.nota;
      const newNota = document.getElementById("editPurchNota").value.trim();
      const supplierName = document.getElementById("editPurchSupplier").value.trim();

      if (Array.isArray(prod.batches)) {
        const batch = prod.batches.find((b) => b.nota === oldNota);
        if (batch) {
          batch.nota = newNota;
          batch.supplier = supplierName;
          batch.qty = Math.max(0, (Number(batch.qty) || 0) + diffQty);
          batch.buyPrice = costPrice;
          batch.sellPrice = sellPrice;
          batch.expireDate = expireDate;
        }
        prod.stock = prod.batches.reduce((sum, b) => sum + (Number(b.qty) || 0), 0);
      } else {
        prod.stock = Math.max(0, (Number(prod.stock) || 0) + diffQty);
      }

      refreshProductPriceFromBatches(prod);
      persistProducts(prod);

      purch.nota = newNota;
      purch.supplier = supplierName;
      purch.qty = newQty;
      purch.costPrice = costPrice;
      purch.sellPrice = sellPrice;
      purch.expireDate = expireDate;
      purch.paymentMethod = paymentMethod;
      purch.dueDate = dueDate;
      purch.total = newQty * costPrice;
      purch.paidStatus = paymentMethod === "Hutang" ? "Belum Lunas" : "Lunas";
      persistPurchases();

      const invoiceTotal = state.purchasesDB
        .filter((p) => p.nota === newNota)
        .reduce((sum, item) => sum + Number(item.total || 0), 0);

      const debt = state.supplierDebtsDB.find((d) => d.nota === oldNota);
      if (debt) {
        if (paymentMethod === "Hutang") {
          debt.nota = newNota;
          debt.supplier = purch.supplier;
          debt.total = invoiceTotal;
          debt.remainingDebt = invoiceTotal;
          debt.dueDate = dueDate;
        } else {
          state.supplierDebtsDB = state.supplierDebtsDB.filter((d) => d.nota !== oldNota);
        }
        persistSupplierDebts();
      } else if (paymentMethod === "Hutang") {
        state.supplierDebtsDB.unshift({
          id: `DEBT-${Date.now()}`,
          nota: newNota,
          supplier: purch.supplier,
          total: invoiceTotal,
          remainingDebt: invoiceTotal,
          dueDate
        });
        persistSupplierDebts();
      }

      modal.classList.remove("open");
      renderPurchasesTable();
      renderSupplierDebtsTable();
      renderAllInventoryData();
      await showThemedAlert("Perubahan Disimpan", "Faktur pembelian berhasil diperbarui dan disinkronkan ke stok persediaan.");
    });
  }
}
