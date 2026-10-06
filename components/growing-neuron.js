/* ---- growing neuron (holoGrowingNeuron) -----------------------------------
   Ported from ng-extend (branch eyewire-ii-community),
   src/components/GrowingNeuron.vue: the wait in EyeWire II's "Sending your
   report" box. Every number below is the shipped one.

     var cell = holoGrowingNeuron(canvas, { stages: 3 });
     cell.setStage(1);                 // one stage finished
     cell.arrive(function () { ... }); // done: light it, then call back
     cell.stop();                      // stop now

     var idle = holoGrowingNeuron(canvas, { loop: true });   // no known progress

   What it draws. A neuron lying on its side, grown from the cell body
   outward, on a 360 by 100 field (the canvas scales to its own width):

     dendrites   five or six, fanned on the side away from the axon, each
                 forking twice. Born from 0 to 0.30 of the growth.
     axon        wanders to the right on two summed sine waves with random
                 amplitude, frequency and phase. Born from 0.30 to 0.74.
     terminals   three or four short branches, each ending in a bouton.
                 Born from 0.74 to 1.

   The cell is built from a seeded random walk, so no two are alike, and the
   same seed always gives the same cell. The body is an uneven blob that
   swells toward each process leaving it, lit from the upper left, with a
   darker nucleus a little off centre. A process is thickest where it leaves
   the body and tapers.

   It shows real progress. That is the point of it. With `stages`, the cell
   is grown a third (or a quarter, and so on) for each finished stage. Inside
   the stage still running it creeps toward 80 percent of that stage on
   0.8 * (1 - e^(-t / 2.5s)) and never gets there, so a slow stage does not
   look stuck and a fast one is never overtaken. A bright tip marks where it
   is growing, and one signal runs down however much axon exists (once every
   1.1s) so the cell reads as alive while it waits.

   The arrival. arrive(done) grows whatever is left, then lights the cell
   once: green runs from the body to the terminals over 600ms, then each
   bouton fills, pops (450ms, half again its size at the peak) and lets go
   two rings (1.1s and 1.5s, out to 16 px), 90ms apart. After 2.6s nothing
   moves, the loop stops, and `done` is called. The lit cell stays drawn.

   Loop mode. For a wait with no progress to report: 2.6s to grow, 0.9s
   held, 0.5s to fade, then a new cell from the next seed. This is the one
   mode that repeats, which the library allows because a wait is ambient.

   Reduced motion. Nothing animates. The cell is drawn at whatever growth
   the stage has earned, with no tip and no signal, and arrive() draws the
   finished lit cell at once.

   Deviations from the source, and why. The source is a Vue component driven
   by props (stage, arrived, seed, loop); here the same state arrives through
   setStage() and arrive(), and arrive() takes a callback, because a library
   wait should hand back its ending (see the path search). stop() is new.
   Nothing about the drawing changed.

   Lineage. The branching rules and the cell body come from "Cells I Met
   Today" (artforagents.com, work 009), where each cell is a sketch that
   grows by a few rules and is different every time. */
(function () {
  "use strict";

  var W = 360, H = 100, TAU = Math.PI * 2;
  var BLUE = [150, 185, 255], GREEN = [126, 240, 200];
  var LOOP_GROW = 2600, LOOP_HOLD = 900, LOOP_FADE = 500;

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function mix(k) { return BLUE.map(function (b, i) { return Math.round(b + (GREEN[i] - b) * k); }); }

  /* Segments are [x1, y1, x2, y2, width, birth]. Births run 0..0.30 for the
     dendrites, 0.30..0.74 for the axon, 0.74..1 for the terminals. */
  function grow(seed) {
    var r = rng(seed), segs = [];
    var sx = 34, sy = 50, sr = 7.5;
    var roots = [0];
    function twig(x, y, ang, len, w, depth, t0, t1) {
      var steps = Math.max(2, Math.round(len / 3.2)), dt = (t1 - t0) / (steps * (depth + 1)), t = t0;
      for (var i = 0; i < steps; i++) {
        ang += (r() - 0.5) * 0.5;
        var nx = x + Math.cos(ang) * 3.2, ny = y + Math.sin(ang) * 3.2;
        if (ny < 5 || ny > H - 5 || nx < 4) break;
        segs.push([x, y, nx, ny, w, t]); x = nx; y = ny; t += dt;
      }
      if (depth > 0) {
        twig(x, y, ang - (0.35 + r() * 0.35), len * 0.7, w * 0.7, depth - 1, t, t1);
        twig(x, y, ang + (0.35 + r() * 0.35), len * 0.7, w * 0.7, depth - 1, t, t1);
      }
    }
    var n = 5 + (r() < 0.4 ? 1 : 0), i;
    for (i = 0; i < n; i++) {
      var a = Math.PI * (0.52 + 0.96 * (i + 0.5) / n) + (r() - 0.5) * 0.25;
      roots.push(a);
      twig(sx, sy, a, 13 + r() * 7, 1.9, 2, 0.02 + r() * 0.05, 0.30);
    }
    var a1 = 9 + r() * 9, a2 = 3 + r() * 5, p1 = r() * TAU, p2 = r() * TAU;
    var f1 = 1.1 + r() * 0.9, f2 = 2.6 + r() * 1.4;
    var x0 = sx + sr - 1, x1 = 292, N = 64, axon = [], px = x0, py = sy;
    for (i = 1; i <= N; i++) {
      var u = i / N, x = x0 + (x1 - x0) * u;
      var y = sy + Math.sin(u * Math.PI) * (a1 * Math.sin(u * f1 * TAU + p1) + a2 * Math.sin(u * f2 * TAU + p2));
      var t = 0.30 + 0.44 * u;
      segs.push([px, py, x, y, 2.6 - 1.0 * Math.min(1, u * 4), t]);
      axon.push([x, y, t]); px = x; py = y;
    }
    var boutons = [], m = 3 + (r() < 0.5 ? 1 : 0);
    for (i = 0; i < m; i++) {
      var ang = (i / (m - 1) - 0.5) * 1.5 + (r() - 0.5) * 0.2, bx = px, by = py;
      var steps = 6 + Math.floor(r() * 3);
      for (var k = 0; k < steps; k++) {
        ang += (r() - 0.5) * 0.3;
        var nx = bx + Math.cos(ang) * 4, ny = Math.max(8, Math.min(H - 8, by + Math.sin(ang) * 4));
        segs.push([bx, by, nx, ny, 1.5, 0.74 + 0.22 * (k + 1) / steps]); bx = nx; by = ny;
      }
      boutons.push([bx, by]);
    }
    var ph = [r() * TAU, r() * TAU], body = [];
    for (i = 0; i < 48; i++) {
      var ba = i / 48 * TAU;
      var rad = 1 + 0.07 * Math.sin(2 * ba + ph[0]) + 0.05 * Math.sin(3 * ba + ph[1]);
      for (var q = 0; q < roots.length; q++) {
        var d = Math.abs(ba - roots[q]) % TAU; if (d > Math.PI) d = TAU - d;
        rad += 0.34 * Math.exp(-(d * d) / 0.1);
      }
      body.push([sx + Math.cos(ba) * sr * rad, sy + Math.sin(ba) * sr * rad]);
    }
    return { segs: segs, axon: axon, boutons: boutons, body: body };
  }

  function holoGrowingNeuron(canvas, opts) {
    opts = opts || {};
    var stages = Math.max(1, opts.stages || 3);
    var loop = !!opts.loop;
    var still = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    var seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9);
    var cell = grow(seed);
    var stage = 0, arrived = false, onDone = null;
    var p = 0, stageAt = 0, arrivedAt = -1, loopAt = 0, last = 0, raf = 0, alive = false, backstop = 0;

    function loopFade(now) {
      var e = now - loopAt - LOOP_GROW - LOOP_HOLD;
      return e <= 0 ? 1 : Math.max(0, 1 - e / LOOP_FADE);
    }
    function target(now) {
      if (arrived) return 1;
      if (loop) return Math.min(1, (now - loopAt) / LOOP_GROW);
      var d = Math.max(0, Math.min(stages, stage));
      var creep = d >= stages ? 0 : 0.8 * (1 - Math.exp(-(now - stageAt) / 2500));
      return Math.min(1, (d + creep) / stages);
    }

    function draw(now) {
      var cw = canvas.clientWidth;
      if (!cw) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2), k = cw / W;
      if (canvas.width !== Math.round(cw * dpr)) {
        canvas.width = Math.round(cw * dpr); canvas.height = Math.round(cw * H / W * dpr);
      }
      var ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      ctx.clearRect(0, 0, W, H);

      var sinceLit = arrivedAt < 0 ? -1 : (still ? 9 : (now - arrivedAt) / 1000);
      var litTo = sinceLit < 0 ? -1 : Math.min(1, sinceLit / 0.6);
      ctx.globalAlpha = loop && !arrived ? loopFade(now) : 1;
      ctx.lineCap = "round";

      var tip = null, tipT = -1, i, s;
      for (i = 0; i < cell.segs.length; i++) {
        s = cell.segs[i];
        if (s[5] > p) continue;
        var lit = litTo >= 0 && s[5] <= litTo, c = lit ? GREEN : BLUE;
        ctx.strokeStyle = rgba(c, lit ? 0.95 : 0.8);
        ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = lit ? 6 : 3;
        ctx.lineWidth = s[4] * (1 + 0.9 * Math.exp(-s[5] / 0.04));
        ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke();
        if (s[5] > tipT) { tipT = s[5]; tip = [s[2], s[3]]; }
      }

      var bodyC = litTo >= 0 ? mix(Math.min(1, litTo * 3)) : BLUE, B = cell.body;
      ctx.shadowColor = rgba(bodyC, 0.9); ctx.shadowBlur = 8; ctx.fillStyle = rgba(bodyC, 0.95);
      ctx.beginPath();
      for (i = 0; i <= B.length; i++) {
        var a = B[i % B.length], b = B[(i + 1) % B.length], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(a[0], a[1], mx, my);
      }
      ctx.closePath(); ctx.fill();
      ctx.save(); ctx.clip(); ctx.shadowBlur = 0;
      var g = ctx.createRadialGradient(31, 46, 1, 34, 50, 16);
      g.addColorStop(0, "rgba(255,255,255,0.45)"); g.addColorStop(0.5, "rgba(255,255,255,0.03)"); g.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx.fillStyle = g; ctx.fillRect(14, 30, 40, 40);
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.arc(34.6, 50.8, 3.4, 0, TAU); ctx.fill();
      ctx.restore();

      if (p > 0.97) {
        for (i = 0; i < cell.boutons.length; i++) {
          var x = cell.boutons[i][0], y = cell.boutons[i][1];
          var since = sinceLit < 0 ? -1 : sinceLit - 0.6 - i * 0.09;
          if (since < 0) {
            ctx.shadowBlur = 0; ctx.lineWidth = 1.3;
            ctx.strokeStyle = rgba(GREEN, 0.85); ctx.fillStyle = rgba(GREEN, 0.18);
            ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); ctx.stroke();
            continue;
          }
          var pop = since < 0.45 ? 1 + 0.5 * Math.sin(Math.min(1, since / 0.45) * Math.PI) : 1;
          var rings = [[1.1, GREEN], [1.5, [126, 224, 255]]];
          for (var q = 0; q < rings.length; q++) {
            var u = since / rings[q][0];
            if (u < 1) {
              ctx.shadowBlur = 0; ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(rings[q][1], 0.9 * (1 - u));
              ctx.beginPath(); ctx.arc(x, y, 3 + u * 16, 0, TAU); ctx.stroke();
            }
          }
          ctx.shadowColor = rgba(GREEN, 1); ctx.shadowBlur = 8; ctx.fillStyle = "#7ef0c8";
          ctx.beginPath(); ctx.arc(x, y, 3.4 * pop, 0, TAU); ctx.fill();
        }
      }

      if (!still && arrivedAt < 0) {
        if (tip && p < 0.995) {
          ctx.shadowColor = "rgba(126,224,255,1)"; ctx.shadowBlur = 10; ctx.fillStyle = "#e6f8ff";
          ctx.beginPath(); ctx.arc(tip[0], tip[1], 1.9, 0, TAU); ctx.fill();
        }
        var grown = cell.axon.filter(function (a) { return a[2] <= p; });
        if (grown.length > 6) {
          var at = grown[Math.min(grown.length - 1, Math.floor(((now / 1100) % 1) * grown.length))];
          ctx.shadowColor = "rgba(126,224,255,0.95)"; ctx.shadowBlur = 7; ctx.fillStyle = "rgba(223,246,255,0.95)";
          ctx.beginPath(); ctx.arc(at[0], at[1], 2.4, 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    function finished() {
      alive = false; clearTimeout(backstop);
      var cb = onDone; onDone = null;
      if (cb) cb();
    }
    function frame(now) {
      if (!alive) return;
      var dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (loop && !arrived && now - loopAt > LOOP_GROW + LOOP_HOLD + LOOP_FADE) {
        seed += 1; cell = grow(seed); loopAt = now; p = 0;
      }
      var t = target(now);
      p = loop && !arrived ? t : p + (t - p) * Math.min(1, dt * (arrived ? 9 : 3.5));
      draw(now);
      if (arrivedAt >= 0 && now - arrivedAt > 2600 && p > 0.999) { finished(); return; }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      var now = performance.now();
      if (still) { p = target(now + 1e6); draw(now); return; }
      if (!alive) { alive = true; last = now; raf = requestAnimationFrame(frame); }
    }

    var now0 = performance.now();
    stageAt = now0; loopAt = now0;
    start();
    var ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(function () { if (!alive) draw(performance.now()); });
      ro.observe(canvas);
    }

    return {
      /** Stages finished so far. */
      setStage: function (n) {
        stage = n; stageAt = performance.now();
        if (still) { p = target(stageAt + 1e6); draw(stageAt); }
      },
      /** The work is done: grow the rest, light the cell once, then call back. */
      arrive: function (done) {
        if (arrived) return;
        arrived = true; onDone = done || null; arrivedAt = performance.now();
        if (still) { p = 1; draw(arrivedAt); finished(); return; }
        start();
        /* A frame that never comes (a hidden tab) must not hold the caller's
           ending hostage. */
        backstop = setTimeout(function () { if (alive) { p = 1; draw(performance.now() + 9000); finished(); } }, 4000);
      },
      stop: function () {
        alive = false; cancelAnimationFrame(raf); clearTimeout(backstop);
        if (ro) ro.disconnect();
      }
    };
  }

  window.holoGrowingNeuron = holoGrowingNeuron;
})();
