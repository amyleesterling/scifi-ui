/* ---- neural-hud: behavior ----------------------------------------------------
   The cockpit's own wiring, from banc-explorer (BE THE FLY, app/page.tsx).
   Holding a turn rotates the world heading; the compass angle is the game's
   headingDegrees + 90; the active EPG sector is the game's formula verbatim,
   counterclockwise degrees floored into sixteen wedges, selecting one of the
   sixteen epg-heading renders to relight over the dimmed base; the reticle
   carries the compass angle; and the heading gauge is drawn by the game's own
   GaugeShell geometry, a broken ring of four arcs, ticks on the quarters, a
   lit north, and a pointer that is a hairline out to the point it lands on.
   The gauge reads the same value the readout reads, so the needle and the
   number can never disagree.

   A and D steer, as in the game, plus the arrow keys, with the pointer over
   the panel; the on screen turn labels are the touch path. All sixteen
   renders preload, as the game preloads them. */
(function () {
  "use strict";

  var TURN_RATE = 120;                 /* degrees per second held */
  var COUNT = 16;
  var CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  var NS = "http://www.w3.org/2000/svg";

  function asset(i) {
    return "media/epg/epg-heading-" + String(i).padStart(2, "0") + ".webp";
  }

  /* the game's arc helper, carried verbatim */
  function describeArc(cx, cy, r, from, to) {
    function point(angle) {
      var rad = (angle - 90) * Math.PI / 180;
      return (cx + r * Math.cos(rad)).toFixed(2) + " " + (cy + r * Math.sin(rad)).toFixed(2);
    }
    if (Math.abs(to - from) < 0.01) return "";
    var large = Math.abs(to - from) > 180 ? 1 : 0;
    return "M" + point(from) + " A" + r + " " + r + " 0 " + large + " " +
      (to > from ? 1 : 0) + " " + point(to);
  }
  function el(name, attrs) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  function setup(panel) {
    if (panel.__hudLive) return;
    panel.__hudLive = true;

    var cockpit = panel.querySelector(".neuralhud-cockpit");
    var active = panel.querySelector(".neuralhud-cockpit-active");
    var reticle = panel.querySelector(".neuralhud-reticle");
    var gauge = panel.querySelector(".neuralhud-gauge.compass");
    if (!cockpit || !active || !reticle || !gauge) return;

    for (var i = 0; i < COUNT; i++) { new Image().src = asset(i); }

    /* the gauge face, drawn once: the broken ring, the quarter ticks, north */
    var svg = el("svg", { viewBox: "0 0 100 100", "aria-hidden": "true" });
    [0, 90, 180, 270].forEach(function (start) {
      svg.appendChild(el("path", {
        "class": "gauge-ring", d: describeArc(50, 50, 42, start + 6, start + 84)
      }));
    });
    var arc = el("path", { "class": "gauge-arc" });
    svg.appendChild(arc);
    [0, 90, 180, 270].forEach(function (tick) {
      svg.appendChild(el("line", {
        "class": "gauge-tick" + (tick === 0 ? " major" : ""),
        x1: 50, y1: 30, x2: 50, y2: 35, transform: "rotate(" + tick + " 50 50)"
      }));
    });
    var north = el("text", { "class": "gauge-north", x: 50, y: 24, "text-anchor": "middle" });
    north.textContent = "N";
    svg.appendChild(north);
    var pointer = el("g", { "class": "gauge-pointer" });
    var needle = el("line", { x1: 50, y1: 50 });
    var tipDot = el("circle", { r: "2.6" });
    pointer.appendChild(needle);
    pointer.appendChild(tipDot);
    svg.appendChild(pointer);
    svg.appendChild(el("circle", { "class": "gauge-hub", cx: 50, cy: 50, r: "1.4" }));
    gauge.insertBefore(svg, gauge.querySelector(".gauge-value"));

    var value = gauge.querySelector(".gauge-value");
    var sub = gauge.querySelector(".gauge-label em");

    var heading = 0, dir = 0, raf = 0, last = 0, sector = -1;

    function paint() {
      /* the game's own mapping, carried verbatim */
      var compass = (((heading + 90) % 360) + 360) % 360;
      var ccw = (360 - compass) % 360;
      var idx = Math.floor(ccw / (360 / COUNT)) % COUNT;
      var cardinal = CARDINALS[Math.round(compass / 45) % 8];
      var degrees = Math.round(compass) % 360;

      reticle.style.setProperty("--heading-angle", compass.toFixed(1) + "deg");
      value.textContent = cardinal + " " + String(degrees).padStart(3, "0") + "°";
      sub.textContent = "EPG " + String(idx).padStart(2, "0");

      /* the pointer is a hairline out to a lit point on the ring */
      var rad = (compass - 90) * Math.PI / 180;
      var x = (50 + 42 * Math.cos(rad)).toFixed(2);
      var y = (50 + 42 * Math.sin(rad)).toFixed(2);
      needle.setAttribute("x2", x);
      tipDot.setAttribute("cx", x);
      tipDot.setAttribute("cy", y);
      arc.setAttribute("d", describeArc(50, 50, 42, 0, compass));

      if (idx !== sector) {
        sector = idx;
        active.src = asset(idx);
        /* relight: restart the sector arrive flash, per the replay rule */
        active.style.animation = "none";
        void active.offsetWidth;
        active.style.animation = "";
      }
      panel.setAttribute("aria-label",
        "EPG cockpit, fly heading " + cardinal + ", " + degrees + " degrees, sector " + idx);
    }
    function frame(now) {
      if (!dir) { raf = 0; return; }
      if (!last) last = now;
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      heading += dir * TURN_RATE * dt;
      paint();
      raf = requestAnimationFrame(frame);
    }
    function setDir(d) {
      dir = d;
      cockpit.classList.toggle("turn-left", d < 0);
      cockpit.classList.toggle("turn-right", d > 0);
      if (d && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    }

    panel.querySelectorAll(".neuralhud-turn [data-turn]").forEach(function (b) {
      var d = b.getAttribute("data-turn") === "left" ? -1 : 1;
      b.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        setDir(d);
      });
      ["pointerup", "pointercancel"].forEach(function (t) {
        b.addEventListener(t, function () { setDir(0); });
      });
    });

    var over = false;
    panel.addEventListener("pointerenter", function () { over = true; });
    panel.addEventListener("pointerleave", function () { over = false; setDir(0); });
    window.addEventListener("keydown", function (e) {
      if (!over || e.repeat) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") setDir(-1);
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") setDir(1);
    });
    window.addEventListener("keyup", function (e) {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A" ||
          e.key === "ArrowRight" || e.key === "d" || e.key === "D") setDir(0);
    });

    paint();
  }

  function init() { document.querySelectorAll(".neuralhud-panel").forEach(setup); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
