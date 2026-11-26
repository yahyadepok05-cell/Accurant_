/* ============================================
   ACCURANT - MECHANICS.JS  (Accurant 11)
   Semua mekanik pertarungan BARU, ditambahkan tanpa mengubah battle.js,
   enemyAI.js, dan concepts.js. Berkas ini dimuat SETELAH keduanya (lihat
   index.html) lalu menimpa / membungkus fungsi-fungsi yang perlu:

   1. Sistem energi
        Artifact : Charge (bar kuning), tombol Re-charge gratis, "Charging Energy"
        Mutation : Energy x0,7 + Blood Essence (bar merah tua)
        Confer   : Energy kecil + Resonance (tick 0,2 detik waktu nyata)
   2. Status baru
        Blind      : musuh tidak bisa memilih target (skill pilih-target terkunci)
        Time Frozen: giliran musuh DICURI (PHASE_LOCK), bukan stun
   3. Skill khusus lewat hook castSpecial() setelah biaya dibayar:
        Afsoul / Nightmare (Neobert), dkg / Boom (Alexandru),
        Cermin Kutukan (Napoleon), regen tim (Angel), bagi HP & revive (Vloryn),
        1x per pertarungan (Marcel), Time Frozen (Kaiser)
   4. Target "dead_ally" (menghidupkan sekutu yang kalah)
   5. Timer giliran pemain (difficulty.js: turnSeconds) dan tombol
      "Loncatkan Giliran"
   6. AI musuh ikut memakai semua aturan di atas (Re-charge, Blind, skill khusus)

   Semua angka yang bisa diubah ada di charactersExtra.js (bagian KONSTANTA)
   dan di bagian PENGATURAN di bawah ini.
   ============================================ */

/* ---------- PENGATURAN ---------- */

// Bagaimana dua efek curi-giliran yang bertemu digabung:
//   "overwrite": yang baru MENIMPA yang lama   (aturan yang kamu pilih)
//   "add"      : dijumlahkan
//   "max"      : ambil yang terbesar
const LOCK_STACK_MODE = "overwrite";

// Sekutu yang dihidupkan Pembangkit Jiwa minimal punya sebesar ini dari max energinya.
const REVIVE_MIN_ENERGY = 0.3;

// Black Hole (Loid skill 6): ukuran awal, dan batas maksimal (membesar 2x tiap putaran tim Loid).
const HOLE_START = 50;
const HOLE_MAX = 1600;

// Sisa giliran yang dicuri per tim: berapa kali giliran tim itu akan dilewati.
const PHASE_LOCK = { player: 0, enemy: 0 };

// Efek Blind ikut dikenali sistem konsep (concepts.js): tidak boleh masuk ke yang beku,
// kecuali dari artefak.
CONCEPTS.blind = { label: "Blind", harmful: true, frozen: "artifact_only" };


/* ============================================
   BAGIAN 1: PEMBANTU
   ============================================ */

function oppTeam(team) { return team === "player" ? "enemy" : "player"; }

function hasEffect(unit, type) {
  return unit.statusEffects.some(function (e) { return e.type === type; });
}

function isChargingUnit(unit) { return (unit.charging || 0) > 0; }

function skillNeedsManualTarget(skill) {
  return skill.target === "single_enemy" || skill.target === "single_ally" || skill.target === "dead_ally";
}

/** Teks nama energi untuk unit (Mana / Charge / Energy). */
function unitEnergyName(unit) { return energyName(unit); } // charactersExtra.js

/** Regen energi per giliran sendiri (0 = tidak pulih sendiri). */
function energyRegenPercent(unit) {
  if (unit.powerSystem === "Artifact") return CHARGE_REGEN_PERCENT;
  if (unit.powerSystem === "Mutation") return MUTATION_ENERGY_REGEN;
  if (unit.powerSystem === "Confer") return CONFER_ENERGY_REGEN;
  return MANA_REGEN_PERCENT; // battle.js
}

function projectedRegen(unit) {
  const pct = energyRegenPercent(unit);
  if (pct <= 0 || unit.currentMana >= unit.maxMana) return 0;
  return Math.round(unit.maxMana * pct);
}

function sumTeamHp(team) {
  let sum = 0;
  allUnits.forEach(function (u) { if (u.team === team) sum += Math.max(0, u.currentHP) + (u.shield || 0); });
  return sum;
}

function skillSlotOf(unit, skill) {
  for (let i = 0; i < unit.skills.length; i++) if (unit.skills[i].id === skill.id) return i + 1;
  return 0;
}

/** Mengatur curi-giliran sesuai LOCK_STACK_MODE. */
function setLock(team, n) {
  if (n <= 0) return;
  const cur = PHASE_LOCK[team];
  if (LOCK_STACK_MODE === "add") PHASE_LOCK[team] = cur + n;
  else if (LOCK_STACK_MODE === "max") PHASE_LOCK[team] = Math.max(cur, n);
  else PHASE_LOCK[team] = n; // overwrite
  logMessage("⏳ Giliran " + (team === "enemy" ? "musuh" : "timmu") + " dicuri " + PHASE_LOCK[team] + " kali!");
}


/* ============================================
   BAGIAN 2: SYARAT PEMAKAIAN SKILL
   ============================================ */

/**
 * Mengembalikan alasan skill TIDAK bisa dipakai unit sekarang, atau null kalau bisa.
 * Dipakai panel skill (pemain), AI musuh, dan pengecekan "Loncatkan Giliran".
 */
function unitSkillBlocked(unit, skill) {
  if (skill.manaCost > unit.currentMana) return "energi";
  if (unit.blindNow && skillNeedsManualTarget(skill)) return "blind";
  if (skill.oncePerBattle && unit.onceUsed && unit.onceUsed[skill.id]) return "sekali";
  if (isSkillSealed(unit, skill)) return "disegel";

  if (skill.sp === "revive") {
    const dead = allUnits.some(function (u) { return u.team === unit.team && !u.alive; });
    if (!dead) return "tidak ada yang kalah";
  } else if (skill.sp === "hpequal" || skill.sp === "soulswap") {
    const others = getAliveUnits(unit.team).filter(function (u) { return u.id !== unit.id && !isFrozenUnit(u); });
    if (others.length === 0) return "tidak ada sekutu";
  } else if (skill.needsLock && !allUnits.some(function (u) { return u.alive && u.team !== unit.team && hasEffect(u, "locked"); })) {
    return "belum ada target terkunci";
  } else if (skill.sp === "doubleback") {
    if (!(unit.lastDamageTaken > 0)) return "belum menerima damage";
  } else if (skill.sp === "mimicall") {
    if (hasEffect(unit, "borrow")) return "masih meniru";
  } else if (skill.sp === "nightmare") {
    if ((unit.afsoul || 0) < 1) return "Afsoul kosong";
  } else if (skill.sp === "boom") {
    if ((unit.dkg || 0) <= 0) return "dkg kosong";
  } else if (skill.sp === "mirror") {
    if ((unit.mirrorTurns || 0) > 0) return "sudah aktif";
  } else if (skill.sp === "suck") {
    if (hasEffect(unit, "suck")) return "sudah aktif";
  } else if (skill.sp === "pull") {
    const free = getAliveUnits(oppTeam(unit.team)).some(function (f) { return !hasEffect(f, "pulled") && !isFrozenUnit(f); });
    if (!free) return "tidak ada target";
  }

  // Penarikan Kasar (Loid): unit yang ditarik HARUS menyerang penariknya.
  // Skill non-serangan dikunci selama masih ada skill serangan yang bisa dipakai.
  if (pullerOf(unit) && !isAttackSkill(skill) && unitHasUsableAttack(unit)) return "tertarik";
  return null;
}

function isAttackSkill(skill) { return skill.type === "single_attack" || skill.type === "area_attack"; }

/** Penarik (Loid) yang masih hidup kalau unit ini sedang "tertarik", selain itu null. */
function pullerOf(unit) {
  const fx = unit.statusEffects.find(function (e) { return e.type === "pulled"; });
  if (!fx) return null;
  const p = allUnits.find(function (u) { return u.id === fx.by && u.alive && !isFrozenUnit(u); });
  return p || null;
}

function unitHasUsableAttack(unit) {
  return unit.skills.some(function (s) {
    return isAttackSkill(s) && s.manaCost <= unit.currentMana &&
      !(unit.blindNow && skillNeedsManualTarget(s)) &&
      !(s.oncePerBattle && unit.onceUsed && unit.onceUsed[s.id]);
  });
}

// AI: skill khusus (aiManual) tidak ikut dipertimbangkan AI umum; skill lain
// tetap memakai AI lama, hanya ditambah syarat di atas (Blind, 1x per pertarungan, dst).
isSkillConsiderable = (function (orig) {
  return function (unit, skill) {
    if (skill.aiManual) return false;
    if (unitSkillBlocked(unit, skill)) return false;
    return orig(unit, skill);
  };
})(isSkillConsiderable);

isConsiderableAt = (function (orig) {
  return function (unit, skill, ultLimit) {
    if (skill.aiManual) return false;
    if (unitSkillBlocked(unit, skill)) return false;
    return orig(unit, skill, ultLimit);
  };
})(isConsiderableAt);


/* ============================================
   BAGIAN 3: UNIT & ENERGI
   ============================================ */

createRuntimeUnit = (function (orig) {
  return function (character, team) {
    const u = orig(character, team);
    u.powerSystem = character.powerSystem || "";
    u.rank = character.rank || "";
    u.charging = 0;            // sisa giliran tim untuk "Charging Energy" (Artifact)
    u.blindNow = false;        // Blind aktif pada aksi unit ini sekarang
    u.onceUsed = {};           // skill 1x per pertarungan yang sudah dipakai
    u.mirrorTurns = 0;         // Cermin Kutukan (Napoleon)
    u.role = character.role || "";
    u.ownSkills = character.skills; // skill asli (Clay bisa meminjam skill musuh sementara)
    if (u.powerSystem === "Mutation") {
      u.maxEssence = character.maxEssence || Math.round(u.maxHP * ESSENCE_MAX_PERCENT);
      u.essence = 0;           // Blood Essence mulai dari 0
    }
    if (u.powerSystem === "Confer") {
      u.maxResonance = character.maxResonance || Math.round(u.maxHP * CONFER_RES_MULT);
      u.resonance = 0;         // Resonance mulai dari 0
    }
    if (character.skills.some(function (s) { return s.afsoul; })) u.afsoul = 0; // Neobert
    if (character.skills.some(function (s) { return s.dkg; })) u.dkg = 0;       // Alexandru
    if (character.skills.some(function (s) { return s.sp === "blackhole"; })) u.holeSize = 0; // Loid
    return u;
  };
})(createRuntimeUnit);

function regenerateManaAtTurnStart(unit) {
  const pct = energyRegenPercent(unit);
  if (pct <= 0) return; // Artifact & Confer: tidak pulih sendiri
  const amount = Math.round(unit.maxMana * pct);
  if (amount > 0 && unit.currentMana < unit.maxMana) applyManaRecovery(unit, amount);
}

/** Re-charge (Artifact): gratis, lalu menunggu CHARGE_WAIT_TURNS giliran jalan timnya. */
function startCharging(unit) {
  unit.charging = CHARGE_WAIT_TURNS;
  logMessage("🔋 " + unit.name + " melakukan Re-charge. Charging Energy selama " + CHARGE_WAIT_TURNS + " giliran.");
}

/** Tombol Re-charge ditawarkan kalau ada skill yang Charge-nya tidak cukup. */
function canOfferRecharge(unit) {
  if (unit.powerSystem !== "Artifact" || isChargingUnit(unit)) return false;
  if (unit.currentMana >= unit.maxMana) return false;
  return unit.skills.some(function (s) { return s.manaCost > unit.currentMana; });
}

/** AI: Artifact yang tidak sanggup membayar skill apa pun harus Re-charge. */
function aiNeedsRecharge(unit) {
  if (unit.powerSystem !== "Artifact" || isChargingUnit(unit)) return false;
  if (unit.currentMana >= unit.maxMana) return false;
  return !unit.skills.some(function (s) { return s.manaCost <= unit.currentMana && !s.aiManual; });
}

/** Dipanggil tiap kali SATU tim selesai beraksi (termasuk lewat/waktu habis). */
function teamActionDone(team) {
  allUnits.forEach(function (u) {
    if (u.team !== team || !u.alive || !(u.charging > 0)) return;
    u.charging -= 1;
    if (u.charging <= 0) {
      u.charging = 0;
      u.currentMana = u.maxMana;
      logMessage("🔋 " + u.name + " selesai Charging Energy. Charge penuh!");
    }
  });
}

/** Blood Essence: karakter Mutation yang tidak dipakai di aksi ini kehilangan essence. */
function mutationIgnore(team, actor) {
  allUnits.forEach(function (u) {
    if (u.team !== team || !u.alive || u.powerSystem !== "Mutation" || u === actor) return;
    const loss = Math.round(u.maxEssence * ESSENCE_IGNORE_LOSS);
    if (loss > 0 && u.essence > 0) u.essence = Math.max(0, u.essence - loss);
  });
}

/** Awal giliran sebuah tim: regen tim, Cermin menyusut, Blood Essence penuh menyembuhkan. */
function onTeamTurnStart(team) {
  allUnits.forEach(function (u) {
    if (!u.alive || u.team !== team) return;

    // Regen tim (Angel skill 6): tiap putaran tim pemiliknya
    u.statusEffects.filter(function (e) { return e.type === "teamregen"; }).forEach(function (e) {
      if (!isFrozenUnit(u)) {
        applyHeal(u, e.amount);
        logMessage("💚 " + u.name + " beregenerasi +" + e.amount + " HP.");
      }
      e.turnsLeft -= 1;
    });
    u.statusEffects = u.statusEffects.filter(function (e) { return !(e.type === "teamregen" && e.turnsLeft <= 0); });

    // Black Hole (Loid): membesar 2x lipat tiap putaran timnya (tidak membesar kalau Loid beku)
    if (u.holeSize > 0 && !isFrozenUnit(u)) {
      const next = Math.min(HOLE_MAX, u.holeSize * 2);
      if (next > u.holeSize) {
        u.holeSize = next;
        logMessage("🕳️ Black Hole " + u.name + " membesar 2x lipat: " + next + (next >= HOLE_MAX ? " (ukuran maksimum)" : "") + ".");
      } else {
        logMessage("🕳️ Black Hole " + u.name + " sudah di ukuran maksimum (" + HOLE_MAX + ").");
      }
    }

    // Cermin Kutukan (Napoleon)
    if (u.mirrorTurns > 0) {
      u.mirrorTurns -= 1;
      if (u.mirrorTurns === 0) logMessage("🪞 Cermin Kutukan " + u.name + " memudar.");
    }

    // Blood Essence penuh: HP +10% max essence tiap giliran tim, essence tidak berkurang
    if (u.powerSystem === "Mutation" && u.maxEssence > 0 && u.essence >= u.maxEssence && !isFrozenUnit(u)) {
      const heal = Math.round(u.maxEssence * ESSENCE_FULL_HEAL);
      if (u.currentHP < u.maxHP) {
        applyHeal(u, heal);
        logMessage("🩸 Blood Essence " + u.name + " penuh: HP +" + heal + ".");
      }
    }
  });
}

/** Jumlah & total damage DoT per jenis (burn/poison) yang akan kena unit di awal gilirannya. */
function dotStacksOf(unit) {
  const out = {};
  if (isFrozenUnit(unit)) return out;
  const fireProof = hasEffect(unit, "fireres");
  unit.statusEffects.forEach(function (e) {
    if (e.type !== "dot") return;
    if (e.stat === "burn" && fireProof) return;
    const s = out[e.stat] || (out[e.stat] = { n: 0, total: 0 });
    s.n += 1;
    s.total += e.amount;
  });
  return out;
}

/** Satu giliran yang dicuri: waktu tetap mengalir (racun/bakar jalan, durasi status berkurang). */
function stolenTurnTick(team) {
  allUnits.forEach(function (u) {
    if (u.team !== team || !u.alive) return;
    processStatusEffectsAtTurnStart(u); // hasil "lewati giliran" tidak dipakai: memang sudah tidak bergerak
  });
  tickShields(team); // concepts.js
}

// Status per-unit yang dihitung per putaran TIM (bukan per aksi unit) tidak boleh ikut
// dikurangi saat unit itu sendiri mulai gilirannya.
processStatusEffectsAtTurnStart = (function (orig) {
  return function (unit) {
    dropOrphanEffects(unit);                  // efek "selama pemakainya hidup" lepas kalau pemakainya kalah
    unit.blindNow = hasEffect(unit, "blind"); // Blind dihitung SEBELUM durasinya berkurang
    const stash = unit.statusEffects.filter(function (e) { return e.type === "teamregen"; });
    if (stash.length > 0) unit.statusEffects = unit.statusEffects.filter(function (e) { return e.type !== "teamregen"; });

    // DoT yang menumpuk: tiap efek tetap jalan sendiri (damage dijumlahkan). Di sini hanya dihitung
    // untuk ringkasan log.
    const stacks = dotStacksOf(unit);
    const result = orig(unit);
    Object.keys(stacks).forEach(function (stat) {
      const st = stacks[stat];
      if (st.n >= 2) {
        logMessage((stat === "burn" ? "🔥 Bakar" : "☠️ Racun") + " menumpuk x" + st.n + " pada " + unit.name +
          ": total -" + st.total + " HP giliran ini.");
      }
    });
    if (stash.length > 0 && unit.alive) unit.statusEffects = unit.statusEffects.concat(stash);
    if (unit.hpx2Active && !hasEffect(unit, "hpx2")) { // Kelipatan Pertahanan habis: sisa HP dibagi 2
      unit.hpx2Active = false;
      unit.maxHP = Math.round(unit.maxHP / 2);
      if (unit.alive) unit.currentHP = Math.max(1, Math.ceil(unit.currentHP / 2));
      logMessage("⚖️ Kelipatan Pertahanan " + unit.name + " habis: HP kembali dibagi 2 (" + unit.currentHP + "/" + unit.maxHP + ").");
    }
    return result;
  };
})(processStatusEffectsAtTurnStart);

// Status Blind (menimpa yang lama) dan cleanse yang juga membersihkan Blind.
applyStatusEffect = (function (orig) {
  return function (sourceUnit, targetUnit, effect) {
    if (effect.type === "blind") {
      if (!targetUnit.alive) return;
      if (!canReceiveConcept("blind", targetUnit, { kind: "skill" })) return; // concepts.js
      targetUnit.statusEffects = targetUnit.statusEffects.filter(function (e) { return e.type !== "blind"; });
      targetUnit.statusEffects.push({ type: "blind", turnsLeft: effect.turns });
      logMessage("🕶 " + targetUnit.name + " terkena Blind (" + effect.turns + " giliran): tidak bisa memilih target!");
      return;
    }
    const n0 = targetUnit.statusEffects.length;
    const result = orig(sourceUnit, targetUnit, effect);
    if (effect.type === "dot" && effect.bound && sourceUnit && targetUnit.statusEffects.length > n0) {
      const added = targetUnit.statusEffects[targetUnit.statusEffects.length - 1];
      added.turnsLeft = 9999;      // bertahan selama pemakainya hidup
      added.by = sourceUnit.id;
    }
    if (effect.type === "cleanse") {
      targetUnit.statusEffects = targetUnit.statusEffects.filter(function (e) { return e.type !== "blind"; });
    }
    return result;
  };
})(applyStatusEffect);

getValidTargetsRaw = (function (orig) {
  return function (caster, skill) {
    if (skill.target === "dead_ally") {
      return allUnits.filter(function (u) { return u.team === caster.team && !u.alive; });
    }
    if (skill.neutral) { // Cuaca Hujan Petir: semua karakter di arena kecuali pemakai
      return allUnits.filter(function (u) { return u.alive && u.id !== caster.id; });
    }
    if (skill.onlyMagic) { // Penekanan Mana Musuh: hanya pengguna sihir
      return orig(caster, skill).filter(isMagicUser);
    }
    if (skill.needsLock) { // Deadly Eye: hanya musuh yang terkunci
      return orig(caster, skill).filter(function (u) { return hasEffect(u, "locked"); });
    }
    // Penarikan Kasar: serangan satu target dari unit yang ditarik hanya boleh mengenai penariknya.
    if (skill.type === "single_attack" && skill.target === "single_enemy") {
      const puller = pullerOf(caster);
      if (puller) return [puller];
    }
    return orig(caster, skill);
  };
})(getValidTargetsRaw);

getTargetLabel = (function (orig) {
  return function (target) {
    if (target === "dead_ally") return "1 Sekutu Kalah";
    return orig(target);
  };
})(getTargetLabel);


/* ============================================
   BAGIAN 4: DAMAGE KHUSUS (Cermin Kutukan & tick Resonance)
   ============================================ */

let mirrorBusy = false; // cegah pantulan berantai antar dua Cermin

function mirrorApplies(target, amount, source) {
  return !mirrorBusy && target.alive && target.mirrorTurns > 0 && amount > 0 &&
    source && source.id && source.alive && source !== target && source.team !== target.team &&
    !isFrozenUnit(target) && !hasAbsoluteShield(target);
}

applyDamage = (function (orig) {
  return function (unit, rawAmount) {
    const src = currentDamageSource; // battle.js: siapa yang sedang menyerang

    // Bayangan Cermin (Napoleon): damage yang masuk berkurang
    const red = unit.statusEffects.find(function (e) { return e.type === "dmgreduce"; });
    if (red && rawAmount > 0) rawAmount = Math.max(1, Math.round(rawAmount * (1 - red.percent)));
    if (rawAmount > 0) unit.lastDamageTaken = rawAmount; // dipakai Clay (meniru damage yang diterima)

    // Pantulan (Leon, Ruben, Gloo, Clay): sebagian/seluruh damage dibalikkan ke penyerang
    const ref = unit.statusEffects.find(function (e) { return e.type === "reflect"; });
    if (ref && !mirrorBusy && rawAmount > 0 && src && src.id && src.alive && src.team !== unit.team && unit.alive && !isFrozenUnit(unit)) {
      mirrorBusy = true;
      try {
        currentDamageSource = unit;
        if (ref.mode === "spread") { // Gloo: dibagi rata ke seluruh tim penyerang
          const foes = getAliveUnits(src.team);
          const each = Math.max(1, Math.round(rawAmount * ref.percent / foes.length));
          logMessage("🔁 " + unit.name + " memantulkan " + rawAmount + " damage ke seluruh tim " + src.name + " (" + each + " masing-masing)!");
          foes.forEach(function (f) { orig(f, each); });
        } else {
          const back = ref.mode === "ownMaxHp"            // Ruben: % dari max HP sendiri
            ? Math.max(1, Math.round(unit.maxHP * ref.percent))
            : Math.max(1, Math.round(rawAmount * ref.percent)); // Leon 1,5x, Clay dst.
          logMessage("🔁 " + unit.name + " membalikkan " + back + " damage ke " + src.name + "!");
          orig(src, back);
        }
      } finally {
        currentDamageSource = src;
        mirrorBusy = false;
      }
    }

    if (mirrorApplies(unit, rawAmount, src)) {
      mirrorBusy = true;
      logMessage("🪞 " + unit.name + " memantulkan " + rawAmount + " damage kembali ke " + src.name + "!");
      try {
        currentDamageSource = unit;
        orig(src, rawAmount);
      } finally {
        currentDamageSource = src;
        mirrorBusy = false;
      }
      return;
    }
    return orig(unit, rawAmount);
  };
})(applyDamage);

/** Damage tanpa catatan pertarungan (dipakai tick Resonance 0,2 detik supaya log tidak banjir). */
function quietDamage(target, amount, source) {
  if (!target.alive || amount <= 0) return;
  if (isFrozenUnit(target) || hasAbsoluteShield(target)) return;
  if (mirrorApplies(target, amount, source)) {
    mirrorBusy = true;
    try { quietDamage(source, amount, null); } finally { mirrorBusy = false; }
    return;
  }
  const remaining = absorbWithShields(target, amount); // concepts.js
  if (remaining <= 0) return;
  target.dmgCarry = (target.dmgCarry || 0) + remaining; // HP tetap bilangan bulat: pecahan ditabung
  const whole = Math.floor(target.dmgCarry);
  if (whole <= 0) return;
  target.dmgCarry -= whole;
  target.currentHP = Math.max(0, target.currentHP - whole);
  if (target.currentHP <= 0) {
    target.alive = false;
    logMessage(target.name + " telah kalah!");
    if (typeof announceKill === "function") announceKill(target, source); // banner.js
  }
}


/* ============================================
   BAGIAN 4b: KONSEP SKILL TAMBAHAN
   Tolak Heal, Pantulan, Pengurangan Damage, Segel, Kuras Energi, Nerf,
   efek "selama pemakainya hidup", dan peniruan skill (Clay).
   ============================================ */

const SOUL_CONTROL_POWER = 2.2;         // Victor skill 6: ATK musuh x2,2 ke dirinya sendiri
const MIMIC_ALL_USES = 4;               // Clay skill 6: skill tiruan bertahan 4 kesempatan
let REVIVE_ACT = null;                  // Angel skill 6: unit yang baru dihidupkan dan langsung bermain
let SEAL_PICK = null;                   // Clefa skill 5: nomor skill musuh yang dipilih pemain

/** Teks pantulan untuk log & keterangan. */
function reflectText(r) {
  if (r.mode === "spread") return "memantulkan damage ke seluruh tim penyerang (dibagi rata)";
  if (r.mode === "ownMaxHp") return "membalikkan " + Math.round(r.percent * 100) + "% max HP-nya ke penyerang";
  return "membalikkan " + (r.percent === 1 ? "" : r.percent + "x ") + "damage ke penyerang";
}

/** Garan skill 6: hasil dadu -> pengali damage, ada/tidaknya damage berjalan, dan stun. */
const DICE_TABLE = {
  1: { mult: 0.5, dot: false, stun: false, text: "zona melemah (damage x0,5, tanpa damage berjalan)" },
  2: { mult: 1, dot: true, stun: false, text: "zona normal" },
  3: { mult: 1, dot: true, stun: false, text: "zona normal" },
  4: { mult: 1.5, dot: true, stun: false, text: "zona menguat (damage x1,5)" },
  5: { mult: 1.5, dot: true, stun: false, text: "zona menguat (damage x1,5)" },
  6: { mult: 2, dot: true, stun: true, text: "GRAVITASI RUNTUH! (damage x2 + seluruh musuh tidak bisa bermain 1x)" }
};

/** Tampilan dadu berputar di tengah layar. */
function showDiceRoll(n) {
  const el = document.createElement("div");
  el.className = "dice-roll";
  el.innerHTML = "<div class='dice-cube'>" + ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][n - 1] + "</div><div class='dice-label'>" + n + "</div>";
  if (n === 6) el.classList.add("dice-crit");
  if (n === 1) el.classList.add("dice-fail");
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 1500);
}

/** Pengguna sihir: sistem kekuatan Magic, atau nama sistemnya diawali "Sihir". */
function isMagicUser(u) {
  return u.powerSystem === "Magic" || /^sihir/i.test(u.role || "");
}

/** Salinan skill musuh yang DIPINJAM Clay (bisa dipakai berkali-kali, biaya dari energi Clay). */
function makeBorrowed(clay, src) {
  const copy = makeCopy(src);
  copy.id = "borrow_" + src.id;
  copy.name = "🎭 " + src.name;
  copy.isCopy = true;
  copy.manaCost = energyCostFor(clay, src.value || 1); // charactersExtra.js
  // Skill pinjaman tetap membawa aturan khususnya (Black Hole, curi giliran, dll.), kecuali biaya persen.
  ["sp", "aiManual", "lock", "extraTurn", "afsoul", "afsoulSolo", "dkg"].forEach(function (k) {
    if (src[k] !== undefined) copy[k] = src[k];
  });
  return copy;
}

/** Setiap Clay memakai skill, sisa kesempatan meniru berkurang; habis = skill tiruan hilang. */
function tickBorrowedSkills(unit) {
  const fx = unit.statusEffects.find(function (e) { return e.type === "borrow"; });
  if (!fx) return;
  if (fx.fresh) { fx.fresh = false; return; } // skill 6 itu sendiri tidak dihitung
  fx.left -= 1;
  if (fx.left <= 0) {
    unit.statusEffects = unit.statusEffects.filter(function (e) { return e !== fx; });
    unit.skills = unit.ownSkills || unit.skills;
    logMessage("🎭 Tiruan " + unit.name + " habis. Skill kembali 6.");
  }
}
const LAST_SKILL = { player: null, enemy: null }; // skill terakhir tiap tim (untuk Clay)

/** Apakah skill ini sedang disegel (Clefa)? Segel "sampai Clefa kalah" lepas sendiri kalau Clefa kalah. */
function isSkillSealed(unit, skill) {
  const slot = skillSlotOf(unit, skill);
  return unit.statusEffects.some(function (e) {
    if (e.type !== "seal" || e.slot !== slot) return false;
    if (!e.by) return true;
    return allUnits.some(function (u) { return u.id === e.by && u.alive; });
  });
}

/** Lepas efek yang terikat pada pemakai yang sudah kalah (DoT permanen, segel permanen). */
function dropOrphanEffects(unit) {
  unit.statusEffects = unit.statusEffects.filter(function (e) {
    if (!e.by || (e.type !== "dot" && e.type !== "seal")) return true;
    return allUnits.some(function (u) { return u.id === e.by && u.alive; });
  });
}

/** Pemakai + sekutu tepat di sebelahnya (urutan slot). */
function nearbyAllies(caster, targets) {
  const team = allUnits.filter(function (u) { return u.team === caster.team; });
  const at = team.indexOf(caster);
  return targets.filter(function (t) {
    const i = team.indexOf(t);
    return i !== -1 && Math.abs(i - at) <= 1;
  });
}

/** Efek konsep yang dipasang ke tiap target skill. */
function applyTargetConcepts(caster, skill, target) {
  if (!target.alive) return;
  if (skill.antiHeal) {
    target.statusEffects = target.statusEffects.filter(function (e) { return e.type !== "antiheal"; });
    target.statusEffects.push({ type: "antiheal", turnsLeft: skill.antiHeal });
    logMessage("🚫 " + target.name + " tidak bisa disembuhkan selama " + skill.antiHeal + " giliran.");
  }
  if (skill.reflect) {
    target.statusEffects = target.statusEffects.filter(function (e) { return e.type !== "reflect"; });
    target.statusEffects.push({ type: "reflect", percent: skill.reflect.percent, mode: skill.reflect.mode, turnsLeft: skill.reflect.turns });
    logMessage("🔁 " + target.name + " " + reflectText(skill.reflect) + " selama " + skill.reflect.turns + " giliran.");
  }
  if (skill.deathMark && target.team !== caster.team) {
    let mark = target.statusEffects.find(function (e) { return e.type === "deathmark"; });
    if (!mark) { mark = { type: "deathmark", stacks: 0, turnsLeft: 9999 }; target.statusEffects.push(mark); }
    mark.stacks = Math.min(DEATHMARK_MAX, mark.stacks + 1);
    logMessage("☠️ Tanda kematian pada " + target.name + ": " + mark.stacks + "/" + DEATHMARK_MAX + " (batas Curse of Death +" + Math.round(mark.stacks * DEATHMARK_STEP * 100) + "%).");
  }
  if (skill.lockOn && target.team !== caster.team) {
    target.statusEffects = target.statusEffects.filter(function (e) { return e.type !== "locked"; });
    target.statusEffects.push({ type: "locked", turnsLeft: skill.lockOn });
    logMessage("🎯 " + target.name + " TERKUNCI (" + skill.lockOn + " giliran).");
  }
  if (skill.dmgReduce) {
    target.statusEffects = target.statusEffects.filter(function (e) { return e.type !== "dmgreduce"; });
    target.statusEffects.push({ type: "dmgreduce", percent: skill.dmgReduce.percent, turnsLeft: skill.dmgReduce.turns });
    logMessage("🪞 Damage yang mengenai " + target.name + " berkurang " + Math.round(skill.dmgReduce.percent * 100) + "% selama " + skill.dmgReduce.turns + " giliran.");
  }
  if (skill.seal && target.team !== caster.team) {
    let slot = skill.seal.slot;
    if (slot === "pick" && SEAL_PICK) slot = SEAL_PICK;         // dipilih pemain
    else if (slot === "pick") slot = "strongest5";               // musuh/AI: yang terkuat dari skill 1-5
    if (slot === "strongest" || slot === "strongest5") { // skill dengan nilai terbesar yang belum disegel
      const pool = slot === "strongest5" ? target.skills.slice(0, 5) : target.skills;
      const open = pool.filter(function (sk) { return !isSkillSealed(target, sk); });
      const best = open.sort(function (a, b) { return (b.value || b.manaCost) - (a.value || a.manaCost); })[0];
      slot = best ? skillSlotOf(target, best) : 0;
    }
    const sk = target.skills[slot - 1];
    if (sk) {
      const permanent = skill.seal.turns === "caster";
      target.statusEffects.push({ type: "seal", slot: slot, turnsLeft: permanent ? 9999 : skill.seal.turns, by: permanent ? caster.id : null });
      logMessage("🔏 Skill " + target.name + " \"" + sk.name + "\" disegel" + (permanent ? " sampai " + caster.name + " kalah." : " selama " + skill.seal.turns + " giliran."));
    }
  }
  if (skill.manaDrain && target.team !== caster.team) {
    const loss = Math.min(target.currentMana, Math.round(target.maxMana * skill.manaDrain));
    target.currentMana -= loss;
    logMessage("⚖️ Energi " + target.name + " ditekan -" + loss + ".");
  }
  if (skill.nerf && target.team !== caster.team) {
    const amount = Math.max(1, Math.round(skill.manaCost * skill.nerf.ratio));
    skill.nerf.stats.forEach(function (stat) {
      target.statusEffects = target.statusEffects.filter(function (e) { return !(e.type === "nerf" && e.stat === stat); });
      target.statusEffects.push({ type: "nerf", stat: stat, amount: amount, turnsLeft: skill.nerf.turns });
    });
    logMessage("🧊 " + target.name + " terkena nerf: " + skill.nerf.stats.map(statLabel).join(" & ") + " -" + amount + " selama " + skill.nerf.turns + " giliran.");
  }
}

/** Salinan skill untuk ditiru Clay (tanpa biaya dan tanpa aturan khusus pemilik aslinya). */
function makeCopy(src) {
  const copy = Object.assign({}, src, { id: "copy_" + src.id, manaCost: 0, isCopy: true });
  delete copy.sp; delete copy.costPct; delete copy.oncePerBattle; delete copy.lock; delete copy.extraTurn;
  delete copy.afsoul; delete copy.dkg; delete copy.aiManual;
  return copy;
}

/** Target otomatis untuk skill tiruan, dari sudut pandang peniru. */
function copyTargets(copier, copy, preferred) {
  const foes = getAliveUnits(oppTeam(copier.team)).filter(function (u) { return !isFrozenUnit(u); });
  const allies = getAliveUnits(copier.team).filter(function (u) { return !isFrozenUnit(u); });
  if (copy.target === "all_enemies") return foes;
  if (copy.target === "all_allies") return allies;
  if (copy.target === "self" || copy.target === "single_ally" || copy.target === "dead_ally") return [copier];
  const pick = (preferred || []).find(function (t) { return t && t.alive && t.team !== copier.team && !isFrozenUnit(t); });
  return pick ? [pick] : foes.slice(0, 1);
}

/** Clay memakai salinan skill. exact = memakai ATK pemakai aslinya. */
function castCopy(copier, last, preferred, exact) {
  const copy = makeCopy(last.skill);
  const tg = copyTargets(copier, copy, preferred);
  if (tg.length === 0) return;
  logMessage("🎭 " + copier.name + " meniru \"" + last.skill.name + "\"" + (exact ? " persis seperti aslinya!" : "!"));
  const savedAtk = copier.baseAttack;
  if (exact && last.atk) copier.baseAttack = last.atk;
  const savedCtx = currentSkillCtx;
  currentSkillCtx = { caster: copier, skill: copy, aliveFoes: getAliveUnits(oppTeam(copier.team)).length, dice: 0 };
  try {
    applyNormalSkill(copier, copy, tg);
  } finally {
    copier.baseAttack = savedAtk;
    currentSkillCtx = savedCtx;
  }
}

/** Setelah sebuah skill dipakai, Clay di tim lawan yang sedang bersiap langsung menirunya. */
function triggerMimicNext(user, skill, targets) {
  allUnits.forEach(function (u) {
    if (!u.alive || u.team === user.team || isFrozenUnit(u) || !hasEffect(u, "mimicnext")) return;
    u.statusEffects = u.statusEffects.filter(function (e) { return e.type !== "mimicnext"; });
    castCopy(u, { skill: skill, atk: getEffectiveStat(u, "attack") }, [user], false);
  });
}

/* ============================================
   BAGIAN 5: MENJALANKAN SKILL (pemain & musuh memakai jalur yang sama)
   ============================================ */

/** Loop efek biasa (damage, heal, shield, status) - sama seperti battle.js lama. */
function applyNormalSkill(caster, skill, targets) {
  targets.forEach(function (target) {
    if (skill.type === "single_attack" || skill.type === "area_attack") {
      resolveAttackOnTarget(caster, skill, target);
    } else if (skill.type === "healing") {
      const heal = calculateHeal(caster, skill.power);
      applyHeal(target, heal);
      logMessage(caster.name + " memakai " + skill.name + " ke " + target.name + " (+" + heal + " HP).");
    } else if (skill.type === "shield") {
      const shieldAmount = calcShieldAmount(caster, skill); // concepts.js
      applyShield(target, shieldAmount, Object.assign({}, skill.shield, { sourceTeam: caster.team }));
      logMessage(caster.name + " memberi " + shieldDescribe(shieldAmount, skill.shield) + " ke " + target.name + ".");
    } else if (skill.type === "mana_recovery") {
      const manaAmount = Math.round(target.maxMana * 0.2);
      applyManaRecovery(target, manaAmount);
      logMessage(caster.name + " memulihkan " + manaAmount + " " + unitEnergyName(target) + " " + target.name + ".");
    } else if (skill.type === "buff" || skill.type === "debuff") {
      logMessage(caster.name + " memakai " + skill.name + " ke " + target.name + ".");
    }
    const mainEffect = diceScaled(skill.effect);
    if (mainEffect) applyStatusEffect(caster, target, mainEffect);
    (skill.effects || []).forEach(function (e) { applyStatusEffect(caster, target, e); });
    applyTargetConcepts(caster, skill, target);
  });
}

/** DoT dari skill berdadu ikut dikali hasil dadu. */
function diceScaled(effect) {
  const ctx = currentSkillCtx;
  if (!effect || !ctx || !ctx.dice || effect.type !== "dot") return effect;
  return DICE_TABLE[ctx.dice].dot ? effect : null; // dadu 1: tanpa damage berjalan
}

/** Boom! (Alexandru): power dihitung dari dkg yang terkumpul (50%). */
function dynamicBoomSkill(caster, skill) {
  const power = Math.max(0.05, (caster.dkg || 0) * 0.5 / CARD_K);
  return Object.assign({}, skill, { power: power });
}

/**
 * HOOK EFEK KHUSUS: dipanggil setelah biaya dibayar.
 * @returns {boolean} true kalau efek utama sudah ditangani di sini
 *                    (loop efek biasa dilewati).
 */
function castSpecial(caster, skill, targets) {
  const foe = oppTeam(caster.team);
  switch (skill.sp) {
    case "nightmare": { // Neobert skill 6
      const n = Math.min(AFSOUL_MAX, caster.afsoul || 0);
      logMessage("🌑 " + caster.name + " memakai " + skill.name + "! Afsoul x" + n + " menyelimuti musuh.");
      targets.forEach(function (t) { applyStatusEffect(caster, t, { type: "blind", turns: n }); });
      setLock(foe, n);
      caster.afsoul = 0;
      return true;
    }
    case "timelock": { // Kaiser: Time Frozen
      logMessage("❄️ " + caster.name + " memakai " + skill.name + "! Waktu musuh membeku.");
      setLock(foe, skill.lock || 3);
      return true;
    }
    case "mirror": { // Napoleon skill 6
      caster.mirrorTurns = MIRROR_TURNS;
      logMessage("🪞 " + caster.name + " memakai " + skill.name + ": damage yang mengenainya dipantulkan selama " + MIRROR_TURNS + " putaran.");
      return true;
    }
    case "hpequal": { // Vloryn skill 4: HP seluruh sekutu = HP Vloryn saat itu
      const hp = caster.currentHP;
      logMessage("👻 " + caster.name + " menyetarakan HP tim dengan HP-nya (" + hp + ").");
      targets.forEach(function (t) {
        if (!t.alive || t.id === caster.id || isFrozenUnit(t)) return;
        t.currentHP = Math.max(1, Math.min(t.maxHP, hp));
        logMessage("  " + t.name + " → " + t.currentHP + " HP.");
      });
      return true;
    }
    case "revive": { // Vloryn skill 6 & Angel skill 6
      const t = targets.find(function (x) { return !x.alive; });
      if (!t) { logMessage(skill.name + " tidak menemukan sekutu yang kalah."); return true; }
      if (t.hpx2Active) { t.maxHP = Math.round(t.maxHP / 2); t.hpx2Active = false; }
      t.alive = true;
      t.currentHP = Math.max(1, Math.min(t.maxHP, calculateHeal(caster, skill.power)));
      t.statusEffects = [];
      t.shieldLayers = [];
      t.shield = 0;
      t.charging = 0;
      t.blindNow = false;
      t.mirrorTurns = 0;
      if (t.ownSkills) t.skills = t.ownSkills;
      if (t.essence !== undefined) t.essence = 0;
      if (t.resonance !== undefined) t.resonance = 0;
      if (t.holeSize !== undefined) t.holeSize = 0;
      t.currentMana = Math.max(t.currentMana, Math.round(t.maxMana * REVIVE_MIN_ENERGY));
      logMessage("✨ " + caster.name + " menghidupkan " + t.name + " dengan " + t.currentHP + " HP!");
      if (skill.reviveAct) { REVIVE_ACT = t; logMessage("🌸 " + t.name + " langsung bermain!"); }
      return true;
    }
    case "pull": { // Loid skill 2: Penarikan Kasar
      targets.forEach(function (t) {
        if (!t.alive || isFrozenUnit(t)) return;
        t.statusEffects = t.statusEffects.filter(function (e) { return e.type !== "pulled"; });
        // turnsLeft besar: status ini dilepas manual begitu unit yang ditarik bertindak
        t.statusEffects.push({ type: "pulled", by: caster.id, turnsLeft: 9999 });
        logMessage("🕳️ " + caster.name + " menarik paksa " + t.name + "! Kesempatan berikutnya " + t.name + " harus menyerang " + caster.name + ".");
        fxBlackHole("beam", caster, t);
      });
      return true;
    }
    case "suck": { // Loid skill 3: Daya Tarik Black Hole
      caster.statusEffects = caster.statusEffects.filter(function (e) { return e.type !== "suck"; });
      caster.statusEffects.push({ type: "suck", turnsLeft: 9999 });
      logMessage("🌀 " + caster.name + " membuka daya tarik black hole: serangan musuh berikutnya akan tersedot ke dirinya.");
      fxBlackHole("swirl", caster);
      return true;
    }
    case "blackhole": { // Loid skill 6: Black Hole (tanpa dadu)
      if (!(caster.holeSize > 0)) {
        caster.holeSize = HOLE_START;
        logMessage("🕳️ " + caster.name + " memunculkan Black Hole kecil (" + HOLE_START + "). Belum meledak, membesar 2x lipat tiap putaran timmu. Pakai skill ini lagi untuk meledakkannya!");
        return true;
      }
      const size = caster.holeSize;
      caster.holeSize = 0;
      logMessage("💥 Black Hole " + caster.name + " meledak! Damage " + size + " ke seluruh musuh.");
      fxBlackHole("explode", caster, size);
      const boom = Object.assign({}, skill, { power: size / CARD_K, hits: 0 });
      targets.forEach(function (t) { resolveAttackOnTarget(caster, boom, t); });
      return true;
    }
    case "soulswap": { // Vloryn skill 5: tukar persentase HP dengan satu sekutu
      const t = targets[0];
      if (!t || t.id === caster.id || !t.alive) { logMessage(skill.name + ": pilih sekutu lain untuk bertukar jiwa."); return true; }
      const a = caster.currentHP, b = t.currentHP;
      caster.currentHP = Math.max(1, Math.min(caster.maxHP, b));
      t.currentHP = Math.max(1, Math.min(t.maxHP, a));
      logMessage("👻 " + caster.name + " bertukar jiwa dengan " + t.name + ": HP " + caster.name + " → " + caster.currentHP + ", HP " + t.name + " → " + t.currentHP + ".");
      return true;
    }
    case "soulcontrol": { // Victor skill 6: musuh dilukai kekuatannya sendiri
      targets.forEach(function (t) {
        const dmg = Math.max(1, Math.round(getEffectiveStat(t, "attack") * SOUL_CONTROL_POWER - getEffectiveStat(t, "defense") * 0.5));
        currentDamageSource = caster;
        try { applyDamage(t, dmg); } finally { currentDamageSource = null; }
        logMessage("🕷️ " + caster.name + " mengendalikan jiwa " + t.name + ": ia melukai dirinya sendiri (-" + dmg + " HP).");
      });
      return true;
    }
    case "poolheal": { // Dinara skill 6: satu kolam heal dibagi rata
      const alive = targets.filter(function (t) { return t.alive; });
      if (alive.length === 0) return true;
      const total = calculateHeal(caster, skill.power);
      const share = Math.max(1, Math.floor(total / alive.length));
      logMessage("🌼 " + caster.name + " memakai " + skill.name + ": " + total + " HP dibagi ke " + alive.length + " sekutu (+" + share + " masing-masing).");
      alive.forEach(function (t) { applyHeal(t, share); });
      return true;
    }
    case "hpx2": { // Loki skill 4: HP (sisa & max) seluruh tim jadi 2x selama n giliran
      const turns = skill.turns || 3;
      targets.forEach(function (t) {
        if (!t.alive || isFrozenUnit(t)) return;
        const fx = t.statusEffects.find(function (e) { return e.type === "hpx2"; });
        if (fx) { fx.turnsLeft = turns; return; } // sudah 2x: hanya diperpanjang
        t.maxHP *= 2;
        t.currentHP *= 2;
        t.hpx2Active = true;
        t.statusEffects.push({ type: "hpx2", turnsLeft: turns });
      });
      logMessage("⚖️ " + caster.name + ": HP seluruh tim jadi 2x lipat selama " + turns + " giliran!");
      return true;
    }
    case "mimicshield": { // Clay skill 2: perisai sebesar damage terakhir yang diterima
      const amount = Math.max(caster.lastDamageTaken || 0, calcShieldAmount(caster, skill));
      applyShield(caster, amount, { kind: "timed", turns: 2, basis: "source", sourceTeam: caster.team });
      logMessage("🎭 " + caster.name + " meniru damage yang ia terima menjadi perisai " + amount + ".");
      return true;
    }
    case "mimicnext": { // Clay skill 3: siap meniru skill musuh berikutnya
      caster.statusEffects = caster.statusEffects.filter(function (e) { return e.type !== "mimicnext"; });
      caster.statusEffects.push({ type: "mimicnext", turnsLeft: 9999 });
      logMessage("🎭 " + caster.name + " bersiap meniru skill musuh berikutnya.");
      return true;
    }
    case "mimicprev": { // Clay skill 4: meniru skill terakhir musuh
      const last = LAST_SKILL[foe];
      if (!last) {
        logMessage("🎭 Musuh belum memakai skill. " + caster.name + " menyerang biasa.");
        return false; // jadi serangan biasa dengan power skill ini
      }
      castCopy(caster, last, targets, false);
      return true;
    }
    case "doubleback": { // Clay skill 5: 2x damage terakhir yang diterima
      const dmg = Math.max(1, Math.round((caster.lastDamageTaken || 0) * 2));
      targets.forEach(function (t) {
        currentDamageSource = caster;
        try { applyDamage(t, dmg); } finally { currentDamageSource = null; }
        logMessage("🎭 " + caster.name + " melipatgandakan damage yang ia terima: " + t.name + " -" + dmg + " HP.");
      });
      return true;
    }
    case "mimicall": { // Clay skill 6: pinjam 6 skill musuh selama 4 kesempatan
      const t = targets[0];
      if (!t) return true;
      const borrowed = (t.ownSkills || t.skills).map(function (sk) { return makeBorrowed(caster, sk); });
      caster.skills = (caster.ownSkills || caster.skills).concat(borrowed);
      caster.statusEffects = caster.statusEffects.filter(function (e) { return e.type !== "borrow"; });
      caster.statusEffects.push({ type: "borrow", left: MIMIC_ALL_USES, from: t.name, turnsLeft: 9999, fresh: true });
      logMessage("🎭 " + caster.name + " meniru SEMUA skill " + t.name + "! Sekarang punya " + caster.skills.length + " skill selama " + MIMIC_ALL_USES + " kesempatan.");
      return true;
    }
    default:
      return false; // termasuk "boom" dan "teamregen": memakai loop biasa + efek tambahan
  }
}

/** Efek visual Black Hole (blackhole.js). Aman dipanggil walau berkas itu tidak termuat. */
function fxBlackHole(kind) {
  try {
    if (window.BlackHoleFX && typeof window.BlackHoleFX[kind] === "function") {
      window.BlackHoleFX[kind].apply(window.BlackHoleFX, Array.prototype.slice.call(arguments, 1));
    }
  } catch (e) { console.error(e); }
}

/** Efek tambahan setelah loop biasa: Afsoul, dkg, regen tim, Resonance. */
function castAfterEffects(caster, skill, targets, aliveFoesBefore) {
  if (skill.afsoul) {
    const gain = (skill.afsoulSolo && aliveFoesBefore === 1) ? skill.afsoulSolo : skill.afsoul;
    caster.afsoul = Math.min(AFSOUL_MAX, (caster.afsoul || 0) + gain);
    logMessage("👁 Afsoul " + caster.name + " +" + gain + " (total " + caster.afsoul + ").");
  }
  if (skill.dkg) {
    caster.dkg = (caster.dkg || 0) + skill.dkg;
    logMessage("💨 dkg " + caster.name + " +" + skill.dkg + " (total " + caster.dkg + ").");
  }
  if (skill.sp === "boom") {
    logMessage("💥 dkg " + caster.name + " kembali ke 0.");
    caster.dkg = 0;
  }
  if (skill.extraTurn && caster.alive) { // Jeff skill 5: timmu main lagi = giliran musuh dilewati
    const foeTeam = oppTeam(caster.team);
    PHASE_LOCK[foeTeam] += skill.extraTurn;
    logMessage("🌊 " + caster.name + ": timmu main lagi! Giliran " + (foeTeam === "enemy" ? "musuh" : "lawan") + " dilewati " + skill.extraTurn + "x.");
  }
  if (skill.regenPct) {
    targets.forEach(function (t) {
      if (!t.alive) return;
      t.statusEffects = t.statusEffects.filter(function (e) { return e.type !== "teamregen"; });
      t.statusEffects.push({ type: "teamregen", amount: Math.max(1, Math.round(t.maxHP * skill.regenPct)), turnsLeft: skill.regenTurns || 3 });
    });
    logMessage("💚 Regen tim aktif selama " + (skill.regenTurns || 3) + " putaran.");
  }
  if (currentSkillCtx && currentSkillCtx.dice && DICE_TABLE[currentSkillCtx.dice].stun) { // dadu 6
    targets.forEach(function (t) { if (t.alive) applyStatusEffect(caster, t, { type: "stun", chance: 1, turns: 1 }); });
  }
  if (skill.selfHealPower && caster.alive) { // Peter skill 5: pulih sendiri setelah menyerang
    const heal = calculateHeal(caster, skill.selfHealPower);
    const before = caster.currentHP;
    applyHeal(caster, heal);
    if (caster.currentHP > before) logMessage("✨ " + caster.name + " memulihkan diri +" + (caster.currentHP - before) + " HP.");
  }
  if (skill.teamBuffs) { // Loki skill 6: seluruh tim pemakai ikut menguat
    getAliveUnits(caster.team).forEach(function (u) {
      skill.teamBuffs.forEach(function (b) { applyStatusEffect(caster, u, b); });
    });
    logMessage("⚖️ Seluruh tim " + caster.name + " menguat: " + skill.teamBuffs.map(function (b) { return statLabel(b.stat); }).join(", ") + " x" + (1 + skill.teamBuffs[0].percent) + " (" + skill.teamBuffs[0].turns + " giliran).");
  }
  if (skill.selfStun && caster.alive) { // Loki skill 5: pemakai tidak bisa bermain
    caster.statusEffects.push({ type: "stun", turnsLeft: skill.selfStun });
    logMessage("⚖️ " + caster.name + " tidak bisa bermain " + skill.selfStun + " giliran.");
  }
  if (caster.powerSystem === "Confer") { // skill ke-n menambah n x 10% max Resonance
    const slot = Math.min(6, skillSlotOf(caster, skill)); // skill tiruan Clay dihitung seperti skill 6
    caster.resonance = Math.min(caster.maxResonance, caster.resonance + slot * CONFER_RES_STEP * caster.maxResonance);
  }
}

function runSkill(caster, skill, targets, isEnemy) {
  targets = filterSkillTargets(skill, targets); // concepts.js: yang beku tidak ikut terkena
  idleStreak = 0; // ada yang bertindak: bukan jalan buntu

  if (targets.length === 0) {
    if (isEnemy) {
      logMessage(caster.name + " tidak menemukan target yang bisa dikenai.");
      finishEnemyAction(caster);
    } else {
      logMessage(skill.name + " tidak punya target yang bisa dikenai.");
      renderArena();
    }
    return;
  }

  // Unit yang tadi ditarik sudah bertindak: efek Penarikan Kasar selesai.
  caster.statusEffects = caster.statusEffects.filter(function (e) { return e.type !== "pulled"; });

  // Daya Tarik Black Hole (Loid): serangan musuh berikutnya (damage apa pun) tersedot ke Loid.
  if (isAttackSkill(skill) && skill.sp !== "blackhole") {
    const sucker = allUnits.find(function (u) {
      return u.alive && u.team !== caster.team && hasEffect(u, "suck") && !isFrozenUnit(u);
    });
    if (sucker) {
      sucker.statusEffects = sucker.statusEffects.filter(function (e) { return e.type !== "suck"; });
      logMessage("🌀 Serangan " + caster.name + " tersedot black hole! Semua damage mengenai " + sucker.name + ".");
      fxBlackHole("beam", caster, sucker);
      targets = [sucker];
    }
  }

  // Letupan Black Hole (Loid): ikut menjangkau musuh di sebelah target (urutan kartu, tanpa acak).
  if (skill.alsoHit && isAttackSkill(skill) && targets.length === 1 && targets[0].team !== caster.team) {
    const foeList = allUnits.filter(function (u) { return u.team === targets[0].team; });
    const at = foeList.indexOf(targets[0]);
    let extra = 0;
    for (let i = 1; i < foeList.length && extra < skill.alsoHit; i++) {
      const cand = foeList[(at + i) % foeList.length];
      if (cand.alive && !isFrozenUnit(cand) && targets.indexOf(cand) === -1) {
        targets = targets.concat([cand]);
        extra += 1;
      }
    }
  }

  // Sinar Pedang Suci (Eugeo): hanya pemakai + sekutu tepat di sebelahnya.
  if (skill.nearOnly) targets = nearbyAllies(caster, targets);
  // Hujan Petir netral / Penekanan Mana: target selalu dihitung ulang dari aturannya.
  if (skill.neutral || skill.onlyMagic) targets = getValidTargets(caster, skill);
  if (targets.length === 0) {
    logMessage(skill.name + " tidak punya target yang bisa dikenai.");
    if (isEnemy) finishEnemyAction(caster); else renderArena();
    return;
  }

  caster.currentMana -= skill.manaCost;
  if (skill.oncePerBattle) caster.onceUsed[skill.id] = true;

  const foe = oppTeam(caster.team);
  const hpBefore = sumTeamHp(foe);
  const aliveFoesBefore = getAliveUnits(foe).length;
  const isAttack = skill.type === "single_attack" || skill.type === "area_attack";

  const ctx = { caster: caster, skill: skill, aliveFoes: aliveFoesBefore, dice: 0, diceMult: 0 };
  if (skill.dice) {
    ctx.dice = 1 + Math.floor(Math.random() * 6);
    ctx.diceMult = DICE_TABLE[ctx.dice].mult;
    logMessage("🎲 " + caster.name + " melempar dadu: " + ctx.dice + "! " + DICE_TABLE[ctx.dice].text + ".");
    try { showDiceRoll(ctx.dice); } catch (e) { /* tampilan saja */ }
  }
  currentSkillCtx = ctx;
  try {
    let handled = false;
    if (skill.sp) handled = castSpecial(caster, skill, targets);
    if (!handled) {
      const useSkill = skill.sp === "boom" ? dynamicBoomSkill(caster, skill) : skill;
      applyNormalSkill(caster, useSkill, targets);
    }
    castAfterEffects(caster, skill, targets, aliveFoesBefore);
  } finally {
    currentSkillCtx = null;
  }

  tickBorrowedSkills(caster);

  // Dicatat untuk Clay (meniru skill musuh), lalu Clay yang sedang bersiap langsung meniru.
  if (!skill.isCopy && !(skill.sp && skill.sp.indexOf("mimic") === 0)) {
    LAST_SKILL[caster.team] = { skill: skill, atk: getEffectiveStat(caster, "attack"), casterId: caster.id };
    triggerMimicNext(caster, skill, targets);
  }

  // Blood Essence: menyerang memberi essence = 50% dari damage yang benar-benar masuk
  if (caster.powerSystem === "Mutation" && isAttack && caster.alive) {
    const lost = Math.max(0, hpBefore - sumTeamHp(foe));
    const gain = Math.round(lost * ESSENCE_GAIN_PERCENT);
    if (gain > 0) {
      caster.essence = Math.min(caster.maxEssence, caster.essence + gain);
      logMessage("🩸 Blood Essence " + caster.name + " +" + gain + " (" + Math.round(caster.essence) + "/" + caster.maxEssence + ").");
    }
  }

  renderArena();
  checkBattleEnd();
  if (battleEnded) return;

  if (isEnemy) finishEnemyAction(caster);
  else finishPlayerAction(caster);
}

function executeSkill(caster, skill, targets) {
  // Segel Suci (Clefa): pemain memilih dulu skill 1-5 musuh yang mau disegel.
  if (skill.seal && skill.seal.slot === "pick" && !SEAL_PICK && targets[0] && targets[0].team !== caster.team) {
    showSealPicker(targets[0], function (slot) {
      SEAL_PICK = slot;
      try { runSkill(caster, skill, targets, false); } finally { SEAL_PICK = null; }
    });
    return;
  }
  runSkill(caster, skill, targets, false);
}

/** Jendela pilih skill musuh yang disegel. onPick(slot) dipanggil setelah pemain memilih. */
function showSealPicker(target, onPick) {
  const old = document.getElementById("seal-picker");
  if (old) old.remove();
  const box = document.createElement("div");
  box.id = "seal-picker";
  box.className = "seal-picker";
  const inner = document.createElement("div");
  inner.className = "seal-picker-box";
  const title = document.createElement("p");
  title.className = "seal-picker-title";
  title.textContent = "🔏 Segel skill " + target.name + " yang mana? (2 giliran)";
  inner.appendChild(title);
  (target.ownSkills || target.skills).slice(0, 5).forEach(function (sk, i) {
    const b = document.createElement("button");
    b.className = "seal-picker-btn";
    b.textContent = (i + 1) + ". " + sk.name;
    if (isSkillSealed(target, sk)) { b.disabled = true; b.textContent += " (sudah disegel)"; }
    b.addEventListener("click", function () { box.remove(); onPick(i + 1); });
    inner.appendChild(b);
  });
  const cancel = document.createElement("button");
  cancel.className = "seal-picker-btn seal-picker-cancel";
  cancel.textContent = "Batal";
  cancel.addEventListener("click", function () { box.remove(); });
  inner.appendChild(cancel);
  box.appendChild(inner);
  document.body.appendChild(box);
}

function executeSkillForEnemy(caster, skill, targets) {
  hideEnemyThinking();
  runSkill(caster, skill, targets, true);
}


/* ============================================
   BAGIAN 6: INTERAKSI PEMAIN (panel skill, Re-charge, tap karakter)
   ============================================ */

function onSkillButtonClick(skillId) {
  if (!pendingActor) return;
  const skill = pendingActor.skills.find(function (s) { return s.id === skillId; });
  if (!skill) return;
  if (unitSkillBlocked(pendingActor, skill)) return; // energi kurang / Blind / 1x per pertarungan / syarat khusus

  pendingSkill = skill;

  if (skillNeedsManualTarget(skill)) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderArena();
    showSkillPanel(pendingActor);
  } else {
    executeSkill(pendingActor, skill, getValidTargets(pendingActor, skill));
  }
}

/** Teks pendek alasan skill terkunci di tombol. */
function blockedLabel(reason) {
  if (reason === "blind") return "🕶 Blind: target terkunci";
  if (reason === "sekali") return "Sudah dipakai (1x)";
  if (reason === "tertarik") return "🕳️ Tertarik: harus menyerang";
  if (reason === "energi") return "";
  if (reason === "disegel") return "🔏 Disegel";
  return reason ? "Belum bisa: " + reason : "";
}

function showSkillPanel(unit) {
  if (typeof hideItemPanel === "function") hideItemPanel(true);
  const panel = document.getElementById("skill-panel");
  const title = document.getElementById("skill-panel-title");
  const list = document.getElementById("skill-list");

  title.textContent = (bonusUnitId === unit.id ? "⚡ Giliran ekstra " : "Giliran ") + unit.name + " - pilih skill" +
    (unit.blindNow ? "  ·  🕶 BLIND: skill pilih-target terkunci" : "");
  list.innerHTML = "";

  unit.skills.forEach(function (skill, index) {
    const btn = document.createElement("button");
    btn.className = "skill-btn";
    if (pendingSkill && pendingSkill.id === skill.id) btn.classList.add("skill-selected");

    const reason = unitSkillBlocked(unit, skill);
    btn.disabled = !!reason || getValidTargets(unit, skill).length === 0;
    if (reason === "blind") btn.classList.add("skill-blind-locked");

    const preview = getSkillPreviewText(unit, skill);
    const targetLabel = getTargetLabel(skill.target);
    const note = blockedLabel(reason);

    btn.innerHTML = "<span class='skill-name'>" + (index + 1) + ". " + skill.name + "</span>" +
      "<span class='skill-cost'>" + skill.manaCost + " " + unitEnergyName(unit) + " · " + targetLabel + "</span>" +
      (preview ? "<span class='skill-preview'>" + preview + "</span>" : "") +
      (note ? "<span class='skill-note'>" + note + "</span>" : "");

    btn.addEventListener("click", function () { onSkillButtonClick(skill.id); });
    list.appendChild(btn);
  });

  // Tombol Re-charge (Artifact): TIDAK memakan giliran
  if (canOfferRecharge(unit)) {
    const rc = document.createElement("button");
    rc.className = "skill-btn recharge-btn";
    rc.innerHTML = "<span class='skill-name'>🔋 Re-charge</span>" +
      "<span class='skill-cost'>Gratis, tidak memakan giliran</span>" +
      "<span class='skill-preview'>Charging Energy " + CHARGE_WAIT_TURNS + " giliran, lalu Charge penuh. Selama itu tidak bisa dipakai.</span>";
    rc.addEventListener("click", function () {
      startCharging(unit);
      pendingActor = null;
      pendingSkill = null;
      hideSkillPanel();
      renderArena();
    });
    list.appendChild(rc);
  }

  panel.classList.remove("hidden");
  document.body.classList.add("skill-panel-open");
}

onUnitSlotClick = (function (orig) {
  return function (unitId) {
    const unit = getUnitById(unitId);
    const selecting = !pendingItem && !(pendingActor && pendingSkill);
    if (unit && selecting && currentPhase === "player" && !battleEnded && unit.team === "player" && unit.alive && isChargingUnit(unit)) {
      logMessage("🔋 " + unit.name + " sedang Charging Energy (" + unit.charging + " giliran lagi), belum bisa dipakai.");
      return;
    }
    return orig(unitId);
  };
})(onUnitSlotClick);

// Aksi pemain selesai: karakter Mutation lain yang diabaikan kehilangan essence.
finishPlayerAction = (function (orig) {
  return function (unit, skipped) {
    if (REVIVE_ACT && !battleEnded) { // Anugrah Sakura: yang dihidupkan langsung bermain
      const r = REVIVE_ACT;
      REVIVE_ACT = null;
      if (r.alive && r.team === "player") {
        mutationIgnore("player", unit || null);
        if (unit) unit.blindNow = false;
        totalPlayerTurns += 1;
        pendingSkill = null;
        hideSkillPanel();
        bonusUnitId = r.id;
        pendingActor = r;
        showSkillPanel(r);
        renderArena();
        return;
      }
    }
    if (!battleEnded) mutationIgnore("player", unit || null);
    if (unit) unit.blindNow = false;
    return orig(unit, skipped);
  };
})(finishPlayerAction);

finishEnemyAction = (function (orig) {
  return function (unit) {
    if (REVIVE_ACT && !battleEnded && REVIVE_ACT.team === "enemy" && REVIVE_ACT.alive) {
      const r = REVIVE_ACT;
      REVIVE_ACT = null;
      mutationIgnore("enemy", unit || null);
      setTimeout(function () {
        if (battleEnded) return;
        const d = decideEnemyAction(r);
        if (d) executeSkillForEnemy(r, d.skill, d.targets);
        else orig(r);
      }, 900);
      return;
    }
    REVIVE_ACT = null;
    if (!battleEnded) mutationIgnore("enemy", unit || null);
    if (unit) unit.blindNow = false;
    return orig(unit);
  };
})(finishEnemyAction);

// Giliran ekstra (Swiftness): timer diulang supaya pemain punya waktu penuh lagi.
grantSwiftBonus = (function (orig) {
  return function (unit) {
    const granted = orig(unit);
    if (granted) startPlayerTimer();
    return granted;
  };
})(grantSwiftBonus);


/* ============================================
   BAGIAN 7: TEKS PRATINJAU & LENCANA STATUS
   ============================================ */

getSkillPreviewText = (function (orig) {
  return function (unit, skill) {
    const atk = getEffectiveStat(unit, "attack");
    if (skill.sp === "boom") {
      const dmg = Math.round(atk * (unit.dkg || 0) * 0.5 / CARD_K);
      return "~" + dmg + " dmg ke semua musuh (50% dari dkg " + (unit.dkg || 0) + "), dkg → 0";
    }
    if (skill.sp === "nightmare") return "Blind + curi giliran musuh x" + (unit.afsoul || 0) + " (Afsoul), lalu Afsoul → 0";
    if (skill.sp === "timelock") return "Time Frozen: curi " + (skill.lock || 3) + " giliran musuh (bukan stun)";
    if (skill.sp === "mirror") return "Pantulkan semua damage " + MIRROR_TURNS + " putaran";
    if (skill.sp === "hpequal") return "HP semua sekutu = " + unit.currentHP + " (HP-mu sekarang)";
    if (skill.sp === "blackhole") {
      if (unit.holeSize > 0) return "Ledakkan Black Hole " + unit.holeSize + ": ~" + Math.round(atk * unit.holeSize / CARD_K) + " dmg ke semua musuh";
      return "Munculkan Black Hole " + HOLE_START + " (2x lipat tiap putaran, maks " + HOLE_MAX + ")";
    }
    if (skill.sp === "pull") return "Tarik 1 musuh: kesempatan berikutnya harus menyerang " + unit.name;
    if (skill.sp === "suck") return "Serangan musuh berikutnya tersedot ke " + unit.name + " (damage apa pun)";
    if (skill.sp === "revive") return "Hidupkan 1 sekutu ~" + calculateHeal(unit, skill.power) + " HP" + (skill.reviveAct ? " · langsung bermain" : "");
    if (skill.sp === "hpx2") return "HP seluruh tim x2 (" + (skill.turns || 3) + "t), lalu dibagi 2";
    if (skill.sp === "doubleback") return "~" + Math.round((unit.lastDamageTaken || 0) * 2) + " dmg (2x damage terakhir yang kamu terima)";
    if (skill.sp === "mimicall") return "Pinjam 6 skill 1 musuh (" + MIMIC_ALL_USES + " kesempatan)";
    if (skill.sp === "soulswap") return "Tukar persentase HP dengan 1 sekutu";
    if (skill.sp === "soulcontrol") return "Musuh kena ATK-nya sendiri x" + SOUL_CONTROL_POWER;
    if (skill.sp === "poolheal") return "~" + calculateHeal(unit, skill.power) + " heal dibagi rata ke tim · timmu main lagi";
    if (skill.sp === "mimicshield") return "Perisai ~" + Math.max(unit.lastDamageTaken || 0, calcShieldAmount(unit, skill)) + " (damage terakhir yang diterima)";
    if (skill.sp === "mimicnext") return "Tiru skill musuh berikutnya (gratis)";
    if (skill.sp === "mimicprev") {
      const last = LAST_SKILL[oppTeam(unit.team)];
      return last ? "Tiru: " + last.skill.name : "~" + Math.round(atk * skill.power) + " dmg (belum ada skill musuh)";
    }

    let text = orig(unit, skill);
    if (skill.effect && skill.effect.type === "blind") {
      text += (text ? " · " : "") + "🕶 Blind " + skill.effect.turns + "t";
    }
    if (skill.afsoul) text += (text ? " · " : "") + "Afsoul +" + skill.afsoul + (skill.afsoulSolo ? " (+" + skill.afsoulSolo + " kalau musuh tinggal 1)" : "");
    if (skill.dkg) text += (text ? " · " : "") + "dkg +" + skill.dkg;
    if (skill.regenPct) text += (text ? " · " : "") + "Regen " + Math.round(skill.regenPct * 100) + "% HP x" + (skill.regenTurns || 3) + " putaran";
    if (skill.alsoHit) text += (text ? " · " : "") + "juga kena " + skill.alsoHit + " musuh di sebelah target";
    if (skill.extraTurn) text += (text ? " · " : "") + "timmu main lagi";
    if (skill.oncePerBattle) text += (text ? " · " : "") + "1x per pertarungan";
    const add = function (t) { text += (text ? " · " : "") + t; };
    (skill.effects || []).forEach(function (e) { add("+" + Math.round(e.percent * 100) + "% " + statLabel(e.stat) + " (" + e.turns + "t)"); });
    if (skill.teamBuffs) add("tim " + skill.teamBuffs.map(function (b) { return statLabel(b.stat); }).join("/") + " x" + (1 + skill.teamBuffs[0].percent) + " (" + skill.teamBuffs[0].turns + "t)");
    if (skill.selfStun) add("kamu tidak bisa bermain " + skill.selfStun + "t");
    if (skill.onlyMagic) add("hanya pengguna sihir");
    if (skill.neutral) add("⚠ kena kawan & lawan");
    if (skill.antiHeal) add("🚫 Tolak Heal " + skill.antiHeal + "t");
    if (skill.reflect) add("🔁 " + (skill.reflect.mode === "spread" ? "Pantul ke semua tim penyerang" : skill.reflect.mode === "ownMaxHp" ? "Balik " + Math.round(skill.reflect.percent * 100) + "% max HP" : "Balik " + skill.reflect.percent + "x dmg") + " (" + skill.reflect.turns + "t)");
    if (skill.deathMark) add("☠️ +1 tanda kematian");
    if (skill.markExec) add("batas +25%/tanda");
    if (skill.lockOn) add("🎯 kunci " + skill.lockOn + "t");
    if (skill.needsLock) add("🎯 hanya ke target terkunci");
    if (skill.dmgReduce) add("🪞 Damage masuk -" + Math.round(skill.dmgReduce.percent * 100) + "% (" + skill.dmgReduce.turns + "t)");
    if (skill.seal) add("🔏 Segel " + (skill.seal.slot === "pick" ? "skill pilihanmu (1-5)" : skill.seal.slot === "strongest" ? "skill terkuat" : "skill " + skill.seal.slot) + (skill.seal.turns === "caster" ? " (sampai kamu kalah)" : " (" + skill.seal.turns + "t)"));
    if (skill.manaDrain) add("Energi musuh -" + Math.round(skill.manaDrain * 100) + "%");
    if (skill.nerf) add("🧊 " + skill.nerf.stats.map(statLabel).join("&") + " musuh -" + Math.round(skill.manaCost * skill.nerf.ratio) + " (" + skill.nerf.turns + "t)");
    if (skill.selfHealPower) add("pulih diri ~" + Math.round(atk * skill.selfHealPower));
    if (skill.ignoreDef) add("tembus DEF");
    if (skill.soloBonus) add("+" + Math.round(skill.soloBonus * 100) + "% kalau musuh tinggal 1");
    if (skill.bonusVsDebuff) add("+" + Math.round(skill.bonusVsDebuff * 100) + "% ke target terkunci");
    if (skill.dice) add("🎲 dadu: 1 lemah · 4-5 x1,5 · 6 x2 + stun");
    if (skill.nearOnly) add("diri + sekutu sebelah");
    if (unit.powerSystem === "Confer") {
      const slot = skillSlotOf(unit, skill);
      text += (text ? " · " : "") + "Resonance +" + Math.round(Math.min(6, slot) * CONFER_RES_STEP * 100) + "%";
    }
    return text;
  };
})(getSkillPreviewText);

getStatusBadgeText = (function (orig) {
  return function (effect) {
    if (effect.type === "blind") return "🕶 Blind " + effect.turnsLeft + "t";
    if (effect.type === "teamregen") return "💚 Regen " + effect.turnsLeft + "t";
    if (effect.type === "pulled") return "🕳️ Tertarik";
    if (effect.type === "suck") return "🌀 Daya Tarik";
    if (effect.type === "antiheal") return "🚫 Tolak Heal " + effect.turnsLeft + "t";
    if (effect.type === "reflect") return "🔁 Pantul " + effect.turnsLeft + "t";
    if (effect.type === "deathmark") return "☠️ Tanda " + effect.stacks;
    if (effect.type === "locked") return "🎯 Terkunci " + effect.turnsLeft + "t";
    if (effect.type === "dmgreduce") return "🪞 -" + Math.round(effect.percent * 100) + "% dmg " + effect.turnsLeft + "t";
    if (effect.type === "seal") return "🔏 Segel S" + effect.slot + (effect.by ? "" : " " + effect.turnsLeft + "t");
    if (effect.type === "nerf") return "🧊 " + statLabel(effect.stat) + " -" + effect.amount + " " + effect.turnsLeft + "t";
    if (effect.type === "mimicnext") return "🎭 Siap meniru";
    if (effect.type === "borrow") return "🎭 Tiruan " + effect.left + "x";
    if (effect.type === "hpx2") return "⚖️ HP x2 " + effect.turnsLeft + "t";
    if (effect.type === "dot" && effect.by) return (effect.stat === "burn" ? "🔥 " : "☠️ ") + effect.amount + " (permanen)";
    return orig(effect);
  };
})(getStatusBadgeText);

describeStatusEffect = (function (orig) {
  return function (effect) {
    if (effect.type === "blind") return "🕶 Blind: tidak bisa memilih target (skill pilih-target terkunci), sisa " + effect.turnsLeft + " giliran.";
    if (effect.type === "teamregen") return "💚 Regen tim: +" + effect.amount + " HP tiap putaran, sisa " + effect.turnsLeft + " putaran.";
    if (effect.type === "pulled") return "🕳️ Tertarik: di kesempatan berikutnya karakter ini HARUS menyerang penariknya (skill non-serangan terkunci).";
    if (effect.type === "suck") return "🌀 Daya Tarik: serangan musuh berikutnya (damage apa pun) tersedot dan seluruhnya mengenai karakter ini.";
    if (effect.type === "antiheal") return "🚫 Tolak Heal: tidak bisa disembuhkan dengan cara apa pun, sisa " + effect.turnsLeft + " giliran.";
    if (effect.type === "reflect") return "🔁 Pantulan: " + reflectText(effect) + ", sisa " + effect.turnsLeft + " giliran.";
    if (effect.type === "deathmark") return "☠️ Tanda kematian x" + effect.stacks + ": batas eksekusi Curse of Death ke karakter ini +" + Math.round(effect.stacks * DEATHMARK_STEP * 100) + "%.";
    if (effect.type === "locked") return "🎯 Terkunci: bisa ditembak Deadly Eye, sisa " + effect.turnsLeft + " giliran.";
    if (effect.type === "dmgreduce") return "🪞 Damage yang masuk berkurang " + Math.round(effect.percent * 100) + "%, sisa " + effect.turnsLeft + " giliran.";
    if (effect.type === "seal") return "🔏 Skill " + effect.slot + " disegel, tidak bisa dipakai" + (effect.by ? " sampai penyegelnya kalah." : " (sisa " + effect.turnsLeft + " giliran).");
    if (effect.type === "nerf") return "🧊 Nerf: " + statLabel(effect.stat) + " berkurang " + effect.amount + ", sisa " + effect.turnsLeft + " giliran.";
    if (effect.type === "mimicnext") return "🎭 Siap meniru: skill musuh berikutnya langsung ditiru dan dipakai balik.";
    if (effect.type === "borrow") return "🎭 Meniru semua skill " + effect.from + ": sisa " + effect.left + " kesempatan.";
    if (effect.type === "hpx2") return "⚖️ Kelipatan Pertahanan: HP 2x lipat, sisa " + effect.turnsLeft + " giliran. Setelah habis, sisa HP dibagi 2.";
    if (effect.type === "dot" && effect.by) return (effect.stat === "burn" ? "🔥 Bakar" : "☠️ Racun") + " permanen: -" + effect.amount + " HP tiap giliran selama pemakainya masih hidup.";
    return orig(effect);
  };
})(describeStatusEffect);


/* ============================================
   BAGIAN 8: ALUR GILIRAN (curi giliran, timer, lewati)
   ============================================ */

/** Regen mana/charge OTOMATIS untuk seluruh karakter hidup satu tim di awal gilirannya. */
function regenerateTeamEnergy(team) {
  const gained = [];
  allUnits.forEach(function (u) {
    if (u.team !== team || !u.alive || isChargingUnit(u)) return;
    const before = u.currentMana;
    regenerateManaAtTurnStart(u); // aturan per-unit (10% / Charge / Mutation / Confer) tetap dipakai
    const diff = u.currentMana - before;
    if (diff > 0) gained.push(u.name + " +" + diff);
  });
  if (gained.length > 0) logMessage("🔷 Pemulihan energi: " + gained.join(", ") + ".");
}

/** Memulai fase sebuah tim (dipakai giliran normal maupun giliran tambahan hasil curian). */
function beginTeamPhase(team) {
  currentPhase = team;
  tickShields(team); // concepts.js
  regenerateTeamEnergy(team); // regen mana otomatis saat giliran berganti
  onTeamTurnStart(team);
  checkBattleEnd();
  if (battleEnded) return;

  if (team === "enemy") {
    logMessage("Giliran musuh.");
    renderArena();
    showEnemyThinking();
    setTimeout(performOneEnemyTurn, ENEMY_THINK_DELAY);
  } else {
    hideEnemyThinking();
    logMessage("Giliran timmu.");
    renderArena();
    startPlayerTimer();
  }
}

function advanceTurn() {
  checkBattleEnd();
  if (battleEnded) return;
  stopPlayerTimer();

  const from = currentPhase; // tim yang baru saja beraksi
  const to = oppTeam(from);
  teamActionDone(from);      // hitung mundur Charging Energy

  // Giliran dicuri (Time Frozen / Nightmare): tim `to` dilewati, tim `from` jalan lagi.
  if (PHASE_LOCK[to] > 0) {
    PHASE_LOCK[to] -= 1;
    logMessage("⏳ Giliran " + (to === "enemy" ? "musuh" : "timmu") + " dicuri (sisa " + PHASE_LOCK[to] + "). Waktu tetap mengalir.");
    stolenTurnTick(to);
    checkBattleEnd();
    if (battleEnded) return;
    beginTeamPhase(from);
    return;
  }
  beginTeamPhase(to);
}

/* ---------- Jalan buntu: kedua pihak sama-sama tidak bisa bertindak lagi ---------- */
const STALEMATE_LIMIT = 8; // berapa kali giliran kosong beruntun sebelum dianggap seri
let idleStreak = 0;

function noteIdleTurn() {
  idleStreak += 1;
  if (idleStreak >= STALEMATE_LIMIT && !battleEnded) declareStalemate();
}

function declareStalemate() {
  battleEnded = true;
  stopPlayerTimer();
  hideEnemyThinking();
  hideSkillPanel();
  if (typeof hideItemPanel === "function") hideItemPanel();
  logMessage("=== JALAN BUNTU: kedua pihak kehabisan energi dan tidak bisa bertindak ===");
  handleBattleLoss(); // account.js: tanpa hadiah
  const title = document.getElementById("result-title");
  if (title) title.textContent = "Jalan Buntu (Seri)";
  hideTurnControls();
}

/** Pemain melewatkan giliran (waktu habis atau tombol Loncatkan Giliran). */
function passPlayerTurn(reason) {
  if (battleEnded || currentPhase !== "player") return;
  if (!playerHasMovableUnit()) noteIdleTurn(); // hanya giliran kosong yang dihitung
  if (battleEnded) return;
  if (typeof hideItemPanel === "function") hideItemPanel(true);
  try { pendingItem = null; } catch (e) { /* abaikan */ }
  pendingActor = null;
  pendingSkill = null;
  bonusUnitId = null;
  hideSkillPanel();
  totalPlayerTurns += 1;
  mutationIgnore("player", null); // melewatkan aksi = semua Mutation diabaikan
  logMessage(reason === "timeout" ? "⏱ Waktu habis! Giliran langsung berganti." : "⏭ Giliran dilewati.");
  advanceTurn();
}

/* ---------- Timer giliran pemain ---------- */
let turnTimerId = null;
let turnTimerLeft = 0;
let turnTimerTotal = 0;

function stopPlayerTimer() {
  if (turnTimerId !== null) { clearInterval(turnTimerId); turnTimerId = null; }
  setTimerUi(false);
}

function startPlayerTimer() {
  stopPlayerTimer();
  const secs = getTurnSeconds(); // difficulty.js (easy = 0 = tanpa timer)
  if (!secs || battleEnded) return;
  turnTimerTotal = secs * 1000;
  turnTimerLeft = turnTimerTotal;
  setTimerUi(true);
  updateTimerUi();
  turnTimerId = setInterval(function () {
    if (battleEnded || currentPhase !== "player") { stopPlayerTimer(); return; }
    // dijeda saat menu terbuka atau layar loading arena masih tampil
    if (window.battlePaused || document.getElementById("arena-intro")) return;
    turnTimerLeft -= 100;
    updateTimerUi();
    if (turnTimerLeft <= 0) {
      stopPlayerTimer();
      passPlayerTurn("timeout");
    }
  }, 100);
}

/* ---------- Tick Resonance Confer (0,2 detik waktu nyata) ---------- */
function battleIsLive() {
  const bs = document.getElementById("battle-screen");
  return !!bs && !bs.classList.contains("hidden") && allUnits.length > 0 && !battleEnded &&
    !window.battlePaused && !document.getElementById("arena-intro");
}

function resonanceShieldLayer(unit) {
  unit.shieldLayers = unit.shieldLayers || [];
  let layer = unit.shieldLayers.find(function (l) { return l.tag === "resonance"; });
  if (!layer) {
    layer = { kind: "amount", amount: 0, turnsLeft: null, basis: "target", sourceTeam: unit.team, tag: "resonance" };
    unit.shieldLayers.push(layer);
  }
  return layer;
}

function conferTick() {
  if (!battleIsLive()) return;
  let needFullRender = false;
  const touched = [];

  allUnits.forEach(function (u) {
    if (!u.alive || u.powerSystem !== "Confer" || isFrozenUnit(u)) return;

    // Efek Resonance: 1% dari 50% Resonance saat itu
    if (u.resonance > 0) {
      const x = u.resonance * CONFER_TICK_RES_SHARE * CONFER_TICK_PERCENT;
      const layer = resonanceShieldLayer(u);
      layer.amount = Math.min(u.maxHP * CONFER_SHIELD_CAP, layer.amount + x); // shield untuk dirinya sendiri
      syncShieldTotal(u);
      touched.push(u);
      getAliveUnits(oppTeam(u.team)).forEach(function (t) {
        const wasAlive = t.alive;
        quietDamage(t, x, u); // damage ke semua musuh
        touched.push(t);
        if (wasAlive && !t.alive) needFullRender = true;
      });
    }

    // Energy habis (tidak ada skill yang terbayar): Resonance berkurang
    const minCost = Math.min.apply(null, u.skills.map(function (s) { return s.manaCost; }));
    if (u.currentMana < minCost && u.resonance > 0) {
      u.resonance = Math.max(0, u.resonance - u.maxMana * CONFER_DECAY_PERCENT);
      touched.push(u);
    }
  });

  if (needFullRender) {
    renderArena();
    checkBattleEnd();
  } else {
    touched.forEach(updateUnitBarsInPlace); // update di tempat, layar tidak digambar ulang
  }
}
setInterval(conferTick, CONFER_TICK_MS);

// Setelah pertarungan selesai, hentikan timer & tombol.
checkBattleEnd = (function (orig) {
  return function () {
    const r = orig();
    if (battleEnded) { stopPlayerTimer(); hideTurnControls(); }
    return r;
  };
})(checkBattleEnd);

initBattle = (function (orig) {
  return function (chosenPlayerTeam, enemyCharacterOverride) {
    LAST_SKILL.player = null; LAST_SKILL.enemy = null;
    PHASE_LOCK.player = 0;
    PHASE_LOCK.enemy = 0;
    idleStreak = 0;
    stopPlayerTimer();
    orig(chosenPlayerTeam, enemyCharacterOverride);
    if (typeof arenaMode !== "undefined" && arenaMode === "roulette" && typeof rouletteNote !== "undefined" && rouletteNote) {
      logMessage(rouletteNote);
    }
    startPlayerTimer();
    refreshTurnControls();
  };
})(initBattle);


/* ============================================
   BAGIAN 9: GILIRAN MUSUH & AI
   ============================================ */

function enemyCanAct(u) {
  return u.skills.some(function (s) { return !unitSkillBlocked(u, s); });
}

function performOneEnemyTurn() {
  if (battleEnded) return;

  const aliveEnemies = getAliveUnits("enemy");
  if (aliveEnemies.length === 0) { checkBattleEnd(); return; }

  // Pilih aktor. Artifact yang kehabisan Charge melakukan Re-charge (gratis),
  // lalu AI memilih karakter lain untuk bertindak di giliran ini.
  let actor = null;
  for (let guard = 0; guard < 8; guard++) {
    const cands = aliveEnemies.filter(function (u) { return u.alive && !isChargingUnit(u); });
    if (cands.length === 0) break;
    const cfg = getDifficultyConfig();
    const level = cfg ? aiLevelOf(cfg) : null;
    let pool = cands;
    if (level === "hard" || level === "extreme") { // AI pintar: utamakan yang benar-benar bisa beraksi
      const able = cands.filter(enemyCanAct);
      if (able.length > 0) pool = able;
    }
    const a = pickEnemyActor(pool);
    if (aiNeedsRecharge(a)) { startCharging(a); continue; }
    actor = a;
    break;
  }

  if (!actor) {
    logMessage("Musuh tidak bisa bergerak (Charging Energy), melewati giliran.");
    renderArena();
    noteIdleTurn();
    if (battleEnded) return;
    finishEnemyAction(null);
    return;
  }

  const mustSkip = processStatusEffectsAtTurnStart(actor);
  renderArena();

  if (!actor.alive) { finishEnemyAction(actor); return; }
  if (mustSkip) { finishEnemyAction(actor); return; }

  runEnemyItemPhase(actor); // enemyAI.js
  if (battleEnded) return;
  if (!actor.alive) { finishEnemyAction(actor); return; }

  const decision = decideEnemyAction(actor);
  if (!decision) {
    logMessage(actor.name + " tidak menemukan aksi yang bisa dipakai, melewati giliran.");
    noteIdleTurn();
    if (battleEnded) return;
    finishEnemyAction(actor);
    return;
  }

  if (isUltimateSkill(actor, decision.skill)) {
    actor.ultimateUsed = true;
    actor.ultimateCount = (actor.ultimateCount || 0) + 1;
  }

  setTimeout(function () {
    executeSkillForEnemy(actor, decision.skill, decision.targets);
  }, 700);
}

/** Keputusan AI untuk skill khusus (aiManual). Dikembalikan null kalau tidak ada yang layak. */
function decideSpecialAI(actor, cfg) {
  const level = cfg ? aiLevelOf(cfg) : "normal";
  const chance = { easy: 0.25, normal: 0.6, hard: 0.85, extreme: 1 }[level];
  if (Math.random() > (chance === undefined ? 0.6 : chance)) return null;

  const foes = getAliveUnits(oppTeam(actor.team));
  const allies = getAliveUnits(actor.team).filter(function (u) { return !isFrozenUnit(u); });
  if (foes.length === 0) return null;
  const ultLimit = cfg ? cfg.ultLimit : 1;
  let best = null;

  actor.skills.forEach(function (s) {
    if (!s.aiManual || unitSkillBlocked(actor, s)) return;
    if (isUltimateSkill(actor, s) && (actor.ultimateCount || 0) >= ultLimit) return;

    let score = -1;
    let targets = null;

    if (s.sp === "revive") {
      const dead = allUnits.filter(function (u) { return u.team === actor.team && !u.alive; })
        .sort(function (a, b) { return b.maxHP - a.maxHP; });
      if (dead.length > 0 && hpPercent(actor) > 0.6) { score = 100; targets = [dead[0]]; }
    } else if (s.sp === "soulswap") {
      const low = allies.filter(function (u) { return u.id !== actor.id && hpPercent(u) < 0.35; })
        .sort(function (a, b) { return hpPercent(a) - hpPercent(b); });
      if (low.length > 0 && hpPercent(actor) > 0.7) { score = 65; targets = [low[0]]; }
    } else if (s.sp === "hpequal") {
      let gain = 0;
      allies.forEach(function (u) { if (u.id !== actor.id) gain += Math.min(u.maxHP, actor.currentHP) - u.currentHP; });
      if (gain > actor.maxHP * 0.3) { score = 70; targets = allies; }
    } else if (s.sp === "doubleback") {
      const dmg = (actor.lastDamageTaken || 0) * 2;
      const t = foes.filter(function (f) { return !isFrozenUnit(f); }).sort(function (a, b) { return a.currentHP - b.currentHP; })[0];
      if (t && dmg >= actor.attack * 1.2) { score = 60 + (dmg >= effectiveHp(t) ? 30 : 0); targets = [t]; }
    } else if (s.sp === "mimicall") {
      const t = foes.filter(function (f) { return !isFrozenUnit(f); }).sort(function (a, b) { return b.maxMana - a.maxMana; })[0];
      if (t) { score = 50; targets = [t]; }
    } else if (s.sp === "nightmare") {
      const need = level === "extreme" ? 2 : 3;
      if ((actor.afsoul || 0) >= need && PHASE_LOCK[oppTeam(actor.team)] === 0) { score = 90; targets = foes; }
    } else if (s.sp === "boom") {
      const power = Math.max(0.05, (actor.dkg || 0) * 0.5 / CARD_K);
      let total = 0, kills = 0, foeHp = 0;
      foes.forEach(function (t) {
        const d = calculateDamage(actor, t, power);
        total += Math.min(d, effectiveHp(t));
        if (d >= effectiveHp(t)) kills += 1;
        foeHp += effectiveHp(t);
      });
      if (kills > 0 || total >= foeHp * 0.3) { score = 80 + kills * 10; targets = foes; }
    } else if (s.sp === "timelock") {
      if (PHASE_LOCK[oppTeam(actor.team)] === 0 && foes.some(function (t) { return !isFrozenUnit(t); })) {
        score = 60;
        targets = foes;
      }
    } else if (s.sp === "pull") {
      const cand = foes.filter(function (t) { return !hasEffect(t, "pulled") && !isFrozenUnit(t); })
        .sort(function (a, b) { return getEffectiveStat(b, "attack") - getEffectiveStat(a, "attack"); });
      if (cand.length > 0 && hpPercent(actor) > 0.5) { score = 45; targets = [cand[0]]; }
    } else if (s.sp === "suck") {
      const hurt = allies.some(function (u) { return u.id !== actor.id && hpPercent(u) < 0.6; });
      if (hurt && hpPercent(actor) > 0.55) { score = 55; targets = [actor]; }
    } else if (s.sp === "blackhole") {
      if (!(actor.holeSize > 0)) {
        score = 50; targets = foes;
      } else {
        const bp = Math.max(0.05, actor.holeSize / CARD_K);
        let kills = 0;
        foes.forEach(function (t) { if (calculateDamage(actor, t, bp) >= effectiveHp(t)) kills += 1; });
        if (kills > 0 || actor.holeSize >= 200 || hpPercent(actor) < 0.4) { score = 85 + kills * 10; targets = foes; }
      }
    }

    if (targets && (best === null || score > best.score)) best = { skill: s, targets: targets, score: score };
  });

  return best ? { skill: best.skill, targets: best.targets } : null;
}

decideEnemyAction = (function (orig) {
  return function (actor) {
    const special = decideSpecialAI(actor, getDifficultyConfig());
    if (special) return special;
    return orig(actor);
  };
})(decideEnemyAction);


/* ============================================
   BAGIAN 10: "Loncatkan Giliran" (pemain tidak punya karakter yang bisa digerakkan)
   ============================================ */

function isUnitMovable(u) {
  if (!u.alive || isChargingUnit(u)) return false;
  // Yang beku/stun tetap bisa diketuk untuk melewatkan efeknya, jadi dianggap bisa digerakkan.
  if (isFrozenUnit(u) || hasEffect(u, "stun")) return true;

  // Blind baru "aktif" saat unit mulai bergerak, jadi dicek dari status juga (bukan hanya blindNow).
  const willBlind = hasEffect(u, "blind");
  return u.skills.some(function (s) {
    if (willBlind && skillNeedsManualTarget(s)) return false;
    if (unitSkillBlocked(u, s)) return false; // energi, 1x per pertarungan, segel, syarat khusus
    return getValidTargets(u, s).length > 0;
  });
}

function playerHasMovableUnit() {
  return getAliveUnits("player").some(isUnitMovable);
}


/* ============================================
   BAGIAN 11: TAMPILAN (bar energi, Blind, Time Frozen, timer, tombol lewati)
   ============================================ */

function mechEl(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const BLIND_SVG =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M3 24c5-9 12-14 21-14s16 5 21 14c-5 9-12 14-21 14S8 33 3 24Z"/>' +
  '<circle cx="24" cy="24" r="7"/><path d="M8 41 40 7" class="blind-slash"/></svg>';

const CLOCK_SVG =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17"/><path d="M24 12v13l9 5"/>' +
  '<path d="M24 3v4M24 41v4M3 24h4M41 24h4"/></svg>';

/** Membuat satu baris bar (label + track) untuk sumber daya tambahan. */
function resourceBar(unit, key, label, cur, max, fillClass) {
  const frag = document.createDocumentFragment();
  const lbl = mechEl("div", "bar-label");
  lbl.dataset.bar = key + "-label";
  lbl.textContent = label + " " + Math.round(cur) + "/" + Math.round(max);
  const track = mechEl("div", "bar-track");
  const fill = mechEl("div", "bar-fill " + fillClass);
  fill.dataset.bar = key + "-fill";
  fill.style.width = Math.max(0, Math.min(100, (cur / Math.max(1, max)) * 100)) + "%";
  track.appendChild(fill);
  frag.appendChild(lbl);
  frag.appendChild(track);
  return frag;
}

function decorateSlot(slot, unit) {
  const info = slot.querySelector(".char-info");
  const portrait = slot.querySelector(".char-portrait");
  if (!info) return;

  // --- Bar energi: nama & warna sesuai jenis (Mana / Charge kuning / Energy) ---
  const labels = info.querySelectorAll(".bar-label");
  const energyLabel = labels[1];
  const energyFill = info.querySelector(".bar-fill.mana");
  if (energyLabel) energyLabel.textContent = unitEnergyName(unit) + " " + unit.currentMana + "/" + unit.maxMana;
  if (energyFill) {
    energyFill.dataset.bar = "energy-fill";
    if (unit.energy === "charge") energyFill.classList.add("charge");
    else if (unit.energy === "energy") {
      energyFill.classList.add("energy");
      if (unit.powerSystem === "Mutation") energyFill.classList.add("mutation"); // merah campur biru
    }
  }
  if (energyLabel) energyLabel.dataset.bar = "energy-label";

  // --- Sumber daya khusus ---
  const afterTrack = energyFill ? energyFill.parentNode : null;
  const insertAfter = function (frag) {
    if (afterTrack && afterTrack.nextSibling) info.insertBefore(frag, afterTrack.nextSibling);
    else info.appendChild(frag);
  };
  if (unit.powerSystem === "Mutation") {
    insertAfter(resourceBar(unit, "essence", "Blood Essence", unit.essence, unit.maxEssence, "essence"));
  } else if (unit.powerSystem === "Confer") {
    insertAfter(resourceBar(unit, "res", "Resonance", unit.resonance, unit.maxResonance, "resonance"));
  }

  // --- Lencana khusus (Afsoul, dkg, Cermin, Charging, Time Frozen) ---
  const chips = mechEl("div", "mech-chips");
  const addChip = function (cls, text, hint) {
    const c = mechEl("span", "mech-chip " + cls);
    c.textContent = text;
    if (hint) attachHoldHint(c, function () { return hint; }); // battle.js
    chips.appendChild(c);
  };
  if (unit.alive) {
    if (isChargingUnit(unit)) {
      addChip("chip-charging", "⚡ Charging Energy " + unit.charging + "t",
        "Charging Energy: karakter ini tidak bisa dipakai. Charge langsung penuh setelah " + unit.charging + " giliran jalan timnya.");
    }
    if (PHASE_LOCK[unit.team] > 0) {
      addChip("chip-timelock", "⏳ Time Frozen x" + PHASE_LOCK[unit.team],
        "Time Frozen: giliran tim ini dicuri " + PHASE_LOCK[unit.team] + " kali. Bukan stun: tetap bisa kena damage, racun/bakar tetap jalan.");
    }
    if (unit.afsoul !== undefined) {
      addChip("chip-afsoul", "👁 Afsoul x" + unit.afsoul, "Afsoul: tumpukan ketakutan jiwa. Dipakai NIGHTMARE (Blind + curi giliran sebanyak stack), lalu kembali ke 0.");
    }
    if (unit.dkg !== undefined) {
      addChip("chip-dkg", "💨 dkg " + unit.dkg, "dkg: tumpukan damage. Boom! memberi damage 50% dari dkg ke semua musuh, lalu dkg kembali ke 0.");
    }
    if (unit.holeSize > 0) {
      addChip("chip-hole", "🕳️ Black Hole " + unit.holeSize,
        "Black Hole: membesar 2x lipat tiap putaran tim ini (maks " + HOLE_MAX + "). Skill 6 lagi = meledak, damage sebesar ukurannya ke semua musuh. Lenyap kalau pemiliknya kalah.");
    }
    const stacksNow = dotStacksOf(unit);
    Object.keys(stacksNow).forEach(function (stat) {
      const st = stacksNow[stat];
      if (st.n >= 2) {
        addChip("chip-dotstack", (stat === "burn" ? "🔥 Bakar x" : "☠️ Racun x") + st.n + " -" + st.total,
          (stat === "burn" ? "Bakar" : "Racun") + " menumpuk " + st.n + " kali: tiap efek jalan sendiri, total -" + st.total + " HP tiap giliran.");
      }
    });
    if (unit.mirrorTurns > 0) {
      addChip("chip-mirror", "🪞 Cermin " + unit.mirrorTurns + "p", "Cermin Kutukan: semua damage yang mengenai karakter ini dipantulkan penuh ke penyerang.");
    }
    if (unit.powerSystem === "Mutation" && unit.essence >= unit.maxEssence) {
      addChip("chip-essence", "🩸 Essence penuh", "Blood Essence penuh: HP bertambah tiap giliran tim. Jangan abaikan karakter ini.");
    }
  }
  if (chips.childNodes.length > 0) info.appendChild(chips);

  // --- Tampilan status di kartu ---
  if (unit.alive && portrait) {
    if (hasEffect(unit, "blind")) {
      slot.classList.add("is-blind");
      const veil = mechEl("div", "blind-veil", BLIND_SVG);
      portrait.appendChild(veil);
    }
    if (PHASE_LOCK[unit.team] > 0) {
      slot.classList.add("timelocked");
      portrait.appendChild(mechEl("div", "timelock-veil", CLOCK_SVG));
    }
    if (isChargingUnit(unit)) slot.classList.add("charging");
  }

  // Karakter kalah yang jadi target skill menghidupkan
  if (!unit.alive && pendingActor && pendingSkill && pendingSkill.target === "dead_ally") {
    if (getValidTargets(pendingActor, pendingSkill).some(function (t) { return t.id === unit.id; })) {
      slot.classList.add("valid-target");
    }
  }
}

createUnitSlotElement = (function (orig) {
  return function (unit) {
    const slot = orig(unit);
    try { decorateSlot(slot, unit); } catch (e) { console.error(e); }
    return slot;
  };
})(createUnitSlotElement);

/** Update bar HP/shield/Resonance langsung di elemen yang ada (tanpa menggambar ulang layar). */
function updateUnitBarsInPlace(u) {
  const slot = document.querySelector('.char-slot[data-unit-id="' + u.id + '"]');
  if (!slot) return;
  const hpFill = slot.querySelector(".bar-fill.hp");
  const hpLabel = slot.querySelector(".bar-label");
  if (hpFill) hpFill.style.width = Math.max(0, (u.currentHP / u.maxHP) * 100) + "%";
  if (hpLabel) hpLabel.textContent = "HP " + Math.round(u.currentHP) + "/" + Math.round(u.maxHP) + (shieldLabelText(u) ? "  " + shieldLabelText(u) : "");

  const rf = slot.querySelector('[data-bar="res-fill"]');
  const rl = slot.querySelector('[data-bar="res-label"]');
  if (rf && u.maxResonance) rf.style.width = Math.max(0, Math.min(100, (u.resonance / u.maxResonance) * 100)) + "%";
  if (rl && u.maxResonance) rl.textContent = "Resonance " + Math.round(u.resonance) + "/" + Math.round(u.maxResonance);
}

/* ---------- Label tim: tampilkan Time Frozen ---------- */
function updateTeamLabels() {
  [["team-player", "player", "Timmu"], ["team-enemy", "enemy", "Musuh"]].forEach(function (t) {
    const sec = document.getElementById(t[0]);
    const label = sec && sec.querySelector(".team-label");
    if (!label) return;
    label.textContent = t[2];
    if (PHASE_LOCK[t[1]] > 0 && !battleEnded) {
      const tag = mechEl("span", "team-lock-tag");
      tag.textContent = " ⏳ Time Frozen x" + PHASE_LOCK[t[1]];
      label.appendChild(tag);
    }
  });
}

renderArena = (function (orig) {
  return function () {
    orig();
    updateTeamLabels();
    refreshTurnControls();
  };
})(renderArena);

/* ---------- Timer & tombol Loncatkan Giliran ---------- */
let timerBox = null;
let timerText = null;
let timerFill = null;
let skipBtn = null;

function ensureTurnControls() {
  if (timerBox) return;
  timerBox = mechEl("div", "turn-timer tt-hidden");
  timerText = mechEl("span", "tt-text");
  timerText.textContent = "⏱ 0.0";
  const bar = mechEl("span", "tt-bar");
  timerFill = mechEl("span", "tt-fill");
  bar.appendChild(timerFill);
  timerBox.appendChild(timerText);
  timerBox.appendChild(bar);
  document.body.appendChild(timerBox);

  skipBtn = mechEl("button", "skip-turn-btn st-hidden", "⏭ Loncatkan Giliran");
  skipBtn.addEventListener("click", function () { passPlayerTurn("skip"); });
  document.body.appendChild(skipBtn);
}

function setTimerUi(show) {
  ensureTurnControls();
  timerBox.classList.toggle("tt-hidden", !show || battleEnded);
}

function updateTimerUi() {
  ensureTurnControls();
  const left = Math.max(0, turnTimerLeft);
  timerText.textContent = "⏱ " + (left / 1000).toFixed(1);
  timerFill.style.width = (turnTimerTotal ? (left / turnTimerTotal) * 100 : 0) + "%";
  timerBox.classList.toggle("tt-urgent", left <= 1500);
}

function hideTurnControls() {
  ensureTurnControls();
  timerBox.classList.add("tt-hidden");
  skipBtn.classList.add("st-hidden");
}

function refreshTurnControls() {
  ensureTurnControls();
  const bs = document.getElementById("battle-screen");
  const live = !!bs && !bs.classList.contains("hidden") && !battleEnded && allUnits.length > 0;
  // Tetap tampil walau panel skill sedang terbuka (pemain melihat skill yang terkunci).
  const show = live && currentPhase === "player" && bonusUnitId === null && !playerHasMovableUnit();
  skipBtn.classList.toggle("st-hidden", !show);
}

// Panel skill terbuka/tertutup juga mempengaruhi tombol lewati.
hideSkillPanel = (function (orig) {
  return function () {
    orig();
    if (typeof refreshTurnControls === "function" && timerBox) refreshTurnControls();
  };
})(hideSkillPanel);


/* ============================================
   BAGIAN 12: GAYA (disisipkan lewat JS supaya style.css tidak perlu diubah)
   ============================================ */
(function injectMechanicsStyle() {
  const css = `
.char-portrait { position: relative; }

/* Bar energi */
.bar-fill.charge    { background: linear-gradient(90deg, #d4a017, #ffd84a); box-shadow: 0 0 6px rgba(255, 216, 74, 0.55); }
.bar-fill.energy    { background: linear-gradient(90deg, #2a8f9c, #4fd3d9); }
.bar-fill.energy.mutation { background: linear-gradient(90deg, #b3263f, #7a3aa8 52%, #3f6fd0); box-shadow: 0 0 6px rgba(122, 58, 168, 0.55); }
.bar-fill.essence   { background: linear-gradient(90deg, #4a0710, #8a0f1f); box-shadow: 0 0 6px rgba(138, 15, 31, 0.6); }
.bar-fill.resonance { background: linear-gradient(90deg, #6a3fb8, #b98cff); box-shadow: 0 0 6px rgba(185, 140, 255, 0.5); }
.bar-fill.resonance, .bar-fill.essence { transition: width 0.18s linear; }

/* Lencana khusus */
.mech-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.team-enemy-slot .mech-chips { justify-content: flex-end; }
.mech-chip { font-size: 0.6rem; padding: 1px 7px; border-radius: 10px; border: 1px solid #667; white-space: nowrap; background: rgba(0,0,0,0.35); }
.chip-charging { color: #ffd84a; border-color: #ffd84a; animation: chip-blink 1s ease-in-out infinite; }
.chip-timelock { color: #9fe6ff; border-color: #6fcfff; text-shadow: 0 0 6px rgba(120,210,255,.7); }
.chip-afsoul   { color: #c9a0ff; border-color: #8a4fd6; }
.chip-dkg      { color: #d8d8e8; border-color: #9a9ab0; }
.chip-mirror   { color: #cfe8ff; border-color: #8fc0ff; }
.chip-essence  { color: #ff8a98; border-color: #8a0f1f; }
@keyframes chip-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

.status-badge.status-blind { color: #d9a0ff; border-color: #a24fe0; box-shadow: 0 0 6px rgba(162,79,224,.5); }
.status-badge.status-teamregen { color: #6bc98f; border-color: #6bc98f; }

/* Blind: kabut gelap + mata dicoret + garis pemindai */
.char-slot.is-blind { border-color: #a24fe0 !important; box-shadow: 0 0 12px rgba(162,79,224,.55), inset 0 0 18px rgba(20,0,40,.6); }
.blind-veil {
  position: absolute; inset: 0; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden;
  background: radial-gradient(circle, rgba(10,0,25,.55), rgba(10,0,25,.9)); pointer-events: none;
}
.blind-veil::after {
  content: ""; position: absolute; left: -20%; right: -20%; height: 30%; top: -30%;
  background: linear-gradient(180deg, transparent, rgba(190,120,255,.5), transparent); animation: blind-scan 1.8s linear infinite;
}
.blind-veil svg { width: 78%; height: 78%; fill: none; stroke: #d9a0ff; stroke-width: 2.4; stroke-linecap: round; filter: drop-shadow(0 0 4px #a24fe0); animation: blind-pulse 1.6s ease-in-out infinite; }
.blind-veil .blind-slash { stroke: #ff5f7a; stroke-width: 3.4; }
@keyframes blind-scan { to { top: 110%; } }
@keyframes blind-pulse { 0%, 100% { opacity: .8; } 50% { opacity: 1; } }

/* Time Frozen */
.char-slot.timelocked { border-color: #6fcfff !important; box-shadow: 0 0 12px rgba(111,207,255,.5); }
.timelock-veil { position: absolute; inset: 0; border-radius: 6px; display: flex; align-items: center; justify-content: center; background: rgba(120,200,255,.22); pointer-events: none; }
.timelock-veil svg { width: 70%; height: 70%; fill: none; stroke: #bfeaff; stroke-width: 2.2; stroke-linecap: round; filter: drop-shadow(0 0 4px #6fcfff); animation: tl-spin 6s linear infinite; }
@keyframes tl-spin { to { transform: rotate(360deg); } }
.team-lock-tag { color: #9fe6ff; font-size: 0.7rem; text-shadow: 0 0 6px rgba(120,210,255,.7); }

/* Charging Energy */
.char-slot.charging { opacity: 0.7; border-color: #ffd84a !important; }

/* Karakter kalah yang bisa dihidupkan */
.char-slot.dead.valid-target { opacity: 0.9; filter: none; border-color: #5ad68a; }

/* Tombol skill */
.skill-btn .skill-note { font-size: 0.62rem; color: #d9a0ff; }
.skill-btn.skill-blind-locked { border-color: #a24fe0; }
.skill-btn.recharge-btn { grid-column: 1 / -1; border-color: #ffd84a; background: rgba(212,160,23,.12); }
.skill-btn.recharge-btn .skill-name { color: #ffd84a; }

/* Elemen khusus arena TIDAK boleh tampil di luar arena (mis. saat langsung kembali ke beranda) */
body:not([data-scene="battle"]) .turn-timer,
body:not([data-scene="battle"]) .skip-turn-btn,
body:not([data-scene="battle"]) .banner-layer,
body:not([data-scene="battle"]) .enemy-thinking { display: none !important; }

/* Timer giliran */
.turn-timer {
  position: fixed; top: calc(40px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); z-index: 340;
  display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 96px; padding: 4px 12px;
  background: rgba(9,13,24,.88); border: 1px solid #b99a5b; border-radius: 12px; color: #e6cf9a;
  font-family: 'Georgia', serif; font-size: 0.72rem; font-weight: bold; pointer-events: none; transition: opacity .2s;
}
.turn-timer.tt-hidden { opacity: 0; visibility: hidden; pointer-events: none; }
.tt-bar { width: 100%; height: 4px; background: #05070d; border-radius: 3px; overflow: hidden; }
.tt-fill { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #b99a5b, #e6cf9a); }
.turn-timer.tt-urgent { border-color: #ff5a5a; color: #ff9a9a; animation: chip-blink .5s ease-in-out infinite; }
.turn-timer.tt-urgent .tt-fill { background: #ff5a5a; }

/* Tombol Loncatkan Giliran: di atas tengah arena supaya tidak tertutup panel skill di bawah */
.skip-turn-btn {
  position: fixed; left: 50%; top: calc(80px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); z-index: 345;
  padding: 8px 20px; border-radius: 24px; border: 1.5px solid #e6cf9a; background: linear-gradient(180deg, #2a3350, #151c30);
  color: #e6cf9a; font-family: 'Georgia', serif; font-size: 0.8rem; font-weight: bold; letter-spacing: 1px;
  box-shadow: 0 4px 14px rgba(0,0,0,.6); animation: skip-glow 1.4s ease-in-out infinite;
}
.dice-roll { position: fixed; left: 50%; top: 19%; display: flex; align-items: center; gap: 8px; z-index: 60; transform: translate(-50%, -50%); pointer-events: none; text-align: center;
  animation: dice-in 1.5s cubic-bezier(.2,.9,.2,1) forwards; font-family: Georgia, serif; }
.dice-cube { font-size: 54px; line-height: 1; color: #f3e6c8; text-shadow: 0 0 18px rgba(150,90,255,.9), 0 3px 0 #000; animation: dice-spin .55s ease-out; }
.dice-label { font-size: 30px; font-weight: 800; color: #fff; text-shadow: 0 0 8px #000; }
.dice-crit .dice-cube { color: #ffe34a; text-shadow: 0 0 26px rgba(255,220,80,1), 0 3px 0 #000; }
.dice-fail .dice-cube { color: #9aa3b8; text-shadow: 0 0 10px rgba(0,0,0,.9); }
@keyframes dice-spin { 0% { transform: rotate(-540deg) scale(.3); } 100% { transform: none; } }
@keyframes dice-in { 0% { opacity: 0; } 10% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -90%); } }
.seal-picker { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.7); }
.seal-picker-box { background: #141a2a; border: 1px solid #c9a24b; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; min-width: 260px; max-width: 92vw; font-family: Georgia, serif; }
.seal-picker-title { margin: 0 0 4px; color: #f3e6c8; font-weight: 700; text-align: center; }
.seal-picker-btn { padding: 8px 10px; border-radius: 6px; border: 1px solid #3a4560; background: #1d2538; color: #e8e2d2; font: inherit; text-align: left; cursor: pointer; }
.seal-picker-btn:disabled { opacity: .45; }
.seal-picker-cancel { text-align: center; border-color: #5a3a3a; }
.skip-turn-btn.st-hidden { display: none; }
@keyframes skip-glow { 0%, 100% { box-shadow: 0 4px 14px rgba(0,0,0,.6); } 50% { box-shadow: 0 4px 18px rgba(230,207,154,.55); } }
`;
  const style = document.createElement("style");
  style.id = "mechanics-style";
  style.textContent = css;
  document.head.appendChild(style);
})();