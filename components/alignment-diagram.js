/* ---- alignment-diagram: behavior --------------------------------------------
   The site's own disorder model, carried verbatim from App.tsx: confidence
   becomes drift, drift becomes disorder with a 0.42 floor, and disorder
   scales three fixed sinusoids to give each sheet its offset and its
   rotation. The sheets are deterministic, not random, so the same
   confidence always draws the same shear.

     const drift = (100 - alignment) / 100;
     const disorder = .42 + drift * .58;
     dx = sin(i * 2.2) * 26 * disorder
     dy = cos(i * 1.7) * 18 * disorder
     dr = sin(i * 1.3) * 2.8 * disorder

   The CSS transition does the travelling, so dragging the control shears
   or converges the stack on the shipped 0.32s curve.

   Added for the demo: a sweep. The card's argument is what happens between
   zero and a hundred, and a static slider does not make that argument, so
   the stack runs the range once when it first comes into view and on
   demand after that. Touching the control takes it back. */
(function () {
  "use strict";

  var reduced = window.matchMedia
    ? matchMedia("(prefers-reduced-motion: reduce)").matches : false;

  function setup(dia) {
    if (dia.__alignLive) return;
    dia.__alignLive = true;
    var sheets = Array.prototype.slice.call(dia.querySelectorAll(".aligndia-sheets i"));
    var input = dia.querySelector(".aligndia-control input");
    var out = dia.querySelector(".aligndia-control output");
    if (!sheets.length || !input) return;

    function paint(alignment) {
      /* the site's own formula */
      var drift = (100 - alignment) / 100;
      var disorder = 0.42 + drift * 0.58;
      sheets.forEach(function (s, i) {
        s.style.setProperty("--dx", (Math.sin(i * 2.2) * 26 * disorder).toFixed(2) + "px");
        s.style.setProperty("--dy", (Math.cos(i * 1.7) * 18 * disorder).toFixed(2) + "px");
        s.style.setProperty("--dr", (Math.sin(i * 1.3) * 2.8 * disorder).toFixed(2) + "deg");
      });
      dia.style.setProperty("--alignment", alignment + "%");
      if (out) out.textContent = Math.round(alignment) + "%";
    }

    var sweeping = 0;
    function stopSweep() { if (sweeping) { cancelAnimationFrame(sweeping); sweeping = 0; } }
    function sweep() {
      if (reduced) { input.value = 100; paint(100); return; }
      stopSweep();
      var HOLD = 420, RISE = 2200, t0 = 0;
      function step(now) {
        if (!t0) t0 = now;
        var t = now - t0;
        var v = t < HOLD ? 0
          : t < HOLD + RISE ? 100 * (1 - Math.pow(1 - (t - HOLD) / RISE, 3))
          : 100;
        input.value = v;
        paint(v);
        if (t < HOLD + RISE) sweeping = requestAnimationFrame(step);
        else sweeping = 0;
      }
      sweeping = requestAnimationFrame(step);
    }

    input.addEventListener("input", function () {
      stopSweep();
      paint(Number(input.value));
    });

    paint(Number(input.value));

    var replay = dia.parentNode && dia.parentNode.querySelector("[data-align-replay]");
    if (replay) replay.addEventListener("click", sweep);

    if (window.IntersectionObserver && !reduced) {
      var fired = false;
      new IntersectionObserver(function (es, io) {
        if (es[es.length - 1].isIntersecting && !fired) {
          fired = true;
          io.disconnect();
          input.value = 0;
          paint(0);
          sweep();
        }
      }, { threshold: 0.4 }).observe(dia);
    }
  }

  function init() { document.querySelectorAll(".aligndia").forEach(setup); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
