/* ============================================
   ACCURANT - CHARACTERS.JS
   Database semua karakter pemain.

   PENJELASAN FIELD SKILL (baru di Tahap 3):
   - type: jenis skill (single_attack, area_attack, healing,
           shield, buff, debuff, mana_recovery)
   - target: siapa yang BOLEH kena skill ini
       "single_enemy"  -> pilih satu musuh
       "all_enemies"   -> otomatis kena semua musuh
       "single_ally"   -> pilih satu sekutu (termasuk diri sendiri)
       "all_allies"    -> otomatis kena semua sekutu
       "self"          -> otomatis kena diri sendiri saja
   - power: pengali damage/heal (0 kalau skill ini tidak langsung
            melukai/menyembuhkan, misal skill buff murni)
   - effect: efek status tambahan (opsional). Bentuknya:
       { type: "buff"|"debuff", stat: "attack"|"defense"|"speed", percent, turns }
       { type: "dot", stat: "burn"|"poison", percent, turns }
       { type: "stun", chance, turns }
       { type: "cleanse" }

   FIELD TAMBAHAN (Tahap 9, karakter elit):
   - elite: true   -> karakter dijual di Toko (tidak otomatis dimiliki),
                      dan TIDAK ikut jadi musuh acak.
   - price         -> harga di Toko (koin)
   - cardBg        -> (opsional) gambar latar kartu di Toko, mis. "assets/cards/nowrt.jpg".
                      Kalau kosong, kartu memakai latar placeholder bawaan.
   - hits (skill)  -> jumlah serangan beruntun, hanya untuk teks log
                      (power sudah TOTAL semua serangan)
   - execute (skill) -> { belowHP: N } kalau HP target < N maka langsung
                      kalah; kalau tidak, skill HANGUS (mana tetap terpakai)
   - effect freeze  -> { type: "freeze", shatterPercent } beku sampai teman
                      target habis, lalu es pecah

   CATATAN BIAYA: angka manaCost di bawah hanya cadangan. Biaya sebenarnya
   dihitung ulang otomatis dari kegunaan skill oleh finalizeSkillCosts()
   di charactersExtra.js, supaya semua karakter memakai aturan yang sama.

   >>> KALAU MAU NAMBAH KARAKTER BARU <<<
   Copy satu blok { ... } di bawah, tempel sebelum tanda "]"
   di akhir array, lalu ubah isinya. File lain (index.html,
   main.js, battle.js, selection.js, style.css) TIDAK perlu disentuh.
   ============================================ */

/* ============================================
   GAMBAR KARAKTER
   Lambang Kesatria ada di emblems.js (EMBLEM_IMG.sword / .book).
   Field  image  di karakter dipakai kalau ada, kalau tidak dipakai
   emoji dari  icon.
   ============================================ */
/**
 * Mengisi kotak gambar karakter: pakai image (file) kalau ada, kalau tidak
 * iconSvg, kalau tidak lagi emoji dari icon.
 */
function setPortrait(el, character) {
  el.innerHTML = "";
  const fallback = function () { // gambar tidak ada / gagal dimuat: pakai ikon vektor, lalu emoji
    el.innerHTML = "";
    if (character.iconSvg) el.innerHTML = character.iconSvg;
    else if (typeof systemEmblemSvg === "function" && character.powerSystem && systemEmblemSvg(character.powerSystem)) {
      el.innerHTML = systemEmblemSvg(character.powerSystem); // systemEmblems.js
    } else el.textContent = character.icon;
  };
  if (character.image) {
    const img = document.createElement("img");
    img.src = character.image;
    img.alt = "";
    img.className = "portrait-img";
    img.onerror = fallback;
    el.appendChild(img);
  } else {
    fallback();
  }
}

const CHARACTER_DATABASE = [

  // ================================================================
  //  KESATRIA ELIT (dijual di Toko; satu-satunya karakter di Accurant Arena)
  // ================================================================

  // ===== ELIT 1: NOWRT (Pernafasan Duri) =====
  {
    id: "char_nowrt",
    name: "Nowrt",
    role: "Pernafasan Duri",
    icon: "🌵",
    elite: true,
    price: 1500,
    maxHP: 900,
    maxMana: 420,
    attack: 150,
    defense: 80,
    speed: 30,
    image: EMBLEM_IMG.sword,
    skills: [
      { id: "nowrt_s1", name: "Duri Nyasar", type: "single_attack", target: "single_enemy", manaCost: 30, power: 0.7, description: "Duri kecil melesat ke satu musuh." },
      { id: "nowrt_s2", name: "Tusukan Manual", type: "single_attack", target: "single_enemy", manaCost: 55, power: 1.2, description: "Tusukan duri langsung ke satu musuh." },
      { id: "nowrt_s3", name: "Kepungan Duri Kecil", type: "single_attack", target: "single_enemy", manaCost: 80, power: 1.3333, hits: 10, description: "10 duri kecil mengepung satu musuh." },
      { id: "nowrt_s4", name: "Penusukan 3 Duri dari Tanah", type: "single_attack", target: "single_enemy", manaCost: 95, power: 1.8333, hits: 3, description: "3 duri besar menyembul dari tanah ke satu musuh." },
      { id: "nowrt_s5", name: "Area Zona Duri", type: "area_attack", target: "all_enemies", manaCost: 130, power: 1.2, description: "Zona duri menusuk seluruh musuh." },
      { id: "nowrt_s6", name: "Duri Raksasa dari Langit", type: "single_attack", target: "single_enemy", manaCost: 252, power: 0, execute: { belowHP: 495 }, description: "Duri raksasa menembus kepala. Musuh dengan HP di bawah 495 langsung kalah. Kalau syarat tidak terpenuhi, skill hangus." }
    ]
  },

  // ===== ELIT 2: VENESA (Pernafasan Salju) =====
  {
    id: "char_venesa",
    name: "Venesa",
    role: "Pernafasan Salju",
    icon: "❄️",
    elite: true,
    price: 1800,
    maxHP: 800,
    maxMana: 460,
    attack: 140,
    defense: 60,
    speed: 32,
    image: EMBLEM_IMG.sword,
    skills: [
      { id: "venesa_s1", name: "Penyilauan Kristal Salju", type: "area_attack", target: "all_enemies", manaCost: 55, power: 0.3, description: "Kilau kristal salju melukai seluruh musuh." },
      { id: "venesa_s2", name: "Pijakan Salju", type: "healing", target: "all_allies", manaCost: 110, power: 1.2, description: "Memulihkan HP seluruh sekutu." },
      { id: "venesa_s3", name: "Tebasan Kristal Salju", type: "single_attack", target: "single_enemy", manaCost: 75, power: 1.6, description: "Tebasan kristal salju ke satu musuh." },
      { id: "venesa_s4", name: "Tarian Salju", type: "area_attack", target: "all_enemies", manaCost: 115, power: 0.9, description: "Tarian salju menyapu seluruh musuh." },
      { id: "venesa_s5", name: "Badai Salju", type: "area_attack", target: "all_enemies", manaCost: 190, power: 1.4, effect: { type: "stun", chance: 0.7, turns: 1 }, description: "Badai dingin ke seluruh musuh, berpeluang membuat mereka tidak bisa bermain 1x." },
      { id: "venesa_s6", name: "Panggilan Musim Salju", type: "area_attack", target: "all_enemies", manaCost: 276, power: 2.0, description: "Skill pamungkas, musim salju menghantam seluruh musuh." }
    ]
  },

  // ===== ELIT 3: ZAENAL (Pernafasan Ular) =====
  {
    id: "char_zaenal",
    name: "Zaenal",
    role: "Pernafasan Ular",
    icon: "🐍",
    elite: true,
    price: 1600,
    maxHP: 900,
    maxMana: 400,
    attack: 145,
    defense: 70,
    speed: 28,
    image: EMBLEM_IMG.sword,
    skills: [
      { id: "zaenal_s1", name: "Lilitan Piton", type: "single_attack", target: "single_enemy", manaCost: 55, power: 0.90, description: "Lilitan piton meremukkan satu musuh." },
      { id: "zaenal_s2", name: "Bisa", type: "single_attack", target: "single_enemy", manaCost: 60, power: 0.7, effect: { type: "dot", stat: "poison", percent: 0.17, turns: 3 }, description: "Gigitan berbisa, racun bekerja selama 3 giliran." },
      { id: "zaenal_s3", name: "Serbuan Ular", type: "area_attack", target: "all_enemies", manaCost: 110, power: 0.9, description: "Kawanan ular menyerbu seluruh musuh." },
      { id: "zaenal_s4", name: "Anaconda Perusuh", type: "area_attack", target: "all_enemies", manaCost: 140, power: 1.1, description: "Anaconda mengamuk ke seluruh musuh." },
      { id: "zaenal_s5", name: "Sengatan King Cobra", type: "single_attack", target: "single_enemy", manaCost: 100, power: 0.4, effect: { type: "dot", stat: "poison", percent: 2.0, turns: 1 }, description: "Sengatan kecil, tapi racun besar meledak di giliran berikutnya." },
      { id: "zaenal_s6", name: "Lahapan Titanoboa", type: "single_attack", target: "single_enemy", manaCost: 240, power: 0, execute: { belowHP: 310 }, description: "Dilahap Titanoboa. Musuh dengan HP di bawah 310 langsung kalah. Kalau syarat tidak terpenuhi, skill hangus." }
    ]
  },

  // ===== ELIT 4: RUMIA (Sihir Es) =====
  {
    id: "char_rumia",
    name: "Rumia",
    role: "Sihir Es",
    icon: "🧊",
    elite: true,
    price: 1700,
    maxHP: 700,
    maxMana: 560,
    attack: 160,
    defense: 40,
    speed: 30,
    image: EMBLEM_IMG.book,
    skills: [
      { id: "rumia_s1", name: "Freeze", type: "debuff", target: "single_enemy", manaCost: 70, power: 0, effect: { type: "stun", chance: 1.0, turns: 1 }, description: "Membekukan satu musuh, tidak bisa bermain 1x." },
      { id: "rumia_s2", name: "Udara Dingin Menyengat", type: "area_attack", target: "all_enemies", manaCost: 90, power: 0.6, description: "Udara dingin menyengat seluruh musuh." },
      { id: "rumia_s3", name: "Semburan Es", type: "single_attack", target: "single_enemy", manaCost: 80, power: 1.5, description: "Semburan es ke satu musuh." },
      { id: "rumia_s4", name: "Penyegaran Suasana", type: "healing", target: "all_allies", manaCost: 150, power: 1.6, description: "Memulihkan HP seluruh sekutu." },
      { id: "rumia_s5", name: "Pembekuan Titik Jantung", type: "single_attack", target: "single_enemy", manaCost: 150, power: 2.8, description: "Membekukan titik jantung satu musuh, damage sangat besar." },
      { id: "rumia_s6", name: "Segel Gunung Es", type: "single_attack", target: "single_enemy", manaCost: 336, power: 1.0, effect: { type: "freeze", shatterPercent: 0.75 }, description: "Membekukan satu musuh. Beku (kebal damage, tidak bisa bermain) selama temannya masih hidup. Setelah semua temannya kalah, es pecah dan memberi damage tambahan 3/4 dari damage pembekuan. Kalau musuh sendirian, tidak beku, langsung kena damage + pecah." }
    ]
  },

  // ===== ELIT 5: ZOEEL (Pernafasan Angin) =====
  {
    id: "char_zoeel",
    name: "Zoeel",
    role: "Pernafasan Angin",
    icon: "💨",
    elite: true,
    price: 1300,
    maxHP: 850,
    maxMana: 440,
    attack: 150,
    defense: 55,
    speed: 45,
    image: EMBLEM_IMG.sword,
    skills: [
      { id: "zoeel_s1", name: "Angin Nakal", type: "area_attack", target: "all_enemies", manaCost: 30, power: 0.15, description: "Angin nakal menggores seluruh musuh." },
      { id: "zoeel_s2", name: "Topan Pelindung", type: "shield", target: "single_ally", manaCost: 90, power: 0, shield: { kind: "timed", turns: 2, basis: "source" }, description: "Topan pelindung memberi shield ke satu sekutu." },
      { id: "zoeel_s3", name: "Tebasan Angin Puringer", type: "single_attack", target: "single_enemy", manaCost: 110, power: 1.6, effect: { type: "stun", chance: 1.0, turns: 1 }, description: "Tebasan angin, musuh yang kena tidak bisa bermain 1x." },
      { id: "zoeel_s4", name: "Tusukan Badai", type: "single_attack", target: "single_enemy", manaCost: 100, power: 2.0, description: "Tusukan badai ke satu musuh." },
      { id: "zoeel_s5", name: "Angin Cakar", type: "area_attack", target: "all_enemies", manaCost: 140, power: 1.1, description: "Cakar angin mencabik seluruh musuh." },
      { id: "zoeel_s6", name: "Tebasan Putaran Angin Beliung", type: "area_attack", target: "all_enemies", manaCost: 264, power: 2.0, description: "Skill pamungkas, angin beliung menebas seluruh musuh." }
    ]
  }

];

/**
 * Karakter yang boleh dipakai pemain sekarang: hanya Kesatria yang
 * sudah dibeli di Toko. (ownedCharacterIds ada di account.js)
 */
function getAvailableCharacters() {
  return CHARACTER_DATABASE.filter(function (c) {
    return ownedCharacterIds.indexOf(c.id) !== -1;
  });
}