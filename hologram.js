// scifi-ui  ...  see README.md
// Four independent pieces. Delete any you do not want.
//   1 particle trace   canvas, on hover
//   2 HUD annotation   brackets and readouts, values read off the media
//   3 play badge       a visible play affordance over video
//   4 source swap      vertical on phones, widescreen on desktop

// ---- 1. particle trace ----------------------------------------------------
(function () {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var PAD = 26, N = 64, DUR = 1500, R = 15;

  // a point at fraction t around a rounded rectangle
  function ring(t, w, h, r) {
    var sw = w - 2 * r, sh = h - 2 * r;
    var arc = Math.PI * r / 2, per = 2 * sw + 2 * sh + 4 * arc;
    var d = ((t % 1) + 1) % 1 * per;
    if (d < sw) return [r + d, 0];
    d -= sw;
    if (d < arc) { var a = d / arc * 1.5708; return [w - r + r * Math.sin(a), r - r * Math.cos(a)]; }
    d -= arc;
    if (d < sh) return [w, r + d];
    d -= sh;
    if (d < arc) { var b = d / arc * 1.5708; return [w - r + r * Math.cos(b), h - r + r * Math.sin(b)]; }
    d -= arc;
    if (d < sw) return [w - r - d, h];
    d -= sw;
    if (d < arc) { var c = d / arc * 1.5708; return [r - r * Math.sin(c), h - r + r * Math.cos(c)]; }
    d -= arc;
    if (d < sh) return [0, h - r - d];
    d -= sh;
    var e = (d - 0) / arc * 1.5708;
    return [r - r * Math.cos(e), r - r * Math.sin(e)];
  }

  // a small branching tree, three levels, for the decay to run along
  function branches(x, y, ang) {
    var segs = [];
    (function grow(px, py, a, len, depth) {
      var nx = px + Math.cos(a) * len, ny = py + Math.sin(a) * len;
      segs.push([px, py, nx, ny, depth]);
      if (depth >= 4) return;
      var spread = 0.36 + Math.random() * 0.34;
      grow(nx, ny, a - spread, len * 0.62, depth + 1);
      grow(nx, ny, a + spread, len * 0.62, depth + 1);
    })(x, y, ang, 13, 0);
    return segs;
  }

  document.querySelectorAll(".holoframe").forEach(function (frame) {
    var cv = frame.querySelector("canvas.trace");
    if (!cv) return;
    var ctx = cv.getContext("2d"), P = [], raf = 0, t0 = 0, w = 0, h = 0,
        dpr = 1, tree = null, startT = 0;

    function size() {
      var r = frame.getBoundingClientRect();
      if (!r.width) return false;
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width + PAD * 2; h = r.height + PAD * 2;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }

    function seed() {
      var s0 = ring(0, w - 2, h - 2, R);
      P = [];
      for (var i = 0; i < N; i++) {
        var a = Math.random() * 6.283, rad = 20 + Math.random() * 60;
        P.push({
          x: s0[0] + 1 + Math.cos(a) * rad, y: s0[1] + 1 + Math.sin(a) * rad,
          vx: 0, vy: 0, r: 0.8 + Math.random() * 1.2,
          jx: (Math.random() - 0.5) * 7, jy: (Math.random() - 0.5) * 7,
          seg: 0, u: Math.random(), sp: 0.6 + Math.random() * 0.9
        });
      }
      tree = null;
    }

    function draw(now) {
      var k = (now - t0) / DUR;
      if (k >= 1) { stop(); return; }

      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      var SWEEP_END = 0.60;

      if (k < SWEEP_END) {
        // phase two: they ARE the beam. Nothing else is drawn.
        var q = k / SWEEP_END;
        var head = q * q * (3 - 2 * q), TAIL = 0.11, SEG = 44;
        // stroked as a thin line, not a row of discs. Two passes: a soft wide
        // glow first, then a 1.3px core over it, so it reads as a beam.
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (var pass = 0; pass < 2; pass++) {
          ctx.lineWidth = pass ? 1.0 : 4.0;
          for (var j = 0; j < SEG; j++) {
            var f1 = j / SEG, f2 = (j + 1) / SEG;
            var t1 = head - f1 * TAIL, t2 = head - f2 * TAIL;
            if (t2 < 0) break;
            var a1 = ring(startT + t1, w - 2, h - 2, R),
                a2 = ring(startT + t2, w - 2, h - 2, R);
            var fade = (1 - f1) * (1 - f1);
            ctx.beginPath();
            ctx.moveTo(a1[0] + 1, a1[1] + 1);
            ctx.lineTo(a2[0] + 1, a2[1] + 1);
            ctx.globalCompositeOperation = pass ? "source-over" : "lighter";
            ctx.strokeStyle = pass
              ? "rgba(178,216,248," + (fade * 0.46).toFixed(3) + ")"
              : "rgba(74,150,224," + (fade * 0.07).toFixed(3) + ")";
            ctx.stroke();
          }
        }
      } else {
        // phase three: the beam breaks up and decays along a branching tree
        if (!tree) {
          var e0 = ring(startT + 1, w - 2, h - 2, R);
          var out = Math.atan2(e0[1] + 1 - h / 2, e0[0] + 1 - w / 2);
          tree = [];
          for (var b0 = 0; b0 < 3; b0++) {
            tree = tree.concat(branches(e0[0] + 1, e0[1] + 1,
              out + (b0 - 1) * 0.75 + (Math.random() - 0.5) * 0.3));
          }
          for (var m = 0; m < P.length; m++) {
            P[m].seg = (Math.random() * tree.length) | 0;
            P[m].u = Math.random() * 0.3;
          }
        }
        var d3 = (k - SWEEP_END) / (1 - SWEEP_END);
        for (var n = 0; n < P.length; n++) {
          var q2 = P[n], sg = tree[q2.seg];
          q2.u = Math.min(1, q2.u + 0.028 * q2.sp);
          var x = sg[0] + (sg[2] - sg[0]) * q2.u;
          var y = sg[1] + (sg[3] - sg[1]) * q2.u;
          var al = (1 - d3) * (1 - d3) * (0.34 - sg[4] * 0.06);
          ctx.beginPath();
          ctx.arc(x, y, 0.95 - sg[4] * 0.15, 0, 6.283);
          ctx.fillStyle = "rgba(140,198,244," + Math.max(0, al).toFixed(3) + ")";
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    }

    function stop() {
      cancelAnimationFrame(raf); raf = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function start(ev) {
      if (raf) return;
      if (!size()) return;
      // walk the boundary and take the closest point to where the pointer
      // crossed, so the light is struck where the cursor entered
      startT = 0;
      if (ev && ev.clientX !== undefined) {
        var r = frame.getBoundingClientRect();
        var mx = ev.clientX - r.left + PAD, my = ev.clientY - r.top + PAD;
        var best = 1e9;
        for (var i = 0; i < 240; i++) {
          var tt = i / 240, p = ring(tt, w - 2, h - 2, R);
          var dx = p[0] + 1 - mx, dy = p[1] + 1 - my, d2 = dx * dx + dy * dy;
          if (d2 < best) { best = d2; startT = tt; }
        }
      }
      seed();
      t0 = performance.now();
      raf = requestAnimationFrame(draw);
    }

    frame.addEventListener("mouseenter", start);
    frame.addEventListener("focusin", start);
  });
})();

// ---- 2. HUD annotation ---------------------------------------------------
(function () {
  // Readouts are pulled off the media itself, so they cannot drift out of date.
  // A figure may add data-hud for a measured science value; nothing is invented.
  function fmt(n) { return n.toLocaleString("en-US"); }
  document.querySelectorAll(".holoframe").forEach(function (f) {
    var m = f.querySelector("video, img");
    if (!m) return;
    var hud = document.createElement("div");
    hud.className = "hud";
    hud.innerHTML = '<i class="tl"></i><i class="tr"></i><i class="bl"></i>' +
                    '<i class="br"></i>' +
                    '<b class="a"></b><b class="b"></b><b class="c"></b>';
    f.appendChild(hud);
    var A = hud.querySelector("b.a"), B = hud.querySelector("b.b"),
        C = hud.querySelector("b.c");

    var fig = f.closest("figure");
    if (fig && fig.dataset.hud) C.textContent = fig.dataset.hud;

    function fill() {
      if (m.tagName === "VIDEO") {
        if (m.videoWidth) A.textContent = m.videoWidth + " × " + m.videoHeight;
        if (m.duration && isFinite(m.duration)) {
          B.textContent = m.duration.toFixed(1) + " s · " +
                          Math.round(m.duration * 24) + " frames";
        }
      } else if (m.naturalWidth) {
        A.textContent = fmt(m.naturalWidth) + " × " + fmt(m.naturalHeight);
        B.textContent = "still";
      }
    }
    fill();
    if (m.tagName === "VIDEO") {
      m.addEventListener("loadedmetadata", fill);
      // metadata only loads on demand, so ask for it the first time it is needed
      f.addEventListener("mouseenter", function () {
        if (!m.videoWidth && m.preload !== "auto") { try { m.load(); } catch (e) {} }
      });
    } else {
      m.addEventListener("load", fill);
    }
  });
})();

// ---- 3. play badge -------------------------------------------------------
(function () {
  document.querySelectorAll(".holoframe").forEach(function (f) {
    var v = f.querySelector("video");
    if (!v) return;
    var b = document.createElement("button");
    b.className = "playbadge";
    b.type = "button";
    b.setAttribute("aria-label", "Play");
    b.addEventListener("click", function () { v.play(); });
    f.appendChild(b);
    var sync = function () { f.classList.toggle("playing", !v.paused && !v.ended); };
    ["play", "pause", "ended"].forEach(function (e) { v.addEventListener(e, sync); });
    sync();
  });
})();

// ---- 4. source swap ------------------------------------------------------
(function () {
  // Vertical is the markup default, so a phone never starts fetching the wide
  // file. Anything with room swaps to the widescreen master and lets the
  // wrapper grow, since the 420px cap only makes sense for a phone framing.
  if (!window.matchMedia || !matchMedia("(min-width: 760px)").matches) return;
  var vids = document.querySelectorAll("video[data-wide]");
  for (var i = 0; i < vids.length; i++) {
    var v = vids[i], src = v.querySelector("source");
    if (!src) continue;
    src.src = v.getAttribute("data-wide");
    var poster = v.getAttribute("data-wide-poster");
    if (poster) v.poster = poster;
    var wrap = v.closest(".vidwrap");
    if (wrap) wrap.classList.add("is-wide");
    v.load();
  }
})();
