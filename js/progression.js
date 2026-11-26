/* ============================================
   ACCURANT ARENA - PROGRESSION.JS
   Kurva progres seperti game pada umumnya:
     - Awal main terasa MANIS: musuh lebih lemah, hadiah lebih besar.
     - Makin tinggi level akun, musuh makin kuat dan AI-nya makin pintar,
       jadi karakter kuat pun tidak lagi menang tanpa usaha.
     - Karakter TIDAK di-nerf. Yang naik hanya sisi musuh.
     - Kedudukan tinggi baru terlihat (Toko, Museum, daftar lawan Roster) setelah
       level akun tertentu. Sebelum itu tampil "Belum tersedia".

   Dimuat PALING AKHIR (setelah uiPatches.js) karena membungkus fungsi dari
   banyak berkas lain. SEMUA angka yang bisa diubah ada di objek PROGRESSION.
   ============================================ */

const PROGRESSION = {
  // Level akun minimal agar kedudukan itu terlihat. Kedudukan yang tidak ada di sini
  // (mis. karakter lama tanpa kedudukan) selalu terlihat.
  unlockLevel: {
    Junior: 1, Senior: 1, Pluto: 1,
    Sovereign: 4, Aberation: 7, Master: 10, Abyss: 14,
    Vanguard: 18, Sentinel: 22, Devil: 26
  },

  // Bantuan pemula: koin & EXP x(1 + perLevel x (untilLevel + 1 - level)) sampai level ini.
  beginner: { untilLevel: 5, perLevel: 0.12 },

  // Kekuatan musuh (HP, ATK, DEF) menurut level akun.
  //   level 1 -> startMult, naik perLevelEarly tiap level sampai flatFromLevel (= x1,0),
  //   lalu naik perLevelLate tiap level sampai cap.
  scale: { startMult: 0.70, perLevelEarly: 0.06, flatFromLevel: 6, perLevelLate: 0.04, cap: 2.2 },

  // Pengali tambahan per kesulitan.
  diffScale: { easy: 0.9, normal: 1, hard: 1.08, extreme: 1.18 },

  // "Musuh mengenali gaya mainmu": memakai karakter / susunan tim yang sama terus
  // menerus membuat musuh lebih kuat. Berhenti kalau kamu mengganti karakter.
  adapt: {
    window: 10,        // dihitung dari 10 pertarungan terakhir (termasuk yang akan dimulai)
    freeUses: 3,       // satu karakter boleh dipakai sampai 3x tanpa efek
    perUse: 0.04,      // tiap pemakaian berikutnya: musuh +4%
    streakFree: 2,     // susunan tim yang persis sama berturut-turut: bebas sampai 2x
    perStreak: 0.04,   // lalu +4% per pertarungan beruntun
    streakCap: 0.12,
    cap: 0.40,         // batas total: musuh paling banyak +40%
    fromLevel: 6       // di bawah level ini tidak ada efek (awal main tetap manis)
  },

  // Level akun di mana AI musuh naik satu tingkat kepintaran (Easy -> Normal -> Hard -> Extreme).
  aiBumpLevels: [12, 24]
};

const USAGE_KEY = "accurant_usage_v1";

/* ---------- Kedudukan terkunci per level ---------- */

function rankUnlockLevel(rank) {
  if (!rank) return 1;
  const v = PROGRESSION.unlockLevel[rank];
  return v === undefined ? 1 : v;
}

function isRankUnlocked(rank) {
  return playerAccount.level >= rankUnlockLevel(rank);
}

/** Karakter terlihat kalau kedudukannya sudah terbuka, atau sudah kamu miliki. */
function isCharacterVisible(c) {
  if (!c) return false;
  if (!c.elite) return true;
  return ownedCharacterIds.indexOf(c.id) !== -1 || isRankUnlocked(c.rank);
}

/** Nama kedudukan untuk ditampilkan: "???" kalau belum terbuka. */
function maskRank(rank) {
  return isRankUnlocked(rank) ? rank : "???";
}

/** Daftar kedudukan yang baru terbuka saat level naik dari `from` ke `to`. */
function ranksUnlockedBetween(from, to) {
  return Object.keys(PROGRESSION.unlockLevel).filter(function (r) {
    const L = PROGRESSION.unlockLevel[r];
    return L > from && L <= to;
  }).sort(function (a, b) { return PROGRESSION.unlockLevel[a] - PROGRESSION.unlockLevel[b]; });
}

rgCharsIn = (function (orig) { // shopRegions.js
  return function (regionId, rank) {
    return orig(regionId, rank).filter(isCharacterVisible);
  };
})(rgCharsIn);

getSelectableCharacters = (function (orig) { // selection.js
  return function () {
    return orig().filter(isCharacterVisible);
  };
})(getSelectableCharacters);

showcaseList = (function (orig) { // showcase.js
  return function () {
    return orig.apply(this, arguments).filter(isCharacterVisible);
  };
})(showcaseList);

buildMuseumPages = (function (orig) { // museum.js
  return function () {
    return orig().filter(function (p) { return p.kind !== "char" || isCharacterVisible(p.character); });
  };
})(buildMuseumPages);

buyCharacter = (function (orig) { // shop.js: jaga-jaga, kedudukan terkunci tidak bisa dibeli
  return function (characterId) {
    const c = CHARACTER_DATABASE.find(function (x) { return x.id === characterId; });
    if (c && !isCharacterVisible(c)) return;
    return orig(characterId);
  };
})(buyCharacter);


/* ---------- Kekuatan musuh ---------- */

function levelScale(level) {
  const s = PROGRESSION.scale;
  if (level < s.flatFromLevel) return s.startMult + s.perLevelEarly * (level - 1);
  return Math.min(s.cap, 1 + s.perLevelLate * (level - s.flatFromLevel));
}

/* Riwayat pemakaian karakter (disimpan terpisah dari data game utama). */
let usageHistory = (function () {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(Array.isArray).slice(-30) : [];
  } catch (e) { return []; }
})();

function saveUsageHistory() {
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(usageHistory.slice(-30))); } catch (e) { /* abaikan */ }
}

function teamKey(ids) { return ids.slice().sort().join("+"); }

/** Tambahan kekuatan musuh (0 - cap) karena kamu terus memakai karakter/tim yang sama. */
function computeAdapt(teamIds) {
  const a = PROGRESSION.adapt;
  if (playerAccount.level < a.fromLevel) return { value: 0, topId: null, topCount: 0 };
  const recent = usageHistory.slice(-(a.window - 1)).concat([teamIds]);
  const counts = {};
  recent.forEach(function (team) {
    team.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
  });
  let topId = null, topCount = 0;
  teamIds.forEach(function (id) { if ((counts[id] || 0) > topCount) { topCount = counts[id]; topId = id; } });

  const usePart = Math.max(0, topCount - a.freeUses) * a.perUse;
  let streak = 0;
  const key = teamKey(teamIds);
  for (let i = recent.length - 1; i >= 0 && teamKey(recent[i]) === key; i--) streak++;
  const streakPart = Math.min(a.streakCap, Math.max(0, streak - a.streakFree) * a.perStreak);
  return { value: Math.min(a.cap, usePart + streakPart), topId: topId, topCount: topCount };
}

let lastPressure = { scale: 1, levelPart: 1, diffPart: 1, adapt: 0, topName: "", active: false };

initBattle = (function (orig) {
  return function (chosenPlayerTeam, enemyCharacterOverride) {
    const ids = chosenPlayerTeam.map(function (c) { return c.id; });
    const arenaBattle = typeof arenaMode !== "undefined" && arenaMode && currentDifficulty;
    if (arenaBattle) {
      const ad = computeAdapt(ids);
      const top = ad.topId ? CHARACTER_DATABASE.find(function (c) { return c.id === ad.topId; }) : null;
      const levelPart = levelScale(playerAccount.level);
      const diffPart = PROGRESSION.diffScale[currentDifficulty] || 1;
      lastPressure = {
        scale: levelPart * diffPart * (1 + ad.value),
        levelPart: levelPart, diffPart: diffPart, adapt: ad.value,
        topName: top ? top.name : "", active: true
      };
    } else {
      lastPressure = { scale: 1, levelPart: 1, diffPart: 1, adapt: 0, topName: "", active: false };
    }

    orig(chosenPlayerTeam, enemyCharacterOverride);

    if (arenaBattle) {
      usageHistory.push(ids);
      usageHistory = usageHistory.slice(-30);
      saveUsageHistory();
      logMessage(pressureLogText());
    }
  };
})(initBattle);

function pressureLogText() {
  const p = lastPressure;
  const x = (Math.round(p.scale * 100) / 100).toFixed(2).replace(/0$/, "");
  if (p.scale < 1) return "🌱 Bantuan pemula: kekuatan musuh x" + x + " (Level akun " + playerAccount.level + ").";
  let t = "⚔️ Kekuatan musuh x" + x + " (Level akun " + playerAccount.level + ")";
  if (p.adapt > 0.005) t += " · musuh mengenali gaya mainmu" + (p.topName ? " (" + p.topName + ")" : "") + " +" + Math.round(p.adapt * 100) + "%";
  return t + ".";
}

/** Menaikkan/menurunkan HP, ATK, DEF musuh sesuai level akun (dipanggil initBattle di battle.js). */
applyDifficultyToEnemies = function (enemyUnits) {
  if (!lastPressure.active || Math.abs(lastPressure.scale - 1) < 0.001) return;
  const k = lastPressure.scale;
  enemyUnits.forEach(function (u) {
    u.maxHP = Math.max(1, Math.round(u.maxHP * k));
    u.currentHP = u.maxHP;
    u.baseAttack = Math.max(1, Math.round(u.baseAttack * k));
    u.baseDefense = Math.max(0, Math.round(u.baseDefense * k));
    if (u.maxEssence) u.maxEssence = Math.round(u.maxEssence * k);     // Mutation: mengikuti HP
    if (u.maxResonance) u.maxResonance = Math.round(u.maxResonance * k); // Confer: mengikuti HP
  });
};


/* ---------- AI musuh makin pintar di level tinggi ---------- */

function aiBumpedKey(key) {
  let bump = 0;
  PROGRESSION.aiBumpLevels.forEach(function (lv) { if (playerAccount.level >= lv) bump++; });
  const i = DIFFICULTY_ORDER.indexOf(key);
  if (i < 0) return key;
  return DIFFICULTY_ORDER[Math.min(DIFFICULTY_ORDER.length - 1, i + bump)];
}

decideEnemyAction = (function (orig) { // enemyAI.js (sudah dibungkus mechanics.js)
  return function (actor) {
    const real = currentDifficulty;
    if (real && typeof arenaMode !== "undefined" && arenaMode) {
      const bumped = aiBumpedKey(real);
      if (bumped !== real) currentDifficulty = bumped; // selama satu keputusan, AI berpikir sesuai tingkat yang lebih tinggi
    }
    try { return orig(actor); } finally { currentDifficulty = real; }
  };
})(decideEnemyAction);


/* ---------- Hadiah ---------- */

function beginnerBonus(level) {
  const b = PROGRESSION.beginner;
  return level <= b.untilLevel ? 1 + b.perLevel * (b.untilLevel + 1 - level) : 1;
}

calculateBattleRewards = (function (orig) { // account.js
  return function () {
    const r = orig();
    const level = playerAccount.level;
    // musuh lebih kuat -> hadiah lebih besar (dengan peredam), pemula dapat bonus
    const pressure = lastPressure.active ? Math.pow(Math.max(0.5, lastPressure.scale), 0.7) : 1;
    const f = beginnerBonus(level) * pressure;
    r.coins = Math.max(1, Math.round(r.coins * f));
    r.exp = Math.max(1, Math.round(r.exp * f));
    r.rewardMult = Math.round(r.rewardMult * f * 100) / 100;
    const note = lastPressure.active ? pressureLogText() : "";
    r.balanceNote = [r.balanceNote, note].filter(Boolean).join(" ");
    return r;
  };
})(calculateBattleRewards);

let lastNewRanks = [];
addAccountRewards = (function (orig) { // account.js
  return function () {
    const before = playerAccount.level;
    const up = orig.apply(this, arguments);
    lastNewRanks = ranksUnlockedBetween(before, playerAccount.level);
    return up;
  };
})(addAccountRewards);

showResultScreen = (function (orig) { // account.js
  return function (won) {
    try { stopPlayerTimer(); hideTurnControls(); } catch (e) { /* mechanics.js */ }
    const r = orig.apply(this, arguments);
    if (won && lastNewRanks.length > 0) {
      const stats = document.getElementById("result-stats");
      if (stats) {
        stats.innerHTML += "<p class='result-levelup'>🔓 Terbuka di Toko: kedudukan " + lastNewRanks.join(", ") + "!</p>";
      }
    }
    lastNewRanks = [];
    return r;
  };
})(showResultScreen);

if (typeof resetAllData === "function") { // storage.js: hapus data baru = riwayat pemakaian ikut dihapus
  resetAllData = (function (orig) {
    return function () {
      usageHistory = [];
      try { localStorage.removeItem(USAGE_KEY); } catch (e) { /* abaikan */ }
      return orig.apply(this, arguments);
    };
  })(resetAllData);
}