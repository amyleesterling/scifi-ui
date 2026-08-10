/* ---- travelling wave activity (holowave) ---------------------------------
   Pairs with wave-progress.css.

     holoWave(el, {
       label: "Streaming segmentation",
       value: 0.61,        // omit for an indeterminate bar
       speed: 0.42,        // packet lengths per second
       width: 0.16,        // packet width, as a fraction of the track
     });

     holoWave.edge(panelEl, { speed: 0.28 });   // the same packet on a border

   The packet is a gaussian in phase, not a sliding gradient:

     b(x) = exp( -d(phase, x)^2 / 2s^2 )

   where d is the wrapped distance around the cycle. That is what gives it a
   soft head and tail with a definite centre, and it is why the width is a
   number you can set rather than a stack of colour stops to hand tune.

   Returns a handle with .set(), .stop() and .destroy(). Call destroy when you
   remove the element, though the component also stops itself when it leaves
   the viewport and carries a teardown backstop, per AGENTS.md section 4.
--------------------------------------------------------------------------- */
(function (global) {
  "use strict";

  var reduced = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)");

  /* wrapped gaussian: peaks where the phase matches the position */
  function packet(phase, x, sigma) {
    var d = phase - x;
    d -= Math.floor(d);
    var dd = Math.min(d, 1 - d);
    return Math.exp(-(dd * dd) / (2 * sigma * sigma));
  }

  function tokenRGB(el, name, fallback) {
    var v = getComputedStyle(el).getPropertyValue(name).trim();
    return v ? v.replace(/\s+/g, ",") : fallback;
  }

  function holoWave(el, opts) {
    opts = opts || {};
    if (!el) return null;

    var determinate = typeof opts.value === "number";
    var value = determinate ? Math.min(1, Math.max(0, opts.value)) : 1;
    var speed = opts.speed || 0.42;
    var sigma = (opts.width || 0.16) / 2;

    el.classList.add("holowave");
    el.innerHTML =
      '<div class="holowave-head">' +
        '<span class="holowave-label"></span>' +
        '<span class="holowave-value"></span>' +
      '</div>' +
      '<div class="holowave-track"><canvas></canvas></div>';

    var labelEl = el.querySelector(".holowave-label");
    var valueEl = el.querySelector(".holowave-value");
    var track = el.querySelector(".holowave-track");
    var cv = el.querySelector("canvas");
    var ctx = cv.getContext("2d");

    labelEl.textContent = opts.label || "";

    /* The bar reports its own state. A progress bar with no accessible value is
       a decoration, and a screen reader gets nothing from a canvas. */
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", opts.label || "Activity");
    if (determinate) {
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
    }

    var phase = 0, raf = 0, last = 0, running = false, dead = false;

    function paint() {
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var r = track.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width * dpr));
      var h = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }

      var tint = tokenRGB(el, "--holowave-tint", "178,216,248");
      ctx.clearRect(0, 0, w, h);

      /* the filled part, which is the honest value */
      var fill = Math.round(w * value);
      if (determinate) {
        ctx.fillStyle = "rgba(" + tint + ",0.22)";
        ctx.fillRect(0, 0, fill, h);
      }

      /* the packet, drawn column by column so the profile is the maths and not
         a gradient approximating it. The packet only travels inside the filled
         part, so it never promises progress the value does not have. */
      var span = determinate ? fill : w;
      if (span > 0) {
        var step = Math.max(1, Math.floor(dpr));
        for (var x = 0; x < span; x += step) {
          var a = packet(phase, x / span, sigma);
          if (a < 0.004) continue;
          ctx.fillStyle = "rgba(" + tint + "," + (a * 0.95).toFixed(3) + ")";
          ctx.fillRect(x, 0, step, h);
        }
      }
    }

    function frame(now) {
      if (dead) return;
      if (!last) last = now;
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      phase = (phase + dt * speed) % 1;
      paint();
      raf = global.requestAnimationFrame(frame);
    }

    function start() {
      if (running || dead) return;
      if (reduced && reduced.matches) { paint(); return; }
      running = true;
      last = 0;
      raf = global.requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) global.cancelAnimationFrame(raf);
      raf = 0;
    }

    /* Ambient only while it is in view. A loop running under a page nobody is
       looking at is the thing AGENTS.md section 3 is about. */
    var io = null;
    if (global.IntersectionObserver) {
      io = new global.IntersectionObserver(function (entries) {
        if (entries[entries.length - 1].isIntersecting) start(); else stop();
      });
      io.observe(el);
    } else {
      start();
    }

    var ro = null;
    if (global.ResizeObserver) {
      ro = new global.ResizeObserver(function () { paint(); });
      ro.observe(track);
    }

    function report() {
      if (determinate) {
        var pct = Math.round(value * 100);
        valueEl.textContent = pct + "%";
        track.setAttribute("aria-valuenow", String(pct));
      } else {
        valueEl.textContent = opts.busyLabel || "working";
      }
    }
    report();
    paint();

    var handle = {
      set: function (v) {
        if (typeof v === "number") { value = Math.min(1, Math.max(0, v)); }
        report();
        paint();
        return handle;
      },
      stop: stop,
      start: start,
      destroy: function () {
        dead = true;
        stop();
        if (io) io.disconnect();
        if (ro) ro.disconnect();
      },
    };
    return handle;
  }

  /* ---- the same packet, running a panel border ---------------------------
     Drawn with a dash on a real path rather than a rotating conic gradient, so
     the head keeps its length and its speed all the way round, including the
     corners. The viewBox is set from the measured box, or a stretched viewBox
     would distort the dash on the short sides.
  ------------------------------------------------------------------------- */
  holoWave.edge = function (el, opts) {
    opts = opts || {};
    if (!el) return null;
    var speed = opts.speed || 0.28;
    var radius = typeof opts.radius === "number" ? opts.radius : 14;

    el.classList.add("holowave-edge");

    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("preserveAspectRatio", "none");

    function rect(cls) {
      var r = document.createElementNS(NS, "rect");
      r.setAttribute("class", cls);
      r.setAttribute("rx", String(radius));
      svg.appendChild(r);
      return r;
    }
    var track = rect("holowave-edge-track");
    var trail = rect("holowave-edge-packet is-trail");
    var head = rect("holowave-edge-packet");
    el.appendChild(svg);

    var perim = 0, offset = 0, raf = 0, last = 0, running = false, dead = false;

    function measure() {
      var r = el.getBoundingClientRect();
      var w = Math.max(1, r.width), h = Math.max(1, r.height);
      svg.setAttribute("viewBox", "0 0 " + w + " " + h);
      [track, trail, head].forEach(function (n) {
        n.setAttribute("x", "0.5");
        n.setAttribute("y", "0.5");
        n.setAttribute("width", String(Math.max(1, w - 1)));
        n.setAttribute("height", String(Math.max(1, h - 1)));
      });
      /* perimeter of a rounded rect: the straight runs plus one full circle */
      var rr = Math.min(radius, w / 2, h / 2);
      perim = 2 * (w - 2 * rr) + 2 * (h - 2 * rr) + 2 * Math.PI * rr;
      var headLen = Math.max(24, perim * 0.09);
      head.setAttribute("stroke-dasharray", headLen + " " + Math.max(1, perim - headLen));
      var trailLen = headLen * 0.5;
      trail.setAttribute("stroke-dasharray", trailLen + " " + Math.max(1, perim - trailLen));
      apply();
    }

    function apply() {
      head.setAttribute("stroke-dashoffset", String(-offset));
      trail.setAttribute("stroke-dashoffset", String(-(offset - perim * 0.045)));
    }

    function frame(now) {
      if (dead) return;
      if (!last) last = now;
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      offset = (offset + dt * speed * perim) % perim;
      apply();
      raf = global.requestAnimationFrame(frame);
    }

    function start() {
      if (running || dead) return;
      if (reduced && reduced.matches) return;
      running = true; last = 0;
      raf = global.requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) global.cancelAnimationFrame(raf);
      raf = 0;
    }

    var io = null;
    if (global.IntersectionObserver) {
      io = new global.IntersectionObserver(function (entries) {
        if (entries[entries.length - 1].isIntersecting) start(); else stop();
      });
      io.observe(el);
    } else { start(); }

    var ro = null;
    if (global.ResizeObserver) {
      ro = new global.ResizeObserver(measure);
      ro.observe(el);
    } else {
      global.addEventListener("resize", measure);
    }
    measure();

    return {
      stop: stop,
      start: start,
      destroy: function () {
        dead = true; stop();
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },
    };
  };

  global.holoWave = holoWave;
})(window);
