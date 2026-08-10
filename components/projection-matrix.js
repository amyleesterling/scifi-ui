/* ---- trajectories against their matrix (holoproject) ----------------------
   Pairs with projection-matrix.css.

     holoProject(el, { regions: 7, cells: 120 });

   Every connection is sampled as a run of points along a routed path. Each
   point carries two positions: where it sits on the trajectory, and where it
   sits in the adjacency cell for the same source and target. The morph is a
   straight interpolation between those two, per point.

   Doing it per point rather than by cross fading two pictures is what makes
   the argument land. A point never appears or disappears, so the eye follows
   individual projections into the grid and sees them pile into the same cell,
   which is precisely the information the matrix does not keep.

   The morph is eased and one shot, so nothing is left looping.

   Returns a handle with .setMorph(), .toggle() and .destroy().
--------------------------------------------------------------------------- */
(function (global) {
  "use strict";

  var reduced = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)");

  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  function holoProject(el, opts) {
    opts = opts || {};
    if (!el) return null;

    var R = opts.regions || 7;
    var CONN = opts.cells || 120;
    var SAMPLES = 12;
    var morph = 0;               // 0 geometry, 1 matrix

    el.classList.add("holoproject");
    el.innerHTML =
      '<div class="holoproject-stage">' +
        '<canvas></canvas>' +
        '<span class="holoproject-legend"></span>' +
        '<p class="holoproject-lost"></p>' +
      '</div>' +
      '<div class="holoproject-controls">' +
        '<button type="button" class="holoproject-btn" data-holo-tap></button>' +
        '<label style="flex:1 1 140px;display:flex;align-items:center;gap:.5rem">Morph' +
          '<input type="range" min="0" max="1" step="0.01" value="0">' +
        '</label>' +
      '</div>';

    var cv = el.querySelector("canvas");
    var ctx = cv.getContext("2d");
    var legend = el.querySelector(".holoproject-legend");
    var lost = el.querySelector(".holoproject-lost");
    var btn = el.querySelector(".holoproject-btn");
    var range = el.querySelector('input[type="range"]');

    range.setAttribute("aria-label", "Morph between trajectories and adjacency matrix");
    cv.setAttribute("role", "img");
    lost.textContent = "The matrix keeps which region reaches which. The route, the bundles and the order along the way are gone.";

    /* ---- regions on a ring, connections routed between them -------------- */
    var rand = rng(20260806);
    var regions = [];
    for (var i = 0; i < R; i++) {
      var a = (i / R) * Math.PI * 2 - Math.PI / 2;
      regions.push({ x: 0.5 + Math.cos(a) * 0.33, y: 0.47 + Math.sin(a) * 0.33 });
    }

    var pts = [];
    for (var c = 0; c < CONN; c++) {
      var s = Math.floor(rand() * R), t = Math.floor(rand() * R);
      if (s === t) t = (t + 1) % R;
      var A = regions[s], B = regions[t];
      /* a control point pulled toward the centre gives the bundling that a
         straight chord would not show */
      var cx = 0.5 + (A.x + B.x - 1) * 0.18 + (rand() - 0.5) * 0.08;
      var cy = 0.47 + (A.y + B.y - 0.94) * 0.18 + (rand() - 0.5) * 0.08;
      for (var k = 0; k < SAMPLES; k++) {
        var u = k / (SAMPLES - 1);
        var iu = 1 - u;
        pts.push({
          gx: iu * iu * A.x + 2 * iu * u * cx + u * u * B.x,
          gy: iu * iu * A.y + 2 * iu * u * cy + u * u * B.y,
          s: s, t: t, u: u,
          jx: (rand() - 0.5) * 0.5,
          jy: (rand() - 0.5) * 0.5,
        });
      }
    }

    function matrixPos(p, W, H) {
      /* the grid sits in the middle of the stage, square regardless of box */
      var side = Math.min(W, H) * 0.62;
      var ox = (W - side) / 2, oy = (H - side) / 2;
      var cell = side / R;
      return {
        x: ox + (p.t + 0.5) * cell + p.jx * cell * 0.5,
        y: oy + (p.s + 0.5) * cell + p.jy * cell * 0.5,
        cell: cell, ox: ox, oy: oy, side: side,
      };
    }

    function paint() {
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var r = cv.getBoundingClientRect();
      var W = Math.max(1, Math.round(r.width * dpr));
      var H = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      ctx.clearRect(0, 0, W, H);

      var tint = getComputedStyle(el).getPropertyValue("--holoproject-tint").trim().replace(/\s+/g, ",") || "178,216,248";
      var m = morph;
      var g = matrixPos(pts[0], W, H);

      /* grid, fading in as the matrix takes over */
      if (m > 0.02) {
        ctx.strokeStyle = "rgba(" + tint + "," + (m * 0.16).toFixed(3) + ")";
        ctx.lineWidth = 1 * dpr;
        for (var i = 0; i <= R; i++) {
          var o = g.ox + i * g.cell, o2 = g.oy + i * g.cell;
          ctx.beginPath(); ctx.moveTo(o, g.oy); ctx.lineTo(o, g.oy + g.side); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(g.ox, o2); ctx.lineTo(g.ox + g.side, o2); ctx.stroke();
        }
      }

      /* region markers, fading out as geometry gives way */
      if (m < 0.98) {
        ctx.fillStyle = "rgba(" + tint + "," + ((1 - m) * 0.5).toFixed(3) + ")";
        regions.forEach(function (rg) {
          ctx.beginPath();
          ctx.arc(rg.x * W, rg.y * H, 4 * dpr, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      /* every point, interpolated between its two homes */
      for (var p = 0; p < pts.length; p++) {
        var q = pts[p];
        var mp = matrixPos(q, W, H);
        var x = (q.gx * W) * (1 - m) + mp.x * m;
        var y = (q.gy * H) * (1 - m) + mp.y * m;
        /* along a trajectory the far end is dimmer, in the matrix all points
           in a cell are equal, which is itself the flattening being shown */
        var a = (1 - m) * (0.25 + q.u * 0.5) + m * 0.4;
        ctx.fillStyle = "rgba(" + tint + "," + a.toFixed(3) + ")";
        ctx.fillRect(x, y, 1.6 * dpr, 1.6 * dpr);
      }

      legend.textContent = m < 0.5 ? "Routed trajectories" : "Adjacency matrix";
      el.classList.toggle("is-matrix", m > 0.85);
      btn.textContent = m > 0.5 ? "Back to trajectories" : "Collapse to matrix";
      cv.setAttribute("aria-label", m > 0.5
        ? "The same connectivity drawn as an adjacency matrix of source against target"
        : "Connectivity drawn as routed trajectories between regions on a ring");
    }

    /* ---- one shot eased morph ------------------------------------------- */
    var raf = 0, from = 0, to = 0, t0 = 0, backstop = 0;
    function animate(now) {
      var d = Math.min(1, (now - t0) / 900);
      var e = d < 0.5 ? 4 * d * d * d : 1 - Math.pow(-2 * d + 2, 3) / 2;
      morph = from + (to - from) * e;
      range.value = String(morph.toFixed(2));
      paint();
      if (d < 1) { raf = global.requestAnimationFrame(animate); }
      else { raf = 0; global.clearTimeout(backstop); }
    }
    function runTo(v) {
      if (reduced && reduced.matches) { handle.setMorph(v); return; }
      from = morph; to = v; t0 = performance.now();
      if (raf) global.cancelAnimationFrame(raf);
      raf = global.requestAnimationFrame(animate);
      /* teardown backstop, per AGENTS.md section 4 */
      global.clearTimeout(backstop);
      backstop = global.setTimeout(function () {
        if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
        morph = to; range.value = String(morph); paint();
      }, 3000);
    }

    btn.addEventListener("click", function () { runTo(morph > 0.5 ? 0 : 1); });
    range.addEventListener("input", function () {
      if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
      handle.setMorph(parseFloat(range.value));
    });

    var ro = null;
    if (global.ResizeObserver) { ro = new global.ResizeObserver(paint); ro.observe(cv); }
    paint();

    var handle = {
      setMorph: function (v) { morph = Math.max(0, Math.min(1, v)); range.value = String(morph); paint(); return handle; },
      toggle: function () { runTo(morph > 0.5 ? 0 : 1); return handle; },
      destroy: function () {
        if (raf) global.cancelAnimationFrame(raf);
        global.clearTimeout(backstop);
        if (ro) ro.disconnect();
      },
    };
    return handle;
  }

  global.holoProject = holoProject;
})(window);
