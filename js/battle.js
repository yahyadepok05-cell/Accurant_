/* ============================================
   ACCURANT - BATTLE.JS
   Semua logika pertarungan: giliran, pemilihan skill,
   pemilihan target, damage, healing, mana, status effect,
   dan kondisi menang/kalah.
   ============================================ */

// ===== STATE PERTARUNGAN (disimpan di sini selama battle berlangsung) =====
// CATATAN: tidak ada lagi "sudah beraksi ronde ini". Karakter boleh dipakai
// berkali-kali berturut-turut (diselingi giliran musuh), selama dia masih
// hidup, tidak sedang stun, dan punya skill yang mananya terjangkau.
let allUnits = [];          // seluruh unit (1-4 pemain + 1-4 musuh), termasuk yang sudah kalah
let currentPhase = "player"; // "player" atau "enemy" - giliran siapa sekarang
let battleEnded = false;
let totalPlayerTurns = 0;   // dipakai account.js untuk bonus hadiah "efisien"

let pendingActor = null;    // unit yang sedang dipilih pemain untuk beraksi
let pendingSkill = null;    // skill yang sedang dipilih, menunggu target (jika perlu)
let bonusUnitId = null;     // id unit yang sedang dapat GILIRAN EKSTRA dari Swiftness (potions.js)
let currentSkillCtx = null;     // { caster, skill, aliveFoes, dice } selama satu skill berjalan (dipakai calculateDamage)
let currentDamageSource = null; // siapa yang sedang memberi damage (unit, atau { team, label } untuk artefak) - dipakai banner "membunuh" (banner.js)


/* ============================================
   BAGIAN 1: MENYIAPKAN PERTARUNGAN
   ============================================ */

/**
 * Dipanggil dari main.js saat pemain selesai memilih tim.
 * @param {Array} chosenPlayerTeam - 4 karakter pilihan pemain, berurutan
 */
/**
 * @param {Array} chosenPlayerTeam - 4 karakter pilihan pemain
 * @param {Array|null} enemyCharacterOverride - tim musuh (1-4 karakter) dari
 *        Roster atau Roulette (arena.js). Kalau null/tidak diisi, dipakai
 *        cadangan: karakter lain yang tidak dipilih pemain.
 */
function initBattle(chosenPlayerTeam, enemyCharacterOverride) {
  const chosenIds = chosenPlayerTeam.map(c => c.id);

  const enemyCharacters = enemyCharacterOverride
    ? enemyCharacterOverride
    : CHARACTER_DATABASE.filter(c => !chosenIds.includes(c.id)).slice(0, 4);

  const playerUnits = chosenPlayerTeam.map(c => createRuntimeUnit(c, "player"));
  const enemyUnits = enemyCharacters.map(c => createRuntimeUnit(c, "enemy"));
  applyDifficultyToEnemies(enemyUnits); // difficulty.js (tidak berpengaruh di Perjalanan)
  setupEnemyInventory();                // difficulty.js

  allUnits = playerUnits.concat(enemyUnits);
  currentPhase = "player";
  battleEnded = false;
  totalPlayerTurns = 0;
  pendingActor = null;
  pendingSkill = null;
  bonusUnitId = null;

  hideEnemyThinking();
  clearBattleLog();
  if (typeof hideItemPanel === "function") hideItemPanel(true); // items.js: tas selalu mulai tertutup
  if (typeof clearBanners === "function") clearBanners();       // banner.js
  currentDamageSource = null;
  logMessage("Pertarungan dimulai! Giliran timmu.");

  renderArena();
}

/**
 * Mengubah data karakter (dari database) jadi "unit" yang punya
 * HP/mana saat ini, status efek, dan penanda hidup/mati.
 */
function createRuntimeUnit(character, team) {
  return {
    // PENTING: id unit di pertarungan ini TIDAK sama dengan id karakter
    // di database, tapi diberi awalan sesuai tim ("player_" / "enemy_").
    // Ini supaya tidak bentrok kalau pemain dan musuh kebetulan memakai
    // karakter yang sama persis (bisa terjadi di mode Perjalanan, karena
    // musuh stage sudah ditentukan tetap tapi pemain bebas memilih tim).
    // Tanpa ini, menyerang kartu musuh bisa salah sasaran mengenai
    // karakter pemain sendiri yang kebetulan id aslinya sama.
    id: team + "_" + character.id,
    characterId: character.id, // id asli di database, buat referensi kalau perlu
    name: character.name,
    icon: character.icon,
    iconSvg: character.iconSvg,
    image: character.image,
    team: team, // "player" atau "enemy"
    maxHP: character.maxHP,
    currentHP: character.maxHP,
    energy: character.energy || "mana", // "mana" atau "charge" (Artifact)
    maxMana: character.maxMana,
    currentMana: character.maxMana,
    baseAttack: character.attack,
    baseDefense: character.defense,
    baseSpeed: character.speed,
    skills: character.skills,
    alive: true,
    shield: 0,
    statusEffects: [], // { type, stat, percent, turnsLeft, amount }
    ultimateUsed: false // dipakai AI musuh untuk membatasi ulti 1x per pertarungan
  };
}

function getUnitById(id) {
  return allUnits.find(u => u.id === id);
}

function getAliveUnits(team) {
  return allUnits.filter(u => u.team === team && u.alive);
}


/* ============================================
   BAGIAN 2: STAT EFEKTIF & STATUS EFFECT
   ============================================ */

/**
 * Menghitung nilai attack/defense/speed unit SETELAH memperhitungkan
 * buff dan debuff yang sedang aktif.
 */
function getEffectiveStat(unit, statName) {
  let base = statName === "attack" ? unit.baseAttack
           : statName === "defense" ? unit.baseDefense
           : unit.baseSpeed;

  let totalPercent = 0;
  let flat = 0;
  unit.statusEffects.forEach(function (effect) {
    if (effect.stat === statName) {
      if (effect.type === "buff") totalPercent += effect.percent;
      if (effect.type === "debuff") totalPercent -= effect.percent;
      if (effect.type === "nerf") flat += effect.amount; // nerf angka tetap (Kaiser skill 6)
    }
  });

  return Math.max(1, Math.round(base * (1 + totalPercent) - flat));
}

/**
 * Regen mana dasar: 10% dari max mana di awal giliran timnya.
 * Aturan per sistem kekuatan (Charge, Energy, dst.) ada di mechanics.js
 * (regenerateManaAtTurnStart).
 */
const MANA_REGEN_PERCENT = 0.10;


/**
 * Dipanggil di awal giliran sebuah unit (sebelum ia boleh beraksi).
 * Menangani damage racun/bakar, stun, dan mengurangi sisa durasi status.
 * @returns {boolean} true jika unit ini harus melewati gilirannya (stun)
 */
function processStatusEffectsAtTurnStart(unit) {
  // Karakter beku: kebal damage, tidak ada racun/bakar, melewati giliran
  if (isFrozenUnit(unit)) {
    logMessage(unit.name + " masih beku, melewati giliran.");
    return true;
  }

  let mustSkipTurn = false;
  const fireProof = unit.statusEffects.some(function (e) { return e.type === "fireres"; });

  // Proses damage bertahap (burn/poison) dulu
  unit.statusEffects.forEach(function (effect) {
    if (effect.type === "dot") {
      if (effect.stat === "burn" && fireProof) {
        logMessage(unit.name + " kebal api, bakar tidak berefek.");
        return;
      }
      applyDamage(unit, effect.amount);
      const label = effect.stat === "burn" ? "terbakar" : "teracuni";
      logMessage(unit.name + " " + label + ", kena " + effect.amount + " damage.");
    }
    if (effect.type === "regen" && unit.alive) {
      applyHeal(unit, effect.amount);
      logMessage(unit.name + " beregenerasi +" + effect.amount + " HP.");
    }
    if (effect.type === "stun") {
      mustSkipTurn = true;
      logMessage(unit.name + " masih stun, melewati giliran.");
    }
    if (effect.type === "slow") {
      // Slowness: tiap giliran "tabungan lambat" bertambah (50% = 0,25 ; 100% = 0,5 ; 200% = 1).
      // Begitu penuh (>= 1), giliran itu hangus.
      effect.charge = (effect.charge || 0) + effect.percent / 2;
      if (effect.charge >= 1 - 1e-9) {
        effect.charge -= 1;
        mustSkipTurn = true;
        logMessage(unit.name + " terlalu lambat (Slow), kehilangan giliran!");
      }
    }
  });

  // Kurangi sisa durasi, buang status yang sudah habis.
  // Swiftness dihitung terpisah (setelah aksi selesai) di grantSwiftBonus.
  unit.statusEffects.forEach(function (effect) {
    if (effect.type === "swift") return;
    effect.turnsLeft -= 1;
  });
  unit.statusEffects = unit.statusEffects.filter(e => e.turnsLeft > 0);

  return mustSkipTurn;
}

/**
 * Menambahkan satu status effect baru ke unit (buff/debuff/dot/stun).
 * Untuk dot (burn/poison), besar damage per giliran dihitung sekali saat
 * dipasang, berdasarkan attack milik unit yang memasang efek ini.
 */
function applyStatusEffect(sourceUnit, targetUnit, effect) {
  // Aturan beku (concepts.js): skill karakter tidak bisa mengenai yang beku
  if (!canReceiveConcept(conceptOfEffect(effect.type), targetUnit, { kind: "skill" })) return;

  if (effect.type === "cleanse") {
    // Menghapus semua efek buruk (debuff, dot, stun) dari target
    targetUnit.statusEffects = targetUnit.statusEffects.filter(function (e) {
      return e.type !== "debuff" && e.type !== "dot" && e.type !== "stun" && e.type !== "slow";
    });
    logMessage(targetUnit.name + " dibersihkan dari efek buruk.");
    return;
  }

  if (effect.type === "stun") {
    const isSuccess = Math.random() < effect.chance;
    if (!isSuccess) {
      logMessage("Stun gagal mengenai " + targetUnit.name + ".");
      return;
    }
    targetUnit.statusEffects.push({ type: "stun", turnsLeft: effect.turns });
    logMessage(targetUnit.name + " terkena stun!");
    return;
  }

  if (effect.type === "freeze") {
    // Beku: kebal damage dan tidak bisa bermain selama masih ada teman yang
    // hidup dan tidak beku. Kalau sudah sendirian, tidak beku: langsung
    // kena damage pecah es.
    if (!targetUnit.alive || isFrozenUnit(targetUnit)) return;
    const shatter = Math.round(lastSkillDamage * effect.shatterPercent);
    const hasFreeFriends = allUnits.some(function (o) {
      return o.team === targetUnit.team && o.alive && o.id !== targetUnit.id && !isFrozenUnit(o);
    });

    if (!hasFreeFriends) {
      logMessage(targetUnit.name + " sendirian! Es pecah seketika (-" + shatter + " HP).");
      applyDamage(targetUnit, shatter);
      return;
    }

    targetUnit.statusEffects.push({ type: "frozen", shatterDamage: shatter, turnsLeft: 9999 });
    logMessage(targetUnit.name + " membeku! Kebal damage sampai semua temannya kalah.");
    return;
  }

  if (effect.type === "dot") {
    const amount = Math.round(getEffectiveStat(sourceUnit, "attack") * effect.percent);
    targetUnit.statusEffects.push({ type: "dot", stat: effect.stat, amount: amount, turnsLeft: effect.turns });
    return;
  }

  if (effect.type === "buff" || effect.type === "debuff") {
    targetUnit.statusEffects.push({ type: effect.type, stat: effect.stat, percent: effect.percent, turnsLeft: effect.turns });
    return;
  }
}


/* ============================================
   BAGIAN 3: DAMAGE, HEALING, SHIELD, MANA
   Semua dihitung lewat fungsi terpusat di sini supaya
   konsisten untuk semua skill dan semua karakter.
   ============================================ */

function isFrozenUnit(unit) {
  return unit.statusEffects.some(function (e) { return e.type === "frozen"; });
}

function applyDamage(unit, rawAmount) {
  if (isFrozenUnit(unit)) {
    logMessage(unit.name + " terbungkus es, damage tidak masuk.");
    return;
  }

  // Shield mutlak (concepts.js): semua damage ditolak total
  if (hasAbsoluteShield(unit)) {
    logMessage(unit.name + " dilindungi shield mutlak, damage tidak masuk.");
    return;
  }

  // Shield berangka menyerap damage duluan sebelum HP berkurang
  let remaining = absorbWithShields(unit, rawAmount); // concepts.js
  if (remaining <= 0) return; // habis diserap shield

  unit.currentHP = Math.max(0, unit.currentHP - remaining);

  if (unit.currentHP <= 0) {
    unit.alive = false;
    logMessage(unit.name + " telah kalah!");
    if (typeof announceKill === "function") announceKill(unit, currentDamageSource); // banner.js
  }
}

function applyHeal(unit, amount) {
  if (!unit.alive) return; // tidak bisa menyembuhkan yang sudah kalah
  if (unit.statusEffects.some(function (e) { return e.type === "antiheal"; })) {
    if (amount > 0) logMessage("🚫 " + unit.name + " tidak bisa disembuhkan (Tolak Heal).");
    return;
  }
  unit.currentHP = Math.min(unit.maxHP, unit.currentHP + amount);
}

function applyShield(unit, amount, options) {
  addShieldLayer(unit, amount, options); // concepts.js (jenis: amount / timed / absolute)
}

function applyManaRecovery(unit, amount) {
  unit.currentMana = Math.min(unit.maxMana, unit.currentMana + amount);
}

/**
 * Rumus damage utama: Attack efektif x pengali skill - setengah Defense efektif target,
 * minimal 1 supaya tidak pernah 0 atau negatif.
 */
function calculateDamage(attacker, defender, power) {
  const atk = getEffectiveStat(attacker, "attack");
  let def = getEffectiveStat(defender, "defense");
  let p = power;

  // Sifat skill yang sedang dipakai (diisi runSkill di mechanics.js)
  const ctx = currentSkillCtx;
  if (ctx && ctx.caster === attacker && ctx.skill) {
    const sk = ctx.skill;
    if (sk.ignoreDef) def = 0;                                         // menembus pertahanan
    if (sk.soloBonus && ctx.aliveFoes === 1) p *= 1 + sk.soloBonus;     // musuh tinggal 1
    if (sk.bonusVsDebuff && defender.statusEffects.some(function (e) { return e.type === "debuff" && e.stat === "defense"; })) {
      p *= 1 + sk.bonusVsDebuff;                                        // target sudah dikunci
    }
    if (ctx.diceMult) p *= ctx.diceMult;                                // hasil dadu (Garan skill 6)
  }

  const raw = atk * p - def * 0.5;
  return Math.max(1, Math.round(raw));
}

function calculateHeal(caster, power) {
  const atk = getEffectiveStat(caster, "attack");
  return Math.max(1, Math.round(atk * power));
}


/* ============================================
   BAGIAN 4: MENGGUNAKAN SKILL
   ============================================ */

/**
 * Menjalankan satu serangan skill ke satu target. Dipakai bersama oleh
 * giliran pemain dan giliran musuh. Mendukung:
 * - skill.execute { belowHP }: HP target di bawah batas -> langsung kalah
 *   (shield diabaikan); kalau tidak, jadi serangan biasa.
 * - skill.hits: hanya untuk teks log (power sudah total semua serangan).
 */
/** Batas HP eksekusi. Tanda kematian (Annerose skill 4) menaikkan batas Curse of Death +25% per tanda. */
function executeThreshold(skill, target) {
  let base = skill.execute.belowHP;
  if (skill.markExec) {
    const mark = target.statusEffects.find(function (e) { return e.type === "deathmark"; });
    if (mark) base = Math.round(base * (1 + DEATHMARK_STEP * mark.stacks));
  }
  return base;
}
const DEATHMARK_STEP = 0.25; // +25% per tanda
const DEATHMARK_MAX = 4;     // paling banyak 4 tanda (batas jadi 2x)

let lastSkillDamage = 0; // damage terakhir dari resolveAttackOnTarget (dipakai efek freeze)

function resolveAttackOnTarget(caster, skill, target) {
  currentDamageSource = caster; // pembunuh (kalau target kalah oleh serangan ini)
  try {
    resolveAttackOnTargetCore(caster, skill, target);
  } finally {
    currentDamageSource = null;
  }
}

function resolveAttackOnTargetCore(caster, skill, target) {
  lastSkillDamage = 0;

  if (skill.execute) {
    if (isFrozenUnit(target) || target.currentHP >= executeThreshold(skill, target)) {
      logMessage(caster.name + " memakai " + skill.name + " ke " + target.name + ", tapi syaratnya tidak terpenuhi. Skill hangus!");
      return;
    }
    logMessage(caster.name + " memakai " + skill.name + " ke " + target.name + ": EKSEKUSI!");
    applyDamage(target, target.currentHP + target.shield);
    return;
  }

  const dmg = calculateDamage(caster, target, skill.power);
  lastSkillDamage = dmg;
  applyDamage(target, dmg);
  const hitText = skill.hits > 1 ? ", " + skill.hits + " serangan" : "";
  logMessage(caster.name + " memakai " + skill.name + " ke " + target.name + " (-" + dmg + " HP" + hitText + ").");
}


/**
 * Menentukan daftar target yang valid untuk suatu skill, berdasarkan
 * field "target" di data skill.
 */
function getValidTargets(caster, skill) {
  return filterSkillTargets(skill, getValidTargetsRaw(caster, skill)); // concepts.js
}

function getValidTargetsRaw(caster, skill) {
  if (skill.target === "all_enemies") {
    return getAliveUnits(caster.team === "player" ? "enemy" : "player");
  }
  if (skill.target === "all_allies") {
    return getAliveUnits(caster.team);
  }
  if (skill.target === "self") {
    return [caster];
  }
  if (skill.target === "single_enemy") {
    return getAliveUnits(caster.team === "player" ? "enemy" : "player");
  }
  if (skill.target === "single_ally") {
    return getAliveUnits(caster.team);
  }
  return [];
}



/* ============================================
   BAGIAN 5: SISTEM GILIRAN
   Giliran bergantian SATU PER SATU: satu karakter pemain beraksi,
   lalu LANGSUNG satu karakter musuh beraksi, lalu balik ke pemain, dst.

   TIDAK ADA lagi larangan "sudah beraksi, tunggu yang lain dulu".
   Pemain boleh pakai karakter yang sama berkali-kali berturut-turut,
   selama karakter itu masih hidup, tidak stun, dan mananya cukup untuk
   minimal satu skill. Itu murni dibatasi sistem (HP, mana, status),
   bukan aturan giliran buatan.
   ============================================ */

/**
 * Dipanggil setiap kali satu karakter PEMAIN selesai mengambil gilirannya
 * (baik karena berhasil memakai skill, maupun karena mati/stun saat dipilih).
 */
function finishPlayerAction(unit, skipped) {
  const wasBonusAction = bonusUnitId !== null && unit && bonusUnitId === unit.id;
  bonusUnitId = null;
  totalPlayerTurns += 1;
  pendingActor = null;
  pendingSkill = null;
  hideSkillPanel();

  // Swiftness: aksi biasa mengisi "tabungan cepat"; kalau penuh, karakter yang
  // sama langsung main lagi tanpa giliran musuh. Aksi ekstra sendiri tidak mengisi
  // lagi (kalau tidak, efek 200% bisa berantai tanpa akhir).
  if (!skipped && !wasBonusAction && unit && grantSwiftBonus(unit)) {
    renderArena();
    return;
  }
  advanceTurn();
}

/**
 * Menambah tabungan Swiftness unit (percent/2 per aksi: 50% = tiap 4 aksi,
 * 100% = tiap 2 aksi, 200% = tiap aksi). Kalau penuh dan unit masih bisa
 * bertindak, unit mendapat satu aksi ekstra sekarang juga.
 * @returns {boolean} true jika aksi ekstra diberikan
 */
function grantSwiftBonus(unit) {
  const fx = unit.statusEffects.find(function (e) { return e.type === "swift"; });
  if (!fx || !unit.alive) return false;

  fx.charge = (fx.charge || 0) + fx.percent / 2;
  fx.turnsLeft -= 1;

  let grant = false;
  if (fx.charge >= 1 - 1e-9) {
    fx.charge -= 1;
    grant = true;
  }
  if (fx.turnsLeft <= 0) {
    unit.statusEffects = unit.statusEffects.filter(function (e) { return e !== fx; });
  }
  if (!grant) return false;

  const canAct = !isFrozenUnit(unit) && unit.skills.some(function (sk) { return sk.manaCost <= unit.currentMana; });
  if (!canAct) {
    logMessage(unit.name + " cepat, tapi tidak bisa bertindak lagi (mana/status).");
    return false;
  }

  bonusUnitId = unit.id;
  logMessage("⚡ " + unit.name + " bergerak lagi (Swiftness)! Giliran ekstra.");
  pendingActor = unit;
  pendingSkill = null;
  showSkillPanel(unit);
  return true;
}

/**
 * Dipanggil setiap kali satu karakter MUSUH selesai mengambil gilirannya.
 */
function finishEnemyAction(unit) {
  advanceTurn();
}

// Pergantian giliran (advanceTurn), giliran musuh (performOneEnemyTurn), menjalankan
// skill (executeSkill / runSkill) dan panel skill ada di mechanics.js.

// Lama musuh "berpikir" sebelum bertindak: 1300 ms di sini + 700 ms jeda
// di performOneEnemyTurn = sekitar 2 detik.
const ENEMY_THINK_DELAY = 1300;

function showEnemyThinking() {
  document.getElementById("enemy-thinking").classList.remove("hidden");
  document.body.classList.add("thinking-open");
}

function hideEnemyThinking() {
  document.getElementById("enemy-thinking").classList.add("hidden");
  document.body.classList.remove("thinking-open");
}




/**
 * Karakter beku yang semua temannya sudah kalah (atau ikut beku) akan
 * mencair: es pecah dan memberi damage tambahan.
 */
function processFreezeThaw() {
  let changed = false;
  allUnits.forEach(function (u) {
    if (!u.alive) return;
    const fx = u.statusEffects.find(function (e) { return e.type === "frozen"; });
    if (!fx) return;
    const hasFreeFriends = allUnits.some(function (o) {
      return o.team === u.team && o.alive && o.id !== u.id && !isFrozenUnit(o);
    });
    if (hasFreeFriends) return;

    u.statusEffects = u.statusEffects.filter(function (e) { return e.type !== "frozen"; });
    logMessage("Es yang membekukan " + u.name + " pecah! (-" + fx.shatterDamage + " HP)");
    applyDamage(u, fx.shatterDamage);
    changed = true;
  });
  if (changed) renderArena();
}

function checkBattleEnd() {
  if (battleEnded) return; // jaga-jaga supaya hadiah tidak diberikan dua kali

  processFreezeThaw();

  const playersAlive = getAliveUnits("player").length;
  const enemiesAlive = getAliveUnits("enemy").length;

  if (playersAlive === 0) {
    battleEnded = true;
    hideEnemyThinking();
    logMessage("=== KAMU KALAH ===");
    hideSkillPanel();
    hideItemPanel();
    handleBattleLoss(); // ada di account.js
  } else if (enemiesAlive === 0) {
    battleEnded = true;
    hideEnemyThinking();
    logMessage("=== KAMU MENANG! ===");
    hideSkillPanel();
    hideItemPanel();
    handleBattleWin(); // ada di account.js
  }
}


/* ============================================
   BAGIAN 6: INTERAKSI PEMAIN (tap karakter, tap skill, tap target)
   ============================================ */

/**
 * Dipanggil saat pemain tap salah satu slot karakter di arena.
 */
function onUnitSlotClick(unitId) {
  if (battleEnded) return;

  const unit = getUnitById(unitId);
  if (!unit) return;

  // MODE TARGETING ITEM: pemain sedang pilih target untuk item yang sudah dipilih
  if (pendingItem) {
    const validItemTargets = getValidItemTargets(pendingItem);
    const isValidItemTarget = validItemTargets.some(t => t.id === unitId);
    if (isValidItemTarget) {
      resolveItemOnTarget(unit);
    }
    return;
  }

  // MODE TARGETING: pemain sedang pilih target untuk skill yang sudah dipilih
  if (pendingActor && pendingSkill) {
    const validTargets = getValidTargets(pendingActor, pendingSkill);
    const isValidTarget = validTargets.some(t => t.id === unitId);
    if (isValidTarget) {
      executeSkill(pendingActor, pendingSkill, [unit]);
    }
    return;
  }

  // MODE PILIH AKTOR: hanya berlaku giliran pemain dan unit masih hidup.
  // Karakter yang sama BOLEH dipilih berkali-kali berturut-turut -
  // satu-satunya pembatas murni dari sistem: hidup/mati, stun, dan mana.
  if (currentPhase !== "player") return;
  if (unit.team !== "player") return;
  if (!unit.alive) return;

  // GILIRAN EKSTRA (Swiftness): hanya karakter itu yang boleh bergerak, dan
  // ini masih giliran yang sama (tanpa regen mana / hitung status lagi).
  if (bonusUnitId !== null) {
    if (unit.id !== bonusUnitId) {
      logMessage("Giliran ekstra hanya untuk karakter yang sedang bercahaya ⚡.");
      return;
    }
    pendingActor = unit;
    pendingSkill = null;
    showSkillPanel(unit);
    renderArena();
    return;
  }

  // Regen mana TIDAK lagi di sini: sudah otomatis di awal giliran tim (beginTeamPhase, mechanics.js).
  const mustSkip = processStatusEffectsAtTurnStart(unit);
  renderArena();

  if (!unit.alive) {
    finishPlayerAction(unit, true);
    return;
  }

  if (mustSkip) {
    finishPlayerAction(unit, true);
    return;
  }

  pendingActor = unit;
  pendingSkill = null;
  showSkillPanel(unit);
  renderArena();
}


/**
 * Tombol batal di panel skill: batalkan pemilihan skill/aktor,
 * kembali ke mode pilih karakter.
 */
function onCancelActorSelection() {
  pendingActor = null;
  pendingSkill = null;
  hideSkillPanel();
  renderArena();
}


/* ============================================
   BAGIAN 7: RENDER (menggambar arena, panel skill, log)
   ============================================ */

function renderArena() {
  renderTeamSlots("player");
  renderTeamSlots("enemy");
  updateItemBarButton(); // ada di items.js
}

function renderTeamSlots(team) {
  const containerId = team === "player" ? "player-slots" : "enemy-slots";
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const units = allUnits.filter(u => u.team === team);

  units.forEach(function (unit) {
    container.appendChild(createUnitSlotElement(unit));
  });
}

function createUnitSlotElement(unit) {
  const slot = document.createElement("div");
  slot.className = "char-slot team-" + unit.team + "-slot";
  slot.dataset.unitId = unit.id;

  if (!unit.alive) {
    slot.classList.add("dead");
    // Pengecualian: karakter yang sudah kalah TETAP bisa jadi target kalau
    // sedang memakai item yang menyasar sekutu yang kalah (mis. mantra
    // kebangkitan), supaya tetap bisa di-tap walau tampilannya pudar.
    if (pendingItem) {
      const validItemTargets = getValidItemTargets(pendingItem);
      if (validItemTargets.some(t => t.id === unit.id)) {
        slot.classList.add("valid-target");
      }
    }
  } else {
    // Tandai slot yang boleh/bisa di-tap sekarang
    if (pendingItem) {
      const validItemTargets = getValidItemTargets(pendingItem);
      if (validItemTargets.some(t => t.id === unit.id)) {
        slot.classList.add("valid-target");
      }
    } else if (pendingActor && pendingSkill) {
      const validTargets = getValidTargets(pendingActor, pendingSkill);
      if (validTargets.some(t => t.id === unit.id)) {
        slot.classList.add("valid-target");
      }
    } else if (currentPhase === "player" && unit.team === "player" && !battleEnded && !pendingItem) {
      slot.classList.add("clickable");
    }

    if (pendingActor && pendingActor.id === unit.id) {
      slot.classList.add("active-turn");
    }
    if (bonusUnitId !== null) {
      slot.classList.remove("clickable");
      if (bonusUnitId === unit.id) slot.classList.add("bonus-ready", "clickable");
    }
  }

  slot.addEventListener("click", function () {
    onUnitSlotClick(unit.id);
  });

  const portrait = document.createElement("div");
  portrait.className = "char-portrait";
  setPortrait(portrait, unit);

  const info = document.createElement("div");
  info.className = "char-info";

  const name = document.createElement("div");
  name.className = "char-name";
  name.textContent = unit.name;
  if (isFrozenUnit(unit)) {
    const tag = document.createElement("span");
    tag.className = "frozen-tag";
    tag.textContent = " 🧊 Beku";
    attachHoldHint(tag, function () {
      return "🧊 Beku: kebal damage dan tidak bisa bermain selama masih ada teman yang tidak beku. Tidak menerima heal, shield, atau ramuan; hanya efek merugikan dari artefak yang bisa masuk.";
    });
    name.appendChild(tag);
    slot.classList.add("frozen");
  }

  const hpLabel = document.createElement("div");
  hpLabel.className = "bar-label";
  hpLabel.textContent = "HP " + Math.round(unit.currentHP) + "/" + Math.round(unit.maxHP) + (shieldLabelText(unit) ? "  " + shieldLabelText(unit) : "");

  if (unit.shieldLayers && unit.shieldLayers.length > 0) {
    attachHoldHint(hpLabel, function () { return shieldHintText(unit); }); // concepts.js
  }

  const hpTrack = document.createElement("div");
  hpTrack.className = "bar-track";
  const hpFill = document.createElement("div");
  hpFill.className = "bar-fill hp";
  hpFill.style.width = Math.max(0, (unit.currentHP / unit.maxHP) * 100) + "%";
  hpTrack.appendChild(hpFill);

  const manaLabel = document.createElement("div");
  manaLabel.className = "bar-label";
  manaLabel.textContent = (unit.energy === "charge" ? "Charge " : "Mana ") + unit.currentMana + "/" + unit.maxMana;

  const manaTrack = document.createElement("div");
  manaTrack.className = "bar-track";
  const manaFill = document.createElement("div");
  manaFill.className = "bar-fill mana";
  manaFill.style.width = Math.max(0, (unit.currentMana / unit.maxMana) * 100) + "%";
  manaTrack.appendChild(manaFill);

  info.appendChild(name);
  info.appendChild(hpLabel);
  info.appendChild(hpTrack);
  info.appendChild(manaLabel);
  info.appendChild(manaTrack);

  if (unit.alive && unit.statusEffects.length > 0) {
    info.appendChild(createStatusBadgeRow(unit));
  }

  slot.appendChild(portrait);
  slot.appendChild(info);

  return slot;
}

/**
 * Membuat baris kecil berisi badge untuk tiap status effect yang sedang
 * aktif di suatu unit (buff, debuff, racun/bakar, stun), supaya pemain
 * tahu kenapa HP-nya berkurang sendiri atau kenapa dia tidak bisa beraksi.
 */
function createStatusBadgeRow(unit) {
  const row = document.createElement("div");
  row.className = "status-badge-row";

  unit.statusEffects.forEach(function (effect) {
    if (effect.type === "frozen") return; // sudah ada tag Beku di samping nama
    const badge = document.createElement("span");
    badge.textContent = getStatusBadgeText(effect);
    badge.className = "status-badge status-" + effect.type +
      (effect.type === "dot" ? "-" + effect.stat : "");
    attachHoldHint(badge, function () { return describeStatusEffect(effect); });
    row.appendChild(badge);
  });

  return row;
}

function getStatusBadgeText(effect) {
  if (effect.type === "dot" && effect.stat === "burn") {
    return "🔥 Bakar " + effect.turnsLeft + "t";
  }
  if (effect.type === "dot" && effect.stat === "poison") {
    return "☠️ Racun " + effect.turnsLeft + "t";
  }
  if (effect.type === "stun") {
    return "💫 Stun " + effect.turnsLeft + "t";
  }
  if (effect.type === "regen") {
    return "💚 Regen " + effect.turnsLeft + "t";
  }
  if (effect.type === "fireres") {
    return "🛡️🔥 Tahan Api " + effect.turnsLeft + "t";
  }
  if (effect.type === "swift") {
    return "⚡ Swift " + Math.round(effect.percent * 100) + "% " + effect.turnsLeft + "t";
  }
  if (effect.type === "slow") {
    return "🐌 Slow " + Math.round(effect.percent * 100) + "% " + effect.turnsLeft + "t";
  }
  if (effect.type === "buff") {
    return "↑ " + statLabel(effect.stat) + " " + effect.turnsLeft + "t";
  }
  if (effect.type === "debuff") {
    return "↓ " + statLabel(effect.stat) + " " + effect.turnsLeft + "t";
  }
  return effect.type;
}

/** Keterangan lengkap sebuah status (ditampilkan saat badge ditekan lama). */
function describeStatusEffect(effect) {
  const t = effect.turnsLeft + " giliran";
  if (effect.type === "dot" && effect.stat === "burn") return "🔥 Bakar: -" + effect.amount + " HP tiap giliran, sisa " + t + ".";
  if (effect.type === "dot" && effect.stat === "poison") return "☠️ Racun: -" + effect.amount + " HP tiap giliran, sisa " + t + ".";
  if (effect.type === "stun") return "💫 Stun: tidak bisa bertindak, sisa " + t + ".";
  if (effect.type === "regen") return "💚 Regen: +" + effect.amount + " HP tiap giliran, sisa " + t + ".";
  if (effect.type === "fireres") return "🛡️🔥 Tahan Api: kebal bakar, sisa " + t + ".";
  if (effect.type === "swift") return "⚡ Swiftness " + Math.round(effect.percent * 100) + "%: dapat giliran ekstra tiap " + Math.round(2 / effect.percent) + " aksi, sisa " + t + ".";
  if (effect.type === "slow") return "🐌 Slow " + Math.round(effect.percent * 100) + "%: giliran bisa hangus tiap " + Math.round(2 / effect.percent) + " giliran, sisa " + t + ".";
  if (effect.type === "buff") return "↑ " + statLabel(effect.stat) + " naik " + Math.round(effect.percent * 100) + "%, sisa " + t + ".";
  if (effect.type === "debuff") return "↓ " + statLabel(effect.stat) + " turun " + Math.round(effect.percent * 100) + "%, sisa " + t + ".";
  return effect.type;
}

/**
 * Tooltip tahan-lama: tahan elemen ~0,4 detik untuk menampilkan keterangan,
 * lepas untuk menutup. Tap biasa tetap meneruskan klik ke kartu karakter.
 */
let hintTimer = null;
let hintJustShown = false;

function hideHoldHint() {
  clearTimeout(hintTimer);
  hintTimer = null;
  const box = document.getElementById("hold-hint");
  if (box) box.style.display = "none";
}

function attachHoldHint(el, getText) {
  el.classList.add("hold-hint-target");
  el.addEventListener("pointerdown", function () {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () {
      let box = document.getElementById("hold-hint");
      if (!box) {
        box = document.createElement("div");
        box.id = "hold-hint";
        document.body.appendChild(box);
      }
      box.textContent = getText();
      box.style.display = "block";
      const bw = box.offsetWidth, bh = box.offsetHeight;
      let left, top;
      const mid = document.querySelector("#battle-screen:not(.hidden) .arena-divider"); // tengah arena (di antara dua tim)
      if (mid && el.closest && el.closest(".char-slot")) {
        // Di arena: keterangan muncul di tengah, supaya tidak menutupi kartu karakter.
        const m = mid.getBoundingClientRect();
        left = Math.max(8, Math.min(window.innerWidth - bw - 8, m.left + m.width / 2 - bw / 2));
        top = Math.max(8, Math.min(window.innerHeight - bh - 8, m.top + m.height * 0.18));
      } else {
        const r = el.getBoundingClientRect();
        left = Math.max(8, Math.min(window.innerWidth - bw - 8, r.left + r.width / 2 - bw / 2));
        top = r.top - bh - 8 >= 8 ? r.top - bh - 8 : r.bottom + 8;
      }
      box.style.left = left + "px";
      box.style.top = top + "px";
      hintJustShown = true;
    }, 400);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
    el.addEventListener(ev, hideHoldHint);
  });
  el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  el.addEventListener("click", function (e) {
    if (hintJustShown) { // klik setelah tahan lama: jangan ikut memilih karakter
      hintJustShown = false;
      e.stopPropagation();
    }
  });
}

/**
 * Membuat teks singkat perkiraan besaran efek sebuah skill, berdasarkan
 * attack efektif unit SAAT INI. Ini perkiraan (karena damage sungguhan
 * juga tergantung defense target yang belum tentu dipilih), tapi cukup
 * buat gambaran kasar sebelum pemain menekan skill.
 */
function getSkillPreviewText(unit, skill) {
  const atk = getEffectiveStat(unit, "attack");
  const parts = [];

  if (skill.type === "single_attack" || skill.type === "area_attack") {
    if (skill.execute) {
      parts.push("HP musuh < " + skill.execute.belowHP + " = MATI, selain itu hangus");
    } else {
      parts.push("~" + Math.max(1, Math.round(atk * skill.power)) + " dmg" + (skill.hits > 1 ? " (" + skill.hits + " serangan)" : ""));
    }
  } else if (skill.type === "healing") {
    parts.push("~" + Math.max(1, Math.round(atk * skill.power)) + " heal");
  } else if (skill.type === "shield") {
    parts.push("~" + shieldDescribe(calcShieldAmount(unit, skill), skill.shield));
  } else if (skill.type === "mana_recovery") {
    parts.push("+20% mana");
  }

  if (skill.effect) {
    const eff = skill.effect;
    if (eff.type === "buff") {
      parts.push("+" + Math.round(eff.percent * 100) + "% " + statLabel(eff.stat) + " (" + eff.turns + "t)");
    } else if (eff.type === "debuff") {
      parts.push("-" + Math.round(eff.percent * 100) + "% " + statLabel(eff.stat) + " (" + eff.turns + "t)");
    } else if (eff.type === "dot") {
      const label = eff.stat === "burn" ? "Bakar" : "Racun";
      parts.push(label + " ~" + Math.round(atk * eff.percent) + "/giliran (" + (eff.bound ? "selama pemakai hidup" : eff.turns + "t") + ")");
    } else if (eff.type === "stun") {
      parts.push(Math.round(eff.chance * 100) + "% stun");
    } else if (eff.type === "freeze") {
      parts.push("🧊 Beku, pecah +" + Math.round(atk * skill.power * eff.shatterPercent));
    } else if (eff.type === "cleanse") {
      parts.push("Bersihkan status buruk");
    }
  }

  return parts.join(" · ");
}

function getTargetLabel(targetType) {
  if (targetType === "single_enemy") return "1 Musuh";
  if (targetType === "all_enemies") return "Semua Musuh";
  if (targetType === "single_ally") return "1 Sekutu";
  if (targetType === "all_allies") return "Semua Sekutu";
  if (targetType === "self") return "Diri Sendiri";
  return "";
}

function statLabel(stat) {
  if (stat === "attack") return "ATK";
  if (stat === "defense") return "DEF";
  if (stat === "speed") return "SPD";
  return stat;
}



function hideSkillPanel() {
  document.getElementById("skill-panel").classList.add("hidden");
  document.body.classList.remove("skill-panel-open");
}

function clearBattleLog() {
  document.getElementById("battle-log-list").innerHTML = "";
}

function logMessage(text) {
  const logList = document.getElementById("battle-log-list");
  const entry = document.createElement("p");
  entry.textContent = text;
  logList.appendChild(entry);
  logList.scrollTop = logList.scrollHeight;
}

// Tombol "Batal" di panel skill ada di HTML sejak awal (tidak dibuat
// lewat JS), jadi listenernya bisa langsung dipasang di sini.
document.getElementById("skill-cancel-btn").addEventListener("click", onCancelActorSelection);