/* ============================================
   ACCURANT - BLACKHOLE.JS
   Efek visual Black Hole milik Loid (hanya tampilan, tanpa logika damage).
   Dimuat SETELAH mechanics.js. Logika ada di mechanics.js (holeSize, castSpecial).

   - sync()    : dipanggil otomatis setiap renderArena(); memunculkan / membesarkan /
                 menghapus black hole sesuai unit.holeSize
   - explode() : implosi -> kilatan -> gelombang kejut -> layar bergetar
   - beam()    : pusaran penarik dari satu karakter ke karakter lain (Penarikan Kasar,
                 serangan yang tersedot)
   - swirl()   : cincin pusaran mengecil di sekitar satu karakter (Daya Tarik)
   CSS disisipkan lewat JS supaya style.css tidak perlu diubah.
   ============================================ */

(function () {
  "use strict";

  var BASE = 180;          // diameter dasar (px) sebelum diskalakan
  var HOLE_MAX_VIEW = 1600; // sama dengan HOLE_MAX di mechanics.js

  var css = [
    "#bh-fx{position:fixed;inset:0;pointer-events:none;z-index:45;overflow:hidden}",

    /* ---------- black hole menetap ---------- */
    ".bh{position:absolute;width:" + BASE + "px;height:" + BASE + "px;transform:translate(-50%,-50%) scale(var(--s,.4));",
    "  transition:transform .9s cubic-bezier(.2,.85,.2,1),left .4s,top .4s}",
    ".bh-body{position:absolute;inset:0;animation:bh-in 1s cubic-bezier(.2,.9,.2,1) both}",
    ".bh-glow{position:absolute;inset:-45%;border-radius:50%;filter:blur(7px);animation:bh-pulse 2.6s ease-in-out infinite;",
    "  background:radial-gradient(circle,rgba(0,0,0,0) 34%,rgba(150,70,255,.42) 48%,rgba(255,140,50,.22) 60%,rgba(0,0,0,0) 72%)}",
    ".bh-diskwrap{position:absolute;inset:-34%;transform:rotate(-17deg) scaleY(.36)}",
    ".bh-disk{position:absolute;inset:0;border-radius:50%;animation:bh-spin 3.2s linear infinite;",
    "  background:conic-gradient(from 0deg,rgba(255,170,60,0),rgba(255,130,40,.95),rgba(255,245,215,1),rgba(200,90,255,.95),",
    "    rgba(60,20,120,0),rgba(255,130,40,.95),rgba(255,245,215,1),rgba(130,50,230,.85),rgba(255,170,60,0));",
    "  -webkit-mask:radial-gradient(circle,transparent 31%,#000 34%,#000 50%,transparent 70%);",
    "  mask:radial-gradient(circle,transparent 31%,#000 34%,#000 50%,transparent 70%)}",
    ".bh-arc{position:absolute;inset:7%;border-radius:50%;border:2px solid transparent;",
    "  border-top-color:rgba(255,215,160,.95);border-bottom-color:rgba(190,100,255,.85);filter:blur(.5px);animation:bh-spin 5s linear infinite reverse}",
    ".bh-core{position:absolute;inset:29%;border-radius:50%;background:#000;",
    "  box-shadow:0 0 0 3px rgba(255,214,160,.95),0 0 22px 8px rgba(190,90,255,.85),0 0 60px 18px rgba(110,40,200,.55),inset 0 0 18px #000}",
    ".bh-p{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;border-radius:50%;background:#efe0ff;",
    "  box-shadow:0 0 6px 2px rgba(190,120,255,.9);opacity:0;animation:bh-suck 1.9s linear infinite;animation-delay:var(--d)}",
    ".bh.bh-grow .bh-core{animation:bh-throb .7s ease-out}",
    ".bh.bh-implode{transition:transform .38s cubic-bezier(.6,0,1,.6);transform:translate(-50%,-50%) scale(.12) !important;filter:brightness(2.4)}",
    ".bh.bh-collapse{transition:transform .6s ease-in,opacity .6s ease-in;transform:translate(-50%,-50%) scale(0) rotate(160deg) !important;opacity:0}",
    ".bh-label{position:absolute;transform:translate(-50%,0);padding:1px 8px;border-radius:10px;font:700 12px/1.4 system-ui,sans-serif;",
    "  color:#f1e6ff;background:rgba(20,8,40,.78);border:1px solid rgba(190,110,255,.8);text-shadow:0 0 6px #b36bff;",
    "  box-shadow:0 0 10px rgba(150,70,255,.7);transition:left .4s,top .9s}",

    /* ---------- ledakan ---------- */
    ".bh-flash{position:absolute;inset:0;opacity:0;animation:bh-flash .95s ease-out forwards;",
    "  background:radial-gradient(circle at var(--x) var(--y),#fff 0,rgba(235,205,255,.95) 9%,rgba(140,60,235,.55) 30%,rgba(30,0,60,.35) 60%,rgba(0,0,0,0) 80%)}",
    ".bh-wave{position:absolute;left:var(--x);top:var(--y);width:30px;height:30px;margin:-15px;border-radius:50%;opacity:0;",
    "  border:5px solid rgba(235,205,255,.95);box-shadow:0 0 22px 6px rgba(170,90,255,.9),inset 0 0 18px 4px rgba(170,90,255,.7);",
    "  animation:bh-wave 1.1s cubic-bezier(.1,.7,.3,1) forwards;animation-delay:var(--w)}",
    ".bh-shard{position:absolute;left:var(--x);top:var(--y);width:3px;height:var(--l);margin-left:-1.5px;opacity:0;transform-origin:50% 0;",
    "  background:linear-gradient(180deg,rgba(255,240,215,1),rgba(190,100,255,0));animation:bh-shard .8s ease-out forwards;",
    "  --a:0deg;transform:rotate(var(--a)) translateY(0)}",
    "#battle-screen.bh-shake{animation:bh-shake .7s cubic-bezier(.36,.07,.19,.97) both}",

    /* ---------- pusaran penarik ---------- */
    ".bh-beam{position:absolute;height:7px;margin-top:-3.5px;transform-origin:0 50%;border-radius:4px;opacity:0;",
    "  background:linear-gradient(90deg,rgba(255,215,160,0),rgba(255,215,160,.95) 25%,rgba(180,90,255,.95) 60%,rgba(10,0,25,.95));",
    "  box-shadow:0 0 14px 3px rgba(160,70,255,.8);animation:bh-beam .85s ease-out forwards}",
    ".bh-swirl{position:absolute;width:150px;height:150px;margin:-75px;border-radius:50%;opacity:0;",
    "  border:3px dashed rgba(200,120,255,.95);box-shadow:0 0 18px 4px rgba(150,70,255,.8),inset 0 0 18px 2px rgba(150,70,255,.6);",
    "  animation:bh-swirl 1.05s ease-in forwards;animation-delay:var(--w,0s)}",

    /* ---------- keyframes ---------- */
    "@keyframes bh-in{0%{transform:scale(0) rotate(-200deg);opacity:0}60%{opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}",
    "@keyframes bh-spin{to{transform:rotate(360deg)}}",
    "@keyframes bh-pulse{0%,100%{opacity:.7;transform:scale(.95)}50%{opacity:1;transform:scale(1.07)}}",
    "@keyframes bh-throb{0%{box-shadow:0 0 0 3px #fff,0 0 60px 30px rgba(255,255,255,.9)}100%{}}",
    "@keyframes bh-suck{0%{opacity:0;transform:rotate(var(--a)) translateX(var(--r)) scale(1)}15%{opacity:1}",
    "  100%{opacity:0;transform:rotate(calc(var(--a) + 230deg)) translateX(0) scale(.2)}}",
    "@keyframes bh-flash{0%{opacity:0}12%{opacity:1}100%{opacity:0}}",
    "@keyframes bh-wave{0%{opacity:1;transform:scale(.3)}100%{opacity:0;transform:scale(46)}}",
    "@keyframes bh-shard{0%{opacity:1;transform:rotate(var(--a)) translateY(0)}100%{opacity:0;transform:rotate(var(--a)) translateY(260px)}}",
    "@keyframes bh-shake{10%,90%{transform:translate3d(-2px,1px,0)}20%,80%{transform:translate3d(5px,-3px,0)}",
    "  30%,50%,70%{transform:translate3d(-9px,4px,0)}40%,60%{transform:translate3d(9px,-4px,0)}}",
    "@keyframes bh-beam{0%{opacity:0;transform:rotate(var(--a)) scaleX(0)}25%{opacity:1}70%{opacity:1;transform:rotate(var(--a)) scaleX(1)}100%{opacity:0;transform:rotate(var(--a)) scaleX(1)}}",
    "@keyframes bh-swirl{0%{opacity:0;transform:scale(1.5) rotate(0)}25%{opacity:1}100%{opacity:0;transform:scale(.15) rotate(300deg)}}",
    "@media (prefers-reduced-motion:reduce){#battle-screen.bh-shake{animation:none}.bh-disk,.bh-arc,.bh-glow,.bh-p{animation:none}}"
  ].join("\n");

  var styleEl = document.createElement("style");
  styleEl.id = "bh-style";
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  var layer = null;
  var holes = {}; // unit.id -> { el, label, size }

  function getLayer() {
    if (!layer || !layer.parentNode) {
      layer = document.createElement("div");
      layer.id = "bh-fx";
      document.body.appendChild(layer);
    }
    return layer;
  }

  function el(cls, parent) {
    var d = document.createElement("div");
    d.className = cls;
    if (parent) parent.appendChild(d);
    return d;
  }

  function slotRect(unit) {
    var s = document.querySelector('.char-slot[data-unit-id="' + unit.id + '"]');
    return s ? s.getBoundingClientRect() : null;
  }
  function slotCenter(unit) {
    var r = slotRect(unit);
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }

  /** Titik pusat black hole = tengah kolom tim lawan pemiliknya. */
  function dividerBox() {
    var d = document.querySelector("#battle-screen .arena-divider");
    return d ? d.getBoundingClientRect() : null;
  }

  /** Titik pusat black hole = tengah arena (di antara kedua tim, di atas keterangan). */
  function holeCenter(owner) {
    var box = dividerBox();
    if (box && box.width > 40) return { x: box.left + box.width / 2, y: box.top + box.height * 0.3 };
    var col = document.getElementById(owner.team === "player" ? "team-enemy" : "team-player");
    if (!col) return { x: innerWidth / 2, y: innerHeight / 2 };
    var r = col.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function scaleFor(size) {
    var s = 0.36 + 0.22 * Math.log(Math.max(50, size) / 50) / Math.LN2; // 50 -> .36 ... 1600 -> 1.46
    var box = dividerBox();
    var room = box && box.width > 40 ? Math.min(box.width * 0.52, innerHeight * 0.4) : Math.min(innerWidth, innerHeight) * 0.6;
    var cap = room / BASE;
    return Math.max(0.3, Math.min(s, cap, 1.6));
  }

  function build(owner, size) {
    var root = el("bh", getLayer());
    var body = el("bh-body", root);
    el("bh-glow", body);
    var dw = el("bh-diskwrap", body);
    el("bh-disk", dw);
    el("bh-arc", body);
    el("bh-core", body);
    for (var i = 0; i < 12; i++) {
      var p = el("bh-p", body);
      p.style.setProperty("--a", (i * 30) + "deg");
      p.style.setProperty("--r", (BASE * 0.85 + (i % 3) * 22) + "px");
      p.style.setProperty("--d", (-(i * 0.16)) + "s");
    }
    var label = el("bh-label", getLayer());
    return { el: root, label: label, size: 0, owner: owner };
  }

  function place(h, owner) {
    var c = holeCenter(owner);
    h.el.style.left = c.x + "px";
    h.el.style.top = c.y + "px";
    var s = scaleFor(h.size);
    h.el.style.setProperty("--s", s);
    h.label.style.left = c.x + "px";
    h.label.style.top = (c.y + (BASE * s) / 2 + 6) + "px";
  }

  function remove(id, animated) {
    var h = holes[id];
    if (!h || h.leaving) return;
    h.leaving = true;
    if (animated) {
      h.el.classList.add("bh-collapse");
      h.label.style.opacity = "0";
      setTimeout(function () { dispose(id, h); }, 650);
    } else {
      dispose(id, h);
    }
  }
  function dispose(id, h) {
    if (h.el.parentNode) h.el.parentNode.removeChild(h.el);
    if (h.label.parentNode) h.label.parentNode.removeChild(h.label);
    if (holes[id] === h) delete holes[id];
  }

  function battleVisible() {
    var bs = document.getElementById("battle-screen");
    return !!bs && !bs.classList.contains("hidden") && !(typeof battleEnded !== "undefined" && battleEnded);
  }

  /** Samakan tampilan dengan state unit (dipanggil tiap renderArena). */
  function sync() {
    var visible = battleVisible() && typeof allUnits !== "undefined";
    var seen = {};
    if (visible) {
      allUnits.forEach(function (u) {
        if (!(u.holeSize > 0)) return;
        if (!u.alive) return; // yang kalah ditangani di bawah (runtuh)
        seen[u.id] = true;
        var h = holes[u.id];
        if (!h || h.leaving) {
          if (h && h.leaving) return; // sedang meledak / runtuh: jangan dibuat ulang dulu
          h = holes[u.id] = build(u, u.holeSize);
          h.size = u.holeSize;
          place(h, u);
        } else if (h.size !== u.holeSize) {
          var grew = u.holeSize > h.size;
          h.size = u.holeSize;
          place(h, u);
          if (grew) {
            h.el.classList.remove("bh-grow");
            void h.el.offsetWidth;
            h.el.classList.add("bh-grow");
          }
        } else {
          place(h, u); // posisi ikut tata letak layar (rotasi, resize)
        }
        h.label.textContent = "🕳️ " + h.size + (h.size >= HOLE_MAX_VIEW ? " MAX" : "");
      });
    }
    Object.keys(holes).forEach(function (id) {
      if (!seen[id] && !holes[id].leaving) remove(id, visible);
    });
  }

  function flashAt(x, y) {
    var L = getLayer();
    var f = el("bh-flash", L);
    f.style.setProperty("--x", x + "px");
    f.style.setProperty("--y", y + "px");
    for (var i = 0; i < 3; i++) {
      var w = el("bh-wave", L);
      w.style.setProperty("--x", x + "px");
      w.style.setProperty("--y", y + "px");
      w.style.setProperty("--w", (i * 0.16) + "s");
      setTimeout(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }.bind(null, w), 1500);
    }
    for (var k = 0; k < 18; k++) {
      var sh = el("bh-shard", L);
      sh.style.setProperty("--x", x + "px");
      sh.style.setProperty("--y", y + "px");
      sh.style.setProperty("--l", (40 + (k % 4) * 26) + "px");
      sh.style.setProperty("--a", (k * 20 + (k % 2) * 7) + "deg");
      setTimeout(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }.bind(null, sh), 1000);
    }
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1100);
  }

  /** Ledakan: implosi 0,38 dtk -> kilatan + gelombang kejut + layar bergetar. */
  function explode(owner, size) {
    if (!battleVisible()) return;
    var h = holes[owner.id];
    var c = holeCenter(owner);
    if (h) {
      h.leaving = true;
      h.el.classList.add("bh-implode");
      h.label.style.opacity = "0";
    }
    setTimeout(function () {
      flashAt(c.x, c.y);
      var bs = document.getElementById("battle-screen");
      if (bs) {
        bs.classList.remove("bh-shake");
        void bs.offsetWidth;
        bs.classList.add("bh-shake");
        setTimeout(function () { bs.classList.remove("bh-shake"); }, 800);
      }
      if (h) dispose(owner.id, h);
    }, 380);
  }

  /** Pusaran penarik dari karakter `from` ke karakter `to`. */
  function beam(from, to) {
    if (!battleVisible()) return;
    var a = slotCenter(from), b = slotCenter(to);
    if (!a || !b) return;
    var L = getLayer();
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    var ang = Math.atan2(dy, dx) * 180 / Math.PI;
    // arah tarikan: dari sasaran menuju penariknya (sama untuk "tarik" dan "tersedot")
    var bm = el("bh-beam", L);
    bm.style.left = b.x + "px";
    bm.style.top = b.y + "px";
    bm.style.width = len + "px";
    bm.style.setProperty("--a", (ang + 180) + "deg");
    var s1 = el("bh-swirl", L);
    s1.style.left = b.x + "px"; s1.style.top = b.y + "px";
    var s2 = el("bh-swirl", L);
    s2.style.left = a.x + "px"; s2.style.top = a.y + "px";
    s2.style.setProperty("--w", ".35s");
    setTimeout(function () {
      [bm, s1, s2].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    }, 1500);
  }

  /** Cincin pusaran yang mengecil di sekitar `unit` (Daya Tarik Black Hole). */
  function swirl(unit) {
    if (!battleVisible()) return;
    var c = slotCenter(unit);
    if (!c) return;
    var L = getLayer();
    var made = [];
    for (var i = 0; i < 3; i++) {
      var s = el("bh-swirl", L);
      s.style.left = c.x + "px";
      s.style.top = c.y + "px";
      s.style.setProperty("--w", (i * 0.22) + "s");
      made.push(s);
    }
    setTimeout(function () {
      made.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    }, 1700);
  }

  /** Bersihkan semua efek (mis. pertarungan baru / selesai). */
  function clear() {
    Object.keys(holes).forEach(function (id) { remove(id, false); });
    if (layer) layer.innerHTML = "";
  }

  window.BlackHoleFX = { sync: sync, explode: explode, beam: beam, swirl: swirl, clear: clear };

  // Ikut setiap renderArena() dan perubahan ukuran layar.
  if (typeof renderArena === "function") {
    renderArena = (function (orig) {
      return function () {
        var r = orig.apply(this, arguments);
        try { sync(); } catch (e) { console.error(e); }
        return r;
      };
    })(renderArena);
  }
  // Pertarungan selesai / layar battle disembunyikan: bersihkan sisa efek.
  setInterval(function () {
    if (!battleVisible() && (Object.keys(holes).length > 0 || (layer && layer.childNodes.length > 0))) clear();
  }, 600);
  window.addEventListener("resize", function () { try { sync(); } catch (e) { /* abaikan */ } });
  window.addEventListener("orientationchange", function () { setTimeout(function () { try { sync(); } catch (e) { /* abaikan */ } }, 250); });
})();