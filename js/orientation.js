/* ============================================
   ACCURANT - ORIENTATION.JS
   Game ini dirancang untuk layar menyamping (landscape).
   - Saat HP masih tegak, muncul pesan "Putar HP".
   - Tombol "Tetap main begini" menutup pesan itu (tampilan tegak
     lama tetap berfungsi sebagai cadangan).
   - Coba mengunci layar ke landscape (hanya berhasil di sebagian
     browser, biasanya saat layar penuh / aplikasi terpasang).
   ============================================ */

(function setupOrientation() {
  const overlay = document.createElement("div");
  overlay.id = "rotate-overlay";
  overlay.innerHTML =
    '<div class="rotate-box">' +
      '<div class="rotate-phone">📱</div>' +
      '<p class="rotate-title">Putar HP ke mode landscape</p>' +
      '<p class="rotate-sub">Game ini dimainkan menyamping. Pastikan "Rotasi otomatis" di HP aktif.</p>' +
      '<button class="rotate-dismiss" id="rotate-dismiss">Tetap main begini</button>' +
    '</div>';
  document.body.appendChild(overlay);

  document.getElementById("rotate-dismiss").addEventListener("click", function () {
    document.documentElement.classList.add("allow-portrait");
  });

  function tryLockLandscape() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("landscape").catch(function () { /* tidak didukung: abaikan */ });
      }
    } catch (e) { /* abaikan */ }
  }
  document.addEventListener("click", tryLockLandscape, { once: true });
})();
