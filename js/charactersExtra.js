/* ============================================
   ACCURANT - CHARACTERSEXTRA.JS  (Accurant 11)
   Karakter-karakter dari kartu tulisan tangan, dimasukkan ke
   CHARACTER_DATABASE (dimuat SETELAH characters.js).

   CARA KERJA PENYESUAIAN KEDUDUKAN
   1. Angka di kartu (mis. -500 HP) = angka "kartu 4000 HP".
      Diubah ke pengali skill:   power = angka kartu / CARD_K
   2. Stat dasar semua karakter dihitung sebagai level JUNIOR
      (ATK 140-160, HP ~850, Mana ~440), lalu DIKALIKAN pengali
      kedudukan (RANK_MULT) untuk: HP, Mana, ATK, DEF dan biaya mana.
      Speed tidak dikali.
   3. Batas eksekusi "MATI jika HP < X" juga dikali pengali kedudukan.
   4. BIAYA ENERGI tidak ditulis tangan: finalizeSkillCosts() menghitungnya dari
      besar kegunaan tiap skill (damage, jumlah target, heal, perisai, stun, buff,
      racun, efek khusus). Lihat bagian "BIAYA ENERGI BERDASARKAN KEGUNAAN".

   SISTEM KEKUATAN (powerSystem)  -> jenis energi (field "energy"):
     Breathing, Magic -> "mana"   : Mana biasa (regen 10% tiap giliran sendiri)
     Artifact         -> "charge" : Charge (bar kuning). Max = 2 x biaya skill termahal,
                                    penuh saat mulai, TIDAK pulih sendiri.
                                    Habis -> tombol Re-charge (gratis, lalu
                                    menunggu 3 giliran tim, Charge langsung penuh).
     Mutation         -> "energy" : Energy (biaya x0,7) + Blood Essence
     Confer           -> "energy" : Energy kecil (15% HP) + Resonance

   >>> Mau ubah keseimbangan? Ubah konstanta di bagian "KONSTANTA" di bawah. <<<
   ============================================ */

const CARD_K = 600;          // angka kartu / 600 = power skill
const HP_SCALE = 0.2125;     // kartu 4000 HP -> 850 HP (dipakai batas eksekusi)

/* ---------- KONSTANTA SISTEM ENERGI ---------- */
// Artifact (Charge)
const CHARGE_REGEN_PERCENT = 0;   // Charge TIDAK pulih sendiri
const CHARGE_WAIT_TURNS = 2;      // Re-charge: menunggu 2 putaran (giliran jalan timnya)

// Mutation (Energy + Blood Essence)
const MUTATION_COST_MULT = 0.7;       // biaya skill 30% lebih hemat dari mana biasa
const MUTATION_ENERGY_REGEN = 0.10;   // regen Energy per giliran sendiri (sama seperti mana)
const ESSENCE_MAX_PERCENT = 0.5;      // max Blood Essence = 50% max HP (mulai 0)
const ESSENCE_GAIN_PERCENT = 0.5;     // saat menyerang: essence += 50% damage serangan
const ESSENCE_IGNORE_LOSS = 0.25;     // tiap diabaikan: essence -25% dari max essence
const ESSENCE_FULL_HEAL = 0.10;       // essence penuh: HP +10% max essence tiap giliran tim

// Confer (Energy + Resonance)
const CONFER_ENERGY_PERCENT = 0.15;   // max Energy = 15% max HP (kisaran di bawah 20%)
const CONFER_COST_STEP = 0.05;        // skill ke-n memakan n x 5% max Energy
const CONFER_ENERGY_REGEN = 0.10;     // regen Energy per putaran timnya (sama seperti mana)
const CONFER_RES_MULT = 1.25;         // max Resonance = HP x 1,25 (kisaran 1,2-1,3)
const CONFER_RES_STEP = 0.10;         // skill ke-n menambah n x 10% max Resonance
const CONFER_TICK_MS = 200;           // tiap 0,2 detik (waktu nyata)
const CONFER_TICK_RES_SHARE = 0.5;    // pakai 50% Resonance saat itu ...
const CONFER_TICK_PERCENT = 0.01;     // ... lalu 1% darinya = shield (diri) & damage (semua musuh)
const CONFER_DECAY_PERCENT = 0.01;    // Energy habis: Resonance -1% max Energy tiap tick
const CONFER_SHIELD_CAP = 0.5;        // shield Resonance paling banyak 50% max HP

// Efek khusus
const AFSOUL_MAX = 10;                // batas tumpukan Afsoul (Neobert)
const MIRROR_TURNS = 3;               // Cermin Kutukan Napoleon: 3 putaran

const RANK_MULT = {
  Junior: 1, Senior: 1.2, Master: 2.1, Sovereign: 1.4,
  Aberation: 1.8, Abyss: 2.4, Vanguard: 2.6, Sentinel: 2.9,
  Devil: 3.2, Pluto: 3
};

/* Urutan kekuatan untuk Roulette (arena.js). Devil dan Pluto di paling atas.
   Pluto tidak punya kedudukan di Toko, tapi dihitung paling atas di sini. */
const RANK_ORDER = ["Junior", "Senior", "Sovereign", "Aberation", "Master", "Abyss", "Vanguard", "Sentinel", "Devil", "Pluto"];

const RANK_PRICE = { // cadangan kalau karakter tidak punya harga sendiri
  Junior: 1600, Senior: 1900, Master: 4100, Sovereign: 2500,
  Aberation: 3100, Abyss: 6700, Vanguard: 6800, Sentinel: 8800,
  Devil: 7500, Pluto: 9800
};

/* Pengali harga per kedudukan: kedudukan tinggi sengaja jauh lebih mahal.
   Harga akhir = harga dasar di tabel PRICE x pengali ini (dibulatkan ke 50 koin). */
const PRICE_RANK_MULT = {
  Junior: 1, Senior: 1, Sovereign: 1.3, Aberation: 1.4, Master: 1.8,
  Abyss: 2.2, Vanguard: 2.6, Sentinel: 3.2, Devil: 2.8, Pluto: 2.4
};

/* Harga tiap karakter (koin), sesuai rentang kedudukan. */
const PRICE = {
  oleander: 1600, angel: 1700, sam: 1600, quinn: 1550, mala: 1500, eugeo: 1650, peter: 1600,
  nicolay: 1700, leon: 1550, alexandru: 1650, vloryn: 1700, rey: 1500, eric: 1500, vincent: 1600,
  shelly: 1650, raser: 1600, steven: 1500, gloo: 1550, lucario: 1650, jeff: 1500,
  ficarne: 1900, garan: 1900, vlad: 1850, lylia: 1950, clefa: 2000,
  victor: 4200, kanae: 4300, clay: 4400, emmanuel: 3800, dinara: 3400, marcel: 4500,
  napoleon: 2500,
  danzo: 3300, milhyea: 3100,
  regatta: 6700,
  neobert: 7100, qmark: 7800,
  mircea: 6800, zelonc: 6900, simon: 6700, ruben: 6600,
  annerose: 8600, loki: 8900, kaiser: 9500,
  loid: 9800
};

// Letak di Toko: region + nomor tab kedudukan (lihat SHOP_REGIONS di shopRegions.js)
const RANK_PLACE = {
  Junior:    { region: "ability",   rank: 1 },
  Senior:    { region: "ability",   rank: 2 },
  Master:    { region: "ability",   rank: 3 },
  Vanguard:  { region: "auravania", rank: 1 }, // wilayah "Imperium Military"
  Sentinel:  { region: "auravania", rank: 2 },
  Sovereign: { region: "rebels",    rank: 1 },
  Aberation: { region: "rebels",    rank: 2 }, // di atas Sovereign, di bawah Insurgent
  Abyss:     { region: "gehenna",   rank: 1 },
  Devil:     { region: "gehenna",   rank: 2 },
  Pluto:     { region: "pluto",     rank: 0 }  // Pluto tanpa kedudukan
};

const BASE_STATS = { hp: 850, mana: 440, atk: 150, def: 60, spd: 30 };

/* Jenis energi tiap sistem kekuatan. */
const ENERGY_OF = { Artifact: "charge", Mutation: "energy", Confer: "energy" };

/** Nama energi untuk tampilan: "Mana", "Charge", atau "Energy". */
function energyName(c) {
  if (!c) return "Mana";
  if (c.energy === "charge") return "Charge";
  if (c.energy === "energy") return "Energy";
  return "Mana";
}

/** Teks biaya skill untuk daftar (mis. "55 Mana", "120 Charge"). */
function skillCostText(character, skill) {
  return skill.manaCost + " " + energyName(character);
}

/* Skill yang diputuskan AI lewat aturan khusus (mechanics.js), bukan AI umum. */
const AI_MANUAL_SP = ["nightmare", "boom", "revive", "timelock", "pull", "suck", "blackhole", "soulswap", "hpequal", "doubleback", "mimicall"];

/* ---------- Pembuat skill (hanya dipakai di berkas ini) ---------- */
const KIND = {
  A1:  ["single_attack", "single_enemy"], AA:  ["area_attack", "all_enemies"],
  X1:  ["single_attack", "single_enemy"], XA:  ["area_attack", "all_enemies"],
  H1:  ["healing", "single_ally"], HA: ["healing", "all_allies"], HS: ["healing", "self"],
  RV1: ["healing", "dead_ally"],
  S1:  ["debuff", "single_enemy"], SA: ["debuff", "all_enemies"],
  D1:  ["debuff", "single_enemy"], DA: ["debuff", "all_enemies"],
  B1:  ["buff", "single_ally"], BA: ["buff", "all_allies"], BS: ["buff", "self"],
  SH1: ["shield", "single_ally"], SHA: ["shield", "all_allies"], SHS: ["shield", "self"]
};

function buildSkill(cid, slot, def, mult) {
  const name = def[0], kind = def[1], card = def[2], desc = def[3], o = def[4] || {};
  const k = KIND[kind];
  const eff = Math.max(0, card) * (o.n ? Math.min(1, o.n / 3) : 1);
  const power = (kind === "X1" || kind === "XA" || k[0] === "buff" || k[0] === "debuff" || k[0] === "shield")
    ? 0 : Math.max(0.1, Math.round(eff / CARD_K * 100) / 100);

  // Biaya dihitung belakangan oleh finalizeSkillCosts() dari BESAR KEGUNAAN skill.
  const s = { id: cid + "_s" + slot, name: name, type: k[0], target: k[1], manaCost: 0, power: power, description: desc };
  if (o.hits) s.hits = o.hits;
  if (kind === "X1" || kind === "XA") {
    s.execute = { belowHP: Math.round(card * HP_SCALE * mult) };
    s.description += " HP target di bawah " + s.execute.belowHP + " = langsung kalah, kalau tidak skill hangus.";
  }
  if (o.stun) s.effect = { type: "stun", chance: 1.0, turns: o.stun };
  else if (o.blind) s.effect = { type: "blind", turns: o.blind };
  else if (o.poison) s.effect = { type: "dot", stat: "poison", percent: o.poison[0], turns: o.poison[1] };
  else if (o.burn) s.effect = { type: "dot", stat: "burn", percent: o.burn[0], turns: o.burn[1] };
  else if (o.deb) s.effect = { type: "debuff", stat: o.deb[0], percent: o.deb[1], turns: o.deb[2] };
  else if (o.buf) s.effect = { type: "buff", stat: o.buf[0], percent: o.buf[1], turns: o.buf[2] };
  else if (o.freeze) s.effect = { type: "freeze", shatterPercent: o.freeze };
  if (s.effect && s.effect.type === "dot" && o.whileAlive) s.effect.bound = true; // DoT bertahan selama pemakainya hidup
  if (o.bufs) s.effects = o.bufs.map(function (b) { return { type: "buff", stat: b[0], percent: b[1], turns: b[2] }; });
  if (k[0] === "shield") {
    const sh = { kind: o.sh || "timed", basis: "source" };
    if (sh.kind !== "amount") sh.turns = o.turns || 2;
    if (sh.kind !== "absolute") sh.multiplier = Math.round((card * HP_SCALE / BASE_STATS.atk) * 100) / 100 || 1.2;
    s.shield = sh;
  }

  // ----- penanda efek khusus (dibaca mechanics.js) -----
  if (o.sp) { s.sp = o.sp; if (AI_MANUAL_SP.indexOf(o.sp) !== -1) s.aiManual = true; }
  if (o.afsoul) s.afsoul = o.afsoul;            // tambah stack Afsoul
  if (o.afsoulSolo) s.afsoulSolo = o.afsoulSolo; // tambahan kalau musuh tinggal 1
  if (o.dkg) s.dkg = o.dkg;                      // tambah stack dkg (angka kartu)
  if (o.regenPct) { s.regenPct = o.regenPct; s.regenTurns = o.regenTurns || 3; }
  if (o.once) s.oncePerBattle = true;            // hanya 1x per pertarungan
  if (o.lock) s.lock = o.lock;                   // curi giliran musuh
  if (o.extra) s.extraTurn = o.extra;            // timmu main lagi (musuh melewatkan n giliran)
  if (o.also) s.alsoHit = o.also;                // serangan juga menjangkau n musuh lain (sebelah target)
  if (o.pct) s.costPct = o.pct;                  // biaya = % dari max energi (aturan kartu)
  if (o.ignoreDef) s.ignoreDef = true;           // menembus pertahanan (DEF target diabaikan)
  if (o.antiHeal) s.antiHeal = o.antiHeal;       // target tidak bisa disembuhkan n giliran
  if (o.selfHeal) s.selfHealPower = Math.round(o.selfHeal / CARD_K * 100) / 100; // pemakai pulih sendiri
  if (o.reflect) s.reflect = { percent: o.reflect[0], turns: o.reflect[1], mode: o.reflect[2] || "pct" }; // pantulkan damage
  if (o.dmgReduce) s.dmgReduce = { percent: o.dmgReduce[0], turns: o.dmgReduce[1] }; // damage masuk berkurang
  if (o.seal) s.seal = o.seal;                   // segel skill target: { slot | "strongest", turns | "caster" }
  if (o.manaDrain) s.manaDrain = o.manaDrain;    // energi target berkurang n% dari maksimumnya
  if (o.soloBonus) s.soloBonus = o.soloBonus;    // damage +n% kalau musuh tinggal 1
  if (o.bonusVsDebuff) s.bonusVsDebuff = o.bonusVsDebuff; // damage +n% ke target yang DEF-nya sedang turun
  if (o.dice) s.dice = true;                     // kekuatan dikali hasil dadu 1-6 (rata-rata 1x)
  if (o.nerf) s.nerf = o.nerf;                   // { stats, ratio, turns }: stat musuh turun sebesar ratio x energi yang dipakai
  if (o.near) s.nearOnly = true;                 // hanya pemakai + sekutu tepat di sebelahnya
  if (o.debs) s.effects = (s.effects || []).concat(o.debs.map(function (b) { return { type: "debuff", stat: b[0], percent: b[1], turns: b[2] }; }));
  if (o.teamBufs) s.teamBuffs = o.teamBufs.map(function (b) { return { type: "buff", stat: b[0], percent: b[1], turns: b[2] }; });
  if (o.selfStun) s.selfStun = o.selfStun;       // pemakai sendiri tidak bisa bermain n giliran
  if (o.onlyMagic) s.onlyMagic = true;           // hanya mengenai musuh pengguna sihir
  if (o.neutral) s.neutral = true;               // mengenai semua karakter di arena (kecuali pemakai)
  if (o.reviveAct) s.reviveAct = true;           // yang dihidupkan langsung bermain
  if (o.deathMark) s.deathMark = true;           // beri tanda kematian (Annerose)
  if (o.markExec) s.markExec = true;             // batas eksekusi naik per tanda kematian
  if (o.lockOn) s.lockOn = o.lockOn;             // target TERKUNCI n giliran (Milhyea)
  if (o.needsLock) s.needsLock = true;           // hanya ke target yang terkunci
  if (k[0] === "buff" && o.turns) s.turns = o.turns;
  return s;
}

/* ============================================================
   BIAYA ENERGI BERDASARKAN KEGUNAAN
   Setiap skill diberi "nilai" dalam satuan serangan 1 target (power 1 = 1).
   Biaya = (DASAR + PER_NILAI x nilai) x pengali kedudukan. Jadi skill yang
   damage/efeknya lebih besar SELALU lebih mahal, tidak peduli urutan slotnya.
   ============================================================ */
const COST_BASE = 15;        // biaya minimal skill apa pun (Junior)
const COST_PER_VALUE = 52;   // tambahan biaya per 1 nilai (Junior)
const COST_CAP = 0.7;        // satu skill paling mahal 70% dari max energi
const AREA_FACTOR = 2.2;     // kena semua musuh/sekutu = sekitar 2,2x satu target

// Skill yang kekuatannya ditentukan aturan khusus, bukan angka power di data.
const POWER_FROM_RULE = ["boom", "blackhole", "soulcontrol", "mimicprev", "doubleback"];

function isAllTarget(s) { return s.target === "all_enemies" || s.target === "all_allies"; }

/** Nilai satu efek status (dipakai skillValue). */
function effectValue(e, all) {
  const t = Math.min(e.turns || 1, 6);
  const wide = all ? AREA_FACTOR : 1;
  switch (e.type) {
    case "stun": return (e.chance === undefined ? 1 : e.chance) * t * (all ? 2.0 : 0.9);
    case "blind": return t * (all ? 1.1 : 0.5);
    case "dot": return e.percent * (e.bound ? 6 : t) * wide;
    case "freeze": return 1.5 + (e.shatterPercent || 0);
    case "buff": return e.stat === "attack" ? e.percent * Math.min(t, 4) * 0.9 * (all ? 2.2 : 1) : e.percent * t * 0.45 * (all ? 2.2 : 1);
    case "debuff": return e.percent * t * (e.stat === "attack" ? 0.7 : 0.6) * (all ? 2 : 1);
    default: return 0.3;
  }
}

/** Nilai kegunaan skill (satuan: serangan 1 target power 1). */
function skillValue(s, ch) {
  const all = isAllTarget(s);
  const wide = all ? AREA_FACTOR : 1;
  let v = 0;
  const isAtk = s.type === "single_attack" || s.type === "area_attack";

  if (s.execute) {
    const ratio = s.execute.belowHP / Math.max(1, ch.maxHP);       // batas eksekusi dibanding HP sendiri
    v += (all ? 2.8 : 1.7) * Math.min(1.3, ratio / 0.45);
  } else if (isAtk && POWER_FROM_RULE.indexOf(s.sp) === -1) {
    let p = s.power * wide;
    if (s.alsoHit) p *= 1 + 0.7 * s.alsoHit;
    if (s.ignoreDef) p *= 1.15;
    if (s.soloBonus) p *= 1 + s.soloBonus * 0.3;
    if (s.bonusVsDebuff) p *= 1 + s.bonusVsDebuff * 0.4;
    v += p;
  }
  if (s.sp === "revive") v += 2.0 + s.power * 0.9 + (s.reviveAct ? 1.0 : 0);
  else if (s.type === "healing" && s.sp === "poolheal") v += s.power * 0.9;           // satu kolam heal dibagi tim
  else if (s.type === "healing" && !s.sp) v += s.power * (s.target === "self" ? 0.75 : all ? 1.8 : 0.9);
  if (s.type === "shield" && s.shield) {
    if (s.shield.kind === "absolute") v += Math.min(s.shield.turns || 1, 4) * (all ? 2.4 : 1.1);
    else v += (s.shield.multiplier || 1.2) * 0.7 * (all ? 2.0 : 1) * (s.shield.kind === "amount" ? 1.2 : 1);
  }
  if (s.effect) v += effectValue(s.effect, all);
  (s.effects || []).forEach(function (e) { v += effectValue(e, all); });
  (s.teamBuffs || []).forEach(function (e) { v += effectValue(e, true); });
  if (s.selfStun) v -= 0.6 * s.selfStun;
  if (s.onlyMagic) v *= 0.6;
  if (s.neutral) v *= 0.6;
  if (s.antiHeal) v += 0.25 * s.antiHeal * (all ? 2 : 1);
  if (s.selfHealPower) v += s.selfHealPower * 0.75;
  if (s.reflect) v += (s.reflect.mode === "ownMaxHp" ? 1.0 : s.reflect.percent * 0.8) * Math.min(s.reflect.turns, 4) * (all ? 2 : 1);
  if (s.deathMark) v += 0.4;
  if (s.needsLock) v *= 0.85;
  if (s.dmgReduce) v += s.dmgReduce.percent * Math.min(s.dmgReduce.turns, 4) * (all ? 1.6 : 0.8);
  if (s.seal) v += s.seal.turns === "caster" ? 2.0 : 0.5 * (s.seal.turns || 1);
  if (s.manaDrain) v += s.manaDrain * 3 * (all ? 2 : 1);
  if (s.nerf) v += 1.2 * (all ? 2 : 1);
  if (s.extraTurn) v += 1.4 * s.extraTurn;
  if (s.regenPct) v += s.regenPct * (s.regenTurns || 3) * 6;
  if (s.dkg) v += s.dkg / CARD_K * 0.3;
  if (s.afsoul) v += 0.15 * s.afsoul;

  const SPECIAL = { timelock: 1.6 * (s.lock || 3), mirror: 3.0, suck: 1.0, pull: 0.9, blackhole: 1.6,
    boom: 2.5, hpequal: 1.2, soulcontrol: 2.2, poolheal: 0, hpx2: 3.0, soulswap: 1.2,
    mimicshield: 0.4, mimicnext: 1.8, mimicprev: 1.3, doubleback: 1.6, mimicall: 3.2 };
  if (s.sp && SPECIAL[s.sp] !== undefined) v += SPECIAL[s.sp];
  if (s.oncePerBattle) v *= 0.8;
  return Math.max(0.35, v);
}

/** Biaya energi sebuah nilai untuk karakter/unit tertentu (dipakai juga untuk skill tiruan Clay). */
function energyCostFor(ch, value) {
  if (ch.powerSystem === "Confer") return Math.max(1, Math.round(ch.maxMana * Math.min(0.6, Math.max(0.05, 0.04 + 0.075 * value))));
  let cost = (COST_BASE + COST_PER_VALUE * value) * (RANK_MULT[ch.rank] || 1);
  if (ch.powerSystem === "Mutation") cost *= MUTATION_COST_MULT;
  return Math.max(20, Math.round(cost / 5) * 5);
}

/** Menetapkan biaya energi SEMUA karakter (dipanggil sekali setelah semua karakter dimasukkan). */
function finalizeSkillCosts() {
  CHARACTER_DATABASE.forEach(function (ch) {
    const mult = RANK_MULT[ch.rank] || 1;
    const sys = ch.powerSystem;
    ch.skills.forEach(function (s) {
      s.value = Math.round(skillValue(s, ch) * 100) / 100;
      if (sys === "Confer") {
        // Confer: energinya kecil (15% HP). Biaya = bagian dari max Energy sesuai nilai skill.
        s.manaCost = Math.max(1, Math.round(ch.maxMana * Math.min(0.6, Math.max(0.05, 0.04 + 0.075 * s.value))));
      } else {
        let cost = (COST_BASE + COST_PER_VALUE * s.value) * mult;
        if (sys === "Mutation") cost *= MUTATION_COST_MULT; // Energy lebih hemat 30%
        s.manaCost = Math.max(20, Math.round(cost / 5) * 5);
      }
    });
    // Artifact: max Charge = 2x skill termahal (semua skill pasti bisa dibayar dari Charge penuh)
    if (sys === "Artifact") ch.maxMana = 2 * Math.max.apply(null, ch.skills.map(function (s) { return s.manaCost; }));
    // Batas: satu skill tidak boleh lebih dari 70% max energi (kecuali biaya persen dari kartu)
    ch.skills.forEach(function (s) {
      if (sys !== "Confer") s.manaCost = Math.min(s.manaCost, Math.max(20, Math.round(ch.maxMana * COST_CAP / 5) * 5));
      if (s.costPct) s.manaCost = Math.max(1, Math.round(s.costPct * ch.maxMana));
    });
  });
}

function C(key, name, role, system, rank, icon, stats, skills, extra) {
  const mult = RANK_MULT[rank];
  const st = Object.assign({}, BASE_STATS, stats || {});
  const ex = extra || {};
  const maxHP = Math.round(st.hp * mult);
  const normalMana = Math.round(st.mana * mult);
  const conferEnergy = Math.max(1, Math.round(CONFER_ENERGY_PERCENT * maxHP));
  const ch = {
    id: "char_" + key, name: name, role: role, icon: icon,
    elite: true, price: Math.round((PRICE[key] || RANK_PRICE[rank]) * (PRICE_RANK_MULT[rank] || 1) / 50) * 50, rank: rank, powerSystem: system,
    energy: ENERGY_OF[system] || "mana",
    placement: RANK_PLACE[rank],
    maxHP: maxHP, maxMana: normalMana,
    attack: Math.round(st.atk * mult), defense: Math.round(st.def * mult), speed: st.spd,
    skills: skills.map(function (d, i) { return buildSkill("char_" + key, i + 1, d, mult); })
  };

  // Max energi tiap sistem (Artifact diatur finalizeSkillCosts: 2x skill termahal)
  if (system === "Confer") ch.maxMana = conferEnergy;
  if (system === "Mutation") ch.maxEssence = Math.round(maxHP * ESSENCE_MAX_PERCENT);
  if (system === "Confer") ch.maxResonance = Math.round(maxHP * CONFER_RES_MULT);

  if (system === "Breathing") ch.image = EMBLEM_IMG.sword;
  else if (system === "Magic") ch.image = EMBLEM_IMG.book;
  // Artifact / Mutation / Confer: gambar dipasang systemEmblems.js
  if (ex.note) ch.note = ex.note;
  if (ex.placeholder) ch.placeholder = true;
  CHARACTER_DATABASE.push(ch);
}

/* Lima karakter lama (characters.js) tidak diubah datanya; hanya diberi
   kedudukan supaya bisa dipakai Roulette. */
(function tagOriginalRanks() {
  const rankOf = { char_nowrt: "Senior", char_rumia: "Senior", char_zoeel: "Junior", char_venesa: "Junior", char_zaenal: "Junior" };
  CHARACTER_DATABASE.forEach(function (c) {
    if (!c.rank && rankOf[c.id]) c.rank = rankOf[c.id];
  });
})();

/* ============================================================
   JUNIOR (x1) - Ability Classroom I
   ============================================================ */
C("oleander", "Oleander", "Pernafasan Binatang", "Breathing", "Junior", "🐗", { hp: 900, atk: 150, def: 65 }, [
  ["Raungan Binatang Buas", "AA", 200, "Raungan mengguncang seluruh musuh."],
  ["Jepitan Taring", "A1", 600, "Taring menjepit satu musuh."],
  ["Sundulan Babi Hutan", "A1", 800, "Sundulan babi hutan ke satu musuh."],
  ["Tebasan Cincang", "A1", 900, "Cincangan 150 x 6 ke satu musuh.", { hits: 6 }],
  ["Kurban T-Rex", "HA", 500, "Memakan korban T-Rex, memulihkan HP seluruh tim."],
  ["Terkaman Kejut", "X1", 2000, "Terkaman maut ke satu musuh."]
]);

C("angel", "Angel", "Pernafasan Sakura", "Breathing", "Junior", "🌸", { hp: 830, atk: 145 }, [
  ["Arena Sakura Bertebaran", "SA", 0, "Kelopak sakura menyelimuti arena, musuh tidak bisa bermain 1x.", { stun: 1 }],
  ["Sakura Beracun", "A1", 200, "Sakura beracun ke satu musuh, racunnya berjalan 5 giliran.", { poison: [0.33, 5] }],
  ["Aroma Sakura Menyengat", "A1", 600, "Aroma sakura menyengat satu musuh."],
  ["Sakura Berguguran", "AA", 500, "Sakura berguguran melukai seluruh musuh."],
  ["Aroma Wangi Musim Gugur Sakura", "HA", 500, "Memulihkan HP seluruh tim."],
  ["Anugrah Sakura", "RV1", 300, "Menghidupkan 1 sekutu yang kalah, lalu sekutu itu langsung bermain.", { sp: "revive", reviveAct: true }]
]);

C("sam", "Sam", "Pernafasan Api", "Breathing", "Junior", "🔥", { hp: 900, atk: 150, def: 70 }, [
  ["Tebasan Jalan Api", "A1", 250, "Tebasan api ke satu musuh."],
  ["Pembakaran", "A1", 400, "10 x 40 serangan api beruntun.", { hits: 40 }],
  ["Tebasan Roda Api", "A1", 650, "Tebasan roda api ke satu musuh."],
  ["Kobaran Api Melingkar", "AA", 400, "Kobaran api melingkar menjangkau 3 musuh.", { n: 3 }],
  ["Neraka Bulatan", "AA", 500, "Neraka api ke seluruh musuh."],
  ["Tebasan Lautan Api", "AA", 100, "Lautan api membakar seluruh musuh dan terus menyala selama Sam masih hidup.", { burn: [0.17, 6], whileAlive: true }]
]);

C("quinn", "Quinn", "Sihir Catur", "Magic", "Junior", "♟️", { hp: 800, mana: 500, atk: 155 }, [
  ["Italyan's Gambit", "AA", 300, "Gambit pembuka menyerang seluruh musuh."],
  ["En Passant", "A1", 500, "Serangan en passant ke satu musuh."],
  ["Rokade", "HS", 400, "Rokade, memulihkan HP diri sendiri."],
  ["London System", "A1", 600, "Sistem London menekan satu musuh."],
  ["Checkmate", "A1", 1000, "Skakmat ke satu musuh."],
  ["Domain: Legion Play", "BS", 0, "Domain duel: seluruh ability Quinn (ATK, DEF, SPD) naik 1,5x selama 4 giliran.", { bufs: [["attack", 0.5, 4], ["defense", 0.5, 4], ["speed", 0.5, 4]] }]
]);

C("mala", "Mala", "Sihir Sampah", "Magic", "Junior", "🗑️", { hp: 820, mana: 460, atk: 145 }, [
  ["Lemparan Tong Sampah", "A1", 200, "Tong sampah melayang ke satu musuh."],
  ["Semburan Aroma Sampah", "AA", 400, "Aroma sampah menjangkau 2 musuh.", { n: 2 }],
  ["Daur Ulang", "HA", 400, "Mendaur ulang, memulihkan HP seluruh tim."],
  ["Area Musuh Full Sampah", "AA", 100, "Area musuh penuh sampah: racun 4 giliran dan musuh TIDAK BISA disembuhkan selama itu.", { poison: [0.17, 4], antiHeal: 4 }],
  ["Hujan Sampah", "AA", 600, "Hujan sampah ke seluruh musuh."],
  ["Plastik Sampah", "A1", 600, "Membungkus satu musuh, lalu hancur sebesar total 1500 damage.", { freeze: 1.5 }]
]);

C("eugeo", "Eugeo", "Sihir Pedang", "Magic", "Junior", "⚔️", { hp: 850, mana: 450, atk: 155 }, [
  ["Pengumpulan Pedang", "BS", 0, "Mengumpulkan pedang, damage naik 30% selama 3 giliran.", { buf: ["attack", 0.3, 3] }],
  ["Putaran Badai Pedang", "AA", 300, "Badai pedang ke seluruh musuh."],
  ["Sinar Pedang Suci", "HA", 300, "Sinar suci memulihkan Eugeo dan sekutu tepat di sebelahnya.", { near: true }],
  ["Hujan Pedang", "AA", 500, "Hujan pedang ke seluruh musuh."],
  ["Hantaman Giant Sword", "A1", 800, "Pedang raksasa menghantam satu musuh."],
  ["Pedang Penghakiman", "X1", 2000, "Pedang penghakiman ke satu musuh."]
]);

C("peter", "Peter", "Pernafasan Cahaya", "Breathing", "Junior", "✨", { hp: 830, atk: 150, spd: 40 }, [
  ["Cercahan Cahaya", "A1", 400, "Tebasan sekali kedipan ke satu musuh."],
  ["Ledakan Sinar UV", "AA", 300, "Sinar UV ke seluruh musuh."],
  ["Hembusan Cahaya", "A1", 500, "Hembusan cahaya ke satu musuh."],
  ["Cahaya Penghancur", "A1", 900, "Cahaya penghancur ke satu musuh."],
  ["Badai Cahaya Anugrah", "AA", 500, "Badai cahaya ke seluruh musuh, lalu Peter memulihkan HP-nya sendiri.", { selfHeal: 400 }],
  ["Pengabdian Cahaya", "SHS", 0, "Tidak menerima damage selama 4 giliran.", { sh: "absolute", turns: 4 }]
]);

C("nicolay", "Nicolay", "Lightning Bolt Artifact", "Artifact", "Junior", "⚡", { hp: 840, mana: 460, atk: 150, spd: 42 }, [
  ["Petir Nyarar", "A1", 300, "Petir menyambar satu musuh, lalu merambat ke 2 musuh di dekatnya.", { also: 2 }],
  ["Petir Menembus", "A1", 500, "Petir menembus satu musuh."],
  ["Petir Nyambar Tiang Listrik", "AA", 300, "Petir menyambar tiang listrik, mengenai seluruh musuh."],
  ["Tekanan Dahsyat Guruh", "A1", 900, "Tekanan guruh ke satu musuh."],
  ["Pekikan Guruh", "AA", 700, "Pekikan guruh ke seluruh musuh."],
  ["Gemuruh Halilintar", "AA", 1000, "Gemuruh halilintar ke seluruh musuh."]
]);

C("leon", "Leon", "Sihir Lukisan", "Magic", "Junior", "🎨", { hp: 820, mana: 500, atk: 150 }, [
  ["Lukisan Rumah Sakit", "HA", 300, "Lukisan rumah sakit memulihkan seluruh tim."],
  ["Lemparan Kuas Bulu Naga", "A1", 500, "Kuas bulu naga ke satu musuh."],
  ["Lukisan Dragon Lightning", "AA", 500, "Naga petir ke seluruh musuh."],
  ["Lukisan Jurang Kematian", "AA", 800, "Jurang kematian menjangkau 2 musuh.", { n: 2 }],
  ["Hantaman Lukisan Gunung", "A1", 900, "Lukisan gunung menghantam satu musuh."],
  ["Lukisan Cincin Pembalik Damage", "SHA", 0, "Seluruh tim kebal 1 giliran, dan damage yang datang dibalikkan 1,5x lipat ke penyerangnya.", { sh: "absolute", turns: 1, reflect: [1.5, 1] }]
]);

C("alexandru", "Alexandru", "Pernafasan Uap", "Breathing", "Junior", "💨", { hp: 850, atk: 150 }, [
  ["Hembusan Asap", "BS", 0, "Mengumpulkan gas, damage naik 25% selama 3 giliran. Menambah dkg +300 [SEMENTARA: angka dkg buff belum ada di kartu].", { buf: ["attack", 0.25, 3], dkg: 300 }],
  ["Tebasan Asap Vertikal", "A1", 500, "Tebasan asap ke satu musuh. Menambah dkg +500.", { dkg: 500 }],
  ["Asap-Asap Penyerang", "A1", 400, "Asap menyerang satu musuh. Menambah dkg +400.", { dkg: 400 }],
  ["Asap Penyayat", "AA", 700, "Asap menyayat seluruh musuh. Menambah dkg +700.", { dkg: 700 }],
  ["Kebakaran Hutan", "BS", 0, "Gas berlimpah, damage naik 60% selama 3 giliran. Menambah dkg +600 [SEMENTARA: angka dkg buff belum ada di kartu].", { buf: ["attack", 0.6, 3], dkg: 600 }],
  ["Boom!", "AA", 1800, "Peledakan: seluruh musuh kena damage sebesar 50% dari dkg yang terkumpul, lalu dkg kembali ke 0.", { sp: "boom" }]
]);

C("vloryn", "Vloryn", "Pernafasan Jiwa", "Breathing", "Junior", "👻", { hp: 850, atk: 150 }, [
  ["Hembusan Jiwa Vloryn", "H1", 500, "Memulihkan HP satu sekutu."],
  ["Tebasan Jiwa yang Kejam", "A1", 700, "Tebasan jiwa ke satu musuh."],
  ["Kebaikan Jiwa Malaikat", "HA", 600, "Memulihkan HP seluruh tim."],
  ["Menyetarakan HP", "HA", 0, "HP seluruh sekutu disetarakan dengan HP Vloryn saat itu (tidak melebihi max HP masing-masing).", { sp: "hpequal" }],
  ["Pertukaran Jiwa", "H1", 0, "Vloryn menukar jiwanya dengan satu sekutu: HP keduanya bertukar.", { sp: "soulswap" }],
  ["Pembangkit Jiwa", "RV1", 1000, "Menghidupkan 1 sekutu yang kalah dengan HP besar. Giliran lalu berganti seperti biasa.", { sp: "revive" }]
]);

C("rey", "Rey", "Pernafasan Serangga", "Breathing", "Junior", "🪲", { hp: 830, atk: 148 }, [
  ["Cahaya Kunang-Kunang", "HA", 200, "Kunang-kunang memulihkan seluruh tim."],
  ["Nyamuk Malaria", "AA", 400, "Nyamuk malaria menyerang seluruh musuh."],
  ["Orang-Orang Masuk Telinga", "A1", 500, "Serangga masuk telinga, musuh tidak bisa bermain 1x.", { stun: 1 }],
  ["Serangga Pelindung", "SHS", 700, "Serangga membentuk perisai 2 giliran."],
  ["Semut Kanibal", "A1", 1500, "3000 semut menyerbu satu musuh (0,5 x 3000).", { hits: 3000 }],
  ["Amarah Tawon", "X1", 2100, "Amukan tawon ke satu musuh."]
]);

C("eric", "Eric", "Pernafasan Daun", "Breathing", "Junior", "🍃", { hp: 840, atk: 152 }, [
  ["Daun Bertebaran", "AA", 100, "Daun bertebaran, musuh tidak bisa bermain 1x.", { stun: 1 }],
  ["Daun Pisau", "A1", 400, "50 x 8 daun pisau ke satu musuh.", { hits: 8 }],
  ["Tusukan Teknik Serius", "A1", 900, "Tusukan serius ke satu musuh."],
  ["Tebasan Daun Perusak", "AA", 500, "Tebasan daun ke seluruh musuh."],
  ["Tebasan Daun Racun", "A1", 600, "Daun racun, racun berjalan 5 giliran.", { poison: [0.17, 5] }],
  ["Tebasan Perguguran", "AA", 900, "Tebasan perguguran ke seluruh musuh."]
]);

C("vincent", "Vincent", "Sihir Air Raksa (Mercury Magic)", "Magic", "Junior", "🪞", { hp: 840, mana: 460, atk: 150 }, [
  ["Hujan Air Raksa", "AA", 300, "Hujan air raksa ke seluruh musuh."],
  ["Tombak Terjangan", "A1", 500, "Tombak air raksa ke satu musuh."],
  ["Pembentukan Air Raksa", "BS", 0, "Damage naik 30% untuk 1 serangan.", { buf: ["attack", 0.3, 1] }],
  ["Tameng Air Raksa", "SHS", 700, "Tameng air raksa menahan damage selama 2 giliran."],
  ["Palu Air Raksa", "A1", 800, "Palu air raksa ke satu musuh."],
  ["Tebas-Tebasan Air Raksa", "AA", 900, "Tebasan air raksa ke seluruh musuh."]
]);

C("shelly", "Shelly", "Pernafasan Tinta", "Breathing", "Junior", "🖋️", { hp: 830, atk: 148 }, [
  ["Tinta Tumpah", "AA", 200, "Tinta tumpah menjangkau 2 musuh.", { n: 2 }],
  ["Cipratan Tinta", "AA", 300, "Cipratan tinta ke seluruh musuh."],
  ["Hujan Tinta", "AA", 500, "Hujan tinta ke seluruh musuh."],
  ["Tinta Cumi-Cumi", "DA", 0, "Seluruh musuh Blind selama 2 giliran: tidak bisa memilih target.", { blind: 2 }],
  ["Ledakan Tinta", "A1", 800, "Tinta meledak di satu musuh."],
  ["Tinta Snowman Permanent", "A1", 300, "Tinta permanen menempel dan terus melukai musuh itu selama Shelly masih hidup.", { poison: [0.5, 8], whileAlive: true }]
]);

C("raser", "Raser", "Pernafasan Darah", "Breathing", "Junior", "🩸", { hp: 850, atk: 150 }, [
  ["Tebasan Darah", "A1", 400, "Tebasan darah ke satu musuh."],
  ["Cekraman Darah", "A1", 700, "Cengkeraman darah ke satu musuh."],
  ["Rantai Darah Pengerat", "A1", 700, "Rantai darah, musuh tidak bisa bermain 1x.", { stun: 1 }],
  ["Cabikan Darah Penghancur", "AA", 600, "Cabikan darah ke seluruh musuh."],
  ["Donor Darah", "H1", 500, "Mendonorkan darah, memulihkan satu sekutu."],
  ["Ledakan Pembuluh Darah", "XA", 1500, "Pembuluh darah meledak, seluruh musuh dicek."]
]);

C("steven", "Steven", "Pernafasan Bambu", "Breathing", "Junior", "🎋", { hp: 880, atk: 148, def: 65 }, [
  ["Tusukan Bambu", "A1", 200, "Tusukan bambu ke satu musuh."],
  ["Putaran Bambu Ganda", "AA", 300, "Putaran bambu ke seluruh musuh."],
  ["Hujan Bambu Runcing", "AA", 600, "Hujan bambu runcing ke seluruh musuh."],
  ["Pertumbuhan Bambu", "AA", 100, "Bambu tumbuh melukai seluruh musuh."],
  ["Penjara Bambu Runcing", "S1", 0, "Satu musuh terkurung, tidak bisa bergerak 3 giliran.", { stun: 3 }],
  ["Hukuman Bambu Runcing", "A1", 1500, "Hukuman bambu runcing ke satu musuh."]
]);

C("gloo", "Gloo", "Pernafasan Slime", "Breathing", "Junior", "🟢", { hp: 870, atk: 148 }, [
  ["Slime Menjalar", "AA", 300, "Slime menjalar ke seluruh musuh."],
  ["Pantulan Slime", "SHS", 700, "Tubuh slime memantul: perisai 2 giliran, dan damage yang diterima Gloo dipantulkan ke SEMUA tim penyerang, dibagi rata.", { reflect: [1.0, 2, "spread"] }],
  ["Penjara Slime", "S1", 0, "Satu musuh terperangkap slime 3 giliran.", { stun: 3 }],
  ["Tebasan Slime Berpantul", "AA", 500, "Tebasan slime berpantul ke seluruh musuh."],
  ["Pecahan Slime", "BS", 0, "Gloo memecah diri, damage 2x untuk 1 serangan.", { buf: ["attack", 1.0, 1] }],
  ["Pengendalian Slime", "A1", 300, "Mengendalikan slime, musuh terkunci 3 giliran.", { stun: 3 }]
]);

C("lucario", "Lucario", "Sihir Ledakan", "Magic", "Junior", "💥", { hp: 820, mana: 480, atk: 155 }, [
  ["Pin Granat Lepas", "BS", 0, "Pin granat dilepas, damage naik 30% selama 3 giliran.", { buf: ["attack", 0.3, 3] }],
  ["Meledak", "A1", 500, "Ledakan ke satu musuh."],
  ["Landmine", "A1", 700, "Ranjau darat ke satu musuh."],
  ["Bombardir", "AA", 600, "Bombardir ke seluruh musuh."],
  ["The Little Boy", "A1", 1000, "Bom besar ke satu musuh."],
  ["Domain: Ledakan Padang Mesiu", "A1", 1400, "Padang mesiu meledak di satu musuh."]
]);

C("jeff", "Jeff", "Pernafasan Air", "Breathing", "Junior", "🌊", { hp: 850, atk: 150 }, [
  ["Banjir Bandang", "A1", 50, "Banjir bandang menerjang satu musuh."],
  ["Hantaman Ombak Gelombang", "AA", 400, "Ombak gelombang menghantam seluruh musuh."],
  ["Ombak Ketenangan", "BS", 0, "Ombak yang tenang menguatkan pertahanan Jeff (Defense +100%, 3 giliran). Hanya 1x kesempatan.", { buf: ["defense", 1.0, 3], once: true }],
  ["Tornado Air", "A1", 600, "Tornado air menerjang satu musuh."],
  ["Mandi Bareng [Segerr]", "HA", 300, "Seluruh tim mandi bareng dan pulih HP, lalu timmu main lagi (musuh melewatkan 1 giliran).", { extra: 1 }],
  ["Pembentukan Tsunami", "AA", 800, "Tsunami raksasa menghantam seluruh musuh. Musuh tidak bisa bermain 1x.", { stun: 1 }]
]);

/* ============================================================
   SENIOR (x1,2) - Ability Classroom II
   ============================================================ */
C("ficarne", "Ficarne", "Pernafasan Bayangan", "Breathing", "Senior", "🌑", { hp: 850, atk: 155 }, [
  ["Blackning", "A1", 300, "Serangan bayangan cepat."],
  ["Crazy Kick", "A1", 400, "Tendangan gila ke satu musuh."],
  ["Terjang Tombak Bayangan", "A1", 800, "Tombak bayangan menerjang satu musuh."],
  ["Pasukan Bayangan", "AA", 500, "Pasukan bayangan menyerang seluruh musuh. Kalau musuh tinggal 1, damage +50%.", { soloBonus: 0.5 }] /* TEBAKAN: besar bonus */,
  ["Pedang Makhluk Bayangan", "A1", 1200, "Pedang makhluk bayangan ke satu musuh."],
  ["Shadow Mode", "BS", 0, "Damage 1,5x selama 4 giliran.", { buf: ["attack", 0.5, 4] }]
]);

C("garan", "Garan", "Sihir Gravitasi", "Magic", "Senior", "🌌", { hp: 830, mana: 480, atk: 150 }, [
  ["Perisai Gravitasi", "SHS", 0, "Tidak bisa diserang 1 giliran.", { sh: "absolute", turns: 1 }],
  ["Tekanan Gravitasi", "AA", 300, "Tekanan gravitasi ke seluruh musuh."],
  ["Pusaran Gravitasi", "AA", 500, "Pusaran gravitasi ke seluruh musuh."],
  ["Tumbukan Gravitasi", "A1", 700, "Tumbukan gravitasi ke satu musuh."],
  ["Gravitasi Kerut", "A1", 900, "Gravitasi mengerut menekan satu musuh."] /* MENUNGGU: arti "-200" di kartu */,
  ["Zona Gravitasi", "AA", 300, "Zona gravitasi ke seluruh musuh + damage berjalan 3 giliran. Lempar dadu: 1 = zona melemah (damage x0,5, tanpa damage berjalan), 2-3 = normal, 4-5 = damage x1,5, 6 = GRAVITASI RUNTUH (damage x2 dan seluruh musuh tidak bisa bermain 1x).", { poison: [0.5, 3], dice: true }]
]);

C("vlad", "Vlad", "Pernafasan Pasir", "Breathing", "Senior", "🏜️", { hp: 870, atk: 150 }, [
  ["Tebasan Pasir Susulan", "A1", 400, "Tebasan pasir ke satu musuh."],
  ["Serangan Ular Pasir", "A1", 600, "Ular pasir menyerang satu musuh."],
  ["Dinding Pasir", "SHS", 1000, "Dinding pasir 1000 pertahanan, 1 giliran.", { turns: 1 }],
  ["Tebasan Pasir Panas", "AA", 500, "Pasir panas ke seluruh musuh."],
  ["Pasir Penghisap", "S1", 0, "Satu musuh dihisap pasir, tidak bisa bermain 3 giliran.", { stun: 3 }],
  ["Ledakan Gurun", "DA", 0, "Seluruh musuh Blind selama 3 giliran: tidak bisa memilih target.", { blind: 3 }]
]);

C("lylia", "Lylia", "Pernafasan Cinta", "Breathing", "Senior", "💗", { hp: 830, atk: 148 }, [
  ["Acara Manten", "HA", 250, "Acara manten, seluruh tim pulih."] /* MENUNGGU: bonus pengantin */,
  ["Di-Putusin Pacar", "BS", 0, "Lylia marah, damage naik 40% selama 2 giliran.", { buf: ["attack", 0.4, 2] }],
  ["Tampil Penuh Pesona", "SA", 0, "Musuh terpesona, tidak bisa bermain 2 giliran.", { stun: 2 }],
  ["Daring", "H1", 1000, "Memulihkan satu sekutu (kartu: tidak untuk Lylia sendiri)."],
  ["Cinta Palsu", "A1", 500, "Cinta palsu, musuh sedih (damage -30%) 3 giliran.", { deb: ["attack", 0.3, 3] }],
  ["Kiss [Buff]", "B1", 0, "Satu sekutu damage 2x selama 2 giliran.", { buf: ["attack", 1.0, 2] }]
]);

C("clefa", "Clefa", "Sihir Segel", "Magic", "Senior", "🔏", { hp: 830, mana: 480, atk: 150 }, [
  ["Segel Perusak", "A1", 300, "Segel perusak ke satu musuh."],
  ["Penyegelan Rasa Sakit", "H1", 400, "Menyegel rasa sakit satu sekutu."],
  ["Pelepasan Segel", "A1", 700, "Melepas segel, object keluar menghantam satu musuh."],
  ["Segel Skala", "SA", 0, "Seluruh musuh tidak bisa bermain 2 giliran.", { stun: 2 }],
  ["Segel Suci", "S1", 0, "Pilih satu skill (1 sampai 5) milik satu musuh untuk disegel selama 2 giliran.", { seal: { slot: "pick", turns: 2 } }],
  ["Segel Mata Iblis", "D1", 0, "Menyegel skill 6 satu musuh sampai Clefa kalah.", { seal: { slot: 6, turns: "caster" } }]
]);

/* ============================================================
   MASTER (x2,1) - Ability Classroom III
   ============================================================ */
C("victor", "Victor", "Sihir Hitam", "Magic", "Master", "🕷️", { hp: 860, mana: 470, atk: 152 }, [
  ["Muntah Paku", "A1", 400, "Muntah paku ke satu musuh."],
  ["Perobekan Organ Dalam", "A1", 700, "Merobek organ dalam satu musuh."],
  ["Dibanting Gendruwo", "A1", 800, "Gendruwo membanting satu musuh."],
  ["Jump Scare Kuntilanak", "A1", 800, "Kuntilanak muncul, musuh tidak bisa bermain 1x.", { stun: 1 }],
  ["Cakaran Misterius", "A1", 1300, "Cakaran misterius ke satu musuh."],
  ["Pengendalian Jiwa Musuh", "A1", 1300, "Mengendalikan jiwa satu musuh: musuh itu dilukai oleh kekuatan serangannya sendiri (ATK musuh x2,2).", { sp: "soulcontrol" }]
]);

C("kanae", "Kanae", "Orchid Growing Confer", "Confer", "Master", "🌺", { hp: 850, mana: 460, atk: 150 }, [
  ["Tebasan Cahaya Anggrek", "A1", 400, "Tebasan cahaya anggrek."],
  ["Cahaya Anggrek Penyilauan", "AA", 400, "Cahaya anggrek menyilaukan seluruh musuh."],
  ["Tusukan Anggrek Beracun", "A1", 300, "Tusukan beracun, racun x3.", { poison: [0.33, 3] }],
  ["Anggrek Kibasan", "AA", 600, "Kibasan anggrek ke seluruh musuh."],
  ["Penyengat Aroma", "AA", 900, "Aroma menyengat ke seluruh musuh."],
  ["Anggerek Raksasa", "A1", 1200, "Anggrek raksasa menghantam satu musuh."] /* MENUNGGU: arti "-400" di kartu */
]);

C("clay", "Clay", "Imitation Confer", "Confer", "Master", "🎭", { hp: 850, mana: 460, atk: 150 }, [
  ["Serangan Basic", "A1", 300, "Serangan dasar."],
  ["Meniru Damage Musuh yang Diterima", "SHS", 700, "Clay meniru damage terakhir yang ia terima menjadi perisai sebesar itu (minimal perisai dasar) selama 2 giliran.", { sp: "mimicshield" }],
  ["Meniru Skill Musuh Setelahnya", "BS", 0, "Clay bersiap: skill berikutnya yang dipakai musuh langsung ditiru dan dipakai balik oleh Clay (gratis).", { sp: "mimicnext" }],
  ["Meniru Skill Musuh Sebelumnya", "A1", 500, "Clay meniru skill terakhir yang dipakai musuh, memakai kekuatan Clay sendiri. Kalau musuh belum memakai skill, jadi serangan biasa.", { sp: "mimicprev" }],
  ["Penggandaan Damage yang Diterima", "A1", 0, "Melipatgandakan 2x damage terakhir yang diterima Clay, lalu dihantamkan ke satu musuh.", { sp: "doubleback" }],
  ["Peniruan Plek Skill Musuh", "D1", 0, "Meniru SEMUA skill satu musuh selama 4 kesempatan: Clay punya 12 skill (6 miliknya + 6 tiruan).", { sp: "mimicall" }]
]);

C("emmanuel", "Emmanuel", "Pernafasan Bintang", "Breathing", "Master", "⭐", { hp: 850, atk: 152 }, [
  ["Komar Kamit", "AA", 100, "Komat-kamit memanggil bintang kecil."],
  ["Tebasan Mager", "A1", 300, "Tebasan bintang ke satu musuh."],
  ["Debu-Debu Bintang", "AA", 500, "Debu bintang ke seluruh musuh."],
  ["Bintang Pengejar Setan", "A1", 1000, "Bintang mengejar satu musuh."],
  ["Komet Shower", "AA", 800, "Hujan komet ke seluruh musuh."],
  ["Garis Zodiac Penghancur", "AA", 1000, "Garis zodiac menghancurkan seluruh musuh."]
]);

C("dinara", "Dinara", "Pernafasan Bunga", "Breathing", "Master", "🌼", { hp: 850, atk: 148 }, [
  ["Dinara Sedih", "BS", 0, "Bunga kesayangannya mati, damage naik 25% selama 2 giliran.", { buf: ["attack", 0.25, 2] }],
  ["Pesta Teh Melati", "HA", 200, "Pesta teh memulihkan seluruh tim."],
  ["Berkah Bunga", "H1", 800, "Berkah bunga memulihkan satu sekutu."],
  ["700 Duri Mawar", "A1", 700, "Duri mawar ke satu musuh."],
  ["Aroma Bunga Menyengat", "AA", 300, "Aroma membuat musuh mabuk, tidak bisa bermain 1x.", { stun: 1 }],
  ["Sweet Garden", "HA", 2400, "Taman manis: pemulihan total besar dibagi rata ke seluruh tim yang hidup, lalu timmu main lagi (musuh melewatkan 1 giliran).", { sp: "poolheal", extra: 1 }]
]);

C("marcel", "Marcel", "Camera Artifact", "Artifact", "Master", "📷", { hp: 840, mana: 460, atk: 150 }, [
  ["Satu Dua...", "A1", 500, "Jepretan ke satu musuh."],
  ["Selfie Bro", "B1", 0, "Satu sekutu damage naik 50% selama 2 giliran.", { buf: ["attack", 0.5, 2] }],
  ["Kubikin Stiker Muka Lu", "A1", 600, "Stiker wajah ke satu musuh."],
  ["Zoom Out", "BA", 0, "Seluruh tim damage naik 30% selama 2 giliran.", { buf: ["attack", 0.3, 2] }],
  ["Zoom In", "BA", 0, "Seluruh tim damage 2x untuk 1 serangan.", { buf: ["attack", 1.0, 1] }],
  ["Zona Area Screenshot", "SA", 0, "Zona screenshot, seluruh musuh stun 2 giliran. Hanya bisa dipakai 1x per pertarungan.", { stun: 2, once: true }]
]);

/* ============================================================
   SOVEREIGN (x1,4) - Foreign Rebels I
   ============================================================ */
C("napoleon", "Napoleon", "Sihir Cermin", "Magic", "Sovereign", "🪟", { hp: 850, mana: 470, atk: 150 }, [
  ["Serpihan Kaca", "AA", 300, "Serpihan kaca ke seluruh musuh."],
  ["Conceal", "SHS", 0, "Tidak bisa diserang selama 2 giliran.", { sh: "absolute", turns: 2 }],
  ["Pemecahan Cermin", "A1", 400, "Cermin pecah, musuh tidak bisa bermain 1x.", { stun: 1 }],
  ["Bayangan Cermin", "BS", 0, "Bayangan cermin menahan setengah damage yang mengenai Napoleon selama 2 giliran.", { dmgReduce: [0.5, 2] }],
  ["Matahari Silau Pantulan", "AA", 500, "Pantulan matahari ke seluruh musuh."],
  ["Cermin Kutukan", "BS", 0, "Selama 3 putaran, damage apa pun yang mengenai Napoleon dipantulkan penuh ke penyerangnya.", { sp: "mirror" }]
]);

/* ============================================================
   ABERATION (x1,8) - Foreign Rebels II
   ============================================================ */
C("danzo", "Danzo", "Obsidian Mutation", "Mutation", "Aberation", "🖤", { hp: 860, atk: 152 }, [
  ["Tebasan Obsidian Hitam", "A1", 400, "Tebasan obsidian hitam."],
  ["Tebasan Obsidian Tajam", "A1", 600, "Tebasan obsidian tajam (500 + 100)."],
  ["Penajaman Obsidian Tahap Pertama", "BS", 0, "Damage naik 30% selama 3 giliran.", { buf: ["attack", 0.3, 3] }],
  ["Penajaman Obsidian Tahap Kedua", "BS", 0, "Damage naik 60% selama 3 giliran.", { buf: ["attack", 0.6, 3] }],
  ["Denruman Lahar", "A1", 600, "Lahar menerjang, musuh tidak bisa bermain 1x.", { stun: 1 }],
  ["Pasukan Alien", "AA", 200, "Pasukan alien menyerang seluruh musuh terus-menerus selama Danzo masih hidup.", { poison: [0.33, 8], whileAlive: true }]
]);

C("milhyea", "Milhyea", "Pembidik Artifact", "Artifact", "Aberation", "🎯", { hp: 840, mana: 460, atk: 152 }, [
  ["Bidikan Tepat", "A1", 400, "Bidikan tepat ke satu musuh, menembus pertahanan.", { ignoreDef: true }],
  ["Penguncian Target", "DA", 0, "Mengunci seluruh target: pertahanan musuh turun 40% dan mereka TERKUNCI selama 3 giliran.", { deb: ["defense", 0.4, 3], lockOn: 3 }],
  ["Accuration Bullet", "A1", 700, "Peluru akurat ke satu musuh, menembus pertahanan.", { ignoreDef: true }],
  ["Golden Bullet", "A1", 500, "Peluru emas menembus pertahanan, musuh tidak bisa bermain 1x.", { stun: 1, ignoreDef: true }],
  ["Headshot", "X1", 1900, "Tembakan kepala."],
  ["Deadly Eye", "A1", 1300, "Mata maut menembus pertahanan. Hanya bisa dipakai ke musuh yang sudah TERKUNCI (skill 2).", { ignoreDef: true, needsLock: true }]
], { note: "Semua serangan Milhyea menembus pertahanan (anti-defense)." });


/* ============================================================
   VANGUARD (x2,6) - Imperium Military I
   ============================================================ */
C("mircea", "Mircea", "Pernafasan Lahar (Volcano)", "Breathing", "Vanguard", "🌋", { hp: 870, atk: 152 }, [
  ["Mata Air Lahar", "AA", 200, "Mata air lahar ke seluruh musuh."],
  ["Semburan Lava", "A1", 600, "Semburan lava ke satu musuh."], /* dari kartu Mircea versi pertama */
  ["Lahar Terjun", "A1", 1000, "Lahar terjun menghantam satu musuh."], /* angka dari kartu Mircea versi pertama */
  ["Penciptaan Gempa", "SA", 0, "Gempa menyetrum seluruh musuh, tidak bisa bermain 1x.", { stun: 1 }],
  ["Bebatuan Lahar Penaklukan", "AA", 1000, "Bebatuan lahar ke seluruh musuh."],
  ["Suhu Kiamat", "AA", 400, "Suhu kiamat membakar seluruh musuh selama 4 giliran.", { burn: [0.67, 4] }]
]);

C("zelonc", "Zelonc", "Elektro Confer", "Confer", "Vanguard", "🔌", { hp: 850, mana: 460, atk: 150, spd: 40 }, [
  ["Cidori", "A1", 500, "Cidori menusuk satu musuh."],
  ["Electric Ball", "AA", 400, "Bola listrik ke seluruh musuh."],
  ["Mati Lampu", "SA", 0, "Mati lampu, seluruh musuh tidak bisa bermain 2 giliran.", { stun: 2 }],
  ["Mencolek Mata Musuh", "A1", 700, "Mencolek mata, musuh tidak bisa bermain 1x.", { stun: 1 }],
  ["Gempa Listrik", "AA", 900, "Gempa listrik ke seluruh musuh."],
  ["Zelonc Disambar Petir", "BS", 0, "Damage 2x untuk 1 serangan.", { buf: ["attack", 1.0, 1] }]
]);

C("simon", "Simon Reinbert", "Pernafasan Bulan", "Breathing", "Vanguard", "🌙", { hp: 860, atk: 152 }, [
  ["Tebasan Bulan Sabit", "AA", 400, "Bulan sabit menjangkau 3 musuh.", { n: 3 }],
  ["Kilauan Pedang Cahaya Bulan Purnama", "SA", 0, "Seluruh musuh tidak bisa bermain 1x.", { stun: 1 }],
  ["Putaran Bulan Alat Penggal Tajam", "A1", 1000, "Alat penggal bulan ke satu musuh."],
  ["Bulan Ramadhan Penuh Berkah", "HA", 500, "Berkah bulan memulihkan seluruh tim."],
  ["Putaran Bulan Malapetaka", "AA", 900, "Bulan malapetaka ke seluruh musuh."],
  ["Kekejaman Masa Bulan Terakhir", "AA", 1100, "Bulan terakhir ke seluruh musuh."]
]);

C("ruben", "Ruben", "Sihir Rintangan (Obstacle)", "Magic", "Vanguard", "🧱", { hp: 950, mana: 480, atk: 145, def: 80 }, [
  ["Normal Barrier", "SH1", 500, "Barrier 500 untuk satu sekutu, bertahan 2 giliran.", { turns: 2 }],
  ["Jepitan Dinding Penghalang", "AA", 400, "Dinding menjepit seluruh musuh."],
  ["Barrier Fire", "SHS", 800, "Barrier api untuk Ruben selama 2 giliran. Setiap kali diserang, penyerang kena balik damage sebesar 20% max HP Ruben.", { turns: 2, reflect: [0.2, 2, "ownMaxHp"] }], /* "max HP garan" di jawaban dibaca sebagai max HP Ruben */
  ["Perisai Ksatria", "SHA", 800, "Perisai 800 untuk seluruh tim sampai hancur.", { sh: "amount" }],
  ["Palang Kerajaan", "SHA", 2000, "Perisai 2000 untuk seluruh tim sampai hancur.", { sh: "amount" }],
  ["Barrier Absolute", "SHA", 0, "Seluruh tim kebal mutlak selama 2 giliran.", { sh: "absolute", turns: 2 }]
]);

/* ============================================================
   SENTINEL (x2,9) - Imperium Military II
   ============================================================ */
C("annerose", "Annerose", "Sihir Kutukan", "Magic", "Sentinel", "☠️", { hp: 850, mana: 470, atk: 150 }, [
  ["Mengutuk Gerakan", "S1", 0, "Membatalkan gerakan satu musuh, tidak bisa bermain 1x.", { stun: 1 }],
  ["Santet", "A1", 400, "Santet ke satu musuh."],
  ["Devil Conjurer", "A1", 500, "Kutukan setan, racun berjalan 3 giliran.", { poison: [0.5, 3] }],
  ["Mendekatkan Kematian", "A1", 500, "Curse of Death mendekat: satu musuh kena damage dan tanda kematian. Tiap tanda menaikkan batas eksekusi Curse of Death (skill 6) ke musuh itu +25% (maks 4 tanda).", { deathMark: true }],
  ["Pengutukan Jiwa", "S1", 0, "Satu musuh tidak bisa bergerak 4 giliran.", { stun: 4 }],
  ["Curse of Death", "X1", 2000, "Target mati seketika saat HP rendah. Batasnya naik +25% per tanda kematian (skill 4).", { markExec: true }]
]);

C("loki", "Loki Maurer", "Sihir Skala", "Magic", "Sentinel", "⚖️", { hp: 850, mana: 480, atk: 150 }, [
  ["Penekanan Mana Musuh", "SA", 0, "Menekan mana: seluruh musuh pengguna SIHIR tidak bisa bermain 2 giliran.", { stun: 2, onlyMagic: true }],
  ["Tekanan Gravitasi", "SA", 0, "Seluruh musuh tidak bisa bergerak 2 giliran.", { stun: 2 }],
  ["Gravitasi Jatuh", "A1", 800, "Gravitasi jatuh menimpa satu musuh."],
  ["Kelipatan Pertahanan", "BA", 0, "Penguatan fisik: HP (sisa dan max) seluruh tim jadi 2x lipat selama 3 giliran. Setelah habis, sisa HP dibagi 2 lagi.", { sp: "hpx2", turns: 3 }],
  ["Sihir Misterius", "B1", 0, "Seluruh ability (ATK, DEF, SPD) satu sekutu jadi 2x selama 2 giliran, tapi Loki tidak bisa bermain 2 giliran.", { bufs: [["attack", 1.0, 2], ["defense", 1.0, 2], ["speed", 1.0, 2]], selfStun: 2 }],
  ["Penghakiman Tidak Adil", "DA", 0, "Seluruh ability musuh jadi 0,5x dan seluruh ability timmu jadi 1,5x selama 3 giliran.", { debs: [["attack", 0.5, 3], ["defense", 0.5, 3], ["speed", 0.5, 3]], teamBufs: [["attack", 0.5, 3], ["defense", 0.5, 3], ["speed", 0.5, 3]] }]
]);

C("kaiser", "Kaiser", "Ice Confer", "Confer", "Sentinel", "🧊", { hp: 950, mana: 480, atk: 148, def: 80 }, [
  ["Pembekuan Ruang Serangan", "SHS", 0, "Membekukan ruang di sekitar Kaiser: serangan apa pun hancur, kebal 1 giliran.", { sh: "absolute", turns: 1 }],
  ["Kristal Menjalar", "A1", 700, "Kristal es menghantam satu musuh lalu menjalar ke musuh di sebelahnya.", { also: 1 }],
  ["Pembekuan Udara", "AA", 1100, "Pembekuan udara ke seluruh musuh."],
  ["Tembok Kutub", "SHA", 4000, "Perisai 4000 untuk seluruh tim sampai hancur.", { sh: "amount" }],
  ["Pembekuan Ruang Waktu", "SA", 0, "Time Frozen: giliran musuh dicuri 3 kali (timmu jalan terus). Bukan stun: musuh tetap bisa kena damage, racun/bakar tetap jalan.", { sp: "timelock", lock: 3 }],
  ["Pembentangan Kerajaan Iceland", "AA", 1000, "Kerajaan es terbentang ke seluruh musuh: damage, lalu SEMUA stat musuh (ATK, DEF, SPD) turun sebesar 50% dari energi yang dipakai skill ini, selama 3 giliran.", { nerf: { stats: ["attack", "defense", "speed"], ratio: 0.5, turns: 3 } }]
]);

/* ============================================================
   DEVIL (x3,2) - Gehenna Abyssal II
   ============================================================ */
C("neobert", "Neobert", "Lightning Darkness Mutation", "Mutation", "Devil", "🌩️", { hp: 860, atk: 152 }, [
  ["Scary Haze", "A1", 200, "Kabut menakutkan ke satu musuh (damage kecil). Afsoul +1.", { afsoul: 1 }],
  ["Petir Penghancur", "A1", 500, "Petir penghancur ke satu musuh. Afsoul +1.", { afsoul: 1 }],
  ["Sambaran Lima Sisi", "A1", 1000, "Sambaran petir lima sisi ke satu musuh. Afsoul +1.", { afsoul: 1 }],
  ["Ketakutan Rakyat", "DA", 0, "Ketakutan menyebar, damage seluruh musuh turun 40% selama 3 giliran.", { deb: ["attack", 0.4, 3] }],
  ["Ledakan Petir Hitam", "AA", 500, "Petir hitam meledak di seluruh musuh. Afsoul +4 (hanya +1 kalau musuh tinggal 1).", { afsoul: 4, afsoulSolo: 1 }],
  ["NIGHTMARE", "SA", 0, "Seluruh musuh Blind sebanyak stack Afsoul dan giliran musuh dicuri sebanyak itu juga. Lalu Afsoul kembali ke 0. Biaya 60% max Energy.", { sp: "nightmare", pct: 0.6 }]
]);

C("qmark", "?", "Weather Report Confer", "Confer", "Devil", "🌦️", { hp: 850, mana: 460, atk: 150, spd: 40 }, [
  ["Cuaca Dingin", "AA", 100, "Udara dingin melukai seluruh musuh dan membekukan mereka 1 kesempatan (tidak bisa bermain).", { stun: 1 }],
  ["Cuaca Cerah", "HA", 400, "Matahari cerah memulihkan HP seluruh tim."],
  ["Cuaca Panas Menyengat", "AA", 500, "Panas menyengat melukai seluruh musuh."],
  ["Cuaca Hujan Petir", "AA", 400, "Petir menyambar NETRAL: semua karakter di arena terkena, kawan maupun lawan (kecuali ? sendiri).", { neutral: true }], /* TEBAKAN: arti "netral" */
  ["Cuaca Badai Gelap", "AA", 700, "Badai gelap menghantam seluruh musuh."],
  ["Cuaca Berantakan", "AA", 1000, "Cuaca kacau balau menghantam seluruh musuh."]
]);

/* ============================================================
   PLUTO (x3, tanpa kedudukan)
   ============================================================ */
C("loid", "Loid", "Sihir Black Hole", "Magic", "Pluto", "🕳️", { hp: 850, mana: 480, atk: 150, def: 70, spd: 38 }, [
  ["Black Hole Basic", "A1", 300, "Black hole kecil menghantam satu musuh."],
  ["Penarikan Kasar", "S1", 0, "Menarik paksa satu musuh: di kesempatan berikutnya musuh itu harus menyerang Loid.", { sp: "pull" }],
  ["Daya Tarik Black Hole", "BS", 0, "Black hole menyedot serangan musuh berikutnya (damage apa pun) sehingga seluruhnya mengenai Loid.", { sp: "suck" }],
  ["Letupan Black Hole", "A1", 700, "Letupan black hole menjangkau 2 musuh: yang dipilih dan musuh di sebelahnya.", { also: 1 }],
  ["Black Hole Penyedot", "AA", 800, "Hisapan lalu ledakan menghantam seluruh musuh."],
  ["Black Hole", "AA", 50, "Memunculkan black hole kecil (50) yang belum meledak dan membesar 2x lipat tiap putaran timmu (maks 1600). Pakai skill ini lagi untuk meledakkannya: damage ke seluruh musuh sebesar ukuran black hole. Kalau Loid kalah, black hole lenyap.", { sp: "blackhole" }]
]);

/* Semua karakter (termasuk 5 karakter lama di characters.js) sudah masuk:
   tetapkan biaya energi dari besar kegunaan tiap skill. */
finalizeSkillCosts();
