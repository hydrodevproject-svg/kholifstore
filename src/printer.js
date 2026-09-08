// src/printer.js
import { state } from "./state.js";
import { showThemedAlert } from "./ui.js";
import { showScanToast } from "./utils.js";

let bluetoothDevice = null;
let bluetoothCharacteristic = null;

export function initPrinterSettings() {
  const btnToggle = document.getElementById("btnToggleConnectBluetooth");
  if (btnToggle) {
    btnToggle.onclick = handleToggleBluetoothConnection;
  }

  const btnOpenPaperModal = document.getElementById("btnOpenPaperWidthModal");
  const paperModal = document.getElementById("paperWidthModal");
  const btnClosePaperModal = document.getElementById("btnClosePaperWidthModal");

  if (btnOpenPaperModal && paperModal) {
    btnOpenPaperModal.onclick = () => paperModal.classList.add("open");
  }

  if (btnClosePaperModal && paperModal) {
    btnClosePaperModal.onclick = () => paperModal.classList.remove("open");
  }

  document.querySelectorAll(".cat-select-card[data-val]").forEach((card) => {
    card.onclick = () => {
      const val = card.getAttribute("data-val");
      state.printerConfig.paperWidth = val;
      const selectWidth = document.getElementById("selectPaperWidth");
      const displayText = document.getElementById("selectedPaperWidthText");
      if (selectWidth) selectWidth.value = val;
      if (displayText) displayText.textContent = `Thermal ${val}`;
      paperModal?.classList.remove("open");
      showScanToast(`Ukuran kertas: ${val}`);
    };
  });

  const toggleAutoPrint = document.getElementById("toggleAutoPrint");
  if (toggleAutoPrint) {
    toggleAutoPrint.checked = state.printerConfig.autoPrint;
    toggleAutoPrint.onchange = (e) => {
      state.printerConfig.autoPrint = e.target.checked;
      showScanToast(e.target.checked ? "Auto-print diaktifkan" : "Auto-print dinonaktifkan");
    };
  }

  const btnTestPrint = document.getElementById("btnTestPrintReceipt");
  if (btnTestPrint) {
    btnTestPrint.onclick = () => {
      const sampleTrx = {
        id: "TEST-0001",
        time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        cashier: state.currentUser ? state.currentUser.name : "Kasir",
        member: null,
        items: [
          { name: "Tes Kertas Thermal", qty: 1, price: 1000, subtotal: 1000 }
        ],
        total: 1000,
        paymentMethod: "Tunai",
        status: "Sukses"
      };
      printThermalReceipt(sampleTrx);
    };
  }

  const btnAdvanceSystemPrint = document.getElementById("btnAdvanceSystemPrint");
  if (btnAdvanceSystemPrint) {
    btnAdvanceSystemPrint.onclick = () => {
      window.print();
    };
  }
}

async function handleToggleBluetoothConnection() {
  const lblName = document.getElementById("lblConnectedPrinterName");
  const badgeStatus = document.getElementById("badgeBluetoothStatus");
  const btnToggle = document.getElementById("btnToggleConnectBluetooth");

  if (bluetoothDevice && bluetoothDevice.gatt.connected) {
    bluetoothDevice.gatt.disconnect();
    bluetoothDevice = null;
    bluetoothCharacteristic = null;
    if (lblName) lblName.textContent = "Belum Ada Perangkat";
    if (badgeStatus) {
      badgeStatus.textContent = "Terputus";
      badgeStatus.style.background = "#fee2e2";
      badgeStatus.style.color = "var(--brand-danger)";
    }
    if (btnToggle) btnToggle.textContent = "Sambungkan Printer";
    showScanToast("Printer terputus");
    return;
  }

  if (!navigator.bluetooth) {
    await showThemedAlert("Bluetooth Tidak Didukung", "Peramban ini tidak mendukung Web Bluetooth API. Gunakan Chrome di Android.", "error");
    return;
  }

  try {
    showScanToast("Mencari printer bluetooth...");
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [
        { services: ["000018f0-0000-1000-8000-00805f9b34fb"] },
        { services: ["e7810a71-73ae-499d-8c15-faa9aef0c3f2"] }
      ],
      optionalServices: [
        "000018f0-0000-1000-8000-00805f9b34fb",
        "e7810a71-73ae-499d-8c15-faa9aef0c3f2"
      ]
    });

    const server = await bluetoothDevice.gatt.connect();
    let service;
    try {
      service = await server.getPrimaryService("000018f0-0000-1000-8000-00805f9b34fb");
    } catch (e) {
      service = await server.getPrimaryService("e7810a71-73ae-499d-8c15-faa9aef0c3f2");
    }

    const characteristics = await service.getCharacteristics();
    bluetoothCharacteristic = characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse);

    if (!bluetoothCharacteristic) {
      throw new Error("Karakteristik write printer tidak ditemukan.");
    }

    if (lblName) lblName.textContent = bluetoothDevice.name || "Thermal Printer";
    if (badgeStatus) {
      badgeStatus.textContent = "Terhubung";
      badgeStatus.style.background = "#dcfce7";
      badgeStatus.style.color = "#15803d";
    }
    if (btnToggle) btnToggle.textContent = "Putuskan Koneksi";
    showScanToast(`Terhubung ke ${bluetoothDevice.name}`);
  } catch (err) {
    console.warn("Gagal menyambung Bluetooth:", err);
    if (err.name !== "NotFoundError") {
      await showThemedAlert("Gagal Koneksi", err.message || "Gagal menghubungkan printer bluetooth.", "error");
    }
  }
}

export function generateReceiptRawText(trx) {
  const is80mm = state.printerConfig.paperWidth === "80mm";
  const lineWidth = is80mm ? 48 : 32;
  const divider = "-".repeat(lineWidth);

  let out = "";
  const center = (text) => {
    const pad = Math.max(0, Math.floor((lineWidth - text.length) / 2));
    return " ".repeat(pad) + text + "\n";
  };

  out += center("KHOLIF STORE");
  out += center("Suralaga, Lombok Timur");
  out += center("WA: 0878-6144-4070");
  out += divider + "\n";
  out += `No. Struk : ${trx.id}\n`;
  out += `Waktu     : ${trx.time}\n`;
  out += `Kasir     : ${trx.cashier}\n`;

  if (trx.member) {
    const memPhone = trx.member.phone || trx.member.wa || "";
    out += `Member    : ${trx.member.name}${memPhone ? ` (${memPhone})` : ""}\n`;
  }
  out += divider + "\n";

  if (trx.items && trx.items.length > 0) {
    trx.items.forEach((item) => {
      out += `${item.name}\n`;
      const qtyPrice = `  ${item.qty} x ${item.price.toLocaleString("id-ID")}`;
      const sub = `Rp ${item.subtotal.toLocaleString("id-ID")}`;
      const spaceLen = Math.max(1, lineWidth - qtyPrice.length - sub.length);
      out += qtyPrice + " ".repeat(spaceLen) + sub + "\n";
    });
  }

  out += divider + "\n";

  const printRow = (label, val) => {
    const spaceLen = Math.max(1, lineWidth - label.length - val.length);
    return label + " ".repeat(spaceLen) + val + "\n";
  };

  if (trx.discount && trx.discount > 0) {
    out += printRow("Diskon Potongan", `-Rp ${trx.discount.toLocaleString("id-ID")}`);
  }

  out += printRow("TOTAL TAGIHAN", `Rp ${trx.total.toLocaleString("id-ID")}`);
  out += printRow("Metode Bayar", trx.paymentMethod || "Tunai");
  out += divider + "\n";
  out += center("Terima Kasih Atas Kunjungan Anda");
  out += center("Barang yang dibeli tidak dapat ditukar");
  out += "\n\n\n";

  return out;
}

export function generateWhatsAppText(trx) {
  let text = `*NOTA PEMBELIAN - KHOLIF STORE*\n`;
  text += `Suralaga, Lombok Timur (0878-6144-4070)\n`;
  text += `----------------------------------------\n`;
  text += `No. Struk : *${trx.id}*\n`;
  text += `Waktu     : ${trx.time}\n`;
  text += `Kasir     : ${trx.cashier}\n`;

  if (trx.member) {
    const memPhone = trx.member.phone || trx.member.wa || "";
    text += `Pelanggan : *${trx.member.name}*${memPhone ? ` (${memPhone})` : ""}\n`;
  }

  text += `----------------------------------------\n`;

  if (trx.items && Array.isArray(trx.items)) {
    trx.items.forEach((it) => {
      text += `• *${it.name}*\n`;
      text += `  ${it.qty} x Rp ${it.price.toLocaleString("id-ID")} = Rp ${it.subtotal.toLocaleString("id-ID")}\n`;
    });
  }

  text += `----------------------------------------\n`;

  if (trx.discount && trx.discount > 0) {
    text += `Diskon Potongan : -Rp ${trx.discount.toLocaleString("id-ID")}\n`;
  }

  text += `*TOTAL TAGIHAN   : Rp ${trx.total.toLocaleString("id-ID")}*\n`;
  text += `Metode Pembayaran: ${trx.paymentMethod || "Tunai"}\n`;
  text += `----------------------------------------\n`;
  text += `_Terima kasih telah berbelanja di Kholif Store!_`;

  return encodeURIComponent(text);
}

export async function printThermalReceipt(trx) {
  const textPayload = generateReceiptRawText(trx);

  if (bluetoothCharacteristic && bluetoothDevice && bluetoothDevice.gatt.connected) {
    try {
      showScanToast("Mencetak nota...");
      const encoder = new TextEncoder();
      const data = encoder.encode(textPayload);
      const CHUNK_SIZE = 64;
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        await bluetoothCharacteristic.writeValue(chunk);
      }
      return;
    } catch (err) {
      console.warn("Gagal cetak direct bluetooth:", err);
    }
  }

  // Fallback ke sistem cetak dialog browser
  const printableArea = document.getElementById("printableReceiptArea");
  const printableWrapper = document.getElementById("printableReceiptWrapper");
  if (printableArea && printableWrapper) {
    printableArea.innerHTML = `<pre style="font-family: monospace; font-size: 11px; margin: 0;">${textPayload}</pre>`;
    printableWrapper.style.display = "block";
    window.print();
    printableWrapper.style.display = "none";
  }
}
