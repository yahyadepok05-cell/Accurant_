/* ACCURANT - sw.js
   Service worker supaya game bisa dipasang ke layar utama dan tetap jalan offline.
   - Saat dipasang, semua file inti langsung disimpan (precache), jadi offline
     sudah jalan sejak kunjungan pertama, bukan hanya file yang pernah dibuka.
   - Strategi: ambil dari internet dulu (update langsung terlihat), kalau gagal
     pakai salinan di cache.
   - NAIKKAN CACHE_VERSION setiap rilis supaya cache lama dibersihkan. */
const CACHE_VERSION = "v5";
const CACHE_NAME = "accurant-arena-" + CACHE_VERSION;

const CORE_FILES = [
  "./",
  "index.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "assets/lobby-poster.jpg",
  "css/arena-loading.css",
  "css/arena-menu.css",
  "css/arena-polish.css",
  "css/arena-ui.css",
  "css/fighters.css",
  "css/home.css",
  "css/shop-hub.css",
  "css/shop-regions.css",
  "css/style.css",
  "js/account.js",
  "js/ambience.js",
  "js/arena.js",
  "js/arenaFx.js",
  "js/arenaIntro.js",
  "js/bag.js",
  "js/banner.js",
  "js/battle.js",
  "js/battleMenu.js",
  "js/blackHole.js",
  "js/characters.js",
  "js/charactersExtra.js",
  "js/concepts.js",
  "js/craft.js",
  "js/difficulty.js",
  "js/emblems.js",
  "js/enemyAI.js",
  "js/fighters.js",
  "js/formation.js",
  "js/items.js",
  "js/main.js",
  "js/mechanics.js",
  "js/museum.js",
  "js/orientation.js",
  "js/potionArt.js",
  "js/potions.js",
  "js/progression.js",
  "js/selection.js",
  "js/shop.js",
  "js/shopHub.js",
  "js/shopRegions.js",
  "js/showcase.js",
  "js/storage.js",
  "js/systemEmblems.js",
  "js/uiPatches.js",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (c) {
      // Satu per satu: kalau satu file gagal, sisanya tetap tersimpan.
      return Promise.all(CORE_FILES.map(function (url) {
        return c.add(url).catch(function () { /* abaikan */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf("accurant-arena-") === 0 && k !== CACHE_NAME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  // Video & musik diminta per potongan (Range) dan tidak bisa disimpan di sini.
  if (/\.(mp4|mp3)(\?|$)/i.test(event.request.url)) return;
  event.respondWith(
    fetch(event.request).then(function (res) {
      // Hanya simpan jawaban yang berhasil (jangan simpan halaman error 404/500).
      if (res && res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(event.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(event.request, { ignoreSearch: true }).then(function (hit) {
        return hit || (event.request.mode === "navigate" ? caches.match("index.html") : undefined);
      });
    })
  );
});
