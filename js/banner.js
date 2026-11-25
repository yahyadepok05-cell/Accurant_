/* ============================================
   ACCURANT - BANNER.JS
   Banner animasi di bagian ATAS arena saat pertarungan, bergaya
   dark fantasy (pita baja bertepi lancip, garis emas, kilau pedang):
   - Karakter kalah : "<pemenang> MENGALAHKAN <korban>"
       * biru-emas = timmu yang mengalahkan musuh
       * merah     = musuh yang mengalahkan karakter timmu
       * abu       = tumbang tanpa lawan jelas (racun, bakar, es pecah)
   - Artefak       : salah satu pihak membangkitkan Artefak.
       * ungu-emas      = timmu
       * merah-oranye   = musuh

   Banner tidak menghalangi sentuhan (pointer-events: none) dan tidak
   menghentikan jalannya pertarungan. Beberapa banner sekaligus
   diantre: muncul bergantian dengan jeda singkat (maks. 3 tampil
   bersamaan). Gayanya ada di css/arena-ui.css (kelas .ab-*).

   Fungsi yang dipanggil dari file lain:
   - announceKill(victim, source)  -> battle.js (applyDamage)
   - announceArtifact(item, team)  -> items.js & enemyAI.js
   - clearBanners()                -> battle.js (initBattle)
   ============================================ */

const BANNER_LIFE_MS = 2600;  // lama satu banner ada di layar
const BANNER_GAP_MS = 340;    // jeda antar banner yang diantre
const BANNER_MAX_VISIBLE = 3; // maksimal banner tampil bersamaan

let bannerQueue = [];
let bannerPumpTimer = null;
let bannerLastShown = 0;

function getBannerLayer() {
  let layer = document.getElementById("banner-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "banner-layer";
    layer.className = "banner-layer";
    document.body.appendChild(layer);
  }
  return layer;
}

function enqueueBanner(el) {
  bannerQueue.push(el);
  pumpBanners();
}

function pumpBanners() {
  if (bannerQueue.length === 0 || bannerPumpTimer) return;

  const layer = getBannerLayer();
  const wait = Math.max(0, bannerLastShown + BANNER_GAP_MS - Date.now());
  const full = layer.children.length >= BANNER_MAX_VISIBLE;

  if (wait > 0 || full) {
    bannerPumpTimer = setTimeout(function () {
      bannerPumpTimer = null;
      pumpBanners();
    }, full ? 300 : wait);
    return;
  }

  const el = bannerQueue.shift();
  layer.appendChild(el);
  bannerLastShown = Date.now();
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, BANNER_LIFE_MS);
  pumpBanners(); // kalau masih ada antrean, jadwalkan berikutnya
}

/** Dipanggil di awal pertarungan baru supaya banner lama tidak terbawa. */
function clearBanners() {
  bannerQueue = [];
  clearTimeout(bannerPumpTimer);
  bannerPumpTimer = null;
  const layer = document.getElementById("banner-layer");
  if (layer) layer.innerHTML = "";
}


/* ============================================
   BANNER KARAKTER TERBUNUH
   ============================================ */

function makeBannerPortrait(unit, extraClass) {
  const wrap = document.createElement("div");
  wrap.className = "sb-portrait" + (extraClass ? " " + extraClass : "");
  if (unit && typeof setPortrait === "function") {
    setPortrait(wrap, unit); // characters.js (gambar / ikon svg / emoji)
  } else {
    wrap.textContent = "☠️";
  }
  return wrap;
}

function makeBannerText(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

/* Ikon garis (SVG) supaya tidak bergantung pada emoji */
const BANNER_ICON_SWORDS =
  '<svg class="sb-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 4.5 15 15M19.5 4.5 9 15M13 17l4 4M11 17l-4 4M15.5 13.5l2.5 2.5M8.5 13.5 6 16"/></svg>';
const BANNER_ICON_SKULL =
  '<svg class="sb-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11a7 7 0 1 1 14 0c0 2-1 3.2-2 4v3H7v-3c-1-.8-2-2-2-4ZM9.5 11.5h.01M14.5 11.5h.01M10 18v2M14 18v2"/></svg>';
const BANNER_ICON_RUNE =
  '<svg class="sb-svg sb-rune" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" stroke-dasharray="2.5 2.5"/><path d="M12 3.5 19 12 12 20.5 5 12Z"/><circle cx="12" cy="12" r="2"/></svg>';

function makeBannerSvg(className, svg) {
  const span = document.createElement("span");
  span.className = className;
  span.innerHTML = svg;
  return span;
}

/* ----- Rangka banner arena (dipakai banner kill & artefak) ----- */

function makeArenaPortrait(unit, extraClass) {
  const wrap = document.createElement("div");
  wrap.className = "ab-portrait" + (extraClass ? " " + extraClass : "");
  if (unit && typeof setPortrait === "function") {
    setPortrait(wrap, unit); // characters.js (gambar / ikon svg / emoji)
  } else {
    wrap.textContent = "☠️";
  }
  return wrap;
}

function makeArenaBanner(variantClass) {
  const banner = document.createElement("div");
  banner.className = "ab " + variantClass;

  const plate = document.createElement("div");
  plate.className = "ab-plate";
  const fill = document.createElement("div");
  fill.className = "ab-fill";
  const shine = document.createElement("div");
  shine.className = "ab-shine";
  fill.appendChild(shine);
  plate.appendChild(fill);
  banner.appendChild(plate);

  const slash = document.createElement("div");
  slash.className = "ab-slash";
  banner.appendChild(slash);

  const embers = document.createElement("div");
  embers.className = "ab-embers";
  for (let i = 0; i < 7; i++) {
    const e = document.createElement("span");
    e.className = "ab-ember";
    e.style.left = (6 + Math.random() * 88).toFixed(0) + "%";
    e.style.setProperty("--d", (1.4 + Math.random() * 1.2).toFixed(2) + "s");
    e.style.setProperty("--dl", (0.3 + Math.random() * 1.2).toFixed(2) + "s");
    e.style.setProperty("--x", ((Math.random() - 0.5) * 24).toFixed(0) + "px");
    embers.appendChild(e);
  }
  banner.appendChild(embers);

  const body = document.createElement("div");
  body.className = "ab-body";
  banner.appendChild(body);

  return { banner: banner, body: body };
}

/**
 * @param {object} victim - unit yang baru saja kalah
 * @param {object|null} source - unit pemenang, ATAU { team, label } untuk
 *        item (mis. Artefak Eksekusi), ATAU null kalau tidak ada lawan
 */
function announceKill(victim, source) {
  if (!victim) return;

  const variant = !source ? "ab-neutral" : (source.team === "player" ? "ab-ally" : "ab-foe");
  const shell = makeArenaBanner("ab-kill " + variant);

  // Kiri: pemenang
  const left = document.createElement("div");
  left.className = "ab-side ab-killer";
  if (source && source.label) {
    // Pemenangnya item/artefak, bukan karakter
    left.appendChild(makeBannerText("ab-item-mini", source.icon || "✨"));
    left.appendChild(makeBannerText("ab-name", source.label));
  } else if (source) {
    left.appendChild(makeArenaPortrait(source, "ab-portrait-killer"));
    left.appendChild(makeBannerText("ab-name", source.name));
  } else {
    left.appendChild(makeBannerSvg("ab-skull", BANNER_ICON_SKULL));
  }

  // Tengah: pedang bersilang + kata kerja
  const mid = document.createElement("div");
  mid.className = "ab-mid";
  mid.appendChild(makeBannerSvg("ab-blades", source ? BANNER_ICON_SWORDS : BANNER_ICON_SKULL));
  mid.appendChild(makeBannerText("ab-verb", source ? "MENGALAHKAN" : "TUMBANG"));
  mid.appendChild(makeBannerText("ab-rule", ""));

  // Kanan: yang dikalahkan
  const right = document.createElement("div");
  right.className = "ab-side ab-victim";
  right.appendChild(makeBannerText("ab-name", victim.name));
  right.appendChild(makeArenaPortrait(victim, "ab-dead"));

  shell.body.appendChild(left);
  shell.body.appendChild(mid);
  shell.body.appendChild(right);
  enqueueBanner(shell.banner);
}


/* ============================================
   BANNER ARTEFAK DIBANGKITKAN
   Bukan lagi "peringatan": pita arena dengan lingkaran rune yang
   berputar, nama artefak besar, dan lencana pihak pemakai.
   ============================================ */

/**
 * @param {object} item - item artefak yang dipakai
 * @param {"player"|"enemy"} team - pihak yang memakai
 */
function announceArtifact(item, team) {
  if (!item) return;

  const isEnemy = team === "enemy";
  const shell = makeArenaBanner("ab-artifact " + (isEnemy ? "ab-foe" : "ab-ally"));

  const icon = (typeof SPELL_ICONS !== "undefined" && SPELL_ICONS[item.id]) || "🏺"; // bag.js

  const left = makeBannerSvg("ab-sigil", BANNER_ICON_RUNE);

  const mid = document.createElement("div");
  mid.className = "ab-mid ab-mid-col";
  mid.appendChild(makeBannerText("ab-tag", isEnemy ? "MUSUH" : "TIMMU"));
  mid.appendChild(makeBannerText("ab-title", item.name));
  mid.appendChild(makeBannerText("ab-sub", "ARTEFAK DIBANGKITKAN"));

  const right = makeBannerText("ab-item", icon);

  shell.body.appendChild(left);
  shell.body.appendChild(mid);
  shell.body.appendChild(right);
  enqueueBanner(shell.banner);
}
