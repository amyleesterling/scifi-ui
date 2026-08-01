/* ---- ambient field + click burst -----------------------------------------
   Carried across from amyleesterling/flywire-neuron-gallery. Builds the whole
   ambient background layer (drifting gradient, tech-grid, faint circuit board,
   drifting particles, scan lines) once on load and wires the page-wide click
   burst (a star sparkle spray + a sonar ring). Colours + markup are the
   flywire page's; the React component became this plain-JS builder.

   Under reduced motion the moving parts are simply never built: no particles,
   no click burst. The static drift-gradient/grid/circuit/scanline layers still
   mount (holo-bg's own animation is stopped in ambient.css), so the page keeps
   its faint texture without anything actually moving. */
(function () {
  "use strict";

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The 17 hand-drawn circuit traces, verbatim from the flywire page.
  var CIRCUIT_PATHS = [
    "M40 80 H180 V160 H280 V100 H400",
    "M40 240 H140 V340 H260 V280 H380 V360",
    "M120 480 H320 V560 H440",
    "M60 700 H200 V780 H340 V720 H460",
    "M40 880 H260 V940",
    "M520 60 V200 H680 V120 H820",
    "M540 320 H760 V440 H900",
    "M520 580 V720 H680",
    "M540 820 H720 V900 H860",
    "M960 80 H1140 V200",
    "M980 280 H1180 V380 H1300 V440",
    "M960 540 V680 H1100 V620 H1240",
    "M980 800 H1140 V900 H1260",
    "M1340 80 V220 H1500",
    "M1340 360 H1500",
    "M1380 480 V620 H1540 V700",
    "M1340 820 H1480 V940",
  ];

  var SVGNS = "http://www.w3.org/2000/svg";

  function buildBackground() {
    var frag = document.createDocumentFragment();

    var bg = document.createElement("div");
    bg.className = "holo-bg";
    bg.setAttribute("aria-hidden", "true");
    frag.appendChild(bg);

    var grid = document.createElement("div");
    grid.className = "holo-grid";
    grid.setAttribute("aria-hidden", "true");
    frag.appendChild(grid);

    // Circuit board SVG.
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "holo-circuit");
    svg.setAttribute("viewBox", "0 0 1600 1000");
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    svg.setAttribute("aria-hidden", "true");
    var g = document.createElementNS(SVGNS, "g");
    g.setAttribute("stroke", "rgba(126, 224, 255, 0.10)");
    g.setAttribute("stroke-width", "0.6");
    g.setAttribute("fill", "none");
    g.setAttribute("stroke-linecap", "square");
    for (var i = 0; i < CIRCUIT_PATHS.length; i++) {
      var p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", CIRCUIT_PATHS[i]);
      g.appendChild(p);
    }
    svg.appendChild(g);
    frag.appendChild(svg);

    // Drifting particles — only when motion is allowed.
    if (!reduce) {
      var field = document.createElement("div");
      field.className = "holo-particles";
      field.setAttribute("aria-hidden", "true");
      for (var n = 0; n < 70; n++) {
        var dot = document.createElement("i");
        var size = (1.3 + Math.random() * 1.7).toFixed(2);
        dot.style.left = (Math.random() * 100).toFixed(2) + "%";
        dot.style.width = size + "px";
        dot.style.height = size + "px";
        dot.style.animationDuration = (18 + Math.random() * 14).toFixed(1) + "s";
        dot.style.animationDelay = (Math.random() * 22).toFixed(1) + "s";
        field.appendChild(dot);
      }
      frag.appendChild(field);
    }

    var scan = document.createElement("div");
    scan.className = "holo-scanlines";
    scan.setAttribute("aria-hidden", "true");
    frag.appendChild(scan);

    document.body.appendChild(frag);
  }

  // ── click burst ──────────────────────────────────────────────────────────
  // Every click anywhere on the page sprays ~11 star sparkles outward from the
  // click point plus a single expanding sonar ring — a reticle confirm. Skipped
  // on canvas clicks (so 3D drags don't spark) and while a dialog/hero-overlay
  // modal is open (so a backdrop click to dismiss feels like a normal click).
  var PALETTE = ["", "", "", "magenta", "warm"];

  function modalOpen() {
    return !!document.querySelector("dialog[open], .nge-hero-overlay");
  }

  // read live: a device can gain or lose a fine pointer mid-session (docking,
  // plugging in a mouse), and touch should get the reticle either way.
  function isTouch(e) {
    if (e && e.pointerType) return e.pointerType === "touch" || e.pointerType === "pen";
    return !!window.matchMedia &&
      matchMedia("(hover: none) and (pointer: coarse)").matches;
  }

  // ── mobile tap: HUD reticle lock-on ────────────────────────────────────────
  // Four corner brackets snap inward onto the tap point, a crosshair draws
  // through, one fast radar ping expands, and a little lock-code readout
  // flickers in beside it. All positioned off a single 0-size anchor at the
  // point; the CSS carries every motion. Removed after the readout settles.
  var lockN = 0;
  function buildReticle(x, y) {
    var r = document.createElement("div");
    r.className = "tap-reticle";
    r.style.left = x + "px";
    r.style.top = y + "px";

    var corners = ["tl", "tr", "bl", "br"];
    for (var i = 0; i < corners.length; i++) {
      var b = document.createElement("b");
      b.className = corners[i];
      r.appendChild(b);
    }

    var cx = document.createElement("span"); cx.className = "cx";
    var cy = document.createElement("span"); cy.className = "cy";
    var ping = document.createElement("span"); ping.className = "ping";
    r.appendChild(cx); r.appendChild(cy); r.appendChild(ping);

    var rd = document.createElement("span");
    rd.className = "rd";
    // a lock code in the page's readout idiom: SYNC · a rolling 3-digit tick
    lockN = (lockN + 37) % 1000;
    rd.textContent = "SYNC · " + ("00" + lockN).slice(-3);
    r.appendChild(rd);

    document.body.appendChild(r);
    removeLater(r);
  }

  function onClick(e) {
    if (modalOpen()) return;
    var t = e.target;
    if (t && t.closest && t.closest("canvas")) return;

    if (isTouch(e)) { buildReticle(e.clientX, e.clientY); return; }

    var N = 11;
    for (var i = 0; i < N; i++) {
      var angle = (i / N) * Math.PI * 2 + Math.random() * 0.4;
      var dist = 48 + Math.random() * 38;
      var spark = document.createElement("div");
      var color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      spark.className = color ? "click-spark " + color : "click-spark";
      spark.style.left = e.clientX + "px";
      spark.style.top = e.clientY + "px";
      spark.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      spark.style.setProperty("--dy", Math.sin(angle) * dist + "px");
      spark.style.setProperty("--rot", Math.random() * 360 + "deg");
      document.body.appendChild(spark);
      removeLater(spark);
    }

    var ring = document.createElement("div");
    ring.className = "click-ring";
    ring.style.left = e.clientX + "px";
    ring.style.top = e.clientY + "px";
    document.body.appendChild(ring);
    removeLater(ring);
  }

  function removeLater(el) {
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 800);
  }

  function init() {
    buildBackground();
    if (!reduce) document.addEventListener("click", onClick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
