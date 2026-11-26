/* ============================================
   ACCURANT ARENA - SHOPHUB.JS
   Tampilan Toko baru (sesuai sketsa):

   MENU TOKO (awal masuk toko), dari atas ke bawah:
     1. Ramuan jadi
          Ramuan Minum  : Tahap I, II, III
          Ramuan Lempar : Tahap I, II, III      (tiap baris bisa digeser ke samping)
     2. Alat Bantu   -> "Belum tersedia"
     3. Tiket        -> "Belum tersedia" (terbuka saat masuk wilayah)
     4. Kunci        -> "Belum tersedia"
     5. Tiga tombol menu: Racik Ramuan, Toko Artefak, Toko Karakter

   LAYAR RACIK RAMUAN (menu baru):
     Kiri (bisa di-scroll)  : Racik Kekuatan, Racik Lemparan (menu lipat)
     Kanan (tetap)          : "Beli ramuan" dan "Yang kamu punya"

   Memakai ulang mesin racik di craft.js dan item di potions.js. Dimuat setelah
   shopRegions.js. Gaya ada di css/shop-hub.css.
   ============================================ */

/* Harga ramuan jadi = biaya bahan + biaya racik, dikali pengali kemudahan. */
const READY_POTION_PREMIUM = 1.25;
const SH_ROMAN = ["", "I", "II", "III"];

/** Harga membeli ramuan jadi (Tahap I minum = harga bahan asli tanpa tambahan). */
function readyPotionPrice(item) {
  const def = POTION_KINDS[item.kind];
  if (item.form === "drink" && item.tier === 1) return def.price;
  let cost = def.price;
  if (item.tier >= 2) cost += CRAFT_COST_TIER2;
  if (item.tier >= 3) cost += CRAFT_COST_TIER3;
  if (item.form === "splash") cost += splashCraftCost(item.steps, item.range);
  return Math.round((cost * READY_POTION_PREMIUM) / 5) * 5;
}

/** Ramuan jadi untuk satu baris. Lempar memakai kekuatan dasar (0 langkah) dan jangkauan minimum. */
function readyPotionsFor(form, tier) {
  const out = [];
  POTION_KIND_ORDER.forEach(function (kind) {
    const spec = form === "drink"
      ? { form: "drink", kind: kind, tier: tier, steps: 0, range: 1 }
      : { form: "splash", kind: kind, tier: tier, steps: 0, range: SPLASH_MIN_RANGE };
    const item = resolvePotionItem(potionIdOf(spec));
    if (item) out.push(item);
  });
  return out;
}

function buyReadyPotion(itemId) {
  const item = resolvePotionItem(itemId);
  if (!item) return;
  const price = readyPotionPrice(item);
  if (playerAccount.coins < price) return;
  playerAccount.coins -= price;
  addToInventory(itemId, 1); // craft.js
  if (typeof saveGame === "function") saveGame();
  updateAccountBar();
  renderShopScreen();
}

function shEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

/* Posisi geser tiap baris ramuan (supaya tidak melompat ke awal saat beli). */
const shopHubScroll = {};

function shReadyCard(item) {
  const price = readyPotionPrice(item);
  const card = shEl("div", "sh-card");

  const art = shEl("div", "sh-card-art");
  art.appendChild(createPotionImg(item.kind, item.form, "sh-card-img")); // bag.js
  if (item.form === "splash") art.appendChild(shEl("span", "sh-card-tag", "💥 " + item.range));
  const own = getInventoryCount(item.id);
  if (own > 0) art.appendChild(shEl("span", "sh-card-own", "×" + own));
  card.appendChild(art);

  card.appendChild(shEl("div", "sh-card-name", POTION_KINDS[item.kind].name));
  card.appendChild(shEl("div", "sh-card-eff", item.form === "splash" ? "Area " + item.range + " · " + item.effectText : item.effectText));

  const buy = shEl("button", "shop-buy-btn sh-buy");
  buy.appendChild(createCoinLabel(price)); // emblems.js
  buy.disabled = playerAccount.coins < price;
  buy.addEventListener("click", function () { buyReadyPotion(item.id); });
  card.appendChild(buy);
  return card;
}

function shPotionRow(parent, form, tier) {
  const key = form + tier;
  const row = shEl("div", "sh-prow");
  row.appendChild(shEl("div", "sh-prow-label", "Tahap " + SH_ROMAN[tier]));
  const strip = shEl("div", "sh-strip");
  strip.dataset.key = key;
  strip.addEventListener("scroll", function () { shopHubScroll[key] = strip.scrollLeft; });
  readyPotionsFor(form, tier).forEach(function (item) { strip.appendChild(shReadyCard(item)); });
  row.appendChild(strip);
  parent.appendChild(row);
  return strip;
}

function shLockedSection(parent, title, count, note) {
  const sec = shEl("div", "sh-section");
  sec.appendChild(shEl("h3", "sh-title", title));
  const strip = shEl("div", "sh-locked");
  for (let i = 0; i < count; i++) strip.appendChild(shEl("div", "sh-lock-tile", "🔒"));
  const caption = shEl("div", "sh-locked-note");
  caption.appendChild(shEl("b", null, "Belum tersedia"));
  if (note) caption.appendChild(shEl("span", null, note));
  strip.appendChild(caption);
  sec.appendChild(strip);
  parent.appendChild(sec);
}

renderShopHub = function (list) {
  const wrap = shEl("div", "sh-wrap");

  /* ----- 1. Ramuan jadi ----- */
  const potions = shEl("div", "sh-section");
  potions.appendChild(shEl("h3", "sh-title", "🧪 Ramuan"));
  const strips = [];

  potions.appendChild(shEl("div", "sh-sub", "Ramuan Minum"));
  for (let t = 1; t <= MAX_POTION_TIER; t++) strips.push(shPotionRow(potions, "drink", t));
  potions.appendChild(shEl("div", "sh-sub", "Ramuan Lempar"));
  for (let t = 1; t <= MAX_POTION_TIER; t++) strips.push(shPotionRow(potions, "splash", t));
  wrap.appendChild(potions);

  /* ----- 2-4. Belum tersedia ----- */
  wrap.appendChild(shEl("hr", "sh-divider"));
  shLockedSection(wrap, "🛠️ Alat Bantu", 5, "");
  wrap.appendChild(shEl("hr", "sh-divider"));
  shLockedSection(wrap, "🎫 Tiket", 4, "Terbuka saat masuk wilayah");
  wrap.appendChild(shEl("hr", "sh-divider"));
  shLockedSection(wrap, "🗝️ Kunci", 4, "");
  wrap.appendChild(shEl("hr", "sh-divider"));

  /* ----- 5. Tombol menu ----- */
  const menus = shEl("div", "sh-menus");
  [
    { view: "craft", label: "Racik Ramuan", sub: "Naikkan tahap & ubah jadi ramuan lempar", icon: createPotionImg("heal", "drink", "sh-menu-potion") },
    { view: "artifact", label: "Toko Artefak", sub: "Mantra & benda sihir", icon: "🗡️" },
    { view: "character", label: "Toko Karakter", sub: "Rekrut karakter baru", icon: "🧑‍🎤" }
  ].forEach(function (m) {
    const btn = shEl("button", "sh-menu-btn");
    const ic = shEl("span", "sh-menu-icon");
    if (typeof m.icon === "string") ic.textContent = m.icon; else ic.appendChild(m.icon);
    btn.appendChild(ic);
    const txt = shEl("span", "sh-menu-text");
    txt.appendChild(shEl("span", "sh-menu-label", m.label));
    txt.appendChild(shEl("span", "sh-menu-sub", m.sub));
    btn.appendChild(txt);
    btn.appendChild(shEl("span", "sh-menu-go", "›"));
    btn.addEventListener("click", function () { openShopView(m.view); });
    menus.appendChild(btn);
  });
  wrap.appendChild(menus);

  list.appendChild(wrap);
  strips.forEach(function (s) { s.scrollLeft = shopHubScroll[s.dataset.key] || 0; });
};


/* ============================================
   LAYAR RACIK RAMUAN (dua kolom)
   ============================================ */

const OWN_PAGE_SIZE = 8;
craftState.buyIdx = 0;
craftState.ownPage = 0;
craftState.leftY = 0;

/** Menu lipat di kolom kiri (Racik Kekuatan / Racik Lemparan). */
function rkMenu(key, label, renderBody) {
  const isOpen = craftState.open === key;
  const box = shEl("div", "craft-menu rk-menu" + (isOpen ? " open" : ""));
  box.id = "craft-menu-" + key;

  const head = shEl("button", "craft-menu-head");
  head.innerHTML = "<span>" + label + "</span><span class='craft-menu-arrow'>" + (isOpen ? "▴" : "▾") + "</span>";
  head.addEventListener("click", function () {
    craftState.open = isOpen ? null : key;
    craftState.msg = "";
    craftState.ownPage = 0;
    renderShopScreen();
  });
  box.appendChild(head);

  if (isOpen) {
    const body = shEl("div", "craft-menu-body");
    renderBody(body);
    const ownedInside = body.querySelector(".craft-owned-wrap"); // daftar "yang kamu punya" pindah ke kolom kanan
    if (ownedInside && ownedInside.parentNode) ownedInside.parentNode.removeChild(ownedInside);
    box.appendChild(body);
  }
  return box;
}

/** Kotak "Beli ramuan": jelajahi ramuan minum Tahap I satu per satu. */
function rkBuyBox() {
  const box = shEl("div", "rk-box rk-buy");
  const head = shEl("div", "rk-box-head");
  head.appendChild(shEl("span", "rk-box-title", "Beli ramuan"));
  head.appendChild(shEl("span", "rk-box-sub", "Tahap I"));
  box.appendChild(head);

  const n = POTION_KIND_ORDER.length;
  craftState.buyIdx = ((craftState.buyIdx % n) + n) % n;
  const kind = POTION_KIND_ORDER[craftState.buyIdx];
  const def = POTION_KINDS[kind];
  const item = resolvePotionItem("d:" + kind + ":1");

  const row = shEl("div", "rk-buy-row");
  const prev = shEl("button", "rk-nav", "‹");
  prev.addEventListener("click", function () { craftState.buyIdx -= 1; renderShopScreen(); });
  const next = shEl("button", "rk-nav", "›");
  next.addEventListener("click", function () { craftState.buyIdx += 1; renderShopScreen(); });

  const main = shEl("div", "rk-buy-main");
  const art = shEl("div", "rk-buy-art");
  art.appendChild(createPotionImg(kind, "drink", "rk-buy-img"));
  main.appendChild(art);
  const info = shEl("div", "rk-buy-info");
  info.appendChild(shEl("div", "rk-buy-name", "Ramuan " + def.name));
  info.appendChild(shEl("div", "rk-buy-eff", item.effectText));
  info.appendChild(shEl("div", "rk-buy-own", "Dimiliki: " + getInventoryCount(item.id) + "  ·  " + (craftState.buyIdx + 1) + "/" + n));
  main.appendChild(info);

  row.appendChild(prev);
  row.appendChild(main);
  row.appendChild(next);
  box.appendChild(row);

  const buy = shEl("button", "shop-buy-btn rk-buy-btn");
  buy.appendChild(document.createTextNode("Beli  "));
  buy.appendChild(createCoinLabel(item.price));
  buy.disabled = playerAccount.coins < item.price;
  buy.addEventListener("click", function () { buyItem(item.id); }); // shop.js
  box.appendChild(buy);
  return box;
}

/** Kotak "Yang kamu punya": ramuan milikmu, berhalaman (tidak di-scroll). */
function rkOwnBox() {
  const box = shEl("div", "rk-box rk-own");
  const items = getOwnedPotionItems();
  const pages = Math.max(1, Math.ceil(items.length / OWN_PAGE_SIZE));
  craftState.ownPage = Math.max(0, Math.min(pages - 1, craftState.ownPage));

  const head = shEl("div", "rk-box-head");
  head.appendChild(shEl("span", "rk-box-title", "Yang kamu punya"));
  if (pages > 1) {
    const pg = shEl("span", "rk-pager");
    const l = shEl("button", "rk-nav rk-nav-s", "‹");
    l.disabled = craftState.ownPage <= 0;
    l.addEventListener("click", function () { craftState.ownPage -= 1; renderShopScreen(); });
    const r = shEl("button", "rk-nav rk-nav-s", "›");
    r.disabled = craftState.ownPage >= pages - 1;
    r.addEventListener("click", function () { craftState.ownPage += 1; renderShopScreen(); });
    pg.appendChild(l);
    pg.appendChild(shEl("span", null, (craftState.ownPage + 1) + "/" + pages));
    pg.appendChild(r);
    head.appendChild(pg);
  }
  box.appendChild(head);

  const open = craftState.open;
  let eligible = function () { return false; };
  let selectedId = null;
  let onPick = null;
  if (open === "power") {
    eligible = function (it) { return canUpgradePotion(it); };
    selectedId = craftState.powerId;
    onPick = function (it) { craftState.powerId = craftState.powerId === it.id ? null : it.id; };
  } else if (open === "splash") {
    eligible = function (it) { return it.form === "drink"; };
    selectedId = craftState.splashId;
    onPick = function (it) { craftState.splashId = craftState.splashId === it.id ? null : it.id; };
  }

  if (items.length === 0) {
    box.appendChild(shEl("p", "item-empty-note rk-empty", "Belum ada ramuan. Beli di kotak di atas."));
    return box;
  }
  const grid = shEl("div", "rk-own-grid");
  items.slice(craftState.ownPage * OWN_PAGE_SIZE, (craftState.ownPage + 1) * OWN_PAGE_SIZE).forEach(function (item) {
    grid.appendChild(createItemTile(item, getInventoryCount(item.id), { // bag.js
      selected: item.id === selectedId,
      disabled: !open || !eligible(item),
      onClick: function (it) { onPick(it); craftState.msg = ""; renderShopScreen(); }
    }));
  });
  box.appendChild(grid);
  if (!open) box.appendChild(shEl("div", "rk-own-hint", "Buka salah satu menu racik di kiri untuk memilih ramuan."));
  return box;
}

renderCraftView = function (root) {
  normalizePlayerInventory(); // bag.js

  const screen = shEl("div", "rk-screen");

  const left = shEl("div", "rk-left");
  left.addEventListener("scroll", function () { craftState.leftY = left.scrollTop; });
  left.appendChild(shEl("h2", "rk-title", "⚗️ Racik Ramuan"));
  left.appendChild(rkMenu("power", "⚗️ Racik Kekuatan", renderPowerMachine));
  left.appendChild(rkMenu("splash", "💥 Racik Lempar", renderSplashMachine));
  screen.appendChild(left);

  const right = shEl("div", "rk-right");
  right.appendChild(rkBuyBox());
  right.appendChild(rkOwnBox());
  screen.appendChild(right);

  root.appendChild(screen);
  left.scrollTop = craftState.leftY || 0;
};

/* craft.js memanggil refreshCraft() yang menggulir jendela; di layar baru kolom kiri yang di-scroll. */
refreshCraft = function () {
  renderShopScreen();
};

/* Teks tombol kembali: dari Racik Ramuan kembali ke Toko. */
(function () {
  const btn = document.getElementById("shop-back-btn");
  if (btn) btn.setAttribute("aria-label", "Kembali");
})();
