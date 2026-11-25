/* ============================================
   ACCURANT ARENA - ARENA.JS
   Inti game Arena:
   - Menu Arena: Roulette (lawan dipilih sistem) dan Roster (kamu pilih sendiri).
   - Roulette: sistem memilih lawan yang setara kedudukan timmu lewat aturan
               "pita kedudukan" per kesulitan (jumlah lawan TIDAK mengikuti
               jumlah karaktermu). Stat (HP/ATK) lawan TIDAK diubah.
   - Roster  : tim 1-4 karakter melawan musuh 1-4 karakter pilihanmu.
   - Hadiah  : dihitung dari mode, kesulitan, dan (di Roster) selisih kekuatan.

   Semua angka yang bisa kamu ubah ada di bagian "PENGATURAN" di bawah.
   ============================================ */

/* ---------- PENGATURAN ---------- */

// Pengali hadiah per kesulitan. Roulette sengaja lebih besar dari Roster.
const ROSTER_REWARD = { easy: 0.5, normal: 1, hard: 1.5, extreme: 2.5 };
const ROULETTE_REWARD = { easy: 0.75, normal: 1.25, hard: 2, extreme: 3.5 };

// Roster: batas pengali keseimbangan hadiah (musuh lemah -> kecil, musuh kuat -> besar).
const ROSTER_BALANCE_MIN = 0.2;
const ROSTER_BALANCE_MAX = 1.8;
const ROSTER_BALANCE_CURVE = 0.6; // makin kecil = selisih kekuatan makin tidak terasa

/* ---------- STATUS ARENA ---------- */

let arenaMode = null;        // "roulette" | "roster" | null
let arenaRewardInfo = null;  // {mult, modeLabel, note} untuk pertarungan yang sedang berjalan

const ARENA_MODE_NAME = { roulette: "Roulette", roster: "Roster" };

function arenaDifficultyLabel(key) {
  const cfg = DIFFICULTY_LEVELS[key];
  return cfg ? cfg.label : "";
}

function arenaModeLabel() {
  const name = ARENA_MODE_NAME[arenaMode] || "Arena";
  const diff = arenaDifficultyLabel(currentDifficulty);
  return diff ? name + " · " + diff : name;
}

/* ---------- KEKUATAN ---------- */

/** Kekuatan satu sisi: total HP x total serangan (makin banyak karakter, makin kuat). */
function sidePower(characters) {
  let hp = 0;
  let atk = 0;
  characters.forEach(function (c) { hp += c.maxHP; atk += c.attack; });
  return hp * atk;
}

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ---------- ROULETTE ---------- */

/*
 ATURAN ROULETTE (jumlah lawan tetap, tidak mengikuti jumlah karakter pemain)
 Urutan kedudukan (RANK_ORDER, charactersExtra.js):
   Junior < Senior < Sovereign < Aberation < Master < Abyss < Vanguard < Sentinel < Devil < Pluto

 Untuk pemain berkedudukan tertinggi Junior/Senior/Sovereign:
   Easy    : 4 lawan Junior.
   Normal  : 4 lawan Junior-Senior.
   Hard    : diacak, salah satu dari
               A) 4 lawan setara (Junior/Senior/Sovereign)
               B) 3 lawan satu kedudukan di atas timmu
               C) 2 lawan: 1 Master + 1 teman dari kedudukan di bawah Master
   Extreme : diacak, salah satu dari
               A) 2 Master + 2 Abyss
               B) 2 Abyss + 1 Vanguard
               C) 1 Vanguard + 1 Sentinel

 Untuk pemain berkedudukan lebih tinggi (Aberation ke atas): semua pita di atas
 digeser naik sebanyak (urutan kedudukan timmu - Sovereign) tingkat. Aturan ini
 ditampilkan di keterangan hadiah dan di catatan hasil pertarungan.

 Kalau sebuah kedudukan belum punya cukup karakter (mis. Abyss baru Regatta),
 kekurangannya dipinjam dari kedudukan terdekat. Lawan tidak pernah kembar.
*/

let rouletteNote = ""; // keterangan aturan Roulette untuk pertarungan terakhir
let rouletteBorrowed = false; // true kalau ada slot yang diisi dari kedudukan terdekat

function rankIndexOf(rank) {
  const i = RANK_ORDER.indexOf(rank); // charactersExtra.js
  return i < 0 ? 0 : i;
}

function clampRankIndex(i) {
  return Math.max(0, Math.min(RANK_ORDER.length - 1, i));
}

/** Kedudukan tertinggi di timmu (indeks di RANK_ORDER). */
function teamTopRankIndex(team) {
  let top = 0;
  team.forEach(function (c) { top = Math.max(top, rankIndexOf(c.rank)); });
  return top;
}

/**
 * Mengambil n karakter acak dari pita kedudukan `indices`, tanpa kembar.
 * Diutamakan yang bukan karakter timmu. Kalau kurang, dipinjam dari
 * kedudukan terdekat (yang lebih rendah didahulukan).
 */
function rouletteTake(indices, n, used, teamIds) {
  const out = [];
  const isFree = function (c) { return used.indexOf(c.id) === -1; };
  const pullFrom = function (rankIdx, allowTeam) {
    if (out.length >= n) return;
    shuffled(CHARACTER_DATABASE.filter(function (c) {
      return c.rank === RANK_ORDER[rankIdx] && isFree(c) && (allowTeam || teamIds.indexOf(c.id) === -1);
    })).forEach(function (c) {
      if (out.length < n && isFree(c)) { out.push(c); used.push(c.id); }
    });
  };

  // 1) pita utama: gabungan semua kedudukan di pita, diacak sekaligus
  const pool = shuffled(CHARACTER_DATABASE.filter(function (c) {
    return indices.indexOf(rankIndexOf(c.rank)) !== -1 && c.rank && isFree(c) && teamIds.indexOf(c.id) === -1;
  }));
  pool.forEach(function (c) { if (out.length < n) { out.push(c); used.push(c.id); } });

  // 2) kurang? pinjam dari kedudukan terdekat dengan pita
  if (out.length < n) {
    rouletteBorrowed = true;
    const center = indices.reduce(function (a, b) { return a + b; }, 0) / indices.length;
    const order = RANK_ORDER.map(function (_, i) { return i; }).sort(function (a, b) {
      const da = Math.abs(a - center), db = Math.abs(b - center);
      return da === db ? a - b : da - db; // seri: yang lebih rendah dulu
    });
    order.forEach(function (i) { pullFrom(i, false); });
  }
  // 3) masih kurang? boleh memakai karakter yang sama dengan milik timmu
  if (out.length < n) {
    RANK_ORDER.forEach(function (_, i) { pullFrom(i, true); });
  }
  return out;
}

/** Nama kedudukan untuk ditampilkan ke pemain ("???" kalau belum terbuka di level akunnya, progression.js). */
function shownRank(name) {
  return typeof maskRank === "function" ? maskRank(name) : name;
}

function rankNames(indices) {
  return indices.map(function (i) { return shownRank(RANK_ORDER[clampRankIndex(i)]); }).join("/");
}

/** Ringkasan lawan yang benar-benar terpilih, mis. "2 Junior + 2 Senior". */
function describeEnemyRanks(enemies) {
  const counts = {};
  const order = [];
  enemies.forEach(function (c) {
    const r = c.rank || "?";
    if (counts[r] === undefined) { counts[r] = 0; order.push(r); }
    counts[r] += 1;
  });
  order.sort(function (a, b) { return rankIndexOf(a) - rankIndexOf(b); });
  return order.map(function (r) { return counts[r] + " " + shownRank(r); }).join(" + ");
}

/**
 * Menyusun lawan Roulette sesuai aturan di atas.
 * @returns {{enemies: Array, note: string}}
 */
function buildRouletteEnemies(team) {
  const key = currentDifficulty || "normal";
  const top = teamTopRankIndex(team);
  const shift = Math.max(0, top - 2);                  // pita naik kalau timmu di atas Sovereign
  const sh = function (i) { return clampRankIndex(i + shift); };
  const teamIds = team.map(function (c) { return c.id; });
  const used = [];
  let enemies = [];
  let desc = "";
  rouletteBorrowed = false;

  if (key === "easy") {
    enemies = rouletteTake([sh(0)], 4, used, teamIds);
    desc = "4 lawan " + rankNames([sh(0)]);
  } else if (key === "normal") {
    enemies = rouletteTake([sh(0), sh(1)], 4, used, teamIds);
    desc = "4 lawan " + rankNames([sh(0), sh(1)]);
  } else if (key === "hard") {
    const roll = Math.floor(Math.random() * 3);
    if (roll === 0) {
      enemies = rouletteTake([sh(0), sh(1), sh(2)], 4, used, teamIds);
      desc = "4 lawan setara (" + rankNames([sh(0), sh(1), sh(2)]) + ")";
    } else if (roll === 1) {
      const above = clampRankIndex(top + 1);
      enemies = rouletteTake([above], 3, used, teamIds);
      desc = "3 lawan satu kedudukan di atasmu (" + RANK_ORDER[above] + ")";
    } else {
      enemies = rouletteTake([sh(4)], 1, used, teamIds)
        .concat(rouletteTake([sh(3)], 1, used, teamIds));
      desc = "2 lawan: 1 " + RANK_ORDER[sh(4)] + " + 1 teman dari " + RANK_ORDER[sh(3)];
    }
  } else { // extreme
    const roll = Math.floor(Math.random() * 3);
    if (roll === 0) {
      enemies = rouletteTake([sh(4)], 2, used, teamIds).concat(rouletteTake([sh(5)], 2, used, teamIds));
      desc = "2 " + RANK_ORDER[sh(4)] + " + 2 " + RANK_ORDER[sh(5)];
    } else if (roll === 1) {
      enemies = rouletteTake([sh(5)], 2, used, teamIds).concat(rouletteTake([sh(6)], 1, used, teamIds));
      desc = "2 " + RANK_ORDER[sh(5)] + " + 1 " + RANK_ORDER[sh(6)];
    } else {
      enemies = rouletteTake([sh(6)], 1, used, teamIds).concat(rouletteTake([sh(7)], 1, used, teamIds));
      desc = "1 " + RANK_ORDER[sh(6)] + " + 1 " + RANK_ORDER[sh(7)];
    }
  }

  desc = describeEnemyRanks(enemies); // sesuai lawan yang benar-benar terpilih (tidak ada pengulangan nama)
  let note = "Roulette " + arenaDifficultyLabel(key) + ": " + desc + ".";
  if (rouletteBorrowed) note += " Kedudukan itu belum cukup karakter, kekurangannya dipinjam dari kedudukan terdekat.";
  if (shift > 0) {
    note += " Kedudukan timmu (" + shownRank(RANK_ORDER[top]) + ") di atas " + shownRank("Sovereign") + ", jadi pita lawan digeser naik " + shift + " tingkat.";
  }
  rouletteNote = note;
  return { enemies: enemies, note: note };
}

/** Penjelasan singkat aturan Roulette untuk tim tertentu (dipakai keterangan di layar pilih tim). */
function describeRouletteRule(team) {
  const key = currentDifficulty || "normal";
  const top = teamTopRankIndex(team);
  const shift = Math.max(0, top - 2);
  const base = {
    easy: "4 lawan Junior",
    normal: "4 lawan Junior-Senior",
    hard: "acak: 4 setara / 3 satu kedudukan di atasmu / 2 lawan berkedudukan tinggi",
    extreme: "acak: 3-4 lawan berkedudukan sangat tinggi"
  }[key];
  return base + (shift > 0 ? " (pita digeser naik " + shift + " tingkat karena kedudukan timmu)" : "");
}

/* ---------- HADIAH ---------- */

/** Perbandingan kekuatan musuh : tim (tanpa pengali kesulitan). */
function rosterPowerRatio(team, enemies) {
  return sidePower(enemies) / Math.max(1, sidePower(team));
}

function rosterBalanceFactor(team, enemies) {
  const r = rosterPowerRatio(team, enemies);
  const f = Math.pow(r, ROSTER_BALANCE_CURVE);
  return Math.min(ROSTER_BALANCE_MAX, Math.max(ROSTER_BALANCE_MIN, f));
}

function rosterBalanceNote(ratio) {
  if (ratio < 0.5) return "Musuhmu jauh lebih lemah, hadiah dipotong.";
  if (ratio < 0.85) return "Musuhmu lebih lemah dari timmu, hadiah berkurang.";
  if (ratio <= 1.2) return "Kekuatan kedua tim seimbang.";
  if (ratio <= 2) return "Musuhmu lebih kuat dari timmu, hadiah bertambah.";
  return "Musuhmu jauh lebih kuat, hadiah besar.";
}

/**
 * Menghitung pengali hadiah untuk pertarungan yang akan dimulai.
 * @returns {{mult:number, modeLabel:string, note:string}}
 */
function computeArenaRewardInfo(team, enemies) {
  const key = currentDifficulty || "normal";
  if (arenaMode === "roulette") {
    return {
      mult: ROULETTE_REWARD[key] || 1,
      modeLabel: arenaModeLabel(),
      note: rouletteNote || "Lawan dipilih setara dengan kedudukan timmu."
    };
  }
  const base = ROSTER_REWARD[key] || 1;
  const ratio = rosterPowerRatio(team, enemies);
  const factor = rosterBalanceFactor(team, enemies);
  return {
    mult: Math.round(base * factor * 100) / 100,
    modeLabel: arenaModeLabel(),
    note: rosterBalanceNote(ratio)
  };
}

/** Teks hadiah singkat untuk kartu kesulitan. */
function arenaRewardText(key) {
  if (arenaMode === "roulette") return "Hadiah ×" + ROULETTE_REWARD[key];
  return "Hadiah dasar ×" + ROSTER_REWARD[key];
}

/* ---------- MENU ARENA ---------- */

function goToArenaMenu() {
  arenaMode = null;
  arenaRewardInfo = null;
  currentDifficulty = null;
  freeBattleEnemyTeam = null;
  hideAllScreens(); // main.js
  document.getElementById("arena-menu-screen").classList.remove("hidden");
  updateAccountBar(); // account.js
  const noChar = getAvailableCharacters().length === 0;
  document.getElementById("arena-menu-note").classList.toggle("hidden", !noChar);
  document.getElementById("arena-menu-cards").classList.toggle("is-locked", noChar);
}

function enterArenaMode(mode) {
  if (getAvailableCharacters().length === 0) {
    document.getElementById("arena-menu-note").classList.remove("hidden");
    return;
  }
  arenaMode = mode;
  currentDifficulty = null;
  freeBattleEnemyTeam = null;
  hideAllScreens(); // main.js
  document.getElementById("selection-screen").classList.remove("hidden");
  resetSelectionScreen(); // selection.js
}

document.getElementById("home-arena-btn").addEventListener("click", goToArenaMenu);
document.getElementById("arena-menu-back-btn").addEventListener("click", function () { goToHomeScreen(); }); // main.js
document.getElementById("arena-roulette-btn").addEventListener("click", function () { enterArenaMode("roulette"); });
document.getElementById("arena-roster-btn").addEventListener("click", function () { enterArenaMode("roster"); });
document.getElementById("arena-menu-shop-btn").addEventListener("click", function () { goToShopScreen(); }); // main.js