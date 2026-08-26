/* ---- shimmer-reveal: the calcium imaging arrival ----------------------------
   Ported from ng-extend (branch eyewire-ii-community),
   src/components/ConfettiCelebration.vue, sparkle mode: the welcome shimmer
   EyeWire II plays as the app materializes. Tiny twinkling stars bloom and
   dissolve while a dark veil melts away on a cosine ease, so the scene is
   revealed THROUGH the particles rather than covered by them. Upstream's own
   note: the whole shimmer lives and dies in about a second while the mind
   settles into the space; any longer and it blocks the view.

   Values as shipped: radius 1 to 4px, twinkle speed 0.03 to 0.08, the
   "moment" life speed 0.046 to 0.064 with a 0.3s spawn stagger (the longer
   ambient wash, 0.008 to 0.018 over 0.8s, is available as {long: true}),
   smoothstep bell envelope, three pass glow (outer shadow r*8, inner r*3,
   white core r*0.35), veil max 0.85 dissolving at 1/54 per frame on
   0.5 + 0.5*cos. Ten sparkle colours carried verbatim.

   Deviations: the upstream canvas is fixed fullscreen behind the app UI;
   here it sizes to the host element so the demo reveals a stage, not the
   page. Intensity 120 count scales by host area against the upstream
   fullscreen assumption. Reduced motion: the shimmer is decoration, so
   nothing runs and the scene simply stands revealed. */
(function () {
  "use strict";

  var reduced = window.matchMedia
    ? matchMedia("(prefers-reduced-motion: reduce)").matches : false;

  var SPARKLE_COLORS = [
    "#00e5ff", "#80deea", "#b2ebf2", "#ffffff", "#CE93D8",
    "#e0f7fa", "#4dd0e1", "#a7ffeb", "#b9f6ca", "#fff9c4"
  ];
  var VEIL_MAX = 0.85;
  var VEIL_STEP = 1 / 54;

  function holoShimmer(host, opts) {
    opts = opts || {};
    if (reduced) return;
    var cv = document.createElement("canvas");
    cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6;";
    cv.setAttribute("aria-hidden", "true");
    host.appendChild(cv);
    var ctx = cv.getContext("2d");
    if (!ctx) { cv.remove(); return; }
    var r = host.getBoundingClientRect();
    cv.width = Math.max(1, r.width);
    cv.height = Math.max(1, r.height);

    var long = !!opts.long;
    var intensity = opts.intensity || 1;
    /* upstream counts against a full window; scale to the host's share */
    var area = (cv.width * cv.height) / (1280 * 800);
    var count = Math.round(120 * intensity * Math.min(1, Math.max(0.3, area)));

    var sparkles = [];
    for (var i = 0; i < count; i++) {
      var spawnDelay = Math.random() * (long ? 0.8 : 0.3);
      sparkles.push({
        x: Math.random() * cv.width,
        y: Math.random() * cv.height,
        r: Math.random() * 3 + 1,
        phase: Math.random() * Math.PI * 2,
        speed: 0.03 + Math.random() * 0.05,
        life: -spawnDelay,
        lifeSpeed: long ? 0.008 + Math.random() * 0.01
                        : 0.046 + Math.random() * 0.018,
        color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
        maxOpacity: 0.7 + Math.random() * 0.3
      });
    }
    var veilT = opts.veil === false ? -1 : 0;
    var raf = 0;
    var backstop = setTimeout(stop, 15000);

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(backstop);
      cv.remove();
    }

    function frame() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      var alive = false;

      if (veilT >= 0 && veilT <= 1) {
        var opacity = VEIL_MAX * (0.5 + 0.5 * Math.cos(Math.PI * veilT));
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(4, 9, 18, " + opacity.toFixed(3) + ")";
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.restore();
        veilT += VEIL_STEP;
        alive = true;
      } else {
        veilT = -1;
      }

      for (var i = 0; i < sparkles.length; i++) {
        var s = sparkles[i];
        s.life += s.lifeSpeed;
        if (s.life > 2) continue;
        if (s.life < 0) { alive = true; continue; }
        alive = true;
        var lin = s.life <= 1 ? s.life : 2 - s.life;
        var envelope = lin * lin * (3 - 2 * lin);
        var twinkle = 0.5 + 0.5 * Math.sin(s.phase + s.life * 80 * s.speed);
        var alpha = envelope * twinkle * s.maxOpacity;
        if (alpha <= 0.02) continue;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = s.r * 8;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = s.r * 3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = alpha * 0.9;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (alive) { raf = requestAnimationFrame(frame); }
      else stop();
    }
    raf = requestAnimationFrame(frame);
  }

  window.holoShimmer = holoShimmer;
})();
