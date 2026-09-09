// src/state.js
import { 
  db, 
  doc, 
  setDoc, 
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot 
} from "../firebase-config.js";
import { getLocalItem, setLocalItem, initLocalDB } from "./db-local.js";

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export const state = {
  currentViewId: "view-pos",
  currentUser: null,
  cart: [],
  savedHeldCart: null,
  currentCategory: "all",
  searchQuery: "",
  currentDiscountNominal: 0,
  currentAttachedMember: null,
  activeMemberSubMenuId: null,
  activeSettingsSubMenuId: null,
  activeMasterItSubMenuId: null,
  activeInvSubMenuId: null,
  activeFinSubMenuId: null,
  currentEditingTrx: null,
  currentEditingPurchase: null,
  lastSyncTimestamp: Date.now(),

  accountsDB: [
    { username: "master.it", password: "itmaster@kholif2026", role: "master_it", name: "Abu Kholif (IT Master)" },
    { username: "admin.toko", password: "admin@kholif2026", role: "admin", name: "Admin Operasional" },
    { username: "kasir01", password: "kasir@kholif2026", role: "cashier", name: "Kasir Shift 1" }
  ],

  membersDB: [
    { id: "MBR-101", name: "Ibu Nurul Aini", phone: "087861444070", tier: "Gold (10%)", discount: 10, points: 150, debt: 0 },
    { id: "MBR-102", name: "Bpk. H. Sukri", phone: "081912345678", tier: "Silver (5%)", discount: 5, points: 80, debt: 45000 },
    { id: "MBR-103", name: "Toko Kue Barokah", phone: "085934567890", tier: "VIP Horeca (15%)", discount: 15, points: 420, debt: 120000 }
  ],

  categoriesDB: ["Bahan Kue", "Kemasan", "Horeca"],

  productsDB: [
    { 
      id: 1, barcode: "8991001", name: "Tepung Terigu Kholif 1kg", cat: "Bahan Kue", costPrice: 11000, price: 14000, stock: 120,
      batches: [{ id: "BATCH-1", nota: "NOTA-001", buyPrice: 11000, sellPrice: 14000, qty: 120, expireDate: "2026-11-15" }]
    },
    { 
      id: 2, barcode: "8991002", name: "Gula Halus Murni 500g", cat: "Bahan Kue", costPrice: 9500, price: 12000, stock: 85,
      batches: [{ id: "BATCH-2", nota: "NOTA-001", buyPrice: 9500, sellPrice: 12000, qty: 85, expireDate: "2026-09-30" }]
    },
    { 
      id: 3, barcode: "8991003", name: "Kotak Box Kraft M (10pcs)", cat: "Kemasan", costPrice: 18000, price: 22000, stock: 250,
      batches: [{ id: "BATCH-3", nota: "NOTA-002", buyPrice: 18000, sellPrice: 22000, qty: 250, expireDate: "2028-12-31" }]
    }
  ],

  purchasesDB: [],
  supplierDebtsDB: [],
  stockOpnamesDB: [],
  salesTransactions: [],

  financeDB: {
    cashBalance: 500000,
    digitalBalance: 0,
    logs: []
  },

  printerConfig: {
    paperWidth: "58mm",
    autoPrint: false
  },

  featuresConfig: {
    feat_diskon: { id: "feat_diskon", name: "Diskon Transaksi", enabled: true, allowedRoles: ["master_it", "admin"] },
    feat_tahan_pesanan: { id: "feat_tahan_pesanan", name: "Tahan Pesanan", enabled: true, allowedRoles: ["master_it", "admin", "cashier"] },
    feat_pajak: { id: "feat_pajak", name: "PPN (11%)", enabled: true, allowedRoles: ["master_it", "admin", "cashier"] }
  }
};

/* =========================================================
   PENGELOLAAN SESI LOGIN KASIR
   ========================================================= */
export function saveUserSession(user) {
  localStorage.setItem("kholif_pos_session", JSON.stringify({ user, loginTimestamp: Date.now() }));
}

export function clearUserSession() {
  localStorage.removeItem("kholif_pos_session");
}

export function getValidSession() {
  const raw = localStorage.getItem("kholif_pos_session");
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (Date.now() - s.loginTimestamp > SESSION_DURATION_MS) {
      clearUserSession();
      return null;
    }
    return s.user;
  } catch (e) {
    clearUserSession();
    return null;
  }
}

/* =========================================================
   INISIALISASI DATA DARI INDEXEDDB (OFFLINE-FIRST)
   ========================================================= */
export async function loadInitialStateFromDB() {
  await initLocalDB();

  const localAccounts = await getLocalItem("kholif_pos_accounts");
  if (localAccounts && Array.isArray(localAccounts)) {
    state.accountsDB = localAccounts;
  } else {
    const legacy = localStorage.getItem("kholif_pos_accounts");
    if (legacy) {
      try { state.accountsDB = JSON.parse(legacy); } catch (e) {}
    }
    await setLocalItem("kholif_pos_accounts", state.accountsDB);
  }

  const localMembers = await getLocalItem("kholif_pos_members");
  if (localMembers && Array.isArray(localMembers)) {
    state.membersDB = localMembers;
  } else {
    const legacy = localStorage.getItem("kholif_pos_members");
    if (legacy) {
      try { state.membersDB = JSON.parse(legacy); } catch (e) {}
    }
    await setLocalItem("kholif_pos_members", state.membersDB);
  }

  const localCategories = await getLocalItem("kholif_pos_categories");
  if (localCategories && Array.isArray(localCategories)) {
    state.categoriesDB = localCategories;
  } else {
    const legacy = localStorage.getItem("kholif_pos_categories");
    if (legacy) {
      try { state.categoriesDB = JSON.parse(legacy); } catch (e) {}
    }
    await setLocalItem("kholif_pos_categories", state.categoriesDB);
  }

  const localProducts = await getLocalItem("kholif_pos_products");
  if (localProducts && Array.isArray(localProducts)) {
    state.productsDB = localProducts;
  } else {
    const legacy = localStorage.getItem("kholif_pos_products");
    if (legacy) {
      try { state.productsDB = JSON.parse(legacy); } catch (e) {}
    }
    await setLocalItem("kholif_pos_products", state.productsDB);
  }

  const localPurchases = await getLocalItem("kholif_pos_purchases");
  if (localPurchases && Array.isArray(localPurchases)) {
    state.purchasesDB = localPurchases;
  } else {
    const legacy = localStorage.getItem("kholif_pos_purchases");
    if (legacy) {
      try { state.purchasesDB = JSON.parse(legacy); } catch (e) {}
    }
    await setLocalItem("kholif_pos_purchases", state.purchasesDB);
  }

  const localDebts = await getLocalItem("kholif_pos_supplier_debts");
  if (localDebts && Array.isArray(localDebts)) {
    state.supplierDebtsDB = localDebts;
  } else {
    const legacy = localStorage.getItem("kholif_pos_supplier_debts");
    if (legacy) {
      try { state.supplierDebtsDB = JSON.parse(legacy); } catch (e) {}
    }
    await setLocalItem("kholif_pos_supplier_debts", state.supplierDebtsDB);
  }

  const localOpnames = await getLocalItem("kholif_pos_opnames");
  if (localOpnames && Array.isArray(localOpnames)) {
    state.stockOpnamesDB = localOpnames;
  } else {
    const legacy = localStorage.getItem("kholif_pos_opnames");
    if (legacy) {
      try { state.stockOpnamesDB = JSON.parse(legacy); } catch (e) {}
    }
    await setLocalItem("kholif_pos_opnames", state.stockOpnamesDB);
  }

  const localSales = await getLocalItem("kholif_pos_sales");
  if (localSales && Array.isArray(localSales)) {
    state.salesTransactions = localSales.sort((a, b) => {
      return (b.timestamp || 0) - (a.timestamp || 0) || (b.id || "").localeCompare(a.id || "");
    });
  } else {
    const legacy = localStorage.getItem("kholif_pos_sales");
    if (legacy) {
      try {
        state.salesTransactions = JSON.parse(legacy).sort((a, b) => {
          return (b.timestamp || 0) - (a.timestamp || 0) || (b.id || "").localeCompare(a.id || "");
        });
      } catch (e) {}
    }
    await setLocalItem("kholif_pos_sales", state.salesTransactions);
  }

  const localFinance = await getLocalItem("kholif_pos_finance");
  if (localFinance && typeof localFinance === "object") {
    state.financeDB = localFinance;
    if (state.financeDB.digitalBalance === undefined) {
      state.financeDB.digitalBalance = 0;
    }
    if (state.financeDB.cashBalance === undefined) {
      state.financeDB.cashBalance = 0;
    }
    if (!Array.isArray(state.financeDB.logs)) {
      state.financeDB.logs = [];
    }
  } else {
    state.financeDB = { cashBalance: 500000, digitalBalance: 0, logs: [] };
    await setLocalItem("kholif_pos_finance", state.financeDB);
  }

  const localPrinter = await getLocalItem("kholif_pos_printer_config");
  if (localPrinter && typeof localPrinter === "object") {
    state.printerConfig = localPrinter;
  } else {
    const legacyPrinter = localStorage.getItem("kholif_pos_printer_config");
    if (legacyPrinter) {
      try {
        state.printerConfig = JSON.parse(legacyPrinter);
      } catch (e) {}
    }
    await setLocalItem("kholif_pos_printer_config", state.printerConfig);
  }

  const localFeatures = await getLocalItem("kholif_features_manifest");
  if (localFeatures) state.featuresConfig = localFeatures;
}

/* =========================================================
   PENGHEMAT KUOTA TULIS: WRITE-DEBOUNCE SYNC
   ========================================================= */
const syncTimers = {};
function queueFirestoreSync(key, syncFn, delay = 600) {
  clearTimeout(syncTimers[key]);
  syncTimers[key] = setTimeout(() => {
    syncFn();
    state.lastSyncTimestamp = Date.now();
  }, delay);
}

export function persistAccounts() {
  setLocalItem("kholif_pos_accounts", state.accountsDB);
  queueFirestoreSync("accounts", () => {
    try { setDoc(doc(db, "system_data", "accounts"), { list: state.accountsDB }, { merge: true }); } catch (e) {}
  });
}

export function persistMembers() {
  setLocalItem("kholif_pos_members", state.membersDB);
  queueFirestoreSync("members", () => {
    try { setDoc(doc(db, "system_data", "members"), { list: state.membersDB }, { merge: true }); } catch (e) {}
  });
}

export function persistCategories() {
  setLocalItem("kholif_pos_categories", state.categoriesDB);
  queueFirestoreSync("categories", () => {
    try { setDoc(doc(db, "system_data", "categories"), { list: state.categoriesDB }, { merge: true }); } catch (e) {}
  });
}

export function persistProducts() {
  setLocalItem("kholif_pos_products", state.productsDB);
  queueFirestoreSync("products", () => {
    try { setDoc(doc(db, "system_data", "products"), { list: state.productsDB }, { merge: true }); } catch (e) {}
  });
}

export function persistPurchases() {
  setLocalItem("kholif_pos_purchases", state.purchasesDB);
  queueFirestoreSync("purchases", () => {
    try { setDoc(doc(db, "system_data", "purchases"), { list: state.purchasesDB }, { merge: true }); } catch (e) {}
  });
}

export function persistSupplierDebts() {
  setLocalItem("kholif_pos_supplier_debts", state.supplierDebtsDB);
  queueFirestoreSync("supplier_debts", () => {
    try { setDoc(doc(db, "system_data", "supplier_debts"), { list: state.supplierDebtsDB }, { merge: true }); } catch (e) {}
  });
}

export function persistOpnames() {
  setLocalItem("kholif_pos_opnames", state.stockOpnamesDB);
  queueFirestoreSync("stock_opnames", () => {
    try { setDoc(doc(db, "system_data", "stock_opnames"), { list: state.stockOpnamesDB }, { merge: true }); } catch (e) {}
  });
}

// Menyimpan setiap transaksi sebagai dokumen mandiri tanpa batas potong 150
export function persistSales(specificTrx = null) {
  setLocalItem("kholif_pos_sales", state.salesTransactions);

  if (specificTrx && specificTrx.id) {
    try {
      setDoc(doc(db, "sales_transactions", specificTrx.id), specificTrx, { merge: true });
      state.lastSyncTimestamp = Date.now();
    } catch (e) {
      console.warn("Gagal sinkron transaksi ke Firestore:", e);
    }
  } else {
    queueFirestoreSync("sales_batch", () => {
      try {
        const poolToSync = state.salesTransactions.slice(0, 50);
        poolToSync.forEach((trx) => {
          if (trx && trx.id) {
            setDoc(doc(db, "sales_transactions", trx.id), trx, { merge: true });
          }
        });
      } catch (e) {}
    }, 400);
  }
}

// Menghapus dokumen transaksi dari koleksi Firestore saat transaksi dihapus
export function deleteSaleDoc(trxId) {
  if (!trxId) return;
  try {
    deleteDoc(doc(db, "sales_transactions", trxId));
  } catch (e) {
    console.warn("Gagal hapus transaksi di Firestore:", e);
  }
}

export function persistFinance() {
  setLocalItem("kholif_pos_finance", state.financeDB);
  queueFirestoreSync("finance", () => {
    try {
      setDoc(doc(db, "system_data", "finance"), state.financeDB, { merge: true });
    } catch (e) {}
  });
}

export function persistFeatures() {
  setLocalItem("kholif_features_manifest", state.featuresConfig);
  queueFirestoreSync("features", () => {
    try { setDoc(doc(db, "system_configs", "features_manifest"), { ...state.featuresConfig }, { merge: true }); } catch (e) {}
  });
}

export function persistPrinterConfig() {
  setLocalItem("kholif_pos_printer_config", state.printerConfig);
  localStorage.setItem("kholif_pos_printer_config", JSON.stringify(state.printerConfig));
}

/* =========================================================
   SINKRONISASI REALTIME FIREBASE
   ========================================================= */
export function initFirebaseSync(callbacks = {}) {
  const markSync = () => {
    state.lastSyncTimestamp = Date.now();
  };

  const handleSyncError = (collectionName, err) => {
    console.warn(`Sinkronisasi ${collectionName} dialihkan ke database lokal (offline):`, err?.message || err);
  };

  // 1. Produk & Stok
  onSnapshot(
    doc(db, "system_data", "products"),
    async (snap) => {
      if (snap.exists() && snap.data().list) {
        state.productsDB = snap.data().list;
        await setLocalItem("kholif_pos_products", state.productsDB);
        markSync();
        if (callbacks.onProductsChange) callbacks.onProductsChange();
      }
    },
    (err) => handleSyncError("products", err)
  );

  // 2. Member & Kasbon
  onSnapshot(
    doc(db, "system_data", "members"),
    async (snap) => {
      if (snap.exists() && snap.data().list) {
        state.membersDB = snap.data().list;
        await setLocalItem("kholif_pos_members", state.membersDB);
        markSync();
        if (callbacks.onMembersChange) callbacks.onMembersChange();
      }
    },
    (err) => handleSyncError("members", err)
  );

  // 3. Transaksi Penjualan: Koleksi mandiri tanpa batas potong 150
  const salesQuery = query(
    collection(db, "sales_transactions"),
    orderBy("timestamp", "desc"),
    limit(300)
  );

  onSnapshot(
    salesQuery,
    async (snapshot) => {
      const salesMap = new Map(state.salesTransactions.map((trx) => [trx.id, trx]));

      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        if (change.type === "removed") {
          salesMap.delete(change.doc.id);
        } else if (data && data.id) {
          salesMap.set(data.id, data);
        }
      });

      state.salesTransactions = Array.from(salesMap.values()).sort((a, b) => {
        return (b.timestamp || 0) - (a.timestamp || 0) || (b.id || "").localeCompare(a.id || "");
      });

      await setLocalItem("kholif_pos_sales", state.salesTransactions);
      markSync();
      if (callbacks.onSalesChange) callbacks.onSalesChange();
    },
    (err) => handleSyncError("sales_transactions", err)
  );

  // 4. Akun Pengguna
  onSnapshot(
    doc(db, "system_data", "accounts"),
    async (snap) => {
      if (snap.exists() && snap.data().list) {
        state.accountsDB = snap.data().list;
        await setLocalItem("kholif_pos_accounts", state.accountsDB);
        markSync();
        if (callbacks.onAccountsChange) callbacks.onAccountsChange();
      }
    },
    (err) => handleSyncError("accounts", err)
  );

  // 5. Kategori Barang
  onSnapshot(
    doc(db, "system_data", "categories"),
    async (snap) => {
      if (snap.exists() && snap.data().list) {
        state.categoriesDB = snap.data().list;
        await setLocalItem("kholif_pos_categories", state.categoriesDB);
        markSync();
        if (callbacks.onCategoriesChange) callbacks.onCategoriesChange();
      }
    },
    (err) => handleSyncError("categories", err)
  );

  // 6. Faktur Pembelian Supplier
  onSnapshot(
    doc(db, "system_data", "purchases"),
    async (snap) => {
      if (snap.exists() && snap.data().list) {
        state.purchasesDB = snap.data().list;
        await setLocalItem("kholif_pos_purchases", state.purchasesDB);
        markSync();
        if (callbacks.onPurchasesChange) callbacks.onPurchasesChange();
      }
    },
    (err) => handleSyncError("purchases", err)
  );

  // 7. Hutang Dagang Supplier
  onSnapshot(
    doc(db, "system_data", "supplier_debts"),
    async (snap) => {
      if (snap.exists() && snap.data().list) {
        state.supplierDebtsDB = snap.data().list;
        await setLocalItem("kholif_pos_supplier_debts", state.supplierDebtsDB);
        markSync();
        if (callbacks.onSupplierDebtsChange) callbacks.onSupplierDebtsChange();
      }
    },
    (err) => handleSyncError("supplier_debts", err)
  );

  // 8. Log Stok Opname
  onSnapshot(
    doc(db, "system_data", "stock_opnames"),
    async (snap) => {
      if (snap.exists() && snap.data().list) {
        state.stockOpnamesDB = snap.data().list;
        await setLocalItem("kholif_pos_opnames", state.stockOpnamesDB);
        markSync();
        if (callbacks.onOpnamesChange) callbacks.onOpnamesChange();
      }
    },
    (err) => handleSyncError("stock_opnames", err)
  );

  // 9. Status Fitur Operasional
  onSnapshot(
    doc(db, "system_configs", "features_manifest"),
    async (snap) => {
      if (snap.exists()) {
        state.featuresConfig = snap.data();
        await setLocalItem("kholif_features_manifest", state.featuresConfig);
        markSync();
        if (callbacks.onFeaturesChange) callbacks.onFeaturesChange();
      }
    },
    (err) => handleSyncError("features_manifest", err)
  );

  // 10. Data Kas Keuangan Toko
  onSnapshot(
    doc(db, "system_data", "finance"),
    async (snap) => {
      if (snap.exists()) {
        state.financeDB = snap.data();
        if (state.financeDB.digitalBalance === undefined) {
          state.financeDB.digitalBalance = 0;
        }
        if (state.financeDB.cashBalance === undefined) {
          state.financeDB.cashBalance = 0;
        }
        if (!Array.isArray(state.financeDB.logs)) {
          state.financeDB.logs = [];
        }
        await setLocalItem("kholif_pos_finance", state.financeDB);
        markSync();
        if (callbacks.onFinanceChange) callbacks.onFinanceChange();
      }
    },
    (err) => handleSyncError("finance", err)
  );
}
