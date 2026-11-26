/* ============================================
   ACCURANT - SHOP.JS
   Layar Toko: menampilkan Ramuan & Artefak, dan logika
   pembelian memakai koin dari akun pemain.
   ============================================ */

function getCategoryLabel(category) {
  if (category === "potion") return "🧪 Ramuan";
  if (category === "spell") return "🏺 Artefak";
  return category;
}

function buyItem(itemId) {
  const item = getItemById(itemId);
  if (!item) return;
  if (playerAccount.coins < item.price) return; // jaga-jaga, tombol harusnya sudah disabled

  playerAccount.coins -= item.price;
  playerInventory[itemId] = getInventoryCount(itemId) + 1;
  if (typeof saveGame === "function") saveGame(); // storage.js

  updateAccountBar();
  renderShopScreen(); // refresh supaya harga/tombol ter-update
}

function buyCharacter(characterId) {
  const character = CHARACTER_DATABASE.find(function (c) { return c.id === characterId; });
  if (!character || !character.elite) return;
  if (ownedCharacterIds.indexOf(characterId) !== -1) return;
  if (playerAccount.coins < character.price) return;

  playerAccount.coins -= character.price;
  ownedCharacterIds.push(characterId);
  if (typeof saveGame === "function") saveGame(); // storage.js

  updateAccountBar();
  renderShopScreen();
}


/* ============================================
   TOKO: MENU UTAMA (Racikan / Artefak / Karakter)
   shopView: "hub" | "craft" | "artifact" | "character"
   ============================================ */
let shopView = "hub";

function resetShopView() {
  shopView = "hub";
}

function openShopView(view) {
  shopView = view;
  renderShopScreen();
  window.scrollTo(0, 0);
}

/** Tombol kembali: dari sub-menu ke menu Toko, dari menu Toko ke Beranda. */
function onShopBack() {
  if (shopView !== "hub") {
    openShopView("hub");
  } else {
    goToHomeScreen(); // main.js
  }
}

function renderShopHub(list) {
  const entries = [
    { view: "craft", label: "Racikan", icon: createPotionImg("heal", "drink", "shop-hub-potion") }, // bag.js
    { view: "artifact", label: "Artefak", icon: "🗡️" },
    { view: "character", label: "Karakter", icon: null } // sengaja tanpa gambar
  ];

  entries.forEach(function (entry) {
    const btn = document.createElement("button");
    btn.className = "shop-hub-btn";
    if (entry.icon) {
      const iconBox = document.createElement("span");
      iconBox.className = "shop-hub-icon";
      if (typeof entry.icon === "string") iconBox.textContent = entry.icon;
      else iconBox.appendChild(entry.icon);
      btn.appendChild(iconBox);
    }
    const label = document.createElement("span");
    label.className = "shop-hub-label";
    label.textContent = entry.label;
    btn.appendChild(label);
    btn.addEventListener("click", function () { openShopView(entry.view); });
    list.appendChild(btn);
  });
}

function renderArtifactShop(list) {
  const header = document.createElement("div");
  header.className = "shop-category-label";
  header.textContent = getCategoryLabel("spell");
  list.appendChild(header);

  const itemsInCategory = ITEM_DATABASE.filter(function (i) { return i.category === "spell"; });

  itemsInCategory.forEach(function (item) {
    const card = document.createElement("div");
    card.className = "shop-card";

    const name = document.createElement("div");
    name.className = "shop-card-name";
    name.textContent = item.name;

    const desc = document.createElement("div");
    desc.className = "shop-card-desc";
    desc.textContent = item.description;

    const footer = document.createElement("div");
    footer.className = "shop-card-footer";

    const owned = document.createElement("span");
    owned.className = "shop-card-owned";
    owned.textContent = "Dimiliki: " + getInventoryCount(item.id);

    const buyBtn = document.createElement("button");
    buyBtn.className = "shop-buy-btn";
    buyBtn.appendChild(createCoinLabel(item.price)); // emblems.js
    buyBtn.disabled = playerAccount.coins < item.price;
    buyBtn.addEventListener("click", function () {
      buyItem(item.id);
    });

    footer.appendChild(owned);
    footer.appendChild(buyBtn);

    card.appendChild(name);
    card.appendChild(desc);
    card.appendChild(footer);
    list.appendChild(card);
  });
}

function renderShopScreen() {
  const list = document.getElementById("shop-list");
  list.innerHTML = "";

  const backBtn = document.getElementById("shop-back-btn");
  if (backBtn) backBtn.textContent = shopView === "hub" ? "← Beranda" : "← Toko";

  if (shopView === "craft") {
    renderCraftView(list); // craft.js
  } else if (shopView === "artifact") {
    renderArtifactShop(list);
  } else if (shopView === "character") {
    renderEliteCharacterShop(list);
  } else {
    renderShopHub(list);
  }
}
