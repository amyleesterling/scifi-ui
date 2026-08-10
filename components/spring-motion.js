/* ---- spring driven motion (holospring) ------------------------------------
   Pairs with spring-motion.css.

     holoSpring(el, {
       label: "Detector cooling",
       body: "Markup shown inside the drawer.",
       stiffness: 170,
       damping: 22,
     });

   A damped harmonic oscillator, integrated per frame:

     a = -k * (x - target) - c * v
     v = v + a * dt
     x = x + v * dt

   k is stiffness and c is damping. The behaviour at the boundary is the part
   worth knowing: with c = 2 * sqrt(k) the system is critically damped and
   arrives in the shortest time with no overshoot. Below that it overshoots and
   rings, above it crawls in. The readout under the controls names which side
   of that boundary the current numbers sit on, because "damping 22" means
   nothing on its own and "underdamped, overshoots by 4 percent" does.

   dt is clamped. A tab that was in the background hands back a huge first
   delta, and an unclamped spring integrates that into an explosion.

   Returns a handle with .toggle(), .set(), .tune() and .destroy().
--------------------------------------------------------------------------- */
(function (global) {
  "use strict";

  var reduced = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)");
  var uid = 0;

  function holoSpring(el, opts) {
    opts = opts || {};
    if (!el) return null;

    var k = typeof opts.stiffness === "number" ? opts.stiffness : 170;
    var c = typeof opts.damping === "number" ? opts.damping : 22;
    var id = "holospring-drawer-" + (++uid);

    el.classList.add("holospring");
    el.innerHTML =
      '<div class="holospring-row">' +
        '<button type="button" class="holospring-switch" data-holo-tap aria-expanded="false" aria-controls="' + id + '">' +
          '<span class="holospring-knob"></span>' +
        '</button>' +
        '<span class="holospring-label"></span>' +
        '<span class="holospring-state">closed</span>' +
      '</div>' +
      '<div class="holospring-drawer" id="' + id + '">' +
        '<div class="holospring-body"><div class="holospring-card"></div></div>' +
      '</div>' +
      '<div class="holospring-controls">' +
        '<label>Stiffness <input type="range" data-p="k" min="40" max="420" step="5"></label>' +
        '<label>Damping <input type="range" data-p="c" min="4" max="60" step="1"></label>' +
        '<button type="button" class="holospring-preset" data-preset="critical">Critical</button>' +
        '<button type="button" class="holospring-preset" data-preset="bouncy">Bouncy</button>' +
        '<button type="button" class="holospring-preset" data-preset="slow">Overdamped</button>' +
      '</div>' +
      '<p class="holospring-label holospring-verdict"></p>' +
      '<div class="holospring-trace"><canvas></canvas></div>';

    var sw = el.querySelector(".holospring-switch");
    var knob = el.querySelector(".holospring-knob");
    var drawer = el.querySelector(".holospring-drawer");
    var card = el.querySelector(".holospring-card");
    var stateEl = el.querySelector(".holospring-state");
    var verdict = el.querySelector(".holospring-verdict");
    var kEl = el.querySelector('[data-p="k"]');
    var cEl = el.querySelector('[data-p="c"]');
    var cv = el.querySelector(".holospring-trace canvas");
    var ctx = cv.getContext("2d");

    el.querySelector(".holospring-label").textContent = opts.label || "Panel";
    card.innerHTML = opts.body || "";
    sw.setAttribute("aria-label", (opts.label || "Panel") + ", show details");
    kEl.setAttribute("aria-label", "Spring stiffness");
    cEl.setAttribute("aria-label", "Spring damping");
    kEl.value = String(k);
    cEl.value = String(c);

    var x = 0, v = 0, target = 0;
    var raf = 0, last = 0, running = false, dead = false;
    var trace = [], TRACE_MAX = 220;

    function describe() {
      var critical = 2 * Math.sqrt(k);
      var ratio = c / critical;
      var word, detail;
      if (Math.abs(ratio - 1) < 0.04) {
        word = "critically damped";
        detail = "arrives in the shortest time without passing its target";
      } else if (ratio < 1) {
        /* peak overshoot of a second order step response */
        var os = Math.exp(-Math.PI * ratio / Math.sqrt(1 - ratio * ratio));
        word = "underdamped";
        detail = "overshoots by about " + Math.round(os * 100) + " percent, then rings back";
      } else {
        word = "overdamped";
        detail = "no overshoot, and slower to arrive than critical";
      }
      verdict.textContent = "Damping ratio " + ratio.toFixed(2) + ", " + word + ". It " + detail + ".";
    }

    function paintTrace() {
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var r = cv.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width * dpr));
      var h = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      ctx.clearRect(0, 0, w, h);
      if (!trace.length) return;

      var tint = getComputedStyle(el).getPropertyValue("--holospring-tint").trim().replace(/\s+/g, ",") || "178,216,248";
      var pad = 10 * dpr;
      function y(val) { return h - pad - val * (h - pad * 2); }

      /* the two end stops, so an overshoot is visibly past the line */
      ctx.strokeStyle = "rgba(" + tint + ",0.16)";
      ctx.lineWidth = 1 * dpr;
      [0, 1].forEach(function (g) {
        ctx.beginPath(); ctx.moveTo(0, y(g)); ctx.lineTo(w, y(g)); ctx.stroke();
      });

      ctx.strokeStyle = "rgba(" + tint + ",0.9)";
      ctx.lineWidth = 1.6 * dpr;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (var i = 0; i < trace.length; i++) {
        var px = (i / (TRACE_MAX - 1)) * w;
        var py = y(trace[i]);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    function apply() {
      sw.style.setProperty("--x", x.toFixed(4));
      knob.style.setProperty("--x", x.toFixed(4));
      card.style.setProperty("--x", Math.max(0, Math.min(1, x)).toFixed(4));
      /* fr interpolates where height auto cannot */
      drawer.style.gridTemplateRows = Math.max(0, x).toFixed(4) + "fr";
    }

    function frame(now) {
      if (dead) return;
      if (!last) last = now;
      /* clamped: a backgrounded tab hands back a huge first delta */
      var dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      /* substep so a stiff spring stays stable at a low frame rate */
      var steps = 3, h = dt / steps;
      for (var i = 0; i < steps; i++) {
        var a = -k * (x - target) - c * v;
        v += a * h;
        x += v * h;
      }

      trace.push(Math.max(-0.4, Math.min(1.4, x)));
      if (trace.length > TRACE_MAX) trace.shift();

      apply();
      paintTrace();

      /* settled means both near the target and no longer moving. Position
         alone would stop the spring at the top of an overshoot. */
      if (Math.abs(x - target) < 0.001 && Math.abs(v) < 0.001) {
        x = target; v = 0; apply(); paintTrace();
        running = false; raf = 0;
        stateEl.textContent = target > 0.5 ? "open" : "closed";
        return;
      }
      raf = global.requestAnimationFrame(frame);
    }

    function start() {
      if (dead) return;
      if (reduced && reduced.matches) {
        x = target; v = 0; apply();
        trace.length = 0; paintTrace();
        stateEl.textContent = target > 0.5 ? "open" : "closed";
        return;
      }
      if (running) return;
      running = true; last = 0;
      raf = global.requestAnimationFrame(frame);
      /* teardown backstop, per AGENTS.md section 4: a loop that only tears
         down inside itself never tears down if no frame ever arrives. */
      global.clearTimeout(backstop);
      backstop = global.setTimeout(function () {
        if (running && !raf) { running = false; }
      }, 8000);
    }
    var backstop = 0;

    sw.addEventListener("click", function () { handle.toggle(); });

    el.addEventListener("input", function (e) {
      var p = e.target.getAttribute && e.target.getAttribute("data-p");
      if (p === "k") k = parseFloat(kEl.value);
      else if (p === "c") c = parseFloat(cEl.value);
      else return;
      describe();
      /* nudge so a tuning change is felt immediately rather than at next open */
      if (!running && Math.abs(x - target) < 0.001) { v = 0.9; start(); }
    });

    el.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".holospring-preset");
      if (!b) return;
      var p = b.getAttribute("data-preset");
      if (p === "critical") { k = 170; c = Math.round(2 * Math.sqrt(170)); }
      else if (p === "bouncy") { k = 260; c = 12; }
      else { k = 90; c = 46; }
      kEl.value = String(k); cEl.value = String(c);
      el.querySelectorAll(".holospring-preset").forEach(function (n) {
        n.setAttribute("aria-pressed", String(n === b));
      });
      describe();
      handle.set(target > 0.5 ? 0 : 1);
    });

    var ro = null;
    if (global.ResizeObserver) { ro = new global.ResizeObserver(paintTrace); ro.observe(cv); }

    describe();
    apply();
    paintTrace();

    var handle = {
      set: function (t) {
        target = t ? 1 : 0;
        sw.setAttribute("aria-expanded", String(target === 1));
        stateEl.textContent = target > 0.5 ? "opening" : "closing";
        trace.length = 0;
        start();
        return handle;
      },
      toggle: function () { return handle.set(target < 0.5); },
      tune: function (stiffness, damping) {
        if (typeof stiffness === "number") { k = stiffness; kEl.value = String(k); }
        if (typeof damping === "number") { c = damping; cEl.value = String(c); }
        describe();
        return handle;
      },
      destroy: function () {
        dead = true;
        if (raf) global.cancelAnimationFrame(raf);
        global.clearTimeout(backstop);
        if (ro) ro.disconnect();
      },
    };
    return handle;
  }

  global.holoSpring = holoSpring;
})(window);
