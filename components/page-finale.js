/* ---- page finale (holofinale) -------------------------------------------
   Fires the confetti burst and sends the mascot up on balloons, once, when
   the reader reaches the end of the content.

     <div class="holofinale"
          data-holofinale-src="media/nurro-balloons.png"
          data-holofinale-palette="rainbow"
          data-holofinale-intensity="2"></div>

   Every attribute is optional. The image path defaults to
   media/nurro-balloons.png because that is where this repo keeps it, and it
   is an attribute rather than a constant because nobody else has Nurro.

   Once per page load. Not once per visit to the bottom: a celebration that
   replays every time you scroll down and back stops being a celebration, so
   the observer disconnects itself on the first crossing and the marker is
   left inert.

   An IntersectionObserver on a sentinel, not a scroll listener doing
   arithmetic. It costs nothing while the reader is anywhere else on the page
   and it does not run code on every scroll event, which is what makes smooth
   scrolling stutter.

   Reduced motion means nothing fires: no riser is created and no burst is
   requested. There is no informational content in a balloon, so there is
   nothing to degrade to.

   Cleanup: the riser is removed when its rise animation ends, with a timer as
   the backstop for the case where the animation never runs because the tab was
   never painted. The confetti canvas removes itself when its last particle
   dies, which is holoburst's own business. Nothing is left in the DOM. */

(function () {
  "use strict";

  var RISE_MS = 8000;   /* must match holofinale-rise in the stylesheet */
  var GRACE = 900;      /* backstop past the animation, for a tab that never
                           painted and so never fired animationend */

  var reduce = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  function launch(sentinel) {
    var src = sentinel.getAttribute("data-holofinale-src") || "media/nurro-balloons.png";
    var palette = sentinel.getAttribute("data-holofinale-palette") || "rainbow";
    var intensity = Number(sentinel.getAttribute("data-holofinale-intensity")) || 2;

    /* the outer element only rises */
    var rise = document.createElement("div");
    rise.className = "holofinale-rise";
    /* decoration. A screen reader has no use for a balloon. */
    rise.setAttribute("aria-hidden", "true");

    /* the inner element only sways */
    var img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    /* a mascot that fails to load takes the whole riser with it, rather than
       sending an empty box up the page */
    img.addEventListener("error", function () { done(); });
    img.src = src;
    rise.appendChild(img);

    var finished = false;
    function done() {
      if (finished) return;
      finished = true;
      if (rise.parentNode) rise.remove();
    }

    rise.addEventListener("animationend", function (e) {
      /* only the rise ends this. The sway loops and never fires it. */
      if (e.animationName === "holofinale-rise") done();
    });
    window.setTimeout(done, RISE_MS + GRACE);

    document.body.appendChild(rise);

    if (typeof window.holoburst === "function") {
      window.holoburst(palette, intensity);
    }
  }

  function init(root) {
    if (reduce.matches) return;
    if (!("IntersectionObserver" in window)) return;

    var scope = root || document;
    var marks = scope.querySelectorAll(".holofinale");

    Array.prototype.forEach.call(marks, function (mark) {
      if (mark.holofinaleBound) return;
      mark.holofinaleBound = true;

      var observer = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].isIntersecting) continue;
          /* disconnect before launching, so a burst that scrolls the page
             cannot re enter and fire a second time */
          observer.disconnect();
          launch(mark);
          return;
        }
      }, { threshold: 0 });

      observer.observe(mark);
    });
  }

  window.holofinale = { init: init, launch: launch };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(); });
  } else {
    init();
  }
})();
