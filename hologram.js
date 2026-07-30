// scifi-ui  ...  see README.md
// Eight independent pieces. Delete any you do not want.
//   1 particle trace   canvas, on hover
//   2 HUD annotation   brackets and readouts, values read off the media
//   3 play badge       a visible play affordance over video
//   4 source swap      vertical on phones, widescreen on desktop
//   5 step rail        builds .holobar, clicks and arrow keys, reports back
//   6 loading state    drives the bar and the count on .holoload
//   7 boot on view     lights .holoboot and .holounder when first seen, and
//                      clears the class after the play so hover and tap replay
//  10 swarm            HUD motes over a hero that drift, and flee the pointer
//   8 dialog           opens .holodialog modally, no auth, nothing submits
//  12 section rail     builds .holorail from the page headings, marks the
//                      section you are in with an IntersectionObserver
//  13 holo card        drops the edge trace element into every .holocard
//
// Tap activation, the thing that makes all of the above reachable without a
// pointer that can hover, is its own file: hologram-tap.js. Load it too.

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
      // the canvas is hidden below 700px, where its 22px overhang a side would
      // push the page wider than the viewport. No point running a loop to paint
      // into a box with no display.
      if (!cv.offsetWidth && !cv.offsetHeight) return;
      if (!size()) return;
      // walk the boundary and take the closest point to where the pointer
      // crossed, so the light is struck where the cursor entered. A tap has an
      // entry point too, the point it landed on, and it arrives the same way:
      // holotap:on carries clientX and clientY in its detail.
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
    // the event bubbles, so check it is this frame that was activated and not
    // something inside it that happens to be activatable in its own right
    frame.addEventListener("holotap:on", function (e) {
      if (e.target === frame) start(e.detail);
    });
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

// ---- 5. step rail --------------------------------------------------------
(function () {
  // Write <div class="holobar" data-steps="10" data-step="8"></div> and this
  // builds the counter, the rail, the fill and one button per step. Steps are
  // counted from 1 because that is what the counter shows. Reads back three
  // ways: the data-step attribute, a holobar:change event, and el.holobar.
  function pad(n, len) {
    n = String(n);
    while (n.length < len) n = "0" + n;
    return n;
  }

  document.querySelectorAll(".holobar").forEach(function (bar) {
    var steps = Math.max(1, parseInt(bar.getAttribute("data-steps"), 10) || 0);
    var step = Math.min(steps, Math.max(1, parseInt(bar.getAttribute("data-step"), 10) || 1));
    var digits = Math.max(2, String(steps).length);

    bar.textContent = "";
    bar.setAttribute("role", "group");
    if (!bar.getAttribute("aria-label")) bar.setAttribute("aria-label", "Progress");

    var count = document.createElement("span");
    count.className = "holobar-count";
    count.setAttribute("aria-live", "polite");

    var rail = document.createElement("span");
    rail.className = "holobar-rail";
    var fill = document.createElement("span");
    fill.className = "holobar-fill";
    rail.appendChild(fill);

    var ticks = [];
    for (var i = 1; i <= steps; i++) {
      var t = document.createElement("button");
      t.type = "button";
      t.className = "holobar-tick";
      // one tick sits at each end, so the last one lands on 100 per cent
      t.style.left = (steps > 1 ? ((i - 1) / (steps - 1)) * 100 : 50) + "%";
      t.appendChild(document.createElement("i"));
      rail.appendChild(t);
      ticks.push(t);
    }
    bar.appendChild(count);
    bar.appendChild(rail);

    function paint() {
      count.textContent = pad(step, digits);
      var rest = document.createElement("s");
      rest.textContent = " / " + pad(steps, digits);
      count.appendChild(rest);
      // the fill stops at the dot you are on rather than one step past it, so
      // it still reads correctly at three steps as well as at thirty
      rail.style.setProperty("--holobar-progress",
        steps > 1 ? (step - 1) / (steps - 1) : 1);
      for (var k = 0; k < ticks.length; k++) {
        var n = k + 1, el = ticks[k];
        if (n === step) el.setAttribute("aria-current", "step");
        else el.removeAttribute("aria-current");
        if (n < step) el.setAttribute("data-done", "");
        else el.removeAttribute("data-done");
        el.tabIndex = n === step ? 0 : -1;
        el.setAttribute("aria-label", "Step " + n + " of " + steps);
      }
      bar.setAttribute("data-step", step);
    }

    function set(n, moveFocus) {
      n = Math.min(steps, Math.max(1, n | 0));
      if (n !== step) {
        step = n;
        paint();
        bar.dispatchEvent(new CustomEvent("holobar:change", {
          bubbles: true, detail: { step: step, steps: steps }
        }));
      }
      if (moveFocus) ticks[step - 1].focus();
    }

    // dragging. pointerdown anywhere on the rail or on a tick starts it,
    // pointermove updates the step continuously, pointerup ends it. The rail
    // captures the pointer so the drag survives leaving the element, which is
    // most of why it feels like a control rather than a row of buttons.
    var dragging = false, moved = false, clickDeadline = 0;

    function stepAt(clientX) {
      var r = rail.getBoundingClientRect();
      if (!r.width || steps < 2) return 1;
      var f = (clientX - r.left) / r.width;
      f = Math.min(1, Math.max(0, f));
      return Math.round(f * (steps - 1)) + 1;
    }

    rail.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      moved = false;
      bar.classList.add("is-dragging");
      if (rail.setPointerCapture) {
        try { rail.setPointerCapture(e.pointerId); } catch (err) {}
      }
      set(stepAt(e.clientX), false);
      // focus lands on the tick you grabbed, so the arrow keys carry on from
      // where the drag started rather than from wherever it was before
      ticks[step - 1].focus({ preventScroll: true });
    });

    rail.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      moved = true;
      e.preventDefault();
      set(stepAt(e.clientX), false);
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove("is-dragging");
      if (rail.releasePointerCapture && e && e.pointerId !== undefined) {
        try { rail.releasePointerCapture(e.pointerId); } catch (err) {}
      }
      if (!moved) return;
      // the roving tabindex has moved to the tick you dropped on, so focus
      // has to follow it or the focused tick is no longer the current one
      ticks[step - 1].focus({ preventScroll: true });
      // and the click a browser fires after a drag has to be ignored, or it
      // snaps the step back to whichever tick was under the pointer when the
      // button came up. A deadline rather than a flag, because a drag that
      // ends on the rail itself produces no tick click at all to consume it.
      clickDeadline = (window.performance ? performance.now() : Date.now()) + 300;
      moved = false;
    }

    rail.addEventListener("pointerup", endDrag);
    rail.addEventListener("pointercancel", endDrag);
    rail.addEventListener("lostpointercapture", endDrag);

    ticks.forEach(function (t, k) {
      t.addEventListener("click", function () {
        var now = window.performance ? performance.now() : Date.now();
        if (now < clickDeadline) return;
        set(k + 1, true);
      });
    });

    // roving tabindex: only the current tick is in the tab order, and the
    // arrows move the selection, which is the whole point of the control
    rail.addEventListener("keydown", function (e) {
      var n = null;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") n = step + 1;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") n = step - 1;
      else if (e.key === "Home") n = 1;
      else if (e.key === "End") n = steps;
      else return;
      e.preventDefault();
      set(n, true);
    });

    bar.holobar = {
      steps: steps,
      get step() { return step; },
      set step(n) { set(n, false); },
      next: function () { set(step + 1, false); },
      prev: function () { set(step - 1, false); }
    };

    paint();
  });
})();

// ---- 6. loading state ----------------------------------------------------
(function () {
  // data-total and data-loaded drive a real bar. With no total it goes
  // indeterminate instead of inventing a number. Call el.holoload.set(n, of)
  // as your fetches land.
  document.querySelectorAll(".holoload").forEach(function (el) {
    var bar = el.querySelector(".holoload-bar > i");
    var out = el.querySelector(".holoload-count");

    function set(loaded, total) {
      loaded = Number(loaded) || 0;
      total = Number(total) || 0;
      if (total > 0) {
        el.removeAttribute("data-indeterminate");
        if (bar) bar.style.setProperty("--holoload-progress",
          Math.min(1, Math.max(0, loaded / total)));
        if (out) out.textContent = loaded + " / " + total;
      } else {
        el.setAttribute("data-indeterminate", "");
        if (out) out.textContent = "";
      }
    }

    el.holoload = { set: set };
    set(el.getAttribute("data-loaded"), el.getAttribute("data-total"));
  });
})();

// ---- 7. boot on view -----------------------------------------------------
(function () {
  // A panel that boots up before you have scrolled to it has booted for
  // nobody, so the class goes on the first time each one is actually seen.
  var nodes = document.querySelectorAll(".holoboot, .holounder");
  if (!nodes.length) return;

  document.querySelectorAll(".holoboot").forEach(function (p) {
    if (!p.querySelector(":scope > .holoboot-ring")) {
      var ring = document.createElement("i");
      ring.className = "holoboot-ring";
      var glow = document.createElement("i");
      glow.className = "holoboot-glow";
      p.insertBefore(glow, p.firstChild);
      p.insertBefore(ring, p.firstChild);
    }
  });

  function light(el) {
    el.classList.add(el.classList.contains("holoboot") ? "is-online" : "is-drawn");
  }

  var reduce = window.matchMedia &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) {
    nodes.forEach(light);
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      light(e.target);
      io.unobserve(e.target);
    });
  }, { threshold: 0.2 });

  // The on-view class stays on: the resting state of both the boot and the
  // underline is their finished frame, so nothing has to come back off.

  // A tap replays the boot or the draw, on every tap. hologram-tap.js re-fires
  // holotap:on for a re-tap of the thing already lit, so this fires each time.
  // Restarting a CSS animation reliably from inside a pointer handler is the
  // whole trick, and it differs by what the animation is on:
  //   - the underline is a ::after pseudo, which cannot take an inline style, so
  //     it alternates two identically-drawn but differently-named trigger
  //     classes. A change of the computed animation name always restarts it,
  //     where a single class re-added, even across a reflow or a pair of rAFs,
  //     is coalesced away and does nothing.
  //   - the boot is on real elements, the panel and its two decorative spans,
  //     so each is restarted by dropping its animation to none inline, forcing
  //     a reflow, and handing it back to the stylesheet.
  document.addEventListener("holotap:on", function (e) {
    var el = e.target;
    if (!el || !el.classList) return;
    if (el.classList.contains("holounder")) {
      var re = el.classList.contains("is-redraw");
      el.classList.toggle("is-redraw", !re);
      el.classList.toggle("is-drawn", re);
    } else if (el.classList.contains("holoboot")) {
      [el, el.querySelector(".holoboot-ring"), el.querySelector(".holoboot-glow")]
        .forEach(function (n) {
          if (!n) return;
          n.style.animation = "none";
          void n.offsetWidth;   // reflow, so handing the animation back restarts it
          n.style.animation = "";
        });
    }
  });

  // anything already on screen is lit here, before the first paint, because
  // waiting for the observer would show one frame of the finished panel and
  // then start it over. Everything below the fold waits its turn.
  nodes.forEach(function (n) {
    var r = n.getBoundingClientRect();
    if (r.height && r.top < innerHeight && r.bottom > 0) light(n);
    else io.observe(n);
  });
})();

// ---- 8. dialog -----------------------------------------------------------
(function () {
  // A visual component. There is no authentication here, no request goes
  // anywhere, and the field is not a credential field. showModal is what
  // traps focus and makes Escape work, so the fallback below only runs on a
  // browser too old to have it.
  var last = null;

  document.querySelectorAll("dialog.holodialog").forEach(function (dlg) {
    var modal = false;

    function open(opener) {
      last = opener || document.activeElement;
      if (typeof dlg.showModal === "function") {
        dlg.showModal();
        modal = true;
      } else {
        dlg.setAttribute("open", "");
        modal = false;
      }
      var first = dlg.querySelector("[data-holofocus]") ||
                  dlg.querySelector("input, button");
      if (first) first.focus();
    }

    function close() {
      if (typeof dlg.close === "function") dlg.close();
      else dlg.removeAttribute("open");
      if (last && last.focus) last.focus();
    }

    document.querySelectorAll('[data-holodialog="' + dlg.id + '"]')
      .forEach(function (btn) {
        btn.addEventListener("click", function () { open(btn); });
      });

    dlg.querySelectorAll("[data-holoclose]").forEach(function (btn) {
      btn.addEventListener("click", close);
    });

    // clicking the backdrop lands on the dialog element itself
    dlg.addEventListener("click", function (e) { if (e.target === dlg) close(); });
    dlg.addEventListener("cancel", function () {
      if (last && last.focus) setTimeout(function () { last.focus(); }, 0);
    });

    dlg.addEventListener("keydown", function (e) {
      if (modal) return;
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      var f = dlg.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault(); first.focus();
      }
    });
  });
})();

// ---- 10. motes that flee the cursor --------------------------------------------
// Put <div class="holoswarm"></div> inside a positioned hero. Marks are generated
// here rather than hand written, so the count and mix are one edit. Each mark is
// pushed along the vector away from the pointer with a smooth falloff, and CSS
// eases both the push and the return.
//
// The marks are built on every device. Only the repulsion needs a pointer, so
// only the repulsion is gated: on touch they stay as the HUD ornament they were
// drawn as, and no listener is bound. The stylesheet thins the set below 700px
// and drops the lot when motion is not wanted.
(function () {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var RADIUS = 150;   // px of influence
  var PUSH = 62;      // px of maximum displacement

  // kind, x%, y%, text for the readouts, and whether the mark is for a wide
  // screen only. Spread away from the centre so they decorate the edges rather
  // than crowding whatever the hero is showing. The eleven wide ones are what a
  // 375px hero cannot carry without turning into clutter, and all three tick
  // rails are among them: they are the widest marks and the least legible small.
  var MARKS = [
    ["num", 6, 12, "SEC 04"],   ["dot", 13, 26, "", 1],
    ["brk", 4, 44, ""],         ["rail", 8, 62, "", 1],
    ["dot", 17, 78, ""],        ["ring", 10, 88, ""],
    ["num", 21, 94, "0.42", 1], ["dot", 33, 8, ""],
    ["rail", 44, 5, "", 1],     ["dot", 58, 11, "", 1],
    ["ring", 70, 7, ""],        ["num", 80, 15, "SYNC", 1],
    ["dot", 88, 30, ""],        ["brk", 95, 46, "", 1],
    ["rail", 90, 64, "", 1],    ["dot", 83, 79, "", 1],
    ["num", 92, 88, "1.00"],    ["dot", 66, 92, "", 1],
    ["ring", 52, 95, "", 1],    ["dot", 40, 90, ""]
  ];

  document.querySelectorAll(".holoswarm").forEach(function (swarm) {
    var host = swarm.parentElement;
    if (!host) return;
    var els = [];

    MARKS.forEach(function (m) {
      var el = document.createElement("i");
      el.className = m[0] + (m[4] ? " wide" : "");
      // laid out from whichever edge it is nearer, so every mark grows inward
      // and none of them can reach past the box it decorates. A 46px tick rail
      // at left 90 per cent is how this page once scrolled sideways at 375px.
      if (m[1] > 50) el.style.right = (100 - m[1]) + "%";
      else el.style.left = m[1] + "%";
      if (m[2] > 50) el.style.bottom = (100 - m[2]) + "%";
      else el.style.top = m[2] + "%";
      if (m[3]) el.textContent = m[3];
      el.setAttribute("aria-hidden", "true");
      swarm.appendChild(el);
      els.push(el);
    });

    // no cursor, nothing to flee, no listeners
    if (matchMedia("(hover: none)").matches) return;

    function move(ev) {
      var r = host.getBoundingClientRect();
      var mx = ev.clientX - r.left, my = ev.clientY - r.top;
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var ex = el.offsetLeft + el.offsetWidth / 2;
        var ey = el.offsetTop + el.offsetHeight / 2;
        var dx = ex - mx, dy = ey - my;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        if (d > RADIUS) {
          el.style.transform = "";
          el.style.opacity = "";
          continue;
        }
        // falloff, 1 at the cursor and 0 at the edge of influence, eased so the
        // motes drift rather than snap
        var f = 1 - d / RADIUS;
        f = f * f;
        var k = (PUSH * f) / d;
        el.style.transform = "translate(" + (dx * k).toFixed(1) + "px,"
                                          + (dy * k).toFixed(1) + "px)";
        el.style.opacity = String(0.9);
      }
    }

    function leave() {
      els.forEach(function (el) { el.style.transform = ""; el.style.opacity = ""; });
    }

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
  });
})();

// ---- 12. section rail ----------------------------------------------------
(function () {
  // Put <nav class="holorail" data-holorail="h2"></nav> anywhere in the body
  // and this builds it: a counter, a track, a fill, a travelling head, and one
  // dot per matching heading. The dots are real anchors, so with the script
  // stripped out you would still have a list of links to the sections.
  //
  // An IntersectionObserver fires when a heading crosses a line 30 per cent
  // down the viewport, and the handler then works out the active section from
  // the geometry rather than from the entry list, because a thin heading can
  // sit between two crossings with nothing intersecting at all. A passive
  // scroll listener calls the same function, which costs one bounding box per
  // heading and keeps the rail correct even where observer delivery is
  // throttled, as it is in a background tab.
  document.querySelectorAll(".holorail").forEach(function (rail) {
    var sel = rail.getAttribute("data-holorail") || "h2";
    var heads = [].slice.call(document.querySelectorAll(sel));
    if (heads.length < 2) { rail.remove(); return; }

    var reduce = window.matchMedia &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    function slug(s) {
      return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
    function pad(n, len) {
      n = String(n);
      while (n.length < len) n = "0" + n;
      return n;
    }

    var digits = Math.max(2, String(heads.length).length);
    rail.textContent = "";
    if (!rail.getAttribute("aria-label")) rail.setAttribute("aria-label", "Sections");

    var count = document.createElement("span");
    count.className = "holorail-count";
    count.setAttribute("aria-live", "polite");

    var track = document.createElement("span");
    track.className = "holorail-track";
    var fill = document.createElement("span");
    fill.className = "holorail-fill";
    var head = document.createElement("span");
    head.className = "holorail-head";
    track.appendChild(fill);
    track.appendChild(head);

    var dots = [];
    heads.forEach(function (h, i) {
      var label = (h.textContent || "").trim();
      if (!h.id) h.id = "s-" + (slug(label) || i + 1);
      h.classList.add("holorail-anchor");

      var a = document.createElement("a");
      a.className = "holorail-dot";
      a.href = "#" + h.id;
      a.setAttribute("aria-label", label);
      // one dot per heading, spread down the track the same way the step rail
      // spreads its ticks along its own, so the last one lands at the foot
      a.style.top = "calc(" + ((i + 1) / heads.length) * 100 + "% - 9px)";
      a.appendChild(document.createElement("i"));
      var b = document.createElement("b");
      b.textContent = label;
      a.appendChild(b);
      a.addEventListener("click", function (e) {
        e.preventDefault();
        h.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        // the hash is set without a jump so the address bar still reflects
        // where you are and the link is copyable
        if (history.replaceState) history.replaceState(null, "", "#" + h.id);
      });
      track.appendChild(a);
      dots.push(a);
    });

    rail.appendChild(count);
    rail.appendChild(track);

    var active = -1;

    function paint(i) {
      if (i === active) return;
      active = i;
      count.textContent = pad(i + 1, digits);
      var rest = document.createElement("s");
      rest.textContent = " / " + pad(heads.length, digits);
      count.appendChild(rest);
      rail.style.setProperty("--holorail-progress", (i + 1) / heads.length);
      for (var k = 0; k < dots.length; k++) {
        if (k === i) dots[k].setAttribute("aria-current", "true");
        else dots[k].removeAttribute("aria-current");
        if (k < i) dots[k].setAttribute("data-done", "");
        else dots[k].removeAttribute("data-done");
      }
      rail.setAttribute("data-section", heads[i].id);
    }

    // the last heading whose top has passed the line is the one you are in
    function pick() {
      var line = innerHeight * 0.3, i = 0;
      for (var k = 0; k < heads.length; k++) {
        if (heads[k].getBoundingClientRect().top <= line) i = k;
      }
      paint(i);
    }

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(pick, {
        rootMargin: "-30% 0px 0px 0px", threshold: [0, 1]
      });
      heads.forEach(function (h) { io.observe(h); });
    }
    addEventListener("scroll", pick, { passive: true });
    addEventListener("resize", pick);
    pick();
  });
})();

// ---- 13. holo card ------------------------------------------------------
(function () {
  // The card is pure CSS. All the script does is drop in the one decorative
  // element the edge trace needs, so the markup stays <div class="holocard">.
  document.querySelectorAll(".holocard").forEach(function (card) {
    if (card.querySelector(":scope > .holocard-trace")) return;
    var t = document.createElement("i");
    t.className = "holocard-trace";
    t.setAttribute("aria-hidden", "true");
    card.insertBefore(t, card.firstChild);
  });
})();
