// src/utils.js
import { state } from "./state.js";
import { showThemedAlert, showThemedPrompt } from "./ui.js";

let globalAudioCtx = null;

export function getAudioContext() {
  if (!globalAudioCtx) {
    globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (globalAudioCtx.state === "suspended") {
    globalAudioCtx.resume();
  }
  return globalAudioCtx;
}

export function playScannerBeep(isSuccess = true) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = isSuccess ? "sine" : "sawtooth";
    osc.frequency.setValueAtTime(isSuccess ? 1800 : 300, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isSuccess ? 0.1 : 0.2));
    osc.start();
    osc.stop(ctx.currentTime + (isSuccess ? 0.1 : 0.2));
  } catch (e) {}
}

export function playCashChime() {
  try {
    const ctx = getAudioContext();
    [587.33, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.35);
      osc.start(ctx.currentTime + idx * 0.1);
      osc.stop(ctx.currentTime + idx * 0.1 + 0.35);
    });
  } catch (e) {}
}

export function showScanToast(msg) {
  let toast = document.getElementById("scanToastPill");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "scanToastPill";
    toast.className = "scan-toast";
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>${msg}</span>`;
  toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toast.classList.remove("show"), 1400);
}

export function formatRupiah(num) {
  return "Rp " + (Number(num) || 0).toLocaleString("id-ID");
}

export function debounce(fn, delay = 100) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function normalizePhoneNumber(raw) {
  let clean = String(raw || "").replace(/\D/g, "");
  if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  } else if (clean.startsWith("8")) {
    clean = "62" + clean;
  }
  return clean;
}

export async function hashPassword(text) {
  if (!text) return "";
  const encoder = new TextEncoder();
  const data = encoder.encode(String(text));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Otorisasi Biometrik WebAuthn (Fingerprint / Face Unlock / Screen PIN) untuk Admin & Master IT
export async function authenticateBiometrics(actionName = "Otorisasi Keamanan") {
  if (!state.currentUser) {
    await showThemedAlert("Akses Ditolak", "Silakan login terlebih dahulu.", "error");
    return false;
  }

  const role = state.currentUser.role;
  if (role !== "admin" && role !== "master_it") {
    await showThemedAlert("Otoritas Terbatas", "Hanya akun dengan tingkatan Admin atau Master IT yang berhak mengeksekusi aksi ini.", "error");
    return false;
  }

  // 1. Cek ketersediaan sensor biometrik perangkat
  if (window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
    try {
      const isBiometricAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (isBiometricAvailable) {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const userId = new Uint8Array(16);
        window.crypto.getRandomValues(userId);

        showScanToast("Pindai sidik jari / wajah Anda...");

        const credential = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: "Kholif Store POS" },
            user: {
              id: userId,
              name: state.currentUser.username || "admin",
              displayName: state.currentUser.name || "Administrator"
            },
            pubKeyCredParams: [
              { alg: -7, type: "public-key" },  // ES256
              { alg: -257, type: "public-key" } // RS256
            ],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              userVerification: "required"
            },
            timeout: 60000
          }
        });

        if (credential) {
          playScannerBeep(true);
          showScanToast("Biometrik Terverifikasi");
          return true;
        }
      }
    } catch (err) {
      if (err.name === "NotAllowedError") {
        showScanToast("Verifikasi biometrik dibatalkan");
        return false;
      }
      console.warn("Sensor biometrik tidak merespons, beralih ke password:", err);
    }
  }

  // 2. Fallback keamanan: Verifikasi kata sandi akun Admin / IT
  const enteredPass = await showThemedPrompt(
    "Otorisasi Akun " + role.toUpperCase(),
    `Sensor biometrik tidak aktif. Masukkan kata sandi akun ${state.currentUser.name} untuk memproses "${actionName}":`,
    "",
    "Ketik kata sandi akun..."
  );

  if (!enteredPass) {
    showScanToast("Otorisasi dibatalkan");
    return false;
  }

  const hashedEntered = await hashPassword(enteredPass.trim());
  const dbUser = state.accountsDB.find((a) => a.username.toLowerCase() === state.currentUser.username.toLowerCase());

  if (dbUser && (dbUser.password === enteredPass.trim() || dbUser.password === hashedEntered)) {
    playScannerBeep(true);
    showScanToast("Otorisasi Sandi Berhasil");
    return true;
  }

  await showThemedAlert("Password Salah", "Kata sandi yang dimasukkan salah! Tindakan keamanan dibatalkan.", "error");
  return false;
}
