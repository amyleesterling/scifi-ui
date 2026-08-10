/* ---- things that just arrived (holoarrive) --------------------------------
   Pairs with arrival.css.

     var feed = holoArrive(listEl, { freshFor: 6000 });
     feed.add({ text: "Segmentation finished", time: "now" });
     feed.add({ text: "Two proofreads queued", time: "now" }, { batch: true });

   Two independent behaviours on purpose:

     entrance   a damped spring, one per item, staggered
     freshness  an exponential decay on a separate value

   Keeping them separate is the point. The entrance is over in half a second
   and only helps somebody who was looking. The mark decays over seconds and is
   what tells somebody returning to the tab which rows are new, so it has to be
   able to outlive the motion and to survive reduced motion untouched.

   The stagger adds a fraction of the golden angle per item, so a batch does
   not land as an even mechanical sweep down the list.

   Returns a handle with .add(), .markAllSeen() and .destroy().
--------------------------------------------------------------------------- */
(function (global) {
  "use strict";

  var reduced = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)");
  var GOLDEN = 0.381966;   // 1 - 1/phi, used to break up an even stagger

  function holoArrive(el, opts) {
    opts = opts || {};
    if (!el) return null;

    var freshFor = opts.freshFor || 6000;
    var counter = 0;
    var live = [];
    var raf = 0, backstop = 0;

    el.classList.add("holoarrive");
    if (!el.getAttribute("role")) el.setAttribute("role", "list");

    function tick(now) {
      var busy = false;
      for (var i = live.length - 1; i >= 0; i--) {
        var it = live[i];

        /* entrance: a damped spring towards 1 */
        if (!it.settled) {
          if (now >= it.startAt) {
            if (!it.last) it.last = now;
            var dt = Math.min((now - it.last) / 1000, 1 / 30);
            it.last = now;
            var h = dt / 3;
            for (var k = 0; k < 3; k++) {
              var a = -it.k * (it.x - 1) - it.c * it.v;
              it.v += a * h; it.x += it.v * h;
            }
            it.el.style.setProperty("--in", Math.max(0, Math.min(1.02, it.x)).toFixed(3));
            if (Math.abs(it.x - 1) < 0.002 && Math.abs(it.v) < 0.002) {
              it.el.style.setProperty("--in", "1");
              it.settled = true;
            }
          }
          busy = true;
        }

        /* freshness: an exponential decay, independent of the entrance */
        if (it.fresh > 0.02 && !it.seen) {
          var age = now - it.bornAt;
          it.fresh = Math.exp(-age / (freshFor / 3));
          it.el.style.setProperty("--fresh", it.fresh.toFixed(3));
          busy = true;
        } else if (!it.done) {
          it.fresh = 0;
          it.el.style.setProperty("--fresh", "0");
          it.el.removeAttribute("data-new");
          it.done = true;
        }

        if (it.settled && it.done) live.splice(i, 1);
      }
      if (busy) raf = global.requestAnimationFrame(tick);
      else { raf = 0; global.clearTimeout(backstop); }
    }

    function pump() {
      if (raf) return;
      raf = global.requestAnimationFrame(tick);
      /* teardown backstop, per AGENTS.md section 4 */
      global.clearTimeout(backstop);
      backstop = global.setTimeout(function () {
        if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
        live.forEach(function (it) {
          it.el.style.setProperty("--in", "1");
          it.el.style.setProperty("--fresh", "0");
        });
        live.length = 0;
      }, 20000);
    }

    var handle = {
      add: function (data, addOpts) {
        addOpts = addOpts || {};
        data = typeof data === "string" ? { text: data } : (data || {});
        var node = document.createElement("div");
        node.className = "holoarrive-item";
        node.setAttribute("role", "listitem");
        node.setAttribute("data-holo-tap", "");
        node.setAttribute("tabindex", "0");
        node.setAttribute("data-new", "true");
        node.innerHTML =
          '<span class="holoarrive-dot" aria-hidden="true"></span>' +
          '<span class="holoarrive-body"></span>' +
          '<span class="holoarrive-new">new</span>' +
          '<span class="holoarrive-time"></span>';
        node.querySelector(".holoarrive-body").textContent = data.text || "";
        node.querySelector(".holoarrive-time").textContent = data.time || "";

        el.insertBefore(node, el.firstChild);

        var idx = counter++;
        var stagger = addOpts.batch ? ((idx * GOLDEN) % 1) * 260 + idx * 40 : 0;
        var now = performance.now();
        var item = {
          el: node, x: 0, v: 0, k: 260, c: 24,
          startAt: now + stagger, bornAt: now, last: 0,
          fresh: 1, seen: false, settled: false, done: false,
        };

        if (reduced && reduced.matches) {
          node.style.setProperty("--in", "1");
          item.settled = true;
        } else {
          node.style.setProperty("--in", "0");
        }
        node.style.setProperty("--fresh", "1");

        /* attention marks it seen, which is the only honest way to clear a
           marker that exists to say you have not looked at this yet */
        function seen() {
          if (item.seen) return;
          item.seen = true;
          item.fresh = 0;
          node.style.setProperty("--fresh", "0");
          node.removeAttribute("data-new");
        }
        node.addEventListener("pointerenter", seen);
        node.addEventListener("focus", seen);
        node.addEventListener("holotap:on", seen);

        live.push(item);
        pump();
        return node;
      },
      markAllSeen: function () {
        el.querySelectorAll(".holoarrive-item").forEach(function (n) {
          n.style.setProperty("--fresh", "0");
          n.removeAttribute("data-new");
        });
        live.forEach(function (it) { it.seen = true; it.fresh = 0; });
        return handle;
      },
      destroy: function () {
        if (raf) global.cancelAnimationFrame(raf);
        global.clearTimeout(backstop);
        live.length = 0;
      },
    };
    return handle;
  }

  global.holoArrive = holoArrive;
})(window);
