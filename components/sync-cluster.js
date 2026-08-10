/* ---- coupled oscillator cluster (holosync) --------------------------------
   Pairs with sync-cluster.css.

     holoSync(el, {
       title: "Subsystem coherence",
       nodes: ["optics", "stage", "detector", "cooling", "shutter", "clock"],
       coupling: 0,        // K. 0 is free running, about 1.2 locks this spread
       spread: 0.55,       // how different the natural frequencies are
     });

   The model is Kuramoto, 1975. Each oscillator carries a phase and its own
   natural frequency, and every step it is pulled towards everybody else:

     dth_i/dt = w_i + (K/N) * sum_j sin(th_j - th_i)

   Below a critical coupling the pull loses to the spread in w and the cluster
   stays scattered. Above it the population locks, and it locks by itself. No
   frame counts this out and no element is told when to light.

   The coherence readout is the order parameter of that same model:

     r = | (1/N) * sum_j e^(i*th_j) |

   which is 0 when the phases are spread evenly and 1 when they agree. It is
   measured from the live phases, so it cannot drift out of step with what the
   lights are doing.

   Returns a handle with .setCoupling(), .wake(), .sleep() and .destroy().
--------------------------------------------------------------------------- */
(function (global) {
  "use strict";

  var reduced = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)");
  var TAU = Math.PI * 2;

  function holoSync(el, opts) {
    opts = opts || {};
    if (!el) return null;

    var names = opts.nodes || ["one", "two", "three", "four", "five", "six"];
    var N = names.length;
    var K = typeof opts.coupling === "number" ? opts.coupling : 0;
    var spread = typeof opts.spread === "number" ? opts.spread : 0.55;
    var base = opts.rate || 0.9;

    el.classList.add("holosync");
    el.innerHTML =
      '<div class="holosync-head">' +
        '<span class="holosync-title"></span>' +
        '<span class="holosync-state">free running</span>' +
      '</div>' +
      '<ul class="holosync-nodes"></ul>' +
      '<div class="holosync-order">' +
        '<div class="holosync-order-head">' +
          '<span>Coherence</span><span class="holosync-order-value">0.00</span>' +
        '</div>' +
        '<div class="holosync-meter"><i></i></div>' +
      '</div>' +
      '<div class="holosync-controls">' +
        '<label>Coupling <input type="range" min="0" max="2" step="0.05"></label>' +
        '<button type="button" class="holosync-btn" data-act="lock">Connect</button>' +
        '<button type="button" class="holosync-btn" data-act="free">Scatter</button>' +
      '</div>';

    el.querySelector(".holosync-title").textContent = opts.title || "Coherence";

    var list = el.querySelector(".holosync-nodes");
    var stateEl = el.querySelector(".holosync-state");
    var valueEl = el.querySelector(".holosync-order-value");
    var meter = el.querySelector(".holosync-meter");
    var range = el.querySelector('input[type="range"]');

    meter.setAttribute("role", "meter");
    meter.setAttribute("aria-label", "Phase coherence of the cluster");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "1");
    range.setAttribute("aria-label", "Coupling strength");
    range.value = String(K);

    /* Natural frequencies are spread deterministically about the base rate, so
       the cluster looks the same on every load and a reader can reason about
       it. A random spread would make the demo a different demo each refresh. */
    var th = new Float64Array(N), w = new Float64Array(N), dots = [];
    for (var i = 0; i < N; i++) {
      var u = N === 1 ? 0 : (i / (N - 1)) * 2 - 1;      // -1 .. 1
      w[i] = base + u * spread;
      th[i] = (i * 2.399963) % TAU;                      // golden angle, evenly scattered

      var li = document.createElement("li");
      li.className = "holosync-node";
      li.setAttribute("data-holo-tap", "");
      li.setAttribute("tabindex", "0");
      li.innerHTML =
        '<span class="holosync-dot"></span>' +
        '<span class="holosync-name"></span>' +
        '<span class="holosync-freq"></span>';
      li.querySelector(".holosync-name").textContent = names[i];
      li.querySelector(".holosync-freq").textContent = w[i].toFixed(2) + " Hz";
      li.setAttribute("aria-label", names[i] + ", natural frequency " + w[i].toFixed(2) + " hertz");
      list.appendChild(li);
      dots.push(li.querySelector(".holosync-dot"));
    }

    var raf = 0, last = 0, running = false, dead = false, visible = false, awake = true;
    /* starts far in the past so the first paint reports once, then throttles */
    var lastReport = -1e9;

    function order() {
      var sx = 0, sy = 0;
      for (var i = 0; i < N; i++) { sx += Math.cos(th[i]); sy += Math.sin(th[i]); }
      return Math.sqrt(sx * sx + sy * sy) / N;
    }

    function paint(now) {
      for (var i = 0; i < N; i++) {
        var lit = (1 + Math.sin(th[i])) / 2;
        dots[i].style.setProperty("--lit", lit.toFixed(3));
      }
      /* The readout is throttled because a number repainting every frame is
         unreadable, and a live region that chatty is worse than none. */
      if (now - lastReport > 120) {
        lastReport = now;
        var r = order();
        meter.style.setProperty("--r", r.toFixed(3));
        meter.setAttribute("aria-valuenow", r.toFixed(2));
        valueEl.textContent = r.toFixed(2);
        var locked = r > 0.9;
        el.classList.toggle("is-locked", locked);
        stateEl.textContent = locked ? "locked" : (r > 0.55 ? "pulling in" : "free running");
      }
    }

    function step(dt) {
      var next = new Float64Array(N);
      for (var i = 0; i < N; i++) {
        var pull = 0;
        for (var j = 0; j < N; j++) pull += Math.sin(th[j] - th[i]);
        next[i] = th[i] + dt * (w[i] + (K / N) * pull);
      }
      for (var k = 0; k < N; k++) th[k] = next[k] % TAU;
    }

    function frame(now) {
      if (dead) return;
      if (!last) last = now;
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      step(dt * TAU);
      paint(now);
      raf = global.requestAnimationFrame(frame);
    }

    function start() {
      if (running || dead || !visible || !awake) return;
      if (reduced && reduced.matches) { settle(); return; }
      running = true; last = 0;
      raf = global.requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) global.cancelAnimationFrame(raf);
      raf = 0;
    }

    /* With motion suppressed the cluster still has to say something true. It
       is shown at the state its current coupling would reach: locked together
       when K is high, evenly scattered when it is not. */
    function settle() {
      for (var i = 0; i < N; i++) th[i] = K > 0.8 ? 1.2 : (i * 2.399963) % TAU;
      /* reset the throttle first, or a second settle inside the same window
         would move the lights and leave the readout saying the old thing */
      lastReport = -1e9;
      paint(0);
    }

    if (global.IntersectionObserver) {
      var io = new global.IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) start(); else stop();
      });
      io.observe(el);
    } else { visible = true; start(); }

    el.addEventListener("input", function (e) {
      if (e.target === range) handle.setCoupling(parseFloat(range.value));
    });
    el.addEventListener("click", function (e) {
      var btn = e.target.closest(".holosync-btn");
      if (!btn) return;
      handle.setCoupling(btn.getAttribute("data-act") === "lock" ? 1.6 : 0);
    });

    paint(0);

    var handle = {
      setCoupling: function (k) {
        K = Math.max(0, k);
        range.value = String(K);
        if (reduced && reduced.matches) settle();
        return handle;
      },
      wake: function () { awake = true; start(); return handle; },
      sleep: function () { awake = false; stop(); return handle; },
      /* the live phases, for anything that wants to drive off the same clock */
      phases: function () { return Array.prototype.slice.call(th); },
      coherence: order,
      destroy: function () {
        dead = true; stop();
        if (io) io.disconnect();
      },
    };
    return handle;
  }

  global.holoSync = holoSync;
})(window);
