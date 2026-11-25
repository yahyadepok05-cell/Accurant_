/* ============================================
   ACCURANT ARENA - ACCOUNT.JS
   Level akun, EXP akun, koin, dan perhitungan hadiah
   setelah menang pertarungan. Disimpan ke HP oleh storage.js.
   ============================================ */

const DEFAULT_PLAYER_NAME = "Pemain";
const STARTING_COINS = 0; // modal akun baru: 0 koin. Pemain pemula memilih 1 dari 3 karakter gratis (uiPatches.js)

let playerAccount = {
  name: DEFAULT_PLAYER_NAME,
  avatar: "", // foto profil dari galeri (data URL kecil), kosong = ikon bawaan
  level: 1,
  exp: 0,
  coins: STARTING_COINS
};

// Id karakter elit yang sudah dibeli di Toko.
let ownedCharacterIds = [];

/**
 * EXP yang dibutuhkan untuk naik dari level tertentu ke level berikutnya.
 * Sengaja dibuat sederhana: makin tinggi level, makin banyak EXP yang perlu.
 */
function expNeededForLevel(level) {
  return level * 100;
}

/**
 * Menghitung hadiah koin & EXP berdasarkan performa pemain di pertarungan
 * yang baru selesai (dipanggil HANYA saat menang).
 */
function calculateBattleRewards() {
  const playerUnits = allUnits.filter(function (u) { return u.team === "player"; });
  const aliveCount = playerUnits.filter(function (u) { return u.alive; }).length;
  const totalMaxHP = playerUnits.reduce(function (sum, u) { return sum + u.maxHP; }, 0);
  const totalCurrentHP = playerUnits.reduce(function (sum, u) { return sum + u.currentHP; }, 0);
  const hpPercent = totalMaxHP > 0 ? totalCurrentHP / totalMaxHP : 0;
  const perfect = aliveCount === playerUnits.length;

  const baseCoins = 100;
  const aliveBonusCoins = aliveCount * 20;
  const hpBonusCoins = Math.round(hpPercent * 60);
  const perfectBonusCoins = perfect ? 50 : 0;
  const efficiencyBonusCoins = Math.max(0, 20 - totalPlayerTurns); // makin sedikit aksi, makin besar bonus
  const rawCoins = baseCoins + aliveBonusCoins + hpBonusCoins + perfectBonusCoins + efficiencyBonusCoins;

  const baseExp = 30;
  const aliveBonusExp = aliveCount * 5;
  const perfectBonusExp = perfect ? 15 : 0;
  const rawExp = baseExp + aliveBonusExp + perfectBonusExp;

  // Pengali hadiah dari arena.js (mode Roulette / Roster, kesulitan, dan
  // keseimbangan jumlah/kekuatan tim). Dihitung sekali saat pertarungan dimulai.
  const cfg = getDifficultyConfig(); // difficulty.js
  const info = (typeof arenaRewardInfo !== "undefined" && arenaRewardInfo) ? arenaRewardInfo : null;
  const mult = info ? info.mult : (cfg ? cfg.rewardMult : 1);
  const totalCoins = Math.max(1, Math.round(rawCoins * mult));
  const totalExp = Math.max(1, Math.round(rawExp * mult));

  return {
    coins: totalCoins,
    exp: totalExp,
    aliveCount: aliveCount,
    totalCount: playerUnits.length,
    hpPercent: hpPercent,
    perfect: perfect,
    efficiencyBonusCoins: efficiencyBonusCoins,
    difficultyLabel: cfg ? cfg.label : null,
    rewardMult: Math.round(mult * 100) / 100,
    modeLabel: info ? info.modeLabel : null,
    balanceNote: info ? info.note : null
  };
}

/**
 * Menambahkan koin & EXP ke akun, dan memproses naik level kalau EXP cukup.
 * @returns {boolean} true kalau akun naik level
 */
function addAccountRewards(coins, exp) {
  playerAccount.coins += coins;
  playerAccount.exp += exp;

  let leveledUp = false;
  while (playerAccount.exp >= expNeededForLevel(playerAccount.level)) {
    playerAccount.exp -= expNeededForLevel(playerAccount.level);
    playerAccount.level += 1;
    leveledUp = true;
  }
  if (typeof saveGame === "function") saveGame(); // storage.js
  return leveledUp;
}

function handleBattleWin() {
  const reward = calculateBattleRewards();
  const leveledUp = addAccountRewards(reward.coins, reward.exp);
  showResultScreen(true, reward, leveledUp);
}

function handleBattleLoss() {
  showResultScreen(false, null, false);
}

/**
 * Menampilkan layar hasil pertarungan (menang atau kalah) beserta rincian hadiah.
 */
function showResultScreen(won, reward, leveledUp) {
  document.getElementById("battle-log").classList.add("hidden");

  const title = document.getElementById("result-title");
  const stats = document.getElementById("result-stats");

  title.textContent = won ? "Kamu Menang!" : "Kamu Kalah";
  title.className = "result-title " + (won ? "result-win" : "result-lose");

  let html = "";
  if (won) {
    if (reward.modeLabel) {
      html += "<p>" + reward.modeLabel + " · hadiah x" + reward.rewardMult + "</p>";
      if (reward.balanceNote) html += "<p class='result-note'>" + reward.balanceNote + "</p>";
    }
    html += "<p>Karakter hidup: " + reward.aliveCount + "/" + reward.totalCount + "</p>";
    html += "<p>Sisa HP tim: " + Math.round(reward.hpPercent * 100) + "%</p>";
    if (reward.perfect) {
      html += "<p class='result-perfect'>Kemenangan sempurna! Tidak ada karakter yang kalah.</p>";
    }
    html += "<p class='result-reward'>+" + reward.coins + " Koin" + "</p>";
    html += "<p class='result-reward'>+" + reward.exp + " EXP Akun</p>";
    if (leveledUp) {
      html += "<p class='result-levelup'>Level Akun naik jadi " + playerAccount.level + "!</p>";
    }
  } else {
    html += "<p>Timmu kalah. Tidak ada hadiah untuk pertarungan ini.</p>";
  }
  stats.innerHTML = html;

  updateAccountBar();
  const modal = document.getElementById("result-modal");
  if (modal) modal.className = "result-modal " + (won ? "result-modal-win" : "result-modal-lose");
  document.getElementById("result-screen").classList.remove("hidden");
}

/**
 * Memperbarui seluruh tampilan akun: foto profil, nama, bar EXP, dan koin
 * (Beranda dan Toko).
 */
function updateAccountBar() {
  const need = expNeededForLevel(playerAccount.level);
  const pct = Math.max(0, Math.min(100, Math.round((playerAccount.exp / need) * 100)));

  const level = document.getElementById("avatar-level");
  if (level) level.textContent = "Lv. " + playerAccount.level;

  const fill = document.getElementById("exp-fill");
  if (fill) fill.style.width = pct + "%";

  const expText = document.getElementById("exp-text");
  if (expText) expText.textContent = "EXP " + playerAccount.exp + "/" + need;

  const nameInput = document.getElementById("player-name-input");
  if (nameInput && document.activeElement !== nameInput) nameInput.value = playerAccount.name;

  const avatar = document.getElementById("avatar-img");
  if (avatar) {
    avatar.innerHTML = "";
    if (playerAccount.avatar) {
      const img = document.createElement("img");
      img.src = playerAccount.avatar;
      img.alt = "Foto profil";
      avatar.appendChild(img);
    } else {
      avatar.textContent = "👤";
    }
  }


  ["home-coin-display", "shop-coin-display", "arena-coin-display"].forEach(function (id) {
    const box = document.getElementById(id);
    if (!box) return;
    box.innerHTML = "";
    box.appendChild(createCoinLabel(playerAccount.coins)); // emblems.js
  });
}

/* ---------- Profil: ganti nama & foto dari galeri ---------- */

function cleanPlayerName(text) {
  const name = String(text || "").trim().slice(0, 16);
  return name || DEFAULT_PLAYER_NAME;
}

(function setupProfileControls() {
  const nameInput = document.getElementById("player-name-input");
  const avatarBtn = document.getElementById("avatar-btn");
  const fileInput = document.getElementById("avatar-file");
  if (!nameInput || !avatarBtn || !fileInput) return;

  nameInput.addEventListener("change", function () {
    playerAccount.name = cleanPlayerName(nameInput.value);
    nameInput.value = playerAccount.name;
    if (typeof saveGame === "function") saveGame(); // storage.js
  });
  nameInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") nameInput.blur();
  });

  avatarBtn.addEventListener("click", function () {
    fileInput.click();
  });

  fileInput.addEventListener("change", function () {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        // Dipotong persegi dari tengah, dikecilkan jadi 128x128
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const side = Math.min(img.width, img.height);
        canvas.getContext("2d").drawImage(
          img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size
        );
        try {
          playerAccount.avatar = canvas.toDataURL("image/jpeg", 0.8);
        } catch (err) {
          return;
        }
        if (typeof saveGame === "function") saveGame(); // storage.js
        updateAccountBar();
      };
      img.src = reader.result;
      fileInput.value = ""; // supaya foto yang sama bisa dipilih lagi
    };
    reader.readAsDataURL(file);
  });
})();