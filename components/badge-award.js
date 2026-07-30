/* ---- badge award, the EyeWire II hero unlock (holoaward) ------------------
   Reproduced from AchievementToast.vue's heroBadge branch. In the game a badge
   unlock does not go to the corner toast a streak or an edit milestone gets: it
   takes over the screen as an "ACHIEVEMENT UNLOCKED" spectacle that stays until
   you click it, and clicking opens the profile. This builds that overlay from
   the real markup, materialises the badge, and fires the gold confetti that
   goes up with it. The styles are in badge-award.css.

     holoaward({ name, desc, img });     // img optional; emoji is the fallback

   The DOM mirrors the source exactly: a hex-grid backdrop, a shockwave, a
   vertical scan, then the card with twenty rising particles, three counter
   rotating rings, five orbiting dots, a pulsing aura, the badge, and the
   glitch-in title block. Twenty and five are the source's `v-for` counts.

   It stays until a click or Escape, because badges have no auto-dismiss there,
   and clicking fires the same `nge:open-profile` intent the game does, which
   the page wires to the researcher profile. Gold confetti rides up with it when
   holoburst is on the page. Reduced motion keeps the composition and drops the
   motion, and fires no confetti. One overlay at a time. */
(function () {
  "use strict";

  var PARTICLES = 20, ORBITS = 5, LEAVE = 500;
  var reduce = window.matchMedia
    ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  var current = null, opener = null;

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
  }

  function close() {
    if (!current) return;
    var o = current; current = null;
    document.removeEventListener("keydown", onKey, true);
    o.classList.add("is-leaving");
    var op = opener; opener = null;
    window.setTimeout(function () {
      o.remove();
      if (op && op.focus) { try { op.focus(); } catch (e) {} }
    }, LEAVE);
  }

  function holoaward(opts) {
    opts = opts || {};
    // one at a time: a second call clears the first outright rather than
    // stacking two full-screen overlays through a 500ms leave
    if (current) { current.remove(); current = null;
      document.removeEventListener("keydown", onKey, true); }

    var overlay = el("div", "nge-hero-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", (opts.name || "Badge") + " unlocked");
    overlay.tabIndex = -1;

    el("div", "nge-hero-hexgrid", overlay);
    el("div", "nge-hero-shockwave", overlay);
    el("div", "nge-hero-scanline", overlay);

    var card = el("div", "nge-hero-card", overlay);

    var parts = el("div", "nge-hero-particles", card);
    for (var i = 1; i <= PARTICLES; i++) {
      el("span", "nge-hero-particle", parts).style.setProperty("--i", i);
    }

    var rings = el("div", "nge-hero-rings", card);
    el("div", "nge-hero-ring nge-hero-ring--1", rings);
    el("div", "nge-hero-ring nge-hero-ring--2", rings);
    el("div", "nge-hero-ring nge-hero-ring--3", rings);

    var orbits = el("div", "nge-hero-orbits", card);
    for (var j = 1; j <= ORBITS; j++) {
      el("span", "nge-hero-orbit-dot", orbits).style.setProperty("--j", j);
    }

    el("div", "nge-hero-aura", card);

    var icon = el("div", "nge-hero-icon", card);
    function emoji() {
      el("span", "nge-hero-emoji", icon).textContent = opts.emoji || "\u{1F3C5}";
    }
    if (opts.img) {
      var img = el("img", "nge-hero-badge-img", icon);
      img.alt = "";
      // a badge image that fails to load falls back to the emoji, so the reveal
      // still lands rather than opening on an empty frame
      img.addEventListener("error", function () { img.remove(); emoji(); });
      img.src = opts.img;
    } else {
      emoji();
    }

    var wrap = el("div", "nge-hero-title-wrap", card);
    el("div", "nge-hero-label", wrap).textContent = "ACHIEVEMENT UNLOCKED";
    el("div", "nge-hero-title", wrap).textContent = opts.name || "Badge";
    el("div", "nge-hero-subtitle", card).textContent = opts.desc || "";
    el("div", "nge-hero-hint", card).textContent = "Click to view profile";

    overlay.addEventListener("click", function () {
      close();
      document.dispatchEvent(new CustomEvent("nge:open-profile"));
    });

    document.body.appendChild(overlay);
    current = overlay;
    opener = document.activeElement;
    // next frame, so the .is-in opacity transition actually runs from 0
    requestAnimationFrame(function () {
      if (current === overlay) overlay.classList.add("is-in");
    });
    document.addEventListener("keydown", onKey, true);
    try { overlay.focus(); } catch (e) {}

    if (!reduce.matches && window.holoburst) window.holoburst("gold", 1.5);
    return { close: close };
  }

  holoaward.close = close;
  window.holoaward = holoaward;
})();
