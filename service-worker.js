const CACHE_NAME = "gm-opening-tree-v10";
const ASSETS = [
  "./",
  "index.html",
  "editor.html",
  "games.html",
  "positions.html",
  "training.html",
  "repair.html",
  "random.html",
  "login.html",
  "styles.css",
  "manifest.json",
  "js/config.js",
  "js/config/supabase.js",
  "js/db.js",
  "js/board-tools.js",
  "js/chess-brain-utils.js",
  "js/ui-shell.js",
  "js/app.js",
  "js/games.js",
  "js/positions.js",
  "js/auth/login.js",
  "js/auth/only-me-guard.js",
  "vendor/supabase-js.min.js",
  "vendor/chess.min.js",
  "assets/icon.svg"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
