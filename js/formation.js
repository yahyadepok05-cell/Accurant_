/* ============================================
   ACCURANT - FORMATION.JS
   Layar Koleksi (lihat detail semua karakter) dan
   penyimpanan formasi (tim) terakhir yang dipakai.

   CATATAN: savedFormationIds disimpan permanen lewat storage.js.
   ============================================ */

let savedFormationIds = []; // 1-4 id; kosong sampai pemain pernah mulai 1 battle

function saveCurrentFormation(characterIds) {
  savedFormationIds = characterIds.slice();
  if (typeof saveGame === "function") saveGame(); // storage.js
}

function hasSavedFormation() {
  return savedFormationIds.length >= MIN_TEAM_SIZE && savedFormationIds.length <= MAX_TEAM_SIZE;
}

function loadSavedFormation() {
  return savedFormationIds.slice();
}

/**
 * Menggambar layar Koleksi: semua karakter dengan stat lengkap dan
 * ringkasan 6 skill-nya, supaya pemain bisa lihat-lihat/bandingkan
 * tanpa harus masuk mode pertarungan dulu.
 */
function renderCollectionScreen() {
  const list = document.getElementById("collection-list");
  list.innerHTML = "";

  getAvailableCharacters().forEach(function (character) {
    const card = document.createElement("div");
    card.className = "collection-card";

    const header = document.createElement("div");
    header.className = "collection-card-header";

    const portrait = document.createElement("div");
    portrait.className = "char-portrait";
    setPortrait(portrait, character);

    const nameBlock = document.createElement("div");
    const name = document.createElement("div");
    name.className = "collection-card-name";
    name.textContent = character.name;
    const role = document.createElement("div");
    role.className = "collection-card-role";
    role.textContent = character.role;
    nameBlock.appendChild(name);
    nameBlock.appendChild(role);

    header.appendChild(portrait);
    header.appendChild(nameBlock);

    const stats = document.createElement("div");
    stats.className = "collection-card-stats";
    stats.textContent = "HP " + character.maxHP + " · " + energyName(character) + " " + character.maxMana +
      " · ATK " + character.attack + " · DEF " + character.defense + " · SPD " + character.speed;

    const skillList = document.createElement("div");
    skillList.className = "collection-skill-list";
    character.skills.forEach(function (skill) {
      const skillLine = document.createElement("div");
      skillLine.className = "collection-skill-line";
      skillLine.textContent = skill.name + " — " + skill.manaCost + " mana · " + getTargetLabel(skill.target);
      skillList.appendChild(skillLine);
    });

    card.appendChild(header);
    card.appendChild(stats);
    card.appendChild(skillList);
    list.appendChild(card);
  });
}
