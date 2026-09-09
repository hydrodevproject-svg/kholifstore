// src/ui.js
import { state } from "./state.js";

let allowAppExit = false;
let dialogResolveCallback = null;
let dialogCancelCallback = null;

export async function loadViews() {
  const viewsToLoad = [
    { 
      targetId: "viewContainer", 
      files: [
        "views/pos.html",
        "views/members.html",
        "views/purchases.html",
        "views/inventory.html",
        "views/reports.html",
        "views/finance.html",
        "views/setting.html"
      ]
    },
    { 
      targetId: "modalContainer", 
      files: ["views/modals.html"] 
    }
  ];

  for (const group of viewsToLoad) {
    const container = document.getElementById(group.targetId);
    if (!container) continue;
    let fullHtml = "";
    for (const file of group.files) {
      try {
        const res = await fetch(file);
        if (res.ok) {
          fullHtml += await res.text();
        } else {
          console.error(`Gagal memuat ${file}: status ${res.status}`);
        }
      } catch (err) {
        console.error(`Gagal memuat view: ${file}`, err);
      }
    }
    container.innerHTML = fullHtml;
  }
}

export function reinforceHistoryBarrier() {
  window.history.pushState({ app: "kholif_pos_locked" }, "", window.location.href);
}

export function initDrawer() {
  const btnOpenDrawer = document.getElementById("btnOpenDrawer");
  const btnCloseDrawer = document.getElementById("btnCloseDrawer");
  const appDrawer = document.getElementById("appDrawer");
  const drawerBackdrop = document.getElementById("drawerBackdrop");

  function openDrawer() {
    if (appDrawer && drawerBackdrop) {
      drawerBackdrop.classList.add("open");
      appDrawer.classList.add("open");
    }
  }

  function closeDrawer() {
    if (appDrawer && drawerBackdrop) {
      appDrawer.classList.remove("open");
      drawerBackdrop.classList.remove("open");
    }
  }

  if (btnOpenDrawer) btnOpenDrawer.onclick = openDrawer;
  if (btnCloseDrawer) btnCloseDrawer.onclick = closeDrawer;
  if (drawerBackdrop) drawerBackdrop.onclick = closeDrawer;

  return { openDrawer, closeDrawer };
}

export function showThemedAlert(title, message, type = "info") {
  return new Promise((resolve) => {
    const modal = document.getElementById("appThemeDialogModal");
    const dTitle = document.getElementById("dialogTitle");
    const dMsg = document.getElementById("dialogMessage");
    const dInputWrap = document.getElementById("dialogInputWrap");
    const btnCancel = document.getElementById("btnDialogCancel");
    const btnConfirm = document.getElementById("btnDialogConfirm");
    const iconBox = document.getElementById("dialogIconBox");

    if (!modal) return resolve(true);

    dTitle.textContent = title;
    dMsg.textContent = message;
    dInputWrap.classList.add("hidden");
    btnCancel.classList.add("hidden");
    btnConfirm.textContent = "Mengerti";

    let iconSvg = `<svg style="color:var(--brand-accent); width:42px; height:42px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    if (type === "error") {
      iconSvg = `<svg style="color:var(--brand-danger); width:42px; height:42px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    }
    iconBox.innerHTML = iconSvg;

    dialogCancelCallback = null;
    dialogResolveCallback = () => {
      modal.classList.remove("open");
      dialogResolveCallback = null;
      resolve(true);
    };

    modal.classList.add("open");
  });
}

export function showThemedConfirm(title, message, confirmText = "Lanjutkan", cancelText = "Batal") {
  return new Promise((resolve) => {
    const modal = document.getElementById("appThemeDialogModal");
    const dTitle = document.getElementById("dialogTitle");
    const dMsg = document.getElementById("dialogMessage");
    const dInputWrap = document.getElementById("dialogInputWrap");
    const btnCancel = document.getElementById("btnDialogCancel");
    const btnConfirm = document.getElementById("btnDialogConfirm");
    const iconBox = document.getElementById("dialogIconBox");

    if (!modal) return resolve(false);

    dTitle.textContent = title;
    dMsg.textContent = message;
    dInputWrap.classList.add("hidden");
    btnCancel.classList.remove("hidden");
    btnCancel.textContent = cancelText;
    btnConfirm.textContent = confirmText;

    iconBox.innerHTML = `<svg style="color:var(--brand-warning); width:42px; height:42px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

    dialogCancelCallback = () => {
      modal.classList.remove("open");
      dialogResolveCallback = null;
      dialogCancelCallback = null;
      resolve(false);
    };

    btnCancel.onclick = dialogCancelCallback;

    dialogResolveCallback = () => {
      modal.classList.remove("open");
      dialogResolveCallback = null;
      dialogCancelCallback = null;
      resolve(true);
    };

    modal.classList.add("open");
  });
}

export function showThemedPrompt(title, message, defaultValue = "", placeholder = "") {
  return new Promise((resolve) => {
    const modal = document.getElementById("appThemeDialogModal");
    const dTitle = document.getElementById("dialogTitle");
    const dMsg = document.getElementById("dialogMessage");
    const dInputWrap = document.getElementById("dialogInputWrap");
    const dInputVal = document.getElementById("dialogInputVal");
    const btnCancel = document.getElementById("btnDialogCancel");
    const btnConfirm = document.getElementById("btnDialogConfirm");
    const iconBox = document.getElementById("dialogIconBox");

    if (!modal) return resolve(null);

    dTitle.textContent = title;
    dMsg.textContent = message;
    dInputWrap.classList.remove("hidden");
    dInputVal.value = defaultValue;
    dInputVal.placeholder = placeholder;
    btnCancel.classList.remove("hidden");
    btnCancel.textContent = "Batal";
    btnConfirm.textContent = "Kirim";

    iconBox.innerHTML = `<svg style="color:var(--brand-primary); width:42px; height:42px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;

    dialogCancelCallback = () => {
      modal.classList.remove("open");
      dialogResolveCallback = null;
      dialogCancelCallback = null;
      resolve(null);
    };

    btnCancel.onclick = dialogCancelCallback;

    dialogResolveCallback = () => {
      const res = dInputVal.value.trim();
      modal.classList.remove("open");
      dialogResolveCallback = null;
      dialogCancelCallback = null;
      resolve(res);
    };

    modal.classList.add("open");
    setTimeout(() => dInputVal.focus(), 150);
  });
}

export function getActiveTopScreen() {
  const appThemeDialogModal = document.getElementById("appThemeDialogModal");
  if (appThemeDialogModal && appThemeDialogModal.classList.contains("open")) return "themeDialog";

  const consoleEditModal = document.getElementById("consoleEditModal");
  if (consoleEditModal && consoleEditModal.classList.contains("open")) return "consoleEditModal";

  const paperWidthModal = document.getElementById("paperWidthModal");
  if (paperWidthModal && paperWidthModal.classList.contains("open")) return "paperWidthModal";

  const purchItemDetailModal = document.getElementById("purchItemDetailModal");
  if (purchItemDetailModal && purchItemDetailModal.classList.contains("open")) return "purchItemDetailModal";

  const exitConfirmModal = document.getElementById("exitConfirmModal");
  if (exitConfirmModal && exitConfirmModal.classList.contains("open")) return "exitConfirm";

  const discountModal = document.getElementById("discountModal");
  if (discountModal && discountModal.classList.contains("open")) return "discountModal";

  const opnamePicker = document.getElementById("opnameProductPickerScreen");
  if (opnamePicker && opnamePicker.classList.contains("active")) return "opnameProductPickerScreen";

  const purchProductPickerScreen = document.getElementById("purchProductPickerScreen");
  if (purchProductPickerScreen && purchProductPickerScreen.classList.contains("active")) return "purchProductPickerScreen";

  const posMemberPickerScreen = document.getElementById("posMemberPickerScreen");
  if (posMemberPickerScreen && posMemberPickerScreen.classList.contains("active")) return "posMemberPickerScreen";

  const addMemberModal = document.getElementById("addMemberModal");
  if (addMemberModal && addMemberModal.classList.contains("open")) return "addMemberModal";

  const purchasePageScreen = document.getElementById("purchasePageScreen");
  if (purchasePageScreen && purchasePageScreen.classList.contains("active")) return "purchasePageScreen";

  const editPurchaseModal = document.getElementById("editPurchaseModal");
  if (editPurchaseModal && editPurchaseModal.classList.contains("open")) return "editPurchaseModal";

  const stockOpnamePage = document.getElementById("stockOpnamePageScreen");
  if (stockOpnamePage && stockOpnamePage.classList.contains("active")) return "stockOpnamePageScreen";

  const categoryPageScreen = document.getElementById("categoryPageScreen");
  if (categoryPageScreen && categoryPageScreen.classList.contains("active")) return "categoryPage";

  const fastMovingScreen = document.getElementById("fastMovingPageScreen");
  if (fastMovingScreen && fastMovingScreen.classList.contains("active")) return "fastMovingScreen";

  const editTrxPageScreen = document.getElementById("editTrxPageScreen");
  if (editTrxPageScreen && editTrxPageScreen.classList.contains("active")) return "editTrxPage";

  const productPageScreen = document.getElementById("productPageScreen");
  if (productPageScreen && productPageScreen.classList.contains("active")) return "productPage";

  const payPageScreen = document.getElementById("payPageScreen");
  if (payPageScreen && payPageScreen.classList.contains("active")) return "payPage";

  const appDrawer = document.getElementById("appDrawer");
  if (appDrawer && appDrawer.classList.contains("open")) return "drawer";

  const orderPanel = document.getElementById("orderPanel");
  if (orderPanel && orderPanel.classList.contains("mobile-open")) return "mobileCart";

  if (state.activeMasterItSubMenuId !== null) return "masterItSub";
  if (state.activeMemberSubMenuId !== null) return "memberSub";
  if (state.activeInvSubMenuId !== null) return "invSub";
  if (state.activeFinSubMenuId !== null) return "finSub";
  if (state.activeSettingsSubMenuId !== null) return "settingsSub";

  if (state.currentViewId !== "view-pos") return "subView";

  return "root";
}

export function handleDeviceBackNavigation(callbacks = {}) {
  const topScreen = getActiveTopScreen();
  reinforceHistoryBarrier();

  switch (topScreen) {
    case "themeDialog":
      if (dialogCancelCallback) {
        dialogCancelCallback();
      } else if (dialogResolveCallback) {
        dialogResolveCallback();
      }
      break;
    case "consoleEditModal":
      document.getElementById("consoleEditModal")?.classList.remove("open");
      break;
    case "paperWidthModal":
      document.getElementById("paperWidthModal")?.classList.remove("open");
      break;
    case "purchItemDetailModal":
      document.getElementById("purchItemDetailModal")?.classList.remove("open");
      break;
    case "exitConfirm":
      document.getElementById("exitConfirmModal")?.classList.remove("open");
      break;
    case "discountModal":
      document.getElementById("discountModal")?.classList.remove("open");
      break;
    case "opnameProductPickerScreen":
      document.getElementById("opnameProductPickerScreen")?.classList.remove("active");
      break;
    case "purchProductPickerScreen":
      document.getElementById("purchProductPickerScreen")?.classList.remove("active");
      break;
    case "posMemberPickerScreen":
      document.getElementById("posMemberPickerScreen")?.classList.remove("active");
      break;
    case "addMemberModal":
      document.getElementById("addMemberModal")?.classList.remove("open");
      break;
    case "purchasePageScreen":
      document.getElementById("purchasePageScreen")?.classList.remove("active");
      break;
    case "editPurchaseModal":
      document.getElementById("editPurchaseModal")?.classList.remove("open");
      break;
    case "stockOpnamePageScreen":
      document.getElementById("stockOpnamePageScreen")?.classList.remove("active");
      break;
    case "categoryPage":
      document.getElementById("categoryPageScreen")?.classList.remove("active");
      break;
    case "fastMovingScreen":
      document.getElementById("fastMovingPageScreen")?.classList.remove("active");
      break;
    case "editTrxPage":
      document.getElementById("editTrxPageScreen")?.classList.remove("active");
      break;
    case "productPage":
      document.getElementById("productPageScreen")?.classList.remove("active");
      break;
    case "payPage":
      document.getElementById("payPageScreen")?.classList.remove("active");
      break;
    case "drawer":
      document.getElementById("appDrawer")?.classList.remove("open");
      document.getElementById("drawerBackdrop")?.classList.remove("open");
      break;
    case "mobileCart":
      document.getElementById("orderPanel")?.classList.remove("mobile-open");
      break;
    case "masterItSub":
      if (callbacks.closeMasterItSubMenu) callbacks.closeMasterItSubMenu();
      break;
    case "memberSub":
      if (callbacks.closeMemberSubMenu) callbacks.closeMemberSubMenu();
      break;
    case "invSub":
      if (callbacks.closeInvSubMenu) callbacks.closeInvSubMenu();
      break;
    case "finSub":
      if (callbacks.closeFinanceSubMenu) callbacks.closeFinanceSubMenu();
      break;
    case "settingsSub":
      if (callbacks.closeSettingsSubMenu) callbacks.closeSettingsSubMenu();
      break;
    case "subView":
      if (callbacks.switchView) callbacks.switchView("view-pos");
      break;
    case "root":
    default:
      document.getElementById("exitConfirmModal")?.classList.add("open");
      break;
  }
}

export function initGlobalDialogEvents(callbacks = {}) {
  window.addEventListener("popstate", () => {
    handleDeviceBackNavigation(callbacks);
  });

  const btnConfirm = document.getElementById("btnDialogConfirm");
  if (btnConfirm) {
    btnConfirm.onclick = () => {
      if (dialogResolveCallback) dialogResolveCallback();
    };
  }

  const dInputVal = document.getElementById("dialogInputVal");
  if (dInputVal) {
    dInputVal.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && dialogResolveCallback) {
        e.preventDefault();
        dialogResolveCallback();
      }
    });
  }

  const btnCancelExit = document.getElementById("btnCancelExit");
  if (btnCancelExit) {
    btnCancelExit.onclick = () => {
      document.getElementById("exitConfirmModal")?.classList.remove("open");
    };
  }

  const btnConfirmExit = document.getElementById("btnConfirmExit");
  if (btnConfirmExit) {
    btnConfirmExit.onclick = () => {
      allowAppExit = true;
      document.getElementById("exitConfirmModal")?.classList.remove("open");
      window.location.href = "about:blank";
    };
  }

  window.addEventListener("beforeunload", (e) => {
    if (allowAppExit) return;
    e.preventDefault();
    e.returnValue = "Aplikasi kasir sedang aktif. Yakin ingin memuat ulang?";
    return e.returnValue;
  });
}
