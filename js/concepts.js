/* ============================================
   ACCURANT - CONCEPTS.JS
   Berkas KONSEP: tempat semua aturan dasar permainan dikumpulkan
   (attack, heal, shield, racun, beku, stun, dll).

   Skill karakter / item TIDAK perlu diubah formatnya. Mereka tetap
   menulis type/effect seperti biasa; battle.js & items.js tinggal
   bertanya ke berkas ini: "konsep ini boleh kena target itu?".

   Berkas ini dimuat SEBELUM battle.js (lihat index.html). Fungsi yang
   dipanggil dari sini (isFrozenUnit dll) baru dipakai saat game
   berjalan, jadi urutan muat aman.

   ISI:
   1. CONCEPTS      : daftar konsep + sifatnya
   2. Pemetaan      : skill/effect/item -> id konsep
   3. Aturan BEKU   : siapa boleh menerima apa saat beku
   4. Aturan SHIELD : 3 jenis shield (angka / angka+waktu / mutlak)
   ============================================ */


/* ============================================
   1. DAFTAR KONSEP
   - harmful : true = efek merugikan penerima
   - frozen  : apa yang terjadi kalau penerimanya sedang BEKU
        "block"         -> ditolak (default)
        "artifact_only" -> hanya boleh dari ARTEFAK (category "spell"),
                           ramuan & skill karakter ditolak
   ============================================ */
const CONCEPTS = {
  attack:  { label: "Serangan",       harmful: true,  damage: true,  frozen: "block" },
  execute: { label: "Eksekusi",       harmful: true,  damage: true,  frozen: "block" },
  heal:    { label: "Penyembuhan",    harmful: false, frozen: "block" },
  mana:    { label: "Pemulihan Mana", harmful: false, frozen: "block" },
  shield:  { label: "Shield",         harmful: false, frozen: "block" },
  buff:    { label: "Buff",           harmful: false, frozen: "block" },
  regen:   { label: "Regenerasi",     harmful: false, frozen: "block" },
  fireres: { label: "Tahan Api",      harmful: false, frozen: "block" },
  swift:   { label: "Swiftness",      harmful: false, frozen: "block" },
  cleanse: { label: "Pembersihan",    harmful: false, frozen: "block" },
  revive:  { label: "Kebangkitan",    harmful: false, frozen: "block" },

  debuff:  { label: "Debuff",         harmful: true,  frozen: "artifact_only" },
  dot:     { label: "Racun/Bakar",    harmful: true,  frozen: "artifact_only" },
  stun:    { label: "Stun",           harmful: true,  frozen: "artifact_only" },
  slow:    { label: "Slow",           harmful: true,  frozen: "artifact_only" },

  freeze:  { label: "Beku",           harmful: true,  frozen: "block" }
};


/* ============================================
   2. PEMETAAN KE ID KONSEP
   ============================================ */

/** Konsep UTAMA sebuah skill karakter (dari skill.type). */
function conceptOfSkill(skill) {
  if (skill.type === "single_attack" || skill.type === "area_attack") {
    return skill.execute ? "execute" : "attack";
  }
  if (skill.type === "healing") return "heal";
  if (skill.type === "mana_recovery") return "mana";
  return skill.type; // "shield", "buff", "debuff" sama dengan id konsepnya
}

/** Konsep dari sebuah effect (skill.effect.type atau item.effect.type). */
function conceptOfEffect(effectType) {
  if (effectType === "execute_attack") return "execute";
  return effectType; // stun, dot, freeze, cleanse, buff, debuff, heal, mana, shield, ...
}


/* ============================================
   3. ATURAN BEKU
   Orang yang sedang beku TIDAK menerima apa pun (damage, heal, shield,
   mana, buff, dll), KECUALI efek merugikan (debuff/racun/stun/slow)
   yang datang dari ARTEFAK. Ramuan dan skill karakter ditolak.
   source = { kind: "skill" }  atau  { kind: "item", category: "potion"|"spell" }
   ============================================ */
function canReceiveConcept(conceptId, target, source) {
  if (!isFrozenUnit(target)) return true; // tidak beku: tidak ada batasan di sini

  const concept = CONCEPTS[conceptId];
  if (!concept) return false;
  if (concept.frozen === "artifact_only") {
    return !!source && source.kind === "item" && source.category === "spell";
  }
  return false;
}

/** Saring daftar target untuk satu skill karakter. */
function filterSkillTargets(skill, targets) {
  const concept = conceptOfSkill(skill);
  return targets.filter(function (t) {
    return canReceiveConcept(concept, t, { kind: "skill" });
  });
}

/** Boleh tidak item ini mengenai unit ini? */
function canItemAffectUnit(item, unit) {
  return canReceiveConcept(conceptOfEffect(item.effect.type), unit, { kind: "item", category: item.category });
}


/* ============================================
   4. ATURAN SHIELD
   Tiga jenis shield (field "kind"):
     "amount"   : punya angka. Hancur kalau angka habis. Tanpa batas waktu.
     "timed"    : punya angka DAN batas giliran. Hilang kalau angka habis
                  ATAU waktunya habis (bisa dihancurkan serangan).
     "absolute" : tanpa angka, hanya batas giliran. SEMUA damage ditolak
                  total, sekuat apa pun serangannya.

   Cara menulisnya di data (semua opsional; tanpa ini = "amount"):
     skill  : { ..., type: "shield", shield: { kind: "timed", turns: 3, multiplier: 1.2 } }
     artefak: effect: { type: "shield", amount: 150, kind: "timed", turns: 3 }
   Waktu shield berkurang 1 tiap giliran tim pemiliknya MULAI
   (jadi turns: 3 = melindungi dari 3 giliran lawan).

   unit.shieldLayers = daftar lapisan shield; unit.shield = total angka
   semua lapisan berangka (dipakai tampilan & AI, selalu disinkronkan).
   ============================================ */
const SHIELD_DEFAULT_MULTIPLIER = 1.2; // shield = attack x 1,2 (aturan lama)

/* ---------- PATOKAN HITUNG (basis hitung mundur) ----------
   Menentukan hitungan mundur durasi dihitung dari giliran SIAPA.
     "source" = PATOKAN PEMBERI : dihitung dari giliran pihak yang
                memasang/melakukan. Contoh: Zoeel (tim pemain) memberi
                shield -> mundur tiap giliran pemain.
     "target" = PATOKAN PENERIMA: dihitung dari giliran pihak yang
                dikenai. Contoh: racun pemain ke musuh -> "kena" dan
                mundur otomatis saat musuh bergerak.
   Default (kalau tidak ditulis) = "target".
   Racun/bakar, stun, slow, buff, debuff di game ini sudah memakai
   Patokan Penerima (dihitung di processStatusEffectsAtTurnStart).
   Tulis di data:  shield: { kind: "timed", turns: 2, basis: "source" }
*/
const COUNTDOWN_BASIS = {
  source: { label: "Pemberi" },
  target: { label: "Penerima" }
};

function basisOf(layer) {
  return layer.basis === "source" ? "source" : "target";
}

/** Besar shield dari skill karakter (0 untuk jenis "absolute"). */
function calcShieldAmount(caster, skill) {
  const spec = skill.shield || {};
  if (spec.kind === "absolute") return 0;
  const mult = spec.multiplier !== undefined ? spec.multiplier : SHIELD_DEFAULT_MULTIPLIER;
  return Math.round(getEffectiveStat(caster, "attack") * mult);
}

function syncShieldTotal(unit) {
  const layers = unit.shieldLayers || [];
  unit.shield = layers.reduce(function (sum, l) {
    return l.kind === "absolute" ? sum : sum + l.amount;
  }, 0);
}

/** Pasang satu lapisan shield. options = { kind, turns } (opsional). */
function addShieldLayer(unit, amount, options) {
  const opt = options || {};
  const kind = opt.kind === "timed" || opt.kind === "absolute" ? opt.kind : "amount";
  unit.shieldLayers = unit.shieldLayers || [];
  unit.shieldLayers.push({
    kind: kind,
    amount: kind === "absolute" ? 0 : amount,
    turnsLeft: kind === "amount" ? null : Math.max(1, opt.turns || 1),
    basis: opt.basis === "source" ? "source" : "target",
    sourceTeam: opt.sourceTeam || unit.team // tim pemberi (diisi battle.js/items.js)
  });
  syncShieldTotal(unit);
}

function hasAbsoluteShield(unit) {
  return (unit.shieldLayers || []).some(function (l) { return l.kind === "absolute"; });
}

/**
 * Menyerap damage ke lapisan berangka (yang paling lama dulu).
 * @returns {number} sisa damage yang menembus ke HP
 */
function absorbWithShields(unit, rawAmount) {
  let remaining = rawAmount;
  const layers = unit.shieldLayers || [];

  layers.forEach(function (l) {
    if (l.kind === "absolute" || remaining <= 0) return;
    const absorbed = Math.min(l.amount, remaining);
    l.amount -= absorbed;
    remaining -= absorbed;
    if (l.amount <= 0) logMessage("Shield " + unit.name + " hancur!");
  });

  unit.shieldLayers = layers.filter(function (l) {
    return l.kind === "absolute" || l.amount > 0;
  });
  syncShieldTotal(unit);
  return remaining;
}

/**
 * Dipanggil battle.js saat giliran tim `team` dimulai: kurangi waktu shield.
 * Lapisan "source" mundur di giliran tim pemberinya, lapisan "target"
 * mundur di giliran tim pemiliknya (yang dikenai).
 */
function tickShields(team) {
  allUnits.forEach(function (u) {
    if (!u.alive || !u.shieldLayers) return;
    u.shieldLayers.forEach(function (l) {
      const clockTeam = basisOf(l) === "source" ? l.sourceTeam : u.team;
      if (clockTeam === team && l.turnsLeft !== null) l.turnsLeft -= 1;
    });
    const expired = u.shieldLayers.filter(function (l) {
      return l.turnsLeft !== null && l.turnsLeft <= 0;
    });
    if (expired.length > 0) {
      u.shieldLayers = u.shieldLayers.filter(function (l) { return expired.indexOf(l) === -1; });
      syncShieldTotal(u);
      logMessage("Shield " + u.name + " habis waktunya.");
    }
  });
}

/** Teks untuk label HP, mis. "🛡180 (3t)" atau "🛡✨2t". */
function shieldLabelText(unit) {
  const layers = unit.shieldLayers || [];
  if (layers.length === 0) return "";
  const parts = [];
  const abs = layers.filter(function (l) { return l.kind === "absolute"; });
  if (abs.length > 0) {
    const top = abs.slice().sort(function (a, b) { return b.turnsLeft - a.turnsLeft; })[0];
    parts.push("🛡✨" + top.turnsLeft + "t · " + COUNTDOWN_BASIS[basisOf(top)].label);
  }
  if (unit.shield > 0) {
    const timed = layers.filter(function (l) { return l.kind === "timed"; })
      .sort(function (a, b) { return a.turnsLeft - b.turnsLeft; });
    const first = timed.length > 0 ? timed[0] : null;
    parts.push("🛡" + Math.round(unit.shield) + (first ? " (" + first.turnsLeft + "t · " + COUNTDOWN_BASIS[basisOf(first)].label + ")" : ""));
  }
  return parts.join(" ");
}

/** Keterangan lengkap tiap lapisan shield (untuk tooltip tahan-lama di kartu). */
function shieldHintText(unit) {
  return (unit.shieldLayers || []).map(function (l) {
    const basis = COUNTDOWN_BASIS[basisOf(l)].label.toLowerCase();
    const time = l.turnsLeft !== null ? "sisa " + l.turnsLeft + " giliran, dihitung dari giliran " + basis : "tanpa batas waktu";
    if (l.kind === "absolute") return "🛡✨ Shield mutlak: semua damage ditolak total, " + time + ".";
    if (l.kind === "timed") return "🛡 Shield " + Math.round(l.amount) + ": hancur kalau angka habis atau waktu habis, " + time + ".";
    return "🛡 Shield " + Math.round(l.amount) + ": hancur kalau angka habis, " + time + ".";
  }).join("\n");
}

/** Teks singkat jenis shield untuk preview & log, mis. "180 shield (3 giliran)". */
function shieldDescribe(amount, options) {
  const opt = options || {};
  const basis = COUNTDOWN_BASIS[opt.basis === "source" ? "source" : "target"].label;
  if (opt.kind === "absolute") return "shield kebal total (" + opt.turns + " giliran · " + basis + ")";
  if (opt.kind === "timed") return Math.round(amount) + " shield (" + opt.turns + " giliran · " + basis + ")";
  return Math.round(amount) + " shield";
}