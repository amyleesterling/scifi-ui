/* ---- growing cell (holoGrowingCell) ---------------------------------------
   Ported from ng-extend (branch eyewire-ii-community),
   src/components/GrowingCell.vue: the wait in EyeWire II's screenshot dialog,
   the longest wait in that app. Every number below is the shipped one.

     var wait = holoGrowingCell(canvas, { label: nameElement });
     wait.stop();

     // one kind only, grown once and held; regrow() grows it again
     var one = holoGrowingCell(canvas, { kinds: ["Stellate"], once: true });
     one.regrow();

   What it draws. One cell at a time on a square canvas, grown from its cell
   body outward, named, held, faded, and then the next kind:

     2400ms   grow, eased in and out (smoothstep), with a white tip where
              the newest segment is
     1300ms   hold
      500ms   fade
              then the next kind

   A short wait shows one cell. A long one becomes a small tour of the seven
   kinds from EyeWire II's dataset tours: stellate, pyramidal, astrocyte,
   microglia, starburst amacrine, bipolar and Muller glia. The order is
   shuffled each time, so a second wait does not begin where the first did,
   and every cell is built from a fresh random seed, so no two growths match.

   Each kind is one small set of branching rules: how many processes leave
   the body and at what angles, how long they run, how much they wander, how
   often and how widely they fork, how fast they shorten, and whether they
   throw side twigs. The bipolar and the Muller cell add a pull toward
   vertical. The cell is scaled so its widest reach is 88 percent of the
   canvas.

   The body is an uneven blob (three summed sine wobbles) that swells toward
   each process leaving it, lit from the upper left, with a darker nucleus a
   little off centre. A process is thickest where it leaves the body and
   tapers.

   `label`, if given, is an element whose text is set to the name of the
   cell being grown. It is a caption, not status: keep the wait's own words
   ("Uploading") beside it, and keep the canvas and the caption out of the
   accessibility tree.

   It does not show progress. Nothing here comes from the work it stands in
   for. For a wait whose steps are known, use the growing neuron, which
   shows them.

   Reduced motion. One finished cell is drawn and nothing moves or changes.

   Deviations from the source, and why. The source is a Vue component that
   renders its own name caption; here the caption is an element the caller
   passes in, because a library should not decide the caller's markup.
   stop() is new. So are two options the source does not have, added so a
   page can show the kinds side by side without seven loops running: `kinds`
   (an array of names, to cycle through only those) and `once` (grow one
   cell, hold it, and stop; regrow() grows another). The drawing is
   unchanged.

   Lineage. The seven sets of rules, the body and the colours are those of
   "Cells I Met Today" (artforagents.com, work 009). */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var GROW = 2400, HOLD = 1300, FADE = 500;

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* One branch as a wandering line in a unit space (-1..1). Segments are
     [x1, y1, x2, y2, width, birth], birth being the path length from the
     body, so growth runs outward. */
  function branch(out, r, x, y, ang, len, w, depth, t, o) {
    var steps = Math.max(3, Math.round(len / o.step));
    for (var i = 0; i < steps; i++) {
      ang += (r() - 0.5) * o.wiggle + (o.pull ? o.pull(x, y, ang) : 0);
      var nx = x + Math.cos(ang) * o.step, ny = y + Math.sin(ang) * o.step;
      out.push([x, y, nx, ny, w, t]);
      x = nx; y = ny; t += o.step;
      if (o.twig && r() < o.twig) {
        var side = {}; for (var key in o) side[key] = o[key]; side.twig = 0;
        branch(out, r, x, y, ang + (r() < 0.5 ? 1 : -1) * (0.7 + r() * 0.7), (o.twigLen || 0.1) * (0.5 + r()), w * 0.55, 0, t, side);
      }
    }
    if (depth <= 0) return;
    var n = o.fork ? o.fork(r, depth) : 2;
    for (var k = 0; k < n; k++) {
      var spread = o.spread * (n === 1 ? 0 : (k / (n - 1) - 0.5) * 2);
      branch(out, r, x, y, ang + spread + (r() - 0.5) * o.jitter, len * o.decay * (0.8 + r() * 0.4), w * 0.72, depth - 1, t, o);
    }
  }

  var KINDS = [
    { name: "Stellate", color: "#67f5cb", grow: function (r) {
        var s = [], n = 6;
        for (var i = 0; i < n; i++) branch(s, r, 0, 0, i / n * TAU + (r() - 0.5) * 0.6, 0.30, 3.2, 3, 0, { step: 0.03, wiggle: 0.35, spread: 0.55, jitter: 0.5, decay: 0.78, twig: 0.05, twigLen: 0.08 });
        return { segs: s, soma: [0, 0, 0.055] }; } },
    { name: "Pyramidal", color: "#3e96f0", grow: function (r) {
        var s = [];
        branch(s, r, 0, 0.18, -Math.PI / 2, 0.62, 3.4, 2, 0, { step: 0.03, wiggle: 0.12, spread: 0.7, jitter: 0.3, decay: 0.38, twig: 0.16, twigLen: 0.16, fork: function () { return 3; } });
        for (var i = 0; i < 5; i++) branch(s, r, 0, 0.2, Math.PI / 2 + (i / 4 - 0.5) * 2.3 + (r() - 0.5) * 0.2, 0.2, 2.2, 2, 0, { step: 0.03, wiggle: 0.3, spread: 0.5, jitter: 0.4, decay: 0.75 });
        return { segs: s, soma: [0, 0.2, 0.06] }; } },
    { name: "Astrocyte", color: "#b06fe0", grow: function (r) {
        var s = [], n = 8;
        for (var i = 0; i < n; i++) branch(s, r, 0, 0, i / n * TAU + (r() - 0.5) * 0.5, 0.17, 2.2, 4, 0, { step: 0.022, wiggle: 0.9, spread: 0.8, jitter: 0.9, decay: 0.82, twig: 0.3, twigLen: 0.06, fork: function (q) { return 2 + (q() < 0.4 ? 1 : 0); } });
        return { segs: s, soma: [0, 0, 0.07] }; } },
    { name: "Microglia", color: "#e8823c", grow: function (r) {
        var s = [], n = 5;
        for (var i = 0; i < n; i++) branch(s, r, 0, 0, i / n * TAU + (r() - 0.5) * 0.7, 0.26, 1.8, 3, 0, { step: 0.028, wiggle: 0.55, spread: 0.6, jitter: 0.6, decay: 0.7, twig: 0.12, twigLen: 0.07 });
        return { segs: s, soma: [0, 0, 0.05] }; } },
    { name: "Starburst amacrine", color: "#ff5fb0", grow: function (r) {
        var s = [], n = 5;
        for (var i = 0; i < n; i++) branch(s, r, 0, 0, i / n * TAU + 0.3, 0.2, 1.6, 4, 0, { step: 0.025, wiggle: 0.14, spread: 0.36, jitter: 0.12, decay: 0.86 });
        return { segs: s, soma: [0, 0, 0.04] }; } },
    { name: "Bipolar", color: "#f5b84a", grow: function (r) {
        var s = [];
        for (var i = 0; i < 3; i++) branch(s, r, 0, -0.62, -Math.PI / 2 + (i - 1) * 0.7, 0.12, 1.6, 1, 0, { step: 0.03, wiggle: 0.4, spread: 0.5, jitter: 0.3, decay: 0.7 });
        branch(s, r, 0, -0.5, Math.PI / 2, 0.95, 2.6, 2, 0, { step: 0.03, wiggle: 0.16, spread: 1.0, jitter: 0.5, decay: 0.16, fork: function () { return 4; }, pull: function (x, y, a) { return (Math.PI / 2 - a) * 0.12; } });
        return { segs: s, soma: [0, -0.56, 0.075, 1.3] }; } },
    { name: "Müller glia", color: "#67f5cb", grow: function (r) {
        var s = [];
        branch(s, r, 0, -0.8, Math.PI / 2, 1.6, 6, 0, 0, { step: 0.03, wiggle: 0.1, spread: 0, jitter: 0, decay: 1, twig: 0.9, twigLen: 0.16, pull: function (x, y, a) { return (Math.PI / 2 - a) * 0.3 - x * 0.2; } });
        for (var i = 0; i < 4; i++) branch(s, r, 0, 0.78, Math.PI / 2 + (i / 3 - 0.5) * 1.6, 0.1, 2.4, 0, 1.55, { step: 0.03, wiggle: 0.3, spread: 0, jitter: 0, decay: 1 });
        return { segs: s, soma: [0, -0.25, 0.055, 1.9] }; } }
  ];

  function build(kind, seed) {
    var g = kind.grow(rng(seed)), m = 0.001, tmax = 0.001, i, s;
    for (i = 0; i < g.segs.length; i++) {
      s = g.segs[i];
      m = Math.max(m, Math.abs(s[0]), Math.abs(s[1]), Math.abs(s[2]), Math.abs(s[3]));
      tmax = Math.max(tmax, s[5]);
    }
    var sx = g.soma[0], sy = g.soma[1], sr = g.soma[2], tall = g.soma[3] || 1;
    var r = rng(seed * 7 + 3), roots = [];
    for (i = 0; i < g.segs.length; i++) {
      s = g.segs[i];
      if (s[5] === 0 && Math.hypot(s[0] - sx, s[1] - sy) <= sr * 1.3) roots.push(Math.atan2(s[3] - sy, s[2] - sx));
    }
    var ph = [r() * TAU, r() * TAU, r() * TAU], body = [];
    for (i = 0; i < 72; i++) {
      var a = i / 72 * TAU;
      var rad = 1 + 0.07 * Math.sin(2 * a + ph[0]) + 0.05 * Math.sin(3 * a + ph[1]) + 0.03 * Math.sin(5 * a + ph[2]);
      for (var q = 0; q < roots.length; q++) {
        var d = Math.abs(a - roots[q]) % TAU; if (d > Math.PI) d = TAU - d;
        rad += 0.42 * Math.exp(-(d * d) / 0.09);
      }
      body.push([sx + Math.cos(a) * sr * rad, sy + Math.sin(a) * sr * rad * tall]);
    }
    return { segs: g.segs, soma: g.soma, unit: 0.44 / m, tmax: tmax, body: body, color: kind.color };
  }

  function holoGrowingCell(canvas, opts) {
    opts = opts || {};
    var label = opts.label || null;
    var still = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    var once = !!opts.once;
    var order = KINDS.map(function (_, i) { return i; });
    if (opts.kinds && opts.kinds.length) {
      order = order.filter(function (i) { return opts.kinds.indexOf(KINDS[i].name) !== -1; });
      if (!order.length) order = KINDS.map(function (_, i) { return i; });
    }
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    var at = 0, shape = null, t0 = 0, raf = 0, alive = false;

    function next(now) {
      var kind = KINDS[order[at % order.length]]; at += 1;
      shape = build(kind, Math.floor(Math.random() * 1e9));
      if (label) label.textContent = kind.name;
      t0 = now;
    }

    function draw(progress, alpha) {
      var size = canvas.clientWidth, sh = shape;
      if (!size || !sh) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(size * dpr)) { canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr); }
      var ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      var k = sh.unit * size, cx = size / 2, cy = size / 2, tNow = progress * sh.tmax, i, s;
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round"; ctx.strokeStyle = sh.color; ctx.fillStyle = sh.color;
      ctx.shadowColor = sh.color; ctx.shadowBlur = 5;
      var tip = null, tipT = -1;
      for (i = 0; i < sh.segs.length; i++) {
        s = sh.segs[i];
        if (s[5] > tNow) continue;
        ctx.lineWidth = Math.max(0.5, s[4] * size / 300) * (1 + 1.1 * Math.exp(-s[5] / 0.05));
        ctx.beginPath(); ctx.moveTo(cx + s[0] * k, cy + s[1] * k); ctx.lineTo(cx + s[2] * k, cy + s[3] * k); ctx.stroke();
        if (s[5] > tipT) { tipT = s[5]; tip = [cx + s[2] * k, cy + s[3] * k]; }
      }
      var B = sh.body, tall = sh.soma[3] || 1;
      var bx = cx + sh.soma[0] * k, by = cy + sh.soma[1] * k, br = Math.max(2.5, sh.soma[2] * k);
      ctx.shadowBlur = 9;
      ctx.beginPath();
      for (i = 0; i <= B.length; i++) {
        var a = B[i % B.length], b = B[(i + 1) % B.length];
        var mx = cx + (a[0] + b[0]) / 2 * k, my = cy + (a[1] + b[1]) / 2 * k;
        if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(cx + a[0] * k, cy + a[1] * k, mx, my);
      }
      ctx.closePath(); ctx.fill();
      ctx.save(); ctx.clip(); ctx.shadowBlur = 0;
      var lit = ctx.createRadialGradient(bx - br * 0.45, by - br * 0.5, br * 0.1, bx, by, br * 2.2);
      lit.addColorStop(0, "rgba(255,255,255,0.42)"); lit.addColorStop(0.45, "rgba(255,255,255,0.04)"); lit.addColorStop(1, "rgba(0,0,0,0.38)");
      ctx.fillStyle = lit; ctx.fillRect(bx - br * 4, by - br * 4, br * 8, br * 8);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath(); ctx.ellipse(bx + br * 0.08, by + br * 0.1 * tall, br * 0.5, br * 0.5 * Math.min(1.4, tall), 0, 0, TAU); ctx.fill();
      ctx.restore();
      if (tip && progress < 0.995) {
        ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 8; ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(tip[0], tip[1], 1.5, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    function frame(now) {
      if (!alive) return;
      var e = now - t0;
      if (once && e > GROW) { draw(1, 1); alive = false; return; }
      if (e > GROW + HOLD + FADE) { next(now); e = 0; }
      var g = Math.min(1, e / GROW), p = g * g * (3 - 2 * g);
      draw(p, e <= GROW + HOLD ? 1 : Math.max(0, 1 - (e - GROW - HOLD) / FADE));
      raf = requestAnimationFrame(frame);
    }

    next(performance.now());
    if (still) draw(1, 1);
    else { alive = true; raf = requestAnimationFrame(frame); }

    return {
      /** Grow a new cell now (the next kind in the cycle). */
      regrow: function () {
        next(performance.now());
        if (still) { draw(1, 1); return; }
        if (!alive) { alive = true; raf = requestAnimationFrame(frame); }
      },
      stop: function () { alive = false; cancelAnimationFrame(raf); }
    };
  }

  holoGrowingCell.kinds = KINDS.map(function (k) { return k.name; });
  window.holoGrowingCell = holoGrowingCell;
})();
