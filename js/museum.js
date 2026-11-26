/* ============================================
   ACCURANT - MUSEUM.JS
   Layar Museum: preview semua karakter (sudah dibeli maupun belum),
   bos Demon Lord, dan yang akan datang. Satu halaman per karakter,
   digeser ke kanan (bukan scroll ke bawah). Tulisan skill urut dari atas
   ke bawah, tanpa kotak, semua berwarna redup.
   Angka damage/heal/shield diambil dari getSkillPreviewText (battle.js)
   supaya selalu sama dengan yang tampil saat pertarungan.
   ============================================ */

function buildMuseumPages() {
  const pages = [];

  CHARACTER_DATABASE.filter(function (c) { return c.elite; }).forEach(function (c) {
    const owned = ownedCharacterIds.indexOf(c.id) !== -1;
    pages.push({
      kind: "char",
      character: c,
      status: "👑 Kesatria · " + (owned ? "Sudah dimiliki" : "Belum dimiliki · " + c.price + " Koin"),
      team: "player"
    });
  });

  pages.push({
    kind: "soon",
    icon: "👑",
    title: "Kesatria Lainnya",
    lines: [
      "Segera hadir.",
      "Karakter Kesatria baru sedang disiapkan."
    ]
  });

  return pages;
}

function museumLine(className, text) {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
}

function createMuseumPage(page) {
  const el = document.createElement("section");
  el.className = "museum-page";

  const portrait = document.createElement("div");
  portrait.className = "char-portrait museum-portrait";

  if (page.kind === "soon") {
    portrait.textContent = page.icon;
    el.appendChild(portrait);
    el.appendChild(museumLine("museum-name", page.title));
    page.lines.forEach(function (t) { el.appendChild(museumLine("museum-text", t)); });
    return el;
  }

  const character = page.character;
  setPortrait(portrait, character);
  el.appendChild(portrait);
  el.appendChild(museumLine("museum-name", character.name));
  el.appendChild(museumLine("museum-text", character.role));
  el.appendChild(museumLine("museum-text", page.status));
  el.appendChild(museumLine("museum-text museum-stats", "HP " + character.maxHP + " · Max " + energyName(character) + " " + character.maxMana));
  el.appendChild(museumLine("museum-text", "ATK " + character.attack + " · DEF " + character.defense + " · SPD " + character.speed));

  const unit = createRuntimeUnit(character, page.team); // supaya angka damage sama persis dengan di pertarungan

  character.skills.forEach(function (skill, index) {
    el.appendChild(museumLine("museum-skill-name", (index + 1) + ". " + skill.name));
    const preview = getSkillPreviewText(unit, skill);
    el.appendChild(museumLine(
      "museum-text museum-skill-detail",
      skill.manaCost + " mana · " + getTargetLabel(skill.target) + (preview ? " · " + preview : "")
    ));
  });

  return el;
}

function updateMuseumHint() {
  const track = document.getElementById("museum-track");
  const hint = document.getElementById("museum-hint");
  const total = track.children.length;
  const width = track.clientWidth || 1;
  const index = Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / width)));
  hint.textContent = "Geser ke kanan ›  " + (index + 1) + " / " + total;
}

function renderMuseumScreen() {
  const track = document.getElementById("museum-track");
  track.innerHTML = "";

  buildMuseumPages().forEach(function (page) {
    track.appendChild(createMuseumPage(page));
  });

  track.scrollLeft = 0;
  updateMuseumHint();
}

document.getElementById("museum-track").addEventListener("scroll", updateMuseumHint);
