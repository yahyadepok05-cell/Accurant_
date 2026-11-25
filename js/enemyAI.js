/* ============================================
   ACCURANT - ENEMYAI.JS
   Logika pengambilan keputusan untuk karakter musuh.
   Dipanggil oleh battle.js lewat decideEnemyAction(actor),
   mengembalikan { skill, targets } atau null kalau tidak ada
   aksi yang bisa dipakai.

   Tahap 9: AI bertingkat sesuai tingkat kesulitan (difficulty.js):
   - Tanpa kesulitan (null): AI lama (decideLegacyAction).
   - Easy   : AI lama, tapi kadang sengaja salah langkah (bodoh).
   - Normal : membaca kondisi: heal, perisai, stun, target lemah.
   - Hard   : menghitung nilai tiap aksi (kill, perisai, eksekusi,
              efek), kadang salah, pakai ramuan, ragu pakai artefak.
   - Extreme: seperti Hard tapi tanpa salah, ulti bebas, mahir pakai
              ramuan dan artefak.
   ============================================ */

const LOW_HP_THRESHOLD = 0.4; // di bawah 40% HP dianggap "sekarat"

/**
 * Skill terakhir (index ke-5, yaitu skill ke-6) dianggap skill ulti.
 */
function isUltimateSkill(unit, skill) {
  if (!unit.skills || unit.skills.length === 0) return false;
  return skill.id === unit.skills[unit.skills.length - 1].id;
}

/**
 * Skill ini boleh dipertimbangkan AI atau tidak:
 * - mananya harus cukup
 * - kalau dia ulti, unit itu belum pernah pakai ulti sebelumnya di pertarungan ini
 */
function isSkillConsiderable(unit, skill) {
  if (skill.manaCost > unit.currentMana) return false;
  if (isUltimateSkill(unit, skill) && unit.ultimateUsed) return false;
  return true;
}

/**
 * Dari semua skill unit yang jenisnya sesuai typeFilter dan bisa dipakai,
 * ambil yang "power"-nya paling besar (skill paling kuat yang terjangkau).
 * Kalau beberapa power-nya sama, ambil yang pertama ditemukan.
 */
function findStrongestConsiderableSkill(unit, typeMatchFn) {
  const candidates = unit.skills.filter(function (skill) {
    return typeMatchFn(skill) && isSkillConsiderable(unit, skill);
  });

  if (candidates.length === 0) return null;

  candidates.sort(function (a, b) {
    return (b.power || 0) - (a.power || 0);
  });

  return candidates[0];
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function pickLowestHpUnit(units) {
  return units.slice().sort(function (a, b) {
    return (a.currentHP / a.maxHP) - (b.currentHP / b.maxHP);
  })[0];
}

/**
 * Fungsi utama: memutuskan skill & target untuk satu unit musuh pada gilirannya.
 * @param {Object} actor - unit musuh yang sedang gilirannya
 * @returns {{skill: Object, targets: Array}|null}
 */
function decideLegacyAction(actor) {
  const allies = getAliveUnits(actor.team).filter(function (u) { return !isFrozenUnit(u); }); // beku tidak bisa menerima apa pun
  const opponents = getAliveUnits(actor.team === "player" ? "enemy" : "player");

  if (opponents.length === 0) return null;

  // ===== PRIORITAS 1: HEAL kalau ada sekutu sekarat =====
  const lowHpAllies = allies.filter(function (u) {
    return (u.currentHP / u.maxHP) < LOW_HP_THRESHOLD;
  });

  if (lowHpAllies.length > 0) {
    const healSkill = findStrongestConsiderableSkill(actor, function (s) {
      return s.type === "healing";
    });

    if (healSkill) {
      const targets = healSkill.target === "all_allies"
        ? allies
        : [pickLowestHpUnit(lowHpAllies)];
      return { skill: healSkill, targets: targets };
    }
  }

  // ===== PRIORITAS 2: SERANGAN AREA kalau lawan yang hidup ada 2 atau lebih =====
  if (opponents.length >= 2) {
    const areaSkill = findStrongestConsiderableSkill(actor, function (s) {
      return s.type === "area_attack";
    });

    if (areaSkill) {
      return { skill: areaSkill, targets: opponents };
    }
  }

  // ===== PRIORITAS 3: SERANGAN SINGLE TERKUAT yang terjangkau =====
  const attackSkill = findStrongestConsiderableSkill(actor, function (s) {
    return s.type === "single_attack";
  });

  if (attackSkill) {
    return { skill: attackSkill, targets: [pickRandom(opponents)] };
  }

  // ===== PRIORITAS 4: Tidak ada opsi serang/heal, coba buff/debuff/shield/mana_recovery =====
  const utilitySkill = findStrongestConsiderableSkill(actor, function (s) {
    return s.type === "buff" || s.type === "debuff" || s.type === "shield" || s.type === "mana_recovery";
  });

  if (utilitySkill) {
    const targets = getValidTargets(actor, utilitySkill);
    if (targets.length === 0) return null;

    const finalTargets = (utilitySkill.target === "single_enemy" || utilitySkill.target === "single_ally")
      ? [pickRandom(targets)]
      : targets;

    return { skill: utilitySkill, targets: finalTargets };
  }

  // ===== Tidak ada skill apapun yang bisa dipakai =====
  return null;
}


/* ============================================
   TAHAP 9: AI BERTINGKAT
   ============================================ */

const EASY_MISTAKE_CHANCE = 0.3; // peluang Easy asal pilih aksi

function opponentsOf(actor) {
  return getAliveUnits(actor.team === "player" ? "enemy" : "player");
}

function isStunnedUnit(u) {
  return isFrozenUnit(u) || u.statusEffects.some(function (e) { return e.type === "stun"; });
}

function effectiveHp(u) {
  return u.currentHP + u.shield;
}

function hpPercent(u) {
  return u.currentHP / u.maxHP;
}

/** Lawan yang masuk akal diserang: yang tidak beku (kebal), kalau masih ada. */
function targetableOpponents(actor) {
  const all = opponentsOf(actor);
  const free = all.filter(function (u) { return !isFrozenUnit(u); });
  return free.length > 0 ? free : all;
}

function isConsiderableAt(unit, skill, ultLimit) {
  if (skill.manaCost > unit.currentMana) return false;
  if (isUltimateSkill(unit, skill) && (unit.ultimateCount || 0) >= ultLimit) return false;
  return true;
}

function isStunSkill(skill) {
  return !!skill.effect && (skill.effect.type === "stun" || skill.effect.type === "freeze");
}

/**
 * Pintu masuk AI. Dipanggil battle.js (performOneEnemyTurn).
 */
function aiLevelOf(cfg) {
  return cfg.aiLevel || cfg.key;
}

/**
 * Memilih karakter musuh yang akan bertindak. Hard & Extreme "berpikir":
 * karakter beku tidak bisa main, jadi tidak dipilih (kalau masih ada
 * karakter lain). Tingkat lain tetap asal pilih.
 */
function pickEnemyActor(aliveEnemies) {
  const cfg = getDifficultyConfig();
  const level = cfg ? aiLevelOf(cfg) : null;
  if (level === "hard" || level === "extreme") {
    const playable = aliveEnemies.filter(function (u) { return !isFrozenUnit(u); });
    if (playable.length > 0) return pickRandom(playable);
  }
  return pickRandom(aliveEnemies);
}

function decideEnemyAction(actor) {
  const cfg = getDifficultyConfig(); // difficulty.js
  if (!cfg) return decideLegacyAction(actor); // Stage 5 (Demon Lord I): AI lama

  const level = aiLevelOf(cfg);

  if (level === "easy") {
    if (Math.random() < EASY_MISTAKE_CHANCE) {
      const silly = decideRandomAction(actor, cfg);
      if (silly) return silly;
    }
    return decideLegacyAction(actor);
  }

  if (level === "normal") {
    if (cfg.mistakeChance && Math.random() < cfg.mistakeChance) {
      const silly = decideRandomAction(actor, cfg);
      if (silly) return silly;
    }
    return decideNormalAction(actor, cfg);
  }

  return decideScoredAction(actor, cfg); // hard & extreme
}

/** Easy: salah langkah, skill dan target asal. */
function decideRandomAction(actor, cfg) {
  const options = actor.skills.filter(function (s) {
    return isConsiderableAt(actor, s, cfg.ultLimit) && getValidTargets(actor, s).length > 0;
  });
  if (options.length === 0) return null;

  const skill = pickRandom(options);
  const targets = getValidTargets(actor, skill);
  const single = skill.target === "single_enemy" || skill.target === "single_ally";
  return { skill: skill, targets: single ? [pickRandom(targets)] : targets };
}

/* ---------- NORMAL: aturan berdasarkan kondisi ---------- */

function decideNormalAction(actor, cfg) {
  const allies = getAliveUnits(actor.team).filter(function (u) { return !isFrozenUnit(u); }); // beku tidak bisa menerima apa pun
  const opps = targetableOpponents(actor);
  if (opponentsOf(actor).length === 0) return null;

  const usable = function (typeFn) {
    return findStrongestConsiderableSkillAt(actor, typeFn, cfg.ultLimit);
  };

  // 1. HEAL kalau ada sekutu sekarat
  const hurt = allies.filter(function (u) { return hpPercent(u) < 0.4; });
  if (hurt.length > 0) {
    const heal = usable(function (s) { return s.type === "healing"; });
    if (heal) {
      return { skill: heal, targets: heal.target === "all_allies" ? allies : [pickLowestHpUnit(hurt)] };
    }
  }

  // 2. PERISAI untuk sekutu yang terancam dan belum berperisai
  const endangered = allies.filter(function (u) { return hpPercent(u) < 0.6 && u.shield < 20; });
  if (endangered.length > 0) {
    const shieldSkill = usable(function (s) { return s.type === "shield"; });
    if (shieldSkill) {
      const valid = getValidTargets(actor, shieldSkill);
      const candidates = endangered.filter(function (u) {
        return valid.some(function (v) { return v.id === u.id; });
      });
      if (candidates.length > 0) {
        return { skill: shieldSkill, targets: [pickLowestHpUnit(candidates)] };
      }
    }
  }

  // 3. STUN petarung paling berbahaya yang belum stun
  const threats = opps.filter(function (u) { return !isStunnedUnit(u); }).sort(function (a, b) {
    return getEffectiveStat(b, "attack") - getEffectiveStat(a, "attack");
  });
  if (threats.length > 0) {
    const stunSkill = usable(function (s) { return isStunSkill(s) && s.target === "single_enemy"; });
    if (stunSkill) {
      return { skill: stunSkill, targets: [threats[0]] };
    }
  }

  // 4. SERANG: area kalau lawan 2+, kalau tidak single terkuat
  if (opps.length >= 2) {
    const area = usable(function (s) { return s.type === "area_attack"; });
    if (area) return { skill: area, targets: opponentsOf(actor) };
  }

  const attack = usable(function (s) { return s.type === "single_attack"; });
  if (attack) {
    return { skill: attack, targets: [pickNormalTarget(opps)] };
  }

  const util = usable(function (s) {
    return s.type === "buff" || s.type === "debuff" || s.type === "mana_recovery";
  });
  if (util) {
    const valid = getValidTargets(actor, util);
    if (valid.length === 0) return null;
    const single = util.target === "single_enemy" || util.target === "single_ally";
    return { skill: util, targets: single ? [pickRandom(valid)] : valid };
  }

  return null;
}

function findStrongestConsiderableSkillAt(unit, typeMatchFn, ultLimit) {
  const candidates = unit.skills.filter(function (skill) {
    return typeMatchFn(skill) && isConsiderableAt(unit, skill, ultLimit);
  });
  if (candidates.length === 0) return null;
  candidates.sort(function (a, b) { return (b.power || 0) - (a.power || 0); });
  return candidates[0];
}

/** Normal: pilih lawan tanpa perisai dengan HP% terendah (perisai terdeteksi). */
function pickNormalTarget(opps) {
  const unshielded = opps.filter(function (u) { return u.shield <= 0; });
  const pool = unshielded.length > 0 ? unshielded : opps;
  return pickLowestHpUnit(pool);
}

/* ---------- HARD & EXTREME: skor tiap aksi ---------- */

function effectBonus(actor, skill, target) {
  const e = skill.effect;
  if (!e) return 0;
  const threat = getEffectiveStat(target, "attack");
  const myAtk = getEffectiveStat(actor, "attack");

  if (e.type === "stun") {
    if (isStunnedUnit(target)) return 0;
    return (e.chance || 1) * Math.min(e.turns, 3) * threat * 0.5;
  }
  if (e.type === "freeze") {
    if (isStunnedUnit(target)) return 0;
    const hasFriends = getAliveUnits(target.team).some(function (o) {
      return o.id !== target.id && !isFrozenUnit(o);
    });
    return hasFriends ? threat * 2 : 0;
  }
  if (e.type === "dot") {
    return myAtk * e.percent * e.turns * 0.6;
  }
  if (e.type === "debuff") {
    const already = target.statusEffects.some(function (x) { return x.type === "debuff" && x.stat === e.stat; });
    return already ? 0 : threat * e.percent * e.turns * 0.5;
  }
  return 0;
}

/** Nilai satu serangan ke satu target. -Infinity kalau sia-sia. */
function attackValue(actor, skill, target) {
  if (isFrozenUnit(target) || hasAbsoluteShield(target)) return -Infinity; // kebal

  if (skill.execute) {
    if (target.currentHP < skill.execute.belowHP) {
      return effectiveHp(target) + 150 + getEffectiveStat(target, "attack");
    }
    return -Infinity; // akan hangus
  }

  const dmg = calculateDamage(actor, target, skill.power);
  const hp = effectiveHp(target); // perisai ikut dihitung
  let value = Math.min(dmg, hp);
  if (dmg >= hp) value += 100 + getEffectiveStat(target, "attack") * 0.5; // bisa kill
  return value + effectBonus(actor, skill, target);
}

function decideScoredAction(actor, cfg) {
  const allies = getAliveUnits(actor.team).filter(function (u) { return !isFrozenUnit(u); }); // beku tidak bisa menerima apa pun
  const opps = opponentsOf(actor);
  if (opps.length === 0) return null;

  const options = [];

  actor.skills.forEach(function (skill) {
    if (!isConsiderableAt(actor, skill, cfg.ultLimit)) return;

    let score = -Infinity;
    let targets = null;

    if (skill.type === "single_attack" || (skill.type === "debuff" && skill.target === "single_enemy")) {
      let best = null;
      opps.forEach(function (t) {
        const v = skill.type === "debuff" ? (isFrozenUnit(t) ? -Infinity : effectBonus(actor, skill, t)) : attackValue(actor, skill, t);
        if (best === null || v > best.v) best = { t: t, v: v };
      });
      if (best && best.v > -Infinity) { score = best.v; targets = [best.t]; }

    } else if (skill.type === "area_attack") {
      let sum = 0;
      let any = false;
      opps.forEach(function (t) {
        const v = attackValue(actor, skill, t);
        if (v > -Infinity) { sum += v; any = true; }
      });
      if (any) { score = sum; targets = opps; }

    } else if (skill.type === "healing") {
      const heal = calculateHeal(actor, skill.power);
      if (skill.target === "all_allies") {
        let sum = 0;
        allies.forEach(function (u) {
          const missing = u.maxHP - u.currentHP;
          sum += Math.min(heal, missing) + (hpPercent(u) < 0.35 ? 80 : 0) * (missing > 0 ? 1 : 0);
        });
        if (sum > 0) { score = sum; targets = allies; }
      } else {
        const needy = allies.filter(function (u) { return u.currentHP < u.maxHP; });
        if (needy.length > 0) {
          const u = pickLowestHpUnit(needy);
          score = Math.min(heal, u.maxHP - u.currentHP) + (hpPercent(u) < 0.35 ? 80 : 0);
          targets = [u];
        }
      }

    } else if (skill.type === "shield") {
      const amount = Math.round(getEffectiveStat(actor, "attack") * 1.2);
      const valid = getValidTargets(actor, skill).filter(function (u) { return u.shield < 20; });
      if (valid.length > 0) {
        const u = pickLowestHpUnit(valid);
        score = amount * (hpPercent(u) < 0.6 ? 0.8 : 0.25);
        targets = [u];
      }

    } else if (skill.type === "mana_recovery") {
      const needy = allies.filter(function (u) { return u.currentMana / u.maxMana < 0.3; });
      if (needy.length > 0) { score = 40; targets = [needy[0]]; }

    } else if (skill.type === "buff") {
      const valid = getValidTargets(actor, skill).filter(function (u) {
        return !u.statusEffects.some(function (x) { return x.type === "buff" && x.stat === (skill.effect && skill.effect.stat); });
      });
      if (valid.length > 0) { score = 35; targets = skill.target === "all_allies" ? valid : [valid[0]]; }

    } else if (skill.type === "debuff") {
      const valid = opps.filter(function (u) { return effectBonus(actor, skill, u) > 0; });
      if (valid.length > 0) { score = 35 * valid.length; targets = skill.target === "all_enemies" ? valid : [valid[0]]; }
    }

    if (score > -Infinity && targets) {
      options.push({ skill: skill, targets: targets, score: score - cfg.costWeight * skill.manaCost });
    }
  });

  if (options.length === 0) return null;

  options.sort(function (a, b) { return b.score - a.score; });
  let pick = options[0];
  if (options.length > 1 && Math.random() < (cfg.mistakeChance || 0)) {
    pick = options[1]; // Hard kadang salah pilih
  }
  return { skill: pick.skill, targets: pick.targets };
}


/* ============================================
   ITEM MUSUH (Hard & Extreme)
   Item dipakai GRATIS sebelum menyerang, seperti pemain. Hard pandai
   memakai ramuan tapi ragu memakai artefak; Extreme mahir keduanya.
   ============================================ */

function scaleItemForDifficulty(item, cfg) {
  const scaled = JSON.parse(JSON.stringify(item));
  let m = cfg.itemScale || cfg.statMult;
  if (typeof arenaMode !== "undefined" && arenaMode === "roulette") m = 1; // Roulette: tanpa pengali (arena.js)
  const eff = scaled.effect;
  if (eff.amount) eff.amount = Math.round(eff.amount * m);
  if (eff.damage) eff.damage = Math.round(eff.damage * m);
  return scaled;
}

function hasBadStatus(u) {
  return u.statusEffects.some(function (e) {
    return e.type === "stun" || e.type === "dot" || e.type === "debuff";
  });
}

/**
 * Memilih satu item yang layak dipakai sekarang. Mengembalikan
 * { item, targets } atau null.
 */
function chooseEnemyItem(actor, cfg) {
  const allies = getAliveUnits(actor.team).filter(function (u) { return !isFrozenUnit(u); }); // beku tidak bisa menerima ramuan
  const fallen = allUnits.filter(function (u) { return u.team === actor.team && !u.alive; });
  const opps = opponentsOf(actor);

  const order = [
    "spell_revive", "potion_cure", "splash_cure", "potion_heal", "splash_heal",
    "spell_barrier", "spell_execute", "spell_storm_stun", "potion_mana",
    "potion_attack_buff", "splash_poison"
  ];

  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    if (!enemyInventory[id] || enemyInventory[id] <= 0) continue;
    const item = getItemById(id); // items.js
    if (!item) continue;

    let targets = null;

    if (id === "spell_revive") {
      if (fallen.length > 0) {
        targets = [fallen.slice().sort(function (a, b) { return b.maxHP - a.maxHP; })[0]];
      }
    } else if (id === "potion_cure") {
      const sick = allies.filter(hasBadStatus);
      if (sick.length === 1) targets = [sick[0]];
    } else if (id === "splash_cure") {
      const sick = allies.filter(hasBadStatus);
      if (sick.length >= 2) targets = allies;
    } else if (id === "potion_heal") {
      const hurt = allies.filter(function (u) { return hpPercent(u) < cfg.healThreshold; });
      if (hurt.length > 0) targets = [pickLowestHpUnit(hurt)];
    } else if (id === "splash_heal") {
      const hurt = allies.filter(function (u) { return hpPercent(u) < 0.6; });
      if (hurt.length >= 2) targets = allies;
    } else if (id === "spell_barrier") {
      const weak = allies.filter(function (u) { return hpPercent(u) < 0.5 && u.shield < 20; });
      if (weak.length > 0) targets = [pickLowestHpUnit(weak)];
    } else if (id === "spell_execute") {
      const dying = opps.filter(function (u) { return !isFrozenUnit(u) && hpPercent(u) <= 0.2; });
      if (dying.length > 0) targets = [pickLowestHpUnit(dying)];
    } else if (id === "spell_storm_stun") {
      const free = opps.filter(function (u) { return !isStunnedUnit(u); });
      if (opps.length >= 3 && free.length >= 3) targets = free;
    } else if (id === "potion_mana") {
      const dry = allies.filter(function (u) { return u.currentMana / u.maxMana < 0.2; });
      if (dry.length > 0) targets = [dry[0]];
    } else if (id === "potion_attack_buff") {
      if (aiLevelOf(cfg) === "extreme" && opps.length >= 2) {
        const cands = allies.filter(function (u) {
          return hpPercent(u) > 0.5 && !u.statusEffects.some(function (e) { return e.type === "buff" && e.stat === "attack"; });
        }).sort(function (a, b) { return getEffectiveStat(b, "attack") - getEffectiveStat(a, "attack"); });
        if (cands.length > 0) targets = [cands[0]];
      }
    } else if (id === "splash_poison") {
      if (aiLevelOf(cfg) === "extreme" && opps.length >= 3) targets = opps;
    }

    if (!targets) continue;

    // Keyakinan memakai item: Hard ragu-ragu pada Artefak, Extreme yakin.
    const chance = item.category === "spell" ? cfg.artifactChance : cfg.potionChance;
    if (Math.random() < chance) {
      return { item: item, targets: targets };
    }
  }
  return null;
}

function useEnemyItem(item, targets, cfg) {
  enemyInventory[item.id] -= 1;
  const scaled = scaleItemForDifficulty(item, cfg);

  // Peringatan di atas layar: musuh memakai Artefak (banner.js)
  if (item.category === "spell" && typeof announceArtifact === "function") {
    announceArtifact(item, "enemy");
  }

  targets.forEach(function (t) {
    applyItemEffect(scaled, t, "Musuh"); // items.js
  });

  renderArena();
  checkBattleEnd();
}

/**
 * Dipanggil battle.js di giliran musuh sebelum memilih skill.
 * Tidak melakukan apa-apa di Easy, Normal, dan Perjalanan.
 */
function runEnemyItemPhase(actor) {
  const cfg = getDifficultyConfig();
  if (!cfg || !cfg.inventory) return;

  for (let used = 0; used < cfg.itemsPerTurn && !battleEnded; used++) {
    const choice = chooseEnemyItem(actor, cfg);
    if (!choice) break;
    useEnemyItem(choice.item, choice.targets, cfg);
  }
}
