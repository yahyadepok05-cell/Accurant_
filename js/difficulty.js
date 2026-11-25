/* ============================================
   ACCURANT - DIFFICULTY.JS
   Tingkat kesulitan Pertarungan Bebas: Easy, Normal, Hard, Extreme.

   - statMult   : TIDAK DIPAKAI LAGI (selalu 1). Mulai Accurant 11, HP/ability
                  musuh tidak bertambah di tingkat apa pun. Yang naik hanya
                  kepintaran dan kenekatan AI (lihat enemyAI.js).
   - turnSeconds: batas waktu giliran PEMAIN (detik). 0 = tanpa timer.
                  Easy & Normal tanpa timer, Hard 10 detik, Extreme 5 detik. Waktu habis = giliran langsung berganti.
   - rewardMult : pengali hadiah koin & EXP.
   - ultLimit   : berapa kali satu musuh boleh pakai ulti (skill ke-6).
   - mistakeChance: peluang AI memilih opsi terbaik ke-2 (Hard).
   - aiLevel    : tingkat AI ("easy"/"normal"/"hard"/"extreme"); kalau
                  kosong dipakai nama key-nya.
   - itemScale  : pengali kekuatan item musuh (kalau kosong = statMult).
   - inventory  : item yang dibawa tim musuh (hanya Hard & Extreme).
   - itemsPerTurn / potionChance / artifactChance: seberapa sering dan
     seberapa yakin AI memakai Ramuan dan Artefak.

   Di Accurant Arena, mode Roster dan Roulette sama-sama TIDAK mengubah stat
   musuh. Roulette memilih lawan setara kedudukan pemain lewat aturan pita
   kedudukan per tingkat kesulitan (arena.js).
   ============================================ */

const DIFFICULTY_LEVELS = {
  easy: {
    key: "easy",
    label: "Easy",
    statMult: 1,
    turnSeconds: 0,
    rewardMult: 0.5,
    ultLimit: 1,
    description: "Musuh agak bodoh dan sering salah langkah. Tanpa timer giliran. Hadiah x0.5."
  },
  normal: {
    key: "normal",
    label: "Normal",
    statMult: 1,
    turnSeconds: 0,
    rewardMult: 1,
    ultLimit: 1,
    description: "Musuh membaca kondisi: memakai perisai, heal, dan stun. Hadiah x1."
  },
  hard: {
    key: "hard",
    label: "Hard",
    statMult: 1,
    turnSeconds: 10,
    rewardMult: 1.5,
    ultLimit: 2,
    mistakeChance: 0.15,
    costWeight: 0.5,
    healThreshold: 0.4,
    itemsPerTurn: 1,
    potionChance: 0.8,
    artifactChance: 0.35,
    inventory: {
      potion_heal: 3, potion_cure: 1, potion_mana: 1, splash_heal: 1,
      spell_barrier: 1, spell_revive: 1, spell_execute: 1
    },
    description: "Stat musuh tidak berubah, tetapi AI lebih pintar dan nekat: pandai memakai ramuan, ragu memakai artefak. Giliranmu dibatasi 10 detik. Hadiah x1.5."
  },
  extreme: {
    key: "extreme",
    label: "Extreme",
    statMult: 1,
    turnSeconds: 5,
    rewardMult: 2.5,
    ultLimit: 99,
    mistakeChance: 0,
    costWeight: 0.25,
    healThreshold: 0.5,
    itemsPerTurn: 2,
    potionChance: 1,
    artifactChance: 0.95,
    inventory: {
      potion_heal: 4, splash_heal: 2, potion_cure: 2, splash_cure: 1,
      potion_mana: 2, potion_attack_buff: 1, splash_poison: 1,
      spell_execute: 2, spell_barrier: 2, spell_revive: 1, spell_storm_stun: 1
    },
    description: "Stat musuh tidak berubah, tetapi AI paling pintar dan paling nekat, mahir memakai ramuan dan artefak. Giliranmu dibatasi 5 detik. Hadiah x2.5."
  }
};

const DIFFICULTY_ORDER = ["easy", "normal", "hard", "extreme"];

let currentDifficulty = null;     // key di atas, atau null
let freeBattleEnemyTeam = null;   // tim musuh untuk pertarungan ini (pilihan pemain / hasil Roulette)
let enemyInventory = {};          // itemId -> jumlah, item milik tim musuh

function getDifficultyConfig() {
  return currentDifficulty ? DIFFICULTY_LEVELS[currentDifficulty] : null;
}

/**
 * Dulu menaikkan HP, mana, dan attack unit musuh di Hard/Extreme.
 * Mulai Accurant 11 stat musuh TIDAK diubah (Roulette maupun Roster),
 * jadi fungsi ini sengaja tidak melakukan apa-apa. Namanya dipertahankan
 * supaya battle.js tidak perlu diubah.
 */
function applyDifficultyToEnemies(enemyUnits) {
  return;
}

/** Batas waktu giliran pemain (detik) untuk pertarungan ini. 0 = tanpa timer. */
function getTurnSeconds() {
  const cfg = getDifficultyConfig();
  return cfg && cfg.turnSeconds ? cfg.turnSeconds : 0;
}

function setupEnemyInventory() {
  const cfg = getDifficultyConfig();
  enemyInventory = (cfg && cfg.inventory) ? Object.assign({}, cfg.inventory) : {};
}