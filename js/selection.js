/* ============================================
   ACCURANT ARENA - SELECTION.JS
   Layar pemilihan: kesulitan -> timmu (1-4 karakter) -> [Roster: musuh 1-4].
   Roulette berhenti setelah timmu (musuh disusun sistem, arena.js).
   Urutan tap pemain menentukan urutan slot; tap 2 karakter terpilih
   untuk tukar posisi, tap karakter yang sama 2x untuk membatalkan.
   ============================================ */

// ID karakter yang sedang dipilih pemain pada langkah ini, sesuai urutan tap.
let selectedCharacterIds = [];

// ID karakter yang sedang "diangkat" untuk ditukar posisinya. null = tidak sedang menukar.
let swapSourceId = null;

const MIN_TEAM_SIZE = 1;
const MAX_TEAM_SIZE = 4;

// Langkah: "difficulty" -> "player" -> "enemy" (enemy hanya untuk Roster).
let selectionPhase = "difficulty";
let playerTeamIds = []; // tim pemain yang sudah dipilih, saat sedang memilih musuh

/* ---------- Kartu kesulitan ---------- */

const DIFFICULTY_STYLE = {
  easy: {
    name: "Pemula",
    roulette: "Lawan sepadan dengan karaktermu. Mereka agak bodoh, sering salah langkah, dan tidak membawa item.",
    roster: "Musuh bertarung sembarangan dan sering salah langkah. Tanpa tambahan stat."
  },
  normal: {
    name: "Prajurit",
    roulette: "Lawan sepadan dengan karaktermu. Mereka membaca keadaan: perisai, penyembuhan, dan stun.",
    roster: "Musuh membaca keadaan: perisai, penyembuhan, dan stun. Tanpa tambahan stat."
  },
  hard: {
    name: "Veteran",
    roulette: "Lawan sepadan dengan karaktermu, tetapi pandai memakai ramuan dan jarang berbuat salah.",
    roster: "HP, mana, dan damage musuh ×1.5. Pandai memakai ramuan, ragu memakai artefak."
  },
  extreme: {
    name: "Malapetaka",
    roulette: "Lawan sepadan dengan karaktermu, tetapi AI paling pintar: ramuan dan artefak dipakai tanpa celah.",
    roster: "HP, mana, dan damage musuh ×3. AI paling pintar, mahir memakai ramuan dan artefak."
  }
};

/** Lambang tingkat kesulitan: cincin dengan 1-4 permata belah ketupat. */
function difficultySigil(n) {
  const w = [0, 9, 8, 6, 5][n];
  const gap = [0, 0, 14, 12, 10][n];
  const start = 24 - (gap * (n - 1)) / 2;
  let gems = "";
  for (let i = 0; i < n; i++) {
    const cx = start + gap * i;
    gems += '<polygon points="' + cx + ",10 " + (cx + w) + ",24 " + cx + ",38 " + (cx - w) + ',24" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>';
  }
  return '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.55"/>' + gems + "</svg>";
}

function buildDifficultyPanel() {
  const panel = document.getElementById("difficulty-panel");
  panel.innerHTML = "";
  panel.className = "difficulty-panel dp-panel";

  DIFFICULTY_ORDER.forEach(function (key, i) {
    const style = DIFFICULTY_STYLE[key];
    const btn = document.createElement("button");
    btn.className = "dp-card dp-" + key;

    const sigil = document.createElement("span");
    sigil.className = "dp-sigil";
    sigil.innerHTML = difficultySigil(i + 1);

    const title = document.createElement("span");
    title.className = "dp-title";
    title.textContent = DIFFICULTY_LEVELS[key].label;

    const sub = document.createElement("span");
    sub.className = "dp-sub";
    sub.textContent = style.name;

    const desc = document.createElement("span");
    desc.className = "dp-desc";
    desc.textContent = style[arenaMode === "roulette" ? "roulette" : "roster"];

    const reward = document.createElement("span");
    reward.className = "dp-reward";
    reward.textContent = arenaRewardText(key); // arena.js

    btn.appendChild(sigil);
    btn.appendChild(title);
    btn.appendChild(sub);
    btn.appendChild(desc);
    btn.appendChild(reward);
    btn.addEventListener("click", function () { chooseDifficulty(key); });
    panel.appendChild(btn);
  });
}

function chooseDifficulty(key) {
  currentDifficulty = key; // difficulty.js
  selectionPhase = "player";
  selectedCharacterIds = hasSavedFormation() ? loadSavedFormation() : [];
  swapSourceId = null;
  applySelectionPhaseUI();
}

function enterEnemyPhase() {
  playerTeamIds = selectedCharacterIds.slice();
  selectionPhase = "enemy";
  selectedCharacterIds = [];
  swapSourceId = null;
  applySelectionPhaseUI();
}

/** Karakter yang tampil di grid: timmu = yang dimiliki; musuh Roster = semua Kesatria. */
function getSelectableCharacters() {
  return selectionPhase === "enemy" ? CHARACTER_DATABASE : getAvailableCharacters();
}

function selectionInstructionText() {
  if (selectionPhase === "difficulty") {
    return arenaMode === "roulette"
      ? "Pilih kesulitan. Sistem memilih lawan yang sepadan untuk tiap karakter timmu."
      : "Pilih kesulitan. Kamu sendiri yang menentukan siapa melawan siapa.";
  }
  if (selectionPhase === "enemy") {
    return "Pilih 1-4 karakter sebagai LAWAN (boleh Kesatria yang belum kamu miliki). Makin kuat lawan dibanding timmu, makin besar hadiahnya.";
  }
  return "Pilih 1-4 karakter untuk timmu (urutan tap = urutan slot). Tap 2 karakter terpilih untuk tukar posisi; tap karakter yang sama 2x untuk membatalkan.";
}

/** Mengatur apa yang tampil sesuai langkah saat ini, lalu menggambar ulang grid dan tombol. */
function applySelectionPhaseUI() {
  const panel = document.getElementById("difficulty-panel");
  const grid = document.getElementById("selection-grid");
  const footer = document.getElementById("selection-footer");
  const text = document.getElementById("selection-instruction");

  const isDifficulty = selectionPhase === "difficulty";
  if (isDifficulty) buildDifficultyPanel();
  panel.classList.toggle("hidden", !isDifficulty);
  grid.classList.toggle("hidden", isDifficulty);
  footer.classList.toggle("hidden", isDifficulty);
  text.textContent = selectionInstructionText();
  document.getElementById("selection-screen").dataset.phase = selectionPhase;

  renderSelectionGrid();
  updateStartButton();
}

/** Tombol kembali: mundur satu langkah dulu, dari kesulitan baru ke Menu Arena. */
function onSelectionBack() {
  if (selectionPhase === "enemy") {
    selectionPhase = "player";
    selectedCharacterIds = playerTeamIds.slice();
    swapSourceId = null;
    applySelectionPhaseUI();
  } else if (selectionPhase === "player") {
    selectionPhase = "difficulty";
    currentDifficulty = null;
    swapSourceId = null;
    applySelectionPhaseUI();
  } else {
    goToArenaMenu(); // arena.js
  }
}

/**
 * Membuat satu kartu karakter (bingkai emas Kesatria elit).
 */
function buildSelectionCard(character) {
  const card = document.createElement("div");
  card.className = "selection-card " + (character.elite ? "sel-elite" : "sel-base");

  const orderIndex = selectedCharacterIds.indexOf(character.id);
  const isSelected = orderIndex !== -1;

  if (isSelected) {
    card.classList.add("selected");
  }
  if (swapSourceId === character.id) {
    card.classList.add("swap-source");
  }

  const rarity = document.createElement("div");
  rarity.className = "sel-rarity";
  rarity.textContent = (selectionPhase === "enemy" && ownedCharacterIds.indexOf(character.id) === -1) ? "BELUM DIMILIKI" : "ELIT";
  card.appendChild(rarity);

  const glow = document.createElement("div");
  glow.className = "sel-portrait-wrap";
  const portrait = document.createElement("div");
  portrait.className = "char-portrait sel-portrait";
  setPortrait(portrait, character);
  glow.appendChild(portrait);
  card.appendChild(glow);

  const name = document.createElement("div");
  name.className = "selection-name";
  name.textContent = character.name;
  card.appendChild(name);

  const role = document.createElement("div");
  role.className = "selection-role";
  role.textContent = character.role;
  card.appendChild(role);

  const stats = document.createElement("div");
  stats.className = "sel-stats";
  stats.textContent = "❤ " + character.maxHP + "   ⚔ " + character.attack;
  card.appendChild(stats);

  if (isSelected) {
    const badge = document.createElement("div");
    badge.className = "selection-badge";
    badge.textContent = (orderIndex + 1);
    card.appendChild(badge);
  }

  card.addEventListener("click", function () {
    toggleCharacterSelection(character.id);
  });
  return card;
}

function buildSelectionDivider(text, cls) {
  const div = document.createElement("div");
  div.className = "sel-divider " + cls;
  const left = document.createElement("span");
  left.className = "sel-divider-line";
  const label = document.createElement("span");
  label.className = "sel-divider-text";
  label.textContent = text;
  const right = document.createElement("span");
  right.className = "sel-divider-line";
  div.appendChild(left);
  div.appendChild(label);
  div.appendChild(right);
  return div;
}

/**
 * Menggambar ulang seluruh grid karakter dan deretan slot tim.
 * Dipanggil ulang setiap kali pemain tap sebuah kartu.
 */
function renderSelectionGrid() {
  const grid = document.getElementById("selection-grid");
  grid.innerHTML = "";

  const title = selectionPhase === "enemy" ? "✦ PILIH LAWAN ✦" : "✦ KESATRIA ELIT ✦";
  grid.appendChild(buildSelectionDivider(title, "sel-divider-elite"));
  getSelectableCharacters().forEach(function (character) {
    grid.appendChild(buildSelectionCard(character));
  });

  renderTeamStrip();
}

/**
 * Deretan 4 slot di dekat tombol Mulai: menunjukkan siapa di slot 1-4.
 * Tap slot = sama seperti tap kartunya (angkat / tukar / batal).
 */
function renderTeamStrip() {
  const strip = document.getElementById("team-strip");
  if (!strip) return;
  strip.innerHTML = "";

  for (let i = 0; i < MAX_TEAM_SIZE; i++) {
    const id = selectedCharacterIds[i];
    const character = id ? CHARACTER_DATABASE.find(function (c) { return c.id === id; }) : null;

    const slot = document.createElement("div");
    slot.className = "team-strip-slot";

    const num = document.createElement("span");
    num.className = "team-strip-num";
    num.textContent = String(i + 1);
    slot.appendChild(num);

    if (character) {
      slot.classList.add("filled", "sel-elite");
      if (swapSourceId === id) slot.classList.add("swap-source");
      const p = document.createElement("div");
      p.className = "char-portrait team-strip-portrait";
      setPortrait(p, character);
      slot.appendChild(p);
      slot.addEventListener("click", function () {
        toggleCharacterSelection(id);
      });
    }
    strip.appendChild(slot);
  }
}

/**
 * Menangani tap pada sebuah kartu karakter. Perilakunya tergantung situasi:
 * - Belum dipilih & tim belum penuh -> pilih (tambah ke akhir urutan)
 * - Sudah dipilih, belum ada yang "diangkat" -> angkat karakter ini (siap ditukar)
 * - Sudah dipilih, DAN karakter ini yang sedang diangkat -> batal pilih (hapus dari tim)
 * - Sudah dipilih, tapi karakter LAIN yang sedang diangkat -> tukar posisi keduanya
 *
 * @param {string} characterId
 */
function toggleCharacterSelection(characterId) {
  const isSelected = selectedCharacterIds.indexOf(characterId) !== -1;

  if (!isSelected) {
    swapSourceId = null; // tap karakter baru membatalkan mode tukar yang sedang berjalan
    if (selectedCharacterIds.length >= MAX_TEAM_SIZE) {
      return; // sudah penuh (maks. 4 karakter)
    }
    selectedCharacterIds.push(characterId);
  } else {
    if (swapSourceId === null) {
      // Tap pertama ke karakter yang sudah terpilih: angkat untuk ditukar
      swapSourceId = characterId;
    } else if (swapSourceId === characterId) {
      // Tap karakter yang sama lagi: batalkan pilihan karakter ini
      const idx = selectedCharacterIds.indexOf(characterId);
      selectedCharacterIds.splice(idx, 1);
      swapSourceId = null;
    } else {
      // Tap karakter terpilih LAIN: tukar posisi keduanya di urutan tim
      const idxA = selectedCharacterIds.indexOf(swapSourceId);
      const idxB = selectedCharacterIds.indexOf(characterId);
      const temp = selectedCharacterIds[idxA];
      selectedCharacterIds[idxA] = selectedCharacterIds[idxB];
      selectedCharacterIds[idxB] = temp;
      swapSourceId = null;
    }
  }

  renderSelectionGrid();
  updateStartButton();
}

function updateStartButton() {
  const button = document.getElementById("start-battle-btn");
  const hint = document.getElementById("arena-reward-hint");
  const count = selectedCharacterIds.length;
  const ready = count >= MIN_TEAM_SIZE;

  button.disabled = !ready;
  hint.textContent = "";

  if (selectionPhase === "enemy") {
    button.textContent = ready
      ? "Mulai: " + playerTeamIds.length + " lawan " + count
      : "Pilih minimal 1 lawan";
    if (ready) {
      const info = computeArenaRewardInfo(buildTeamFromIds(playerTeamIds), buildTeamFromIds(selectedCharacterIds)); // arena.js
      hint.textContent = "Perkiraan hadiah ×" + info.mult + " · " + info.note;
    }
  } else if (arenaMode === "roster") {
    button.textContent = ready ? "Lanjut: Pilih Lawan (" + count + ")" : "Pilih minimal 1 karakter";
  } else {
    button.textContent = ready
      ? "Mulai: " + count + " lawan " + count
      : "Pilih minimal 1 karakter";
    if (ready) hint.textContent = "Roulette " + arenaDifficultyLabel(currentDifficulty) + " · hadiah ×" + ROULETTE_REWARD[currentDifficulty];
  }
}

function buildTeamFromIds(ids) {
  return ids.map(function (id) {
    return CHARACTER_DATABASE.find(function (character) {
      return character.id === id;
    });
  });
}

function buildChosenTeam() {
  return buildTeamFromIds(selectedCharacterIds);
}

function initSelectionScreen() {
  document.getElementById("start-battle-btn").addEventListener("click", function () {
    if (selectedCharacterIds.length < MIN_TEAM_SIZE) return; // jaga-jaga, tombol seharusnya sudah disabled

    // Roster: setelah tim sendiri, lanjut pilih tim musuh.
    if (arenaMode === "roster" && selectionPhase === "player") {
      enterEnemyPhase();
      return;
    }

    if (arenaMode === "roster") {
      freeBattleEnemyTeam = buildChosenTeam(); // musuh pilihan pemain
      startBattle(buildTeamFromIds(playerTeamIds)); // main.js
      return;
    }

    // Roulette: sistem memilih 1 lawan setara untuk tiap karakter timmu (stat lawan tidak diubah).
    const team = buildChosenTeam();
    const roll = buildRouletteEnemies(team); // arena.js
    freeBattleEnemyTeam = roll.enemies;
    startBattle(team); // main.js
  });
}

/** Dipanggil arena.js setiap kali layar ini dibuka dari Menu Arena. */
function resetSelectionScreen() {
  selectionPhase = "difficulty";
  playerTeamIds = [];
  selectedCharacterIds = [];
  swapSourceId = null;
  applySelectionPhaseUI();
}

document.addEventListener("DOMContentLoaded", initSelectionScreen);
