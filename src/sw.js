const CACHE = "ops-crypt-ltc-v2";
const ASSETS = ["./", "./index.html", "./styles.css", "./main.js", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = e.request.url;
  if (/litecoinspace|blockcypher|blockchair|coinbase|coingecko|fonts\.|googleapis/.test(u)) return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
