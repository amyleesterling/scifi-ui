/* ---- epg-compass: behavior --------------------------------------------------
   The drive from BE THE FLY, on the game's own math. Holding a turn rotates
   the world heading at a steady rate; the compass angle is the game's
   headingDegrees + 90, the reticle snaps after it on its 80ms transition,
   and the active sector is the game's formula verbatim: counterclockwise
   degrees floor divided into sixteen wedges, selecting one of the sixteen
   epg-heading renders to relight over the dimmed base with the sector
   arrive flash. The readout carries the shipped format, FLY HEADING with
   the zero padded EPG index and the cardinal with three digit degrees.
   A and D steer, as in the game, plus the arrow keys, with the pointer
   over the stage; the on screen buttons are the touch path. The loop runs
   only while a turn is held. All sixteen renders preload, as the game
   preloads them, so the first relight is never a blank. */
(function () {
  "use strict";

  var TURN_RATE = 120;                 /* degrees per second held */
  var COUNT = 16;
  var CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

  function asset(i) {
    return "media/epg/epg-heading-" + String(i).padStart(2, "0") + ".webp";
  }

  function setup(stage) {
    if (stage.__epgLive) return;
    stage.__epgLive = true;
    var reticle = stage.querySelector(".epgc-reticle");
    var label = stage.querySelector(".epgc-readout span");
    var readout = stage.querySelector(".epgc-readout strong");
    var active = stage.querySelector(".epgc-active");
    if (!reticle || !readout || !active) return;

    for (var i = 0; i < COUNT; i++) { new Image().src = asset(i); }

    var heading = 0, dir = 0, raf = 0, last = 0, sector = -1;

    function paint() {
      /* the game's own mapping, carried verbatim */
      var compass = (((heading + 90) % 360) + 360) % 360;
      var ccw = (360 - compass) % 360;
      var idx = Math.floor(ccw / (360 / COUNT)) % COUNT;
      var cardinal = CARDINALS[Math.round(compass / 45) % 8];
      reticle.style.setProperty("--heading-angle", compass.toFixed(1) + "deg");
      label.textContent = "FLY HEADING · EPG " + String(idx).padStart(2, "0");
      readout.textContent = cardinal + " · " + String(Math.round(compass) % 360).padStart(3, "0") + "°";
      if (idx !== sector) {
        sector = idx;
        active.src = asset(idx);
        /* relight: restart the sector arrive flash, per the replay rule */
        active.style.animation = "none";
        void active.offsetWidth;
        active.style.animation = "";
      }
      stage.setAttribute("aria-label",
        "Fly heading " + cardinal + ", " + Math.round(compass) + " degrees, EPG sector " + idx);
    }
    function frame(now) {
      if (!dir) { raf = 0; return; }
      if (!last) last = now;
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      heading += dir * TURN_RATE * dt;
      paint();
      raf = requestAnimationFrame(frame);
    }
    function setDir(d) {
      dir = d;
      stage.classList.toggle("turn-left", d < 0);
      stage.classList.toggle("turn-right", d > 0);
      if (d && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    }

    stage.querySelectorAll(".epgc-keys button").forEach(function (b) {
      var d = b.getAttribute("data-turn") === "left" ? -1 : 1;
      b.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        setDir(d);
      });
      ["pointerup", "pointercancel"].forEach(function (t) {
        b.addEventListener(t, function () { setDir(0); });
      });
    });

    var over = false;
    stage.addEventListener("pointerenter", function () { over = true; });
    stage.addEventListener("pointerleave", function () { over = false; });
    window.addEventListener("keydown", function (e) {
      if (!over || e.repeat) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") setDir(-1);
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") setDir(1);
    });
    window.addEventListener("keyup", function (e) {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A" ||
          e.key === "ArrowRight" || e.key === "d" || e.key === "D") setDir(0);
    });

    paint();
  }

  function init() {
    document.querySelectorAll(".epgc-stage").forEach(setup);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
