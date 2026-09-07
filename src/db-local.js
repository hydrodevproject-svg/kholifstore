// src/db-local.js
// Driver penyimpanan lokal IndexedDB berkas asli tanpa library eksternal

const DB_NAME = "KholifStoreDB";
const DB_VERSION = 1;
const STORE_NAME = "app_state_store";

let dbInstance = null;

export function initLocalDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onerror = (e) => {
      console.error("Gagal membuka IndexedDB:", e.target.error);
      reject(e.target.error);
    };
  });
}

export async function getLocalItem(key, fallbackValue = null) {
  try {
    const db = await initLocalDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        resolve(req.result !== undefined ? req.result : fallbackValue);
      };

      req.onerror = () => {
        resolve(fallbackValue);
      };
    });
  } catch (err) {
    console.warn(`Gagal membaca ${key} dari IndexedDB:`, err);
    return fallbackValue;
  }
}

export async function setLocalItem(key, value) {
  try {
    const db = await initLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`Gagal menulis ${key} ke IndexedDB:`, err);
    return false;
  }
}

export async function removeLocalItem(key) {
  try {
    const db = await initLocalDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    return false;
  }
}
