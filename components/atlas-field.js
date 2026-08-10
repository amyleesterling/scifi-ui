/* ---- field over a changing form (holoatlas) -------------------------------
   Pairs with atlas-field.css.

     holoAtlas(el, {
       stages: ["CS9", "CS9.5", "CS10"],
       programs: [
         { id: "neural",  name: "Neural tube",  at: 0.34, width: 0.18 },
         { id: "cardiac", name: "Heart field",  at: 0.62, width: 0.12 },
         { id: "somite",  name: "Somites",      at: 0.5,  width: 0.42, periodic: true },
       ],
     });

   The form is a centreline plus a thickness profile. Everything is computed in
   the form's own coordinate, s, which runs 0 at the head end to 1 at the tail.
   The field is a function of s, so it is attached to tissue rather than to the
   canvas. Scrub the stage and the centreline curls: the band stays on the same
   part of the animal and travels with it, which is the point.

   Positions are schematic and no value here is measured.

   Returns a handle with .setStage(), .setProgram() and .destroy().
--------------------------------------------------------------------------- */
(function (global) {
  "use strict";

  var DEFAULT_PROGRAMS = [
    { id: "neural",  name: "Neural tube", at: 0.32, width: 0.2 },
    { id: "cardiac", name: "Heart field", at: 0.63, width: 0.12 },
    { id: "somite",  name: "Somites",     at: 0.5,  width: 0.44, periodic: true },
  ];

  function holoAtlas(el, opts) {
    opts = opts || {};
    if (!el) return null;

    var stages = opts.stages || ["CS9", "CS9.5", "CS10"];
    var programs = opts.programs || DEFAULT_PROGRAMS;
    var stage = 0;                 // 0 .. 1 across the stage list
    var program = programs[0];

    el.classList.add("holoatlas");
    el.innerHTML =
      '<div class="holoatlas-stage">' +
        '<canvas></canvas>' +
        '<p class="holoatlas-caption"></p>' +
      '</div>' +
      '<div class="holoatlas-controls">' +
        '<label class="holoatlas-scrub">Stage' +
          '<input type="range" min="0" max="1" step="0.01" value="0">' +
          '<span class="holoatlas-stage-name"></span>' +
        '</label>' +
        '<div class="holoatlas-programs" role="group" aria-label="Expression programme"></div>' +
      '</div>';

    var cv = el.querySelector("canvas");
    var ctx = cv.getContext("2d");
    var caption = el.querySelector(".holoatlas-caption");
    var range = el.querySelector('input[type="range"]');
    var stageName = el.querySelector(".holoatlas-stage-name");
    var group = el.querySelector(".holoatlas-programs");

    range.setAttribute("aria-label", "Developmental stage");
    cv.setAttribute("role", "img");

    programs.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "holoatlas-btn";
      b.setAttribute("data-holo-tap", "");
      b.setAttribute("data-id", p.id);
      b.setAttribute("aria-pressed", String(p === program));
      b.textContent = p.name;
      group.appendChild(b);
    });

    /* ---- the form -------------------------------------------------------
       A centreline that curls as the stage advances, plus a thickness that is
       fat at the head and tapers to the tail. Both are functions of s. */
    /* All form coordinates live in a 0 to 1 square that is centred in the
       canvas, so the body keeps its proportions whatever the box aspect is.
       Working directly in canvas fractions would stretch it. */
    function centreline(s, t) {
      /* t is the stage. The body curls further round as it advances. */
      var sweep = 2.5 + t * 1.7;
      var a = -2.35 + s * sweep;
      var r = 0.33 - s * 0.05;
      return {
        x: 0.5 + Math.cos(a) * r,
        y: 0.5 + Math.sin(a) * r,
        /* the outward normal of the arc. Offsetting along the tangent would
           only stretch the curve along itself and give it no width at all. */
        a: a,
      };
    }

    function thickness(s, t) {
      /* head end swells as the neural folds close, tail stays thin */
      var head = Math.exp(-Math.pow((s - 0.13) / 0.15, 2)) * (0.042 + t * 0.022);
      var body = 0.036 * (1 - s * 0.72);
      return head + body;
    }

    /* field value at body coordinate s, in 0 to 1 */
    function field(s, t) {
      var p = program;
      var v = Math.exp(-Math.pow((s - p.at) / (p.width * 0.5), 2));
      if (p.periodic) {
        /* somites appear progressively and only in the trunk */
        var count = 3 + Math.round(t * 8);
        var seg = (Math.sin(s * count * Math.PI * 2 - Math.PI / 2) + 1) / 2;
        v *= Math.pow(seg, 2.2) * (0.35 + t * 0.65);
      }
      return Math.max(0, Math.min(1, v));
    }

    function paint() {
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var r = cv.getBoundingClientRect();
      var W = Math.max(1, Math.round(r.width * dpr));
      var H = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      ctx.clearRect(0, 0, W, H);

      var t = stage;
      var tint = getComputedStyle(el).getPropertyValue("--holoatlas-tint").trim().replace(/\s+/g, ",") || "178,216,248";
      var warm = getComputedStyle(el).getPropertyValue("--holoatlas-warm").trim().replace(/\s+/g, ",") || "232,169,58";
      var N = 220;

      /* square space to canvas, fitted and centred */
      var S = Math.min(W, H) * 0.94;
      function px(p) { return { x: W / 2 + (p.x - 0.5) * S, y: H / 2 + (p.y - 0.5) * S }; }

      /* the body, as one filled outline built from both offset edges */
      ctx.beginPath();
      for (var i = 0; i <= N; i++) {
        var s = i / N, c = centreline(s, t), th = thickness(s, t);
        var o = px({ x: c.x + Math.cos(c.a) * th, y: c.y + Math.sin(c.a) * th });
        if (i === 0) ctx.moveTo(o.x, o.y); else ctx.lineTo(o.x, o.y);
      }
      for (var j = N; j >= 0; j--) {
        var s2 = j / N, c2 = centreline(s2, t), th2 = thickness(s2, t);
        var o2 = px({ x: c2.x - Math.cos(c2.a) * th2, y: c2.y - Math.sin(c2.a) * th2 });
        ctx.lineTo(o2.x, o2.y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(" + tint + ",0.11)";
      ctx.fill();
      ctx.strokeStyle = "rgba(" + tint + ",0.32)";
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();

      /* the field, drawn as a ribbon of segments along the same coordinate.
         Because it is indexed by s it rides the form rather than the canvas. */
      for (var k = 0; k < N; k++) {
        var sa = k / N, sb = (k + 1) / N;
        var v = field((sa + sb) / 2, t);
        if (v < 0.02) continue;
        var ca = centreline(sa, t), cb = centreline(sb, t);
        var ta = thickness(sa, t) * 0.92, tb = thickness(sb, t) * 0.92;
        var a1 = px({ x: ca.x + Math.cos(ca.a) * ta, y: ca.y + Math.sin(ca.a) * ta });
        var a2 = px({ x: cb.x + Math.cos(cb.a) * tb, y: cb.y + Math.sin(cb.a) * tb });
        var b1 = px({ x: cb.x - Math.cos(cb.a) * tb, y: cb.y - Math.sin(cb.a) * tb });
        var b2 = px({ x: ca.x - Math.cos(ca.a) * ta, y: ca.y - Math.sin(ca.a) * ta });
        ctx.beginPath();
        ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y);
        ctx.lineTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y);
        ctx.closePath();
        var mix = program.periodic ? warm : tint;
        ctx.fillStyle = "rgba(" + mix + "," + (v * 0.85).toFixed(3) + ")";
        ctx.fill();
      }

      /* the head end marker, so the body coordinate has a visible origin */
      var h = px(centreline(0, t));
      ctx.beginPath();
      ctx.arc(h.x, h.y, 2.6 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + tint + ",0.9)";
      ctx.fill();

      var label = stages[Math.min(stages.length - 1, Math.round(t * (stages.length - 1)))];
      stageName.textContent = label;
      caption.innerHTML = "<b>" + program.name + "</b> at " + label +
        ", painted in body coordinates so it travels with the form";
      cv.setAttribute("aria-label",
        program.name + " expression shown on a schematic embryo at stage " + label);
    }

    range.addEventListener("input", function () {
      stage = parseFloat(range.value);
      paint();
    });

    group.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".holoatlas-btn");
      if (!b) return;
      var id = b.getAttribute("data-id");
      programs.forEach(function (p) { if (p.id === id) program = p; });
      group.querySelectorAll(".holoatlas-btn").forEach(function (n) {
        n.setAttribute("aria-pressed", String(n === b));
      });
      paint();
    });

    var ro = null;
    if (global.ResizeObserver) { ro = new global.ResizeObserver(paint); ro.observe(cv); }
    paint();

    var handle = {
      setStage: function (v) { stage = Math.max(0, Math.min(1, v)); range.value = String(stage); paint(); return handle; },
      setProgram: function (id) {
        programs.forEach(function (p) { if (p.id === id) program = p; });
        group.querySelectorAll(".holoatlas-btn").forEach(function (n) {
          n.setAttribute("aria-pressed", String(n.getAttribute("data-id") === id));
        });
        paint();
        return handle;
      },
      destroy: function () { if (ro) ro.disconnect(); },
    };
    return handle;
  }

  global.holoAtlas = holoAtlas;
})(window);
