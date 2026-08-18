/* ---- converging swarm (holoconverge) -------------------------------------
   Extracted from the long press save affordance on
   amyleesterling.github.io/ca3. Press and hold a clip there and a chip rises
   in the middle of the frame while the file is fetched. This is the motion
   that runs behind it: particles enter from the edges and stream into the
   chip, so the thing you are waiting on is also the thing everything points
   at.

     var s = holoconverge(host, target);   // both are elements
     s.start();                            // false under reduced motion
     s.stop();
     s.retarget();                         // after a resize or a reflow

   Honest description: it is boids with one strong attractor, drawn to a 2D
   canvas. Each particle steers a little toward the average heading of its
   neighbours, pushes away from any that crowd it, and is pulled toward the
   target with its own per particle strength. A small per particle curl, added
   perpendicular to that pull, is what makes the approach arc instead of
   marching straight in. Particles are absorbed within fifteen pixels of the
   target and reborn at a random edge, so the flow is continuous rather than a
   single burst. Each is a short line along its own heading, brighter the
   closer it gets. No trails, no compositing tricks.

   The neighbour scan strides every other particle, which is enough to read as
   a flock and keeps the cost flat as the count rises.

   Three deviations from the source, all deliberate:

   Colour. The original hardcodes three cool rgb triplets. Here the three tints
   are read from --holo-line, --holo-beam and --holo-cyan at start, so a swarm
   picks up the palette of the page it is on rather than importing ca3's.

   Input. The original binds touchstart and touchend only, because on a desktop
   a right click on a video already offers Save video as, so it needs no press
   path there. A library component cannot assume its host has that, so nothing
   here binds input at all: you start and stop it. The demo drives it with
   pointer events, which covers mouse, touch and pen with one path.

   Teardown. The original stops when its chip hides and has no backstop. This
   one has one, for the reason written on the confetti: requestAnimationFrame
   never fires in a background tab or an embedded pane that reports the
   document hidden, so a loop that only tears down from inside itself never
   tears down at all, and a canvas sits over the host for the life of the page.
   Nothing here outlives MAX_LIFE whether or not a frame was ever drawn. */

(function () {
  "use strict";

  var reduce = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  /* no swarm is a waiting state anyone should watch for four minutes, and a
     forgotten stop() must not cost a live canvas for the life of the page */
  var MAX_LIFE = 240000;

  var FALLBACK = ["196 228 255", "178 216 248", "126 224 255"];

  function tints(el) {
    var s = getComputedStyle(el), out = [], names = ["--holo-line", "--holo-beam", "--holo-cyan"];
    for (var i = 0; i < names.length; i++) {
      var v = s.getPropertyValue(names[i]).trim();
      out.push(v || FALLBACK[i]);
    }
    return out;
  }

  function holoconverge(host, target) {
    if (!host) return null;

    var canvas = null, ctx = null, frame = 0, backstop = 0;
    var dpr = 1, W = 0, H = 0, tx = 0, ty = 0;
    var parts = [], palette = FALLBACK;

    function measure() {
      if (!canvas) return;
      var r = host.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width * dpr));
      H = Math.max(1, Math.round(r.height * dpr));
      canvas.width = W;
      canvas.height = H;
      /* centre of the host is the sensible default when there is no target,
         and it is also where a centred chip already sits */
      if (target && target.getBoundingClientRect) {
        var t = target.getBoundingClientRect();
        tx = (t.left - r.left + t.width / 2) * dpr;
        ty = (t.top - r.top + t.height / 2) * dpr;
      } else {
        tx = W / 2;
        ty = H / 2;
      }
    }

    function born() {
      /* just outside a random edge, so they arrive rather than appear */
      var side = Math.random() * 4 | 0, m = 24 * dpr, x, y;
      if (side === 0) { x = Math.random() * W; y = -m; }
      else if (side === 1) { x = W + m; y = Math.random() * H; }
      else if (side === 2) { x = Math.random() * W; y = H + m; }
      else { x = -m; y = Math.random() * H; }
      return {
        x: x, y: y, vx: 0, vy: 0,
        pull: (0.16 + Math.random() * 0.22) * dpr,
        curl: (Math.random() - 0.5) * 0.5 * dpr,
        r: (0.9 + Math.random() * 1.5) * dpr,
        tint: palette[Math.random() * palette.length | 0],
        life: 200 + Math.random() * 240
      };
    }

    function tick() {
      if (!ctx || !canvas) { teardown(); return; }
      ctx.clearRect(0, 0, W, H);

      var N = Math.min(70, Math.round(W / (9 * dpr)));
      while (parts.length < N) parts.push(born());

      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], ax = 0, ay = 0, n = 0, sx = 0, sy = 0;

        /* every other particle, alternating which half by index, is a large
           enough sample to read as a flock at a fraction of the pairs */
        for (var j = i % 2; j < parts.length; j += 2) {
          if (j === i) continue;
          var q = parts[j], dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
          if (d2 < 3400 * dpr * dpr) {
            ax += q.vx; ay += q.vy; n++;
            if (d2 < 460 * dpr * dpr && d2 > 0.5) { sx -= dx / d2; sy -= dy / d2; }
          }
        }
        if (n) { p.vx += (ax / n - p.vx) * 0.05; p.vy += (ay / n - p.vy) * 0.05; }
        p.vx += sx * 30 * dpr;
        p.vy += sy * 30 * dpr;

        var gx = tx - p.x, gy = ty - p.y, gd = Math.sqrt(gx * gx + gy * gy) || 1;
        /* the pull is along the line to the target, the curl is across it */
        p.vx += (gx / gd) * p.pull - (gy / gd) * p.curl;
        p.vy += (gy / gd) * p.pull + (gx / gd) * p.curl;
        p.vx *= 0.965;
        p.vy *= 0.965;
        p.x += p.vx;
        p.y += p.vy;

        if (--p.life <= 0 || gd < 15 * dpr) { parts[i] = born(); continue; }

        var near = Math.max(0, Math.min(1, 1 - gd / (Math.max(W, H) * 0.55)));
        var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
        ctx.strokeStyle = "rgba(" + p.tint + " / " + (0.18 + near * 0.62).toFixed(3) + ")";
        ctx.lineWidth = p.r;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx / sp) * p.r * 3.2, p.y - (p.vy / sp) * p.r * 3.2);
        ctx.stroke();
      }
      frame = requestAnimationFrame(tick);
    }

    function teardown() {
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      if (backstop) { window.clearTimeout(backstop); backstop = 0; }
      window.removeEventListener("resize", measure);
      if (canvas) { canvas.classList.remove("is-on"); canvas.remove(); canvas = null; ctx = null; }
      parts = [];
    }

    return {
      start: function () {
        if (reduce.matches) return false;
        if (frame) return true;
        if (!canvas) {
          canvas = document.createElement("canvas");
          canvas.className = "holoconverge-canvas";
          canvas.setAttribute("aria-hidden", "true");
          /* a static host cannot position the canvas. Setting the class is
             preferable to writing an inline style, so the host keeps one
             source of truth for its own layout. */
          if (getComputedStyle(host).position === "static") {
            host.classList.add("holoconverge-host");
          }
          host.appendChild(canvas);
          ctx = canvas.getContext("2d");
          if (!ctx) { teardown(); return false; }
        }
        palette = tints(host);
        measure();
        parts = [];
        window.addEventListener("resize", measure);
        canvas.classList.add("is-on");
        frame = requestAnimationFrame(tick);
        if (backstop) window.clearTimeout(backstop);
        backstop = window.setTimeout(teardown, MAX_LIFE);
        return true;
      },
      stop: teardown,
      retarget: measure,
      /* for tests: how many particles are currently alive */
      count: function () { return parts.length; }
    };
  }

  window.holoconverge = holoconverge;
})();
