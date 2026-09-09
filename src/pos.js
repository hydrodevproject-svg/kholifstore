// src/pos.js
import { state, persistProducts, persistSales, persistMembers, persistFinance } from "./state.js";
import { showThemedAlert, showThemedPrompt, reinforceHistoryBarrier } from "./ui.js";
import { showScanToast, playCashChime, normalizePhoneNumber } from "./utils.js";
import { printThermalReceipt, generateWhatsAppText } from "./printer.js";
import { refreshProductPriceFromBatches } from "./purchases.js";
import { renderAllInventoryData } from "./inventory.js";
import { renderAllMemberData } from "./members.js";
import { renderReports } from "./reports.js";
import { renderFinanceDashboard } from "./finance.js";

let lastCompletedTrx = null;
const MAX_POS_PRODUCTS_RENDER = 60;

export function initPosModule() {
  initPosEvents();
  renderCategories();
  renderProducts();
  renderCart();
}

export function deductProductStockFIFO(prod, deductQty) {
  let remaining = deductQty;
  let totalCost = 0;

  if (prod.batches && Array.isArray(prod.batches) && prod.batches.length > 0) {
    for (let i = 0; i < prod.batches.length; i++) {
      const batch = prod.batches[i];
      if (batch.qty > 0) {
        const take = Math.min(batch.qty, remaining);
        const unitCost = Number(batch.buyPrice) || Number(prod.costPrice) || 0;
        totalCost += take * unitCost;
        batch.qty -= take;
        remaining -= take;
        if (remaining <= 0) break;
      }
    }
    prod.stock = prod.batches.reduce((sum, b) => sum + b.qty, 0);
    refreshProductPriceFromBatches(prod);
  } else {
    prod.stock = Math.max(0, (prod.stock || 0) - deductQty);
    totalCost = deductQty * (Number(prod.costPrice) || 0);
    remaining = 0;
  }

  if (remaining > 0) {
    totalCost += remaining * (Number(prod.costPrice) || 0);
  }

  const avgCostPrice = deductQty > 0 ? Math.round(totalCost / deductQty) : (Number(prod.costPrice) || 0);
  return { totalCost, avgCostPrice };
}

export function renderCategories() {
  const catSidebar = document.getElementById("catSidebar");
  if (!catSidebar) return;
  catSidebar.innerHTML = `<button class="cat-pill ${state.currentCategory === 'all' ? 'active' : ''}" data-cat="all">Semua</button>`;

  state.categoriesDB.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = `cat-pill ${state.currentCategory === cat ? 'active' : ''}`;
    btn.setAttribute("data-cat", cat);
    btn.textContent = cat;
    catSidebar.appendChild(btn);
  });

  catSidebar.querySelectorAll(".cat-pill").forEach((pill) => {
    pill.onclick = () => {
      catSidebar.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      state.currentCategory = pill.getAttribute("data-cat");
      renderProducts();
    };
  });
}

const MONO_ITEM_SVG = `
  <svg class="mono-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
    <line x1="12" y1="22.08" x2="12" y2="12"></line>
  </svg>
`;

export function renderProducts() {
  const productsGrid = document.getElementById("productsGrid");
  if (!productsGrid) return;

  const query = state.searchQuery.toLowerCase().trim();
  const filtered = state.productsDB.filter((p) => {
    const matchCat = state.currentCategory === "all" || p.cat === state.currentCategory;
    const matchSearch = !query ||
      p.name.toLowerCase().includes(query) ||
      (p.barcode && p.barcode.includes(query));
    return matchCat && matchSearch;
  });

  const displayList = filtered.slice(0, MAX_POS_PRODUCTS_RENDER);
  const frag = document.createDocumentFragment();

  displayList.forEach((p) => {
    const isOutOfStock = p.stock <= 0;
    const row = document.createElement("div");
    row.className = `product-list-row ${isOutOfStock ? "out-of-stock" : ""}`;
    row.setAttribute("data-product-id", p.id);

    row.innerHTML = `
      <div class="prod-row-left">
        <div class="prod-monotone-icon-sm">${MONO_ITEM_SVG}</div>
        <div class="prod-meta">
          <span class="prod-name-title">${p.name}</span>
          <div class="prod-submeta">
            <span class="prod-cat-badge">${p.cat}</span>
            <span class="prod-stock-badge ${isOutOfStock ? "empty" : ""}">
              ${isOutOfStock ? "Stok Habis" : `Sisa ${p.stock}`}
            </span>
          </div>
        </div>
      </div>
      <div class="prod-row-right">
        <span class="prod-price-text">Rp ${p.price.toLocaleString("id-ID")}</span>
        <div class="btn-add-circle">
          <svg class="mono-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
      </div>
    `;
    frag.appendChild(row);
  });

  productsGrid.innerHTML = "";
  productsGrid.appendChild(frag);
}

export function renderCart() {
  const orderList = document.getElementById("orderList");
  if (!orderList) return;
  const totalCount = state.cart.reduce((acc, cur) => acc + cur.qty, 0);

  const cartCountEl = document.getElementById("mobileCartCount");
  if (cartCountEl) cartCountEl.textContent = totalCount;

  const itemCounterEl = document.getElementById("orderItemCounter");
  if (itemCounterEl) itemCounterEl.textContent = `${totalCount} item`;

  const valSubtotal = document.getElementById("valSubtotal");
  const valTax = document.getElementById("valTax");
  const valGrandTotal = document.getElementById("valGrandTotal");
  const mobileCartTotal = document.getElementById("mobileCartTotal");
  const discountRow = document.getElementById("discountRow");
  const pointsEarnRow = document.getElementById("pointsEarnRow");

  if (state.cart.length === 0) {
    orderList.innerHTML = `
      <div class="empty-state">
        <svg class="mono-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <path d="M16 10a4 4 0 0 1-8 0"></path>
        </svg>
        <p>Keranjang belanja kosong</p>
        <span>Sentuh produk atau scan barcode untuk menambahkan</span>
      </div>
    `;
    if (valSubtotal) valSubtotal.textContent = "Rp 0";
    if (valTax) valTax.textContent = "Rp 0";
    if (valGrandTotal) valGrandTotal.textContent = "Rp 0";
    if (mobileCartTotal) mobileCartTotal.textContent = "Rp 0";
    if (discountRow) discountRow.classList.add("hidden");
    if (pointsEarnRow) pointsEarnRow.classList.add("hidden");
    return;
  }

  const frag = document.createDocumentFragment();
  let subtotal = 0;

  state.cart.forEach((item) => {
    const sub = item.price * item.qty;
    subtotal += sub;

    const row = document.createElement("div");
    row.className = "order-card-item";
    row.setAttribute("data-cart-id", item.id);
    row.innerHTML = `
      <div class="order-card-info">
        <strong>${item.name}</strong>
        <span>Rp ${item.price.toLocaleString("id-ID")}</span>
      </div>
      <div class="stepper">
        <button type="button" class="btn-minus" data-id="${item.id}">-</button>
        <span>${item.qty}</span>
        <button type="button" class="btn-plus" data-id="${item.id}">+</button>
      </div>
      <div class="order-row-subtotal">Rp ${sub.toLocaleString("id-ID")}</div>
    `;
    frag.appendChild(row);
  });

  orderList.innerHTML = "";
  orderList.appendChild(frag);

  let discountDeduction = 0;
  if (state.currentDiscountNominal > 0) {
    discountDeduction = state.currentDiscountNominal;
  } else if (state.currentAttachedMember && state.currentAttachedMember.discount > 0) {
    const rawDisc = subtotal * (state.currentAttachedMember.discount / 100);
    discountDeduction = Math.round(rawDisc / 500) * 500;
  }

  discountDeduction = Math.min(subtotal, discountDeduction);

  if (discountDeduction > 0) {
    if (discountRow) {
      discountRow.classList.remove("hidden");
      const discLabel = document.getElementById("valDiscountLabel");
      if (discLabel) discLabel.textContent = "Potongan";
      const discAmt = document.getElementById("valDiscountAmount");
      if (discAmt) discAmt.textContent = `- Rp ${discountDeduction.toLocaleString("id-ID")}`;
    }
  } else {
    if (discountRow) discountRow.classList.add("hidden");
  }

  const baseAfterDiscount = Math.max(0, subtotal - discountDeduction);
  const isPpnActive = Boolean(state.featuresConfig.feat_pajak?.enabled);
  const rawTax = isPpnActive ? Math.round(baseAfterDiscount * 0.11) : 0;
  const tax = isPpnActive ? Math.round(rawTax / 500) * 500 : 0;
  const grandTotal = baseAfterDiscount + tax;

  if (state.currentAttachedMember) {
    const earnedPoints = Math.floor(grandTotal / 1000);
    if (pointsEarnRow) {
      pointsEarnRow.classList.remove("hidden");
      const ptsEarned = document.getElementById("valPointsEarned");
      if (ptsEarned) ptsEarned.textContent = `+${earnedPoints} Poin`;
    }
  } else {
    if (pointsEarnRow) pointsEarnRow.classList.add("hidden");
  }

  const taxRow = document.getElementById("taxRow");
  if (taxRow) taxRow.classList.toggle("hidden", !isPpnActive);

  if (valSubtotal) valSubtotal.textContent = `Rp ${subtotal.toLocaleString("id-ID")}`;
  if (valTax) valTax.textContent = `Rp ${tax.toLocaleString("id-ID")}`;
  if (valGrandTotal) valGrandTotal.textContent = `Rp ${grandTotal.toLocaleString("id-ID")}`;
  if (mobileCartTotal) mobileCartTotal.textContent = `Rp ${grandTotal.toLocaleString("id-ID")}`;
}

export async function addToCart(prod, fromScanner = false) {
  const currentProd = state.productsDB.find((p) => p.id === prod.id);
  if (!currentProd || currentProd.stock <= 0) {
    if (!fromScanner) await showThemedAlert("Stok Habis", `Produk "${prod.name}" sedang habis.`, "error");
    return false;
  }

  const existing = state.cart.find((i) => i.id === prod.id);
  if (existing) {
    if (existing.qty >= currentProd.stock) {
      if (!fromScanner) await showThemedAlert("Batas Stok", `Sisa stok hanya tersisa ${currentProd.stock} pcs.`, "info");
      return false;
    }
    existing.qty++;
  } else {
    state.cart.push({ ...prod, qty: 1 });
  }

  renderCart();
  return true;
}

export async function updateQty(id, delta) {
  const item = state.cart.find((i) => i.id === id);
  if (!item) return;

  const currentProd = state.productsDB.find((p) => p.id === id);
  if (delta > 0 && currentProd && item.qty + delta > currentProd.stock) {
    await showThemedAlert("Batas Maksimal", `Sisa stok hanya tersisa ${currentProd.stock} pcs.`, "info");
    return;
  }

  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter((i) => i.id !== id);
    if (state.cart.length === 0) {
      state.currentDiscountNominal = 0;
    }
  }
  renderCart();
}

export function attachMember(member) {
  state.currentAttachedMember = member;
  const posMemberName = document.getElementById("posMemberName");
  const posMemberMeta = document.getElementById("posMemberMeta");
  const btnClearMemberPos = document.getElementById("btnClearMemberPos");

  const phoneDisplay = member.phone || member.wa || "";
  if (posMemberName) posMemberName.textContent = `${member.name} (${phoneDisplay})`;
  if (posMemberMeta) posMemberMeta.textContent = `${member.tier} • ${member.points} Poin`;
  if (btnClearMemberPos) btnClearMemberPos.classList.remove("hidden");

  renderCart();
  showScanToast(`Member "${member.name}" terpasang`);
}

function initPosEvents() {
  const productsGrid = document.getElementById("productsGrid");
  if (productsGrid) {
    productsGrid.addEventListener("click", (e) => {
      const row = e.target.closest(".product-list-row");
      if (!row || row.classList.contains("out-of-stock")) return;
      const pId = Number(row.getAttribute("data-product-id"));
      const prod = state.productsDB.find((p) => p.id === pId);
      if (prod) addToCart(prod);
    });
  }

  const orderList = document.getElementById("orderList");
  if (orderList) {
    orderList.addEventListener("click", (e) => {
      const minusBtn = e.target.closest(".btn-minus");
      if (minusBtn) {
        updateQty(Number(minusBtn.getAttribute("data-id")), -1);
        return;
      }
      const plusBtn = e.target.closest(".btn-plus");
      if (plusBtn) {
        updateQty(Number(plusBtn.getAttribute("data-id")), 1);
      }
    });
  }

  const btnBayar = document.getElementById("btnBayar");
  if (btnBayar) {
    btnBayar.onclick = async () => {
      if (state.cart.length === 0) {
        await showThemedAlert("Keranjang Kosong", "Pilih produk belanja terlebih dahulu sebelum bayar.", "info");
        return;
      }
      const payFormView = document.getElementById("payFormView");
      const paySuccessView = document.getElementById("paySuccessView");
      const payTotalBig = document.getElementById("payTotalBig");
      const valGrandTotal = document.getElementById("valGrandTotal");
      const inputPaid = document.getElementById("inputPaid");
      const valChange = document.getElementById("valChange");
      const payPageScreen = document.getElementById("payPageScreen");

      if (payFormView) payFormView.classList.remove("hidden");
      if (paySuccessView) paySuccessView.classList.add("hidden");
      if (payTotalBig && valGrandTotal) payTotalBig.textContent = valGrandTotal.textContent;
      if (inputPaid) inputPaid.value = "";
      if (valChange) {
        valChange.textContent = "Rp 0";
        valChange.style.color = "var(--text-primary)";
      }

      if (payPageScreen) {
        payPageScreen.classList.add("active");
        reinforceHistoryBarrier();
      }
      if (inputPaid) setTimeout(() => inputPaid.focus(), 150);
    };
  }

  const btnBackPayPage = document.getElementById("btnBackPayPage");
  if (btnBackPayPage) {
    btnBackPayPage.onclick = () => window.history.back();
  }

  const payMethodSelect = document.getElementById("payMethodSelect");
  if (payMethodSelect) {
    payMethodSelect.onchange = () => {
      const valGrandTotal = document.getElementById("valGrandTotal");
      const inputPaid = document.getElementById("inputPaid");
      const valChange = document.getElementById("valChange");
      const totalStr = valGrandTotal ? valGrandTotal.textContent : "Rp 0";

      if (payMethodSelect.value === "Transfer / QRIS") {
        if (inputPaid) inputPaid.value = totalStr;
        if (valChange) {
          valChange.textContent = "Rp 0";
          valChange.style.color = "var(--text-primary)";
        }
      } else if (payMethodSelect.value === "Piutang / Kasbon") {
        if (inputPaid) inputPaid.value = "Kasbon (Tempo)";
        if (valChange) {
          valChange.textContent = "Rp 0";
          valChange.style.color = "var(--text-primary)";
        }
      } else {
        if (inputPaid) inputPaid.value = "";
        if (valChange) {
          valChange.textContent = "Rp 0";
          valChange.style.color = "var(--text-primary)";
        }
      }
    };
  }

  const inputPaid = document.getElementById("inputPaid");
  if (inputPaid) {
    inputPaid.addEventListener("input", (e) => {
      const raw = e.target.value.replace(/\D/g, "");
      const valChange = document.getElementById("valChange");
      const valGrandTotal = document.getElementById("valGrandTotal");

      if (!raw) {
        e.target.value = "";
        if (valChange) {
          valChange.textContent = "Rp 0";
          valChange.style.color = "var(--text-primary)";
        }
        return;
      }
      const paid = parseInt(raw, 10);
      e.target.value = "Rp " + paid.toLocaleString("id-ID");
      const grandTotal = parseInt(valGrandTotal ? valGrandTotal.textContent.replace(/\D/g, "") : "0", 10) || 0;
      const change = paid - grandTotal;
      if (valChange) {
        if (change >= 0) {
          valChange.textContent = "Rp " + change.toLocaleString("id-ID");
          valChange.style.color = "var(--text-primary)";
        } else {
          valChange.textContent = "Kurang Rp " + Math.abs(change).toLocaleString("id-ID");
          valChange.style.color = "var(--brand-danger)";
        }
      }
    });
  }

  const btnFinishTransaction = document.getElementById("btnFinishTransaction");
  if (btnFinishTransaction) {
    btnFinishTransaction.onclick = async () => {
      const payMethod = document.getElementById("payMethodSelect");
      const inputPaidEl = document.getElementById("inputPaid");
      const paymentMethod = payMethod ? payMethod.value : "Tunai";

      const subtotalNum = state.cart.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty)), 0);

      let appliedDiscount = state.currentDiscountNominal;
      if (appliedDiscount === 0 && state.currentAttachedMember && state.currentAttachedMember.discount > 0) {
        appliedDiscount = Math.round((subtotalNum * (state.currentAttachedMember.discount / 100)) / 500) * 500;
      }
      appliedDiscount = Math.min(subtotalNum, appliedDiscount);

      const baseAfterDiscount = Math.max(0, subtotalNum - appliedDiscount);
      const isPpnActive = Boolean(state.featuresConfig.feat_pajak?.enabled);
      const rawTax = isPpnActive ? Math.round(baseAfterDiscount * 0.11) : 0;
      const taxNum = isPpnActive ? Math.round(rawTax / 500) * 500 : 0;
      const grandTotalNum = baseAfterDiscount + taxNum;

      const rawPaid = inputPaidEl ? parseInt(inputPaidEl.value.replace(/\D/g, ""), 10) || 0 : 0;

      if (paymentMethod === "Piutang / Kasbon") {
        if (!state.currentAttachedMember) {
          await showThemedAlert("Pilih Member", "Pembayaran Kasbon hanya diperbolehkan jika data Member dipilih!", "error");
          return;
        }
        const mbr = state.membersDB.find((x) => x.id === state.currentAttachedMember.id);
        if (mbr) {
          mbr.debt = (Number(mbr.debt) || 0) + grandTotalNum;
          persistMembers();
        }
      } else if (paymentMethod === "Transfer / QRIS") {
        const paidAmount = rawPaid > 0 ? rawPaid : grandTotalNum;
        if (paidAmount < grandTotalNum) {
          await showThemedAlert("Nominal Kurang", "Nominal pembayaran QRIS belum mencukupi total tagihan belanja!", "error");
          return;
        }
      } else if (rawPaid < grandTotalNum) {
        await showThemedAlert("Nominal Kurang", "Uang yang diterima kasir belum mencukupi total tagihan belanja!", "error");
        return;
      }

      const snapshotItems = [];
      state.cart.forEach((cartItem) => {
        const prod = state.productsDB.find((p) => p.id === cartItem.id);
        let itemCostData = { 
          totalCost: (Number(cartItem.costPrice) || 0) * cartItem.qty, 
          avgCostPrice: Number(cartItem.costPrice) || 0 
        };

        if (prod) {
          itemCostData = deductProductStockFIFO(prod, cartItem.qty);
        }

        snapshotItems.push({
          id: cartItem.id,
          name: cartItem.name,
          barcode: cartItem.barcode || "",
          cat: cartItem.cat || "",
          qty: cartItem.qty,
          price: cartItem.price,
          costPrice: itemCostData.avgCostPrice,
          totalCost: itemCostData.totalCost,
          subtotal: cartItem.price * cartItem.qty
        });
      });
      persistProducts();

      if (state.currentAttachedMember) {
        const earned = Math.floor(grandTotalNum / 1000);
        const mbr = state.membersDB.find((x) => x.id === state.currentAttachedMember.id);
        if (mbr) {
          mbr.points = (Number(mbr.points) || 0) + earned;
          persistMembers();
        }
      }

      const now = new Date();
      const dayName = now.toLocaleDateString("id-ID", { weekday: "long" });
      const dateFormatted = now.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
      const clockFormatted = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      const fullDateTimeStr = `${dayName}, ${dateFormatted} • ${clockFormatted}`;
      const trxId = `TRX-${Math.floor(1000 + Math.random() * 9000)}`;
      const actualPaid = paymentMethod === "Transfer / QRIS" && rawPaid === 0 ? grandTotalNum : rawPaid;
      const changeNum = Math.max(0, actualPaid - grandTotalNum);

      const attachedMemberClone = state.currentAttachedMember ? {
        id: state.currentAttachedMember.id,
        name: state.currentAttachedMember.name,
        phone: state.currentAttachedMember.phone || state.currentAttachedMember.wa || state.currentAttachedMember.telepon || "",
        tier: state.currentAttachedMember.tier || ""
      } : null;

      const newTrx = {
        id: trxId,
        timestamp: Date.now(),
        date: `${dayName}, ${dateFormatted}`,
        time: fullDateTimeStr,
        cashier: state.currentUser ? state.currentUser.name : "Kasir",
        member: attachedMemberClone,
        total: grandTotalNum,
        discount: appliedDiscount,
        paymentMethod,
        items: snapshotItems,
        status: "Sukses"
      };

      lastCompletedTrx = newTrx;

      state.salesTransactions.unshift(newTrx);
      persistSales(newTrx);

      if (!state.financeDB) {
        state.financeDB = { cashBalance: 0, digitalBalance: 0, logs: [] };
      }
      if (state.financeDB.digitalBalance === undefined) {
        state.financeDB.digitalBalance = 0;
      }
      if (state.financeDB.cashBalance === undefined) {
        state.financeDB.cashBalance = 0;
      }
      if (!Array.isArray(state.financeDB.logs)) {
        state.financeDB.logs = [];
      }

      if (paymentMethod === "Tunai") {
        state.financeDB.cashBalance = (state.financeDB.cashBalance || 0) + grandTotalNum;
        state.financeDB.logs.unshift({
          id: `FIN-${Date.now()}`,
          time: fullDateTimeStr,
          type: "Penjualan Kasir (Tunai)",
          amount: grandTotalNum,
          note: `Penerimaan Kasir Tunai: ${trxId}`,
          admin: state.currentUser ? state.currentUser.name : "Kasir"
        });
        persistFinance();
        renderFinanceDashboard();
      } else if (paymentMethod === "Transfer / QRIS") {
        state.financeDB.digitalBalance = (state.financeDB.digitalBalance || 0) + grandTotalNum;
        state.financeDB.logs.unshift({
          id: `FIN-${Date.now()}`,
          time: fullDateTimeStr,
          type: "Penjualan Kasir (QRIS)",
          amount: grandTotalNum,
          note: `Penerimaan Non-Tunai Bank/QRIS: ${trxId}`,
          admin: state.currentUser ? state.currentUser.name : "Kasir"
        });
        persistFinance();
        renderFinanceDashboard();
      }

      const succTrxInfo = document.getElementById("succTrxInfo");
      const succCashierMember = document.getElementById("succCashierMember");
      const succTotal = document.getElementById("succTotal");
      const succPaid = document.getElementById("succPaid");
      const succChange = document.getElementById("succChange");

      if (succTrxInfo) succTrxInfo.textContent = `${trxId} • ${fullDateTimeStr}`;
      if (succCashierMember) succCashierMember.textContent = `${newTrx.cashier} ${newTrx.member ? `• ${newTrx.member.name}` : ""}`;
      if (succTotal) succTotal.textContent = `Rp ${grandTotalNum.toLocaleString("id-ID")}`;
      if (succPaid) succPaid.textContent = paymentMethod === "Piutang / Kasbon" ? "Kasbon (Tempo)" : `Rp ${actualPaid.toLocaleString("id-ID")}`;
      if (succChange) succChange.textContent = `Rp ${changeNum.toLocaleString("id-ID")}`;

      playCashChime();
      const payFormView = document.getElementById("payFormView");
      const paySuccessView = document.getElementById("paySuccessView");
      if (payFormView) payFormView.classList.add("hidden");
      if (paySuccessView) paySuccessView.classList.remove("hidden");

      if (state.printerConfig.autoPrint) {
        setTimeout(() => printThermalReceipt(newTrx), 300);
      }

      state.cart = [];
      state.currentAttachedMember = null;
      state.currentDiscountNominal = 0;
      const posMemberName = document.getElementById("posMemberName");
      const posMemberMeta = document.getElementById("posMemberMeta");
      const btnClearMemberPos = document.getElementById("btnClearMemberPos");

      if (posMemberName) posMemberName.textContent = "Pilih Member (No. HP / ID)";
      if (posMemberMeta) posMemberMeta.textContent = "Dapatkan Poin & Diskon Khusus";
      if (btnClearMemberPos) btnClearMemberPos.classList.add("hidden");

      renderCart();
      renderProducts();
      renderAllInventoryData();
      renderAllMemberData();
      renderReports();
    };
  }

  const btnPrintReceiptSuccess = document.getElementById("btnPrintReceiptSuccess");
  if (btnPrintReceiptSuccess) {
    btnPrintReceiptSuccess.onclick = () => {
      const trx = lastCompletedTrx || state.salesTransactions[0];
      if (trx) printThermalReceipt(trx);
    };
  }

  const btnSendWaReceiptSuccess = document.getElementById("btnSendWaReceiptSuccess");
  if (btnSendWaReceiptSuccess) {
    btnSendWaReceiptSuccess.onclick = async () => {
      const trx = lastCompletedTrx || (state.salesTransactions && state.salesTransactions.length > 0 ? state.salesTransactions[0] : null);
      if (!trx) return;

      let rawPhone = "";
      if (trx.member) {
        rawPhone = trx.member.phone || trx.member.wa || trx.member.telepon || "";
      }

      if (!rawPhone && trx.member && trx.member.name) {
        const found = state.membersDB.find((m) => m.name.trim().toLowerCase() === trx.member.name.trim().toLowerCase());
        if (found) {
          rawPhone = found.phone || found.wa || found.telepon || "";
        }
      }

      let clean = normalizePhoneNumber(rawPhone);

      if (!clean || clean.length < 9) {
        const inp = await showThemedPrompt("Kirim Nota WA", "Masukkan nomor WhatsApp tujuan:", "08");
        if (!inp) return;
        clean = normalizePhoneNumber(inp);
      }

      if (clean && clean.length >= 9) {
        window.open(`https://wa.me/${clean}?text=${generateWhatsAppText(trx)}`, "_blank");
      }
    };
  }

  const btnNewTransaction = document.getElementById("btnNewTransaction");
  if (btnNewTransaction) {
    btnNewTransaction.onclick = () => {
      window.history.back();
      document.getElementById("orderPanel")?.classList.remove("mobile-open");
      const fab = document.getElementById("btnOpenCartMobile");
      if (fab) fab.style.display = "flex";
    };
  }

  initPosMemberPickerEvents();
  initPosDiscountEvents();

  const btnTahan = document.getElementById("btnTahan");
  if (btnTahan) {
    btnTahan.onclick = () => {
      const lbl = document.getElementById("lblTahanBtn");
      if (state.cart.length > 0) {
        state.savedHeldCart = {
          cart: [...state.cart],
          member: state.currentAttachedMember,
          discountNominal: state.currentDiscountNominal
        };
        state.cart = [];
        state.currentAttachedMember = null;
        state.currentDiscountNominal = 0;
        const posMemberName = document.getElementById("posMemberName");
        const posMemberMeta = document.getElementById("posMemberMeta");
        const btnClearMemberPos = document.getElementById("btnClearMemberPos");

        if (posMemberName) posMemberName.textContent = "Pilih Member (No. HP / ID)";
        if (posMemberMeta) posMemberMeta.textContent = "Dapatkan Poin & Diskon Khusus";
        if (btnClearMemberPos) btnClearMemberPos.classList.add("hidden");
        renderCart();
        if (lbl) lbl.textContent = "Lanjut";
        showScanToast("Pesanan disimpan sementara");
      } else if (state.savedHeldCart && state.savedHeldCart.cart.length > 0) {
        state.cart = [...state.savedHeldCart.cart];
        if (state.savedHeldCart.member) {
          attachMember(state.savedHeldCart.member);
        }
        state.currentDiscountNominal = state.savedHeldCart.discountNominal || 0;
        state.savedHeldCart = null;
        renderCart();
        if (lbl) lbl.textContent = "Tahan";
        showScanToast("Pesanan dipulihkan");
      }
    };
  }

  // PENANGANAN TOMBOL APUNG KERANJANG DI HP
  const btnOpenCartMobile = document.getElementById("btnOpenCartMobile");
  const orderPanel = document.getElementById("orderPanel");

  if (btnOpenCartMobile) {
    btnOpenCartMobile.onclick = () => {
      orderPanel?.classList.add("mobile-open");
      btnOpenCartMobile.style.display = "none";
    };
  }

  const btnCloseCartMobile = document.getElementById("btnCloseCartMobile");
  if (btnCloseCartMobile) {
    btnCloseCartMobile.onclick = () => {
      orderPanel?.classList.remove("mobile-open");
      if (btnOpenCartMobile) btnOpenCartMobile.style.display = "flex";
    };
  }
}

function initPosMemberPickerEvents() {
  const screen = document.getElementById("posMemberPickerScreen");
  const btnSelect = document.getElementById("btnSelectMemberPos");
  if (btnSelect) {
    btnSelect.onclick = () => {
      const searchInput = document.getElementById("posMemberSearchInput");
      if (searchInput) searchInput.value = "";
      renderPosMemberPicker();
      if (screen) {
        screen.classList.add("active");
        reinforceHistoryBarrier();
        setTimeout(() => searchInput?.focus(), 150);
      }
    };
  }

  const btnBack = document.getElementById("btnBackPosMemberPicker");
  if (btnBack) {
    btnBack.onclick = () => window.history.back();
  }

  const searchInput = document.getElementById("posMemberSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      renderPosMemberPicker(e.target.value.toLowerCase().trim());
    });
  }

  const btnClear = document.getElementById("btnClearMemberPos");
  if (btnClear) {
    btnClear.onclick = (e) => {
      e.stopPropagation();
      state.currentAttachedMember = null;
      state.currentDiscountNominal = 0;
      const posMemberName = document.getElementById("posMemberName");
      const posMemberMeta = document.getElementById("posMemberMeta");

      if (posMemberName) posMemberName.textContent = "Pilih Member (No. HP / ID)";
      if (posMemberMeta) posMemberMeta.textContent = "Dapatkan Poin & Diskon Khusus";
      btnClear.classList.add("hidden");
      renderCart();
      showScanToast("Member dilepas");
    };
  }
}

function renderPosMemberPicker(q = "") {
  const list = document.getElementById("posMemberPickerList");
  if (!list) return;
  list.innerHTML = "";

  const filtered = state.membersDB.filter(
    (m) => {
      const p = m.phone || m.wa || "";
      return m.name.toLowerCase().includes(q) || p.includes(q) || (m.id && m.id.toLowerCase().includes(q));
    }
  );

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding: 30px 16px;">
        <p>Member tidak ditemukan</p>
        <span>Periksa kembali nama atau nomor WhatsApp</span>
      </div>
    `;
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.slice(0, 30).forEach((m) => {
    const card = document.createElement("div");
    card.className = "member-picker-card";
    const phoneDisplay = m.phone || m.wa || "-";
    card.innerHTML = `
      <div>
        <strong>${m.name}</strong><br>
        <small style="color:var(--text-secondary);">${phoneDisplay} • ${m.tier}</small>
      </div>
      <span class="badge-mono">${m.points} Poin</span>
    `;
    card.onclick = () => {
      attachMember(m);
      window.history.back();
    };
    frag.appendChild(card);
  });
  list.appendChild(frag);
}

function initPosDiscountEvents() {
  const modal = document.getElementById("discountModal");
  const btnOpen = document.getElementById("btnOpenDiscountModal");
  const inputDisc = document.getElementById("inputDiscountNominal");

  if (btnOpen) {
    btnOpen.onclick = async () => {
      if (state.cart.length === 0) {
        await showThemedAlert("Keranjang Kosong", "Tambahkan produk terlebih dahulu sebelum mengatur diskon.", "info");
        return;
      }
      if (inputDisc) {
        inputDisc.value = state.currentDiscountNominal > 0 ? "Rp " + state.currentDiscountNominal.toLocaleString("id-ID") : "";
      }
      if (modal) {
        modal.classList.add("open");
        reinforceHistoryBarrier();
        setTimeout(() => inputDisc?.focus(), 150);
      }
    };
  }

  const btnClose = document.getElementById("btnCloseDiscountModal");
  if (btnClose) {
    btnClose.onclick = () => modal?.classList.remove("open");
  }

  if (inputDisc) {
    inputDisc.addEventListener("input", (e) => {
      const raw = e.target.value.replace(/\D/g, "");
      if (!raw) {
        e.target.value = "";
        return;
      }
      const num = parseInt(raw, 10);
      e.target.value = "Rp " + num.toLocaleString("id-ID");
    });
  }

  document.querySelectorAll(".btn-quick-disc").forEach((btn) => {
    btn.onclick = () => {
      const val = parseInt(btn.getAttribute("data-val"), 10) || 0;
      if (inputDisc) inputDisc.value = "Rp " + val.toLocaleString("id-ID");
    };
  });

  const btnApply = document.getElementById("btnApplyDiscount");
  if (btnApply) {
    btnApply.onclick = () => {
      const raw = inputDisc ? inputDisc.value.replace(/\D/g, "") : "0";
      let val = parseInt(raw, 10) || 0;

      if (val > 0) {
        val = Math.round(val / 500) * 500;
      }

      state.currentDiscountNominal = val;
      renderCart();
      if (modal) modal.classList.remove("open");
      showScanToast(val > 0 ? `Diskon Rp ${val.toLocaleString("id-ID")} dipasang` : "Diskon dihapus");
    };
  }
}
