/* ---- function to structure, across scales (holobridge) --------------------
   Pairs with scale-bridge.css.

     holoBridge(el, {
       rungs: ["1 mm", "100 um", "10 um", "1 um", "100 nm", "10 nm"],
       classes: [
         { id: "fast", name: "Fast spiking", isi: 0.055, jitter: 0.1, density: 260 },
         { id: "reg",  name: "Regular",      isi: 0.16,  jitter: 0.2, density: 120 },
         { id: "burst",name: "Bursting",     isi: 0.12,  jitter: 0.5, burst: true, density: 180 },
       ],
     });

   Each class draws its own spike train from an interval model, so the three
   traces differ because their timing differs rather than because three shapes
   were drawn by hand. Choosing one walks the ladder down a rung at a time and
   then draws a molecular field whose density comes from that same class.

   The marker travelling rather than jumping is the entire accessibility of the
   jump: six orders of magnitude is not a distance anyone can feel, so the
   component spends about half a second showing it.

   Returns a handle with .select() and .destroy().
--------------------------------------------------------------------------- */
(function (global) {
  "use strict";

  var reduced = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)");

  var DEFAULT_CLASSES = [
    { id: "fast",  name: "Fast spiking", isi: 0.055, jitter: 0.10, density: 260 },
    { id: "reg",   name: "Regular",      isi: 0.160, jitter: 0.20, density: 120 },
    { id: "burst", name: "Bursting",     isi: 0.120, jitter: 0.50, burst: true, density: 180 },
  ];

  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  function holoBridge(el, opts) {
    opts = opts || {};
    if (!el) return null;

    var rungs = opts.rungs || ["1 mm", "100 um", "10 um", "1 um", "100 nm", "10 nm"];
    var classes = opts.classes || DEFAULT_CLASSES;
    var current = null;

    el.classList.add("holobridge");
    el.innerHTML =
      '<div class="holobridge-classes" role="group" aria-label="Functional class"></div>' +
      '<div class="holobridge-body">' +
        '<ol class="holobridge-ladder"></ol>' +
        '<div class="holobridge-zoom">' +
          '<canvas></canvas>' +
          '<p class="holobridge-caption"></p>' +
        '</div>' +
      '</div>';

    var group = el.querySelector(".holobridge-classes");
    var ladder = el.querySelector(".holobridge-ladder");
    var zoom = el.querySelector(".holobridge-zoom canvas");
    var zctx = zoom.getContext("2d");
    var caption = el.querySelector(".holobridge-caption");

    zoom.setAttribute("role", "img");

    rungs.forEach(function (r) {
      var li = document.createElement("li");
      li.className = "holobridge-rung";
      li.textContent = r;
      ladder.appendChild(li);
    });
    var rungEls = Array.prototype.slice.call(ladder.children);

    /* ---- spike trains ---------------------------------------------------- */
    function train(c) {
      var rand = rng(7 + c.id.length * 31);
      var times = [], t = 0.02;
      while (t < 1) {
        times.push(t);
        var gap = c.isi * (1 + (rand() - 0.5) * 2 * c.jitter);
        if (c.burst && rand() < 0.45) gap = c.isi * 0.16;
        t += Math.max(0.012, gap);
      }
      return times;
    }

    function paintTrace(cv, c) {
      var ctx = cv.getContext("2d");
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var r = cv.getBoundingClientRect();
      var W = Math.max(1, Math.round(r.width * dpr));
      var H = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      ctx.clearRect(0, 0, W, H);
      var tint = getComputedStyle(el).getPropertyValue("--holobridge-tint").trim().replace(/\s+/g, ",") || "178,216,248";

      ctx.strokeStyle = "rgba(" + tint + ",0.75)";
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.78);
      c.times.forEach(function (t) {
        var x = t * W;
        ctx.lineTo(x - 1.2 * dpr, H * 0.78);
        ctx.lineTo(x, H * 0.14);
        ctx.lineTo(x + 1.2 * dpr, H * 0.78);
      });
      ctx.lineTo(W, H * 0.78);
      ctx.stroke();
    }

    classes.forEach(function (c) {
      c.times = train(c);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "holobridge-class";
      b.setAttribute("data-holo-tap", "");
      b.setAttribute("data-id", c.id);
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = '<canvas></canvas><span></span>';
      b.querySelector("span").textContent = c.name + ", " + c.times.length + " spikes per second";
      group.appendChild(b);
      c.btn = b;
      c.cv = b.querySelector("canvas");
    });

    /* ---- the destination view ------------------------------------------- */
    function paintZoom(c, progress) {
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var r = zoom.getBoundingClientRect();
      var W = Math.max(1, Math.round(r.width * dpr));
      var H = Math.max(1, Math.round(r.height * dpr));
      if (zoom.width !== W || zoom.height !== H) { zoom.width = W; zoom.height = H; }
      zctx.clearRect(0, 0, W, H);
      if (!c) {
        caption.textContent = "Choose a functional class to travel to its structure.";
        zoom.setAttribute("aria-label", "No class selected");
        return;
      }
      var tint = getComputedStyle(el).getPropertyValue("--holobridge-tint").trim().replace(/\s+/g, ",") || "178,216,248";
      var warm = getComputedStyle(el).getPropertyValue("--holobridge-warm").trim().replace(/\s+/g, ",") || "232,169,58";

      /* a membrane running across the view, with channels embedded in it. The
         density is the class's, so the two views are about the same cell. */
      var yMid = H * 0.5, amp = H * 0.1;
      zctx.strokeStyle = "rgba(" + tint + ",0.5)";
      zctx.lineWidth = 1.4 * dpr;
      [-1, 1].forEach(function (side) {
        zctx.beginPath();
        for (var x = 0; x <= W; x += 4) {
          var y = yMid + Math.sin(x / W * 6.2) * amp + side * H * 0.055;
          if (x === 0) zctx.moveTo(x, y); else zctx.lineTo(x, y);
        }
        zctx.stroke();
      });

      var rand = rng(99 + c.density);
      var n = Math.round(c.density * progress);
      for (var i = 0; i < n; i++) {
        var u = rand();
        var x2 = u * W;
        var y2 = yMid + Math.sin(u * 6.2) * amp + (rand() - 0.5) * H * 0.11;
        var hot = rand() < 0.22;
        zctx.fillStyle = hot ? "rgba(" + warm + ",0.9)" : "rgba(" + tint + ",0.55)";
        zctx.beginPath();
        zctx.arc(x2, y2, (hot ? 2.4 : 1.5) * dpr, 0, Math.PI * 2);
        zctx.fill();
      }

      caption.innerHTML = "<b>" + c.name + "</b> at " + rungs[rungs.length - 1] +
        ", the same cell that produced the trace above";
      zoom.setAttribute("aria-label",
        c.name + " neuron shown at molecular scale, " + rungs[rungs.length - 1] + " per division");
    }

    /* ---- the descent ----------------------------------------------------- */
    var raf = 0, backstop = 0;
    function descend(c) {
      var steps = rungEls.length;
      if (reduced && reduced.matches) {
        rungEls.forEach(function (n) { n.classList.add("is-reached"); });
        paintZoom(c, 1);
        return;
      }
      rungEls.forEach(function (n) { n.classList.remove("is-reached"); });
      var t0 = performance.now(), dur = 620;
      if (raf) global.cancelAnimationFrame(raf);
      (function frame(now) {
        var d = Math.min(1, (now - t0) / dur);
        var reached = Math.round(d * steps);
        rungEls.forEach(function (n, i) { n.classList.toggle("is-reached", i < reached); });
        paintZoom(c, d);
        if (d < 1) raf = global.requestAnimationFrame(frame);
        else { raf = 0; global.clearTimeout(backstop); }
      })(t0);
      /* teardown backstop, per AGENTS.md section 4 */
      global.clearTimeout(backstop);
      backstop = global.setTimeout(function () {
        if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
        rungEls.forEach(function (n) { n.classList.add("is-reached"); });
        paintZoom(c, 1);
      }, 3000);
    }

    group.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".holobridge-class");
      if (!b) return;
      handle.select(b.getAttribute("data-id"));
    });

    function paintAllTraces() { classes.forEach(function (c) { paintTrace(c.cv, c); }); }

    var ro = null;
    if (global.ResizeObserver) {
      ro = new global.ResizeObserver(function () {
        paintAllTraces();
        paintZoom(current, current ? 1 : 0);
      });
      ro.observe(el);
    }
    paintAllTraces();
    paintZoom(null, 0);

    var handle = {
      select: function (id) {
        classes.forEach(function (c) {
          var isIt = c.id === id;
          c.btn.setAttribute("aria-pressed", String(isIt));
          if (isIt) current = c;
        });
        descend(current);
        return handle;
      },
      destroy: function () {
        if (raf) global.cancelAnimationFrame(raf);
        global.clearTimeout(backstop);
        if (ro) ro.disconnect();
      },
    };
    return handle;
  }

  global.holoBridge = holoBridge;
})(window);
