/* ============================================
   ACCURANT - ARENAINTRO.JS
   Animasi loading saat memasuki arena (tanpa suara, tanpa efek ledakan).

   Alur (sekitar 3 detik):
   1. Pemain menekan "Mulai Pertarungan" (atau "Ulang")
   2. Musik latar memudar & hening, layar gelap muncul dengan
      lingkaran rune, bara api, dan bar pemuatan
   3. Bar penuh -> arena dibuka di balik layar, lalu layar loading
      memudar pelan sampai arena terlihat
   4. Musik latar TETAP hening selama peperangan. Setelah layar hasil
      muncul, musik kembali mengalun pelan.

   File ini MANDIRI: dia membungkus startBattle (main.js), jadi
   selection.js dan tombol Ulang otomatis ikut. Harus dimuat SETELAH main.js.
   ============================================ */

(function setupArenaIntro() {
  if (typeof startBattle !== "function") return;

  const LOAD_MS = 3000;     // lama bar pemuatan sampai penuh
  const FADE_OUT_MS = 1100; // layar loading memudar pelan setelah arena dibuka

  const FLAVOR = [
    "Di reruntuhan ini, hanya yang bertahan yang menulis sejarah.",
    "Bara belum padam. Begitu pula dendam mereka.",
    "Tak ada tempat berlindung selain kekuatan timmu sendiri.",
    "Langit retak, tanah berdarah. Arena memanggil.",
    "Setiap luka hari ini adalah kisah esok."
  ];

  let busy = false;

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // Lingkaran rune: 3 cincin berputar berlawanan arah + lambang pedang bersilang
  function runeSvg() {
    let ticks = "";
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const long = i % 4 === 0;
      const r1 = long ? 86 : 90, r2 = 96;
      ticks += '<line x1="' + (100 + Math.cos(a) * r1).toFixed(1) + '" y1="' + (100 + Math.sin(a) * r1).toFixed(1) +
               '" x2="' + (100 + Math.cos(a) * r2).toFixed(1) + '" y2="' + (100 + Math.sin(a) * r2).toFixed(1) + '"/>';
    }
    let glyphs = "";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = 100 + Math.cos(a) * 70, y = 100 + Math.sin(a) * 70;
      const rot = (a * 180) / Math.PI + 90;
      const shapes = [
        "M0-6 L5 4 L-5 4Z", "M-5-5 H5 V5 H-5Z", "M0-6 L6 0 L0 6 L-6 0Z", "M-5-5 L5 5 M5-5 L-5 5",
        "M0-6 V6 M-4-2 H4", "M-5 5 L0-6 L5 5Z M-3 1 H3", "M-5 0 A5 5 0 1 0 5 0 A5 5 0 1 0 -5 0", "M-5-4 L5-4 M0-4 V6"
      ];
      glyphs += '<path transform="translate(' + x.toFixed(1) + " " + y.toFixed(1) + ") rotate(" + rot.toFixed(1) + ')" d="' + shapes[i] + '"/>';
    }
    return '' +
      '<svg class="ai-rune" viewBox="0 0 200 200" aria-hidden="true">' +
        '<g class="ai-ring ai-ring-a"><circle cx="100" cy="100" r="97"/><circle cx="100" cy="100" r="84"/>' + ticks + '</g>' +
        '<g class="ai-ring ai-ring-b"><circle cx="100" cy="100" r="76" stroke-dasharray="3 5"/>' + glyphs + '</g>' +
        '<g class="ai-ring ai-ring-c"><circle cx="100" cy="100" r="58"/><path d="M100 42 L142 100 L100 158 L58 100Z"/></g>' +
        '<g class="ai-core">' +
          '<path d="M78 78 L122 122 M122 78 L78 122"/>' +
          '<path d="M72 72 l8 2 -2 8 M128 72 l-8 2 2 8"/>' +
          '<circle cx="100" cy="100" r="6"/>' +
        '</g>' +
      '</svg>';
  }

  function buildOverlay() {
    const root = el("div", "arena-intro");
    root.id = "arena-intro";

    root.appendChild(el("div", "ai-vignette"));
    const embers = el("div", "ai-embers");
    for (let i = 0; i < 28; i++) {
      const b = el("span", "ai-ember");
      b.style.left = (Math.random() * 100).toFixed(1) + "%";
      b.style.setProperty("--d", (3 + Math.random() * 4).toFixed(2) + "s");
      b.style.setProperty("--dl", (-Math.random() * 6).toFixed(2) + "s");
      b.style.setProperty("--s", (2 + Math.random() * 3.5).toFixed(1) + "px");
      b.style.setProperty("--x", ((Math.random() - 0.5) * 80).toFixed(0) + "px");
      embers.appendChild(b);
    }
    root.appendChild(embers);

    const center = el("div", "ai-center");
    const sigil = el("div", "ai-sigil");
    sigil.appendChild(el("div", "ai-glow"));
    sigil.insertAdjacentHTML("beforeend", runeSvg());
    center.appendChild(sigil);

    center.appendChild(el("div", "ai-title", "MEMASUKI ARENA"));
    center.appendChild(el("div", "ai-stage", "")); // diisi saat tampil

    const bar = el("div", "ai-bar");
    bar.appendChild(el("div", "ai-bar-fill"));
    center.appendChild(bar);
    center.appendChild(el("div", "ai-flavor", ""));
    root.appendChild(center);

    return root;
  }

  function stageLabel() {
    try {
      if (typeof arenaModeLabel === "function") return arenaModeLabel(); // arena.js
    } catch (e) { /* abaikan */ }
    return "Arena";
  }

  const originalStartBattle = startBattle;

  startBattle = function (chosenTeam) {
    if (busy) return; // cegah ketukan ganda
    busy = true;

    const overlay = buildOverlay();
    overlay.querySelector(".ai-stage").textContent = stageLabel();
    const flavorEl = overlay.querySelector(".ai-flavor");
    flavorEl.textContent = FLAVOR[Math.floor(Math.random() * FLAVOR.length)];
    document.body.appendChild(overlay);

    if (window.AccurantAudio) window.AccurantAudio.holdMusic(true); // musik latar memudar & hening

    // paksa reflow supaya transisi masuk berjalan
    void overlay.offsetWidth;
    overlay.classList.add("show");
    overlay.querySelector(".ai-bar-fill").style.transitionDuration = LOAD_MS + "ms";
    requestAnimationFrame(function () { overlay.classList.add("loading"); });

    // Ganti kalimat bayangan di tengah proses
    const flavorTimer = setTimeout(function () {
      flavorEl.classList.add("swap");
      setTimeout(function () {
        flavorEl.textContent = FLAVOR[Math.floor(Math.random() * FLAVOR.length)];
        flavorEl.classList.remove("swap");
      }, 350);
    }, Math.round(LOAD_MS * 0.55));

    // Bar penuh: buka arena di balik layar, lalu pudarkan layar loading dengan halus
    setTimeout(function () {
      clearTimeout(flavorTimer);
      try {
        originalStartBattle.call(window, chosenTeam); // main.js: pindah ke arena & mulai battle
      } catch (err) {
        console.error(err);
      }
      if (window.AccurantAudio) window.AccurantAudio.holdMusic(false); // arena aktif -> ambience.js tetap menahan musik

      overlay.classList.add("leave");
      setTimeout(function () {
        overlay.remove();
        busy = false;
      }, FADE_OUT_MS + 100);
    }, LOAD_MS);
  };
})();
