// src/printer.js
import { state, persistPrinterConfig } from "./state.js";
import { showScanToast } from "./utils.js";
import { showThemedAlert, reinforceHistoryBarrier } from "./ui.js";

let bleDevice = null;
let bleCharacteristic = null;

export function applyPrinterWidth(width) {
  state.printerConfig.paperWidth = width;
  document.documentElement.style.setProperty("--printer-paper-width", width);
  persistPrinterConfig();
}

// Koneksi Web Bluetooth ESC/POS
export async function connectBluetoothPrinter() {
  if (!navigator.bluetooth) {
    await showThemedAlert(
      "Bluetooth Tidak Didukung",
      "Peramban ini tidak mendukung Web Bluetooth. Pastikan Anda menggunakan Google Chrome di Android.",
      "error"
    );
    return false;
  }

  try {
    showScanToast("Mencari printer Bluetooth...");
    bleDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        "000018f0-0000-1000-8000-00805f9b34fb",
        "49535343-fe7d-4ae5-8fa9-9fafd205e455",
        "0000ffe0-0000-1000-8000-00805f9b34fb",
        "e7810a71-73ae-499d-8c15-faa9aef0c3f2"
      ]
    });

    const server = await bleDevice.gatt.connect();
    const services = await server.getPrimaryServices();

    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const c of characteristics) {
        if (c.properties.write || c.properties.writeWithoutResponse) {
          bleCharacteristic = c;
          break;
        }
      }
      if (bleCharacteristic) break;
    }

    if (!bleCharacteristic) {
      throw new Error("Karakteristik penulisan printer tidak ditemukan.");
    }

    updateBluetoothUI(true, bleDevice.name || "Printer Bluetooth");
    showScanToast(`Terhubung: ${bleDevice.name || "Printer"}`);
    return true;
  } catch (err) {
    console.error("Gagal koneksi Bluetooth:", err);
    updateBluetoothUI(false);
    if (err.name !== "NotFoundError") {
      await showThemedAlert("Koneksi Gagal", "Gagal menyambungkan printer: " + err.message, "error");
    }
    return false;
  }
}

export function disconnectBluetoothPrinter() {
  if (bleDevice && bleDevice.gatt.connected) {
    bleDevice.gatt.disconnect();
  }
  bleDevice = null;
  bleCharacteristic = null;
  updateBluetoothUI(false);
  showScanToast("Printer terputus");
}

function updateBluetoothUI(isConnected, name = "") {
  const badge = document.getElementById("badgeBluetoothStatus");
  const lblName = document.getElementById("lblConnectedPrinterName");
  const btn = document.getElementById("btnToggleConnectBluetooth");

  if (badge) {
    badge.textContent = isConnected ? "Terhubung" : "Terputus";
    badge.style.background = isConnected ? "#dcfce7" : "#fee2e2";
    badge.style.color = isConnected ? "#15803d" : "var(--brand-danger)";
  }
  if (lblName) {
    lblName.textContent = isConnected ? name : "Belum Ada Perangkat";
  }
  if (btn) {
    btn.textContent = isConnected ? "Putuskan Printer" : "Sambungkan Printer";
  }
}

function formatRow(left, right, maxLen = 32) {
  const spaceCount = maxLen - (left.length + right.length);
  if (spaceCount > 0) {
    return left + " ".repeat(spaceCount) + right + "\n";
  }
  return left + "\n" + " ".repeat(Math.max(0, maxLen - right.length)) + right + "\n";
}

async function sendRawBluetooth(dataBuffer) {
  if (!bleCharacteristic) return false;
  const CHUNK_SIZE = 50;
  for (let i = 0; i < dataBuffer.length; i += CHUNK_SIZE) {
    const chunk = dataBuffer.slice(i, i + CHUNK_SIZE);
    if (bleCharacteristic.properties.writeWithoutResponse) {
      await bleCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await bleCharacteristic.writeValue(chunk);
    }
  }
  return true;
}

export async function printThermalReceipt(trx) {
  if (bleCharacteristic && bleDevice && bleDevice.gatt.connected) {
    try {
      showScanToast("Mencetak nota via Bluetooth...");
      const maxCol = state.printerConfig.paperWidth === "80mm" ? 48 : 32;
      const encoder = new TextEncoder();
      let stream = "";

      stream += "\x1B\x40"; // ESC @ Reset
      stream += "\x1B\x61\x01"; // Rata tengah
      stream += "\x1B\x45\x01"; // Tebal ON
      stream += "KHOLIF STORE\n";
      stream += "\x1B\x45\x00"; // Tebal OFF
      stream += "Suralaga, Lombok Timur\n";
      stream += "WA: 087861444070\n";
      stream += "-".repeat(maxCol) + "\n";

      stream += "\x1B\x61\x00"; // Rata kiri
      stream += `No   : ${trx.id}\n`;
      stream += `Waktu: ${trx.time}\n`;
      stream += `Kasir: ${trx.cashier}\n`;
      if (trx.member) stream += `Member: ${trx.member.name}\n`;
      stream += "-".repeat(maxCol) + "\n";

      if (trx.items && trx.items.length > 0) {
        trx.items.forEach((item) => {
          const leftText = `${item.name} x${item.qty}`;
          const rightText = `Rp ${item.subtotal.toLocaleString("id-ID")}`;
          stream += formatRow(leftText, rightText, maxCol);
        });
      }
      stream += "-".repeat(maxCol) + "\n";

      if (trx.discount > 0) {
        stream += formatRow("Diskon Tunai:", `- Rp ${trx.discount.toLocaleString("id-ID")}`, maxCol);
      }
      stream += formatRow("TOTAL TAGIHAN:", `Rp ${trx.total.toLocaleString("id-ID")}`, maxCol);
      stream += formatRow("Metode:", trx.paymentMethod || "Tunai", maxCol);
      stream += "-".repeat(maxCol) + "\n";

      stream += "\x1B\x61\x01"; // Rata tengah
      stream += "Terima kasih telah berbelanja\ndi Kholif Store!\n\n\n\n";
      stream += "\x1D\x56\x01"; // GS V 1 Potong / Feed

      await sendRawBluetooth(encoder.encode(stream));
      showScanToast("Nota berhasil dicetak");
      return;
    } catch (err) {
      console.error("Gagal cetak Bluetooth:", err);
      showScanToast("Bluetooth gagal, membuka dialog cetak sistem...");
    }
  }

  // Fallback otomatis ke dialog printer bawaan OS / browser jika Bluetooth tidak terhubung
  printAdvanceSystemDialog(trx);
}

export function printAdvanceSystemDialog(trx) {
  const wrapper = document.getElementById("printableReceiptWrapper");
  const area = document.getElementById("printableReceiptArea");
  if (!wrapper || !area) return;

  let itemsHtml = "";
  if (trx.items && trx.items.length > 0) {
    itemsHtml = trx.items.map((i) => `
      <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
        <span>${i.name} x${i.qty}</span>
        <span>Rp ${Number(i.subtotal || 0).toLocaleString("id-ID")}</span>
      </div>
    `).join("");
  }

  area.innerHTML = `
    <div style="text-align:center; margin-bottom:8px;">
      <h3 style="margin:0; font-size:14px; font-weight:800;">KHOLIF STORE</h3>
      <p style="margin:2px 0; font-size:10px;">Suralaga, Lombok Timur</p>
      <p style="margin:0; font-size:10px;">WA: 087861444070</p>
    </div>
    <div style="border-top:1px dashed #000; border-bottom:1px dashed #000; padding:4px 0; margin-bottom:6px; font-size:10px;">
      <div>No: ${trx.id}</div>
      <div>Waktu: ${trx.time}</div>
      <div>Kasir: ${trx.cashier}</div>
      ${trx.member ? `<div>Member: ${trx.member.name}</div>` : ""}
    </div>
    <div style="margin-bottom:6px;">
      ${itemsHtml}
    </div>
    <div style="border-top:1px dashed #000; padding-top:4px; font-size:11px;">
      ${trx.discount > 0 ? `
      <div style="display:flex; justify-content:space-between; font-size:10px;">
        <span>Diskon Tunai:</span>
        <span>- Rp ${Number(trx.discount).toLocaleString("id-ID")}</span>
      </div>` : ""}
      <div style="display:flex; justify-content:space-between;">
        <strong>TOTAL:</strong>
        <strong>Rp ${Number(trx.total || 0).toLocaleString("id-ID")}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:10px; margin-top:2px;">
        <span>Metode:</span>
        <span>${trx.paymentMethod || "Tunai"}</span>
      </div>
    </div>
    <div style="text-align:center; margin-top:10px; font-size:9.5px;">
      Terima kasih telah berbelanja di Kholif Store!
    </div>
  `;

  wrapper.style.display = "block";
  window.print();
  setTimeout(() => {
    wrapper.style.display = "none";
  }, 1000);
}

export function generateWhatsAppText(trx) {
  let text = `*KHOLIF STORE*\nSuralaga, Lombok Timur\nWhatsApp: 087861444070\n`;
  text += `--------------------------------\n`;
  text += `No. Struk : ${trx.id}\n`;
  text += `Waktu     : ${trx.time}\n`;
  text += `Kasir     : ${trx.cashier}\n`;
  if (trx.member && trx.member.name) {
    text += `Member    : ${trx.member.name} (${trx.member.phone})\n`;
  }
  text += `--------------------------------\n`;
  if (trx.items && trx.items.length > 0) {
    trx.items.forEach((item) => {
      text += `• ${item.name} (${item.qty}x) = Rp ${item.subtotal.toLocaleString("id-ID")}\n`;
    });
  } else {
    text += `Total Pembelian: Rp ${trx.total.toLocaleString("id-ID")}\n`;
  }
  text += `--------------------------------\n`;
  if (trx.discount > 0) {
    text += `Diskon Tunai : - Rp ${trx.discount.toLocaleString("id-ID")}\n`;
  }
  text += `*TOTAL TAGIHAN: Rp ${trx.total.toLocaleString("id-ID")}*\n`;
  text += `Metode    : ${trx.paymentMethod || "Tunai"} ${trx.paymentMethod === "Piutang / Kasbon" ? "(Tempo)" : ""}\n`;
  text += `--------------------------------\n`;
  text += `_Terima kasih telah berbelanja di Kholif Store!_\n`;
  return encodeURIComponent(text);
}

function updatePaperWidthUI(width) {
  const labelText = width === "80mm" ? "Thermal 80mm" : "Thermal 58mm";
  const display = document.getElementById("selectedPaperWidthText");
  const hiddenInput = document.getElementById("selectPaperWidth");
  const opt58 = document.getElementById("optPaper58");
  const opt80 = document.getElementById("optPaper80");

  if (display) display.textContent = labelText;
  if (hiddenInput) hiddenInput.value = width;
  if (opt58) opt58.classList.toggle("active", width === "58mm");
  if (opt80) opt80.classList.toggle("active", width === "80mm");
}

function selectPaperWidthOption(val) {
  applyPrinterWidth(val);
  updatePaperWidthUI(val);
  showScanToast(`Ukuran kertas: Thermal ${val}`);
}

export function initPrinterSettings() {
  const currentWidth = state.printerConfig.paperWidth || "58mm";
  document.documentElement.style.setProperty("--printer-paper-width", currentWidth);
  updatePaperWidthUI(currentWidth);

  const btnConnect = document.getElementById("btnToggleConnectBluetooth");
  if (btnConnect) {
    btnConnect.onclick = () => {
      if (bleDevice && bleDevice.gatt.connected) {
        disconnectBluetoothPrinter();
      } else {
        connectBluetoothPrinter();
      }
    };
  }

  const btnOpenModal = document.getElementById("btnOpenPaperWidthModal");
  const modal = document.getElementById("paperWidthModal");
  const btnCloseModal = document.getElementById("btnClosePaperWidthModal");

  if (btnOpenModal && modal) {
    btnOpenModal.onclick = () => {
      updatePaperWidthUI(state.printerConfig.paperWidth || "58mm");
      modal.classList.add("open");
      reinforceHistoryBarrier();
    };
  }

  if (btnCloseModal && modal) {
    btnCloseModal.onclick = () => modal.classList.remove("open");
  }

  const opt58 = document.getElementById("optPaper58");
  const opt80 = document.getElementById("optPaper80");

  if (opt58) {
    opt58.onclick = () => {
      selectPaperWidthOption("58mm");
      modal?.classList.remove("open");
    };
  }

  if (opt80) {
    opt80.onclick = () => {
      selectPaperWidthOption("80mm");
      modal?.classList.remove("open");
    };
  }

  const toggleAutoPrint = document.getElementById("toggleAutoPrint");
  if (toggleAutoPrint) {
    toggleAutoPrint.checked = Boolean(state.printerConfig.autoPrint);
    toggleAutoPrint.onchange = () => {
      state.printerConfig.autoPrint = toggleAutoPrint.checked;
      persistPrinterConfig();
      showScanToast(state.printerConfig.autoPrint ? "Auto-print aktif" : "Auto-print mati");
    };
  }

  const btnTestPrintReceipt = document.getElementById("btnTestPrintReceipt");
  if (btnTestPrintReceipt) {
    btnTestPrintReceipt.onclick = () => {
      const now = new Date();
      const testTrx = {
        id: "TRX-TEST",
        time: `${now.toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })} • ${now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`,
        cashier: state.currentUser ? state.currentUser.name : "Master IT",
        total: 25000,
        discount: 1000,
        paymentMethod: "Tunai",
        items: [{ name: "Uji Coba Struk Kholif Store", qty: 1, subtotal: 26000 }]
      };
      printThermalReceipt(testTrx);
    };
  }

  const btnAdvanceSystemPrint = document.getElementById("btnAdvanceSystemPrint");
  if (btnAdvanceSystemPrint) {
    btnAdvanceSystemPrint.onclick = () => {
      const now = new Date();
      const testTrx = {
        id: "TRX-ADVANCE",
        time: `${now.toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })} • ${now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`,
        cashier: state.currentUser ? state.currentUser.name : "Master IT",
        total: 25000,
        discount: 0,
        paymentMethod: "Tunai",
        items: [{ name: "Uji Pratinjau Sistem OS", qty: 1, subtotal: 25000 }]
      };
      printAdvanceSystemDialog(testTrx);
    };
  }
}
