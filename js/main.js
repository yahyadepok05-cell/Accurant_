/* ============================================
   ACCURANT ARENA - MAIN.JS
   Mengurus perpindahan antar layar: Beranda, Menu Arena,
   Seleksi karakter, Arena pertarungan, dan Hasil pertarungan.
   Logika pertarungan ada di battle.js, aturan mode & hadiah di arena.js.
   ============================================ */

function hideAllScreens() {
  document.getElementById("home-screen").classList.add("hidden");
  document.getElementById("arena-menu-screen").classList.add("hidden");
  document.getElementById("shop-screen").classList.add("hidden");
  document.getElementById("collection-screen").classList.add("hidden");
  document.getElementById("museum-screen").classList.add("hidden");
  document.getElementById("data-screen").classList.add("hidden");
  document.getElementById("settings-screen").classList.add("hidden");
  document.getElementById("home-note").classList.add("hidden");
  document.getElementById("selection-screen").classList.add("hidden");
  document.getElementById("battle-screen").classList.add("hidden");
  document.getElementById("result-screen").classList.add("hidden");
  document.getElementById("battle-log").classList.add("hidden");
}

function goToShopScreen() {
  hideAllScreens();
  document.getElementById("shop-screen").classList.remove("hidden");
  resetShopView(); // ada di shop.js (selalu mulai dari menu Toko)
  renderShopScreen(); // ada di shop.js
  updateAccountBar(); // ada di account.js
}

function goToCollectionScreen() {
  hideAllScreens();
  document.getElementById("collection-screen").classList.remove("hidden");
  renderShowcase(document.getElementById("collection-list"), "collection"); // showcase.js (langsung, tanpa lewat formation.js)
}

function goToMuseumScreen() {
  hideAllScreens();
  document.getElementById("museum-screen").classList.remove("hidden");
  renderMuseumScreen(); // ada di museum.js
}

function goToDataScreen() {
  hideAllScreens();
  document.getElementById("data-screen").classList.remove("hidden");
  renderDataScreen(); // ada di storage.js
}

function goToSettingsScreen() {
  hideAllScreens();
  document.getElementById("settings-screen").classList.remove("hidden");
}

/**
 * Browser tidak mengizinkan halaman menutup dirinya sendiri, jadi tombol
 * Keluar menyimpan progres lalu memberi tahu pemain untuk menutup halaman.
 */
function onExitClick() {
  if (typeof saveGame === "function") saveGame(); // storage.js
  try { window.close(); } catch (e) { /* biasanya diblokir browser */ }
  const note = document.getElementById("home-note");
  note.textContent = "Progres tersimpan. Tutup halaman ini untuk keluar.";
  note.classList.remove("hidden");
}

function goToHomeScreen() {
  hideAllScreens();
  document.getElementById("home-screen").classList.remove("hidden");
  updateAccountBar(); // ada di account.js
}

/**
 * Dipanggil oleh selection.js setelah pemain memilih tim dan menekan
 * tombol mulai. Musuh (freeBattleEnemyTeam) sudah disiapkan oleh
 * selection.js: pilihan pemain (Roster) atau hasil sistem (Roulette).
 *
 * @param {Array} chosenTeam - 1-4 karakter yang dipilih, urutannya
 *                             sesuai urutan tap pemain (index 0 = slot teratas)
 */
function startBattle(chosenTeam) {
  saveCurrentFormation(chosenTeam.map(c => c.id)); // ada di formation.js

  // Simpan pengaturan battle ini supaya tombol "Ulang" bisa mengulangnya persis sama.
  lastBattle = {
    team: chosenTeam,
    mode: arenaMode,
    difficulty: currentDifficulty,
    freeEnemy: freeBattleEnemyTeam
  };

  // Pengali hadiah dihitung sekali di awal (arena.js).
  arenaRewardInfo = computeArenaRewardInfo(chosenTeam, freeBattleEnemyTeam);

  hideAllScreens();
  document.getElementById("battle-screen").classList.remove("hidden");
  document.getElementById("battle-log").classList.remove("hidden");

  // initBattle ada di battle.js: dia yang menyiapkan tim musuh,
  // status HP/mana awal, urutan giliran, dan menggambar arena.
  initBattle(chosenTeam, freeBattleEnemyTeam);
}

/* ============================================
   LAYAR HASIL: Menu Arena / Ulang / Kembali ke Beranda
   ============================================ */

// Pengaturan battle terakhir (tim, mode, kesulitan, musuh).
let lastBattle = null;

/** Kembali ke Menu Arena untuk memilih mode lagi. */
function onResultArena() {
  goToArenaMenu(); // arena.js
}

/** Ulangi battle yang sama dengan tim dan musuh yang sama. */
function onResultRetry() {
  if (!lastBattle) { goToHomeScreen(); return; }
  arenaMode = lastBattle.mode;
  currentDifficulty = lastBattle.difficulty;
  freeBattleEnemyTeam = lastBattle.freeEnemy;
  startBattle(lastBattle.team);
}

function onResultHome() {
  arenaMode = null;
  arenaRewardInfo = null;
  currentDifficulty = null;
  freeBattleEnemyTeam = null;
  goToHomeScreen();
}

document.getElementById("home-shop-btn").addEventListener("click", goToShopScreen);
document.getElementById("home-collection-btn").addEventListener("click", goToCollectionScreen);
document.getElementById("home-museum-btn").addEventListener("click", goToMuseumScreen);
document.getElementById("home-settings-btn").addEventListener("click", goToSettingsScreen);
document.getElementById("settings-back-btn").addEventListener("click", goToHomeScreen);
document.getElementById("home-exit-btn").addEventListener("click", onExitClick);
document.getElementById("home-data-btn").addEventListener("click", goToDataScreen);
document.getElementById("data-back-btn").addEventListener("click", goToHomeScreen);
document.getElementById("museum-back-btn").addEventListener("click", goToHomeScreen);
document.getElementById("shop-back-btn").addEventListener("click", function () {
  onShopBack(); // shop.js: dari sub-menu ke menu Toko, dari menu Toko ke Beranda
});
document.getElementById("collection-back-btn").addEventListener("click", goToHomeScreen);
// Dibungkus fungsi: onSelectionBack ada di selection.js yang dimuat SETELAH main.js.
document.getElementById("selection-back-btn").addEventListener("click", function () {
  onSelectionBack(); // selection.js
});
document.getElementById("result-arena-btn").addEventListener("click", onResultArena);
document.getElementById("result-retry-btn").addEventListener("click", onResultRetry);
document.getElementById("result-home-btn").addEventListener("click", onResultHome);
