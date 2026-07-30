/* ---- panel surface (holopanel) ------------------------------------------
   Lights the shared panel entrance the first time each .holopanel is seen.

   The whole of it is: add is-in when the panel scrolls into view. The resting
   state in the stylesheet is the finished panel, so this only ever adds the
   entrance, never the panel itself, and a page with this script stripped out
   still shows every panel, just without the materialise.

   Anything already on screen is lit synchronously, before the first paint,
   because waiting for the observer would show one frame of the finished panel
   and then restart it. Everything below the fold waits its turn. This is the
   same shape as the boot on view in hologram.js, kept here so the primitive
   stands alone as a components/ part.

   Reduced motion, or no IntersectionObserver, means the entrance never runs
   and the resting panel is what shows. There is no information in the
   materialise, so there is nothing to degrade. */

(function () {
  "use strict";

  var reduce = window.matchMedia &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function init() {
    var nodes = document.querySelectorAll(".holopanel");
    if (!nodes.length) return;
    if (reduce || !("IntersectionObserver" in window)) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { threshold: 0.2 });

    nodes.forEach(function (n) {
      var r = n.getBoundingClientRect();
      if (r.height && r.top < innerHeight && r.bottom > 0) n.classList.add("is-in");
      else io.observe(n);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
