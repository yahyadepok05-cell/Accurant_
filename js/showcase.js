/* ============================================
   ACCURANT - SHOWCASE.JS
   Tampilan etalase karakter, dipakai Toko (mode "shop") dan
   Koleksi (mode "collection"). Susunannya (versi layar tegak):

     [ TAB ]        -> kelompok karakter (geser ke samping)
     [ PANEL ]      -> lambang/gambar + stat + daftar skill + tombol BELI
     [ KARTU ... ]  -> kotak-kotak karakter, tap untuk memilih

   Data diambil dari characters.js; pembelian lewat buyCharacter (shop.js).
   ============================================ */

// Ingat tab & karakter terpilih supaya tidak reset waktu layar digambar ulang.
const showcaseState = {
  shop: { tab: "all", selected: null },
  collection: { tab: "all", selected: null } // Koleksi hanya berisi Kesatria, tanpa tab
};

const SHOWCASE_STATS = [
  { key: "maxHP", label: "HP" },
  { key: "maxMana", label: "Mana" },
  { key: "attack", label: "ATK" },
  { key: "defense", label: "DEF" },
  { key: "speed", label: "SPD" }
];

function showcaseTabs(mode) {
  if (mode === "shop") {
    return [
      { key: "all", label: "Semua" },
      { key: "new", label: "Belum dimiliki" },
      { key: "owned", label: "Dimiliki" }
    ];
  }
  return []; // Koleksi: hanya Kesatria elit, tidak perlu filter
}

function showcaseList(mode, tab) {
  const all = mode === "shop"
    ? CHARACTER_DATABASE.filter(function (c) { return c.elite; })
    : getAvailableCharacters();
  return all.filter(function (c) {
    const owned = ownedCharacterIds.indexOf(c.id) !== -1;
    if (tab === "new") return !owned;
    if (tab === "owned") return owned;
    if (tab === "base") return !c.elite;
    if (tab === "elite") return !!c.elite;
    return true;
  });
}

/** Angka "kekuatan" ringkas untuk lencana di kartu (hanya tampilan). */
function characterPower(c) {
  return Math.round(c.maxHP / 10 + c.attack + c.defense / 2 + c.speed / 2);
}

function rarityOf(c) {
  return c.elite ? { label: "ELIT", cls: "rar-elite" } : { label: "UMUM", cls: "rar-base" };
}

function statMax(key) {
  return Math.max.apply(null, CHARACTER_DATABASE.map(function (c) { return c[key]; }));
}

function scEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function buildShowcasePanel(character, mode, rerender) {
  const panel = scEl("div", "sc-panel");
  const rar = rarityOf(character);
  const owned = ownedCharacterIds.indexOf(character.id) !== -1;

  // Kiri: lambang / gambar karakter + label kelangkaan
  const left = scEl("div", "sc-panel-left");
  const emblem = scEl("div", "sc-emblem");
  setPortrait(emblem, character); // characters.js
  left.appendChild(emblem);
  left.appendChild(scEl("div", "sc-rarity " + rar.cls, rar.label));

  // Kanan: nama + bar stat
  const right = scEl("div", "sc-panel-right");
  right.appendChild(scEl("div", "sc-name", character.name));
  right.appendChild(scEl("div", "sc-role", character.role));
  SHOWCASE_STATS.forEach(function (st) {
    const row = scEl("div", "sc-stat");
    row.appendChild(scEl("span", "sc-stat-label", st.label));
    const bar = scEl("span", "sc-stat-bar");
    const fill = scEl("span", "sc-stat-fill");
    fill.style.width = Math.max(4, Math.round(character[st.key] / statMax(st.key) * 100)) + "%";
    bar.appendChild(fill);
    row.appendChild(bar);
    row.appendChild(scEl("span", "sc-stat-val", String(character[st.key])));
    right.appendChild(row);
  });

  const top = scEl("div", "sc-panel-top");
  top.appendChild(left);
  top.appendChild(right);
  panel.appendChild(top);

  // Keterangan skill
  const skills = scEl("div", "sc-skills");
  character.skills.forEach(function (skill) {
    const line = scEl("div", "sc-skill");
    line.appendChild(scEl("span", "sc-skill-name", skill.name));
    line.appendChild(scEl("span", "sc-skill-meta", skill.manaCost + " mana · " + getTargetLabel(skill.target))); // battle.js
    skills.appendChild(line);
  });
  panel.appendChild(skills);

  // Tombol beli (hanya di Toko)
  if (mode === "shop") {
    const buy = scEl("button", "sc-buy");
    if (owned) {
      buy.textContent = "✅ Dimiliki";
    } else {
      buy.appendChild(createCoinLabel(character.price)); // emblems.js
    }
    buy.disabled = owned || playerAccount.coins < character.price;
    buy.addEventListener("click", function () {
      buyCharacter(character.id); // shop.js (sekaligus menggambar ulang Toko)
    });
    panel.appendChild(buy);
  }
  return panel;
}

function buildShowcaseCard(character, mode, selected, onPick) {
  const owned = ownedCharacterIds.indexOf(character.id) !== -1;
  const rar = rarityOf(character);
  const card = scEl("button", "sc-card" + (selected ? " selected" : ""));

  if (mode === "shop" && !owned) card.appendChild(scEl("span", "sc-badge sc-badge-new", "BARU"));
  if (mode === "shop" && owned) card.appendChild(scEl("span", "sc-badge sc-badge-own", "✓"));

  const portrait = scEl("div", "char-portrait sc-card-portrait");
  setPortrait(portrait, character);
  card.appendChild(portrait);
  card.appendChild(scEl("div", "sc-card-name", character.name));
  const foot = scEl("div", "sc-card-foot");
  foot.appendChild(scEl("span", "sc-card-rar " + rar.cls, rar.label));
  foot.appendChild(scEl("span", "sc-card-power", String(characterPower(character))));
  card.appendChild(foot);

  card.addEventListener("click", onPick);
  return card;
}

/**
 * Menggambar etalase ke dalam container.
 * @param {HTMLElement} container
 * @param {"shop"|"collection"} mode
 */
function renderShowcase(container, mode) {
  if (mode === "collection") {
    renderCollectionCards(container); // tampilan kartu tinggi (di bawah)
    return;
  }
  const state = showcaseState[mode];
  container.innerHTML = "";

  // Semua isi dibungkus .sc-root supaya CSS landscape bisa menyusunnya
  // jadi dua kolom (panel di kiri, tab + kartu di kanan).
  const root = scEl("div", "sc-root");
  container.appendChild(root);

  const rerender = function () { renderShowcase(container, mode); };

  // Tab
  const tabs = scEl("div", "sc-tabs");
  showcaseTabs(mode).forEach(function (t) {
    const b = scEl("button", "sc-tab" + (state.tab === t.key ? " active" : ""), t.label);
    b.addEventListener("click", function () {
      state.tab = t.key;
      state.selected = null;
      rerender();
    });
    tabs.appendChild(b);
  });
  root.appendChild(tabs);

  const list = showcaseList(mode, state.tab);
  if (list.length === 0) {
    root.appendChild(scEl("p", "sc-empty", "Belum punya Kesatria. Beli dulu di Toko."));
    return;
  }

  let selected = list.find(function (c) { return c.id === state.selected; });
  if (!selected) {
    selected = list[0];
    state.selected = selected.id;
  }

  root.appendChild(buildShowcasePanel(selected, mode, rerender));

  const grid = scEl("div", "sc-grid");
  list.forEach(function (c) {
    grid.appendChild(buildShowcaseCard(c, mode, c.id === selected.id, function () {
      state.selected = c.id;
      rerender();
    }));
  });
  root.appendChild(grid);
}


/* ============================================
   KOLEKSI: kartu tinggi berjajar ke samping (geser kiri/kanan).
   Filter cuma 2 (Dasar / Kesatria), ditaruh di bar atas layar
   (#collection-tabs di index.html). Tiap kartu berisi gambar, nama,
   stat, dan daftar skill (daftar skill bisa digulir di dalam kartu).
   Toko Karakter tetap memakai etalase lama di atas.
   ============================================ */
function buildCollectionCard(character) {
  const rar = rarityOf(character);
  const card = scEl("div", "col-card " + (character.elite ? "col-elite" : "col-base"));

  // Kepala kartu: gambar di kiri; label kelangkaan, nama, peran di kanan
  const head = scEl("div", "col-head");
  const wrap = scEl("div", "col-portrait-wrap");
  const portrait = scEl("div", "char-portrait col-portrait");
  setPortrait(portrait, character); // characters.js
  wrap.appendChild(portrait);
  head.appendChild(wrap);

  const headText = scEl("div", "col-head-text");
  headText.appendChild(scEl("div", "sc-rarity " + rar.cls, rar.label));
  headText.appendChild(scEl("div", "col-name", character.name));
  headText.appendChild(scEl("div", "col-role", character.role));
  head.appendChild(headText);
  card.appendChild(head);

  const stats = scEl("div", "col-stats");
  SHOWCASE_STATS.forEach(function (st) {
    const row = scEl("div", "sc-stat");
    row.appendChild(scEl("span", "sc-stat-label", st.label));
    const bar = scEl("span", "sc-stat-bar");
    const fill = scEl("span", "sc-stat-fill");
    fill.style.width = Math.max(4, Math.round(character[st.key] / statMax(st.key) * 100)) + "%";
    bar.appendChild(fill);
    row.appendChild(bar);
    row.appendChild(scEl("span", "sc-stat-val", String(character[st.key])));
    stats.appendChild(row);
  });
  card.appendChild(stats);

  const skills = scEl("div", "col-skills");
  character.skills.forEach(function (skill) {
    const line = scEl("div", "col-skill");
    line.appendChild(scEl("span", "col-skill-name", skill.name));
    line.appendChild(scEl("span", "col-skill-meta", skill.manaCost + " mana · " + getTargetLabel(skill.target))); // battle.js
    skills.appendChild(line);
  });
  card.appendChild(skills);
  return card;
}

function renderCollectionCards(container) {
  const state = showcaseState.collection;
  container.innerHTML = "";

  // Filter: di bar atas kalau ada #collection-tabs, kalau tidak di atas kartu.
  const tabsHost = document.getElementById("collection-tabs");
  const tabs = scEl("div", "sc-tabs col-tabs-inner");
  showcaseTabs("collection").forEach(function (t) {
    const b = scEl("button", "sc-tab" + (state.tab === t.key ? " active" : ""), t.label);
    b.addEventListener("click", function () {
      state.tab = t.key;
      renderCollectionCards(container);
    });
    tabs.appendChild(b);
  });
  if (tabsHost) {
    tabsHost.innerHTML = "";
    tabsHost.appendChild(tabs);
  } else {
    container.appendChild(tabs);
  }

  const list = showcaseList("collection", state.tab);
  if (list.length === 0) {
    container.appendChild(scEl("p", "sc-empty col-empty", "Belum punya Kesatria. Beli dulu di Toko."));
    return;
  }

  const row = scEl("div", "col-row");
  list.forEach(function (c) { row.appendChild(buildCollectionCard(c)); });
  container.appendChild(row);
}
