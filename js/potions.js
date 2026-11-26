/* ============================================
   ACCURANT - POTIONS.JS
   Mesin ramuan: jenis ramuan, tahap (I-III), ramuan lempar, dan harga
   racikan. File ini HANYA berisi data & hitungan (tanpa tampilan).

   KONSEP:
   - Ramuan minum (1 orang) dijual di Toko Racikan sebagai Tahap I.
   - Tahap II = efek x2 dari Tahap I, Tahap III = efek x2 dari Tahap II.
   - Ramuan lempar = hasil racikan dari ramuan minum. Efeknya x0,70
     dari ramuan asal, mengenai beberapa orang yang berdekatan.
     Bisa ditambah kekuatan (x1,2 tiap langkah, maks 10 langkah) dan
     jangkauan (2 -> 3 -> 4 orang).

   ID ITEM (dipakai di tas & penyimpanan, dibaca lewat getItemById):
   - minum : "d:<jenis>:<tahap>"                  contoh d:heal:2
   - lempar: "s:<jenis>:<tahap>:<langkah>:<jangkauan>"  contoh s:heal:1:3:3
   Jadi tidak perlu mendaftarkan ratusan kombinasi satu-satu.

   Semua angka yang boleh kamu ubah ada di bagian KONSTANTA & POTION_KINDS.
   ============================================ */

/* ---------- KONSTANTA ---------- */
const MAX_POTION_TIER = 3;
const TIER_LABEL = ["", "", " II", " III"];       // indeks = tahap

const SPLASH_BASE_FACTOR = 0.7;      // lempar = 70% efek ramuan minum
const SPLASH_POWER_GROWTH = 1.2;     // tiap tombol + kekuatan: x1,2 dari sebelumnya
const SPLASH_MAX_POWER_STEPS = 10;
const SPLASH_MIN_RANGE = 2;
const SPLASH_MAX_RANGE = 4;

const CRAFT_COST_TIER2 = 50;         // Tahap I  -> II
const CRAFT_COST_TIER3 = 80;         // Tahap II -> III
const SPLASH_BASE_COST = 0;          // biaya dasar mengubah jadi lempar
const SPLASH_POWER_STEP_COST = 20;   // per langkah kekuatan
const SPLASH_RANGE_STEP_COST = 30;   // per tambahan jangkauan

const TEMPO_DURATION = 4;            // lama Swiftness/Slowness (dalam giliran karakter itu)
const TEMPO_PERCENT_CAP = 2;         // efek maksimal 200%


/* ---------- JENIS RAMUAN ----------
   side: "ally" = menyasar sekutu, "enemy" = menyasar musuh.
   scalable: false = efeknya tidak bisa digandakan (tahap tetap I). */
const POTION_KINDS = {
  heal:     { name: "Penyembuh",   side: "ally",  price: 60, scalable: true,
              note: "Tidak bisa menghidupkan karakter yang sudah kalah." },
  regen:    { name: "Regenerasi",  side: "ally",  price: 70, scalable: true,
              note: "Pemulihan terjadi di awal giliran karakter itu." },
  strength: { name: "Kekuatan",    side: "ally",  price: 80, scalable: true,
              note: "Berlaku 3 giliran karakter itu." },
  swift:    { name: "Kecepatan",   side: "ally",  price: 70, scalable: true,
              note: "Hanya untuk karakter yang meminumnya. Efek ekstra tidak menumpuk." },
  fireres:  { name: "Tahan Api",   side: "ally",  price: 60, scalable: true,
              note: "Menghapus bakar dan membuat kebal bakar." },
  mana:     { name: "Inti Mana",   side: "ally",  price: 60, scalable: true,
              note: "Mana tidak bisa melebihi batas maksimal." },
  cure:     { name: "Pemurni Jiwa", side: "ally", price: 70, scalable: false,
              note: "Efeknya tidak bisa ditingkatkan, tapi bisa dijadikan ramuan lempar." },
  poison:   { name: "Racun",       side: "enemy", price: 65, scalable: true,
              note: "Damage terjadi di awal giliran musuh itu." },
  weak:     { name: "Kelemahan",   side: "enemy", price: 65, scalable: true,
              note: "Berlaku 3 giliran musuh itu." },
  slow:     { name: "Kelambanan",  side: "enemy", price: 70, scalable: true,
              note: "Musuh yang lambat kehilangan giliran. Efek tidak menumpuk." }
};

// Urutan tampil di toko dan di tas.
const POTION_KIND_ORDER = ["heal", "regen", "strength", "swift", "fireres", "mana", "cure", "poison", "weak", "slow"];

// Item lama (sebelum sistem racikan) dipetakan ke padanannya, supaya
// data simpanan lama tetap terbaca dan tidak ada yang hilang.
const LEGACY_POTION_MAP = {
  potion_heal: "d:heal:1",
  potion_mana: "d:mana:1",
  potion_cure: "d:cure:1",
  potion_attack_buff: "d:strength:1",
  splash_heal: "s:heal:1:0:4",
  splash_cure: "s:cure:1:0:4",
  splash_poison: "s:poison:1:0:4"
};


/* ---------- PENGALI EFEK ---------- */

/** Pengali total: 2^(tahap-1), dan untuk lempar x0,7 x1,2^langkah. */
function potionMultiplier(form, tier, steps) {
  let m = Math.pow(2, tier - 1);
  if (form === "splash") m *= SPLASH_BASE_FACTOR * Math.pow(SPLASH_POWER_GROWTH, steps);
  return m;
}

/** Apakah efek utama jenis ini sudah mentok batas (supaya + kekuatan tidak sia-sia). */
function potionAtCap(kind, m) {
  if (kind === "strength") return 0.25 * m >= 3;
  if (kind === "weak") return 0.2 * m >= 0.9;
  if (kind === "swift" || kind === "slow") return 0.5 * m >= TEMPO_PERCENT_CAP;
  return false;
}

/** Berapa kali tombol + kekuatan boleh ditekan untuk ramuan ini. */
function maxPowerSteps(kind, tier) {
  for (let n = 0; n <= SPLASH_MAX_POWER_STEPS; n++) {
    if (potionAtCap(kind, potionMultiplier("splash", tier, n))) return n;
  }
  return SPLASH_MAX_POWER_STEPS;
}

function pct(value) {
  return Math.round(value * 100);
}

/** Menghitung efek konkret + teks penjelasannya untuk pengali m. */
function computePotionEffect(kind, m) {
  if (kind === "heal") {
    const amount = Math.max(1, Math.round(70 * m));
    return { effect: { type: "heal", amount: amount }, text: "Memulihkan " + amount + " HP" };
  }
  if (kind === "regen") {
    const amount = Math.max(1, Math.round(20 * m));
    return { effect: { type: "regen", amount: amount, turns: 4 },
             text: "Memulihkan " + amount + " HP tiap giliran, 4 giliran" };
  }
  if (kind === "strength") {
    const percent = Math.min(3, 0.25 * m);
    return { effect: { type: "buff", stat: "attack", percent: percent, turns: 3 },
             text: "ATK +" + pct(percent) + "% selama 3 giliran" };
  }
  if (kind === "weak") {
    const percent = Math.min(0.9, 0.2 * m);
    return { effect: { type: "debuff", stat: "attack", percent: percent, turns: 3 },
             text: "ATK musuh -" + pct(percent) + "% selama 3 giliran" };
  }
  if (kind === "poison") {
    const amount = Math.max(1, Math.round(22 * m));
    return { effect: { type: "dot", stat: "poison", amount: amount, turns: 3 },
             text: "Racun " + amount + " damage per giliran, 3 giliran" };
  }
  if (kind === "mana") {
    const amount = Math.max(1, Math.round(50 * m));
    return { effect: { type: "mana", amount: amount }, text: "Memulihkan " + amount + " Mana" };
  }
  if (kind === "fireres") {
    const turns = Math.min(12, Math.max(1, Math.round(2 * m)));
    return { effect: { type: "fireres", turns: turns },
             text: "Hapus bakar & kebal bakar " + turns + " giliran" };
  }
  if (kind === "cure") {
    return { effect: { type: "cleanse" }, text: "Menghapus racun, bakar, stun, slow, dan debuff" };
  }
  if (kind === "swift" || kind === "slow") {
    const percent = Math.min(TEMPO_PERCENT_CAP, 0.5 * m);
    const perTurn = percent / 2;                       // isi "tabungan" per giliran; penuh = 1
    const every = Math.max(1, Math.ceil(1 / perTurn - 1e-9));
    const turns = Math.min(12, Math.max(TEMPO_DURATION, every));
    const effect = { type: kind, percent: percent, turns: turns };
    const text = kind === "swift"
      ? "Kecepatan +" + pct(percent) + "%: giliran ekstra tiap " + every + " giliran, selama " + turns + " giliran"
      : "Kelambanan " + pct(percent) + "%: musuh kehilangan giliran tiap " + every + " giliran, selama " + turns + " giliran";
    return { effect: effect, text: text };
  }
  return { effect: { type: "cleanse" }, text: "" };
}


/* ---------- ID & ITEM ---------- */

function potionIdOf(spec) {
  if (spec.form === "drink") return "d:" + spec.kind + ":" + spec.tier;
  return "s:" + spec.kind + ":" + spec.tier + ":" + spec.steps + ":" + spec.range;
}

/** Membaca id ramuan; mengembalikan null kalau bentuknya tidak sah. */
function parsePotionId(id) {
  if (typeof id !== "string") return null;
  const p = id.split(":");
  const kind = p[1];
  if (!POTION_KINDS[kind]) return null;
  const tier = Number(p[2]);
  if (!(tier >= 1 && tier <= MAX_POTION_TIER) || Math.floor(tier) !== tier) return null;
  if (!POTION_KINDS[kind].scalable && tier !== 1) return null;

  if (p[0] === "d" && p.length === 3) {
    return { form: "drink", kind: kind, tier: tier, steps: 0, range: 1 };
  }
  if (p[0] === "s" && p.length === 5) {
    const steps = Number(p[3]);
    const range = Number(p[4]);
    if (!(steps >= 0 && steps <= SPLASH_MAX_POWER_STEPS) || Math.floor(steps) !== steps) return null;
    if (!(range >= SPLASH_MIN_RANGE && range <= SPLASH_MAX_RANGE) || Math.floor(range) !== range) return null;
    return { form: "splash", kind: kind, tier: tier, steps: steps, range: range };
  }
  return null;
}

const potionItemCache = {};

/** Membuat objek item lengkap (nama, target, efek, deskripsi) dari spesifikasi. */
function buildPotionItem(spec) {
  const def = POTION_KINDS[spec.kind];
  const m = potionMultiplier(spec.form, spec.tier, spec.steps);
  const computed = computePotionEffect(spec.kind, m);
  const isSplash = spec.form === "splash";

  let target;
  if (isSplash) target = def.side === "ally" ? "area_allies" : "area_enemies";
  else target = def.side === "ally" ? "single_ally" : "single_enemy";

  const baseName = def.name + TIER_LABEL[spec.tier];
  let description = computed.text + ".";
  if (isSplash) {
    description = "Area " + spec.range + " orang, kekuatan x" + m.toFixed(2).replace(".", ",") + ". " + computed.text + " per orang.";
  }

  return {
    id: potionIdOf(spec),
    name: (isSplash ? "Ramuan Lempar " : "Ramuan ") + baseName,
    shortName: baseName,
    category: "potion",
    isPotion: true,
    form: spec.form,
    kind: spec.kind,
    tier: spec.tier,
    steps: spec.steps,
    range: spec.range,
    multiplier: m,
    price: (!isSplash && spec.tier === 1) ? def.price : 0,
    target: target,
    areaSize: isSplash ? spec.range : 1,
    effect: computed.effect,
    effectText: computed.text,
    description: description
  };
}

/** Dipanggil getItemById (items.js) untuk id yang bukan item bawaan. */
function resolvePotionItem(id) {
  if (potionItemCache[id]) return potionItemCache[id];
  const spec = parsePotionId(id);
  if (!spec) return null;
  const item = buildPotionItem(spec);
  potionItemCache[id] = item;
  return item;
}

function isAreaItem(item) {
  return !!item && (item.target === "area_allies" || item.target === "area_enemies");
}

/** Tim yang menjadi sasaran item: "player" atau "enemy" (null kalau tidak jelas). */
function itemTargetTeam(item) {
  if (item.target === "single_ally" || item.target === "all_allies" || item.target === "area_allies" || item.target === "single_fallen_ally") return "player";
  if (item.target === "single_enemy" || item.target === "all_enemies" || item.target === "area_enemies") return "enemy";
  return null;
}


/* ---------- HARGA RACIKAN ---------- */

/** Biaya menaikkan satu tahap (dari tahap `tier` ke tahap berikutnya). */
function upgradeCost(tier) {
  return tier === 1 ? CRAFT_COST_TIER2 : CRAFT_COST_TIER3;
}

function splashCraftCost(steps, range) {
  return SPLASH_BASE_COST + steps * SPLASH_POWER_STEP_COST + (range - SPLASH_MIN_RANGE) * SPLASH_RANGE_STEP_COST;
}

function canUpgradePotion(item) {
  return !!item && item.isPotion && POTION_KINDS[item.kind].scalable && item.tier < MAX_POTION_TIER;
}

function nextTierSpec(item) {
  return { form: item.form, kind: item.kind, tier: item.tier + 1, steps: item.steps, range: item.range };
}


/* ---------- DAFTAR RAMUAN YANG DIMILIKI ---------- */

function getOwnedPotionItems() {
  const list = [];
  Object.keys(playerInventory).forEach(function (id) {
    if (playerInventory[id] <= 0) return;
    const item = resolvePotionItem(id);
    if (item) list.push(item);
  });
  list.sort(function (a, b) {
    const ka = POTION_KIND_ORDER.indexOf(a.kind), kb = POTION_KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) return ka - kb;
    if (a.form !== b.form) return a.form === "drink" ? -1 : 1;
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.steps !== b.steps) return a.steps - b.steps;
    return a.range - b.range;
  });
  return list;
}

/** Mengganti id item lama pada daftar tas dengan padanan barunya. */
function migrateLegacyInventory(rawInv) {
  const out = {};
  Object.keys(rawInv).forEach(function (id) {
    const newId = LEGACY_POTION_MAP[id] || id;
    out[newId] = (out[newId] || 0) + (Number(rawInv[id]) || 0);
  });
  return out;
}
