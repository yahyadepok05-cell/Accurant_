/* ============================================
   ACCURANT - STORAGE.JS  (Tahap 10)
   Penyimpanan progres ke localStorage browser.

   Yang disimpan: level/EXP/koin, Kesatria yang dibeli, isi tas item,
   dan formasi terakhir.

   PENGAMAN:
   - Semua akses storage dibungkus try/catch. Kalau storage tidak
     tersedia, game tetap jalan normal, cuma progres tidak tersimpan.
   - Data dicek satu per satu saat dimuat: id yang sudah tidak ada
     diabaikan, angka aneh diganti nilai awal, bagian yang kurang diisi
     nilai awal. Jadi mengubah kode game tidak merusak data lama.
   - Ada nomor versi (SAVE_VERSION) kalau suatu hari struktur berubah.
   - Data yang rusak tidak dihapus: disalin dulu ke SAVE_KEY + "_rusak".
   - Layar "Data": kode cadangan (salin/tempel) dan Reset Data.

   File ini dimuat PALING AKHIR di index.html.
   ============================================ */

const SAVE_KEY = "accurant_arena_save"; // beda dari game Petualangan supaya data tidak bertabrakan
const SAVE_VERSION = 1;
const BACKUP_PREFIX = "ARN1.";

let storageAvailable = false;
let lastSaveTime = null;
let loadNote = ""; // catatan kalau ada data lama yang bermasalah

function checkStorageAvailable() {
  try {
    const probe = "__accurant_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch (e) {
    return false;
  }
}

function toSafeInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Mengumpulkan semua progres jadi satu objek sederhana. */
function buildSaveData(includeAvatar) {
  const account = {
    name: playerAccount.name,
    level: playerAccount.level,
    exp: playerAccount.exp,
    coins: playerAccount.coins
  };
  if (includeAvatar !== false) account.avatar = playerAccount.avatar; // kode cadangan tanpa foto
  return {
    v: SAVE_VERSION,
    account: account,
    owned: ownedCharacterIds.slice(),
    inventory: Object.assign({}, playerInventory),
    formation: savedFormationIds.slice()
  };
}

/**
 * Memasang data ke game dengan pengecekan ketat.
 * @returns {{ok: boolean, msg: string}}
 */
function applySaveData(data) {
  if (!data || typeof data !== "object") return { ok: false, msg: "Data tidak valid." };
  if (typeof data.v !== "number") return { ok: false, msg: "Data tidak dikenali." };
  if (data.v > SAVE_VERSION) return { ok: false, msg: "Data dari versi game yang lebih baru." };

  // Akun
  const acc = data.account || {};
  playerAccount.level = toSafeInt(acc.level, 1, 9999, 1);
  playerAccount.exp = toSafeInt(acc.exp, 0, 1000000000, 0);
  // Kalau data koin tidak ada / bukan angka (misalnya save lama), pakai modal awal, bukan 0.
  const hasCoins = typeof acc.coins === "number" && Number.isFinite(acc.coins);
  playerAccount.coins = hasCoins ? toSafeInt(acc.coins, 0, 1000000000, STARTING_COINS) : STARTING_COINS;
  if (typeof acc.name === "string") playerAccount.name = cleanPlayerName(acc.name); // account.js
  if (typeof acc.avatar === "string") {
    const okAvatar = acc.avatar.indexOf("data:image/") === 0 && acc.avatar.length <= 100000;
    playerAccount.avatar = okAvatar ? acc.avatar : "";
  }

  // Kesatria yang dimiliki (hanya id yang masih ada & memang karakter elit)
  ownedCharacterIds.length = 0;
  (Array.isArray(data.owned) ? data.owned : []).forEach(function (id) {
    const ch = CHARACTER_DATABASE.find(function (c) { return c.id === id; });
    if (ch && ch.elite && ownedCharacterIds.indexOf(id) === -1) ownedCharacterIds.push(id);
  });

  // Item
  const inv = {};
  const rawInvLoaded = (data.inventory && typeof data.inventory === "object") ? data.inventory : {};
  const rawInv = migrateLegacyInventory(rawInvLoaded); // potions.js: id ramuan lama -> padanan baru
  Object.keys(rawInv).forEach(function (id) {
    if (getItemById(id)) {
      const n = toSafeInt(rawInv[id], 0, 999, 0);
      if (n > 0) inv[id] = n;
    }
  });
  playerInventory = inv;

  // Formasi terakhir (harus 4 karakter yang masih boleh dipakai)
  const usable = getAvailableCharacters().map(function (c) { return c.id; });
  const fm = Array.isArray(data.formation) ? data.formation : [];
  const fmOk = fm.length >= MIN_TEAM_SIZE && fm.length <= MAX_TEAM_SIZE && fm.every(function (id) { return usable.indexOf(id) !== -1; });
  savedFormationIds = fmOk ? fm.slice() : [];

  return { ok: true, msg: "OK" };
}

function saveGame() {
  if (!storageAvailable) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildSaveData(true)));
    lastSaveTime = new Date();
    return true;
  } catch (e) {
    storageAvailable = false; // misalnya penuh/diblokir; game tetap jalan
    return false;
  }
}

function loadGame() {
  if (!storageAvailable) return;
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return;
  }
  if (!raw) return;

  let result = { ok: false, msg: "Data rusak." };
  try {
    result = applySaveData(JSON.parse(raw));
  } catch (e) {
    result = { ok: false, msg: "Data rusak." };
  }

  if (!result.ok) {
    loadNote = "Data lama tidak bisa dibaca (" + result.msg + "), game mulai dari awal. Data lama disimpan di cadangan.";
    try { localStorage.setItem(SAVE_KEY + "_rusak", raw); } catch (e) { /* abaikan */ }
  }
}

function resetAllData() {
  playerAccount.name = DEFAULT_PLAYER_NAME;
  playerAccount.avatar = "";
  playerAccount.level = 1;
  playerAccount.exp = 0;
  playerAccount.coins = STARTING_COINS; // account.js
  ownedCharacterIds.length = 0;
  playerInventory = {};
  savedFormationIds = [];
  saveGame();
  updateAccountBar();
}

/* ---------- Kode cadangan ---------- */

function makeBackupCode() {
  const json = JSON.stringify(buildSaveData(false)); // foto profil tidak ikut (terlalu panjang)
  return BACKUP_PREFIX + btoa(unescape(encodeURIComponent(json)));
}

function readBackupCode(code) {
  const text = (code || "").trim();
  if (text.indexOf(BACKUP_PREFIX) !== 0) return { ok: false, msg: "Kode tidak dikenali." };
  try {
    const json = decodeURIComponent(escape(atob(text.slice(BACKUP_PREFIX.length))));
    return applySaveData(JSON.parse(json));
  } catch (e) {
    return { ok: false, msg: "Kode rusak atau terpotong." };
  }
}

/* ---------- Layar Data ---------- */

function setDataMessage(text) {
  document.getElementById("data-message").textContent = text;
}

function renderDataScreen() {
  const status = document.getElementById("data-status");
  if (!storageAvailable) {
    status.textContent = "Penyimpanan otomatis TIDAK tersedia di browser ini. Progres hilang kalau halaman ditutup. Pakai kode cadangan di bawah untuk menyimpan manual.";
  } else if (lastSaveTime) {
    status.textContent = "Penyimpanan otomatis aktif. Terakhir disimpan " + lastSaveTime.toLocaleTimeString() + ".";
  } else {
    status.textContent = "Penyimpanan otomatis aktif.";
  }
  setDataMessage(loadNote);
  resetArmed = false;
  document.getElementById("data-reset-btn").textContent = "🗑️ Reset Data";
}

let resetArmed = false;
let resetTimer = null;

document.getElementById("data-export-btn").addEventListener("click", function () {
  const code = makeBackupCode();
  const box = document.getElementById("data-code");
  box.value = code;
  try { box.focus(); box.select(); } catch (e) { /* abaikan */ }

  const manualMsg = "Kode dibuat. Tekan lama kotak di atas lalu pilih Salin, simpan di catatanmu.";
  setDataMessage(manualMsg);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(function () {
        setDataMessage("Kode dibuat dan disalin. Simpan di catatanmu.");
      }).catch(function () { /* izin ditolak: tetap pakai salin manual */ });
    }
  } catch (e) { /* abaikan */ }
});

document.getElementById("data-import-btn").addEventListener("click", function () {
  const result = readBackupCode(document.getElementById("data-code").value);
  if (result.ok) {
    saveGame();
    updateAccountBar();
    setDataMessage("Berhasil dimuat. Level " + playerAccount.level + ", " + playerAccount.coins + " Koin.");
  } else {
    setDataMessage("Gagal memuat: " + result.msg + " Progresmu yang sekarang tidak berubah.");
  }
});

document.getElementById("data-reset-btn").addEventListener("click", function () {
  const btn = document.getElementById("data-reset-btn");
  if (!resetArmed) {
    resetArmed = true;
    btn.textContent = "⚠️ Yakin? Tap lagi untuk hapus semua";
    clearTimeout(resetTimer);
    resetTimer = setTimeout(function () {
      resetArmed = false;
      btn.textContent = "🗑️ Reset Data";
    }, 4000);
    return;
  }
  clearTimeout(resetTimer);
  resetArmed = false;
  btn.textContent = "🗑️ Reset Data";
  resetAllData();
  setDataMessage("Semua data sudah dihapus. Kamu mulai dari awal.");
});

/* ---------- Mulai ---------- */

storageAvailable = checkStorageAvailable();
loadGame();
updateAccountBar();

// Simpan juga saat halaman ditutup/ditinggalkan, jaga-jaga.
window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") saveGame();
});
