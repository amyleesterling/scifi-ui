/* ---- spark zip (holoSparkZip) --------------------------------------------
   Ported from ng-extend (branch eyewire-ii-community),
   src/components/DatasetTransition.vue: startEdgeEmitter(r) and the zip()
   that drives it. It is how EyeWire II's "Now entering <dataset>" card leaves
   the screen when someone switches datasets. Every number below is the
   shipped one.

     var zip = holoSparkZip(box, { onDone: fn });
     zip.cancel();    // stop now, remove every canvas, give the box back
     zip.restore();   // after onDone: clear the clip, so the box shows again

   Needs components/scout-trace.js loaded first. The light heads are that
   file's runPanelDraw, the same function the source imports from
   holo_trace.ts, so the zip is not re-ported here, it is called.

   What happens. Two light heads split from the bottom middle of the box, run
   up both sides and then along the top edge from the corners to the centre,
   while the box clips away from the bottom behind them. As soon as the heads
   reach the top edge, sparks stream off it right behind them, and where the
   two heads meet in the middle there is one last burst of 26 more. 620ms of
   travel, then the sparks take up to 1.3s to burn out.

   The physics. Ballistic sparks, the kind a grinder or a sparkler throws.
   The two heads are fuses, and each one drops sparks as it burns inward:

   - density 0.55 sparks per pixel of edge, per side, filled for every pixel
     the head covered since the last frame so the stream has no gaps
   - launch: 78 percent go upward at 0.6 to 3.0 px per frame, the rest
     downward at 0.3 to 1.4, all carrying inward momentum along the fuse's
     travel (0.25 to 1.15 px per frame) plus a random sideways jitter of
     plus or minus 0.35
   - flight is Newtonian projectile motion: gravity adds 0.018 to vy every
     16.7ms, and air drag decays vx by 0.985 every frame, so a spark arcs
     over and drifts down while its sideways speed bleeds off
   - each spark lives 650 to 1300ms, fades on (1 - t) squared, and its core
     shrinks to 60 percent of its size over that life
   - drawn as a bright core (alpha 0.9) and a faint halo 3.2 times its size
     (alpha 0.18), both with additive blending ('lighter'), so where sparks
     overlap the light sums toward white the way incandescent sparks do
   - tinted cyan to violet, rgb(66,213,236) to rgb(201,139,255), the two ends
     of the progress bar on the same card
   - the frame step is clamped to 40ms, so a stalled tab does not teleport
     every spark on its first frame back

   Two quirks carried as shipped. The spark fuses are keyed to how far the
   box has collapsed, not to where the light heads are on the path: the
   progress runPanelDraw reports is vertical, and topStart is a share of the
   path, so the fuses cross the top edge while the box's bottom rises through
   its last stretch (about 27 percent on the demo card), a beat ahead of the
   heads, and the heads then run the lit edge into the burst. Seen frame by
   frame, that is the look that shipped. And gravity is scaled by the frame
   time but the drag is applied once per frame, so on a 120Hz screen
   sideways speed bleeds off a little faster than on a 60Hz one. Both are
   what the card looks like, so both stay.

   Deviations, each for the reasons written on the confetti and the swarm.

   A teardown backstop. The source's spark canvas removes itself from inside
   its own animation frame, so if frames never arrive (a hidden tab, an
   embedded pane) it would sit over the page forever. Here a timer removes it
   whatever happens, after the longest the zip plus the longest spark could
   possibly take.

   A running guard. The source plays once per dataset switch. A library call
   can land twice on one box, so a second call while the first is running
   returns the running handle instead of stacking a second canvas.

   The end state is yours. The source unmounts the card when the zip is done.
   A library does not own your box, so it leaves it clipped to nothing, calls
   onDone, and restore() hands it back.

   Reduced motion: no sparks and no light. The box goes straight to its end
   state and onDone still fires, so a caller lands where it would have. */

(function () {
  "use strict";

  var reduced = function () {
    return !!(window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  /* runPanelDraw's own budget: DUR 620 + HOLD 120 + FADE 260, plus the
     longest spark life (1300) and a margin. Nothing outlives this. */
  var BACKSTOP_MS = 620 + 120 + 260 + 1300 + 600;

  /* Particles along the box's top edge. emitSpan(a, b) spawns them between
     progress a and b of the corner to centre run, on both halves at once.
     Verbatim from DatasetTransition.vue, including the fixed canvas: a fixed
     box contributes nothing to the page's scroll width, which an absolute
     one 120px wider than the card would on a phone. */
  function startEdgeEmitter(r) {
    if (reduced()) return null;
    var PADX = 60, PADT = 170, PADB = 90;
    var W = r.width + PADX * 2, H = PADT + PADB;
    var cv = document.createElement("canvas");
    cv.className = "holosparkzip-canvas";
    cv.style.cssText = "position:fixed;left:" + (r.left - PADX) + "px;top:" + (r.top - PADT) +
      "px;width:" + W + "px;height:" + H + "px;pointer-events:none;z-index:100000;";
    cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv);
    var ctx = cv.getContext("2d");
    if (!ctx) { cv.remove(); return null; }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var y0 = PADT, half = r.width / 2, cx = PADX + half;
    var parts = [];
    function spawn(x, inward) {
      var up = Math.random() < 0.78;
      parts.push({
        x: x, y: y0,
        vx: inward * (0.25 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.7,
        vy: up ? -(0.6 + Math.random() * 2.4) : 0.3 + Math.random() * 1.1,
        life: 650 + Math.random() * 650, age: 0,
        s: 0.8 + Math.random() * 1.9,
        hue: Math.random()
      });
    }
    var stopped = false, gone = false, raf = 0, prev = performance.now();
    function remove() {
      if (gone) return;
      gone = true;
      cancelAnimationFrame(raf);
      cv.remove();
    }
    function frame(now) {
      var dt = Math.min(40, now - prev); prev = now;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.age += dt;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        var k = dt / 16.7;
        p.x += p.vx * k; p.y += p.vy * k;
        p.vy += 0.018 * k; p.vx *= 0.985;
        var t = p.age / p.life, a = (1 - t) * (1 - t);
        /* cyan into violet, like the progress bar */
        var rC = Math.round(66 + (201 - 66) * p.hue),
            gC = Math.round(213 + (139 - 213) * p.hue),
            bC = Math.round(236 + (255 - 236) * p.hue);
        ctx.fillStyle = "rgba(" + rC + "," + gC + "," + bC + "," + (a * 0.9).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 - t * 0.4), 0, 6.283); ctx.fill();
        ctx.fillStyle = "rgba(" + rC + "," + gC + "," + bC + "," + (a * 0.18).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 3.2, 0, 6.283); ctx.fill();
      }
      if (stopped && !parts.length) { remove(); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return {
      emitSpan: function (a, b) {
        var PER_PX = 0.55;                        // particles per pixel of edge, per side
        var x0 = a * half, x1 = b * half;         // distance travelled from each corner
        var n = Math.max(1, Math.round((x1 - x0) * PER_PX));
        for (var i = 0; i < n; i++) {
          var d = x0 + (x1 - x0) * Math.random();
          spawn(PADX + d, +1);                    // left head, moving right (inward)
          spawn(PADX + r.width - d, -1);          // right head, moving left (inward)
        }
        if (b >= 1) {                             // the meeting point pops
          for (var j = 0; j < 26; j++) spawn(cx + (Math.random() - 0.5) * 16, Math.random() < 0.5 ? 1 : -1);
        }
      },
      stop: function () { stopped = true; },
      cancel: remove
    };
  }

  function holoSparkZip(box, opts) {
    opts = opts || {};
    if (!box) return null;
    if (box.__holoSparkZip && box.__holoSparkZip.running) return box.__holoSparkZip;

    var timers = [];
    var emitter = null, finished = false;
    var handle = {
      running: true,
      cancel: function () {
        finished = true;
        timers.forEach(clearTimeout); timers = [];
        if (emitter) emitter.cancel();
        box.querySelectorAll(":scope > canvas[aria-hidden='true']").forEach(function (c) {
          if (c.style.zIndex === "50") c.remove();   // runPanelDraw's canvas
        });
        handle.running = false;
        box.style.clipPath = "";
      },
      restore: function () {
        box.style.clipPath = "";
      }
    };
    box.__holoSparkZip = handle;

    function finish() {
      if (finished) return;
      finished = true;
      handle.running = false;
      box.style.clipPath = "inset(0 0 100% 0)";
      if (typeof opts.onDone === "function") opts.onDone();
    }

    var draw = window.holoScout && window.holoScout.runPanelDraw;
    if (!draw) {
      if (window.console) console.warn("holoSparkZip: load components/scout-trace.js first");
      finish();
      return handle;
    }

    /* The zip: runPanelDraw's two light heads start at the bottom middle, run
       up both sides, then along the top edge from the corners to the centre
       while the box clips away from the bottom. Particles stream off the top
       edge right behind those heads, so the pop follows the zip inward rather
       than bursting from fixed points. */
    var r = box.getBoundingClientRect();
    emitter = startEdgeEmitter(r);
    /* share of the path spent on the top edge: half the width out of (w + h) */
    var topStart = 1 - (r.width / 2) / (r.width + r.height);
    var last = topStart;
    var total = draw(box, "up", function (frac) {
      if (finished) return;
      box.style.clipPath = "inset(0 0 " + (frac * 100).toFixed(2) + "% 0)";
      if (frac > topStart && emitter) {
        /* fill every step since the last frame so the stream has no gaps */
        var a = (last - topStart) / (1 - topStart),
            b = (Math.min(frac, 1) - topStart) / (1 - topStart);
        emitter.emitSpan(a, b);
        last = frac;
      }
      if (frac >= 1) {
        if (emitter) emitter.stop();
        timers.push(setTimeout(finish, 120));
      }
    });
    if (!total) { if (emitter) emitter.stop(); finish(); }   // reduced motion: straight to the end

    timers.push(setTimeout(function () {
      if (emitter) emitter.cancel();
      finish();
    }, BACKSTOP_MS));

    return handle;
  }

  window.holoSparkZip = holoSparkZip;
})();
