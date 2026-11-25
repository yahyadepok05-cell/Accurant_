/* ============================================
   ACCURANT - BATTLEMENU.JS
   Tombol MENU di tengah atas arena. Isinya:
   - Lanjut    : kembali ke pertarungan
   - Menyerah  : (ada konfirmasi) pertarungan dihitung kalah

   Saat menu terbuka pertarungan benar-benar DIJEDA: aksi musuh yang
   sedang menunggu ditahan, lalu dilanjutkan persis setelah "Lanjut".
   Status jeda dibagikan lewat window.battlePaused supaya timer giliran
   pemain dan tick Resonance (mechanics.js) ikut berhenti.
   Harus dimuat SETELAH battle.js dan account.js. Gaya ada di css/arena-ui.css.
   ============================================ */

(function setupBattleMenu() {
  if (typeof performOneEnemyTurn !== "function" || typeof handleBattleLoss !== "function") return;

  let paused = false;
  window.battlePaused = false; // dibaca mechanics.js (timer giliran & tick Resonance)
  const pending = []; // aksi musuh yang jatuh tempo saat dijeda

  /* ---------- Jeda: tahan fungsi giliran musuh ---------- */
  function makePausable(name) {
    const original = window[name];
    if (typeof original !== "function") return;
    window[name] = function () {
      if (paused) {
        pending.push({ fn: original, self: this, args: arguments });
        return;
      }
      return original.apply(this, arguments);
    };
  }
  makePausable("performOneEnemyTurn"); // battle.js (setTimeout giliran musuh)
  makePausable("executeSkillForEnemy"); // battle.js (aksi musuh setelah jeda 0,7 dtk)

  function flushPending() {
    const jobs = pending.splice(0, pending.length);
    jobs.forEach(function (job) { job.fn.apply(job.self, job.args); });
  }

  /* ---------- Elemen ---------- */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  const ICON_PAUSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9" rx="0.6"/><rect x="7" y="1.5" width="3" height="9" rx="0.6"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5 12 7 3 12.5Z"/></svg>';
  const ICON_FLAG = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1v12M3 2h8l-2 3 2 3H3Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>';

  const menuBtn = el("button", "bm-btn bm-hidden", ICON_PAUSE + "<span>MENU</span>");
  menuBtn.setAttribute("aria-label", "Menu pertarungan");
  document.body.appendChild(menuBtn);

  const modal = el("div", "bm-modal");
  const panel = el("div", "bm-panel");

  const viewMain = el("div", "bm-view active");
  viewMain.appendChild(el("div", "bm-title", "DIJEDA"));
  viewMain.appendChild(el("div", "bm-sub", "Pertarungan berhenti sejenak. Ambil napas, lalu tentukan langkahmu."));
  viewMain.appendChild(el("div", "bm-rule"));
  const goBtn = el("button", "bm-opt bm-opt-go", ICON_PLAY + "<span>LANJUT</span>");
  const quitBtn = el("button", "bm-opt bm-opt-quit", ICON_FLAG + "<span>MENYERAH</span>");
  viewMain.appendChild(goBtn);
  viewMain.appendChild(quitBtn);

  const viewConfirm = el("div", "bm-view");
  viewConfirm.appendChild(el("div", "bm-title", "MENYERAH?"));
  viewConfirm.appendChild(el("div", "bm-sub", "Pertarungan ini akan dihitung kalah dan kamu kembali ke layar hasil."));
  viewConfirm.appendChild(el("div", "bm-rule"));
  const sureBtn = el("button", "bm-opt bm-opt-quit-hard", "<span>YA, MENYERAH</span>");
  const backBtn = el("button", "bm-opt bm-opt-back", "<span>KEMBALI</span>");
  viewConfirm.appendChild(sureBtn);
  viewConfirm.appendChild(backBtn);

  panel.appendChild(viewMain);
  panel.appendChild(viewConfirm);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  function showView(which) {
    viewMain.classList.toggle("active", which === "main");
    viewConfirm.classList.toggle("active", which === "confirm");
  }

  /* ---------- Tampil/sembunyi tombol sesuai layar ---------- */
  function isShown(id) {
    const e = document.getElementById(id);
    return !!e && !e.classList.contains("hidden");
  }

  function refreshButton() {
    const inBattle = isShown("battle-screen") && !isShown("result-screen") && !battleEnded; // battleEnded: battle.js
    const introOn = !!document.getElementById("arena-intro"); // loading arena (arenaIntro.js)
    menuBtn.classList.toggle("bm-hidden", !inBattle || introOn || paused);
  }

  ["battle-screen", "result-screen"].forEach(function (id) {
    const target = document.getElementById(id);
    if (target) new MutationObserver(refreshButton).observe(target, { attributes: true, attributeFilter: ["class"] });
  });
  // Loading arena muncul/hilang di <body>
  new MutationObserver(refreshButton).observe(document.body, { childList: true });
  refreshButton();

  /* ---------- Buka / tutup ---------- */
  function openMenu() {
    if (paused || battleEnded) return;
    paused = true;
    window.battlePaused = true;
    showView("main");
    modal.classList.add("show");
    refreshButton();
  }

  function resume() {
    if (!paused) return;
    paused = false;
    window.battlePaused = false;
    modal.classList.remove("show");
    refreshButton();
    setTimeout(flushPending, 250); // beri jeda sebentar agar menu sempat menutup
  }

  function surrender() {
    paused = false;
    window.battlePaused = false;
    pending.length = 0; // buang aksi musuh yang tertunda
    modal.classList.remove("show");
    if (battleEnded) { refreshButton(); return; }

    battleEnded = true; // battle.js: hentikan semua giliran
    hideEnemyThinking();
    logMessage("=== KAMU MENYERAH ===");
    hideSkillPanel();
    hideItemPanel();
    handleBattleLoss(); // account.js: layar hasil (kalah)
    const title = document.getElementById("result-title");
    if (title) title.textContent = "Kamu Menyerah";
    refreshButton();
  }

  menuBtn.addEventListener("click", openMenu);
  goBtn.addEventListener("click", resume);
  quitBtn.addEventListener("click", function () { showView("confirm"); });
  backBtn.addEventListener("click", function () { showView("main"); });
  sureBtn.addEventListener("click", surrender);
})();