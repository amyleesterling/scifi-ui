/* ---- confetti burst (holoburst) -----------------------------------------
   Reimplemented from ConfettiCelebration.vue.

     holoburst("rainbow", 2);      // palette name, intensity multiplier

   Palettes: rainbow, gold, cyan, violet, default. Intensity 1 is normal, 2
   is what the product fires when someone finishes a set of daily quests, 3
   is as much as this should ever do.

   Honest description: it is a plain particle burst. Eighty particles per unit
   of intensity are thrown from a point about a third of the way down the
   screen at a random angle and speed, then integrated with a constant
   gravity, a per particle drag and a per particle fade. Three shapes,
   rectangle, circle and five point star, drawn straight to a 2D canvas. No
   trails, no compositing tricks, no easing curves. The only judgement in it
   is that particles below the halfway line fade at twice the rate, which is
   what stops the burst from ending as a slow drizzle.

   Two things the original did not do:

   Reduced motion. It fired regardless. Here, a reader who has asked for less
   motion gets nothing at all: no canvas is created and the call returns
   false. A confetti burst has no informational content to preserve, so
   degrading it to a still frame would be worse than skipping it.

   Cleanup. The original mounted its canvas for the lifetime of the app.
   Here the canvas is created on the first burst and removed as soon as the
   last particle is gone, and the resize listener goes with it, so an idle
   page carries no full screen canvas and no listener.

   This is the one file in this set that needs requestAnimationFrame. In an
   environment where the document is hidden, rAF does not fire, so the burst
   will not draw. It will not leak either: with no frames the canvas simply
   stays empty until the next visible frame arrives. */

(function () {
  "use strict";

  var PALETTES = {
    rainbow: ["#ff0000", "#ff7700", "#ffff00", "#00ff00", "#0077ff", "#8800ff", "#ff00ff"],
    gold:    ["#ffd700", "#ffea70", "#ffa500", "#fff4b0", "#e6c200", "#ffcc00", "#fff8dc"],
    cyan:    ["#00c8ff", "#00e5ff", "#4dd0e1", "#80deea", "#00acc1", "#26c6da", "#b2ebf2"],
    violet:  ["#ce93d8", "#ab47bc", "#9c27b0", "#e1bee7", "#7b1fa2", "#ba68c8", "#d500f9"],
    default: ["#00c8ff", "#ce93d8", "#7fff88", "#ffd700", "#ff6b8a", "#4a9eff", "#ff9500"]
  };

  var SHAPES = ["rect", "rect", "rect", "circle", "star"];

  var reduce = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  var canvas = null;
  var ctx = null;
  var frame = 0;
  var particles = [];

  function size() {
    if (!canvas) return;
    /* clientWidth rather than innerWidth, so the scrollbar is not counted */
    var d = document.documentElement;
    canvas.width = d.clientWidth;
    canvas.height = d.clientHeight;
  }

  function teardown() {
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    window.removeEventListener("resize", size);
    if (canvas) { canvas.remove(); canvas = null; ctx = null; }
    particles = [];
  }

  function setup() {
    if (canvas && canvas.isConnected) return true;
    canvas = document.createElement("canvas");
    canvas.className = "holoburst-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    if (!ctx) { teardown(); return false; }
    size();
    window.addEventListener("resize", size);
    return true;
  }

  function spawn(count, colors) {
    var cx = canvas.width / 2;
    var cy = canvas.height * 0.35;
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = Math.random() * 12 + 4;
      particles.push({
        x: cx + (Math.random() - 0.5) * 200,
        y: cy + (Math.random() - 0.5) * 100,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 4,
        vy: Math.sin(angle) * speed - Math.random() * 6 - 2,
        w: Math.random() * 8 + 4,
        h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        gravity: 0.12 + Math.random() * 0.06,
        drag: 0.98 + Math.random() * 0.015,
        opacity: 1,
        fade: 0.003 + Math.random() * 0.004,
        shape: SHAPES[Math.floor(Math.random() * SHAPES.length)]
      });
    }
  }

  function star(x, y, r) {
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      var px = x + r * Math.cos(a);
      var py = y + r * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function tick() {
    if (!ctx || !canvas) { teardown(); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var alive = 0;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (p.opacity <= 0) continue;

      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotSpeed;

      /* below the halfway line the fade doubles, which is what keeps the
         burst from trailing off into a slow drizzle at the bottom */
      if (p.y > canvas.height * 0.5) p.opacity -= p.fade * 2;
      if (p.y > canvas.height + 50) { p.opacity = 0; continue; }

      alive++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle = p.color;
      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "star") {
        star(0, 0, p.w / 2);
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }

    if (alive) {
      frame = requestAnimationFrame(tick);
    } else {
      /* last particle gone, so the canvas and its listener go too */
      teardown();
    }
  }

  /* returns false when nothing was fired, which is the reduced motion case */
  function holoburst(palette, intensity) {
    if (reduce.matches) return false;
    if (!setup()) return false;
    var colors = PALETTES[palette] || PALETTES.default;
    var n = Math.round(80 * (Number(intensity) || 1));
    spawn(n, colors);
    if (!frame) frame = requestAnimationFrame(tick);
    return true;
  }

  holoburst.palettes = Object.keys(PALETTES);
  holoburst.stop = teardown;

  window.holoburst = holoburst;
})();
