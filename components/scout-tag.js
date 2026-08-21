/* ---- scout-tag: the Scout tag mode panel, behavior --------------------------
   Ported from ng-extend (branch eyewire-ii-community),
   src/components/TagModePanel.vue: the state machine and light choreography
   EyeWire II scouts get when they drop Cut / Extend / Other tags. The store,
   the viewer bindings, screenshots and the annotation layer picker stay
   upstream; what is carried is the interaction itself, every animation on
   its shipped timing:

     place a point   a spark answers at the click, the point waits as a pin
     submit          a burst on the button, particle streams flow to the
                     box's midpoints and charge, the border lights from both
                     points while the form swaps for the success box
     success click   one bright lap of the border, the box blooms away, and
                     the beam draws the form back, clip-revealing the
                     content exactly as far as the light has travelled
     collapse        the zip light races upward masking the box away; the
                     slim strip stands where the light finishes
     expand          no pop: the beam draws the frame and unrolls the box
                     beneath it
     close and open  close zips the box away; open flings a particle burst
                     that coalesces onto the arriving panel's border

   Inputs are inert: no form element, no name attributes, nothing submitted.
   Reduced motion lands every state instantly; the kit's functions no-op and
   every path here handles their zero return. Needs scout-trace.js. */
(function () {
  "use strict";

  var reduced = window.matchMedia
    ? matchMedia("(prefers-reduced-motion: reduce)").matches : false;

  var PIN_SVG = '<svg viewBox="0.6 0.2 14.8 15.4" fill="none" style="width:1em;height:1em;color:#35b5ff"><path d="M8 1.6a4.3 4.3 0 0 1 4.3 4.3c0 3-4.3 7.5-4.3 7.5S3.7 8.9 3.7 5.9A4.3 4.3 0 0 1 8 1.6z" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="5.9" r="1.5" fill="currentColor"/><path d="M8 14.4v1M5.4 15h5.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  var HAND_SVG = '<svg viewBox="0 0 16 16" fill="none" style="width:1em;height:1em;vertical-align:middle;"><path d="M5.1 7.3V4a1 1 0 0 1 2 0v3M7.1 7V3a1 1 0 0 1 2 0v4M9.1 7V3.7a1 1 0 0 1 2 0V8M11.1 8V5.6a.95.95 0 0 1 1.9 0v3.6c0 2.6-1.8 4.5-4.3 4.5h-.6c-1.5 0-2.6-.6-3.4-1.8L3.2 9.9c-.5-.8-.3-1.5.4-1.9.6-.3 1.3-.1 1.7.5l.8 1.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var CHOICES = [
    { key: "cut",    cls: "scouttag-chip--cut",   label: "Cut",    hint: "Wrongly joined here, Grim reaps it apart" },
    { key: "extend", cls: "scouttag-chip--ext",   label: "Extend", hint: "A branch looks truncated, keep growing it" },
    { key: "other",  cls: "scouttag-chip--other", label: "Other",  hint: "Something else, describe it in the note" }
  ];
  /* one light to rule them all: every animation uses the UI's beam blue */
  var LIGHT_RGB = "53,181,255";
  var SWAP_MS = 500;

  function setup(stage) {
    if (stage.__scoutLive || !window.holoScout) return;
    stage.__scoutLive = true;
    var K = window.holoScout;

    var wrap = document.createElement("div");
    wrap.className = "scouttag-wrap";
    wrap.style.left = "14px";
    wrap.style.top = "14px";
    stage.appendChild(wrap);

    var marker = document.createElement("span");
    marker.className = "scouttag-marker";
    marker.innerHTML = PIN_SVG.replace("width:1em;height:1em", "width:14px;height:14px");
    marker.style.display = "none";
    stage.appendChild(marker);

    var openBtn = stage.querySelector(".scouttag-open");
    var profileBtn = stage.querySelector(".scouttag-profile");
    var profileCount = profileBtn ? profileBtn.querySelector("b") : null;

    var selected = "cut";
    var noteText = "";
    var pending = null;           /* [x, y, z] demo coordinates */
    var pendingScreen = null;     /* stage-relative pixel position of the pin */
    var collapsed = false;
    var hidden = false;
    var armed = false;
    var tHeld = false;
    var closing = false;
    var flashTimer = 0;
    var tags = 0;

    function choiceOf(key) {
      for (var i = 0; i < CHOICES.length; i++) if (CHOICES[i].key === key) return CHOICES[i];
      return CHOICES[0];
    }
    /* demo coordinates: the stage click mapped into a plausible voxel space */
    function coordsAt(px, py) {
      var r = stage.getBoundingClientRect();
      return [Math.round(3120 + px / r.width * 512),
              Math.round(8452 + py / r.height * 512), 1742];
    }
    function crosshair() {
      var r = stage.getBoundingClientRect();
      return coordsAt(r.width / 2, r.height / 2);
    }

    /* ---- the three faces, rebuilt fresh each show so the materialize
           keyframes restart the way a remount restarts them ---- */
    function chipsHtml(mini) {
      return CHOICES.map(function (c) {
        return '<button type="button" class="' +
          (mini ? "scouttag-mini-chip" : "scouttag-chip " + c.cls) +
          '" data-choice="' + c.key + '" title="' + c.hint +
          '" aria-pressed="' + String(selected === c.key) + '" data-holo-tap>' +
          c.label + "</button>";
      }).join("");
    }
    function formHtml() {
      var pos = pending || crosshair();
      return '<div class="scouttag' + (pending ? " scouttag--pending" : "") + '">' +
        '<div class="scouttag-head">' +
          '<span class="scouttag-title"><span class="scouttag-pin">' + PIN_SVG + "</span> SCOUT TAG MODE</span>" +
          '<button type="button" class="scouttag-close" data-act="collapse" title="Collapse to corner strip">&#9662;</button>' +
          '<button type="button" class="scouttag-close" data-act="close" title="Exit tag mode">&times;</button>' +
        "</div>" +
        '<div class="scouttag-hint">Pick a type, then <b>click the data</b> to place the point (or hold <b>T</b>). <b>Submit</b> saves it. Visual component only.</div>' +
        '<div class="scouttag-chips">' + chipsHtml(false) + "</div>" +
        '<input class="scouttag-note" type="text" autocomplete="off" aria-label="Optional note, demo field" placeholder="Optional note&hellip;" value="' + noteText.replace(/"/g, "&quot;") + '">' +
        '<div class="scouttag-foot">' +
          '<div class="scouttag-coords">' +
            '<span class="scouttag-coords-label">' + (pending ? "point" : "coordinates") + ":</span>" +
            '<span class="scouttag-coords-vals"><b>(' + pos.join(", ") + ")</b></span>" +
          "</div>" +
          '<div class="scouttag-actions-row">' +
            '<button type="button" class="scouttag-arm' + (armed ? " scouttag-arm--on" : "") + '" data-act="arm" data-holo-tap>' +
              (armed ? "Click the spot&hellip;" : '<span class="scouttag-pin">' + PIN_SVG + "</span> Click to tag") +
            "</button>" +
            '<button type="button" class="scouttag-btn" data-act="submit" data-holo-tap>Submit</button>' +
          "</div>" +
        "</div>" +
      "</div>";
    }
    function stripHtml() {
      return '<div class="scouttag-mini">' +
        '<span class="scouttag-mini-grip">' + PIN_SVG + "</span>" +
        chipsHtml(true) +
        '<button type="button" class="scouttag-mini-act' + (armed || tHeld ? " scouttag-mini-act--on" : "") + '" data-act="arm" title="Place point with next click"><span class="scouttag-pin">' + PIN_SVG + "</span></button>" +
        '<button type="button" class="scouttag-mini-act scouttag-mini-submit" data-act="submit" title="Submit tag">&#10003;</button>' +
        '<button type="button" class="scouttag-mini-act" data-act="expand" title="Expand panel">&#9652;</button>' +
        '<button type="button" class="scouttag-mini-act scouttag-mini-close" data-act="close" title="Exit tag mode">&times;</button>' +
        '<span class="scouttag-mini-hand">' + HAND_SVG + "</span>" +
      "</div>";
    }
    function successHtml(tag) {
      return '<div class="scouttag scouttag--success" title="Click to keep scouting">' +
        '<span class="scouttag-success-glyph">' + PIN_SVG + "</span>" +
        '<div class="scouttag-success-title">Tag complete!</div>' +
        '<div class="scouttag-success-pos">(' + tag.pos.join(", ") + ")</div>" +
        '<div class="scouttag-success-hint">' + tag.label + " candidate tagged &middot; click to keep scouting</div>" +
      "</div>";
    }

    function box() { return wrap.firstElementChild; }
    function showFlash(msg, mini) {
      var host = box();
      if (!host) return;
      var old = host.querySelector(".scouttag-flash");
      if (old) old.remove();
      var el = document.createElement("div");
      el.className = "scouttag-flash" + (mini ? " scouttag-flash--mini" : "");
      el.textContent = msg;
      host.appendChild(el);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { el.remove(); }, 1800);
    }

    function render(html) {
      wrap.innerHTML = html;
      var note = wrap.querySelector(".scouttag-note");
      if (note) note.addEventListener("input", function () { noteText = note.value; });
    }
    function updateArmedLook() {
      stage.classList.toggle("scouttag-stage--armed", armed || tHeld);
      wrap.classList.toggle("scouttag-wrap--armed", armed || tHeld);
    }

    /* ---- collapse and expand, the clip-path choreography as shipped ---- */
    function setCollapsed(v) {
      if (v) {
        if (collapsed) return;
        /* the zip triggers at the BOTTOM of the full box and races upward,
           masking the box away beneath it; the strip stands where the light
           finishes */
        var finish = function () {
          var b = box();
          if (b) b.style.clipPath = "";
          collapsed = true;
          render(stripHtml());
        };
        var b0 = box();
        if (!b0) { finish(); return; }
        var total = K.runPanelDraw(wrap, "up", function (frac) {
          var b = box();
          if (!b) return;
          if (frac >= 1) finish();
          else b.style.clipPath = "inset(0 0 " + (frac * 100).toFixed(2) + "% 0)";
        });
        if (!total) finish();
        return;
      }
      collapsed = false;
      render(formHtml());
      revealFormWithBeam();
    }

    /* the beam-draw reveal of the form box, shared by expand-from-strip and
       the return from the success box */
    function revealFormWithBeam() {
      var b = box();
      if (!b) return;
      b.classList.add("scouttag--drawing");
      b.style.clipPath = "inset(0 0 100% 0)";
      var done = function () {
        var bb = box();
        if (bb) {
          bb.style.clipPath = "";
          /* pin animation none inline before the drawing class drops, or
             removing it restarts the materialize from opacity 0, which reads
             as a flash to black after the beam has finished */
          bb.style.animation = "none";
          bb.classList.remove("scouttag--drawing");
        }
      };
      var total = K.runPanelDraw(wrap, "down", function (frac) {
        var bb = box();
        if (!bb) return;
        if (frac >= 1) done();
        else bb.style.clipPath = "inset(0 0 " + ((1 - frac) * 100).toFixed(2) + "% 0)";
      });
      if (!total) done();
    }

    /* closing zips the box up with light instead of vanishing it */
    function closeWithZip() {
      if (closing) return;
      closing = true;
      var finish = function () {
        closing = false;
        hidden = true;
        wrap.innerHTML = "";
        wrap.style.display = "none";
        if (openBtn) openBtn.style.display = "";
      };
      if (!collapsed && box()) {
        var total = K.runPanelDraw(wrap, "up", function (frac) {
          var b = box();
          if (frac >= 1) { finish(); return; }
          if (b) b.style.clipPath = "inset(0 0 " + (frac * 100).toFixed(2) + "% 0)";
        });
        if (!total) finish();
      } else if (box()) {
        K.runPanelZip(box(), "up");
        setTimeout(finish, reduced ? 0 : 330);
      } else {
        finish();
      }
    }

    /* opening flings a burst from the button that coalesces onto the
       arriving panel's border */
    function open(fromX, fromY) {
      hidden = false;
      wrap.style.display = "";
      if (openBtn) openBtn.style.display = "none";
      collapsed = false;
      render(formHtml());
      K.runBurstCoalesce(fromX, fromY, function () {
        return wrap.getBoundingClientRect();
      }, LIGHT_RGB);
    }

    /* ---- placing and submitting ---- */
    function placePoint(px, py, clientX, clientY) {
      pending = coordsAt(px, py);
      pendingScreen = { x: px, y: py };
      marker.style.display = "";
      marker.style.left = px + "px";
      marker.style.top = py + "px";
      K.runParticleBurst(clientX, clientY, LIGHT_RGB);
      armed = false;
      updateArmedLook();
      if (!collapsed && !hidden) { render(formHtml()); showFlash("Point placed, hit Submit"); }
      else if (collapsed) { render(stripHtml()); showFlash("Point placed, hit Submit", true); }
    }
    function submit() {
      if (hidden || closing) return;
      var c = choiceOf(selected);
      var pos = pending || crosshair();
      var label = c.label;
      tags += 1;
      /* Grim's signature on a Cut, right where the point sits */
      if (c.key === "cut" && pendingScreen) {
        var sr = stage.getBoundingClientRect();
        K.runScytheSwing(sr.left + pendingScreen.x, sr.top + pendingScreen.y);
      }
      var sb = wrap.querySelector('[data-act="submit"]');
      var sr2 = sb ? sb.getBoundingClientRect() : wrap.getBoundingClientRect();
      var ox = sr2.left + sr2.width / 2, oy = sr2.top + sr2.height / 2;
      K.runParticleBurst(ox, oy, LIGHT_RGB);
      pending = null;
      pendingScreen = null;
      noteText = "";
      marker.style.display = "none";
      if (collapsed) {
        /* the mini strip has no room for the success box; the flash plus
           the light landing on the strip's border does the job */
        K.runPanelZip(box(), "down");
        showFlash("✓ " + label + " candidate tagged", true);
        bankPlusOne(ox, oy);
        return;
      }
      /* the success box takes the form box's exact footprint so the swap
         reads as one panel changing faces, not two different boxes */
      var fb = box() ? box().getBoundingClientRect() : null;
      var frameless = true, building = true;
      var total = K.runBurstBuild(ox, oy, function () {
        return wrap.getBoundingClientRect();
      }, LIGHT_RGB, function (ph) {
        var b = box();
        if (ph === "beams") { building = false; if (b) b.classList.remove("scouttag--building"); }
        if (ph === "done") { frameless = false; if (b) b.classList.remove("scouttag--frameless"); }
      });
      var swap = function () {
        render(successHtml({ label: label, pos: pos }));
        var b = box();
        if (fb && b) {
          b.style.width = fb.width + "px";
          b.style.minHeight = fb.height + "px";
        }
        if (b && total) {
          if (frameless) b.classList.add("scouttag--frameless");
          if (building) b.classList.add("scouttag--building");
        }
        bankPlusOne(ox, oy);
      };
      var b0 = box();
      if (b0 && !reduced) {
        b0.classList.add("scouttag-out");
        setTimeout(swap, SWAP_MS);
      } else {
        swap();
      }
    }
    function bankPlusOne(x, y) {
      if (profileCount) profileCount.textContent = String(tags);
      K.flyPlusOne(x, y, "+1", "245,209,66", profileBtn);
    }

    /* clicking the success box celebrates, then the beam draws the form
       back into place, no plain pop */
    function dismissSuccess() {
      var b = box();
      if (!b || !b.classList.contains("scouttag--success")) return;
      if (b.classList.contains("scouttag--spinout")) return;
      K.runPanelLap(wrap);
      if (reduced) {
        render(formHtml());
        return;
      }
      b.classList.add("scouttag--spinout");
      setTimeout(function () {
        render(formHtml());
        revealFormWithBeam();
      }, 470);
    }

    /* ---- wiring ---- */
    wrap.addEventListener("click", function (e) {
      var b = box();
      if (b && b.classList.contains("scouttag--success")) { dismissSuccess(); return; }
      var chip = e.target.closest && e.target.closest("[data-choice]");
      if (chip) {
        selected = chip.getAttribute("data-choice");
        wrap.querySelectorAll("[data-choice]").forEach(function (n) {
          n.setAttribute("aria-pressed", String(n === chip));
        });
        /* Other requires a note, and the strip has no note field */
        if (collapsed && selected === "other") setCollapsed(false);
        return;
      }
      var act = e.target.closest && e.target.closest("[data-act]");
      if (!act) return;
      var kind = act.getAttribute("data-act");
      if (kind === "collapse") setCollapsed(true);
      else if (kind === "expand") setCollapsed(false);
      else if (kind === "close") closeWithZip();
      else if (kind === "arm") {
        armed = !armed;
        updateArmedLook();
        if (collapsed) render(stripHtml()); else render(formHtml());
      }
      else if (kind === "submit") submit();
    });

    stage.addEventListener("pointerdown", function (e) {
      if (!(armed || tHeld)) return;
      if (e.target.closest && (e.target.closest(".scouttag-wrap") ||
          e.target.closest(".scouttag-open") || e.target.closest(".scouttag-profile"))) return;
      var r = stage.getBoundingClientRect();
      placePoint(e.clientX - r.left, e.clientY - r.top, e.clientX, e.clientY);
    });

    /* T arms the next click, held or tapped, but only while the pointer is
       over the stage, so the listener never swallows keys for the page */
    var overStage = false;
    stage.addEventListener("pointerenter", function () { overStage = true; });
    stage.addEventListener("pointerleave", function () { overStage = false; });
    window.addEventListener("keydown", function (e) {
      if (!overStage || hidden) return;
      if ((e.key === "t" || e.key === "T") && !e.repeat) { tHeld = true; updateArmedLook(); }
    });
    window.addEventListener("keyup", function (e) {
      if (e.key === "t" || e.key === "T") { tHeld = false; updateArmedLook(); }
    });

    /* drag by the header, the grip or the hand, staying inside the stage */
    var drag = null;
    wrap.addEventListener("pointerdown", function (e) {
      var grip = e.target.closest && (e.target.closest(".scouttag-head") ||
        e.target.closest(".scouttag-mini-grip") || e.target.closest(".scouttag-mini-hand"));
      if (!grip || e.target.closest("button")) return;
      e.preventDefault();
      drag = { x: e.clientX, y: e.clientY,
        left: parseFloat(wrap.style.left) || 0, top: parseFloat(wrap.style.top) || 0 };
    });
    window.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var r = stage.getBoundingClientRect();
      var w = wrap.getBoundingClientRect();
      var nl = Math.max(4, Math.min(r.width - w.width - 4, drag.left + e.clientX - drag.x));
      var nt = Math.max(4, Math.min(r.height - 40, drag.top + e.clientY - drag.y));
      wrap.style.left = nl + "px";
      wrap.style.top = nt + "px";
    });
    window.addEventListener("pointerup", function () { drag = null; });

    if (openBtn) {
      openBtn.style.display = "none";
      openBtn.addEventListener("click", function (e) {
        open(e.clientX, e.clientY);
      });
    }
    render(formHtml());
  }

  function init() {
    document.querySelectorAll("[data-scouttag]").forEach(setup);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
