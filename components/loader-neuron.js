/* ---- loading cell: one choreographed draw loop -----------------------------
   The sign-in dialog's neuron, drawn again as a loading state — but on a single
   clock, so a signal dot is never travelling a branch that is about to vanish
   (the bug the old independent CSS + SMIL loops had: the dots ran their own
   2.6s cycle while the arbor faded on a different one).

   The sequence, one cycle:

     1. soma eases in
     2. every dendrite grows outward from the soma at once, top and both
        sides together, each branch starting after the branch it hangs off
        so the arbor spreads away from the cell body rather than appearing
     3. then the axon grows down out of the soma, its collaterals after it
     4. the soma blooms twice, calmly, while the cell is growing, and then
        settles: the growth is over and the branches have the stage
     5. only once the cell stands complete do the action potentials start:
        three staggered volleys, apical first, each set riding tip to soma
        and on out the axon
     6. after the last pulse leaves the axon the whole cell zips back into
        the soma, and the sequence begins again

   Everything is one requestAnimationFrame timeline off a single start stamp, so
   the draw and the dots share the same frame. A tap or click restarts it from
   the soma (the library's holotap:on for touch, a plain click for a mouse).

   Reduced motion: this never runs. The CSS static/reduced-motion rules draw the
   cell in place and hide the dots, so the loader is a still cell, not a frozen
   half-drawn one. */
(function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";
  var mq = window.matchMedia
    ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { return t * t * t; }
  function span(t, a, b) { return clamp01((t - a) / (b - a)); }

  function setup(load) {
    var glyph = load.querySelector(".holoload-glyph");
    if (!glyph || glyph.__loaderLive) return;
    if (mq.matches) return;               // CSS draws the static cell + hides dots
    glyph.__loaderLive = true;
    load.classList.add("holoload-live");

    var apicalG = glyph.querySelector(".arbor.apical");
    var basalG = glyph.querySelector(".arbor.basal");
    var axon = glyph.querySelector(".axon");
    var soma = glyph.querySelector(".soma");
    var halo = glyph.querySelector(".soma-halo");
    var signals = glyph.querySelector(".signals");
    if (!apicalG || !basalG || !axon || !signals) return;

    var slice = Array.prototype.slice;

    // where the cell body actually is, so growth can be measured outward
    var origin = { x: 60, y: 58 };
    if (soma) {
      try {
        var sb = soma.getBBox();
        origin = { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 };
      } catch (e) {}
    }
    function startPoint(p) {
      try { return p.getPointAtLength(0); } catch (e) { return origin; }
    }
    function distFromSoma(p) {
      var q = startPoint(p);
      return Math.hypot(q.x - origin.x, q.y - origin.y);
    }

    // A branch belongs to the axon, not the dendrites, when it hangs off the
    // axon itself. Measured by sampling the axon and asking how close this path
    // starts to it, which is exact here because collaterals are authored from
    // a point on the axon.
    var axonSamples = [];
    try {
      var axLen = axon.getTotalLength();
      for (var k = 0; k <= 40; k++) axonSamples.push(axon.getPointAtLength(axLen * k / 40));
    } catch (e) {}
    function hangsOffAxon(p) {
      if (!axonSamples.length) return false;
      var q = startPoint(p), best = Infinity;
      for (var i = 0; i < axonSamples.length; i++) {
        var d = Math.hypot(q.x - axonSamples[i].x, q.y - axonSamples[i].y);
        if (d < best) best = d;
      }
      return best < 1.5;
    }

    // dendrites: the apical arbor and every basal branch that is not the
    // axon or one of its collaterals. Sorted by how far from the soma each
    // one starts, so a branch never arrives before the branch it grows from.
    var dendrites = slice.call(apicalG.querySelectorAll("path"));
    var axonGroup = [axon];
    slice.call(basalG.querySelectorAll("path")).forEach(function (p) {
      if (p === axon) return;
      (hangsOffAxon(p) ? axonGroup : dendrites).push(p);
    });

    var allPaths = dendrites.concat(axonGroup);
    allPaths.forEach(function (p) {
      p.style.strokeDasharray = "1";
      p.style.strokeDashoffset = "1";       // start hidden
    });

    [soma, halo].forEach(function (e) {
      if (!e) return;
      e.style.transformBox = "fill-box";
      e.style.transformOrigin = "center";
    });

    // a dot's route: down the trunk from tip to soma, then out along the axon.
    function route(sel) {
      var trunk = glyph.querySelector(sel);
      if (!trunk) return null;
      var tl = trunk.getTotalLength();
      var al = axon.getTotalLength();
      return { trunk: trunk, tl: tl, al: al, total: tl + al };
    }
    var routes = {
      apical: route(".trunk-apical"),
      bl: route(".trunk-bl"),
      br: route(".trunk-br")
    };
    function pointAt(r, p) {                 // p: 0 at tip, 1 at axon exit
      var d = p * r.total;
      if (d <= r.tl) return r.trunk.getPointAtLength(r.tl - d);
      return axon.getPointAtLength(Math.min(r.al, d - r.tl));
    }

    // three dots per set, each set on its own pool so an inactive set is simply
    // invisible rather than fighting the active one for the same nodes.
    var PER = 3;
    function pool() {
      var arr = [];
      for (var i = 0; i < PER; i++) {
        var c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("class", "signal-dot");
        c.setAttribute("r", "2.2");
        c.style.opacity = "0";
        signals.appendChild(c);
        arr.push(c);
      }
      return arr;
    }
    var dots = { apical: pool(), bl: pool(), br: pool() };

    // timeline, in ms. The cell grows outward before anything travels it:
    // every dendrite together, then the axon, then a beat of stillness, then
    // the pulses. Each branch inside a group gets its own start, spread across
    // the group's window by how far from the soma it begins, so the arbor
    // opens away from the cell body instead of switching on.
    var SOMA = 500,
        DEND_SPREAD = 640, DEND_DUR = 460,
        AX_SPREAD = 240, AX_DUR = 460,
        SETTLE = 240,
        PULSE = 1150, VOLLEY = 380,
        HOLD = 160, ZIP = 640;
    var dendS = SOMA, dendE = dendS + DEND_SPREAD + DEND_DUR;
    var axS = dendE, axE = axS + AX_SPREAD + AX_DUR;
    var grownAt = axE + SETTLE;             // the cell stands complete
    var apDotS = grownAt, apDotE = apDotS + PULSE;
    var blDotS = apDotS + VOLLEY, blDotE = blDotS + PULSE;
    var brDotS = apDotS + VOLLEY * 2, brDotE = brDotS + PULSE;
    var zipS = brDotE + HOLD, zipE = zipS + ZIP;
    var T = zipE + HOLD;

    // give every path its own window inside its group's span, ordered by how
    // far from the soma it starts, so a branch never precedes its parent
    function schedule(paths, groupS, spread, dur) {
      var d = paths.map(distFromSoma);
      var lo = Math.min.apply(null, d), hi = Math.max.apply(null, d);
      var range = hi - lo || 1;
      return paths.map(function (path, i) {
        var frac = (d[i] - lo) / range;
        var st = groupS + frac * spread;
        return { path: path, drawS: st, drawE: st + dur };
      });
    }
    var timed = schedule(dendrites, dendS, DEND_SPREAD, DEND_DUR)
      .concat(schedule(axonGroup, axS, AX_SPREAD, AX_DUR));

    // one branch: hidden until its own window, grows to full, holds, then zips
    // back to hidden with everything else at the end.
    function branchOffset(t, drawS, drawE) {
      if (t < drawS) return 1;
      if (t < drawE) return 1 - easeOut(span(t, drawS, drawE));
      if (t < zipS) return 0;
      if (t < zipE) return easeIn(span(t, zipS, zipE));
      return 1;
    }
    function paintBranches(t) {
      for (var i = 0; i < timed.length; i++) {
        var it = timed[i];
        it.path.style.strokeDashoffset = String(branchOffset(t, it.drawS, it.drawE));
      }
    }

    // one set of dots: three staggered across its window, each riding tip -> soma
    // -> axon exit, fading at the very ends. Outside the window all are dark.
    function paintDots(set, t, dotS, dotE, r) {
      var d = dots[set], total = dotE - dotS, life = total * 0.7;
      for (var i = 0; i < PER; i++) {
        var st = dotS + (total - life) * (i / (PER - 1));
        var el = d[i];
        if (!r || t < st || t > st + life) { el.style.opacity = "0"; continue; }
        var p = span(t, st, st + life);
        var pt = pointAt(r, p);
        el.setAttribute("cx", pt.x);
        el.setAttribute("cy", pt.y);
        var fade = Math.min(1, p / 0.14, (1 - p) / 0.14);
        el.style.opacity = String(0.92 * clamp01(fade));
      }
    }

    var start = 0, raf = 0, running = false;

    function frame(now) {
      if (!running) return;
      if (!start) start = now;
      var since = now - start;
      var t = since % T;
      var first = since < T;               // soma only blooms on the first pass

      // soma: bloom in on the first cycle, then two calm blooms while the cell
      // is growing, and after that it settles and holds, so the branches and
      // the dots have the stage. A small swell as the arbor zips home.
      var base = (first && t < SOMA) ? 0.25 + 0.75 * easeOut(span(t, 0, SOMA)) : 1;
      var vis = (first && t < SOMA) ? easeOut(span(t, 0, SOMA)) : 1;
      var glow = 0;
      if (t >= SOMA && t < grownAt) {
        // two unhurried blooms across the growth, never dipping below rest
        var g = Math.sin(Math.PI * 2 * 2 * span(t, SOMA, grownAt));
        glow = g > 0 ? g : 0;
      }
      var swell = (t >= zipS && t < zipE)
        ? 1 + 0.16 * Math.sin(Math.PI * span(t, zipS, zipE)) : 1;
      var sc = base * (1 + 0.07 * glow) * swell;
      if (soma) {
        soma.style.transform = "scale(" + sc + ")";
        soma.style.opacity = String(vis);
      }
      if (halo) {
        halo.style.transform = "scale(" + (sc * 1.06) + ")";
        halo.style.opacity = String(vis * (0.2 + 0.16 * glow + 0.12 * (swell - 1) / 0.16));
      }

      paintBranches(t);

      paintDots("apical", t, apDotS, apDotE, routes.apical);
      paintDots("bl", t, blDotS, blDotE, routes.bl);
      paintDots("br", t, brDotS, brDotE, routes.br);

      raf = requestAnimationFrame(frame);
    }

    function play() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    function restart() { start = 0; }       // next frame reblooms from the soma

    // pause when off-screen so the loop is not burning frames unseen
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) play(); else stop();
      }, { threshold: 0.01 }).observe(load);
    } else {
      play();
    }

    // tap or click re-strikes it from the soma. Touch comes through the
    // library's activation signal; a mouse is a plain click (the loader is a
    // surface, not a control).
    load.addEventListener("holotap:on", function (e) {
      if (!e.detail || e.detail.pointerType !== "mouse") restart();
    });
    load.addEventListener("click", restart);
  }

  function init() {
    document.querySelectorAll(".holoload").forEach(setup);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
