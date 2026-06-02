const CACHE_NAME = "gm-opening-tree-v2";
const ASSETS = [
  "./",
  "index.html",
  "random.html",
  "styles.css",
  "manifest.json",
  "js/config.js",
  "js/db.js",
  "js/app.js",
  "js/random.js",
  "assets/icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", event => {
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
