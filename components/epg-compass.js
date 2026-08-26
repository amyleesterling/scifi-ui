/* ---- epg-compass: behavior --------------------------------------------------
   The drive from BE THE FLY: holding a turn key rotates the heading at the
   game's steady rate, the reticle snaps after it on its 80ms transition,
   the readout reports whole degrees, and each time the heading enters a
   new 22.5 degree sector the wedge relights with the sector arrive flash,
   which in the game is a new EPG wedge of the ellipsoid body waking up.
   Arrow keys work while the pointer is over the stage. The loop runs only
   while a turn is held, and settles the instant it is released. */
(function () {
  "use strict";

  var TURN_RATE = 120;                 /* degrees per second held */

  function setup(stage) {
    if (stage.__epgLive) return;
    stage.__epgLive = true;
    var reticle = stage.querySelector(".epgc-reticle");
    var wheel = stage.querySelector(".epgc-wheel");
    var readout = stage.querySelector(".epgc-readout strong");
    var wedge = stage.querySelector(".epgc-wedge");
    if (!reticle || !readout || !wedge) return;

    /* sixteen tick marks around the schematic ring */
    for (var i = 0; i < 16; i++) {
      var t = document.createElement("i");
      t.style.setProperty("--a", (i * 22.5) + "deg");
      wheel.appendChild(t);
    }

    var heading = 0, dir = 0, raf = 0, last = 0, sector = -1;

    function paint() {
      var h = ((heading % 360) + 360) % 360;
      reticle.style.setProperty("--heading-angle", h.toFixed(1) + "deg");
      readout.textContent = Math.round(h) + "°";
      var s = Math.floor(((h + 11.25) % 360) / 22.5) % 16;
      if (s !== sector) {
        sector = s;
        wedge.style.setProperty("--sector", String(s));
        /* relight: restart the sector arrive flash, per the replay rule */
        wedge.style.animation = "none";
        void wedge.offsetWidth;
        wedge.style.animation = "";
      }
      stage.setAttribute("aria-label",
        "Heading " + Math.round(h) + " degrees, sector " + (s + 1) + " of 16");
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
      if (e.key === "ArrowLeft") setDir(-1);
      if (e.key === "ArrowRight") setDir(1);
    });
    window.addEventListener("keyup", function (e) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") setDir(0);
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
