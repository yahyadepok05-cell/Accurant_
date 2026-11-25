/* ============================================
   ACCURANT - BAG.JS
   Tampilan tas saat pertarungan:
   - gambar ramuan (pixel art) + jumlah yang dimiliki
   - RAMUAN: tahan lama objeknya (terangkat), seret ke karakter, lepas.
       * ramuan 1 orang  : lepas di atas karakter sasaran
       * ramuan lempar   : ada lingkaran yang menunjukkan area kena;
                           ukuran lingkaran = jangkauan (2/3/4 orang)
       * lepas di kotak tas = batal (kotak tas jadi merah: "Lepas untuk membatalkan")
       * selama diseret, kartu karakter yang bisa jadi sasaran diberi garis
         putus-putus kuning kecil; kartu yang sedang terdeteksi jadi hijau
     Tap biasa pada ramuan TIDAK berlaku (harus tahan & seret).
   - ARTEFAK: tetap tap pilih (+ tap target), lalu muncul konfirmasi
     "Yakin mau memakai ini?" dengan tombol Iya / Ga jadi.

   Logika memakai item (applyItemEffect, dll) tetap di items.js.
   ============================================ */

const LONG_PRESS_MS = 320;       // tahan selama ini = ramuan terangkat
const DRAG_TOUCH_OFFSET_Y = 44;  // di layar sentuh, ramuan digeser ke atas jari supaya kelihatan

let dragState = null;
let suppressTapUntil = 0;   // setelah seret, abaikan "klik" susulan dari browser
let lastTouchTime = 0;

const SPELL_ICONS = {
  spell_execute: "🗡️",
  spell_barrier: "🛡️",
  spell_revive: "✨",
  spell_storm_stun: "❄️"
};


/* ============================================
   GAMBAR & KARTU ITEM
   ============================================ */

function createPotionImg(kind, form, extraClass) {
  const img = document.createElement("img");
  img.className = "potion-img" + (extraClass ? " " + extraClass : "");
  img.src = POTION_ART[kind][form];
  img.alt = POTION_KINDS[kind].name;
  img.draggable = false;
  return img;
}

/** Gambar untuk satu item: botol untuk ramuan, emoji untuk artefak. */
function createItemArt(item, extraClass) {
  if (item.isPotion) return createPotionImg(item.kind, item.form, extraClass);
  const span = document.createElement("span");
  span.className = "bag-emoji" + (extraClass ? " " + extraClass : "");
  span.textContent = SPELL_ICONS[item.id] || "🏺";
  return span;
}

/**
 * Kartu kecil: gambar + jumlah + nama. Dipakai di tas dan di layar racikan.
 * opts: { selected, disabled, onClick }
 */
function createItemTile(item, count, opts) {
  const o = opts || {};
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "bag-tile";
  if (o.selected) tile.classList.add("selected");
  if (o.disabled) tile.classList.add("disabled");
  tile.dataset.itemId = item.id;

  const art = document.createElement("span");
  art.className = "bag-tile-img";
  art.appendChild(createItemArt(item));
  tile.appendChild(art);

  if (item.isPotion && item.form === "splash") {
    const tag = document.createElement("span");
    tag.className = "bag-tag";
    tag.textContent = "💥" + item.range;
    tile.appendChild(tag);
  }

  const cnt = document.createElement("span");
  cnt.className = "bag-count";
  cnt.textContent = "×" + count;
  tile.appendChild(cnt);

  const name = document.createElement("span");
  name.className = "bag-name";
  name.textContent = item.shortName || item.name;
  tile.appendChild(name);

  if (o.onClick && !o.disabled) {
    tile.addEventListener("click", function () {
      if (Date.now() < suppressTapUntil) return;
      o.onClick(item);
    });
  }
  return tile;
}


/* ============================================
   PANEL TAS
   ============================================ */

/** Item lama (ramuan versi sebelum racikan) di tas diganti padanan barunya. */
function normalizePlayerInventory() {
  const hasLegacy = Object.keys(playerInventory).some(function (id) { return !!LEGACY_POTION_MAP[id]; });
  if (hasLegacy) playerInventory = migrateLegacyInventory(playerInventory);
}

function getOwnedSpellItems() {
  return ITEM_DATABASE.filter(function (item) {
    return item.category === "spell" && getInventoryCount(item.id) > 0;
  });
}

function renderBagPanel() {
  normalizePlayerInventory();

  const panel = document.getElementById("item-panel");
  const list = document.getElementById("item-list");
  const info = document.getElementById("item-info");
  list.innerHTML = "";
  list.classList.add("bag-grid");

  const owned = getOwnedPotionItems().concat(getOwnedSpellItems());

  if (owned.length === 0) {
    const empty = document.createElement("p");
    empty.className = "item-empty-note";
    empty.textContent = "Kamu belum punya item. Beli atau racik dulu di Toko.";
    list.appendChild(empty);
  }

  owned.forEach(function (item) {
    const tile = createItemTile(item, getInventoryCount(item.id), {
      selected: !!(pendingItem && pendingItem.id === item.id),
      onClick: function () {
        // Ramuan hanya bisa lewat tahan & seret (supaya ada animasi). Tap biasa tidak berlaku.
        if (item.isPotion) {
          document.getElementById("item-info").textContent = "Ramuan: tahan lalu seret ke karakter sasaran.";
          return;
        }
        onItemButtonClick(item.id);
      }
    });
    if (item.isPotion) attachPotionDrag(tile, item);
    list.appendChild(tile);
  });

  if (pendingItem) {
    info.textContent = pendingItem.name + ": " + pendingItem.description +
      (itemNeedsManualTarget(pendingItem) ? " Tap karakter sasaran." : "");
  } else {
    info.textContent = "Ramuan: tahan lalu seret ke karakter (lepas di kotak tas ini = batal). Artefak: tap lalu konfirmasi.";
  }

  // Tas muncul sebagai kotak sendiri di bawah arena (CSS); kalau sedang menutup, batalkan penutupannya
  clearTimeout(panel._closeTimer);
  panel.classList.remove("bag-closing");
  panel.classList.remove("hidden");

  const barBtn = document.getElementById("open-item-panel-btn");
  if (barBtn) barBtn.classList.add("active");
}


/* ============================================
   TAHAN & SERET RAMUAN
   ============================================ */

function attachPotionDrag(tile, item) {
  let timer = null;
  let pressed = false;
  let sx = 0;
  let sy = 0;
  let viaTouch = false;

  function start(x, y, touch) {
    pressed = true;
    sx = x;
    sy = y;
    viaTouch = touch;
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (pressed) beginPotionDrag(item, tile, sx, sy, viaTouch);
    }, LONG_PRESS_MS);
  }

  function move(x, y, ev) {
    if (dragState && dragState.tile === tile) {
      if (ev && ev.cancelable) ev.preventDefault(); // cegah halaman ikut ter-scroll
      movePotionDrag(x, y);
    } else if (pressed && Math.hypot(x - sx, y - sy) > 10) {
      pressed = false; // jari bergeser sebelum selesai menahan = scroll biasa
      clearTimeout(timer);
    }
  }

  function end(x, y, ev, cancelled) {
    clearTimeout(timer);
    pressed = false;
    if (dragState && dragState.tile === tile) {
      if (ev && ev.cancelable) ev.preventDefault(); // cegah "klik" susulan
      endPotionDrag(x, y, cancelled);
    }
  }

  // Layar sentuh. touchmove HARUS non-passive supaya bisa mencegah scroll saat seret.
  tile.addEventListener("touchstart", function (e) {
    lastTouchTime = Date.now();
    const t = e.touches[0];
    start(t.clientX, t.clientY, true);
  }, { passive: true });
  tile.addEventListener("touchmove", function (e) {
    const t = e.touches[0];
    move(t.clientX, t.clientY, e);
  }, { passive: false });
  tile.addEventListener("touchend", function (e) {
    const t = e.changedTouches[0];
    end(t.clientX, t.clientY, e, false);
  });
  tile.addEventListener("touchcancel", function (e) {
    const t = e.changedTouches[0];
    end(t.clientX, t.clientY, e, true);
  });

  // Mouse (untuk dicoba di komputer)
  tile.addEventListener("mousedown", function (e) {
    if (e.button !== 0 || Date.now() - lastTouchTime < 800) return;
    start(e.clientX, e.clientY, false);
    const onMove = function (ev) { move(ev.clientX, ev.clientY, ev); };
    const onUp = function (ev) {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      end(ev.clientX, ev.clientY, ev, false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  tile.addEventListener("contextmenu", function (e) { e.preventDefault(); });
}

function dragPoint(st) {
  return { x: st.x, y: st.y - (st.isTouch ? DRAG_TOUCH_OFFSET_Y : 0) };
}

function beginPotionDrag(item, tile, x, y, isTouch) {
  if (dragState || currentPhase !== "player" || battleEnded) return;

  if (pendingItem) { // pilihan tap sebelumnya dibatalkan
    pendingItem = null;
    renderArena();
  }

  const panel = document.getElementById("item-panel");
  const dragMsg = document.getElementById("bag-drag-msg");

  const ghost = document.createElement("div");
  ghost.className = "potion-ghost";
  ghost.appendChild(createPotionImg(item.kind, item.form, "potion-ghost-img"));
  document.body.appendChild(ghost);

  let circle = null;
  if (isAreaItem(item)) {
    circle = document.createElement("div");
    circle.className = "drop-circle";
    document.body.appendChild(circle);
  }

  dragState = {
    item: item, tile: tile, isTouch: isTouch, x: x, y: y,
    ghost: ghost, circle: circle, panel: panel, dragMsg: dragMsg,
    cancelState: null, raf: 0
  };

  tile.classList.add("bag-tile-lifted");
  panel.classList.add("bag-dragging");
  setBagDragMessage(dragState, false);

  // Semua kartu yang boleh jadi sasaran: garis putus-putus kuning kecil
  const validIds = getValidItemTargets(item).map(function (u) { return u.id; }); // items.js
  document.querySelectorAll(".char-slot").forEach(function (slot) {
    if (validIds.indexOf(slot.dataset.unitId) !== -1) slot.classList.add("drag-valid");
  });

  if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* abaikan */ } }
  dragState.raf = requestAnimationFrame(dragFrame);
}

function movePotionDrag(x, y) {
  if (!dragState) return;
  dragState.x = x;
  dragState.y = y;
}

/**
 * Menentukan unit yang terkena kalau ramuan dilepas di titik (x, y).
 * - 1 orang : slot yang ditunjuk.
 * - area    : unit yang titik tengahnya berada dalam lingkaran. Jari-jari
 *             = jangkauan x jarak antar-slot / 2 (sedikit dikecilkan), jadi
 *             jangkauan 2 pas di antara 2 karakter, 3 pas di karakter tengah, dst.
 */
function computeDropTargets(item, x, y) {
  const team = itemTargetTeam(item);
  const container = document.getElementById(team === "player" ? "player-slots" : "enemy-slots");
  const slots = Array.prototype.slice.call(container.querySelectorAll(".char-slot"));
  if (slots.length === 0) return { targets: [], pitch: 80 };

  const rects = slots.map(function (s) { return s.getBoundingClientRect(); });
  const colRect = container.getBoundingClientRect();
  const pitch = rects.length > 1 ? (rects[1].top - rects[0].top) : rects[0].height + 10;
  const inColumn = x >= colRect.left - 30 && x <= colRect.right + 30;
  const validIds = getValidItemTargets(item).map(function (u) { return u.id; });
  const targets = [];

  if (inColumn) {
    const radius = item.areaSize * pitch / 2 * 0.98;
    slots.forEach(function (slot, i) {
      const id = slot.dataset.unitId;
      if (validIds.indexOf(id) === -1) return;
      const r = rects[i];
      const hit = isAreaItem(item)
        ? Math.abs((r.top + r.height / 2) - y) < radius
        : (y >= r.top - 4 && y <= r.bottom + 4);
      if (hit) targets.push(getUnitById(id));
    });
  }
  return { targets: targets, pitch: pitch };
}

function dragFrame() {
  const st = dragState;
  if (!st) return;

  const pt = dragPoint(st);
  st.ghost.style.left = pt.x + "px";
  st.ghost.style.top = pt.y + "px";

  // Zona batal = panel tas di sisi kanan (lepas di sana = batal). Halaman tidak bergulir.
  const pr = st.panel.getBoundingClientRect();
  const inCancelZone = st.x >= pr.left && st.x <= pr.right && st.y >= pr.top && st.y <= pr.bottom;
  const res = inCancelZone ? { targets: [], pitch: 80 } : computeDropTargets(st.item, pt.x, pt.y);

  if (st.circle) {
    const diameter = st.item.areaSize * res.pitch * 0.98;
    st.circle.style.width = diameter + "px";
    st.circle.style.height = diameter + "px";
    st.circle.style.left = pt.x + "px";
    st.circle.style.top = pt.y + "px";
    st.circle.classList.toggle("hit", res.targets.length > 0);
    st.circle.classList.toggle("hidden", inCancelZone);
  }

  const hitIds = res.targets.map(function (u) { return u.id; });
  document.querySelectorAll(".char-slot").forEach(function (slot) {
    slot.classList.toggle("drop-hover", hitIds.indexOf(slot.dataset.unitId) !== -1);
  });

  st.panel.classList.toggle("bag-cancel-active", inCancelZone);
  setBagDragMessage(st, inCancelZone);

  st.raf = requestAnimationFrame(dragFrame);
}

/** Tulisan di atas kotak tas saat ramuan diseret (hanya diganti kalau berubah). */
function setBagDragMessage(st, inCancelZone) {
  if (!st || !st.dragMsg || st.cancelState === inCancelZone) return;
  st.cancelState = inCancelZone;
  st.dragMsg.textContent = inCancelZone ? "Lepas untuk membatalkan" : "⬇ Lepas di sini untuk batal";
}

function clearDragMarks() {
  document.querySelectorAll(".char-slot.drag-valid, .char-slot.drop-hover").forEach(function (slot) {
    slot.classList.remove("drag-valid", "drop-hover");
  });
}

function endPotionDrag(x, y, cancelled) {
  const st = dragState;
  if (!st) return;
  dragState = null;
  cancelAnimationFrame(st.raf);

  st.x = x;
  st.y = y;
  const pt = dragPoint(st);
  const pr = st.panel.getBoundingClientRect();
  const inCancelZone = cancelled || (x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom);
  const res = inCancelZone ? { targets: [] } : computeDropTargets(st.item, pt.x, pt.y);

  clearDragMarks();
  if (st.circle) st.circle.remove();
  st.tile.classList.remove("bag-tile-lifted");
  st.panel.classList.remove("bag-dragging", "bag-cancel-active");
  if (st.dragMsg) st.dragMsg.textContent = "";
  suppressTapUntil = Date.now() + 450;

  if (res.targets.length > 0) {
    // Berhasil: botol "pecah" di tempat, lalu efeknya dipakai
    st.ghost.classList.add("potion-ghost-pop");
    setTimeout(function () { st.ghost.remove(); }, 260);
    resolveItemOnTargets(st.item, res.targets); // items.js
  } else {
    // Batal / meleset: botol terbang kembali ke tas
    const r = st.tile.getBoundingClientRect();
    st.ghost.style.transition = "left 0.25s ease, top 0.25s ease, opacity 0.25s ease";
    st.ghost.style.left = (r.left + r.width / 2) + "px";
    st.ghost.style.top = (r.top + r.height / 2) + "px";
    st.ghost.style.opacity = "0";
    setTimeout(function () { st.ghost.remove(); }, 280);
    renderArena();
  }
}


/* ============================================
   KONFIRMASI "YAKIN MAU MEMAKAI INI?" (artefak)
   ============================================ */

function showUseConfirm(text, onYes, onNo) {
  const modal = document.getElementById("confirm-modal");
  const yes = document.getElementById("confirm-yes-btn");
  const no = document.getElementById("confirm-no-btn");
  document.getElementById("confirm-text").textContent = text;

  // Pasang ulang tombol (clone) supaya listener lama tidak menumpuk
  const yesNew = yes.cloneNode(true);
  const noNew = no.cloneNode(true);
  yes.parentNode.replaceChild(yesNew, yes);
  no.parentNode.replaceChild(noNew, no);

  yesNew.addEventListener("click", function () {
    modal.classList.add("hidden");
    onYes();
  });
  noNew.addEventListener("click", function () {
    modal.classList.add("hidden");
    onNo();
  });
  modal.classList.remove("hidden");
}
