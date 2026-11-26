/* ============================================
   ACCURANT - SHOPREGIONS.JS
   Toko Karakter bergaya etalase (referensi Forza):

     [ WILAYAH ............................ ]  <- filter wilayah (5 wilayah)
     [ PANEL KIRI ]  [ KEDUDUKAN: tab 1 | 2 | 3 ]
     [  lambang   ]  [ TEMPAT: kartu-kartu karakter ]
     [  stat/skill]
     [  BELI      ]

   File ini menggantikan renderEliteCharacterShop milik shop.js
   (dimuat SETELAH shop.js, jadi fungsi di sini yang dipakai).
   Nama wilayah & kedudukan sengaja tetap bahasa Inggris.

   Mau memindahkan karakter ke wilayah/kedudukan lain?
   Ubah CHARACTER_PLACEMENT di bawah. Karakter elit yang tidak
   tercatat otomatis masuk Ability Classroom > Junior.
   ============================================ */

const SHOP_REGIONS = [
  { id: "ability",   name: "Ability Classroom",  color: "#4aa8ff", ranks: ["Junior", "Senior", "Master"] },
  { id: "auravania", name: "Imperium Military",  color: "#f0c24a", ranks: ["Vanguard", "Sentinel", "Imperator"] }, // dulu "Auravania Kingdom" (id tetap "auravania")
  { id: "rebels",    name: "Foreign Rebels",     color: "#ee5b3c", ranks: ["Sovereign", "Aberation", "Insurgent", "Anarch"] },
  { id: "gehenna",   name: "Gehenna Abyssal",    color: "#b657ff", ranks: ["Abyss", "Devil", "Void"] },
  { id: "pluto",     name: "Pluto",              color: "#4fe3c8", ranks: [] } // Pluto tanpa kedudukan: semua karakternya langsung tampil
];

// rank: 1 = kedudukan pertama, 2 = kedua, 3 = ketiga
const CHARACTER_PLACEMENT = {
  char_rumia: { region: "ability", rank: 2 }, // Senior
  char_nowrt: { region: "ability", rank: 2 }  // Senior
};

// enter = true hanya saat layar baru dibuka / ganti wilayah / ganti kedudukan.
// Ketuk kartu atau beli TIDAK memutar ulang animasi masuk (supaya tidak berkedip).
const rgState = { region: "ability", rank: 1, selected: null, enter: true };

// Setiap kali menu Karakter dibuka dari Toko, mainkan animasi masuk sekali.
(function rgHookOpen() {
  if (typeof openShopView !== "function") return;
  const original = openShopView;
  openShopView = function (view) {
    if (view === "character") rgState.enter = true;
    return original.apply(this, arguments);
  };
})();

function rgPlacement(character) {
  if (character.placement) return character.placement; // dari charactersExtra.js
  return CHARACTER_PLACEMENT[character.id] || { region: "ability", rank: 1 }; // default: Junior
}

function rgRegion(id) {
  return SHOP_REGIONS.find(function (r) { return r.id === id; }) || SHOP_REGIONS[0];
}

function rgCharsIn(regionId, rank) {
  return CHARACTER_DATABASE.filter(function (c) {
    if (!c.elite) return false;
    const p = rgPlacement(c);
    return p.region === regionId && (rank === undefined || p.rank === rank);
  });
}

/** Level akun yang dibutuhkan agar kedudukan ke-n di wilayah ini terbuka (0 = tidak terkunci level). */
function rgLockLevel(region, n) {
  const name = region.ranks[n - 1];
  if (!name || typeof rankUnlockLevel !== "function") return 0; // progression.js
  const need = rankUnlockLevel(name);
  return need > playerAccount.level ? need : 0;
}

function rgRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255);
}

const RG_ROMAN = ["I", "II", "III", "IV"];

/* ---------- Lambang tiap wilayah (SVG garis) ---------- */
function rgEmblemSvg(id) {
  const open = '<svg viewBox="0 0 64 64" aria-hidden="true">';
  const close = "</svg>";
  if (id === "ability") { // buku terbuka + bintang
    return open +
      '<path d="M32 22c-6-4-14-5-23-4v31c9-1 17 0 23 4 6-4 14-5 23-4V18c-9-1-17 0-23 4ZM32 22v31"/>' +
      '<path d="M32 4l2.6 5.6 6 .7-4.5 4.1 1.2 6L32 17.4l-5.3 3 1.2-6-4.5-4.1 6-.7Z"/>' + close;
  }
  if (id === "auravania") { // mahkota di atas perisai
    return open +
      '<path d="M16 22 20 8l8 8 4-11 4 11 8-8 4 14Z"/>' +
      '<path d="M32 27l17 6v10c0 9-7 15-17 19-10-4-17-10-17-19V33Z"/>' +
      '<path d="M32 33v22M24 41h16"/>' + close;
  }
  if (id === "rebels") { // cincin rantai putus + dua bilah bersilang
    return open +
      '<path d="M16 15A24 24 0 1 0 48 15"/>' +
      '<path d="M18 18l28 28M46 18 18 46"/>' +
      '<path d="M13 25l7-7M51 25l-7-7M13 39l7 7M51 39l-7 7"/>' + close;
  }
  if (id === "gehenna") { // tengkorak bertanduk
    return open +
      '<path d="M18 29C8 25 7 12 14 5c0 10 6 15 11 17M46 29c10-4 11-17 4-24 0 10-6 15-11 17"/>' +
      '<path d="M20 24h24v15c0 8-5 14-12 18-7-4-12-10-12-18Z"/>' +
      '<path d="M24 34l6 3-6 3ZM40 34l-6 3 6 3Z"/>' +
      '<path d="M28 50h8M30 46v6M34 46v6"/>' + close;
  }
  // pluto: planet bercincin + bulan
  return open +
    '<circle cx="32" cy="32" r="13"/>' +
    '<ellipse cx="32" cy="32" rx="27" ry="8" transform="rotate(-22 32 32)"/>' +
    '<circle cx="51" cy="13" r="3.5"/>' +
    '<path d="M10 12v4M8 14h4M54 48v4M52 50h4"/>' + close;
}

/* ---------- Gambar ---------- */
function renderEliteCharacterShop(list) {
  const region = rgRegion(rgState.region);
  const hasRanks = region.ranks.length > 0;
  if (hasRanks && rgState.rank > region.ranks.length) rgState.rank = 1;
  const rankName = hasRanks ? region.ranks[rgState.rank - 1] : null;

  // Wilayah tanpa kedudukan (Pluto): tampilkan SEMUA karakter di wilayah itu.
  const inRank = hasRanks ? rgCharsIn(region.id, rgState.rank) : rgCharsIn(region.id);
  let selected = inRank.find(function (c) { return c.id === rgState.selected; }) || inRank[0] || null;
  rgState.selected = selected ? selected.id : null;

  const rerender = function () { renderShopScreen(); }; // shop.js (menggambar ulang Toko)

  const root = scEl("div", "rg-root" + (rgState.enter ? " rg-enter" : "")); // scEl: showcase.js
  rgState.enter = false;
  root.style.setProperty("--rc", region.color);
  root.style.setProperty("--rc-rgb", rgRgb(region.color));

  /* ===== WILAYAH (filter atas) ===== */
  const regionBar = scEl("div", "rg-regions");
  SHOP_REGIONS.forEach(function (r) {
    const count = rgCharsIn(r.id).length;
    const b = scEl("button", "rg-region" + (r.id === region.id ? " active" : "") + (count === 0 ? " empty" : ""));
    b.style.setProperty("--rc", r.color);
    b.style.setProperty("--rc-rgb", rgRgb(r.color));
    const ico = scEl("span", "rg-region-ico");
    ico.innerHTML = rgEmblemSvg(r.id);
    b.appendChild(ico);
    b.appendChild(scEl("span", "rg-region-name", r.name));
    b.appendChild(scEl("span", "rg-region-count", count > 0 ? String(count) : "—"));
    b.addEventListener("click", function () {
      if (rgState.region === r.id) return;
      rgState.region = r.id;
      // langsung ke kedudukan pertama yang sudah berisi karakter
      let first = 1;
      for (let i = 1; i <= r.ranks.length; i++) {
        if (rgCharsIn(r.id, i).length > 0) { first = i; break; }
      }
      rgState.rank = first;
      rgState.selected = null;
      rgState.enter = true;
      rerender();
    });
    regionBar.appendChild(b);
  });
  root.appendChild(regionBar);

  /* ===== PANEL KIRI: lambang, kedudukan, stat, skill, BELI ===== */
  const panel = scEl("div", "rg-panel");

  const top = scEl("div", "rg-emblem-wrap");
  const emblem = scEl("div", "rg-emblem");
  emblem.innerHTML = rgEmblemSvg(region.id);
  top.appendChild(emblem);
  const dots = scEl("div", "rg-dots");
  for (let i = 1; i <= 3; i++) dots.appendChild(scEl("span", "rg-dot" + (hasRanks && i === rgState.rank ? " on" : "")));
  top.appendChild(dots);
  top.appendChild(scEl("div", "rg-region-title", region.name));
  panel.appendChild(top);

  panel.appendChild(scEl("div", "rg-rankbar", rankName ? rankName.toUpperCase() : (inRank.length > 0 ? "TANPA KEDUDUKAN" : "BELUM TERSEDIA")));

  // Nama + peran tetap di atas (tidak ikut tergulir)
  if (selected) {
    const head = scEl("div", "rg-char-head");
    head.appendChild(scEl("div", "rg-char-name", selected.name));
    head.appendChild(scEl("div", "rg-char-role", selected.role));
    panel.appendChild(head);
  }

  const body = scEl("div", "rg-body");
  if (selected) {
    // Stat berbentuk bar, sama seperti di Koleksi
    SHOWCASE_STATS.forEach(function (st) { // showcase.js
      const row = scEl("div", "rg-stat");
      row.appendChild(scEl("span", "rg-stat-label", st.key === "maxMana" ? energyName(selected) : st.label));
      const bar = scEl("span", "rg-stat-bar");
      const fill = scEl("span", "rg-stat-fill");
      fill.style.width = Math.max(4, Math.round(selected[st.key] / statMax(st.key) * 100)) + "%";
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(scEl("span", "rg-stat-val", String(selected[st.key])));
      body.appendChild(row);
    });

    body.appendChild(scEl("div", "rg-sub", "Skill"));
    selected.skills.forEach(function (skill) {
      const line = scEl("button", "rg-skill");
      const head = scEl("span", "rg-skill-head");
      head.appendChild(scEl("span", "rg-skill-name", skill.name));
      head.appendChild(scEl("span", "rg-skill-mana", skillCostText(selected, skill))); // charactersExtra.js (Mana/Charge/Energy)
      line.appendChild(head);
      line.appendChild(scEl("span", "rg-skill-desc", skill.description));
      line.addEventListener("click", function () { line.classList.toggle("open"); });
      body.appendChild(line);
    });
  } else {
    body.appendChild(scEl("div", "rg-na", "Belum tersedia"));
  }
  panel.appendChild(body);

  const buy = scEl("button", "rg-buy");
  if (!selected) {
    buy.textContent = "Belum tersedia";
    buy.disabled = true;
  } else if (ownedCharacterIds.indexOf(selected.id) !== -1) { // account.js
    buy.textContent = "✅ Dimiliki";
    buy.disabled = true;
  } else {
    buy.appendChild(createCoinLabel(selected.price)); // emblems.js
    buy.disabled = playerAccount.coins < selected.price;
    if (buy.disabled) buy.title = "Koin belum cukup";
    buy.addEventListener("click", function () {
      buyCharacter(selected.id); // shop.js (sekaligus menggambar ulang Toko)
    });
  }
  panel.appendChild(buy);
  root.appendChild(panel);

  /* ===== KEDUDUKAN (tab) ===== */
  const rankBar = scEl("div", "rg-ranks");
  if (hasRanks) {
    region.ranks.forEach(function (name, i) {
      const n = i + 1;
      const count = rgCharsIn(region.id, n).length;
      const b = scEl("button", "rg-rank" + (n === rgState.rank ? " active" : "") + (count === 0 ? " locked" : ""));
      b.appendChild(scEl("span", "rg-rank-num", RG_ROMAN[i]));
      b.appendChild(scEl("span", "rg-rank-name", name));
      const lockLv = count === 0 ? rgLockLevel(region, n) : 0;
      b.appendChild(scEl("span", "rg-rank-count", count > 0 ? String(count) : (lockLv ? "🔒 Lv " + lockLv : "🔒")));
      b.addEventListener("click", function () {
        rgState.rank = n;
        rgState.selected = null;
        rgState.enter = true;
        rerender();
      });
      rankBar.appendChild(b);
    });
  } else {
    const noRankCount = rgCharsIn(region.id).length;
    const b = scEl("button", "rg-rank active" + (noRankCount === 0 ? " locked" : ""));
    b.disabled = true;
    b.appendChild(scEl("span", "rg-rank-name", noRankCount > 0 ? "Tanpa kedudukan" : "Belum tersedia"));
    b.appendChild(scEl("span", "rg-rank-count", noRankCount > 0 ? String(noRankCount) : "🔒"));
    rankBar.appendChild(b);
  }
  root.appendChild(rankBar);

  /* ===== TEMPAT (kartu karakter) ===== */
  if (inRank.length === 0) {
    const empty = scEl("div", "rg-empty");
    empty.appendChild(scEl("div", "rg-empty-lock", "🔒"));
    empty.appendChild(scEl("div", "rg-empty-title", "Belum tersedia"));
    empty.appendChild(scEl("div", "rg-empty-sub", rankName ? region.name + " · " + rankName : region.name));
    const needLv = hasRanks ? rgLockLevel(region, rgState.rank) : 0;
    if (needLv) empty.appendChild(scEl("div", "rg-empty-sub", "Terbuka di Level akun " + needLv));
    root.appendChild(empty);
  } else {
    const grid = scEl("div", "rg-grid");
    inRank.forEach(function (c, i) {
      const owned = ownedCharacterIds.indexOf(c.id) !== -1;
      const card = scEl("button", "rg-card" + (selected && c.id === selected.id ? " selected" : ""));
      card.style.setProperty("--i", String(i));
      if (c.cardBg) card.style.setProperty("--card-art", 'url("' + c.cardBg + '")'); // gambar latar kartu (opsional, characters.js)
      card.appendChild(owned ? scEl("span", "rg-badge rg-badge-own", "✓") : scEl("span", "rg-badge rg-badge-new", "BARU"));

      const portrait = scEl("div", "char-portrait rg-portrait");
      setPortrait(portrait, c); // characters.js
      card.appendChild(portrait);
      card.appendChild(scEl("div", "rg-card-name", c.name));
      card.appendChild(scEl("div", "rg-card-role", c.role));

      const foot = scEl("div", "rg-card-foot");
      foot.appendChild(scEl("span", "rg-card-rank", rankName || c.rank || "")); // Pluto: tanpa tab, pakai nama kedudukan karakter
      foot.appendChild(scEl("span", "rg-card-power", String(characterPower(c)))); // showcase.js
      card.appendChild(foot);

      card.addEventListener("click", function () {
        rgState.selected = c.id;
        rerender();
      });
      grid.appendChild(card);
    });
    root.appendChild(grid);
  }

  list.appendChild(root);
}