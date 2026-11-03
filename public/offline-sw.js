const CACHE = "groupgrub-offline-v2";
const ASSETS = ["/offline.html", "/offline-game.js"];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("groupgrub-offline-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then((cached) => cached || fetch(event.request)));
    return;
  }
  if (event.request.mode === "navigate")
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
});
