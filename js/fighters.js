/* ============================================
   ACCURANT ARENA - FIGHTERS.JS
   Arena "orang lidi": karakter berdiri di medan perang, bukan kartu.

   Tiap karakter =
     - papan nama + bar HP / mana / bar lain di SAMPINGNYA (HUD ala game pertarungan)
     - orang lidi di bawah papan itu
     - efek status digambar di tubuh orang lidi (racun, bakar, beku, stun, shield, ...)
   Efek aksi: bola energi terbang dari penyerang ke sasaran, ledakan kena, angka damage /
   heal melayang, karakter bergetar saat kena, dan ambruk saat kalah.

   Struktur lama dijaga supaya berkas lain tetap jalan: tiap karakter tetap
   elemen .char-slot dengan data-unit-id (dipakai bag.js untuk seret item,
   blackhole.js untuk posisi efek, dan onUnitSlotClick untuk memilih).

   Dimuat PALING AKHIR (setelah progression.js). Gaya ada di css/fighters.css.
   Gambar orang lidi sementara: gampang diganti gambar karakter asli nanti
   lewat fungsi figureSvg() di bawah.
   ============================================ */

(function () {
  "use strict";

  /* ---------- util ---------- */
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function pctW(cur, max) {
    return Math.max(0, Math.min(100, (cur / Math.max(1, max)) * 100));
  }
  function rnd(n) { return Math.round(n); }

  /* ---------- gambar orang lidi (SVG) ----------
     viewBox 64 x 92. Aksesori berbeda per sistem kekuatan supaya mudah dibedakan.
     Ganti isi fungsi ini kalau nanti mau memakai gambar karakter asli. */
  function figureSvg(unit) {
    var id = String(unit.id).replace(/[^a-zA-Z0-9_-]/g, "");
    var dead = !unit.alive;
    var sys = unit.powerSystem || "";
    var acc = "";
    if (sys === "Breathing") {          // pedang
      acc = '<path d="M47 43 60 17" class="f-weapon"/><path d="M44 36l8 4" class="f-weapon"/>';
    } else if (sys === "Magic") {       // tongkat + bola sihir
      acc = '<path d="M47 45 55 14" class="f-weapon"/><circle cx="55.5" cy="11.5" r="4.2" class="f-orb"/>';
    } else if (sys === "Artifact") {    // lingkaran logam melayang
      acc = '<circle cx="50" cy="40" r="6.5" class="f-ring"/><circle cx="50" cy="40" r="2" class="f-orb"/>';
    } else if (sys === "Mutation") {    // cakar
      acc = '<path d="M46 43l11-4M46 43l12 1M46 43l9 7" class="f-claw"/>';
    } else if (sys === "Confer") {      // sayap kecil di punggung
      acc = '<path d="M30 30C19 21 9 22 5 28c8 1 15 5 25 10Zm0 0c11-9 21-8 25-2-8 1-15 5-25 10Z" class="f-wing"/>';
    } else {                            // pedang pendek polos
      acc = '<path d="M47 43 57 25" class="f-weapon"/>';
    }
    var face = dead
      ? '<path d="M25.5 11.5l4 4M29.5 11.5l-4 4M33.5 11.5l4 4M37.5 11.5l-4 4" class="f-x"/>'
      : '<circle cx="27.5" cy="13.5" r="1.3" class="f-eye"/><circle cx="34.5" cy="13.5" r="1.3" class="f-eye"/>';
    var emblem = "";
    if (unit.image && !dead) {
      emblem = '<clipPath id="fc-' + id + '"><circle cx="31" cy="38" r="6.6"/></clipPath>' +
        '<image href="' + unit.image + '" x="24.4" y="31.4" width="13.2" height="13.2" clip-path="url(#fc-' + id + ')" preserveAspectRatio="xMidYMid slice"/>' +
        '<circle cx="31" cy="38" r="6.6" class="f-emb-ring"/>';
    }
    return '<svg viewBox="0 0 64 92" class="fh-svg" aria-hidden="true">' +
      '<ellipse cx="31" cy="87" rx="17" ry="3.6" class="f-shadow"/>' +
      '<g class="f-body">' +
        '<path d="M31 24v32" class="f-line"/>' +                       // badan
        '<path d="M31 31 17 45M31 31l16 12" class="f-line"/>' +        // lengan
        '<path d="M31 56 20 84M31 56l11 28" class="f-line"/>' +        // kaki
        '<circle cx="31" cy="14" r="9.2" class="f-head"/>' +
        face + acc + emblem +
      '</g></svg>';
  }

  /* ---------- efek status di tubuh ---------- */
  function mk(cls, n, extra) {
    var d = h("div", "fx " + cls);
    for (var i = 0; i < n; i++) {
      var s = h("i", null, extra || "");
      s.style.setProperty("--i", i);
      d.appendChild(s);
    }
    return d;
  }

  var STAT_COLOR = { attack: "#ffb347", defense: "#6bb8ff", speed: "#7dffb0" };

  function statusFxList(unit) {
    var out = [];
    var seen = {};
    function add(key, el) { if (!seen[key]) { seen[key] = 1; out.push(el); } }

    if (isFrozenUnit(unit)) add("freeze", mk("fx-freeze", 3));
    unit.statusEffects.forEach(function (e) {
      switch (e.type) {
        case "dot":
          if (e.stat === "burn") add("burn", mk("fx-burn", 4));
          else add("poison", mk("fx-poison", 6));
          break;
        case "stun": add("stun", mk("fx-stun", 3, "✦")); break;
        case "blind": add("blind", mk("fx-blind", 1)); break;
        case "buff": {
          var b = mk("fx-buff", 4, "▲");
          b.style.setProperty("--c", STAT_COLOR[e.stat] || "#ffd84a");
          add("buff" + e.stat, b);
          break;
        }
        case "debuff": {
          var d = mk("fx-debuff", 4, "▼");
          d.style.setProperty("--c", "#b36bff");
          add("debuff" + e.stat, d);
          break;
        }
        case "regen": case "teamregen": add("regen", mk("fx-regen", 4, "+")); break;
        case "fireres": add("fireres", mk("fx-fireres", 1)); break;
        case "swift": add("swift", mk("fx-swift", 4)); break;
        case "slow": add("slow", mk("fx-slow", 3, "z")); break;
        case "pulled": add("pulled", mk("fx-pulled", 1)); break;
        case "suck": add("suck", mk("fx-suck", 2)); break;
        default: break;
      }
    });
    var shieldAmt = 0, absolute = false;
    (unit.shieldLayers || []).forEach(function (l) {
      if (l.kind === "absolute") absolute = true; else shieldAmt += l.amount;
    });
    if (absolute) add("shield", mk("fx-shield fx-shield-abs", 1));
    else if (shieldAmt > 0) add("shield", mk("fx-shield", 1));
    if (unit.mirrorTurns > 0) add("mirror", mk("fx-mirror", 1));
    if (PHASE_LOCK && PHASE_LOCK[unit.team] > 0) add("timelock", mk("fx-timelock", 1));
    if (isChargingUnit(unit)) add("charge", mk("fx-charge", 3));
    if (unit.holeSize > 0) add("hole", mk("fx-holebearer", 1));
    return out;
  }

  /* ---------- bar ---------- */
  function bar(key, kind, prefix, cur, max, extraText) {
    var b = h("div", "fh-bar " + kind);
    b.dataset.bar = key;
    var fill = h("i", "fh-fill");
    fill.style.width = pctW(cur, max) + "%";
    var pre = h("span", "fh-pre", prefix);
    var val = h("span", "fh-val", rnd(cur) + "/" + rnd(max) + (extraText || ""));
    b.appendChild(fill);
    b.appendChild(pre);
    b.appendChild(val);
    return b;
  }

  function energyPrefix(unit) {
    if (unit.energy === "charge") return "CH";
    if (unit.energy === "energy") return "EN";
    return "MP";
  }

  /* ---------- pembangun karakter ---------- */
  function createFighter(unit) {
    var slot = h("div", "char-slot fighter team-" + unit.team + "-slot");
    slot.dataset.unitId = unit.id;

    /* status interaksi: sama persis dengan kartu lama */
    if (!unit.alive) {
      slot.classList.add("dead");
      if (pendingItem) {
        if (getValidItemTargets(pendingItem).some(function (t) { return t.id === unit.id; })) slot.classList.add("valid-target");
      }
      if (pendingActor && pendingSkill && pendingSkill.target === "dead_ally") {
        if (getValidTargets(pendingActor, pendingSkill).some(function (t) { return t.id === unit.id; })) slot.classList.add("valid-target");
      }
      if (unit._fall) { slot.classList.add("falling"); unit._fall = false; }
    } else {
      if (pendingItem) {
        if (getValidItemTargets(pendingItem).some(function (t) { return t.id === unit.id; })) slot.classList.add("valid-target");
      } else if (pendingActor && pendingSkill) {
        if (getValidTargets(pendingActor, pendingSkill).some(function (t) { return t.id === unit.id; })) slot.classList.add("valid-target");
      } else if (currentPhase === "player" && unit.team === "player" && !battleEnded && !pendingItem) {
        slot.classList.add("clickable");
      }
      if (pendingActor && pendingActor.id === unit.id) slot.classList.add("active-turn");
      if (bonusUnitId !== null) {
        slot.classList.remove("clickable");
        if (bonusUnitId === unit.id) slot.classList.add("bonus-ready", "clickable");
      }
      if (isFrozenUnit(unit)) slot.classList.add("frozen");
      if (hasEffect(unit, "blind")) slot.classList.add("is-blind");
      if (PHASE_LOCK[unit.team] > 0) slot.classList.add("timelocked");
      if (isChargingUnit(unit)) slot.classList.add("charging");
    }
    if (pendingActor && pendingSkill && pendingSkill.target === "dead_ally") {
      if (unit.alive) slot.classList.remove("valid-target");
    }
    slot.addEventListener("click", function () { onUnitSlotClick(unit.id); });

    /* ----- HUD: papan nama + bar di sampingnya ----- */
    var hud = h("div", "fh-hud");
    var board = h("div", "fh-name");
    board.appendChild(h("span", "fh-name-text", unit.name));
    hud.appendChild(board);

    var bars = h("div", "fh-bars");
    var hp = bar("hp", "hp", "HP", unit.currentHP, unit.maxHP);
    if (unit.shieldLayers && unit.shieldLayers.length > 0) {
      attachHoldHint(hp, function () { return shieldHintText(unit); });
    }
    bars.appendChild(hp);
    var mk2 = unit.energy === "energy" ? (unit.powerSystem === "Mutation" ? "energy mutation" : "energy") : (unit.energy === "charge" ? "charge" : "mana");
    bars.appendChild(bar("energy", mk2, energyPrefix(unit), unit.currentMana, unit.maxMana));
    if (unit.powerSystem === "Mutation" && unit.maxEssence) {
      bars.appendChild(bar("essence", "essence", "BE", unit.essence, unit.maxEssence));
    } else if (unit.powerSystem === "Confer" && unit.maxResonance) {
      bars.appendChild(bar("res", "resonance", "RES", unit.resonance, unit.maxResonance));
    }
    hud.appendChild(bars);
    slot.appendChild(hud);

    /* ----- panggung: orang lidi + lencana di sampingnya ----- */
    var stage = h("div", "fh-stage");
    var fig = h("div", "fh-fig");
    fig.innerHTML = figureSvg(unit);
    var fxLayer = h("div", "fh-fx");
    if (unit.alive) statusFxList(unit).forEach(function (e) { fxLayer.appendChild(e); });
    fig.appendChild(fxLayer);
    fig.appendChild(h("div", "fh-mark"));  // penanda: giliran aktif / target
    stage.appendChild(fig);

    var side = h("div", "fh-side");
    if (unit.alive) {
      var seenBadge = {};
      unit.statusEffects.forEach(function (effect) {
        if (effect.type === "frozen") return;
        var key = effect.type + (effect.stat || "");
        if (seenBadge[key] && effect.type === "dot") return; // racun/bakar menumpuk: satu lencana + chip total
        seenBadge[key] = 1;
        var badge = h("span", "status-badge status-" + effect.type + (effect.type === "dot" ? "-" + effect.stat : ""), getStatusBadgeText(effect));
        attachHoldHint(badge, function () { return describeStatusEffect(effect); });
        side.appendChild(badge);
      });
      if (unit.shieldLayers && unit.shieldLayers.length > 0 && shieldLabelText(unit)) {
        var sb = h("span", "status-badge status-shield", shieldLabelText(unit));
        attachHoldHint(sb, function () { return shieldHintText(unit); });
        side.appendChild(sb);
      }
      if (isFrozenUnit(unit)) {
        var ft = h("span", "status-badge status-frozen", "🧊 Beku");
        attachHoldHint(ft, function () { return "🧊 Beku: kebal damage dan tidak bisa bermain selama masih ada teman yang tidak beku. Tidak menerima heal, shield, atau ramuan; hanya efek merugikan dari artefak yang bisa masuk."; });
        side.appendChild(ft);
      }
      addChips(unit, side);
    }
    stage.appendChild(side);
    slot.appendChild(stage);
    return slot;
  }

  /* lencana khusus: Afsoul, dkg, Black Hole, Cermin, Charging, Time Frozen, racun/bakar menumpuk */
  function addChips(unit, side) {
    function chip(cls, text, hint) {
      var c = h("span", "mech-chip " + cls, text);
      if (hint) attachHoldHint(c, function () { return hint; });
      side.appendChild(c);
    }
    if (isChargingUnit(unit)) {
      chip("chip-charging", "⚡ Charging " + unit.charging + "t",
        "Charging Energy: karakter ini tidak bisa dipakai. Charge langsung penuh setelah " + unit.charging + " giliran jalan timnya.");
    }
    if (PHASE_LOCK[unit.team] > 0) {
      chip("chip-timelock", "⏳ Time Frozen x" + PHASE_LOCK[unit.team],
        "Time Frozen: giliran tim ini dicuri " + PHASE_LOCK[unit.team] + " kali. Bukan stun: tetap bisa kena damage, racun/bakar tetap jalan.");
    }
    if (unit.afsoul !== undefined) {
      chip("chip-afsoul", "👁 Afsoul x" + unit.afsoul, "Afsoul: tumpukan ketakutan jiwa. Dipakai NIGHTMARE (Blind + curi giliran sebanyak stack), lalu kembali ke 0.");
    }
    if (unit.dkg !== undefined) {
      chip("chip-dkg", "💨 dkg " + unit.dkg, "dkg: tumpukan damage. Boom! memberi damage 50% dari dkg ke semua musuh, lalu dkg kembali ke 0.");
    }
    if (unit.holeSize > 0) {
      chip("chip-hole", "🕳️ " + unit.holeSize,
        "Black Hole: membesar 2x lipat tiap putaran tim ini (maks " + HOLE_MAX + "). Skill 6 lagi = meledak, damage sebesar ukurannya ke semua musuh. Lenyap kalau pemiliknya kalah.");
    }
    var stacks = dotStacksOf(unit);
    Object.keys(stacks).forEach(function (stat) {
      var st = stacks[stat];
      if (st.n >= 2) {
        chip("chip-dotstack", (stat === "burn" ? "🔥 x" : "☠️ x") + st.n + " -" + st.total,
          (stat === "burn" ? "Bakar" : "Racun") + " menumpuk " + st.n + " kali: tiap efek jalan sendiri, total -" + st.total + " HP tiap giliran.");
      }
    });
    if (unit.mirrorTurns > 0) {
      chip("chip-mirror", "🪞 Cermin " + unit.mirrorTurns + "p", "Cermin Kutukan: semua damage yang mengenai karakter ini dipantulkan penuh ke penyerang.");
    }
    if (unit.powerSystem === "Mutation" && unit.essence >= unit.maxEssence) {
      chip("chip-essence", "🩸 Essence penuh", "Blood Essence penuh: HP bertambah tiap giliran tim. Jangan abaikan karakter ini.");
    }
  }

  createUnitSlotElement = createFighter;

  /* ---------- penyusunan tim ---------- */
  renderTeamSlots = function (team) {
    var container = document.getElementById(team === "player" ? "player-slots" : "enemy-slots");
    container.innerHTML = "";
    var units = allUnits.filter(function (u) { return u.team === team; });
    container.className = "slot-list fighters n" + units.length;
    var sec = document.getElementById(team === "player" ? "team-player" : "team-enemy");
    if (sec) sec.classList.toggle("few", units.length <= 2);
    units.forEach(function (unit) { container.appendChild(createUnitSlotElement(unit)); });
  };

  /* ---------- update bar langsung (tanpa menggambar ulang) ---------- */
  updateUnitBarsInPlace = function (u) {
    var slot = document.querySelector('.fighter[data-unit-id="' + u.id + '"]');
    if (!slot) return;
    function setBar(key, cur, max, extra) {
      var b = slot.querySelector('[data-bar="' + key + '"]');
      if (!b) return;
      var f = b.querySelector(".fh-fill"), v = b.querySelector(".fh-val");
      if (f) f.style.width = pctW(cur, max) + "%";
      if (v) v.textContent = rnd(cur) + "/" + rnd(max) + (extra || "");
    }
    setBar("hp", u.currentHP, u.maxHP);
    if (u.maxResonance) setBar("res", u.resonance, u.maxResonance);
    if (u.maxEssence) setBar("essence", u.essence, u.maxEssence);
  };

  /* ============================================
     EFEK AKSI (lapisan melayang di atas arena)
     ============================================ */
  var layer = null;
  function getLayer() {
    if (!layer || !layer.parentNode) {
      layer = document.createElement("div");
      layer.id = "fx-layer";
      document.body.appendChild(layer);
    }
    return layer;
  }
  function figRect(id) {
    var f = document.querySelector('.fighter[data-unit-id="' + id + '"] .fh-fig');
    if (!f) f = document.querySelector('.fighter[data-unit-id="' + id + '"]');
    if (!f) return null;
    var r = f.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.45, top: r.top, w: r.width, h: r.height };
  }
  function visible() {
    var bs = document.getElementById("battle-screen");
    return !!bs && !bs.classList.contains("hidden");
  }
  function drop(el, ms) {
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, ms);
  }

  function popup(id, text, cls, size) {
    if (!visible()) return;
    var r = figRect(id);
    if (!r) return;
    var p = h("div", "fx-pop " + cls, text);
    p.style.left = (r.x + (Math.random() * 16 - 8)) + "px";
    p.style.top = (r.top + r.h * 0.1) + "px";
    if (size) p.style.fontSize = size + "px";
    getLayer().appendChild(p);
    drop(p, 1300);
  }

  function burst(x, y, color, big) {
    var L = getLayer();
    var b = h("div", "fx-burst");
    b.style.left = x + "px"; b.style.top = y + "px";
    b.style.setProperty("--c", color);
    if (big) b.classList.add("big");
    L.appendChild(b);
    for (var i = 0; i < (big ? 10 : 6); i++) {
      var s = h("div", "fx-spark");
      s.style.left = x + "px"; s.style.top = y + "px";
      s.style.setProperty("--c", color);
      s.style.setProperty("--a", (i * (360 / (big ? 10 : 6)) + Math.random() * 20) + "deg");
      L.appendChild(s);
      drop(s, 700);
    }
    drop(b, 700);
  }

  function slash(x, y, color) {
    var s = h("div", "fx-slash");
    s.style.left = x + "px"; s.style.top = y + "px";
    s.style.setProperty("--c", color);
    getLayer().appendChild(s);
    drop(s, 500);
  }

  function rise(x, y, glyph, color, n) {
    var L = getLayer();
    for (var i = 0; i < n; i++) {
      var g = h("div", "fx-rise", glyph);
      g.style.left = (x + (i - (n - 1) / 2) * 11) + "px";
      g.style.top = y + "px";
      g.style.setProperty("--c", color);
      g.style.animationDelay = (i * 70) + "ms";
      L.appendChild(g);
      drop(g, 1300);
    }
  }

  function ring(x, y, color) {
    var r = h("div", "fx-ring");
    r.style.left = x + "px"; r.style.top = y + "px";
    r.style.setProperty("--c", color);
    getLayer().appendChild(r);
    drop(r, 800);
  }

  function orb(from, to, color, ms, done) {
    var o = h("div", "fx-orb");
    o.style.setProperty("--c", color);
    getLayer().appendChild(o);
    var dx = to.x - from.x, dy = to.y - from.y;
    var anim = o.animate([
      { transform: "translate(" + from.x + "px," + from.y + "px) scale(.5)", opacity: 0.2 },
      { transform: "translate(" + (from.x + dx * 0.5) + "px," + (from.y + dy * 0.5 - 18) + "px) scale(1.15)", opacity: 1, offset: 0.55 },
      { transform: "translate(" + to.x + "px," + to.y + "px) scale(.9)", opacity: 1 }
    ], { duration: ms, easing: "cubic-bezier(.35,0,.65,1)", fill: "forwards" });
    var finish = function () { if (o.parentNode) o.parentNode.removeChild(o); if (done) done(); };
    anim.onfinish = finish;
    setTimeout(function () { if (o.parentNode) finish(); }, ms + 120);
  }

  var SKILL_COLOR = { attack: "#ff7a3d", heal: "#5af08a", shield: "#6ad4ff", buff: "#ffd84a", debuff: "#b36bff", other: "#ffffff" };
  function colorForSkill(skill) {
    var e = skill.effect;
    if (e) {
      if (e.type === "dot") return e.stat === "burn" ? "#ff9a1f" : "#7dff6a";
      if (e.type === "freeze") return "#9fe3ff";
      if (e.type === "stun") return "#ffe34a";
      if (e.type === "blind") return "#b06bff";
    }
    if (skill.type === "single_attack" || skill.type === "area_attack") return SKILL_COLOR.attack;
    if (skill.type === "healing" || skill.type === "mana_recovery") return skill.type === "healing" ? SKILL_COLOR.heal : "#6aa8ff";
    return SKILL_COLOR[skill.type] || SKILL_COLOR.other;
  }

  function addClassTemp(id, sel, cls, ms) {
    var el = document.querySelector('.fighter[data-unit-id="' + id + '"] ' + sel);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, ms);
  }

  /* ---------- antrean angka melayang ---------- */
  var queue = [];
  var scheduled = false;
  function enqueue(ev) {
    queue.push(ev);
    if (!scheduled) { scheduled = true; setTimeout(flush, 0); }
  }
  function flush() {
    scheduled = false;
    var evs = queue; queue = [];
    if (!visible()) return;
    evs.forEach(function (ev, i) {
      setTimeout(function () {
        if (ev.kind === "dmg") {
          var big = ev.ratio >= 0.25;
          popup(ev.id, "-" + ev.amount, big ? "pop-dmg pop-big" : "pop-dmg", Math.round(13 + Math.min(1, ev.ratio * 2.2) * 12));
          addClassTemp(ev.id, ".fh-fig", "hit", 420);
          if (big) shake();
        } else if (ev.kind === "absorb") {
          popup(ev.id, "🛡 -" + ev.amount, "pop-shield", 13);
          addClassTemp(ev.id, ".fh-fig", "hit-soft", 300);
        } else if (ev.kind === "immune") {
          popup(ev.id, ev.text, "pop-immune", 12);
        } else if (ev.kind === "heal") {
          popup(ev.id, "+" + ev.amount, "pop-heal", 14);
          var r = figRect(ev.id);
          if (r) rise(r.x, r.y + 6, "+", "#5af08a", 3);
        } else if (ev.kind === "shield") {
          popup(ev.id, "+" + ev.amount + " 🛡", "pop-shield", 13);
        } else if (ev.kind === "status") {
          popup(ev.id, ev.text, "pop-status", 11);
        }
      }, i * 70);
    });
  }
  function shake() {
    var bs = document.getElementById("battle-screen");
    if (!bs) return;
    bs.classList.remove("fx-shake");
    void bs.offsetWidth;
    bs.classList.add("fx-shake");
    setTimeout(function () { bs.classList.remove("fx-shake"); }, 450);
  }

  /* ---------- pembungkus fungsi inti ---------- */
  applyDamage = (function (orig) {
    return function (unit, rawAmount) {
      var hp0 = unit.currentHP, alive0 = unit.alive;
      var shield0 = typeof unit.shield === "number" ? unit.shield : 0;
      var r = orig.apply(this, arguments);
      var lost = Math.round(hp0 - unit.currentHP);
      var absorbed = Math.round(Math.max(0, shield0 - (typeof unit.shield === "number" ? unit.shield : 0)));
      if (lost > 0) enqueue({ kind: "dmg", id: unit.id, amount: lost, ratio: lost / Math.max(1, unit.maxHP) });
      else if (absorbed > 0) enqueue({ kind: "absorb", id: unit.id, amount: absorbed });
      else if (rawAmount > 0) enqueue({ kind: "immune", id: unit.id, text: isFrozenUnit(unit) ? "Kebal 🧊" : "Kebal" });
      if (alive0 && !unit.alive) unit._fall = true;
      return r;
    };
  })(applyDamage);

  applyHeal = (function (orig) {
    return function (unit, amount) {
      var hp0 = unit.currentHP;
      var r = orig.apply(this, arguments);
      var gained = Math.round(unit.currentHP - hp0);
      if (gained > 0) enqueue({ kind: "heal", id: unit.id, amount: gained });
      return r;
    };
  })(applyHeal);

  applyShield = (function (orig) {
    return function (unit, amount, options) {
      var r = orig.apply(this, arguments);
      if (amount > 0) enqueue({ kind: "shield", id: unit.id, amount: Math.round(amount) });
      return r;
    };
  })(applyShield);

  var STATUS_WORD = { stun: "STUN", blind: "BLIND", frozen: "BEKU", slow: "LAMBAT", swift: "CEPAT", regen: "REGEN", fireres: "TAHAN API" };
  applyStatusEffect = (function (orig) {
    return function (source, target, effect) {
      var n0 = target.statusEffects.length;
      var r = orig.apply(this, arguments);
      if (target.statusEffects.length > n0 && target.alive) {
        var t = null;
        if (effect.type === "dot") t = effect.stat === "burn" ? "🔥 BAKAR" : "☠ RACUN";
        else if (effect.type === "buff") t = "▲ " + (statLabel ? statLabel(effect.stat) : effect.stat);
        else if (effect.type === "debuff") t = "▼ " + (statLabel ? statLabel(effect.stat) : effect.stat);
        else t = STATUS_WORD[effect.type] || null;
        if (t) enqueue({ kind: "status", id: target.id, text: t });
      }
      return r;
    };
  })(applyStatusEffect);

  /* Aksi skill: bola energi dari penyerang ke sasaran + ledakan + gerak maju penyerang. */
  runSkill = (function (orig) {
    return function (caster, skill, targets, isEnemy) {
      var plan = null;
      try {
        if (visible()) {
          var from = figRect(caster.id);
          var tg = (targets || []).filter(function (t) { return t && t.id !== caster.id; });
          var self = (targets || []).some(function (t) { return t && t.id === caster.id; });
          plan = {
            from: from,
            to: tg.map(function (t) { return { id: t.id, r: figRect(t.id) }; }),
            self: self,
            color: colorForSkill(skill),
            type: skill.type,
            area: skill.type === "area_attack" || skill.target === "all_enemies" || skill.target === "all_allies"
          };
        }
      } catch (e) { plan = null; }

      var result = orig.apply(this, arguments);

      try {
        if (plan && plan.from) playSkillFx(caster, skill, plan);
      } catch (e) { console.error(e); }
      return result;
    };
  })(runSkill);

  function playSkillFx(caster, skill, plan) {
    addClassTemp(caster.id, ".fh-fig", "act", 450);
    // Efek elemen + sorotan skill 6 dari arenaFx.js (kalau termuat). Kalau tidak, pakai efek bawaan di bawah.
    if (window.ArenaFX && window.ArenaFX.playSkill(caster, skill, plan)) return;
    var isAtk = plan.type === "single_attack" || plan.type === "area_attack";
    var ms = 300;
    plan.to.forEach(function (t, i) {
      if (!t.r) return;
      setTimeout(function () {
        orb(plan.from, t.r, plan.color, ms, function () {
          burst(t.r.x, t.r.y, plan.color, plan.area);
          if (isAtk) slash(t.r.x, t.r.y, plan.color);
          else if (plan.type === "healing") rise(t.r.x, t.r.y + 8, "✚", "#5af08a", 3);
          else if (plan.type === "shield") ring(t.r.x, t.r.y, "#6ad4ff");
          else if (plan.type === "buff") rise(t.r.x, t.r.y + 10, "▲", "#ffd84a", 3);
          else if (plan.type === "debuff") rise(t.r.x, t.r.y - 4, "▼", "#b36bff", 3);
        });
      }, i * 60);
    });
    if (plan.self) {
      var f = plan.from;
      if (plan.type === "healing") rise(f.x, f.y + 8, "✚", "#5af08a", 3);
      else if (plan.type === "shield") ring(f.x, f.y, "#6ad4ff");
      else if (plan.type === "buff") rise(f.x, f.y + 10, "▲", "#ffd84a", 3);
      else if (plan.type === "debuff") rise(f.x, f.y - 4, "▼", "#b36bff", 3);
      else ring(f.x, f.y, plan.color);
    }
    if (plan.area && isAtk) ring(plan.from.x, plan.from.y, plan.color);
  }

  window.FighterFX = { popup: popup, burst: burst, shake: shake };
})();
