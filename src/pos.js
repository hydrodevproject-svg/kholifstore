// src/pos.js
import { state, persistProducts, persistSales, persistMembers, persistFinance } from "./state.js";
import { showThemedAlert, showThemedPrompt, reinforceHistoryBarrier } from "./ui.js";
import { showScanToast, playCashChime } from "./utils.js";
import { printThermalReceipt, generateWhatsAppText } from "./printer.js";
import { refreshProductPriceFromBatches } from "./purchases.js";
import { renderAllInventoryData } from "./inventory.js";
import { renderAllMemberData } from "./members.js";
import { renderReports } from "./reports.js";
import { renderFinanceDashboard } from "./finance.js";

export function initPosModule() {
  initPosEvents();
  renderCategories();
  renderProducts();
  renderCart();
}

export function deductProductStockFIFO(prod, deductQty) {
  let remaining = deductQty;
  if (prod.batches && prod.batches.length > 0) {
    for (let i = 0; i < prod.batches.length; i++) {
      const batch = prod.batches[i];
      if (batch.qty > 0) {
        if (batch.qty >= remaining) {
          batch.qty -= remaining;
          remaining = 0;
          break;
        } else {
          remaining -= batch.qty;
          batch.qty = 0;
        }
      }
    }
    prod.stock = prod.batches.reduce((sum, b) => sum + b.qty, 0);
    refreshProductPriceFromBatches(prod);
  } else {
    prod.stock = Math.max(0, (prod.stock || 0) - deductQty);
  }
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
  const filtered = state.productsDB.filter((p) => {
    const matchCat = state.currentCategory === "all" || p.cat === state.currentCategory;
    const matchSearch =
      p.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      (p.barcode && p.barcode.includes(state.searchQuery));
    return matchCat && matchSearch;
  });

  const frag = document.createDocumentFragment();

  filtered.forEach((p) => {
    const isOutOfStock = p.stock <= 0;
    const row = document.createElement("div");
    row.className = `product-list-row ${isOutOfStock ? "out-of-stock" : ""}`;
    if (!isOutOfStock) row.onclick = () => addToCart(p);

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
        <button class="btn-minus" data-id="${item.id}">-</button>
        <span>${item.qty}</span>
        <button class="btn-plus" data-id="${item.id}">+</button>
      </div>
      <div class="order-row-subtotal">Rp ${sub.toLocaleString("id-ID")}</div>
    `;
    frag.appendChild(row);
  });

  orderList.innerHTML = "";
  orderList.appendChild(frag);

  orderList.querySelectorAll(".btn-minus").forEach((b) => {
    b.onclick = () => updateQty(Number(b.getAttribute("data-id")), -1);
  });
  orderList.querySelectorAll(".btn-plus").forEach((b) => {
    b.onclick = () => updateQty(Number(b.getAttribute("data-id")), 1);
  });

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
  const isPpnActive = state.featuresConfig.feat_pajak?.enabled;
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

  if (posMemberName) posMemberName.textContent = `${member.name} (${member.phone})`;
  if (posMemberMeta) posMemberMeta.textContent = `${member.tier} • ${member.points} Poin`;
  if (btnClearMemberPos) btnClearMemberPos.classList.remove("hidden");

  renderCart();
  showScanToast(`Member "${member.name}" terpasang`);
}

function initPosEvents() {
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
      const valGrandTotal = document.getElementById("valGrandTotal");
      const valSubtotal = document.getElementById("valSubtotal");

      const paymentMethod = payMethod ? payMethod.value : "Tunai";
      const rawPaid = inputPaidEl ? parseInt(inputPaidEl.value.replace(/\D/g, ""), 10) || 0 : 0;
      const grandTotalNum = parseInt(valGrandTotal ? valGrandTotal.textContent.replace(/\D/g, "") : "0", 10) || 0;
      const subtotalNum = parseInt(valSubtotal ? valSubtotal.textContent.replace(/\D/g, "") : "0", 10) || 0;

      if (paymentMethod === "Piutang / Kasbon") {
        if (!state.currentAttachedMember) {
          await showThemedAlert("Pilih Member", "Pembayaran Kasbon hanya diperbolehkan jika data Member dipilih!", "error");
          return;
        }
        const mbr = state.membersDB.find((x) => x.id === state.currentAttachedMember.id);
        if (mbr) {
          mbr.debt += grandTotalNum;
          persistMembers();
        }
      } else if (rawPaid < grandTotalNum) {
        await showThemedAlert("Nominal Kurang", "Uang yang diterima kasir belum mencukupi total tagihan belanja!", "error");
        return;
      }

      state.cart.forEach((cartItem) => {
        const prod = state.productsDB.find((p) => p.id === cartItem.id);
        if (prod) deductProductStockFIFO(prod, cartItem.qty);
      });
      persistProducts();

      if (state.currentAttachedMember) {
        const earned = Math.floor(grandTotalNum / 1000);
        const mbr = state.membersDB.find((x) => x.id === state.currentAttachedMember.id);
        if (mbr) {
          mbr.points += earned;
          persistMembers();
        }
      }

      // Format Hari, Tanggal, dan Jam Transaksi
      const now = new Date();
      const dayName = now.toLocaleDateString("id-ID", { weekday: "long" });
      const dateFormatted = now.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
      const clockFormatted = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      const fullDateTimeStr = `${dayName}, ${dateFormatted} • ${clockFormatted}`;
      const trxId = `TRX-${Math.floor(1000 + Math.random() * 9000)}`;
      const changeNum = Math.max(0, rawPaid - grandTotalNum);

      const snapshotItems = state.cart.map((i) => ({
        name: i.name,
        qty: i.qty,
        price: i.price,
        subtotal: i.price * i.qty
      }));

      let appliedDiscount = state.currentDiscountNominal;
      if (appliedDiscount === 0 && state.currentAttachedMember && state.currentAttachedMember.discount > 0) {
        appliedDiscount = Math.round((subtotalNum * (state.currentAttachedMember.discount / 100)) / 500) * 500;
      }

      const newTrx = {
        id: trxId,
        date: `${dayName}, ${dateFormatted}`,
        time: fullDateTimeStr,
        cashier: state.currentUser ? state.currentUser.name : "Kasir",
        member: state.currentAttachedMember ? { name: state.currentAttachedMember.name, phone: state.currentAttachedMember.phone } : null,
        total: grandTotalNum,
        discount: appliedDiscount,
        paymentMethod,
        items: snapshotItems,
        status: "Sukses"
      };

      state.salesTransactions.unshift(newTrx);
      persistSales();

      // Sinkronisasi Arus Kas Keuangan Toko jika pembayaran tunai / non-piutang
      if (paymentMethod !== "Piutang / Kasbon") {
        if (!state.financeDB) state.financeDB = { cashBalance: 0, logs: [] };
        state.financeDB.cashBalance = (state.financeDB.cashBalance || 0) + grandTotalNum;
        if (!Array.isArray(state.financeDB.logs)) state.financeDB.logs = [];
        
        state.financeDB.logs.unshift({
          id: `FIN-${Date.now()}`,
          time: fullDateTimeStr,
          type: "Penjualan Kasir",
          amount: grandTotalNum,
          note: `Penerimaan POS: ${trxId} (${paymentMethod})`,
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
      if (succPaid) succPaid.textContent = paymentMethod === "Piutang / Kasbon" ? "Kasbon (Tempo)" : `Rp ${rawPaid.toLocaleString("id-ID")}`;
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
      if (state.salesTransactions[0]) printThermalReceipt(state.salesTransactions[0]);
    };
  }

  // Pengiriman Nota WA langsung tanpa meminta ulang jika member sudah terdaftar
  const btnSendWaReceiptSuccess = document.getElementById("btnSendWaReceiptSuccess");
  if (btnSendWaReceiptSuccess) {
    btnSendWaReceiptSuccess.onclick = async () => {
      if (!state.salesTransactions[0]) return;
      const trx = state.salesTransactions[0];
      
      let target = "";
      
      if (trx.member && trx.member.phone) {
        let clean = String(trx.member.phone).replace(/\D/g, "");
        if (clean.startsWith("0")) {
          clean = "62" + clean.slice(1);
        } else if (clean.startsWith("8")) {
          clean = "62" + clean;
        }
        target = clean;
      }

      if (!target) {
        const inp = await showThemedPrompt("Kirim Nota WA", "Masukkan nomor WhatsApp tujuan:", "08");
        if (!inp) return;
        let cleanInp = inp.replace(/\D/g, "");
        if (cleanInp.startsWith("0")) {
          cleanInp = "62" + cleanInp.slice(1);
        } else if (cleanInp.startsWith("8")) {
          cleanInp = "62" + cleanInp;
        }
        target = cleanInp;
      }

      window.open(`https://wa.me/${target}?text=${generateWhatsAppText(trx)}`, "_blank");
    };
  }

  const btnNewTransaction = document.getElementById("btnNewTransaction");
  if (btnNewTransaction) {
    btnNewTransaction.onclick = () => {
      window.history.back();
      document.getElementById("orderPanel")?.classList.remove("mobile-open");
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

  const btnOpenCartMobile = document.getElementById("btnOpenCartMobile");
  if (btnOpenCartMobile) {
    btnOpenCartMobile.onclick = () => document.getElementById("orderPanel")?.classList.add("mobile-open");
  }

  const btnCloseCartMobile = document.getElementById("btnCloseCartMobile");
  if (btnCloseCartMobile) {
    btnCloseCartMobile.onclick = () => document.getElementById("orderPanel")?.classList.remove("mobile-open");
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
    (m) => m.name.toLowerCase().includes(q) || m.phone.includes(q) || m.id.toLowerCase().includes(q)
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

  filtered.forEach((m) => {
    const card = document.createElement("div");
    card.className = "member-picker-card";
    card.innerHTML = `
      <div>
        <strong>${m.name}</strong><br>
        <small style="color:var(--text-secondary);">${m.phone} • ${m.tier}</small>
      </div>
      <span class="badge-mono">${m.points} Poin</span>
    `;
    card.onclick = () => {
      attachMember(m);
      window.history.back();
    };
    list.appendChild(card);
  });
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
