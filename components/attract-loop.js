/* ---- attract loop (holoattract) -----------------------------------------
   Drives the loop defined in attract-loop.css. Write the bar, point it at a
   deck, and it walks the deck:

     <div class="holoattract"
          data-holoattract-deck="#deck"
          data-holoattract-dwell="9000 9000 8500 7500 9000 13000 9000 13000 15000"
          data-holoattract-sequence="0 1 2 4 5 6 7 8"
          data-holoattract-rail="#rail"
          data-holoattract-watch="#exhibit"
          data-holoattract-idle="45000"
          aria-label="Attract loop"></div>

   Every attribute is optional.

     deck       selector for the .holoattract-deck it drives. With no deck it
                still counts, still emits and still drives a rail, which is
                the case where the host is drawing the content itself.
     dwell      milliseconds per step, indexed by PANEL, not by position in
                the sequence. A step with no number listed gets 9000, which is
                the fallback the wall used.
     sequence   panel indices, in the order the loop visits them. Defaults to
                document order. It exists as its own list because the wall
                skips one of its nine stages, see attract-loop.css.
     rail       selector for a .holobar. The loop writes its step to the rail,
                and takes the rail's step back when a person moves it.
     watch      selector for the element whose interactions count as a person
                being present. Defaults to the whole document, which is right
                for a kiosk and wrong for one demo among many on a page.
     idle       how long after the last interaction the loop starts itself
                again. 0 never resumes on its own. Default 45000.
     toggle     "0" leaves the pause control out. The original hid its manual
                controls behind ?exhibit=1 for the real installation.
     wrap       "0" cuts to the first step instead of fading through a cover.

   Reads back three ways, matching the step rail: a data-step attribute, a
   holoattract:change event, and el.holoattract. State changes report on
   holoattract:state. The step in all three is the position in the sequence,
   one based, and the panel index rides along in the event detail as `index`.
   Those two are not the same number as soon as the sequence skips anything.

   prefers-reduced-motion stops the auto advance completely. Not slows it,
   stops it: a page that moves on by itself and cannot be stopped is a
   problem for more people than the motion is. The counter, the rail and the
   panels all still work, so it degrades to a thing you step through.

   Teardown: every pending timeout is held by role in one object, so destroy
   clears the lot with no bookkeeping to get wrong, and el.holoattract.timers()
   will tell you what is still live. The crossfade and the wrap are timed out
   rather than waited on with transitionend, for the same reason a canvas
   teardown needs a timeout: in a tab that never paints, transitionend never
   arrives and the class would stay on forever. */

(function () {
  "use strict";

  /* the dwell a step with no listed time gets, from the original's fallback */
  var DEFAULT_DWELL = 9000;

  /* the wrap, from the wall. Cover in over 800ms, and the swap back to the
     first step happens the moment it is opaque. Then hold 1100ms while that
     step settles before lifting it. The 1200ms lift is the cover's own
     transition and lives in the stylesheet. */
  var WRAP_IN = 800;
  var WRAP_HOLD = 1100;

  /* must match the panel transition in the stylesheet */
  var CROSSFADE = 700;

  /* How long a touched loop waits before it picks up again. NOT an extracted
     number: the wall had a pause button and no visitors reaching for it, so
     there was nothing to time. 45 seconds is long enough that somebody
     reading a step is not interrupted and short enough that the exhibit is
     never left parked. Set data-holoattract-idle for your own room. */
  var DEFAULT_IDLE = 45000;

  /* what counts as a person. No pointermove: a cursor crossing the screen, or
     a wall with a mouse plugged in and nudged, is not somebody using it.
     Nothing here calls preventDefault or stopPropagation, so a host form
     keeps every key and every click it would otherwise have had. */
  var HUMAN = ["pointerdown", "keydown", "wheel", "touchstart"];

  /* the wall's own two icons, node by node */
  var NS = "http://www.w3.org/2000/svg";
  var PLAY = [["path", {
    d: "M5 3.5v9a.5.5 0 0 0 .77.42l7-4.5a.5.5 0 0 0 0-.84l-7-4.5A.5.5 0 0 0 5 3.5z"
  }]];
  var PAUSE = [
    ["rect", { x: 4, y: 3, width: 3, height: 10, rx: 1 }],
    ["rect", { x: 9, y: 3, width: 3, height: 10, rx: 1 }]
  ];

  var reduce = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  function nums(raw) {
    if (!raw) return [];
    var out = [];
    var parts = String(raw).trim().split(/[\s,]+/);
    for (var i = 0; i < parts.length; i++) {
      var n = parseInt(parts[i], 10);
      if (!isNaN(n)) out.push(n);
    }
    return out;
  }

  /* built node by node rather than through innerHTML, because innerHTML on an
     SVG element is not something to rely on and there is nothing to gain */
  function icon(shapes) {
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 16 16");
    s.setAttribute("fill", "currentColor");
    s.setAttribute("aria-hidden", "true");
    for (var i = 0; i < shapes.length; i++) {
      var node = document.createElementNS(NS, shapes[i][0]);
      var attrs = shapes[i][1];
      for (var key in attrs) node.setAttribute(key, attrs[key]);
      s.appendChild(node);
    }
    return s;
  }

  function create(el) {
    if (el.holoattract) return el.holoattract;

    var deckSel = el.getAttribute("data-holoattract-deck");
    var deck = deckSel ? document.querySelector(deckSel) : null;
    var panels = deck
      ? Array.prototype.slice.call(deck.querySelectorAll(".holoattract-panel"))
      : [];

    var dwell = nums(el.getAttribute("data-holoattract-dwell"));
    var seq = nums(el.getAttribute("data-holoattract-sequence"));
    if (!seq.length) {
      var total = panels.length || dwell.length;
      for (var i = 0; i < total; i++) seq.push(i);
    }
    /* a sequence index with no panel behind it would spend its dwell on a
       blank deck, which looks like the loop has died. Dropped, rather than
       shown, and the count follows because the count is the sequence length. */
    if (panels.length) {
      seq = seq.filter(function (n) { return n >= 0 && n < panels.length; });
    }
    /* nothing to walk. Say nothing and leave the markup alone. */
    if (!seq.length) return null;

    var idleAttr = el.getAttribute("data-holoattract-idle");
    var idleMs = idleAttr === null ? DEFAULT_IDLE : Math.max(0, parseInt(idleAttr, 10) || 0);

    var railSel = el.getAttribute("data-holoattract-rail");
    var rail = railSel ? document.querySelector(railSel) : null;

    var watchSel = el.getAttribute("data-holoattract-watch");
    var watch = (watchSel ? document.querySelector(watchSel) : null) || document;

    var wrapOff = el.getAttribute("data-holoattract-wrap") === "0";
    var wantToggle = el.getAttribute("data-holoattract-toggle") !== "0";

    var pos = 0;         /* position in the sequence, zero based             */
    var paused = false;
    var manual = false;  /* somebody pressed pause. Idle must not undo that. */
    var syncing = false; /* writing to the rail, so ignore its echo          */
    var dead = false;

    /* every pending timeout, by role. One object so destroy cannot miss one. */
    var t = {};

    function at(role, ms, fn) {
      stop(role);
      t[role] = window.setTimeout(function () {
        t[role] = 0;
        if (!dead) fn();
      }, ms);
    }

    function stop(role) {
      if (t[role]) {
        window.clearTimeout(t[role]);
        t[role] = 0;
      }
    }

    function stopAll() {
      for (var role in t) stop(role);
    }

    /* ---- parts ---------------------------------------------------------- */

    el.setAttribute("role", "group");
    if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", "Attract loop");

    /* the live region exists before it has anything to say, so the first
       announcement is an update to a region a screen reader is already
       watching rather than a region appearing with text in it */
    var status = document.createElement("span");
    status.className = "holoattract-status";
    status.setAttribute("aria-live", "polite");
    el.insertBefore(status, el.firstChild);

    var cover = null;
    if (deck && !wrapOff) {
      cover = document.createElement("span");
      cover.className = "holoattract-cover";
      cover.setAttribute("aria-hidden", "true");
      deck.appendChild(cover);
    }

    var toggle = null;
    if (wantToggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "holoattract-toggle";
      el.appendChild(toggle);
      toggle.addEventListener("click", onToggle);
    }

    /* ---- state ---------------------------------------------------------- */

    function mark() {
      el.setAttribute("data-holoattract-state",
        reduce.matches ? "off" : paused ? "paused" : "playing");
      if (!toggle) return;
      var label = paused ? "Resume the loop" : "Pause the loop";
      toggle.setAttribute("aria-label", label);
      toggle.title = label;
      toggle.textContent = "";
      toggle.appendChild(icon(paused ? PLAY : PAUSE));
    }

    function emit(name, detail) {
      el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail }));
    }

    /* the counter. Position in the sequence, not the panel index: with the
       fourth panel skipped, the fourth step is panel 4 and still reads as
       step 4 of 8. Getting this from the index is the off by one. */
    function paint(prev) {
      var index = seq[pos];

      status.textContent = "Stage " + (pos + 1) + " ";
      var rest = document.createElement("s");
      rest.textContent = "of " + seq.length;
      status.appendChild(rest);
      el.setAttribute("data-step", pos + 1);

      for (var k = 0; k < panels.length; k++) {
        panels[k].classList.remove("is-leaving");
        panels[k].classList.toggle("is-current", k === index);
      }
      /* the panel we came from leaves to its own offset, for exactly as long
         as the crossfade lasts. A timer, not transitionend. */
      var out = prev !== null && prev !== index ? panels[prev] : null;
      if (out) {
        out.classList.add("is-leaving");
        at("leave", CROSSFADE, function () { out.classList.remove("is-leaving"); });
      }

      if (rail && rail.holobar) {
        syncing = true;
        try { rail.holobar.step = pos + 1; } finally { syncing = false; }
      }

      emit("holoattract:change", {
        step: pos + 1,
        steps: seq.length,
        index: index,
        panel: panels[index] || null,
        paused: paused
      });
    }

    /* ---- moving --------------------------------------------------------- */

    function go(n, cause) {
      if (dead) return;
      var count = seq.length;
      n = ((n % count) + count) % count;   /* the wall's own wrap around */
      var prev = seq[pos];
      /* A jump lifts the cover, because a person who has just moved the loop
         must not be left looking at it. The loop's own advance does not: the
         cover is on its own 1100ms hold and can be trusted to lift itself,
         and that is only ever in question when a dwell is shorter than the
         hold, which is nothing the wall would ever be configured with. */
      if (cause !== "wrap" && cause !== "auto") unwrap();
      pos = n;
      paint(prev);
      schedule();
    }

    function unwrap() {
      stop("wrapIn");
      stop("wrapOut");
      if (deck) deck.classList.remove("is-wrapping");
    }

    function schedule() {
      stop("advance");
      if (dead || paused || reduce.matches || seq.length < 2) return;

      var ms = dwell[seq[pos]];
      if (typeof ms !== "number") ms = DEFAULT_DWELL;

      if (pos < seq.length - 1) {
        at("advance", ms, function () { go(pos + 1, "auto"); });
        return;
      }
      /* last step. Either cut back to the first or fade through the cover. */
      if (!cover) {
        at("advance", ms, function () { go(0, "auto"); });
        return;
      }
      at("advance", ms, function () {
        deck.classList.add("is-wrapping");
        at("wrapIn", WRAP_IN, function () {
          go(0, "wrap");
          at("wrapOut", WRAP_HOLD, function () {
            deck.classList.remove("is-wrapping");
          });
        });
      });
    }

    /* ---- pausing -------------------------------------------------------- */

    /* Freezing stops the advance and nothing else. Whatever a step is doing
       inside itself keeps doing it, which is how the wall behaves: the 3D
       goes on turning while the loop is held. And there is no part-spent
       dwell to resume. Starting again gives the current step its whole time
       back, because a step somebody has just been looking at deserves to be
       read from the top. */
    function freeze(reason) {
      stop("advance");
      unwrap();
      if (paused) return;
      paused = true;
      mark();
      emit("holoattract:state", { paused: true, reason: reason, step: pos + 1 });
    }

    function thaw(reason) {
      stop("idle");
      manual = false;
      if (!paused) return;
      paused = false;
      mark();
      schedule();
      emit("holoattract:state", { paused: false, reason: reason, step: pos + 1 });
    }

    /* somebody is here. Hold, and push the idle countdown out again. */
    function nudge() {
      if (dead || reduce.matches || manual) return;
      freeze("human");
      if (idleMs > 0) at("idle", idleMs, function () { thaw("idle"); });
      else stop("idle");
    }

    function onHuman(e) {
      /* the pause control is not the audience. Without this, the pointerdown
         on it freezes the loop and the click that follows reads that as
         "paused" and starts it again, so the button does nothing. */
      var target = e.target;
      if (target && target.closest && target.closest(".holoattract-toggle")) return;
      nudge();
    }

    function onToggle() {
      if (paused) { thaw("toggle"); return; }
      manual = true;
      stop("idle");
      freeze("toggle");
    }

    /* the rail, both ways. The loop writes to it in paint, and a person
       dragging it moves the loop. `syncing` is what keeps those two from
       feeding each other, since holobar dispatches synchronously. */
    function onRail(e) {
      if (syncing || dead) return;
      go(e.detail.step - 1, "rail");
    }

    function onReduce() {
      if (reduce.matches) {
        stop("advance");
        stop("idle");
        unwrap();
      }
      mark();
      if (!reduce.matches && !paused) schedule();
    }

    for (var h = 0; h < HUMAN.length; h++) {
      watch.addEventListener(HUMAN[h], onHuman, { passive: true, capture: true });
    }
    if (rail) rail.addEventListener("holobar:change", onRail);
    if (reduce.addEventListener) reduce.addEventListener("change", onReduce);

    function destroy() {
      dead = true;
      stopAll();
      for (var h2 = 0; h2 < HUMAN.length; h2++) {
        watch.removeEventListener(HUMAN[h2], onHuman, { capture: true });
      }
      if (rail) rail.removeEventListener("holobar:change", onRail);
      if (reduce.removeEventListener) reduce.removeEventListener("change", onReduce);
      if (toggle) { toggle.removeEventListener("click", onToggle); toggle.remove(); }
      status.remove();
      if (cover) cover.remove();
      for (var k = 0; k < panels.length; k++) {
        panels[k].classList.remove("is-current");
        panels[k].classList.remove("is-leaving");
      }
      if (deck) deck.classList.remove("is-wrapping");
      el.removeAttribute("data-step");
      el.removeAttribute("data-holoattract-state");
      el.holoattract = null;
    }

    el.holoattract = {
      steps: seq.length,
      sequence: seq.slice(),
      get step() { return pos + 1; },
      set step(n) { go(n - 1, "api"); },
      get index() { return seq[pos]; },
      get paused() { return paused; },
      get reduced() { return !!reduce.matches; },
      /* the dwell of the step it is sitting on, so a host can show it */
      get dwell() {
        var ms = dwell[seq[pos]];
        return typeof ms === "number" ? ms : DEFAULT_DWELL;
      },
      next: function () { go(pos + 1, "api"); },
      prev: function () { go(pos - 1, "api"); },
      pause: function () { manual = true; stop("idle"); freeze("api"); },
      play: function () { thaw("api"); return !reduce.matches; },
      /* which timeouts are live, by role. Here so cleanup can be checked
         rather than assumed. */
      timers: function () {
        var live = [];
        for (var role in t) if (t[role]) live.push(role);
        return live;
      },
      destroy: destroy
    };

    mark();
    paint(null);
    schedule();
    return el.holoattract;
  }

  function init(root) {
    var scope = root || document;
    var bars = scope.querySelectorAll(".holoattract");
    Array.prototype.forEach.call(bars, function (bar) { create(bar); });
  }

  window.holoattract = { init: init, create: create };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(); });
  } else {
    init();
  }
})();
