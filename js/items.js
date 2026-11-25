/* ============================================
   ACCURANT - ITEMS.JS
   Database item Toko (Ramuan & Mantra), inventori pemain,
   dan logika pemakaian item saat giliran pemain di pertarungan.

   PENJELASAN FIELD ITEM:
   - category: "potion" (Ramuan) atau "spell" (Artefak) - nama kode
     "spell" dipertahankan di data, tapi ditampilkan sebagai "Artefak"
     di layar Toko dan panel item.
   - target: "single_ally" | "all_allies" | "single_enemy" |
             "all_enemies" | "single_fallen_ally" (sekutu yang sudah kalah)
   - effect.type: "heal" | "mana" | "cleanse" | "buff" | "debuff" |
                  "dot" | "shield" | "stun" | "execute_attack" | "revive"
   Semua angka efek item bersifat TETAP (tidak tergantung attack
   karakter manapun), karena item dipakai "oleh pemain", bukan oleh
   karakter tertentu.
   ============================================ */

const ITEM_DATABASE = [

  // ===== RAMUAN (POTION) - target satu orang =====
  { id: "potion_heal", name: "Ramuan Embun Hidup", category: "potion", price: 60,
    target: "single_ally", effect: { type: "heal", amount: 70 },
    description: "Memulihkan 70 HP ke satu karakter." },

  { id: "potion_mana", name: "Ramuan Inti Mana", category: "potion", price: 60,
    target: "single_ally", effect: { type: "mana", amount: 50 },
    description: "Memulihkan 50 mana ke satu karakter." },

  { id: "potion_cure", name: "Ramuan Pemurni Jiwa", category: "potion", price: 70,
    target: "single_ally", effect: { type: "cleanse" },
    description: "Menghapus racun, bakar, stun, dan debuff dari satu karakter." },

  { id: "potion_attack_buff", name: "Ramuan Darah Garang", category: "potion", price: 80,
    target: "single_ally", effect: { type: "buff", stat: "attack", percent: 0.25, turns: 3 },
    description: "Meningkatkan ATK satu karakter +25% selama 3 giliran." },

  // ===== RAMUAN LEMPAR (SPLASH) - area, efek lebih pendek =====
  { id: "splash_heal", name: "Ramuan Lempar Embun Hidup", category: "potion", price: 140,
    target: "all_allies", effect: { type: "heal", amount: 40 },
    description: "Memulihkan 40 HP ke SELURUH timmu sekaligus." },

  { id: "splash_cure", name: "Ramuan Lempar Pemurni", category: "potion", price: 150,
    target: "all_allies", effect: { type: "cleanse" },
    description: "Menghapus racun, bakar, stun, dan debuff dari SELURUH timmu." },

  { id: "splash_poison", name: "Ramuan Lempar Bisa Rimba", category: "potion", price: 150,
    target: "all_enemies", effect: { type: "dot", stat: "poison", amount: 18, turns: 2 },
    description: "Meracuni SELURUH musuh, damage bertahap selama 2 giliran." },

  // ===== MANTRA (SPELL) - mahal, efek besar =====
  { id: "spell_execute", name: "Artefak Tebasan Senja", category: "spell", price: 300,
    target: "single_enemy", effect: { type: "execute_attack", damage: 90, thresholdPercent: 0.2 },
    description: "Serangan kuat; musuh dengan HP di bawah 20% langsung tumbang." },

  { id: "spell_barrier", name: "Artefak Benteng Abadi", category: "spell", price: 280,
    target: "single_ally", effect: { type: "shield", amount: 150 },
    description: "Memberi perisai raksasa (150) ke satu karakter." },

  { id: "spell_revive", name: "Artefak Napas Terakhir", category: "spell", price: 350,
    target: "single_fallen_ally", effect: { type: "revive", percent: 0.4 },
    description: "Menghidupkan kembali satu karakter yang kalah dengan 40% HP." },

  { id: "spell_storm_stun", name: "Artefak Badai Pembeku", category: "spell", price: 320,
    target: "all_enemies", effect: { type: "stun", chance: 1, turns: 1 },
    description: "Membekukan SELURUH musuh, melewati giliran berikutnya." }

];

/**
 * Inventori pemain: itemId -> jumlah dimiliki. Kosong di awal,
 * terisi lewat pembelian di Toko (shop.js). Sama seperti koin,
 * ini belum tersimpan permanen sampai Tahap 10.
 */
let playerInventory = {};

function getItemById(id) {
  const found = ITEM_DATABASE.find(function (i) { return i.id === id; });
  if (found) return found;
  return resolvePotionItem(id) || undefined; // potions.js: ramuan tahap/lempar (id dinamis)
}

function getInventoryCount(itemId) {
  return playerInventory[itemId] || 0;
}

function itemNeedsManualTarget(item) {
  return item.target === "single_ally" || item.target === "single_enemy" || item.target === "single_fallen_ally" ||
    item.target === "area_allies" || item.target === "area_enemies";
}


/* ============================================
   STATE PEMAKAIAN ITEM SAAT PERTARUNGAN
   ============================================ */
let pendingItem = null; // item yang sedang dipilih, menunggu target (kalau perlu)

function getValidItemTargets(item) {
  // Aturan beku (concepts.js): yang beku hanya bisa dikenai artefak debuff
  return getValidItemTargetsRaw(item).filter(function (u) {
    return u.alive ? canItemAffectUnit(item, u) : true;
  });
}

function getValidItemTargetsRaw(item) {
  if (item.target === "single_ally" || item.target === "all_allies" || item.target === "area_allies") {
    return getAliveUnits("player");
  }
  if (item.target === "single_enemy" || item.target === "all_enemies" || item.target === "area_enemies") {
    return getAliveUnits("enemy");
  }
  if (item.target === "single_fallen_ally") {
    return allUnits.filter(function (u) { return u.team === "player" && !u.alive; });
  }
  return [];
}

/**
 * Tombol "🎒 Gunakan Item" di bawah arena. Hanya aktif kalau giliran
 * pemain, belum ada aksi lain yang sedang dipilih, dan punya item.
 */
function updateItemBarButton() {
  const btn = document.getElementById("open-item-panel-btn");
  if (!btn) return;

  const hasAnyItem = Object.keys(playerInventory).some(function (id) {
    return playerInventory[id] > 0;
  });
  const canAct = currentPhase === "player" && !battleEnded && !pendingActor && !pendingItem;

  // Tombol Tas = saklar: kalau tas sedang terbuka, tombol tetap aktif supaya bisa menutupnya.
  const open = isItemPanelOpen();
  const canClose = open && currentPhase === "player" && !battleEnded && !pendingActor;

  btn.disabled = !((hasAnyItem && canAct) || canClose);
  btn.classList.toggle("active", open);
}

/** true kalau panel tas sedang tampil (bukan hilang, bukan sedang turun menutup). */
function isItemPanelOpen() {
  const panel = document.getElementById("item-panel");
  return !panel.classList.contains("hidden") && !panel.classList.contains("bag-closing");
}

function onOpenItemPanelClick() {
  // Tas sedang terbuka -> tekan lagi = tutup (turun ke bawah, hilang)
  if (isItemPanelOpen()) {
    if (currentPhase !== "player" || battleEnded || pendingActor) return;
    pendingItem = null; // pilihan artefak yang menunggu target ikut dibatalkan
    hideItemPanel();
    renderArena();
    return;
  }
  if (currentPhase !== "player" || battleEnded || pendingActor || pendingItem) return;
  showItemPanel();
}

function showItemPanel() {
  renderBagPanel(); // bag.js: tampilan tas (gambar ramuan, tahan & seret)
}

/**
 * Menutup panel tas. Di layar menyamping panel turun ke bawah dulu (animasi)
 * baru hilang; instant = true langsung hilang tanpa animasi.
 */
function hideItemPanel(instant) {
  const panel = document.getElementById("item-panel");
  clearTimeout(panel._closeTimer);

  if (panel.classList.contains("hidden")) {
    panel.classList.remove("bag-closing");
    return;
  }

  const landscape = window.matchMedia && window.matchMedia("(orientation: landscape)").matches;
  if (instant === true || !landscape) {
    panel.classList.remove("bag-closing");
    panel.classList.add("hidden");
  } else {
    panel.classList.add("bag-closing");
    panel._closeTimer = setTimeout(function () {
      panel.classList.add("hidden");
      panel.classList.remove("bag-closing");
    }, 230);
  }

  const btn = document.getElementById("open-item-panel-btn");
  if (btn) btn.classList.remove("active");
}

function onItemCancelClick() {
  pendingItem = null;
  hideItemPanel();
  renderArena();
}

function onItemButtonClick(itemId) {
  const item = getItemById(itemId);
  if (!item || getInventoryCount(itemId) <= 0) return;

  // Tap item yang sama sekali lagi = batal memilih
  if (pendingItem && pendingItem.id === itemId) {
    pendingItem = null;
    renderArena();
    showItemPanel();
    return;
  }

  pendingItem = item;

  if (itemNeedsManualTarget(item)) {
    renderArena(); // supaya target yang valid ter-highlight
    showItemPanel();
  } else {
    const targets = getValidItemTargets(item);
    requestUseItem(item, targets);
  }
}

/**
 * Artefak (kategori "spell") selalu minta konfirmasi dulu: "Yakin mau
 * memakai ini?" dengan tombol Iya / Ga jadi. Ramuan langsung dipakai.
 */
function requestUseItem(item, targets) {
  if (item.category !== "spell") {
    resolveItemOnTargets(item, targets);
    return;
  }
  showUseConfirm( // bag.js
    "Yakin mau memakai " + item.name + "?",
    function () { resolveItemOnTargets(item, targets); },
    function () {
      pendingItem = null;
      renderArena();
      showItemPanel();
    }
  );
}

/**
 * Cara tap (alternatif dari seret): untuk ramuan area, unit yang di-tap
 * jadi titik tengah; jendela berisi `areaSize` unit di sekitarnya terkena.
 */
function getAreaTargetsAround(item, centerUnit) {
  const team = allUnits.filter(function (u) { return u.team === centerUnit.team; });
  const idx = team.findIndex(function (u) { return u.id === centerUnit.id; });
  const n = Math.min(item.areaSize, team.length);
  const start = Math.max(0, Math.min(team.length - n, idx - Math.floor((n - 1) / 2)));
  return team.slice(start, start + n).filter(function (u) { return u.alive; });
}

/**
 * Dipanggil dari battle.js (onUnitSlotClick) saat pemain tap target
 * yang valid ketika pendingItem sedang aktif.
 */
function resolveItemOnTarget(unit) {
  const item = pendingItem;
  const targets = isAreaItem(item) ? getAreaTargetsAround(item, unit) : [unit];
  requestUseItem(item, targets);
}

function resolveItemOnTargets(item, targets) {
  if (getInventoryCount(item.id) <= 0) return; // jaga-jaga
  targets = targets.filter(function (t) { return !t.alive || canItemAffectUnit(item, t); });
  if (targets.length === 0) {
    logMessage(item.name + " tidak punya target yang bisa dikenai.");
    pendingItem = null;
    hideItemPanel();
    renderArena();
    return;
  }
  playerInventory[item.id] -= 1;
  if (playerInventory[item.id] <= 0) delete playerInventory[item.id];
  if (typeof saveGame === "function") saveGame(); // storage.js

  // Peringatan di atas layar: pihak kamu memakai Artefak (banner.js)
  if (item.category === "spell" && typeof announceArtifact === "function") {
    announceArtifact(item, "player");
  }

  targets.forEach(function (target) {
    applyItemEffect(item, target);
  });

  pendingItem = null;
  hideItemPanel();
  renderArena();
  checkBattleEnd();

  // Memakai item GRATIS: tidak menghabiskan giliran. Giliran tetap di
  // pemain sampai dia benar-benar memakai skill karakter.
  if (!battleEnded) {
    logMessage("Item dipakai. Giliranmu masih berlanjut.");
  }
}

function applyItemEffect(item, target, userLabel) {
  const effect = item.effect;
  const who = userLabel || "Kamu"; // "Kamu" atau "Musuh", untuk teks log

  // Aturan beku (concepts.js): ramuan tidak bisa mengenai yang beku, artefak debuff boleh
  if (target.alive && !canItemAffectUnit(item, target)) {
    logMessage(target.name + " sedang beku, tidak bisa menerima " + item.name + ".");
    return;
  }

  if (effect.type === "heal") {
    applyHeal(target, effect.amount);
    logMessage(who + " memakai " + item.name + " ke " + target.name + " (+" + effect.amount + " HP).");
  } else if (effect.type === "mana") {
    applyManaRecovery(target, effect.amount);
    logMessage(who + " memakai " + item.name + " ke " + target.name + " (+" + effect.amount + " Mana).");
  } else if (effect.type === "cleanse") {
    target.statusEffects = target.statusEffects.filter(function (e) {
      return e.type !== "debuff" && e.type !== "dot" && e.type !== "stun" && e.type !== "slow";
    });
    logMessage(who + " memakai " + item.name + " ke " + target.name + ", status buruk hilang.");
  } else if (effect.type === "buff" || effect.type === "debuff") {
    target.statusEffects.push({ type: effect.type, stat: effect.stat, percent: effect.percent, turnsLeft: effect.turns });
    logMessage(who + " memakai " + item.name + " ke " + target.name + ".");
  } else if (effect.type === "dot") {
    target.statusEffects.push({ type: "dot", stat: effect.stat, amount: effect.amount, turnsLeft: effect.turns });
    logMessage(who + " memakai " + item.name + " ke " + target.name + ".");
  } else if (effect.type === "regen") {
    target.statusEffects.push({ type: "regen", amount: effect.amount, turnsLeft: effect.turns });
    logMessage(who + " memakai " + item.name + " ke " + target.name + " (+" + effect.amount + " HP tiap giliran).");
  } else if (effect.type === "fireres") {
    target.statusEffects = target.statusEffects.filter(function (e) {
      return e.type !== "fireres" && !(e.type === "dot" && e.stat === "burn");
    });
    target.statusEffects.push({ type: "fireres", turnsLeft: effect.turns });
    logMessage(who + " memakai " + item.name + " ke " + target.name + ", kebal bakar " + effect.turns + " giliran.");
  } else if (effect.type === "swift" || effect.type === "slow") {
    // Tidak menumpuk: ramuan baru menggantikan efek lama jenis yang sama.
    target.statusEffects = target.statusEffects.filter(function (e) { return e.type !== effect.type; });
    target.statusEffects.push({ type: effect.type, percent: effect.percent, charge: 0, turnsLeft: effect.turns });
    logMessage(who + " memakai " + item.name + " ke " + target.name + ".");
  } else if (effect.type === "shield") {
    applyShield(target, effect.amount, Object.assign({}, effect, { sourceTeam: userLabel === "Musuh" ? "enemy" : "player" })); // kind/turns/basis (concepts.js)
    logMessage(who + " memakai " + item.name + " ke " + target.name + " (+" + shieldDescribe(effect.amount, effect) + ").");
  } else if (effect.type === "stun") {
    const success = Math.random() < effect.chance;
    if (success) {
      target.statusEffects.push({ type: "stun", turnsLeft: effect.turns });
      logMessage(target.name + " kena " + item.name + ", stun!");
    } else {
      logMessage(item.name + " gagal mengenai " + target.name + ".");
    }
  } else if (effect.type === "execute_attack") {
    // Pembunuh = artefaknya (dipakai banner "membunuh", banner.js)
    currentDamageSource = { team: userLabel === "Musuh" ? "enemy" : "player", label: item.name, icon: "🗡️" };
    applyDamage(target, effect.damage);
    logMessage(who + " memakai " + item.name + " ke " + target.name + " (-" + effect.damage + " HP).");
    if (target.alive && (target.currentHP / target.maxHP) <= effect.thresholdPercent) {
      applyDamage(target, target.currentHP);
      logMessage(target.name + " tereksekusi oleh " + item.name + "!");
    }
    currentDamageSource = null;
  } else if (effect.type === "revive") {
    if (!target.alive) {
      target.alive = true;
      target.currentHP = Math.max(1, Math.round(target.maxHP * effect.percent));
      logMessage(target.name + " dihidupkan kembali oleh " + item.name + "!");
    }
  }
}

// Tombol-tombol ini sudah ada di HTML sejak awal (bukan dibuat lewat JS),
// jadi listenernya aman dipasang langsung di sini, di file yang memang
// mendefinisikan fungsi-fungsi ini.
document.getElementById("open-item-panel-btn").addEventListener("click", onOpenItemPanelClick);
document.getElementById("item-cancel-btn").addEventListener("click", onItemCancelClick);
