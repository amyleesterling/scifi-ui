/* ---- loading cell: one choreographed draw loop -----------------------------
   The sign-in dialog's neuron, drawn again as a loading state — but on a single
   clock, so a signal dot is never travelling a branch that is about to vanish
   (the bug the old independent CSS + SMIL loops had: the dots ran their own
   2.6s cycle while the arbor faded on a different one).

   The sequence, one cycle:

     1. soma eases in
     2. the apical dendrites grow up out of it
     3. the axon grows down, and the first dots ride the apical branches in to
        the soma and on out the axon
     4. the basal-left arbor grows, then its dots; then basal-right, then its
        dots  — each set in, to the soma, out the axon
     5. after the last dot leaves the axon the whole cell zips back into the
        soma, and the sequence begins again

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
    var apicalPaths = slice.call(apicalG.querySelectorAll("path"));
    // basal splits into a left tree and a right tree by which side of the soma
    // (x = 60) each branch sits on; the axon is driven on its own.
    var blPaths = [], brPaths = [];
    slice.call(basalG.querySelectorAll("path")).forEach(function (p) {
      if (p === axon) return;
      var cx = 60;
      try { var b = p.getBBox(); cx = b.x + b.width / 2; } catch (e) {}
      (cx < 60 ? blPaths : brPaths).push(p);
    });

    var allPaths = apicalPaths.concat(blPaths, brPaths, [axon]);
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

    // timeline, in ms
    var SOMA = 480, AP_DRAW = 820, AX_DRAW = 400, AP_DOT = 1150,
        BL_DRAW = 620, BL_DOT = 1000, BR_DRAW = 620, BR_DOT = 1000,
        HOLD = 160, ZIP = 640;
    var apDrawS = SOMA, apDrawE = apDrawS + AP_DRAW;
    var apDotS = apDrawE, apDotE = apDotS + AP_DOT;
    var axDrawS = apDotS, axDrawE = axDrawS + AX_DRAW;
    var blDrawS = apDotE, blDrawE = blDrawS + BL_DRAW;
    var blDotS = blDrawE, blDotE = blDotS + BL_DOT;
    var brDrawS = blDotE, brDrawE = brDrawS + BR_DRAW;
    var brDotS = brDrawE, brDotE = brDotS + BR_DOT;
    var zipS = brDotE + HOLD, zipE = zipS + ZIP;
    var T = zipE + HOLD;

    // one branch group: hidden until its draw window, grows to full, holds, then
    // zips back to hidden with everything else at the end.
    function groupOffset(t, drawS, drawE) {
      if (t < drawS) return 1;
      if (t < drawE) return 1 - easeOut(span(t, drawS, drawE));
      if (t < zipS) return 0;
      if (t < zipE) return easeIn(span(t, zipS, zipE));
      return 1;
    }
    function paintGroup(paths, off) {
      var s = String(off);
      for (var i = 0; i < paths.length; i++) paths[i].style.strokeDashoffset = s;
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

      // soma: bloom in on the first cycle, then hold and breathe; a small swell
      // as the arbor zips its energy back home.
      var base = (first && t < SOMA) ? 0.25 + 0.75 * easeOut(span(t, 0, SOMA)) : 1;
      var vis = (first && t < SOMA) ? easeOut(span(t, 0, SOMA)) : 1;
      var breathe = 1 + 0.05 * Math.sin(now / 380);
      var swell = (t >= zipS && t < zipE)
        ? 1 + 0.16 * Math.sin(Math.PI * span(t, zipS, zipE)) : 1;
      var sc = base * breathe * swell;
      if (soma) {
        soma.style.transform = "scale(" + sc + ")";
        soma.style.opacity = String(vis);
      }
      if (halo) {
        halo.style.transform = "scale(" + (sc * 1.06) + ")";
        halo.style.opacity = String(vis * (0.2 + 0.12 * (swell - 1) / 0.16));
      }

      paintGroup(apicalPaths, groupOffset(t, apDrawS, apDrawE));
      paintGroup(blPaths, groupOffset(t, blDrawS, blDrawE));
      paintGroup(brPaths, groupOffset(t, brDrawS, brDrawE));
      axon.style.strokeDashoffset = String(groupOffset(t, axDrawS, axDrawE));

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
