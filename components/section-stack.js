/* ---- serial sections into a volume (holostack) ----------------------------
   Pairs with section-stack.css.

     holoStack(el, { sections: 9 });

   Each section draws a domain whose centre moves smoothly with the section
   index, so the slices really are samples of one continuous object rather than
   nine unrelated pictures. That is what makes the registration toggle mean
   something: switching alignment off adds a per section offset, and the
   through line disappears even though every individual slice is unchanged.

   The stack is CSS 3D rather than canvas, because each section stays a real
   element: it can be labelled, focused and read, which a single painted
   volume could not offer.

   Returns a handle with .setAssembly(), .setAligned() and .destroy().
--------------------------------------------------------------------------- */
(function (global) {
  "use strict";

  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  function holoStack(el, opts) {
    opts = opts || {};
    if (!el) return null;

    var N = opts.sections || 9;
    var assembly = 1;      // 1 fanned apart, 0 closed up
    var aligned = true;

    el.classList.add("holostack");
    el.innerHTML =
      '<div class="holostack-stage">' +
        '<div class="holostack-scene"></div>' +
        '<p class="holostack-readout"></p>' +
      '</div>' +
      '<div class="holostack-controls">' +
        '<label style="flex:1 1 130px;display:flex;align-items:center;gap:.5rem">Assemble' +
          '<input type="range" min="0" max="1" step="0.01" value="1">' +
        '</label>' +
        '<button type="button" class="holostack-btn" data-holo-tap aria-pressed="true">Registered</button>' +
      '</div>';

    var scene = el.querySelector(".holostack-scene");
    var readout = el.querySelector(".holostack-readout");
    var range = el.querySelector('input[type="range"]');
    var btn = el.querySelector(".holostack-btn");

    range.setAttribute("aria-label", "Fan the sections apart or close them into a volume");

    var rand = rng(20260806);
    var sections = [];
    for (var i = 0; i < N; i++) {
      var d = document.createElement("div");
      d.className = "holostack-section";
      d.setAttribute("aria-label", "Section " + (i + 1) + " of " + N);
      var cv = document.createElement("canvas");
      d.appendChild(cv);
      scene.appendChild(d);
      sections.push({
        el: d, cv: cv, ctx: cv.getContext("2d"), i: i,
        /* the offset applied when registration is switched off */
        ox: (rand() - 0.5) * 34, oy: (rand() - 0.5) * 34,
      });
    }

    /* the domain centre as a function of depth: one continuous path */
    function centre(u) {
      return {
        x: 0.5 + Math.sin(u * Math.PI * 1.1) * 0.17,
        y: 0.44 + u * 0.2,
        r: 0.3 - Math.abs(u - 0.45) * 0.22,
      };
    }

    function paintSection(s) {
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var r = s.cv.getBoundingClientRect();
      var W = Math.max(1, Math.round(r.width * dpr));
      var H = Math.max(1, Math.round(r.height * dpr));
      if (s.cv.width !== W || s.cv.height !== H) { s.cv.width = W; s.cv.height = H; }
      var ctx = s.ctx;
      ctx.clearRect(0, 0, W, H);

      var tint = getComputedStyle(el).getPropertyValue("--holostack-tint").trim().replace(/\s+/g, ",") || "178,216,248";
      var u = N === 1 ? 0 : s.i / (N - 1);
      var c = centre(u);

      var g = ctx.createRadialGradient(c.x * W, c.y * H, 0, c.x * W, c.y * H, Math.max(1, c.r * W));
      g.addColorStop(0, "rgba(" + tint + ",0.72)");
      g.addColorStop(0.55, "rgba(" + tint + ",0.22)");
      g.addColorStop(1, "rgba(" + tint + ",0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      /* a faint tissue speckle so a slice reads as a section, not a swatch */
      var rr = rng(1000 + s.i * 7);
      ctx.fillStyle = "rgba(" + tint + ",0.2)";
      for (var k = 0; k < 90; k++) {
        ctx.fillRect(rr() * W, rr() * H, 1.2 * dpr, 1.2 * dpr);
      }
    }

    function apply() {
      var gap = 8 + assembly * 30;          // closed up to fanned apart
      var mid = (N - 1) / 2;
      sections.forEach(function (s) {
        var z = (s.i - mid) * gap;
        s.el.style.setProperty("--z", z.toFixed(2));
        s.el.style.setProperty("--dx", (aligned ? 0 : s.ox * assembly).toFixed(2));
        s.el.style.setProperty("--dy", (aligned ? 0 : s.oy * assembly).toFixed(2));
        /* the near faces stay brighter so depth order is readable */
        s.el.style.opacity = (0.5 + 0.5 * (s.i / Math.max(1, N - 1))).toFixed(2);
      });
      readout.innerHTML = aligned
        ? "<b>Registered.</b> The domain runs continuously through the depth, which no single section contains."
        : "<b>Unregistered.</b> Every section is unchanged, and the through line is gone.";
      btn.textContent = aligned ? "Registered" : "Unregistered";
      btn.setAttribute("aria-pressed", String(aligned));
    }

    function paintAll() { sections.forEach(paintSection); }

    range.addEventListener("input", function () {
      assembly = parseFloat(range.value);
      apply();
    });
    btn.addEventListener("click", function () {
      aligned = !aligned;
      apply();
    });

    var ro = null;
    if (global.ResizeObserver) {
      ro = new global.ResizeObserver(paintAll);
      ro.observe(el);
    }
    apply();
    paintAll();

    var handle = {
      setAssembly: function (v) { assembly = Math.max(0, Math.min(1, v)); range.value = String(assembly); apply(); return handle; },
      setAligned: function (v) { aligned = !!v; apply(); return handle; },
      destroy: function () { if (ro) ro.disconnect(); },
    };
    return handle;
  }

  global.holoStack = holoStack;
})(window);
