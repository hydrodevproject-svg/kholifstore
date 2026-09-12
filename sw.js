// sw.js - Service Worker Kholif Store POS
const CACHE_NAME = "kholif-pos-cache-v2026-v15";

const APP_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./logo.png",
  "./logo-maskable.png",
  "./manifest.json",
  "./firebase-config.js",
  "./css/style.css",
  "./css/variables.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/pos.css",
  "./css/modals.css",
  "./css/print.css",
  "./src/app.js",
  "./src/state.js",
  "./src/ui.js",
  "./src/pos.js",
  "./src/inventory.js",
  "./src/purchases.js",
  "./src/members.js",
  "./src/reports.js",
  "./src/finance.js",
  "./src/printer.js",
  "./src/db-local.js",
  "./src/utils.js",
  "./views/pos.html",
  "./views/members.html",
  "./views/purchases.html",
  "./views/inventory.html",
  "./views/reports.html",
  "./views/finance.html",
  "./views/setting.html",
  "./views/modals.html"
];

// 1. Pemasangan Cache Awal
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of APP_SHELL_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`Aset dilewati saat pra-cache: ${asset}`, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// 2. Pembersihan Cache Versi Lama
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Strategi Network First dengan Fallback Cache
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Abaikan permintaan keluar ke Firestore, Firebase, dan Google APIs
  if (
    req.method !== "GET" ||
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("gstatic.com")
  ) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(req, { ignoreSearch: true }).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (req.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
      })
  );
});
