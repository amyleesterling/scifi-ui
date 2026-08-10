/* ---- transition between two states of a region (holoveil) -----------------
   Pairs with veil.css.

     holoVeil(regionEl, function () {
       regionEl.querySelector(".panel").replaceWith(nextPanel);
     });

   A packet crosses the region once. The callback fires when the packet centre
   reaches the middle, so the change is hidden under the brightest part and
   there is never a frame showing both states or an empty container.

   The callback is guaranteed to run exactly once even if the animation is cut
   short by the backstop or by reduced motion, because a transition that can
   drop the swap is worse than no transition at all: the region would be left
   showing content that is no longer true.

   Returns a promise that resolves when the sweep is finished.
--------------------------------------------------------------------------- */
(function (global) {
  "use strict";

  var reduced = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)");

  function packet(phase, x, sigma) {
    var d = phase - x;
    d -= Math.floor(d);
    var dd = Math.min(d, 1 - d);
    return Math.exp(-(dd * dd) / (2 * sigma * sigma));
  }

  function holoVeil(host, swap, opts) {
    opts = opts || {};
    if (!host) return Promise.resolve();
    var duration = opts.duration || 620;
    var swapped = false;

    function doSwap() {
      if (swapped) return;
      swapped = true;
      try { if (typeof swap === "function") swap(); } catch (e) { /* the sweep must still finish */ }
    }

    host.classList.add("holoveil-host");

    if (reduced && reduced.matches) {
      doSwap();
      return Promise.resolve();
    }

    var veil = document.createElement("div");
    veil.className = "holoveil";
    veil.setAttribute("aria-hidden", "true");
    var cv = document.createElement("canvas");
    veil.appendChild(cv);
    host.appendChild(veil);
    var ctx = cv.getContext("2d");

    var tint = getComputedStyle(host).getPropertyValue("--holo-beam").trim().replace(/\s+/g, ",") || "178,216,248";

    return new Promise(function (resolve) {
      var t0 = performance.now(), raf = 0, backstop = 0;

      function finish() {
        if (raf) global.cancelAnimationFrame(raf);
        global.clearTimeout(backstop);
        doSwap();
        if (veil.parentNode) veil.parentNode.removeChild(veil);
        resolve();
      }

      function frame(now) {
        var d = Math.min(1, (now - t0) / duration);

        var dpr = Math.min(global.devicePixelRatio || 1, 2);
        var r = cv.getBoundingClientRect();
        var W = Math.max(1, Math.round(r.width * dpr));
        var H = Math.max(1, Math.round(r.height * dpr));
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        ctx.clearRect(0, 0, W, H);

        /* the packet centre travels from just off one edge to just off the
           other, so the region is never partly lit at the start or the end */
        var centre = -0.25 + d * 1.5;
        var step = Math.max(1, Math.floor(dpr));
        for (var x = 0; x < W; x += step) {
          var u = x / W;
          var a = Math.exp(-Math.pow((u - centre) / 0.16, 2));
          if (a < 0.004) continue;
          ctx.fillStyle = "rgba(" + tint + "," + (a * 0.92).toFixed(3) + ")";
          ctx.fillRect(x, 0, step, H);
        }

        /* swap under the brightest part */
        if (!swapped && centre >= 0.5) doSwap();

        if (d < 1) raf = global.requestAnimationFrame(frame);
        else finish();
      }

      raf = global.requestAnimationFrame(frame);
      /* teardown backstop, per AGENTS.md section 4. It also guarantees the
         swap, so a dropped animation cannot leave stale content on screen. */
      backstop = global.setTimeout(finish, duration + 2500);
    });
  }

  global.holoVeil = holoVeil;
})(window);
