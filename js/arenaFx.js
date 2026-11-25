/* ============================================
   ACCURANT ARENA - ARENAFX.JS
   Animasi arena bergerak (digambar di <canvas>, tanpa file gambar):

   1. LATAR HIDUP  : siluet reruntuhan kastil berlapis (parallax), kabut yang
                     mengalir, bara api melayang, lingkaran rune di lantai yang
                     berputar & berdenyut, kilat di kejauhan, cahaya obor.
   2. EFEK SKILL   : tiap karakter punya ELEMEN (dari nama sistem kekuatannya):
                     api, es, petir, alam, air, bayangan, cahaya, angin, darah,
                     besi. Proyektil, ledakan, dan partikel mengikuti elemen itu.
   3. SKILL 6      : sorotan sinematik (layar meredup, nama skill muncul besar,
                     kamera sedikit mendekat), ledakan lebih besar.

   Logika pertarungan TIDAK disentuh: berkas ini hanya mendengarkan runSkill
   (lewat fighters.js) lalu menggambar efeknya. Kalau berkas ini tidak termuat,
   fighters.js memakai efek bawaannya sendiri.

   Hemat baterai: hanya menggambar saat layar arena tampil, dan mengikuti
   pengaturan "kurangi gerakan" di HP (prefers-reduced-motion).
   ============================================ */

(function () {
  "use strict";

  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var MAX_PARTICLES = REDUCED ? 80 : 420;

  /* ---------- ELEMEN tiap karakter ---------- */
  var ELEMENTS = {
    fire:      { core: "#fff1c2", main: "#ff7a2a", dark: "#b8260b", glow: "rgba(255,120,40,", kind: "flame" },
    ice:       { core: "#ffffff", main: "#9fe3ff", dark: "#3d8fd1", glow: "rgba(150,220,255,", kind: "shard" },
    lightning: { core: "#ffffff", main: "#ffe95a", dark: "#7a6cff", glow: "rgba(255,240,120,", kind: "bolt" },
    nature:    { core: "#f4ffd6", main: "#7be06a", dark: "#2f8a3a", glow: "rgba(130,230,110,", kind: "leaf" },
    water:     { core: "#e6fbff", main: "#4fb8ff", dark: "#1f5fbf", glow: "rgba(80,180,255,", kind: "drop" },
    shadow:    { core: "#e9d6ff", main: "#9a5cff", dark: "#2a0f4f", glow: "rgba(150,90,255,", kind: "wisp" },
    light:     { core: "#ffffff", main: "#fff2a8", dark: "#e0a83a", glow: "rgba(255,240,170,", kind: "star" },
    wind:      { core: "#ffffff", main: "#cfeee6", dark: "#6fa89a", glow: "rgba(210,240,230,", kind: "streak" },
    blood:     { core: "#ffd0d0", main: "#ff3d4f", dark: "#6e0414", glow: "rgba(255,60,80,", kind: "drop" },
    metal:     { core: "#ffffff", main: "#ffd27a", dark: "#8a6a3a", glow: "rgba(255,210,130,", kind: "spark" }
  };
  // Kata kunci di nama sistem kekuatan / nama karakter -> elemen (urutan = prioritas)
  var ELEMENT_RULES = [
    ["blood", /darah|blood/i],
    ["fire", /api|lahar|volcano|ledakan|mesiu|train|kereta/i],
    ["ice", /es\b|salju|ice|kristal|kutub/i],
    ["lightning", /petir|lightning|elektro|guruh|halilintar/i],
    ["shadow", /bayangan|hitam|kutukan|darkness|black ?hole|jiwa|gravitasi|obsidian|skala|segel/i],
    ["light", /cahaya|bintang|bulan|cermin|suci|sakura|cinta/i],
    ["water", /air|tinta|raksa|ombak|weather/i],
    ["nature", /daun|bunga|anggrek|orchid|bambu|binatang|serangga|slime|ular|duri/i],
    ["wind", /angin|uap|pasir|asap/i]
  ];
  var elementCache = {};
  function elementOf(unit) {
    if (!unit) return ELEMENTS.metal;
    var key = unit.characterId || unit.id;
    if (elementCache[key]) return ELEMENTS[elementCache[key]];
    var text = (unit.role || "") + " " + (unit.powerSystem || "") + " " + (unit.name || "");
    var ch = (typeof CHARACTER_DATABASE !== "undefined") && CHARACTER_DATABASE.find(function (c) { return c.name === unit.name; });
    if (ch) text = (ch.role || "") + " " + text;
    var found = "metal";
    for (var i = 0; i < ELEMENT_RULES.length; i++) {
      if (ELEMENT_RULES[i][1].test(text)) { found = ELEMENT_RULES[i][0]; break; }
    }
    elementCache[key] = found;
    return ELEMENTS[found];
  }

  /* ---------- kanvas ---------- */
  var bgCanvas = null, bgCtx = null, fxCanvas = null, fxCtx = null;
  var W = 0, H = 0;

  function makeCanvas(id, parent, css) {
    var c = document.createElement("canvas");
    c.id = id;
    c.setAttribute("aria-hidden", "true");
    c.style.cssText = css;
    parent.appendChild(c);
    return c;
  }

  function ensureCanvases() {
    if (!bgCanvas) {
      var arenaBg = document.querySelector(".bg-arena");
      if (!arenaBg) return false;
      bgCanvas = makeCanvas("arena-bg-canvas", arenaBg, "position:absolute;inset:0;width:100%;height:100%;");
      bgCtx = bgCanvas.getContext("2d");
    }
    if (!fxCanvas) {
      fxCanvas = makeCanvas("arena-fx-canvas", document.body, "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:45;");
      fxCtx = fxCanvas.getContext("2d");
    }
    return true;
  }

  function resize() {
    if (!ensureCanvases()) return;
    W = window.innerWidth; H = window.innerHeight;
    [bgCanvas, fxCanvas].forEach(function (c) {
      c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
    });
    bgCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fxCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildSkyline();
    staticLayer = null; vignette = null; // digambar ulang di frame berikutnya
  }

  function battleShown() {
    return document.body.dataset.scene === "battle";
  }

  /* =====================================================
     1. LATAR HIDUP
     ===================================================== */
  var skyline = [];   // 3 lapis siluet
  var fog = [];
  var embers = [];
  var flash = 0;      // kilat di kejauhan (0..1)
  var pulse = 0;      // denyut rune saat ada serangan besar (0..1)
  var tint = null;    // warna denyut terakhir

  function rand(a, b) { return a + Math.random() * (b - a); }

  /** Siluet reruntuhan kastil: menara, tembok runtuh, lengkungan. */
  function buildSkyline() {
    skyline = [0, 1, 2].map(function (layer) {
      var pts = [];
      var base = H * (0.5 + layer * 0.07);
      var x = -40;
      while (x < W + 80) {
        var w = rand(18, 60) * (1 + layer * 0.3);
        var kind = Math.random();
        if (kind < 0.22) { // menara
          var th = rand(60, 150) * (1 - layer * 0.25);
          pts.push([x, base], [x, base - th], [x + w * 0.2, base - th], [x + w * 0.2, base - th - 8], [x + w * 0.4, base - th - 8],
                   [x + w * 0.4, base - th], [x + w * 0.6, base - th], [x + w * 0.6, base - th - 8], [x + w * 0.8, base - th - 8],
                   [x + w * 0.8, base - th], [x + w, base - th], [x + w, base]);
        } else if (kind < 0.5) { // tembok runtuh bergerigi
          var hh = rand(20, 55) * (1 - layer * 0.2);
          pts.push([x, base - hh], [x + w * 0.3, base - hh - rand(0, 14)], [x + w * 0.55, base - hh + rand(4, 14)], [x + w, base - hh - rand(0, 10)]);
        } else { // tanah rendah
          pts.push([x, base - rand(4, 16)], [x + w, base - rand(4, 16)]);
        }
        x += w;
      }
      return { layer: layer, pts: pts, base: base };
    });
    fog = [];
    for (var i = 0; i < 7; i++) fog.push({ x: rand(0, W), y: rand(H * 0.45, H * 0.85), r: rand(W * 0.18, W * 0.35), v: rand(4, 12), a: rand(0.04, 0.09) });
    embers = [];
    for (var j = 0; j < (REDUCED ? 12 : 55); j++) embers.push(newEmber(true));
  }

  function newEmber(anywhere) {
    return { x: rand(0, W), y: anywhere ? rand(0, H) : H + 10, r: rand(0.6, 2.2), vy: rand(10, 32), sway: rand(0.5, 2), ph: rand(0, 6.28), life: rand(0.5, 1) };
  }

  /* Lapisan diam (langit, bulan, siluet, lantai, vinyet) digambar SEKALI ke kanvas cadangan
     setiap ukuran layar berubah, supaya tiap frame cukup menempelkan gambarnya (hemat HP). */
  var staticLayer = null;
  function buildStaticLayer() {
    staticLayer = document.createElement("canvas");
    staticLayer.width = Math.round(W * DPR); staticLayer.height = Math.round(H * DPR);
    var g = staticLayer.getContext("2d");
    g.setTransform(DPR, 0, 0, DPR, 0, 0);

    var sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#07050d"); sky.addColorStop(0.45, "#1a0f1f");
    sky.addColorStop(0.62, "#2a1220"); sky.addColorStop(1, "#08060b");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    var mx = W * 0.78, my = H * 0.2;
    var moon = g.createRadialGradient(mx, my, 2, mx, my, H * 0.32);
    moon.addColorStop(0, "rgba(255,225,200,0.55)"); moon.addColorStop(0.08, "rgba(255,200,170,0.28)");
    moon.addColorStop(1, "rgba(255,150,120,0)");
    g.fillStyle = moon; g.fillRect(0, 0, W, H);

    skyline.forEach(function (L) {
      g.beginPath(); g.moveTo(-60, H);
      L.pts.forEach(function (p) { g.lineTo(p[0], p[1]); });
      g.lineTo(W + 140, H); g.closePath();
      g.fillStyle = ["#160c16", "#100810", "#0a050a"][L.layer]; g.fill();
      g.strokeStyle = "rgba(255,110,50," + (0.08 + L.layer * 0.05) + ")"; g.lineWidth = 1; g.stroke();
    });

    var floorY = H * 0.6;
    var floor = g.createLinearGradient(0, floorY, 0, H);
    floor.addColorStop(0, "rgba(30,18,26,0.85)"); floor.addColorStop(1, "rgba(10,6,10,0.95)");
    g.fillStyle = floor; g.fillRect(0, floorY, W, H - floorY);
  }

  var vignette = null;
  function drawBackground(t, dt) {
    var g = bgCtx;
    if (!staticLayer) buildStaticLayer();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(staticLayer, 0, 0);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);

    // kilat di kejauhan
    if (!REDUCED && Math.random() < dt * 0.06) flash = 1;
    if (flash > 0) {
      g.fillStyle = "rgba(190,170,255," + (flash * 0.22) + ")";
      g.fillRect(0, 0, W, H * 0.6);
      flash = Math.max(0, flash - dt * 3.2);
    }

    // cahaya api dari bawah (berdenyut)
    g.fillStyle = "rgba(255,90,40," + (0.07 + Math.sin(t * 1.7) * 0.025) + ")";
    g.fillRect(0, H * 0.72, W, H * 0.28);

    drawRunes(g, t);

    // kabut mengalir
    fog.forEach(function (f) {
      f.x += f.v * dt;
      if (f.x - f.r > W) f.x = -f.r;
      var fg = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      fg.addColorStop(0, "rgba(200,170,190," + f.a + ")");
      fg.addColorStop(1, "rgba(200,170,190,0)");
      g.fillStyle = fg;
      g.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    });

    // bara api melayang
    g.globalCompositeOperation = "lighter";
    embers.forEach(function (e, i) {
      e.y -= e.vy * dt;
      e.x += Math.sin(t * e.sway + e.ph) * 12 * dt;
      if (e.y < -10) embers[i] = newEmber(false);
      var a = Math.min(1, e.y / H + 0.2) * e.life;
      g.fillStyle = "rgba(255," + (140 + (i % 5) * 18) + ",60," + a + ")";
      g.beginPath(); g.arc(e.x, e.y, e.r, 0, 6.283); g.fill();
    });

    // obor kiri & kanan
    [0.03, 0.97].forEach(function (px, k) {
      var flick = 0.75 + Math.sin(t * 9 + k * 2) * 0.08 + Math.sin(t * 23 + k) * 0.05;
      var tg = g.createRadialGradient(W * px, H * 0.5, 0, W * px, H * 0.5, W * 0.26);
      tg.addColorStop(0, "rgba(255,150,60," + (0.38 * flick) + ")");
      tg.addColorStop(1, "rgba(255,150,60,0)");
      g.fillStyle = tg; g.fillRect(0, 0, W, H);
    });
    g.globalCompositeOperation = "source-over";

    if (!vignette) {
      vignette = g.createRadialGradient(W / 2, H * 0.48, H * 0.3, W / 2, H * 0.48, W * 0.75);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.6)");
    }
    g.fillStyle = vignette; g.fillRect(0, 0, W, H);

    pulse = Math.max(0, pulse - dt * 1.4);
  }

  /** Lingkaran rune berputar di lantai (elips karena perspektif). */
  function drawRunes(g, t) {
    var cx = W / 2, cy = H * 0.66, R = Math.min(W * 0.42, H * 0.95);
    g.save();
    g.translate(cx, cy);
    g.scale(1, 0.32);
    var col = tint || "255,190,110";
    var a = 0.2 + Math.sin(t * 1.3) * 0.05 + pulse * 0.5;
    g.lineWidth = 2;

    g.strokeStyle = "rgba(" + col + "," + a + ")";
    g.beginPath(); g.arc(0, 0, R, 0, 6.283); g.stroke();
    g.beginPath(); g.arc(0, 0, R * 0.74, 0, 6.283); g.stroke();

    g.save();
    g.rotate(t * 0.12);
    g.setLineDash([6, 14]);
    g.beginPath(); g.arc(0, 0, R * 0.92, 0, 6.283); g.stroke();
    g.setLineDash([]);
    for (var i = 0; i < 12; i++) { // tanda rune
      var ang = i * Math.PI / 6;
      g.save();
      g.rotate(ang);
      g.translate(R * 0.83, 0);
      g.beginPath();
      g.moveTo(-6, -8); g.lineTo(0, 8); g.lineTo(6, -8);
      g.moveTo(-4, 0); g.lineTo(4, 0);
      g.stroke();
      g.restore();
    }
    g.restore();

    g.save();
    g.rotate(-t * 0.2);
    g.beginPath(); // bintang segi delapan
    for (var k = 0; k <= 8; k++) {
      var an = k * Math.PI * 2 / 8 * 3;
      var px = Math.cos(an) * R * 0.7, py = Math.sin(an) * R * 0.7;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
    g.restore();

    // cahaya di tengah lingkaran
    var cg = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.8);
    cg.addColorStop(0, "rgba(" + col + "," + (0.12 + pulse * 0.35) + ")");
    cg.addColorStop(1, "rgba(" + col + ",0)");
    g.fillStyle = cg;
    g.beginPath(); g.arc(0, 0, R * 0.8, 0, 6.283); g.fill();
    g.restore();
  }

  /* =====================================================
     2. PARTIKEL & EFEK SKILL
     ===================================================== */
  var parts = [];   // partikel
  var shapes = [];  // bentuk sementara: gelombang, kilat, garis tebasan

  function addPart(p) {
    if (parts.length >= MAX_PARTICLES) parts.shift();
    p.age = 0;
    parts.push(p);
  }
  function addShape(s) { s.age = 0; shapes.push(s); }

  function glowDot(g, x, y, r, color, alpha) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color + alpha + ")");
    gr.addColorStop(1, color + "0)");
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
  }

  /** Satu partikel sesuai jenis elemen. */
  function spawnElementParticle(el, x, y, power, dir) {
    var ang = dir !== undefined ? dir + rand(-0.9, 0.9) : rand(0, 6.283);
    var sp = rand(40, 190) * power;
    addPart({
      kind: el.kind, el: el, x: x, y: y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (el.kind === "flame" ? 40 : 0),
      life: rand(0.45, 0.95), size: rand(2, 5) * (0.7 + power * 0.4),
      rot: rand(0, 6.283), vr: rand(-8, 8),
      grav: el.kind === "drop" || el.kind === "shard" || el.kind === "spark" ? 260 : el.kind === "leaf" ? 40 : el.kind === "flame" ? -60 : 0
    });
  }

  function drawPart(g, p, k) {
    var el = p.el, a = 1 - k;
    switch (p.kind) {
      case "flame":
        glowDot(g, p.x, p.y, p.size * (2.4 - k), el.glow, a * 0.9);
        g.fillStyle = k < 0.35 ? el.core : el.main;
        g.globalAlpha = a; g.beginPath(); g.arc(p.x, p.y, p.size * (1 - k * 0.6), 0, 6.283); g.fill(); g.globalAlpha = 1;
        break;
      case "shard":
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = a;
        g.fillStyle = el.main; g.strokeStyle = el.core; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, -p.size * 1.8); g.lineTo(p.size * 0.6, 0); g.lineTo(0, p.size * 1.8); g.lineTo(-p.size * 0.6, 0); g.closePath();
        g.fill(); g.stroke(); g.restore(); g.globalAlpha = 1;
        break;
      case "leaf":
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = a;
        g.fillStyle = el.main;
        g.beginPath(); g.ellipse(0, 0, p.size * 1.5, p.size * 0.7, 0, 0, 6.283); g.fill();
        g.strokeStyle = el.dark; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-p.size * 1.4, 0); g.lineTo(p.size * 1.4, 0); g.stroke();
        g.restore(); g.globalAlpha = 1;
        break;
      case "drop":
        g.globalAlpha = a; g.fillStyle = el.main;
        g.beginPath(); g.arc(p.x, p.y, p.size * 0.8, 0, 6.283); g.fill();
        g.fillStyle = el.core; g.beginPath(); g.arc(p.x - p.size * 0.25, p.y - p.size * 0.25, p.size * 0.28, 0, 6.283); g.fill();
        g.globalAlpha = 1;
        break;
      case "wisp":
        glowDot(g, p.x, p.y, p.size * (3 + k * 2), el.glow, a * 0.7);
        g.fillStyle = el.dark; g.globalAlpha = a * 0.8;
        g.beginPath(); g.arc(p.x, p.y, p.size * 0.9, 0, 6.283); g.fill(); g.globalAlpha = 1;
        break;
      case "star":
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = a;
        glowDot(g, 0, 0, p.size * 2.6, el.glow, 0.8);
        g.fillStyle = el.core; g.beginPath();
        for (var i = 0; i < 8; i++) { var r = i % 2 ? p.size * 0.4 : p.size * 1.6; var an = i * Math.PI / 4; g.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
        g.closePath(); g.fill(); g.restore(); g.globalAlpha = 1;
        break;
      case "streak":
        g.strokeStyle = el.main; g.globalAlpha = a * 0.8; g.lineWidth = p.size * 0.5;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06); g.stroke(); g.globalAlpha = 1;
        break;
      case "bolt":
      case "spark":
      default:
        g.strokeStyle = k < 0.3 ? el.core : el.main; g.globalAlpha = a; g.lineWidth = Math.max(1, p.size * 0.45);
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); g.stroke(); g.globalAlpha = 1;
        break;
    }
  }

  /** Garis kilat bergerigi dari a ke b. */
  function boltPath(x1, y1, x2, y2, jag) {
    var pts = [[x1, y1]], n = 9;
    for (var i = 1; i < n; i++) {
      var t = i / n;
      pts.push([x1 + (x2 - x1) * t + rand(-jag, jag), y1 + (y2 - y1) * t + rand(-jag, jag)]);
    }
    pts.push([x2, y2]);
    return pts;
  }

  function drawShape(g, s, k) {
    var a = 1 - k, el = s.el;
    if (s.type === "ring") {
      g.strokeStyle = el.main; g.globalAlpha = a; g.lineWidth = s.w * (1 - k) + 1;
      g.beginPath(); g.ellipse(s.x, s.y, s.r * (0.2 + k), s.r * (0.2 + k) * (s.flat || 1), 0, 0, 6.283); g.stroke();
      g.globalAlpha = 1;
    } else if (s.type === "flash") {
      glowDot(g, s.x, s.y, s.r * (0.6 + k * 0.8), el.glow, a);
    } else if (s.type === "bolt") {
      g.globalCompositeOperation = "lighter";
      [[6, el.glow + (a * 0.35) + ")"], [2.2, el.main], [1, el.core]].forEach(function (st) {
        g.strokeStyle = st[1]; g.lineWidth = st[0]; g.globalAlpha = st[0] === 6 ? 1 : a;
        g.beginPath(); s.pts.forEach(function (p, i) { if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); }); g.stroke();
      });
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    } else if (s.type === "slash") {
      g.save(); g.translate(s.x, s.y); g.rotate(s.ang);
      var len = s.r * Math.min(1, k * 3);
      var grd = g.createLinearGradient(-s.r, 0, s.r, 0);
      grd.addColorStop(0, el.glow + "0)"); grd.addColorStop(0.5, el.core); grd.addColorStop(1, el.glow + "0)");
      g.strokeStyle = grd; g.globalAlpha = a; g.lineWidth = 5 * (1 - k) + 1;
      g.beginPath(); g.moveTo(-len, 0); g.quadraticCurveTo(0, -s.r * 0.25, len, 0); g.stroke();
      g.restore(); g.globalAlpha = 1;
    } else if (s.type === "shield") {
      g.save(); g.translate(s.x, s.y); g.globalAlpha = a * 0.9;
      g.strokeStyle = "#8fe3ff"; g.lineWidth = 1.5;
      var R = s.r * (0.8 + Math.min(1, k * 4) * 0.2);
      for (var i = 0; i < 6; i++) { // segi enam
        var an = i * Math.PI / 3 + k;
        g.beginPath(); g.arc(Math.cos(an) * R * 0.5, Math.sin(an) * R * 0.5, R * 0.36, 0, 6.283); g.stroke();
      }
      glowDot(g, 0, 0, R, "rgba(110,210,255,", 0.25 * a);
      g.restore(); g.globalAlpha = 1;
    } else if (s.type === "aura") {
      for (var j = 0; j < 3; j++) {
        var kk = (k + j / 3) % 1;
        g.strokeStyle = s.color; g.globalAlpha = (1 - kk) * a; g.lineWidth = 2;
        g.beginPath(); g.ellipse(s.x, s.y + s.r * 0.6 - kk * s.r * 1.2, s.r * 0.7, s.r * 0.22, 0, 0, 6.283); g.stroke();
      }
      g.globalAlpha = 1;
    } else if (s.type === "orbit") { // bintang pusing (stun)
      for (var m = 0; m < 3; m++) {
        var an2 = k * 10 + m * 2.09;
        var x = s.x + Math.cos(an2) * s.r, y = s.y + Math.sin(an2) * s.r * 0.35;
        g.fillStyle = "#ffe34a"; g.globalAlpha = a;
        g.beginPath(); g.arc(x, y, 3, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1;
    } else if (s.type === "beam") { // proyektil
      var t = Math.min(1, k * 1.4);
      var ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      var bx = s.x + (s.tx - s.x) * ease, by = s.y + (s.ty - s.y) * ease - Math.sin(ease * Math.PI) * s.arc;
      glowDot(g, bx, by, s.r * 2.6, el.glow, 0.85);
      g.fillStyle = el.core; g.beginPath(); g.arc(bx, by, s.r * 0.7, 0, 6.283); g.fill();
      if (Math.random() < 0.8) spawnElementParticle(el, bx, by, 0.35);
      if (t >= 1 && !s.done) { s.done = true; if (s.onHit) s.onHit(); }
    }
  }

  function drawFx(dt) {
    var g = fxCtx;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = "lighter";
    for (var i = shapes.length - 1; i >= 0; i--) {
      var s = shapes[i];
      s.age += dt;
      var k = s.age / s.life;
      if (k >= 1) { if (s.type === "beam" && !s.done && s.onHit) s.onHit(); shapes.splice(i, 1); continue; }
      drawShape(g, s, k);
    }
    for (var j = parts.length - 1; j >= 0; j--) {
      var p = parts[j];
      p.age += dt;
      var kk = p.age / p.life;
      if (kk >= 1) { parts.splice(j, 1); continue; }
      p.vy += p.grav * dt;
      p.vx *= 1 - dt * 1.5; p.vy *= 1 - dt * 0.8;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      drawPart(g, p, kk);
    }
    g.globalCompositeOperation = "source-over";
  }

  /* ---------- posisi karakter di layar ---------- */
  function figPos(id) {
    var f = document.querySelector('.fighter[data-unit-id="' + id + '"] .fh-fig') ||
            document.querySelector('.char-slot[data-unit-id="' + id + '"]');
    if (!f) return null;
    var r = f.getBoundingClientRect();
    if (r.width === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.45, w: r.width, h: r.height };
  }

  function impact(el, pos, big, isAtk) {
    var n = big ? 34 : 18;
    for (var i = 0; i < n; i++) spawnElementParticle(el, pos.x, pos.y, big ? 1.4 : 1);
    addShape({ type: "flash", el: el, x: pos.x, y: pos.y, r: big ? 90 : 55, life: 0.35 });
    addShape({ type: "ring", el: el, x: pos.x, y: pos.y + pos.h * 0.35, r: big ? 130 : 80, w: 4, flat: 0.35, life: 0.55 });
    if (isAtk) {
      if (el.kind === "bolt") addShape({ type: "bolt", el: el, pts: boltPath(pos.x + rand(-10, 10), pos.y - 220, pos.x, pos.y, 22), life: 0.32 });
      else addShape({ type: "slash", el: el, x: pos.x, y: pos.y, r: big ? 70 : 50, ang: rand(-0.9, -0.4), life: 0.32 });
    }
    pulse = Math.min(1, pulse + (big ? 0.8 : 0.35));
    tint = hexToRgb(el.main);
  }

  function hexToRgb(h) {
    var n = parseInt(h.slice(1), 16);
    return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255);
  }

  /* =====================================================
     3. SOROTAN SKILL 6 (sinematik)
     ===================================================== */
  function ultimateCutIn(caster, skill, el) {
    var bs = document.getElementById("battle-screen");
    var box = document.createElement("div");
    box.className = "afx-ult" + (caster.team === "enemy" ? " afx-ult-enemy" : "");
    box.style.setProperty("--ult-main", el.main);
    box.style.setProperty("--ult-glow", el.glow + "0.55)");
    var who = document.createElement("div");
    who.className = "afx-ult-who";
    who.textContent = caster.name + " · Skill Pamungkas";
    var name = document.createElement("div");
    name.className = "afx-ult-name";
    name.textContent = skill.name;
    box.appendChild(who); box.appendChild(name);
    document.body.appendChild(box);
    if (bs && !REDUCED) {
      bs.classList.remove("afx-zoom"); void bs.offsetWidth; bs.classList.add("afx-zoom");
      setTimeout(function () { bs.classList.remove("afx-zoom"); }, 1100);
    }
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 1500);
  }

  /* =====================================================
     4. RENCANA EFEK SATU SKILL (dipanggil fighters.js)
     ===================================================== */
  function isUltimate(caster, skill) {
    return caster && caster.skills && caster.skills.indexOf(skill) === caster.skills.length - 1;
  }

  function playSkill(caster, skill, plan) {
    if (!battleShown() || !ensureCanvases()) return false;
    var el = elementOf(caster);
    var ult = isUltimate(caster, skill);
    var isAtk = skill.type === "single_attack" || skill.type === "area_attack";
    var from = figPos(caster.id) || plan.from;
    if (!from) return false;

    var startDelay = 0;
    if (ult) { ultimateCutIn(caster, skill, el); startDelay = REDUCED ? 0 : 520; }

    // aura pemakai
    addShape({ type: "aura", el: el, color: el.main, x: from.x, y: from.y, r: 34, life: 0.7 });
    for (var i = 0; i < 10; i++) spawnElementParticle(el, from.x, from.y + 10, 0.5, -Math.PI / 2);

    var targets = (plan.to || []).map(function (t) { return { id: t.id, pos: figPos(t.id) || t.r }; }).filter(function (t) { return t.pos; });

    setTimeout(function () {
      targets.forEach(function (t, idx) {
        setTimeout(function () {
          var hit = function () {
            if (isAtk) impact(el, t.pos, ult || plan.area, true);
            else supportFx(skill, t.pos, el);
          };
          if (el.kind === "bolt" && isAtk) { // petir menyambar langsung
            addShape({ type: "bolt", el: el, pts: boltPath(from.x, from.y, t.pos.x, t.pos.y, 26), life: 0.28 });
            hit();
          } else {
            addShape({ type: "beam", el: el, x: from.x, y: from.y, tx: t.pos.x, ty: t.pos.y, r: ult ? 9 : 6,
                       arc: isAtk ? 26 : 50, life: ult ? 0.55 : 0.42, onHit: hit });
          }
        }, idx * 90);
      });
      if (plan.self) supportFx(skill, from, el);
      if (ult && isAtk) setTimeout(function () { if (window.FighterFX) window.FighterFX.shake(); }, 380);
    }, startDelay);
    return true;
  }

  function supportFx(skill, pos, el) {
    var eff = skill.effect || {};
    if (skill.type === "healing") {
      var green = ELEMENTS.nature;
      for (var i = 0; i < 16; i++) addPart({ kind: "star", el: green, x: pos.x + rand(-22, 22), y: pos.y + rand(0, 30), vx: rand(-10, 10), vy: rand(-80, -40), life: rand(0.6, 1.1), size: rand(1.5, 3), rot: 0, vr: rand(-3, 3), grav: 0 });
      addShape({ type: "aura", el: green, color: "#7be06a", x: pos.x, y: pos.y, r: 34, life: 0.9 });
    } else if (skill.type === "shield") {
      addShape({ type: "shield", el: el, x: pos.x, y: pos.y, r: 44, life: 0.9 });
    } else if (skill.type === "buff") {
      addShape({ type: "aura", el: el, color: "#ffd84a", x: pos.x, y: pos.y, r: 36, life: 0.9 });
      for (var j = 0; j < 10; j++) spawnElementParticle(ELEMENTS.light, pos.x, pos.y + 20, 0.5, -Math.PI / 2);
    } else {
      // debuff / stun / blind / segel
      for (var m = 0; m < 14; m++) spawnElementParticle(ELEMENTS.shadow, pos.x, pos.y - 20, 0.6, Math.PI / 2);
      addShape({ type: "ring", el: ELEMENTS.shadow, x: pos.x, y: pos.y, r: 60, w: 3, flat: 1, life: 0.5 });
    }
    if (eff.type === "stun") addShape({ type: "orbit", el: el, x: pos.x, y: pos.y - pos.h * 0.35, r: 20, life: 1.2 });
  }

  /* =====================================================
     LOOP
     ===================================================== */
  var last = 0, running = false;
  function frame(now) {
    if (!battleShown()) { running = false; if (fxCtx) fxCtx.clearRect(0, 0, W, H); return; }
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    var t = now / 1000;
    drawBackground(t, dt);
    drawFx(dt);
    requestAnimationFrame(frame);
  }
  function start() {
    if (running) return;
    if (!ensureCanvases()) return;
    if (W === 0) resize();
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // Mulai/berhenti mengikuti layar (ambience.js mengisi body[data-scene])
  new MutationObserver(function () { if (battleShown()) start(); })
    .observe(document.body, { attributes: true, attributeFilter: ["data-scene"] });
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", function () { setTimeout(resize, 250); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden && battleShown()) start(); });

  /* ---------- gaya untuk sorotan skill 6 ---------- */
  var st = document.createElement("style");
  st.textContent = [
    "body[data-scene='battle'] .bg-arena{background:#07050d}",
    "body[data-scene='battle'] .bg-arena::before,body[data-scene='battle'] .bg-arena::after,body[data-scene='battle'] .bg-arena-embers{display:none}",
    ".afx-ult{position:fixed;inset:0;z-index:48;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;",
    "  background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,.25),rgba(0,0,0,.78));animation:afx-ult-bg 1.5s ease forwards}",
    ".afx-ult::before{content:'';position:absolute;left:0;right:0;top:50%;height:86px;transform:translateY(-50%) skewY(-4deg);",
    "  background:linear-gradient(90deg,transparent,var(--ult-glow) 20%,var(--ult-glow) 80%,transparent);animation:afx-ult-band 1.5s cubic-bezier(.2,.9,.2,1) forwards}",
    ".afx-ult-who{position:relative;font:700 12px Georgia,serif;letter-spacing:4px;text-transform:uppercase;color:#f3e6c8;opacity:.9;",
    "  animation:afx-ult-txt 1.5s cubic-bezier(.2,.9,.2,1) forwards}",
    ".afx-ult-name{position:relative;margin-top:4px;font:800 clamp(22px,5vw,40px) Georgia,serif;letter-spacing:2px;color:#fff;",
    "  text-shadow:0 0 18px var(--ult-main),0 0 4px #000,0 2px 0 #000;animation:afx-ult-txt 1.5s cubic-bezier(.2,.9,.2,1) .05s both}",
    ".afx-ult-enemy .afx-ult-name{text-shadow:0 0 18px #ff4a4a,0 0 4px #000,0 2px 0 #000}",
    "@keyframes afx-ult-bg{0%{opacity:0}12%{opacity:1}75%{opacity:1}100%{opacity:0}}",
    "@keyframes afx-ult-band{0%{clip-path:inset(0 100% 0 0)}25%{clip-path:inset(0 0 0 0)}80%{clip-path:inset(0 0 0 0);opacity:1}100%{clip-path:inset(0 0 0 100%);opacity:0}}",
    "@keyframes afx-ult-txt{0%{opacity:0;transform:translateX(-60px) scale(1.15)}22%{opacity:1;transform:none}78%{opacity:1;transform:none}100%{opacity:0;transform:translateX(40px)}}",
    "#battle-screen.afx-zoom{animation:afx-zoom 1.1s cubic-bezier(.2,.8,.2,1)}",
    "@keyframes afx-zoom{0%{transform:none}30%{transform:scale(1.045)}100%{transform:none}}",
    "@media (prefers-reduced-motion: reduce){.afx-ult,.afx-ult::before,.afx-ult-who,.afx-ult-name{animation-duration:.01s}}"
  ].join("\n");
  document.head.appendChild(st);

  window.ArenaFX = { playSkill: playSkill, elementOf: elementOf, impact: impact };
})();
