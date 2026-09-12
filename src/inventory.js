// src/inventory.js
import { 
  state, 
  persistProducts, 
  deleteProductDoc, 
  persistCategories, 
  persistOpnames 
} from "./state.js";
import { showThemedAlert, showThemedConfirm, reinforceHistoryBarrier } from "./ui.js";
import { showScanToast, debounce } from "./utils.js";
import { renderProducts } from "./pos.js";

let editingProductId = null;
let catalogCurrentPage = 1;
const CATALOG_PAGE_SIZE = 20;

export function initInventoryModule() {
  document.querySelectorAll("#invMenuView .settings-menu-card").forEach((card) => {
    card.onclick = () => openInvSubMenu(card.getAttribute("data-sub"));
  });

  const btnBackSub = document.getElementById("btnBackInvSubMenu");
  if (btnBackSub) {
    btnBackSub.onclick = () => closeInvSubMenu();
  }

  const invSearch = document.getElementById("invCatalogSearch");
  if (invSearch) {
    invSearch.addEventListener("input", debounce(() => {
      catalogCurrentPage = 1;
      renderInventoryCatalogTable();
    }, 80));
  }

  const btnOpenAddProduct = document.getElementById("btnOpenAddProductPage");
  if (btnOpenAddProduct) {
    btnOpenAddProduct.onclick = () => openProductFormPage(null);
  }

  const btnBackProduct = document.getElementById("btnBackProductPage");
  if (btnBackProduct) {
    btnBackProduct.onclick = () => window.history.back();
  }

  const btnOpenCategory = document.getElementById("btnOpenCategoryPage");
  if (btnOpenCategory) {
    btnOpenCategory.onclick = () => openCategorySelectionPage();
  }

  const btnBackCategory = document.getElementById("btnBackCategoryPage");
  if (btnBackCategory) {
    btnBackCategory.onclick = () => window.history.back();
  }

  const btnAddCat = document.getElementById("btnAddCategoryInline");
  const inCatName = document.getElementById("inNewCategoryName");
  if (btnAddCat && inCatName) {
    const handleAddNewCategory = async () => {
      const val = inCatName.value.trim();
      if (!val) return;
      if (state.categoriesDB.some((c) => c.toLowerCase() === val.toLowerCase())) {
        await showThemedAlert("Kategori Sudah Ada", `Kategori "${val}" sudah terdaftar.`, "info");
        return;
      }

      state.categoriesDB.push(val);
      persistCategories();

      const fCat = document.getElementById("prodFormCategory");
      const fCatDisplay = document.getElementById("prodFormCatDisplay");
      if (fCat) fCat.value = val;
      if (fCatDisplay) fCatDisplay.textContent = val;

      inCatName.value = "";
      window.history.back();
      showScanToast(`Kategori "${val}" ditambahkan & dipilih`);
    };

    btnAddCat.onclick = handleAddNewCategory;
    inCatName.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddNewCategory();
      }
    };
  }

  const formProduct = document.getElementById("productPageForm");
  if (formProduct) {
    formProduct.addEventListener("submit", handleSaveProduct);
  }

  initStockOpnameEvents();
  renderAllInventoryData();
}

export function openInvSubMenu(subId) {
  state.activeInvSubMenuId = subId;
  document.getElementById("panelInvSubCatalog")?.classList.add("hidden");
  document.getElementById("panelInvSubExpired")?.classList.add("hidden");
  document.getElementById("panelInvSubOpnames")?.classList.add("hidden");

  let title = "Detail Persediaan";
  if (subId === "invSubCatalog") {
    document.getElementById("panelInvSubCatalog")?.classList.remove("hidden");
    title = "Katalog Stok Barang";
    catalogCurrentPage = 1;
    renderInventoryCatalogTable();
  } else if (subId === "invSubExpired") {
    document.getElementById("panelInvSubExpired")?.classList.remove("hidden");
    title = "Monitoring Kadaluwarsa";
    renderExpiredBatchesTable();
  } else if (subId === "invSubOpnames") {
    document.getElementById("panelInvSubOpnames")?.classList.remove("hidden");
    title = "Riwayat Stok Opname";
    renderStockOpnamesTable();
  }

  const sTitle = document.getElementById("invSubTitle");
  if (sTitle) sTitle.textContent = title;
  document.getElementById("invMenuView")?.classList.add("hidden");
  document.getElementById("invDetailView")?.classList.remove("hidden");
  reinforceHistoryBarrier();
}

export function closeInvSubMenu() {
  state.activeInvSubMenuId = null;
  document.getElementById("invDetailView")?.classList.add("hidden");
  document.getElementById("invMenuView")?.classList.remove("hidden");
  updateInventoryBadges();
}

export function renderAllInventoryData() {
  renderInventoryCatalogTable();
  renderExpiredBatchesTable();
  renderStockOpnamesTable();
  updateInventoryBadges();
}

function updateInventoryBadges() {
  const bCatalog = document.getElementById("badgeInvCatalogCount");
  if (bCatalog) bCatalog.textContent = `${state.productsDB.length} Item`;

  let expCount = 0;
  const now = new Date();
  state.productsDB.forEach((p) => {
    if (p && Array.isArray(p.batches)) {
      p.batches.forEach((b) => {
        if (b && b.expireDate && (Number(b.qty) || 0) > 0) {
          const diffDays = Math.ceil((new Date(b.expireDate) - now) / (1000 * 60 * 60 * 24));
          if (diffDays <= 30) expCount++;
        }
      });
    }
  });

  const bExp = document.getElementById("badgeInvExpiredCount");
  if (bExp) {
    bExp.textContent = `${expCount} Waspada`;
    bExp.style.color = expCount > 0 ? "var(--brand-danger)" : "#d97706";
  }

  const bOpname = document.getElementById("badgeInvOpnamesCount");
  if (bOpname) bOpname.textContent = `${state.stockOpnamesDB.length} Log`;
}

function openProductFormPage(prod = null) {
  editingProductId = prod ? String(prod.id) : null;
  const screen = document.getElementById("productPageScreen");
  const title = document.getElementById("productPageTitle");
  const fBarcode = document.getElementById("prodFormBarcode");
  const fName = document.getElementById("prodFormName");
  const fCost = document.getElementById("prodFormCostPrice");
  const fPrice = document.getElementById("prodFormSellPrice");
  const fStock = document.getElementById("prodFormInitialStock");
  const fCat = document.getElementById("prodFormCategory");
  const fCatDisplay = document.getElementById("prodFormCatDisplay");

  if (prod) {
    if (title) title.textContent = "Edit Data Barang";
    if (fBarcode) fBarcode.value = prod.barcode || "";
    if (fName) fName.value = prod.name || "";
    if (fCost) fCost.value = Number(prod.costPrice) || 0;
    if (fPrice) fPrice.value = Number(prod.price ?? prod.sellPrice) || 0;
    if (fStock) {
      fStock.value = Number(prod.stock) || 0;
      fStock.disabled = true;
    }
    const catVal = prod.cat || state.categoriesDB[0] || "Bahan Kue";
    if (fCat) fCat.value = catVal;
    if (fCatDisplay) fCatDisplay.textContent = catVal;
  } else {
    if (title) title.textContent = "Tambah Barang Baru";
    document.getElementById("productPageForm")?.reset();
    if (fStock) fStock.disabled = false;
    const defaultCat = state.categoriesDB[0] || "Bahan Kue";
    if (fCat) fCat.value = defaultCat;
    if (fCatDisplay) fCatDisplay.textContent = defaultCat;
  }

  screen?.classList.add("active");
  reinforceHistoryBarrier();
}

export function openCategorySelectionPage() {
  renderCategoryOptionsList();
  document.getElementById("categoryPageScreen")?.classList.add("active");
  reinforceHistoryBarrier();
}

function renderCategoryOptionsList() {
  const container = document.getElementById("categoryOptionsList");
  if (!container) return;
  container.innerHTML = "";

  const fCat = document.getElementById("prodFormCategory");
  const fCatDisplay = document.getElementById("prodFormCatDisplay");
  const activeVal = (fCat?.value || fCatDisplay?.textContent || state.categoriesDB[0] || "Bahan Kue").trim().toLowerCase();

  state.categoriesDB.forEach((cat) => {
    const isSelected = cat.trim().toLowerCase() === activeVal;
    const card = document.createElement("div");
    card.className = `cat-select-card ${isSelected ? "active" : ""}`;
    card.innerHTML = `
      <strong>${cat}</strong>
      <div class="cat-radio-circle"></div>
    `;

    card.onclick = () => {
      if (fCat) fCat.value = cat;
      if (fCatDisplay) fCatDisplay.textContent = cat;

      window.history.back();
      showScanToast(`Kategori: ${cat}`);
    };

    container.appendChild(card);
  });
}

async function handleSaveProduct(e) {
  e.preventDefault();
  const barcode = document.getElementById("prodFormBarcode").value.trim();
  const name = document.getElementById("prodFormName").value.trim();
  const cat = document.getElementById("prodFormCategory").value;
  const costPrice = parseInt(document.getElementById("prodFormCostPrice").value, 10) || 0;
  const price = parseInt(document.getElementById("prodFormSellPrice").value, 10) || 0;
  const stock = parseInt(document.getElementById("prodFormInitialStock").value, 10) || 0;

  let targetProd = null;

  if (editingProductId) {
    const prod = state.productsDB.find((p) => p && String(p.id) === String(editingProductId));
    if (prod) {
      prod.barcode = barcode;
      prod.name = name;
      prod.cat = cat;
      prod.costPrice = costPrice;
      prod.price = price;

      if (Array.isArray(prod.batches)) {
        prod.batches.forEach((b) => {
          if ((Number(b.qty) || 0) > 0) {
            b.buyPrice = costPrice;
            b.sellPrice = price;
          }
        });
      }
      targetProd = prod;
    }
  } else {
    const newId = Date.now();
    targetProd = {
      id: newId,
      barcode: barcode || `899${Math.floor(1000 + Math.random() * 9000)}`,
      name,
      cat,
      costPrice,
      price,
      stock,
      batches: stock > 0 ? [{
        id: `BATCH-${Date.now()}`,
        nota: "STOK-AWAL",
        buyPrice: costPrice,
        sellPrice: price,
        qty: stock,
        expireDate: ""
      }] : []
    };
    state.productsDB.unshift(targetProd);
  }

  if (targetProd) {
    persistProducts(targetProd);
  }
  renderAllInventoryData();
  renderProducts();
  window.history.back();
  showScanToast(`Data barang "${name}" disimpan`);
}

function renderInventoryCatalogTable() {
  const tbody = document.getElementById("inventoryCatalogTableBody");
  const paginationContainer = document.getElementById("invCatalogPagination");
  if (!tbody) return;

  const q = document.getElementById("invCatalogSearch")?.value.toLowerCase().trim() || "";
  const validProducts = (state.productsDB || []).filter((p) => {
    if (!p || typeof p !== "object") return false;
    if (!q) return true;
    const name = (p.name || "").toLowerCase();
    const barcode = String(p.barcode || "").toLowerCase();
    const cat = (p.cat || "").toLowerCase();
    return name.includes(q) || barcode.includes(q) || cat.includes(q);
  });

  const totalItems = validProducts.length;

  if (totalItems === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-secondary); padding: 18px;">Tidak ada data barang yang sesuai.</td></tr>`;
    if (paginationContainer) paginationContainer.innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(totalItems / CATALOG_PAGE_SIZE) || 1;
  if (catalogCurrentPage > totalPages) catalogCurrentPage = totalPages;
  if (catalogCurrentPage < 1) catalogCurrentPage = 1;

  const startIndex = (catalogCurrentPage - 1) * CATALOG_PAGE_SIZE;
  const pageItems = validProducts.slice(startIndex, startIndex + CATALOG_PAGE_SIZE);

  tbody.innerHTML = pageItems.map((p) => {
    const cost = Number(p.costPrice) || 0;
    const sell = Number(p.price ?? p.sellPrice) || 0;
    const stock = Number(p.stock) || 0;
    const barcode = p.barcode || "-";
    const name = p.name || "Tanpa Nama";
    const cat = p.cat || "Umum";

    return `
      <tr>
        <td><code>${barcode}</code></td>
        <td><strong>${name}</strong></td>
        <td><span class="badge-mono">${cat}</span></td>
        <td>Rp ${cost.toLocaleString("id-ID")}</td>
        <td><strong>Rp ${sell.toLocaleString("id-ID")}</strong></td>
        <td><strong>${stock}</strong> pcs</td>
        <td style="text-align: right;">
          <button class="btn-table-action btn-edit-prod" data-id="${p.id}">Edit</button>
          <button class="btn-table-action btn-delete btn-del-prod" data-id="${p.id}">Hapus</button>
        </td>
      </tr>
    `;
  }).join("");

  if (paginationContainer) {
    const startNum = startIndex + 1;
    const endNum = Math.min(startIndex + CATALOG_PAGE_SIZE, totalItems);

    paginationContainer.innerHTML = `
      <div class="pagination-bar">
        <span>Menampilkan <strong>${startNum} - ${endNum}</strong> dari <strong>${totalItems}</strong> barang</span>
        <div class="pagination-controls">
          <button type="button" class="btn-page-nav" id="btnCatalogPrev" ${catalogCurrentPage <= 1 ? "disabled" : ""}>Sebelumnya</button>
          <span style="font-weight:700; color:var(--text-primary); padding: 0 4px;">${catalogCurrentPage} / ${totalPages}</span>
          <button type="button" class="btn-page-nav" id="btnCatalogNext" ${catalogCurrentPage >= totalPages ? "disabled" : ""}>Selanjutnya</button>
        </div>
      </div>
    `;

    const btnPrev = document.getElementById("btnCatalogPrev");
    const btnNext = document.getElementById("btnCatalogNext");

    if (btnPrev) {
      btnPrev.onclick = () => {
        if (catalogCurrentPage > 1) {
          catalogCurrentPage--;
          renderInventoryCatalogTable();
          document.getElementById("view-inventory")?.scrollTo({ top: 0, behavior: "smooth" });
        }
      };
    }

    if (btnNext) {
      btnNext.onclick = () => {
        if (catalogCurrentPage < totalPages) {
          catalogCurrentPage++;
          renderInventoryCatalogTable();
          document.getElementById("view-inventory")?.scrollTo({ top: 0, behavior: "smooth" });
        }
      };
    }
  }

  tbody.querySelectorAll(".btn-edit-prod").forEach((b) => {
    b.onclick = () => {
      const prod = state.productsDB.find((p) => p && String(p.id) === String(b.getAttribute("data-id")));
      if (prod) openProductFormPage(prod);
    };
  });

  tbody.querySelectorAll(".btn-del-prod").forEach((b) => {
    b.onclick = async () => {
      const id = b.getAttribute("data-id");
      const prod = state.productsDB.find((p) => p && String(p.id) === String(id));
      if (!prod) return;

      const ok = await showThemedConfirm("Hapus Barang", `Hapus barang "${prod.name}" dari sistem katalog?`);
      if (ok) {
        state.productsDB = state.productsDB.filter((p) => p && String(p.id) !== String(id));
        deleteProductDoc(id);
        persistProducts(state.productsDB);
        renderAllInventoryData();
        renderProducts();
        showScanToast("Barang dihapus");
      }
    };
  });
}

function renderExpiredBatchesTable() {
  const tbody = document.getElementById("inventoryExpiredTableBody");
  if (!tbody) return;

  const batchesList = [];
  const now = new Date();

  (state.productsDB || []).forEach((p) => {
    if (p && Array.isArray(p.batches)) {
      p.batches.forEach((b) => {
        if (b && b.expireDate && (Number(b.qty) || 0) > 0) {
          const diffDays = Math.ceil((new Date(b.expireDate) - now) / (1000 * 60 * 60 * 24));
          batchesList.push({
            productName: p.name || "Tanpa Nama",
            nota: b.nota || "-",
            qty: Number(b.qty) || 0,
            expireDate: b.expireDate,
            diffDays
          });
        }
      });
    }
  });

  batchesList.sort((a, b) => a.diffDays - b.diffDays);

  if (batchesList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-secondary); padding: 18px;">Tidak ada batch barang dengan kadaluwarsa terdekat.</td></tr>`;
    return;
  }

  tbody.innerHTML = batchesList.map((b) => {
    let badgeClass = "badge-exp-safe";
    let statusLabel = `${b.diffDays} Hari Lagi`;

    if (b.diffDays <= 0) {
      badgeClass = "badge-exp-danger";
      statusLabel = "Kadaluwarsa!";
    } else if (b.diffDays <= 30) {
      badgeClass = "badge-exp-warn";
      statusLabel = `${b.diffDays} Hari (Waspada)`;
    }

    return `
      <tr>
        <td><strong>${b.productName}</strong></td>
        <td>${b.nota}</td>
        <td>${b.qty} pcs</td>
        <td>${b.expireDate}</td>
        <td><span class="badge-mono ${badgeClass}">${statusLabel}</span></td>
      </tr>
    `;
  }).join("");
}

function renderStockOpnamesTable() {
  const tbody = document.getElementById("inventoryOpnamesTableBody");
  if (!tbody) return;

  const validOpnames = (state.stockOpnamesDB || []).filter((o) => o && typeof o === "object");

  if (validOpnames.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding: 18px;">Belum ada riwayat penyesuaian stok opname.</td></tr>`;
    return;
  }

  tbody.innerHTML = validOpnames.map((o) => {
    const diff = Number(o.diff) || 0;
    const sys = Number(o.systemStock) || 0;
    const phys = Number(o.physicalStock) || 0;

    return `
      <tr>
        <td>${o.date || "-"}</td>
        <td><strong>${o.productName || "Tanpa Nama"}</strong></td>
        <td>${sys} pcs</td>
        <td><strong>${phys} pcs</strong></td>
        <td style="color: ${diff < 0 ? 'var(--brand-danger)' : '#15803d'}; font-weight:700;">
          ${diff > 0 ? `+${diff}` : diff} pcs
        </td>
        <td><small>${o.note || '-'}</small></td>
      </tr>
    `;
  }).join("");
}

function initStockOpnameEvents() {
  const screen = document.getElementById("stockOpnamePageScreen");
  const btnOpen = document.getElementById("btnOpenStockOpnamePage");
  const btnBack = document.getElementById("btnBackStockOpnamePage");
  const form = document.getElementById("stockOpnamePageForm");
  
  const btnOpenPicker = document.getElementById("btnOpenOpnameProductPicker");
  const btnBackPicker = document.getElementById("btnBackOpnameProductPicker");
  const searchInputPicker = document.getElementById("opnameProductSearchInput");

  if (btnOpen) {
    btnOpen.onclick = () => {
      form.reset();
      document.getElementById("opnameSelectedProductId").value = "";
      document.getElementById("opnameSelectedProductName").textContent = "Pilih Barang...";
      document.getElementById("opnameSystemStock").value = "0 pcs";
      screen?.classList.add("active");
      reinforceHistoryBarrier();
    };
  }

  if (btnBack) {
    btnBack.onclick = () => window.history.back();
  }

  if (btnOpenPicker) {
    btnOpenPicker.onclick = () => {
      if (searchInputPicker) searchInputPicker.value = "";
      renderOpnameProductOptions("");
      document.getElementById("opnameProductPickerScreen")?.classList.add("active");
      reinforceHistoryBarrier();
      setTimeout(() => searchInputPicker?.focus(), 150);
    };
  }

  if (btnBackPicker) {
    btnBackPicker.onclick = () => window.history.back();
  }

  if (searchInputPicker) {
    searchInputPicker.addEventListener("input", debounce((e) => {
      renderOpnameProductOptions(e.target.value.toLowerCase().trim());
    }, 60));
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pId = document.getElementById("opnameSelectedProductId").value;
      const prod = state.productsDB.find((p) => p && String(p.id) === String(pId));
      if (!prod) {
        await showThemedAlert("Pilih Barang", "Silakan tentukan barang yang di-audit terlebih dahulu!", "error");
        return;
      }

      const sysStock = Number(prod.stock) || 0;
      const physStock = parseInt(document.getElementById("opnamePhysicalStock").value, 10) || 0;
      const diff = physStock - sysStock;
      const note = document.getElementById("opnameNote").value.trim();

      prod.stock = physStock;
      if (Array.isArray(prod.batches) && prod.batches.length > 0) {
        prod.batches.forEach((b) => { b.qty = 0; });
        prod.batches[prod.batches.length - 1].qty = physStock;
      } else {
        prod.batches = [{
          id: `BATCH-${Date.now()}`,
          nota: "OPNAME-ADJUST",
          buyPrice: prod.costPrice,
          sellPrice: prod.price,
          qty: physStock,
          expireDate: ""
        }];
      }
      persistProducts(prod);

      const newOpname = {
        id: `OPN-${Date.now()}`,
        date: new Date().toLocaleDateString("id-ID"),
        productId: prod.id,
        productName: prod.name,
        systemStock: sysStock,
        physicalStock: physStock,
        diff,
        note
      };
      state.stockOpnamesDB.unshift(newOpname);
      persistOpnames(newOpname);

      window.history.back();
      renderAllInventoryData();
      renderProducts();
      showScanToast(`Stok ${prod.name} disesuaikan ke ${physStock}`);
      await showThemedAlert("Stok Opname Selesai", `Stok fisik ${prod.name} diperbarui menjadi ${physStock} pcs.`);
    });
  }
}

function renderOpnameProductOptions(q = "") {
  const container = document.getElementById("opnameProductOptionsList");
  if (!container) return;
  container.innerHTML = "";

  const filtered = state.productsDB.filter((p) => {
    if (!p) return false;
    const name = (p.name || "").toLowerCase();
    const barcode = String(p.barcode || "").toLowerCase();
    const cat = (p.cat || "").toLowerCase();
    return name.includes(q) || barcode.includes(q) || cat.includes(q);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 30px 16px;">
        <p>Barang tidak ditemukan</p>
        <span>Periksa kembali kata kunci pencarian</span>
      </div>
    `;
    return;
  }

  filtered.forEach((p) => {
    const card = document.createElement("div");
    card.className = "cat-select-card";
    card.innerHTML = `
      <div>
        <strong style="display:block; font-size:13px; color:var(--text-primary);">${p.name}</strong>
        <small style="color:var(--text-secondary); font-size:11px;">Stok Sistem: ${p.stock} pcs • ${p.cat}</small>
      </div>
      <div class="cat-radio-circle"></div>
    `;

    card.onclick = () => {
      document.getElementById("opnameSelectedProductId").value = p.id;
      document.getElementById("opnameSelectedProductName").textContent = p.name;
      document.getElementById("opnameSystemStock").value = `${p.stock} pcs`;
      window.history.back();
    };

    container.appendChild(card);
  });
}
