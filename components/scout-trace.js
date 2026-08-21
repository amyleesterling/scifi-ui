/* ---- scout-trace: the Scout tag mode light kit --------------------------------
   Ported from ng-extend (branch eyewire-ii-community), src/util/holo_trace.ts,
   the animation module behind EyeWire II's Scout tag mode. This is the rare
   round trip: that file began by porting scifi-ui's own panel trace and
   materialize, then grew a light choreography of its own in production. These
   are the effects that grew there, carried back verbatim: geometry, durations,
   alphas, line widths and easing all as shipped.

   What is here, and what each does:

     runPanelZip(host, dir)        two beams split from an edge midpoint, race
                                   both sides, meet with a spark
     runPanelDraw(host, dir, cb)   the beams leave the outline LIT, drawing the
                                   box into existence; cb(frac) reports how far
                                   the heads have travelled so the caller can
                                   clip-reveal content in step with the light
     runPanelLap(host)             one bright head takes a fast full lap, the
                                   ring stays lit, then fades
     runParticleBurst(x, y, rgb)   radial burst with light streaks at a point
     runBurstBuild(x, y, getRect, rgb, onPhase)
                                   burst, a breath, then particle streams flow
                                   to the panel's top and bottom midpoints,
                                   charge there, and the border lights from
                                   both points at once
     runBurstCoalesce(x, y, getRect, rgb)
                                   a burst that arcs back and seats on the
                                   border ring, dark until enough have landed,
                                   then one impulse sweeps the frame
     runScytheSwing(x, y)          a crescent slash of light (the swinging
                                   scythe image was retired upstream; the
                                   streak alone is the effect)
     flyPlusOne(x, y, text, rgb, targetEl)
                                   a comet "+1" arcs to a target element,
                                   shedding a trail; the target absorbs it
                                   with a pulse. Upstream hard-coded the
                                   profile button; here the target is a
                                   parameter, which is the port's one
                                   deviation, so a library user can aim it.

   The panel trace itself is not re-ported: it lives in hologram.js section 1,
   where the upstream file got it from. Every effect no-ops under reduced
   motion; the two build effects still fire their phase callbacks so callers
   land on the true final state. */
(function () {
  "use strict";

  var reducedNow = function () {
    return window.matchMedia
      && matchMedia("(prefers-reduced-motion: reduce)").matches;
  };

  /* a point at fraction t around a rounded rectangle; t=0 starts on the top
     edge just past the top-left corner, increasing t runs clockwise */
  function ringPoint(t, rw, rh, r) {
    var sw = rw - 2 * r, sh = rh - 2 * r;
    var arc = Math.PI * r / 2, per = 2 * sw + 2 * sh + 4 * arc;
    var d = (((t % 1) + 1) % 1) * per;
    if (d < sw) return [r + d, 0];
    d -= sw;
    if (d < arc) { var a = d / arc * 1.5708; return [rw - r + r * Math.sin(a), r - r * Math.cos(a)]; }
    d -= arc;
    if (d < sh) return [rw, r + d];
    d -= sh;
    if (d < arc) { var b = d / arc * 1.5708; return [rw - r + r * Math.cos(b), rh - r + r * Math.sin(b)]; }
    d -= arc;
    if (d < sw) return [rw - r - d, rh];
    d -= sw;
    if (d < arc) { var c = d / arc * 1.5708; return [r - r * Math.sin(c), rh - r + r * Math.cos(c)]; }
    d -= arc;
    if (d < sh) return [0, rh - r - d];
    d -= sh;
    var e = d / arc * 1.5708;
    return [r - r * Math.cos(e), r - r * Math.sin(e)];
  }
  function ringBottomCenterT(rw, rh, r) {
    var sw = rw - 2 * r, sh = rh - 2 * r;
    var arc = Math.PI * r / 2, per = 2 * sw + 2 * sh + 4 * arc;
    return (sw + 2 * arc + sh + sw / 2) / per;
  }
  function ringTopCenterT(rw, rh, r) {
    var sw = rw - 2 * r, sh = rh - 2 * r;
    var arc = Math.PI * r / 2, per = 2 * sw + 2 * sh + 4 * arc;
    return (sw / 2) / per;
  }

  /* the corner radius the light should follow: read from the host (or its
     first child, the visual box inside a positioning wrap), so sweeps hug the
     actual border instead of a guessed radius */
  function hostRadius(host, fallback) {
    var el = host;
    for (var i = 0; i < 2 && el; i++) {
      var r = parseFloat(getComputedStyle(el).borderTopLeftRadius || "");
      if (r > 0) return r;
      el = el.firstElementChild;
    }
    return fallback;
  }

  function makeCanvas(host, w, h) {
    var cv = document.createElement("canvas");
    cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:50;";
    cv.setAttribute("aria-hidden", "true");
    host.appendChild(cv);
    var ctx = cv.getContext("2d");
    if (!ctx) { cv.remove(); return null; }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { cv: cv, ctx: ctx };
  }

  /* two beams that split from one edge midpoint and race along both sides to
     meet at the opposite midpoint, closing with a small spark. 'up' starts at
     bottom-center and meets at top-center (the panel collapsing to its slim
     strip); 'down' is the reverse, for expand. */
  function runPanelZip(host, direction) {
    if (reducedNow()) return;
    direction = direction || "up";
    var rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var DUR = 700, R = Math.max(2, hostRadius(host, 10) - 1);
    var made = makeCanvas(host, rect.width, rect.height);
    if (!made) return;
    var cv = made.cv, ctx = made.ctx;
    var w = rect.width, h = rect.height;
    var rw = w - 2, rh = h - 2;
    var tBottom = ringBottomCenterT(rw, rh, R);
    var tTop = ringTopCenterT(rw, rh, R);
    var start = direction === "up" ? tBottom : tTop;
    var end = direction === "up" ? tTop : tBottom;
    var distA = ((end - start) % 1 + 1) % 1;
    var distB = 1 - distA;
    var m = ringPoint(end, rw, rh, R);

    var raf = 0;
    var t0 = performance.now();
    function head(tt) {
      var p = ringPoint(tt, rw, rh, R);
      return [p[0] + 1, p[1] + 1];
    }
    function draw(now) {
      var k = (now - t0) / DUR;
      if (k >= 1) { cancelAnimationFrame(raf); cv.remove(); return; }
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      var RUN = 0.82;
      if (k < RUN) {
        var q = k / RUN, eased = q * q * (3 - 2 * q);
        var TAIL = 0.16, SEG = 48;
        var runs = [[1, distA], [-1, distB]];
        for (var r0 = 0; r0 < 2; r0++) {
          var dir = runs[r0][0], dist = runs[r0][1];
          for (var pass = 0; pass < 2; pass++) {
            ctx.lineWidth = pass ? 1.1 : 4.0;
            for (var j = 0; j < SEG; j++) {
              var f1 = j / SEG, f2 = (j + 1) / SEG;
              var p1 = eased - f1 * TAIL, p2 = eased - f2 * TAIL;
              if (p2 < 0) break;
              var a1 = head(start + dir * p1 * dist);
              var a2 = head(start + dir * p2 * dist);
              var fade = (1 - f1) * (1 - f1);
              ctx.beginPath();
              ctx.moveTo(a1[0], a1[1]);
              ctx.lineTo(a2[0], a2[1]);
              ctx.globalCompositeOperation = pass ? "source-over" : "lighter";
              ctx.strokeStyle = pass
                ? "rgba(178,216,248," + (fade * 0.5).toFixed(3) + ")"
                : "rgba(53,181,255," + (fade * 0.09).toFixed(3) + ")";
              ctx.stroke();
            }
          }
        }
      } else {
        var s = (k - RUN) / (1 - RUN);
        var al = (1 - s) * (1 - s);
        ctx.globalCompositeOperation = "lighter";
        var g = ctx.createRadialGradient(m[0] + 1, m[1] + 1, 0, m[0] + 1, m[1] + 1, 16 * (0.4 + s));
        g.addColorStop(0, "rgba(220,240,255," + (al * 0.7).toFixed(3) + ")");
        g.addColorStop(1, "rgba(53,181,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
  }

  /* like the zip, but the beams leave the outline LIT behind them, so the
     light literally draws the box into existence. Returns the total ms until
     the canvas is gone; onProgress(frac) reports head travel for clip
     reveals. Collapses ('up') clip the trail so the lit frame vanishes with
     the box beneath it. */
  function runPanelDraw(host, direction, onProgress) {
    direction = direction || "down";
    if (reducedNow()) { if (onProgress) onProgress(1); return 0; }
    var rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) { if (onProgress) onProgress(1); return 0; }
    var DUR = 620, HOLD = 120, FADE = 260, R = Math.max(2, hostRadius(host, 10) - 1);
    var made = makeCanvas(host, rect.width, rect.height);
    if (!made) { if (onProgress) onProgress(1); return 0; }
    var cv = made.cv, ctx = made.ctx;
    cv.style.transition = "opacity " + FADE + "ms ease";
    var w = rect.width, h = rect.height;
    var rw = w - 2, rh = h - 2;
    var tBottom = ringBottomCenterT(rw, rh, R);
    var tTop = ringTopCenterT(rw, rh, R);
    var start = direction === "down" ? tTop : tBottom;
    var end = direction === "down" ? tBottom : tTop;
    var distA = ((end - start) % 1 + 1) % 1;
    var distB = 1 - distA;
    function pt(tt) {
      var p = ringPoint(tt, rw, rh, R);
      return [p[0] + 1, p[1] + 1];
    }
    var raf = 0;
    var t0 = performance.now();
    function draw(now) {
      var k = Math.min(1, (now - t0) / DUR);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      var eased = k * k * (3 - 2 * k);
      var hp0 = pt(start + eased * distA);
      if (onProgress) {
        var frac = direction === "down" ? hp0[1] / h : 1 - hp0[1] / h;
        onProgress(k >= 1 ? 1 : Math.max(0, Math.min(1, frac)));
      }
      var clipped = direction === "up";
      if (clipped) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, hp0[1] + 6);
        ctx.clip();
      }
      var runs = [[1, distA], [-1, distB]];
      for (var r0 = 0; r0 < 2; r0++) {
        var dir = runs[r0][0], dist = runs[r0][1];
        var SEG = Math.max(24, Math.ceil(170 * dist));
        for (var pass = 0; pass < 2; pass++) {
          ctx.lineWidth = pass ? 1.1 : 3.4;
          ctx.globalCompositeOperation = pass ? "source-over" : "lighter";
          ctx.strokeStyle = pass ? "rgba(178,216,248,0.6)" : "rgba(53,181,255,0.09)";
          ctx.beginPath();
          var steps = Math.ceil(SEG * eased);
          for (var j = 0; j <= steps; j++) {
            var p = pt(start + dir * Math.min(eased, j / SEG) * dist);
            if (j === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
          }
          ctx.stroke();
        }
        if (k < 1) {
          var hp = pt(start + dir * eased * dist);
          var g = ctx.createRadialGradient(hp[0], hp[1], 0, hp[0], hp[1], 7);
          g.addColorStop(0, "rgba(230,245,255,0.9)");
          g.addColorStop(1, "rgba(53,181,255,0)");
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = g;
          ctx.fillRect(hp[0] - 8, hp[1] - 8, 16, 16);
        }
      }
      if (clipped) ctx.restore();
      if (k < 1) { raf = requestAnimationFrame(draw); return; }
      setTimeout(function () {
        cv.style.opacity = "0";
        setTimeout(function () { cv.remove(); }, FADE + 40);
      }, clipped ? 0 : HOLD);
    }
    raf = requestAnimationFrame(draw);
    void raf;
    return DUR + HOLD + FADE;
  }

  /* one bright head takes a fast full lap of the panel boundary, leaving the
     ring lit, then the light fades. The send-off when the success box hands
     back to the form. */
  function runPanelLap(host, DUR) {
    if (reducedNow()) return 0;
    DUR = DUR || 520;
    var rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return 0;
    var R = Math.max(2, hostRadius(host, 12) - 1), FADE = 200;
    var made = makeCanvas(host, rect.width, rect.height);
    if (!made) return 0;
    var cv = made.cv, ctx = made.ctx;
    var w = rect.width, h = rect.height;
    var rw = w - 2, rh = h - 2;
    var start = ringTopCenterT(rw, rh, R);
    var raf = 0;
    var t0 = performance.now();
    function draw(now) {
      var t = now - t0;
      if (t >= DUR + FADE) { cancelAnimationFrame(raf); cv.remove(); return; }
      ctx.clearRect(0, 0, w, h);
      var q = Math.min(1, t / DUR), eased = q * q * (3 - 2 * q);
      var fade = t > DUR ? 1 - (t - DUR) / FADE : 1;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (var pass = 0; pass < 2; pass++) {
        ctx.lineWidth = pass ? 1.2 : 4.2;
        ctx.globalCompositeOperation = pass ? "source-over" : "lighter";
        ctx.strokeStyle = pass
          ? "rgba(220,240,255," + (0.65 * fade).toFixed(3) + ")"
          : "rgba(53,181,255," + (0.1 * fade).toFixed(3) + ")";
        ctx.beginPath();
        var SEG = Math.max(24, Math.ceil(170 * eased));
        for (var j = 0; j <= SEG; j++) {
          var p = ringPoint(start + (j / SEG) * eased, rw, rh, R);
          if (j === 0) ctx.moveTo(p[0] + 1, p[1] + 1); else ctx.lineTo(p[0] + 1, p[1] + 1);
        }
        ctx.stroke();
      }
      if (q < 1) {
        var hp = ringPoint(start + eased, rw, rh, R);
        var g = ctx.createRadialGradient(hp[0] + 1, hp[1] + 1, 0, hp[0] + 1, hp[1] + 1, 8);
        g.addColorStop(0, "rgba(235,247,255,0.95)");
        g.addColorStop(1, "rgba(53,181,255,0)");
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = g;
        ctx.fillRect(hp[0] - 8, hp[1] - 8, 18, 18);
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return DUR + FADE;
  }

  /* a one-shot radial particle burst with light streaks at a screen point.
     Sized and paced as shipped: wider throw, longer life, gentler fade. */
  function runParticleBurst(cx, cy, rgb) {
    if (reducedNow()) return;
    rgb = rgb || "53,181,255";
    var SIZE = 420, HALF = SIZE / 2, DUR = 1150;
    var cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;left:" + (cx - HALF) + "px;top:" + (cy - HALF) + "px;" +
      "width:" + SIZE + "px;height:" + SIZE + "px;pointer-events:none;z-index:100000;";
    cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv);
    var ctx = cv.getContext("2d");
    if (!ctx) { cv.remove(); return; }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = SIZE * dpr; cv.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var parts = [], streaks = [], i;
    for (i = 0; i < 30; i++) {
      parts.push({
        a: Math.random() * 6.283,
        sp: 70 + Math.random() * 135,
        r: 1.1 + Math.random() * 2.0,
        drag: 0.5 + Math.random() * 0.5
      });
    }
    for (i = 0; i < 9; i++) {
      streaks.push({ a: Math.random() * 6.283, len: 90 + Math.random() * 100 });
    }
    var raf = 0;
    var t0 = performance.now();
    function draw(now) {
      var k = (now - t0) / DUR;
      if (k >= 1) { cancelAnimationFrame(raf); cv.remove(); return; }
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.globalCompositeOperation = "lighter";
      if (k < 0.34) {
        var q = k / 0.34, headE = q * q * (3 - 2 * q);
        ctx.lineCap = "round";
        for (var s = 0; s < streaks.length; s++) {
          var st = streaks[s];
          var r1 = 6 + headE * st.len, r2 = 6 + headE * st.len * 0.55;
          ctx.beginPath();
          ctx.moveTo(HALF + Math.cos(st.a) * r2, HALF + Math.sin(st.a) * r2);
          ctx.lineTo(HALF + Math.cos(st.a) * r1, HALF + Math.sin(st.a) * r1);
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = "rgba(" + rgb + "," + ((1 - q) * 0.55).toFixed(3) + ")";
          ctx.stroke();
        }
        var core = ctx.createRadialGradient(HALF, HALF, 0, HALF, HALF, 26 * (1 - q) + 4);
        core.addColorStop(0, "rgba(220,240,255," + (0.5 * (1 - q)).toFixed(3) + ")");
        core.addColorStop(1, "rgba(" + rgb + ",0)");
        ctx.fillStyle = core;
        ctx.fillRect(0, 0, SIZE, SIZE);
      }
      for (var pi = 0; pi < parts.length; pi++) {
        var p = parts[pi];
        var eo = 1 - Math.pow(1 - k, 1.6 + p.drag);
        var x = HALF + Math.cos(p.a) * p.sp * eo;
        var y = HALF + Math.sin(p.a) * p.sp * eo;
        var al = Math.pow(1 - k, 1.3) * 0.85;
        ctx.beginPath();
        ctx.arc(x, y, p.r * (1 - k * 0.35), 0, 6.283);
        ctx.fillStyle = "rgba(" + rgb + "," + al.toFixed(3) + ")";
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
  }

  /* the build: explosion, a short breath, then two smooth particle streams
     flow to the panel's top and bottom midpoints, gather as glowing charge,
     and the border lights from both points at once. The beams do not wait on
     a clock: they launch once half the flock has landed, and whoever is
     still flying chases the moving light. onPhase fires 'beams' when the
     border starts drawing and 'done' at the end. Returns total ms. */
  function runBurstBuild(ox, oy, getRect, rgb, onPhase) {
    rgb = rgb || "53,181,255";
    if (reducedNow()) {
      if (onPhase) { onPhase("beams"); onPhase("done"); }
      return 0;
    }
    var EXPLODE = 260, CALM = 180, DEPART = 500, FLIGHT = 520, BEAMS = 680, FADE = 200;
    var TOTAL_EST = EXPLODE + CALM + DEPART + FLIGHT + BEAMS + FADE;
    var R = 15;
    var cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:100000;";
    cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv);
    var ctx = cv.getContext("2d");
    if (!ctx) { cv.remove(); if (onPhase) { onPhase("beams"); onPhase("done"); } return 0; }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var vw = window.innerWidth, vh = window.innerHeight;
    cv.width = vw * dpr; cv.height = vh * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var N = 56, parts = [];
    for (var i = 0; i < N; i++) {
      var a = (i / N) * 6.283 + (i % 3) * 0.7;
      parts.push({
        toTop: i % 2 === 0,
        a: a,
        reach: 48 + ((i * 29) % 78),
        depart: EXPLODE + 70 + ((i * 17) % N) / N * DEPART,
        wob: ((i % 5) - 2) * 7,
        r: 1.9 + ((i * 13) % 10) / 5.5,
        arrived: false
      });
    }
    var beamsFired = false, doneFired = false;
    var beamStart = -1;
    var raf = 0;
    var t0 = performance.now();

    function dot(x, y, r, alpha) {
      ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, 6.283);
      ctx.fillStyle = "rgba(" + rgb + "," + (alpha * 0.22).toFixed(3) + ")"; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283);
      ctx.fillStyle = "rgba(" + rgb + "," + alpha.toFixed(3) + ")"; ctx.fill();
    }

    function draw(now) {
      var t = now - t0;
      if ((beamStart >= 0 && t >= beamStart + BEAMS + FADE) || t > TOTAL_EST * 2) {
        if (!doneFired) { doneFired = true; if (onPhase) onPhase("done"); }
        cancelAnimationFrame(raf); cv.remove(); return;
      }
      ctx.clearRect(0, 0, vw, vh);
      ctx.globalCompositeOperation = "lighter";
      var rect = getRect();
      if (!rect) { raf = requestAnimationFrame(draw); return; }
      var top = [rect.left + rect.width / 2, rect.top + 1];
      var bot = [rect.left + rect.width / 2, rect.top + rect.height - 1];
      var rw = rect.width - 2, rh = rect.height - 2;
      var tTop = ringTopCenterT(rw, rh, R), tBot = ringBottomCenterT(rw, rh, R);
      var dAB = (((tBot - tTop) % 1) + 1) % 1;

      var beamT = beamStart >= 0 ? Math.min(1, (t - beamStart) / BEAMS) : 0;
      var eased = beamT * beamT * (3 - 2 * beamT);
      function headFor(isTop) {
        var p = ringPoint((isTop ? tTop : tBot) + eased * (isTop ? dAB : 1 - dAB), rw, rh, R);
        return [rect.left + p[0] + 1, rect.top + p[1] + 1];
      }

      var arrivals = 0;
      for (var pi = 0; pi < parts.length; pi++) {
        var p = parts[pi];
        var eq = Math.min(1, t / EXPLODE);
        var eo = 1 - Math.pow(1 - eq, 2.2);
        var sx = ox + Math.cos(p.a) * p.reach * eo;
        var sy = oy + Math.sin(p.a) * p.reach * eo;
        var lt = (t - p.depart) / FLIGHT;
        if (lt <= 0) {
          sx += Math.sin(now / 260 + p.a * 3) * 2.5;
          sy += Math.cos(now / 300 + p.a * 2) * 2.2;
          dot(sx, sy, p.r, 0.95 * Math.min(1, eq * 2));
          continue;
        }
        if (lt >= 1) p.arrived = true;
        if (p.arrived) { arrivals += 1; continue; }
        var dst = beamStart >= 0 ? headFor(p.toTop) : (p.toTop ? top : bot);
        var e = lt < 0.5 ? 2 * lt * lt : 1 - Math.pow(-2 * lt + 2, 2) / 2;
        var mx = (sx + dst[0]) / 2 + p.wob, my = (sy + dst[1]) / 2 + p.wob * 0.4;
        var x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * mx + e * e * dst[0];
        var y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * my + e * e * dst[1];
        dot(x, y, p.r, 0.95);
        var eb = Math.max(0, e - 0.08);
        var bx = (1 - eb) * (1 - eb) * sx + 2 * (1 - eb) * eb * mx + eb * eb * dst[0];
        var by = (1 - eb) * (1 - eb) * sy + 2 * (1 - eb) * eb * my + eb * eb * dst[1];
        ctx.strokeStyle = "rgba(" + rgb + ",0.3)";
        ctx.lineWidth = p.r;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x, y); ctx.stroke();
      }

      if (!beamsFired && (arrivals >= N / 2 || t > EXPLODE + CALM + DEPART + FLIGHT)) {
        beamsFired = true; beamStart = t; if (onPhase) onPhase("beams");
      }

      var drain = beamStart >= 0 ? Math.max(0, 1 - (t - beamStart) / BEAMS * 1.6) : 1;
      var glow = Math.min(1, arrivals / (N * 0.45)) * drain;
      var pts = [top, bot];
      for (var gi = 0; gi < 2; gi++) {
        var gp = pts[gi];
        var g = ctx.createRadialGradient(gp[0], gp[1], 0, gp[0], gp[1], 14 + glow * 10);
        g.addColorStop(0, "rgba(235,246,255," + (0.85 * glow).toFixed(3) + ")");
        g.addColorStop(0.4, "rgba(" + rgb + "," + (0.5 * glow).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + rgb + ",0)");
        ctx.fillStyle = g;
        ctx.fillRect(gp[0] - 30, gp[1] - 30, 60, 60);
      }

      if (beamStart >= 0) {
        var fade = t > beamStart + BEAMS ? 1 - (t - beamStart - BEAMS) / FADE : 1;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        var runs = [[tTop, dAB], [tBot, 1 - dAB]];
        for (var r0 = 0; r0 < 2; r0++) {
          var startT = runs[r0][0], dist = runs[r0][1];
          for (var pass = 0; pass < 2; pass++) {
            ctx.lineWidth = pass ? 1.2 : 4;
            ctx.globalCompositeOperation = pass ? "source-over" : "lighter";
            ctx.strokeStyle = pass
              ? "rgba(216,238,255," + (0.62 * fade).toFixed(3) + ")"
              : "rgba(" + rgb + "," + (0.1 * fade).toFixed(3) + ")";
            ctx.beginPath();
            var SEG = Math.max(24, Math.ceil(170 * dist));
            var steps = Math.ceil(SEG * eased);
            for (var j = 0; j <= steps; j++) {
              var pp = ringPoint(startT + Math.min(eased, j / SEG) * dist, rw, rh, R);
              var px = rect.left + pp[0] + 1, py = rect.top + pp[1] + 1;
              if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return TOTAL_EST;
  }

  /* burst-then-coalesce: a big particle burst that arcs back and lands along
     the border ring of a panel, dark while the swarm seats; once sixty
     percent are home the charge releases as one light impulse sweeping the
     ring. The rect is re-read every frame so particles chase a box that
     appears mid-flight. Returns total ms. */
  function runBurstCoalesce(cx, cy, getRect, rgb) {
    if (reducedNow()) return 0;
    rgb = rgb || "53,181,255";
    var DUR = 1450, R = 15, N = 64;
    var BURST_END = 0.30, LAND_END = 0.86;
    var cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:100000;";
    cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv);
    var ctx = cv.getContext("2d");
    if (!ctx) { cv.remove(); return 0; }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var vw = window.innerWidth, vh = window.innerHeight;
    cv.width = vw * dpr; cv.height = vh * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var parts = [];
    for (var i = 0; i < N; i++) {
      parts.push({
        a: Math.random() * 6.283,
        reach: 70 + Math.random() * 130,
        r: 0.9 + Math.random() * 1.7,
        ringT: (i + Math.random() * 0.6) / N,
        wob: (Math.random() - 0.5) * 46,
        drag: 1.4 + Math.random(),
        landK: BURST_END + (LAND_END - BURST_END) * (0.5 + 0.5 * Math.random())
      });
    }
    var LIT_FRACTION = 0.6;
    var pulseAtK = null;
    var raf = 0;
    var t0 = performance.now();
    function draw(now) {
      var k = (now - t0) / DUR;
      if (k >= 1) { cancelAnimationFrame(raf); cv.remove(); return; }
      ctx.clearRect(0, 0, vw, vh);
      ctx.globalCompositeOperation = "lighter";
      var rect = getRect();
      var rw = rect ? rect.width - 2 : 0, rh = rect ? rect.height - 2 : 0;

      for (var pi = 0; pi < parts.length; pi++) {
        var p = parts[pi];
        var bq = Math.min(1, k / BURST_END);
        var bEase = 1 - Math.pow(1 - bq, p.drag);
        var bx = cx + Math.cos(p.a) * p.reach * bEase;
        var by = cy + Math.sin(p.a) * p.reach * bEase;
        var x = bx, y = by, al = 0.8 * (1 - k * 0.25);
        if (k > BURST_END && rect) {
          var cq = Math.min(1, (k - BURST_END) / (p.landK - BURST_END));
          var cEase = cq * cq * (3 - 2 * cq);
          var seat = ringPoint(p.ringT, rw, rh, R);
          var sx = rect.left + seat[0] + 1, sy = rect.top + seat[1] + 1;
          var arc = Math.sin(cEase * Math.PI) * p.wob;
          var dx = sy - by, dy = -(sx - bx);
          var dl = Math.hypot(dx, dy) || 1;
          x = bx + (sx - bx) * cEase + (dx / dl) * arc;
          y = by + (sy - by) * cEase + (dy / dl) * arc;
          if (pulseAtK !== null) {
            var pEnd0 = Math.min(pulseAtK + 0.24, 0.97);
            if (k > pEnd0) al *= Math.max(0, 1 - (k - pEnd0) / (1 - pEnd0));
          }
        }
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, 6.283);
        ctx.fillStyle = "rgba(" + rgb + "," + Math.max(0, al).toFixed(3) + ")";
        ctx.fill();
      }

      if (rect && pulseAtK === null) {
        var landed = 0;
        for (var li = 0; li < parts.length; li++) if (k >= parts[li].landK) landed++;
        if (landed / N >= LIT_FRACTION || k >= LAND_END) pulseAtK = k;
      }

      if (rect && pulseAtK !== null) {
        var pEnd = Math.min(pulseAtK + 0.24, 0.97);
        var q = Math.min(1, (k - pulseAtK) / (pEnd - pulseAtK));
        var qEase = q * q * (3 - 2 * q);
        var topT = ringTopCenterT(rw, rh, R);
        var flash = Math.pow(1 - q, 1.6);
        ctx.lineCap = "round";
        for (var pass = 0; pass < 2; pass++) {
          ctx.lineWidth = pass ? 1.1 : 5.2;
          ctx.globalCompositeOperation = pass ? "source-over" : "lighter";
          ctx.strokeStyle = pass
            ? "rgba(198,228,252," + (0.5 * flash).toFixed(3) + ")"
            : "rgba(" + rgb + "," + (0.16 * flash).toFixed(3) + ")";
          ctx.beginPath();
          var SEG = 72;
          for (var j = 0; j <= SEG; j++) {
            var rp = ringPoint(j / SEG, rw, rh, R);
            var rx = rect.left + rp[0] + 1, ry = rect.top + rp[1] + 1;
            if (j === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
          }
          ctx.stroke();
        }
        var TAIL = 0.14, TAIL_SEG = 16;
        ctx.globalCompositeOperation = "lighter";
        var dirs = [1, -1];
        for (var di = 0; di < 2; di++) {
          var dir = dirs[di];
          var headT = topT + dir * 0.5 * qEase;
          for (var s = 0; s < TAIL_SEG; s++) {
            var ta = headT - dir * (s / TAIL_SEG) * TAIL * qEase;
            var tb = headT - dir * ((s + 1) / TAIL_SEG) * TAIL * qEase;
            var a0 = ringPoint(ta, rw, rh, R);
            var a1 = ringPoint(tb, rw, rh, R);
            var segAl = 0.85 * (1 - s / TAIL_SEG) * (1 - q * 0.55);
            ctx.lineWidth = 3.2 * (1 - s / TAIL_SEG) + 0.8;
            ctx.strokeStyle = s < 2
              ? "rgba(228,244,255," + segAl.toFixed(3) + ")"
              : "rgba(" + rgb + "," + (segAl * 0.8).toFixed(3) + ")";
            ctx.beginPath();
            ctx.moveTo(rect.left + a0[0] + 1, rect.top + a0[1] + 1);
            ctx.lineTo(rect.left + a1[0] + 1, rect.top + a1[1] + 1);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return DUR;
  }

  /* a crescent slash of light at (x, y). The swinging scythe image was
     retired upstream; the streak alone is the effect. */
  function runScytheSwing(x, y) {
    if (reducedNow()) return;
    var S = 150, HALF = S / 2;
    var cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;left:" + (x - HALF) + "px;top:" + (y - HALF) + "px;" +
      "width:" + S + "px;height:" + S + "px;pointer-events:none;z-index:99999;";
    cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv);
    var ctx = cv.getContext("2d");
    if (!ctx) { cv.remove(); return; }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = S * dpr; cv.height = S * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var t0 = performance.now(), DUR = 540;
    var A0 = -Math.PI * 0.78, A1 = Math.PI * 0.28;
    function draw(now) {
      var k = (now - t0) / DUR;
      if (k >= 1) { cv.remove(); return; }
      ctx.clearRect(0, 0, S, S);
      var q = Math.min(1, k / 0.72), head = q * q * (3 - 2 * q);
      var fade = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ctx.lineCap = "round";
      ctx.globalCompositeOperation = "lighter";
      for (var pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        ctx.arc(HALF, HALF, 46, A0, A0 + (A1 - A0) * head);
        ctx.lineWidth = pass ? 1.4 : 5;
        ctx.strokeStyle = pass
          ? "rgba(220,240,255," + (0.7 * fade).toFixed(3) + ")"
          : "rgba(53,181,255," + (0.14 * fade).toFixed(3) + ")";
        ctx.stroke();
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  /* once-injected keyframes for the absorb pulse, which outlives any handle */
  function ensureHoloCss() {
    if (document.getElementById("scout-trace-anim-css")) return;
    var st = document.createElement("style");
    st.id = "scout-trace-anim-css";
    st.textContent =
      "@keyframes scoutTraceAbsorb {" +
      "  0%   { box-shadow: 0 0 0 0 rgba(245, 209, 66, 0.65); }" +
      "  100% { box-shadow: 0 0 0 16px rgba(245, 209, 66, 0); }" +
      "}" +
      ".scout-trace-absorb { animation: scoutTraceAbsorb 0.55s ease-out; border-radius: 50%; }";
    document.head.appendChild(st);
  }

  /* a "+1" that arcs to a target element as a comet: the head flies along a
     curved path shedding a fading dot trail, and the target absorbs the
     landing with a pulse. Upstream aimed at its profile button; the target
     is a parameter here. */
  function flyPlusOne(fromX, fromY, text, rgb, targetEl) {
    ensureHoloCss();
    text = text || "+1";
    rgb = rgb || "245,209,66";
    var el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = "position:fixed;left:0;top:0;z-index:100000;" +
      "pointer-events:none;font:700 15px 'Orbitron','Inter',sans-serif;color:rgb(" + rgb + ");" +
      "text-shadow:0 0 8px rgba(" + rgb + ",0.8);will-change:transform;";
    document.body.appendChild(el);
    var target = targetEl ? targetEl.getBoundingClientRect() : null;
    var tx = target ? target.left + target.width / 2 : fromX;
    var ty = target ? target.top + target.height / 2 : fromY - 140;
    var mx = (fromX + tx) / 2, my = Math.min(fromY, ty) - 90;
    var DUR = 950;
    var t0 = performance.now();
    var lastTrail = 0;
    var reduced = reducedNow();
    function step(now) {
      var k = Math.min(1, (now - t0) / DUR);
      var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      var x = (1 - e) * (1 - e) * fromX + 2 * (1 - e) * e * mx + e * e * tx;
      var y = (1 - e) * (1 - e) * fromY + 2 * (1 - e) * e * my + e * e * ty;
      var sc = 1 + 0.25 * Math.sin(Math.PI * Math.min(k * 2, 1)) - 0.6 * Math.max(0, k - 0.6) / 0.4;
      el.style.transform = "translate(" + x + "px, " + y + "px) translate(-50%,-50%) scale(" + Math.max(0.3, sc) + ")";
      el.style.opacity = k > 0.85 ? String(1 - (k - 0.85) / 0.15) : "1";
      if (!reduced && now - lastTrail > 28 && k < 0.92) {
        lastTrail = now;
        var d = document.createElement("div");
        var r = 2 + Math.random() * 2.5;
        d.style.cssText = "position:fixed;left:" + x + "px;top:" + y + "px;width:" + r + "px;height:" + r + "px;" +
          "border-radius:50%;background:rgba(" + rgb + ",0.8);box-shadow:0 0 6px rgba(" + rgb + ",0.6);" +
          "pointer-events:none;z-index:99999;transform:translate(-50%,-50%);";
        document.body.appendChild(d);
        d.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 420, easing: "ease-out" })
          .onfinish = function () { d.remove(); };
      }
      if (k < 1) { requestAnimationFrame(step); return; }
      el.remove();
      if (targetEl) {
        targetEl.classList.remove("scout-trace-absorb");
        void targetEl.offsetWidth;
        targetEl.classList.add("scout-trace-absorb");
        setTimeout(function () { targetEl.classList.remove("scout-trace-absorb"); }, 650);
      }
    }
    requestAnimationFrame(step);
  }

  window.holoScout = {
    runPanelZip: runPanelZip,
    runPanelDraw: runPanelDraw,
    runPanelLap: runPanelLap,
    runParticleBurst: runParticleBurst,
    runBurstBuild: runBurstBuild,
    runBurstCoalesce: runBurstCoalesce,
    runScytheSwing: runScytheSwing,
    flyPlusOne: flyPlusOne
  };
})();
