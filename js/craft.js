/* ============================================
   ACCURANT - CRAFT.JS
   Layar "Toko Racikan" (dibuka dari Toko > Racikan):
   1. Daftar ramuan minum Tahap I (geser ke kanan untuk melihat yang lain)
   2. Racik Kekuatan : naikkan ramuan Tahap I -> II -> III (efek x2 tiap tahap)
   3. Racik Lemparan : ubah ramuan minum jadi ramuan lempar (x0,70),
                       tambah kekuatan (+20% tiap langkah) & jangkauan.

   Angka harga ada di potions.js (CRAFT_COST_TIER2, dst).
   ============================================ */

const craftState = {
  open: null,        // "power" | "splash" | null  (menu racik yang sedang terbuka)
  powerId: null,     // ramuan yang dimasukkan ke mesin Racik Kekuatan
  splashId: null,    // ramuan minum yang dimasukkan ke mesin Racik Lemparan
  steps: 0,          // langkah kekuatan lempar
  range: SPLASH_MIN_RANGE,
  msg: "",
  carouselX: 0
};

function refreshCraft() {
  const y = window.scrollY;
  renderShopScreen(); // shop.js (menggambar ulang layar racikan)
  window.scrollTo(0, y);
}

function formatMult(m) {
  return "×" + m.toFixed(2).replace(".", ",");
}

function persistCraft() {
  if (typeof saveGame === "function") saveGame(); // storage.js
  updateAccountBar(); // account.js (koin)
}

function addToInventory(id, n) {
  playerInventory[id] = getInventoryCount(id) + n;
  if (playerInventory[id] <= 0) delete playerInventory[id];
}


/* ============================================
   LAYAR UTAMA RACIKAN
   ============================================ */

function renderCraftView(root) {
  normalizePlayerInventory(); // bag.js

  const title = document.createElement("h2");
  title.className = "craft-title";
  title.textContent = "Toko Ramuan";
  root.appendChild(title);

  const label = document.createElement("div");
  label.className = "shop-category-label";
  label.textContent = "🧪 Racikan";
  root.appendChild(label);

  root.appendChild(buildRecipeCarousel());

  const hint = document.createElement("p");
  hint.className = "craft-swipe-hint";
  hint.textContent = "Geser ke kanan untuk melihat ramuan lain ›";
  root.appendChild(hint);

  const line = document.createElement("hr");
  line.className = "craft-divider";
  root.appendChild(line);

  const racikLabel = document.createElement("div");
  racikLabel.className = "shop-category-label";
  racikLabel.textContent = "⚗️ Racik";
  root.appendChild(racikLabel);

  root.appendChild(buildCraftMenu("power", "⚗️ Racik Kekuatan", renderPowerMachine));
  root.appendChild(buildCraftMenu("splash", "💥 Racik Lemparan", renderSplashMachine));

  // Pulihkan posisi geser carousel (tergambar ulang setiap beli)
  const car = root.querySelector(".craft-carousel");
  if (car) car.scrollLeft = craftState.carouselX;
}

function buildRecipeCarousel() {
  const car = document.createElement("div");
  car.className = "craft-carousel";
  car.addEventListener("scroll", function () { craftState.carouselX = car.scrollLeft; });

  POTION_KIND_ORDER.forEach(function (kind) {
    const def = POTION_KINDS[kind];
    const item = resolvePotionItem("d:" + kind + ":1");

    const card = document.createElement("div");
    card.className = "craft-card";

    const imgBox = document.createElement("div");
    imgBox.className = "craft-card-img";
    imgBox.appendChild(createPotionImg(kind, "drink", "craft-card-potion"));
    const owned = document.createElement("span");
    owned.className = "craft-owned";
    owned.textContent = "Dimiliki: " + getInventoryCount(item.id);
    imgBox.appendChild(owned);
    card.appendChild(imgBox);

    const name = document.createElement("div");
    name.className = "craft-card-name";
    name.textContent = "Ramuan " + def.name;
    card.appendChild(name);

    const effect = document.createElement("div");
    effect.className = "craft-card-line";
    effect.textContent = "Efek: " + item.effectText;
    card.appendChild(effect);

    const note = document.createElement("div");
    note.className = "craft-card-line craft-note";
    note.textContent = "Catatan: " + def.note;
    card.appendChild(note);

    const buy = document.createElement("button");
    buy.className = "shop-buy-btn craft-buy";
    buy.appendChild(createCoinLabel(item.price)); // emblems.js
    buy.disabled = playerAccount.coins < item.price;
    buy.addEventListener("click", function () { buyItem(item.id); }); // shop.js
    card.appendChild(buy);

    car.appendChild(card);
  });
  return car;
}

function buildCraftMenu(key, label, renderBody) {
  const isOpen = craftState.open === key;

  const box = document.createElement("div");
  box.className = "craft-menu" + (isOpen ? " open" : "");
  box.id = "craft-menu-" + key;

  const head = document.createElement("button");
  head.className = "craft-menu-head";
  head.innerHTML = "<span>" + label + "</span><span class='craft-menu-arrow'>" + (isOpen ? "▴" : "▾") + "</span>";
  head.addEventListener("click", function () {
    craftState.open = isOpen ? null : key;
    craftState.msg = "";
    refreshCraft();
    if (!isOpen) {
      // Bar menu dibawa ke sekitar tengah layar, koin tetap terlihat di atas.
      setTimeout(function () {
        const el = document.getElementById("craft-menu-" + key);
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }, 40);
    }
  });
  box.appendChild(head);

  if (isOpen) {
    const body = document.createElement("div");
    body.className = "craft-menu-body";
    renderBody(body);
    box.appendChild(body);
  }
  return box;
}

/** Baris "Ramuan yang kamu punya". isEligible menentukan mana yang bisa dipilih. */
function buildOwnedRow(isEligible, selectedId, onPick) {
  const wrap = document.createElement("div");
  wrap.className = "craft-owned-wrap";

  const label = document.createElement("div");
  label.className = "craft-owned-label";
  label.textContent = "Ramuan yang kamu punya";
  wrap.appendChild(label);

  const items = getOwnedPotionItems();
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "item-empty-note";
    empty.textContent = "Belum ada ramuan. Beli di bagian Racikan di atas.";
    wrap.appendChild(empty);
    return wrap;
  }

  const row = document.createElement("div");
  row.className = "bag-grid craft-owned-grid";
  items.forEach(function (item) {
    row.appendChild(createItemTile(item, getInventoryCount(item.id), {
      selected: item.id === selectedId,
      disabled: !isEligible(item),
      onClick: function () { onPick(item); }
    }));
  });
  wrap.appendChild(row);
  return wrap;
}

function buildCraftMessage() {
  const p = document.createElement("p");
  p.className = "craft-message";
  p.textContent = craftState.msg;
  return p;
}


/* ============================================
   RACIK KEKUATAN  (Tahap I -> II -> III)
   ============================================ */

function getPowerSelection() {
  const sel = craftState.powerId ? getItemById(craftState.powerId) : null;
  if (!sel || getInventoryCount(sel.id) <= 0 || !canUpgradePotion(sel)) {
    craftState.powerId = null;
    return null;
  }
  return sel;
}

function renderPowerMachine(body) {
  const sel = getPowerSelection();

  const chain = document.createElement("div");
  chain.className = "craft-chain";

  for (let t = 1; t <= MAX_POTION_TIER; t++) {
    const col = document.createElement("div");
    col.className = "craft-slot-col";

    const slot = document.createElement("div");
    slot.className = "craft-slot";
    if (sel) {
      slot.appendChild(createPotionImg(sel.kind, sel.form, "craft-slot-potion"));
      slot.classList.add(t === sel.tier ? "filled" : (t < sel.tier ? "past" : "preview"));
    } else {
      slot.classList.add("empty");
    }
    col.appendChild(slot);

    const cap = document.createElement("div");
    cap.className = "craft-slot-cap";
    cap.textContent = "Tahap " + ["", "I", "II", "III"][t];
    col.appendChild(cap);

    if (sel) {
      const eff = document.createElement("div");
      eff.className = "craft-slot-eff";
      const m = potionMultiplier(sel.form, t, sel.steps);
      eff.textContent = (t > 1 ? "efek ×2 · " : "") + computePotionEffect(sel.kind, m).text;
      col.appendChild(eff);
    }
    chain.appendChild(col);

    if (t < MAX_POTION_TIER) {
      const arrowCol = document.createElement("div");
      arrowCol.className = "craft-arrow-col";
      const arrow = document.createElement("div");
      arrow.className = "craft-arrow";
      arrow.textContent = "→";
      arrowCol.appendChild(arrow);

      const cost = upgradeCost(t);
      const chip = document.createElement("button");
      chip.className = "craft-chip";
      chip.appendChild(createCoinLabel(cost));
      if (!sel || sel.tier > t) {
        chip.disabled = true;
        if (sel && sel.tier > t) chip.classList.add("done");
      } else if (sel.tier < t) {
        chip.disabled = true; // belum sampai tahap ini
      } else {
        chip.disabled = playerAccount.coins < cost;
        chip.classList.add("ready");
        chip.addEventListener("click", craftUpgrade);
      }
      arrowCol.appendChild(chip);
      chain.appendChild(arrowCol);
    }
  }
  body.appendChild(chain);

  const info = document.createElement("p");
  info.className = "craft-info";
  if (!sel) {
    info.textContent = "Pilih ramuan Tahap I atau II dari daftar di bawah. Tap harga di bawah panah untuk meracik ke tahap berikutnya.";
  } else {
    info.textContent = sel.name + ": tap harga di bawah panah untuk naik tahap. Boleh berhenti di Tahap II, atau lanjut ke Tahap III.";
  }
  body.appendChild(info);
  if (craftState.msg) body.appendChild(buildCraftMessage());

  body.appendChild(buildOwnedRow(
    function (item) { return canUpgradePotion(item); },
    craftState.powerId,
    function (item) {
      craftState.powerId = craftState.powerId === item.id ? null : item.id;
      craftState.msg = "";
      refreshCraft();
    }
  ));
}

function craftUpgrade() {
  const sel = getPowerSelection();
  if (!sel) return;
  const cost = upgradeCost(sel.tier);
  if (playerAccount.coins < cost) return;

  const next = resolvePotionItem(potionIdOf(nextTierSpec(sel)));
  if (!next) return;

  playerAccount.coins -= cost;
  addToInventory(sel.id, -1);
  addToInventory(next.id, 1);
  craftState.powerId = next.id; // langsung siap dinaikkan lagi kalau mau
  craftState.msg = "Berhasil: " + next.name + " (efek ×2).";
  persistCraft();
  refreshCraft();
}


/* ============================================
   RACIK LEMPARAN  (ramuan minum -> ramuan lempar)
   ============================================ */

function getSplashSelection() {
  const sel = craftState.splashId ? getItemById(craftState.splashId) : null;
  if (!sel || sel.form !== "drink" || getInventoryCount(sel.id) <= 0) {
    craftState.splashId = null;
    return null;
  }
  return sel;
}

function splashSpecFor(sel) {
  return { form: "splash", kind: sel.kind, tier: sel.tier, steps: craftState.steps, range: craftState.range };
}

function buildStepperRow(label, valueText, subText, onMinus, onPlus, minusOff, plusOff) {
  const row = document.createElement("div");
  row.className = "craft-stepper";

  const lab = document.createElement("div");
  lab.className = "craft-stepper-label";
  lab.textContent = label;

  const ctrl = document.createElement("div");
  ctrl.className = "craft-stepper-ctrl";

  const minus = document.createElement("button");
  minus.className = "craft-step-btn";
  minus.textContent = "−";
  minus.disabled = minusOff;
  minus.addEventListener("click", onMinus);

  const val = document.createElement("span");
  val.className = "craft-step-value";
  val.textContent = valueText;

  const plus = document.createElement("button");
  plus.className = "craft-step-btn";
  plus.textContent = "+";
  plus.disabled = plusOff;
  plus.addEventListener("click", onPlus);

  ctrl.appendChild(minus);
  ctrl.appendChild(val);
  ctrl.appendChild(plus);

  const sub = document.createElement("div");
  sub.className = "craft-stepper-sub";
  sub.textContent = subText;

  row.appendChild(lab);
  row.appendChild(ctrl);
  row.appendChild(sub);
  return row;
}

function renderSplashMachine(body) {
  const sel = getSplashSelection();

  let maxSteps = SPLASH_MAX_POWER_STEPS;
  if (sel) maxSteps = maxPowerSteps(sel.kind, sel.tier);
  if (craftState.steps > maxSteps) craftState.steps = maxSteps;

  const chain = document.createElement("div");
  chain.className = "craft-chain craft-chain-splash";

  const leftCol = document.createElement("div");
  leftCol.className = "craft-slot-col";
  const leftSlot = document.createElement("div");
  leftSlot.className = "craft-slot " + (sel ? "filled" : "empty");
  if (sel) leftSlot.appendChild(createPotionImg(sel.kind, "drink", "craft-slot-potion"));
  leftCol.appendChild(leftSlot);
  const leftCap = document.createElement("div");
  leftCap.className = "craft-slot-cap";
  leftCap.textContent = sel ? sel.shortName : "Ramuan minum";
  leftCol.appendChild(leftCap);
  chain.appendChild(leftCol);

  const arrowCol = document.createElement("div");
  arrowCol.className = "craft-arrow-col";
  const arrow = document.createElement("div");
  arrow.className = "craft-arrow";
  arrow.textContent = "→";
  arrowCol.appendChild(arrow);
  chain.appendChild(arrowCol);

  const rightCol = document.createElement("div");
  rightCol.className = "craft-slot-col";
  const rightSlot = document.createElement("div");
  rightSlot.className = "craft-slot " + (sel ? "preview-strong" : "empty");
  let preview = null;
  if (sel) {
    preview = resolvePotionItem(potionIdOf(splashSpecFor(sel)));
    rightSlot.appendChild(createPotionImg(sel.kind, "splash", "craft-slot-potion"));
  }
  rightCol.appendChild(rightSlot);
  const rightCap = document.createElement("div");
  rightCap.className = "craft-slot-cap";
  rightCap.textContent = "Ramuan Lempar";
  rightCol.appendChild(rightCap);
  chain.appendChild(rightCol);
  body.appendChild(chain);

  const info = document.createElement("div");
  info.className = "craft-info";
  if (!sel) {
    info.textContent = "Pilih ramuan minum (Tahap berapa pun) dari daftar di bawah.";
  } else {
    const m = preview.multiplier;
    info.innerHTML = "Jangkauan: <b>" + craftState.range + " orang</b><br>" +
      "Kekuatan: <b>" + formatMult(m) + "</b> dari ramuan minum Tahap " + ["", "I", "II", "III"][sel.tier] + "<br>" +
      "Efek per orang: " + preview.effectText;
  }
  body.appendChild(info);

  if (sel) {
    const atCap = craftState.steps >= maxSteps && maxSteps < SPLASH_MAX_POWER_STEPS;
    body.appendChild(buildStepperRow(
      "Kekuatan",
      craftState.steps + "/" + maxSteps,
      atCap ? "efek sudah maksimal" : "+20% tiap langkah · +" + SPLASH_POWER_STEP_COST + " koin",
      function () { craftState.steps -= 1; craftState.msg = ""; refreshCraft(); },
      function () { craftState.steps += 1; craftState.msg = ""; refreshCraft(); },
      craftState.steps <= 0,
      craftState.steps >= maxSteps
    ));
    body.appendChild(buildStepperRow(
      "Jangkauan",
      craftState.range + " orang",
      "+" + SPLASH_RANGE_STEP_COST + " koin tiap tambahan orang",
      function () { craftState.range -= 1; craftState.msg = ""; refreshCraft(); },
      function () { craftState.range += 1; craftState.msg = ""; refreshCraft(); },
      craftState.range <= SPLASH_MIN_RANGE,
      craftState.range >= SPLASH_MAX_RANGE
    ));

    const cost = splashCraftCost(craftState.steps, craftState.range);
    const btn = document.createElement("button");
    btn.className = "shop-buy-btn craft-make-btn";
    btn.appendChild(document.createTextNode("Racik  "));
    btn.appendChild(createCoinLabel(cost));
    btn.disabled = playerAccount.coins < cost;
    btn.addEventListener("click", craftSplash);
    body.appendChild(btn);
  }

  if (craftState.msg) body.appendChild(buildCraftMessage());

  body.appendChild(buildOwnedRow(
    function (item) { return item.form === "drink"; },
    craftState.splashId,
    function (item) {
      craftState.splashId = craftState.splashId === item.id ? null : item.id;
      craftState.msg = "";
      refreshCraft();
    }
  ));
}

function craftSplash() {
  const sel = getSplashSelection();
  if (!sel) return;
  const cost = splashCraftCost(craftState.steps, craftState.range);
  if (playerAccount.coins < cost) return;

  const out = resolvePotionItem(potionIdOf(splashSpecFor(sel)));
  if (!out) return;

  playerAccount.coins -= cost;
  addToInventory(sel.id, -1);
  addToInventory(out.id, 1);
  craftState.msg = "Berhasil: " + out.name + " (area " + out.range + " orang, " + formatMult(out.multiplier) + ").";
  persistCraft();
  refreshCraft();
}
