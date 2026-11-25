/* ============================================
   ACCURANT - AMBIENCE.JS
   Latar belakang & musik. File ini MANDIRI: tidak mengubah file lain,
   dia hanya MEMANTAU layar mana yang sedang tampil.

   LATAR (body[data-scene], gayanya ada di style.css):
   - home   : video assets/lobby.mp4 berputar terus (loop, tanpa suara)
   - menu   : gambar diam yang diburamkan (hemat baterai, video berhenti)
   - battle : latar arena buatan CSS (bisa diganti file assets/arena-bg.jpg)

   MUSIK (assets/bgm.mp3):
   - Selalu mulai dari detik 0 setiap game dibuka / dimuat ulang,
     dan juga setiap selesai bertarung (setelah musik ditahan di arena).
   - Browser HP memblokir suara otomatis, jadi musik mulai pada sentuhan
     pertama di layar, lalu mengulang terus.
   - Berhenti saat game ditinggal ke aplikasi lain, lanjut saat kembali.
   - Nyala/mati & volume: tombol 🔊 di beranda dan layar Pengaturan.
     Pilihan disimpan di HP (localStorage).
   ============================================ */

(function setupAmbience() {
  const MUSIC_SRC = "assets/bgm.mp3";
  const STORE_KEY = "accurant_arena_audio";

  const SCREEN_IDS = [
    "home-screen", "arena-menu-screen", "shop-screen", "collection-screen", "museum-screen",
    "data-screen", "settings-screen", "selection-screen", "battle-screen", "result-screen"
  ];

  const video = document.getElementById("bg-video");

  /* ---------- Latar: pantau layar yang tampil ---------- */

  function isShown(id) {
    const el = document.getElementById(id);
    return !!el && !el.classList.contains("hidden");
  }

  function currentScene() {
    if (isShown("battle-screen")) return "battle";
    if (isShown("home-screen")) return "home";
    return "menu";
  }

  function applyScene() {
    const scene = currentScene();
    if (document.body.dataset.scene !== scene) document.body.dataset.scene = scene;
    syncVideo(scene);
  }

  // Video hanya jalan di beranda (hemat baterai) dan saat game terlihat.
  function syncVideo(scene) {
    if (!video) return;
    const wantPlay = (scene || currentScene()) === "home" && !document.hidden;
    if (wantPlay) {
      const p = video.play();
      if (p && p.catch) p.catch(function () { /* diblokir: gambar cadangan (poster) tetap tampil */ });
    } else if (!video.paused) {
      video.pause();
    }
  }

  if (video) {
    video.muted = true; // wajib supaya autoplay diizinkan
    // Video gagal dimuat/diputar (file hilang, codec tidak didukung): pakai gambar diam sebagai cadangan.
    video.addEventListener("error", function () { document.body.classList.add("no-video"); });
  }

  const observer = new MutationObserver(applyScene);
  SCREEN_IDS.forEach(function (id) {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { attributes: true, attributeFilter: ["class"] });
  });
  applyScene();


  /* ---------- Musik ---------- */

  let settings = { on: true, vol: 0.6 };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved && typeof saved === "object") {
      settings.on = saved.on !== false;
      if (typeof saved.vol === "number") settings.vol = Math.max(0, Math.min(1, saved.vol));
    }
  } catch (e) { /* abaikan: pakai bawaan */ }

  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) { /* abaikan */ }
  }

  const bgm = new Audio(MUSIC_SRC);
  bgm.loop = true;
  bgm.preload = "auto";
  bgm.volume = settings.vol;

  let gestureDone = false; // sudah ada sentuhan pertama (musik boleh jalan)
  let startedOnce = false;

  // Musik DITAHAN (hening) saat loading arena & selama peperangan berlangsung.
  // Layar hasil (menang/kalah) dan layar lain: musik lanjut lagi dengan fade-in.
  let introHold = false; // diset arenaIntro.js lewat window.AccurantAudio.holdMusic()
  let fadeTimer = null;

  function musicHeld() {
    return introHold || (isShown("battle-screen") && !isShown("result-screen"));
  }

  function fadeOutPause(ms) {
    if (bgm.paused) return;
    clearInterval(fadeTimer);
    const v0 = bgm.volume, steps = 14; let i = 0;
    fadeTimer = setInterval(function () {
      i++;
      bgm.volume = Math.max(0, v0 * (1 - i / steps));
      if (i >= steps) { clearInterval(fadeTimer); bgm.pause(); bgm.volume = settings.vol; }
    }, ms / steps);
  }

  function fadeInVolume(ms) {
    clearInterval(fadeTimer);
    const target = settings.vol, steps = 14; let i = 0;
    bgm.volume = 0;
    fadeTimer = setInterval(function () {
      i++;
      bgm.volume = Math.min(target, target * (i / steps));
      if (i >= steps) { clearInterval(fadeTimer); bgm.volume = target; }
    }, ms / steps);
  }

  function tryPlay() {
    if (!settings.on || !gestureDone || document.hidden) return;
    if (musicHeld()) return;
    if (!startedOnce) { bgm.currentTime = 0; startedOnce = true; } // login baru = dari awal
    const wasPaused = bgm.paused;
    if (wasPaused) fadeInVolume(900);
    const p = bgm.play();
    if (p && p.catch) p.catch(function () { /* nanti dicoba lagi pada sentuhan berikutnya */ startedOnce = false; gestureDone = false; armGesture(); });
  }

  function onFirstGesture() {
    gestureDone = true;
    disarmGesture();
    tryPlay();
  }
  const GESTURE_EVENTS = ["pointerup", "touchend", "click", "keydown"];
  function armGesture() { GESTURE_EVENTS.forEach(function (ev) { document.addEventListener(ev, onFirstGesture, true); }); }
  function disarmGesture() { GESTURE_EVENTS.forEach(function (ev) { document.removeEventListener(ev, onFirstGesture, true); }); }
  armGesture();

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      bgm.pause();
    } else {
      tryPlay();
    }
    syncVideo();
  });


  /* ---------- Kontrol: tombol 🔊 di beranda & layar Pengaturan ---------- */

  const topBtn = document.getElementById("music-toggle-btn");
  const settingBtn = document.getElementById("music-setting-btn");
  const volumeSlider = document.getElementById("music-volume");

  function refreshControls() {
    if (topBtn) {
      const use = topBtn.querySelector("use");
      if (use) use.setAttribute("href", settings.on ? "#ic-sound" : "#ic-mute");
      topBtn.classList.toggle("is-off", !settings.on);
    }
    if (settingBtn) {
      settingBtn.textContent = settings.on ? "Nyala" : "Mati";
      settingBtn.classList.toggle("is-off", !settings.on);
    }
    if (volumeSlider) volumeSlider.value = String(Math.round(settings.vol * 100));
  }

  function setMusicOn(on) {
    settings.on = on;
    saveSettings();
    refreshControls();
    if (on) {
      gestureDone = true; // tombol ini sendiri adalah sentuhan pemain
      tryPlay();
    } else {
      bgm.pause();
    }
  }

  if (topBtn) topBtn.addEventListener("click", function () { setMusicOn(!settings.on); });
  if (settingBtn) settingBtn.addEventListener("click", function () { setMusicOn(!settings.on); });
  if (volumeSlider) {
    volumeSlider.addEventListener("input", function () {
      settings.vol = Math.max(0, Math.min(1, Number(volumeSlider.value) / 100));
      bgm.volume = settings.vol;
      saveSettings();
    });
  }
  refreshControls();

  /* ---------- Musik ikut layar: hening saat arena ---------- */
  let wasHeld = false;
  function syncMusic() {
    if (musicHeld()) {
      wasHeld = true;
      fadeOutPause(600);
    } else {
      // Selesai bertarung (atau keluar dari arena): lagu diputar ulang dari detik 0.
      if (wasHeld) { wasHeld = false; bgm.currentTime = 0; }
      tryPlay();
    }
  }
  const musicObserver = new MutationObserver(syncMusic);
  SCREEN_IDS.forEach(function (id) {
    const el = document.getElementById(id);
    if (el) musicObserver.observe(el, { attributes: true, attributeFilter: ["class"] });
  });

  // Dipakai arenaIntro.js (animasi loading arena)
  window.AccurantAudio = {
    holdMusic: function (on) { introHold = !!on; syncMusic(); },
    isOn: function () { return settings.on; },
    volume: function () { return settings.vol; }
  };
})();