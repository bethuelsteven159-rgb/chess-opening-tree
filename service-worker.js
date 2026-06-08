const CACHE_NAME = "gm-opening-tree-v12";
const PIECE_ASSETS = [
  "assets/pieces/classic/wK.svg",
  "assets/pieces/classic/wQ.svg",
  "assets/pieces/classic/wR.svg",
  "assets/pieces/classic/wB.svg",
  "assets/pieces/classic/wN.svg",
  "assets/pieces/classic/wP.svg",
  "assets/pieces/classic/bK.svg",
  "assets/pieces/classic/bQ.svg",
  "assets/pieces/classic/bR.svg",
  "assets/pieces/classic/bB.svg",
  "assets/pieces/classic/bN.svg",
  "assets/pieces/classic/bP.svg",
  "assets/pieces/high-contrast/wK.svg",
  "assets/pieces/high-contrast/wQ.svg",
  "assets/pieces/high-contrast/wR.svg",
  "assets/pieces/high-contrast/wB.svg",
  "assets/pieces/high-contrast/wN.svg",
  "assets/pieces/high-contrast/wP.svg",
  "assets/pieces/high-contrast/bK.svg",
  "assets/pieces/high-contrast/bQ.svg",
  "assets/pieces/high-contrast/bR.svg",
  "assets/pieces/high-contrast/bB.svg",
  "assets/pieces/high-contrast/bN.svg",
  "assets/pieces/high-contrast/bP.svg"
];

const SCRIPT_ASSETS = [
  "js/config.js",
  "js/config/supabase.js",
  "js/db.js",
  "js/board-tools.js",
  "js/board-appearance.js",
  "js/review-utils.js",
  "js/game-analysis-utils.js",
  "js/navigation-state.js",
  "js/chess-brain-utils.js",
  "js/support-utils.js",
  "js/ui-shell.js",
  "js/app.js",
  "js/dashboard.js",
  "js/games.js",
  "js/positions.js",
  "js/training.js",
  "js/repair.js",
  "js/support.js",
  "js/auth/login.js",
  "js/auth/only-me-guard.js"
];

const ASSETS = [
  "./",
  "index.html",
  "editor.html",
  "games.html",
  "positions.html",
  "training.html",
  "repair.html",
  "support.html",
  "random.html",
  "login.html",
  "styles.css",
  "manifest.json",
  "vendor/supabase-js.min.js",
  "vendor/chess.min.js",
  "assets/icon.svg",
  ...SCRIPT_ASSETS,
  ...PIECE_ASSETS
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
