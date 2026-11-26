/* ============================================
   ACCURANT - UIPATCHES.JS  (Accurant 11)
   Tambalan tampilan kecil, dimuat PALING AKHIR (setelah storage.js):
   1. Akun pemula (0 koin, belum punya karakter): saat menekan "Masuk Arena"
      muncul pilihan 1 dari 3 karakter gratis (Steven, Rey, atau Eric),
      dengan animasi 3 kartu bertumpuk naik dari bawah lalu tersusun ke tengah.
      Dua yang tidak dipilih harus dibeli di Toko.
   2. (dihapus) dulu: gambar karakter Artifact / Mutation / Confer dikosongkan.
      Sekarang mereka memakai lambang dari systemEmblems.js.
   3. Keluar dari arena (mis. langsung ke beranda): banner, timer, dan bar
      "Giliran musuhmu" dibersihkan supaya tidak ikut tampil di beranda.
   4. Teks kesulitan & keterangan aturan Roulette di layar pilih tim.
   5. Ramuan penawar juga menghilangkan Blind.
   ============================================ */

/* ---------- 1. AKUN PEMULA ---------- */
const STARTER_IDS = ["char_steven", "char_rey", "char_eric"];

function needsStarterPick() {
  if (ownedCharacterIds.length > 0) return false;
  // Belum punya karakter DAN koin tidak cukup membeli karakter termurah = tawarkan karakter gratis.
  // (Dulu syaratnya koin tepat 0, jadi pemain dengan sisa koin kecil bisa terkunci tanpa karakter.)
  const prices = CHARACTER_DATABASE.filter(function (c) { return c.elite && c.price > 0; })
    .map(function (c) { return c.price; });
  const cheapest = prices.length ? Math.min.apply(null, prices) : 0;
  return playerAccount.coins < cheapest;
}

/**
 * Menampilkan pilihan karakter pemula. Setelah pemain memilih, `onDone` dipanggil
 * (dipakai untuk melanjutkan masuk ke Menu Arena).
 */
function showStarterPick(onDone) {
  if (document.getElementById("starter-modal")) return;

  const modal = document.createElement("div");
  modal.id = "starter-modal";
  modal.className = "starter-modal";
  const box = document.createElement("div");
  box.className = "starter-box";
  const title = document.createElement("h2");
  title.textContent = "Pilih Karakter Pertamamu";
  const sub = document.createElement("p");
  sub.textContent = "Pilih SATU karakter gratis untuk memulai. Dua lainnya bisa dibeli nanti di Toko.";
  box.appendChild(title);
  box.appendChild(sub);
  const row = document.createElement("div");
  row.className = "starter-row";
  const cards = [];

  STARTER_IDS.forEach(function (id, index) {
    const c = CHARACTER_DATABASE.find(function (x) { return x.id === id; });
    if (!c) return;
    const card = document.createElement("div");
    card.className = "starter-card";
    card.style.setProperty("--rot", ["-7deg", "0deg", "7deg"][index] || "0deg");
    card.style.setProperty("--lift", String(index * 4) + "px");
    card.style.setProperty("--delay", String(index * 90) + "ms");

    const portrait = document.createElement("div");
    portrait.className = "char-portrait starter-portrait";
    setPortrait(portrait, c);
    card.appendChild(portrait);

    const name = document.createElement("div");
    name.className = "starter-name";
    name.textContent = c.name;
    card.appendChild(name);
    const role = document.createElement("div");
    role.className = "starter-role";
    role.textContent = c.role;
    card.appendChild(role);
    const stat = document.createElement("div");
    stat.className = "starter-stat";
    stat.textContent = "❤ " + c.maxHP + "  ⚔ " + c.attack + "  " + energyName(c) + " " + c.maxMana;
    card.appendChild(stat);
    const skills = document.createElement("div");
    skills.className = "starter-skills";
    skills.textContent = c.skills.map(function (s) { return s.name; }).join(" · ");
    card.appendChild(skills);

    const btn = document.createElement("button");
    btn.className = "starter-btn";
    btn.textContent = "Pilih " + c.name;
    btn.addEventListener("click", function () {
      if (ownedCharacterIds.indexOf(id) === -1) ownedCharacterIds.push(id);
      if (typeof saveGame === "function") saveGame();
      modal.classList.add("leaving");
      setTimeout(function () {
        modal.remove();
        updateAccountBar();
        if (typeof onDone === "function") onDone();
      }, 280);
    });
    card.appendChild(btn);
    row.appendChild(card);
    cards.push(card);
  });

  box.appendChild(row);
  modal.appendChild(box);
  document.body.appendChild(modal);

  // Animasi masuk: ketiga kartu mulai BERTUMPUK di tengah (di bawah layar), naik bersama,
  // lalu menyebar rapi ke posisinya masing-masing.
  const place = function () {
    if (cards.length === 3) {
      const mid = cards[1].getBoundingClientRect();
      cards.forEach(function (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--dx", (mid.left - r.left) + "px");
      });
    }
    modal.classList.add("enter");
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(function () { requestAnimationFrame(place); });
  else place();
}

(function starterStyle() {
  const st = document.createElement("style");
  st.textContent = `
.starter-modal { position: fixed; inset: 0; z-index: 1500; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0); padding: 10px; overflow-y: auto; font-family: 'Georgia', serif; color: #ece6d6;
  transition: background .5s ease, opacity .28s ease; }
.starter-modal.enter { background: rgba(0,0,0,.9); }
.starter-modal.leaving { opacity: 0; }
.starter-box { max-width: 760px; width: 100%; text-align: center; margin: auto; }
.starter-box h2 { color: #e6cf9a; margin: 0 0 4px; letter-spacing: 2px; font-size: 1.15rem; opacity: 0; transition: opacity .5s ease .9s; }
.starter-box p { font-size: .78rem; opacity: 0; margin: 0 0 12px; transition: opacity .5s ease 1s; }
.starter-modal.enter .starter-box h2 { opacity: 1; }
.starter-modal.enter .starter-box p { opacity: .8; }
.starter-row { display: flex; gap: 10px; justify-content: center; align-items: stretch; }
.starter-card { flex: 1 1 0; max-width: 220px; min-width: 0; background: linear-gradient(170deg, #1a2336, #0e1420); border: 1.5px solid #b99a5b;
  border-radius: 10px; padding: 10px 8px; display: flex; flex-direction: column; align-items: center; gap: 4px;
  box-shadow: 0 6px 18px rgba(0,0,0,.6);
  transform: translate(var(--dx, 0px), 110vh) rotate(var(--rot, 0deg)); opacity: 0; }
/* tahap 1: naik dari bawah dalam keadaan bertumpuk; tahap 2: menyusun rapi ke tengah */
.starter-modal.enter .starter-card { animation: starter-in 1.5s cubic-bezier(.22,.8,.25,1) var(--delay, 0ms) both; }
@keyframes starter-in {
  0%   { transform: translate(var(--dx, 0px), 110vh) rotate(var(--rot, 0deg)); opacity: 1; }
  48%  { transform: translate(var(--dx, 0px), var(--lift, 0px)) rotate(var(--rot, 0deg)); opacity: 1; }
  100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
}
.starter-portrait { width: 56px; height: 56px; min-width: 56px; font-size: 1.8rem; align-items: center; justify-content: center; }
.starter-name { font-size: .95rem; color: #e6cf9a; font-weight: bold; }
.starter-role { font-size: .68rem; opacity: .8; }
.starter-stat { font-size: .66rem; }
.starter-skills { font-size: .56rem; opacity: .65; line-height: 1.25; }
.starter-btn { margin-top: auto; padding: 7px 12px; border-radius: 18px; border: 1px solid #e6cf9a; background: #2a3350; color: #e6cf9a;
  font-family: inherit; font-weight: bold; font-size: .75rem; }
@media (max-height: 430px) {
  .starter-box h2 { font-size: 1rem; }
  .starter-box p { margin-bottom: 8px; }
  .starter-card { padding: 7px 6px; gap: 3px; }
  .starter-portrait { width: 42px; height: 42px; min-width: 42px; }
  .starter-skills { display: none; }
}
@media (prefers-reduced-motion: reduce) { .starter-modal.enter .starter-card { animation: none; transform: none; opacity: 1; } }
`;
  document.head.appendChild(st);
})();

// Pilihan muncul saat pemain menekan "Masuk Arena" (BUKAN saat game baru dibuka).
// Pendengar capture dipasang di tombolnya supaya jalan sebelum pendengar bawaan (arena.js).
(function hookArenaEntry() {
  const btn = document.getElementById("home-arena-btn");
  if (!btn) return;
  btn.addEventListener("click", function (e) {
    if (!needsStarterPick()) return;
    e.stopImmediatePropagation();
    showStarterPick(function () { goToArenaMenu(); }); // arena.js
  }, true);
})();


/* ---------- 2. (dihapus) Gambar kosong Artifact / Mutation / Confer ----------
   Dulu bagian ini mengosongkan gambar karakter tiga sistem itu karena lambangnya
   belum ada. Sekarang lambangnya ada (systemEmblems.js), jadi pengosongan dihapus. */


/* ---------- 3. BERSIHKAN ELEMEN ARENA SAAT KELUAR ARENA ---------- */
function cleanupArenaOverlays() {
  try { clearBanners(); } catch (e) { /* banner.js */ }
  try { hideEnemyThinking(); } catch (e) { /* battle.js */ }
  try { stopPlayerTimer(); hideTurnControls(); } catch (e) { /* mechanics.js */ }
  const sp = document.getElementById("skill-panel");
  if (sp) sp.classList.add("hidden");
  document.body.classList.remove("skill-panel-open");
}

hideAllScreens = (function (orig) {
  return function () {
    const wasInBattle = !document.getElementById("battle-screen").classList.contains("hidden");
    orig();
    if (wasInBattle) cleanupArenaOverlays(); // pindah dari arena ke layar lain
  };
})(hideAllScreens);


/* ---------- 4. TEKS KESULITAN ---------- */
if (typeof DIFFICULTY_STYLE !== "undefined") {
  DIFFICULTY_STYLE.easy.roulette = "4 lawan Junior. Mereka agak bodoh dan sering salah langkah. Tanpa timer giliran.";
  DIFFICULTY_STYLE.normal.roulette = "4 lawan Junior-Senior yang membaca keadaan. Tanpa timer giliran.";
  DIFFICULTY_STYLE.hard.roulette = "Acak: 4 lawan setara, 3 lawan satu kedudukan di atasmu, atau 1 Master + 1 teman. Giliranmu 10 detik.";
  DIFFICULTY_STYLE.extreme.roulette = "Acak: 2 Master + 2 Abyss, 2 Abyss + 1 Vanguard, atau 1 Vanguard + 1 Sentinel. Giliranmu 5 detik.";
  DIFFICULTY_STYLE.easy.roster = "Musuh bertarung sembarangan dan sering salah langkah. Stat musuh tidak berubah. Tanpa timer.";
  DIFFICULTY_STYLE.normal.roster = "Musuh membaca keadaan: perisai, penyembuhan, dan stun. Tanpa timer giliran.";
  DIFFICULTY_STYLE.hard.roster = "Stat musuh tidak berubah, tetapi AI lebih pintar dan nekat. Giliranmu 10 detik.";
  DIFFICULTY_STYLE.extreme.roster = "Stat musuh tidak berubah, tetapi AI paling pintar dan paling nekat. Giliranmu 5 detik.";
}

if (typeof updateStartButton === "function") {
  updateStartButton = (function (orig) {
    return function () {
      orig();
      if (arenaMode === "roulette" && selectionPhase === "player" && selectedCharacterIds.length >= MIN_TEAM_SIZE) {
        const hint = document.getElementById("arena-reward-hint");
        if (hint) hint.textContent += " · " + describeRouletteRule(buildChosenTeam()); // arena.js
      }
    };
  })(updateStartButton);
}


/* ---------- 5. RAMUAN PENAWAR JUGA MENGHILANGKAN BLIND ---------- */
// (items.js dimuat setelah mechanics.js, jadi pembungkusnya dipasang di sini)
applyItemEffect = (function (orig) {
  return function (item, target, userLabel) {
    const result = orig(item, target, userLabel);
    if (item.effect && item.effect.type === "cleanse" && target) {
      target.statusEffects = target.statusEffects.filter(function (e) { return e.type !== "blind"; });
    }
    return result;
  };
})(applyItemEffect);

/* ---------- 6. LAYAR PENDEK: panel skill tidak menutupi target ----------
   Di HP kecil (tinggi layar <= 430px) panel skill menutupi musuh baris bawah,
   padahal pemain harus mengetuk musuh itu sebagai target. Saat skill sudah
   dipilih dan menunggu target, panel diringkas: hanya skill terpilih + Batal. */
(function compactTargetingPanel() {
  if (typeof showSkillPanel !== "function") return;
  const original = showSkillPanel;
  showSkillPanel = function (unit) {
    original.apply(this, arguments);
    const panel = document.getElementById("skill-panel");
    const targeting = !!(pendingSkill && typeof skillNeedsManualTarget === "function" && skillNeedsManualTarget(pendingSkill));
    if (panel) panel.classList.toggle("targeting", targeting);
    // Clay meniru skill musuh: 12 skill -> panel ringkas & bisa digulir
    const list = document.getElementById("skill-list");
    if (list) list.classList.toggle("many", list.children.length > 7);
  };
  const st = document.createElement("style");
  st.textContent = `
@media (max-height: 430px) {
  #skill-panel.targeting .skill-btn:not(.skill-selected) { display: none; }
  #skill-panel.targeting .skill-list { grid-template-columns: 1fr; }
  #skill-panel.targeting .skill-panel-title::after { content: "  ·  ketuk target"; color: #ffd84a; }
}
#skill-panel { max-height: 66vh; overflow-y: auto; overscroll-behavior: contain; }
.skill-list.many { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.skill-list.many .skill-preview { display: none; }
@media (max-width: 760px) { .skill-list.many { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
/* Nama karakter: jangan dipotong di tengah kata ("Gara n"). Kalau tidak muat, diberi "…". */
.fh-name-text { overflow-wrap: normal; word-break: normal; }
@media (max-width: 760px), (max-height: 430px) {
  .fh-name-text { display: block; white-space: nowrap; text-overflow: ellipsis; font-size: .92em; }
}`;
  document.head.appendChild(st);
})();
