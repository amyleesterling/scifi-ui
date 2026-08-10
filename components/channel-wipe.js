/* ---- co-registered channel wipe (holochannel) -----------------------------
   Pairs with channel-wipe.css.

     holoChannel(el, {
       left: "Geometry plus identity",
       right: "Geometry only",
       classes: [
         { id: "exc", name: "Excitatory", rgb: "232 169 58" },
         { id: "inh", name: "Inhibitory", rgb: "126 224 255" },
         { id: "glia", name: "Glia",      rgb: "168 140 240" },
       ],
     });

   One generated patch of tissue, drawn twice from the same coordinates. The
   structure channel is the geometry alone. The molecular channel is the same
   strokes coloured by class. The divider clips the second one, so nothing can
   drift: if a branch moved between channels you would see it tear at the line.

   The drag is pointer based with a range input as the accessible control, and
   both write the same value, so a keyboard reaches every position a finger can.

   Returns a handle with .setReveal(), .toggleClass() and .destroy().
--------------------------------------------------------------------------- */
(function (global) {
  "use strict";

  var DEFAULT_CLASSES = [
    { id: "exc",  name: "Excitatory", rgb: "232 169 58" },
    { id: "inh",  name: "Inhibitory", rgb: "126 224 255" },
    { id: "glia", name: "Glia",       rgb: "168 140 240" },
  ];

  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  function holoChannel(el, opts) {
    opts = opts || {};
    if (!el) return null;

    var classes = opts.classes || DEFAULT_CLASSES;
    var on = {};
    classes.forEach(function (c) { on[c.id] = true; });
    var reveal = 0.55;

    el.classList.add("holochannel");
    el.innerHTML =
      '<div class="holochannel-stage">' +
        '<canvas></canvas>' +
        '<span class="holochannel-tag is-left"></span>' +
        '<span class="holochannel-tag is-right"></span>' +
        '<div class="holochannel-divider"></div>' +
      '</div>' +
      '<div class="holochannel-controls">' +
        '<label class="holochannel-reveal">Reveal' +
          '<input type="range" min="0" max="1" step="0.005">' +
        '</label>' +
        '<div class="holochannel-classes" role="group" aria-label="Molecular classes"></div>' +
      '</div>';

    var stage = el.querySelector(".holochannel-stage");
    var cv = el.querySelector("canvas");
    var ctx = cv.getContext("2d");
    var divider = el.querySelector(".holochannel-divider");
    var range = el.querySelector('input[type="range"]');
    var chips = el.querySelector(".holochannel-classes");

    el.querySelector(".is-left").textContent = opts.left || "Geometry plus identity";
    el.querySelector(".is-right").textContent = opts.right || "Geometry only";
    range.setAttribute("aria-label", "Reveal the molecular channel");
    range.value = String(reveal);
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label",
      "A patch of generated neural tissue. The left of the divider carries molecular class colour, the right carries geometry alone.");

    classes.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "holochannel-chip";
      b.setAttribute("data-holo-tap", "");
      b.setAttribute("data-id", c.id);
      b.setAttribute("aria-pressed", "true");
      b.style.setProperty("--chip", c.rgb);
      b.innerHTML = '<i></i>' + c.name;
      chips.appendChild(b);
    });

    /* ---- one generated patch, shared by both channels ------------------- */
    var branches = [];
    (function build() {
      var rand = rng(20260806);
      for (var i = 0; i < 26; i++) {
        var cls = classes[Math.floor(rand() * classes.length)];
        var x = rand(), y = rand();
        var a = rand() * Math.PI * 2;
        var pts = [[x, y]];
        var len = 0.05 + rand() * 0.07;
        for (var j = 0; j < 7; j++) {
          a += (rand() - 0.5) * 0.9;
          x += Math.cos(a) * len;
          y += Math.sin(a) * len * 0.7;
          pts.push([x, y]);
        }
        branches.push({ pts: pts, cls: cls, w: 0.7 + rand() * 1.5 });
      }
    })();

    function stroke(dpr, W, H, b, style, width) {
      ctx.beginPath();
      for (var i = 0; i < b.pts.length; i++) {
        var p = b.pts[i];
        var x = p[0] * W, y = p[1] * H;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = style;
      ctx.lineWidth = width * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    function paint() {
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var r = cv.getBoundingClientRect();
      var W = Math.max(1, Math.round(r.width * dpr));
      var H = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      ctx.clearRect(0, 0, W, H);

      /* channel one: geometry, everywhere */
      branches.forEach(function (b) {
        stroke(dpr, W, H, b, "rgba(214,226,238,0.34)", b.w + 0.9);
        stroke(dpr, W, H, b, "rgba(10,16,22,0.9)", b.w * 0.5);
      });

      /* channel two: the same strokes, coloured, clipped to the reveal */
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W * reveal, H);
      ctx.clip();
      branches.forEach(function (b) {
        if (!on[b.cls.id]) return;
        var rgb = b.cls.rgb.replace(/\s+/g, ",");
        stroke(dpr, W, H, b, "rgba(" + rgb + ",0.95)", b.w + 0.9);
      });
      ctx.restore();

      divider.style.left = (reveal * 100) + "%";
    }

    /* ---- input ----------------------------------------------------------- */
    function fromClientX(clientX) {
      var r = stage.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
    }

    var dragging = false;
    stage.addEventListener("pointerdown", function (e) {
      dragging = true;
      stage.setPointerCapture(e.pointerId);
      handle.setReveal(fromClientX(e.clientX));
    });
    stage.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      handle.setReveal(fromClientX(e.clientX));
    });
    function endDrag() { dragging = false; }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("lostpointercapture", endDrag);

    range.addEventListener("input", function () { handle.setReveal(parseFloat(range.value)); });

    chips.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".holochannel-chip");
      if (!b) return;
      var id = b.getAttribute("data-id");
      on[id] = !on[id];
      b.setAttribute("aria-pressed", String(on[id]));
      paint();
    });

    var ro = null;
    if (global.ResizeObserver) { ro = new global.ResizeObserver(paint); ro.observe(cv); }
    paint();

    var handle = {
      setReveal: function (v) {
        reveal = Math.max(0, Math.min(1, v));
        range.value = String(reveal);
        paint();
        return handle;
      },
      toggleClass: function (id, state) {
        on[id] = typeof state === "boolean" ? state : !on[id];
        var b = chips.querySelector('[data-id="' + id + '"]');
        if (b) b.setAttribute("aria-pressed", String(on[id]));
        paint();
        return handle;
      },
      destroy: function () { if (ro) ro.disconnect(); },
    };
    return handle;
  }

  global.holoChannel = holoChannel;
})(window);
