/* ---- achievement toast (holotoast) --------------------------------------
   Drives the toast defined in achievement-toast.css.

     holotoast({
       tone: "quest",                       // quest badge streak cells edits
       title: "Daily quests complete",
       sub: "All three done. You are a neuroscience hero.",
       icon: "\u{1F9E0}",                   // emoji, or { src: "badge.png" }
       duration: 5000                       // 0 keeps it until dismissed
     });

   Returns a handle with .dismiss().

   The live region is created as soon as this file runs, before any toast
   exists. A live region inserted at the same moment as its first message is
   not reliably announced, so the empty container has to be there first.

   The timer is a setTimeout with its own remaining time accounting rather
   than a frame loop, so it survives a tab that never paints and it can be
   paused and resumed. Pointer over the card, or keyboard focus inside it,
   pauses both the timer and the countdown rail.

   Nothing here uses requestAnimationFrame. The entrance is a CSS animation
   that starts when the element is inserted, so a document that never gets a
   frame still ends up with the card in its resting state rather than stuck
   at opacity 0. */

(function () {
  "use strict";

  var MAX = 4;          /* a stack taller than this is a wall, not a notice */
  var LEAVE = 250;      /* matches holotoast-out                            */
  var TONES = { quest: 1, badge: 1, streak: 1, cells: 1, edits: 1 };

  var region = null;

  function ensureRegion() {
    if (region && region.isConnected) return region;
    region = document.querySelector(".holotoast-region");
    if (!region) {
      region = document.createElement("div");
      region.className = "holotoast-region";
      /* polite so a toast waits for the screen reader to finish its sentence.
         atomic false so a second toast does not re read the first one. */
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-atomic", "false");
      document.body.appendChild(region);
    }
    return region;
  }

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function holotoast(opts) {
    opts = opts || {};
    var host = ensureRegion();
    var duration = opts.duration === undefined ? 5000 : Number(opts.duration);
    var tone = TONES[opts.tone] ? opts.tone : "edits";

    var card = el("div", "holotoast holotoast--" + tone);
    card.style.setProperty("--holotoast-duration", duration + "ms");

    /* sparkles and glint are ornament, so they are hidden from the reader */
    var sparks = el("div", "holotoast-sparks");
    sparks.setAttribute("aria-hidden", "true");
    for (var s = 1; s <= 6; s++) {
      var sp = el("i");
      sp.style.setProperty("--i", s);
      sparks.appendChild(sp);
    }
    card.appendChild(sparks);

    var iconWrap = el("div", "holotoast-icon");
    iconWrap.setAttribute("aria-hidden", "true");
    if (opts.icon && opts.icon.src) {
      var img = document.createElement("img");
      img.alt = "";
      /* a badge image that fails to load hides itself, so the tinted tile
         behind it shows through and the card never looks broken */
      img.addEventListener("error", function () { this.style.display = "none"; });
      img.src = opts.icon.src;
      iconWrap.appendChild(img);
    } else if (opts.icon) {
      var em = el("span", "holotoast-emoji");
      em.textContent = opts.icon;
      iconWrap.appendChild(em);
    }
    card.appendChild(iconWrap);

    var text = el("div", "holotoast-text");
    var title = el("p", "holotoast-title");
    title.textContent = opts.title || "";
    text.appendChild(title);
    if (opts.sub) {
      var sub = el("p", "holotoast-sub");
      sub.textContent = opts.sub;
      text.appendChild(sub);
    }
    card.appendChild(text);

    var close = el("button", "holotoast-close");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss notification");
    close.textContent = "×";
    card.appendChild(close);

    if (duration > 0) {
      var rail = el("div", "holotoast-rail");
      rail.setAttribute("aria-hidden", "true");
      rail.appendChild(el("i"));
      card.appendChild(rail);
    }

    /* ---- timer ---------------------------------------------------------- */
    var timer = 0;
    var remaining = duration;
    var startedAt = 0;
    var gone = false;

    function run() {
      if (duration <= 0 || gone) return;
      startedAt = Date.now();
      timer = window.setTimeout(dismiss, Math.max(0, remaining));
    }

    function pause() {
      if (!timer || gone) return;
      window.clearTimeout(timer);
      timer = 0;
      remaining -= Date.now() - startedAt;
      card.classList.add("is-paused");
    }

    function resume() {
      if (timer || gone || duration <= 0) return;
      card.classList.remove("is-paused");
      run();
    }

    function dismiss() {
      if (gone) return;
      gone = true;
      if (timer) { window.clearTimeout(timer); timer = 0; }
      card.classList.add("is-leaving");
      window.setTimeout(function () { card.remove(); }, LEAVE);
    }

    close.addEventListener("click", dismiss);
    /* hover pauses. So does keyboard focus, which is the same rule the rest
       of this library follows: whatever :hover does, :focus-within does.
       On touch a tap does it, through hologram-tap.js. The card holds until
       the reader taps somewhere else, which is the only version of "the
       pointer is resting on this" a finger can express. The timer is paused
       on the same signal the stylesheet pauses the rail on, because a rail
       that stops while the countdown it reports carries on is a lie. */
    /* a touch fires pointerenter and then pointerleave around the tap itself,
       and the leave arrives after the tap has been counted, so a plain resume
       on leave would undo the hold a moment after taking it. While the card is
       the activated one, leaving is not a release. */
    function release() {
      if (card.classList.contains("holo-on")) return;
      resume();
    }

    card.addEventListener("pointerenter", pause);
    card.addEventListener("pointerleave", release);
    card.addEventListener("focusin", pause);
    card.addEventListener("focusout", release);
    card.addEventListener("holotap:on", pause);
    card.addEventListener("holotap:off", resume);

    host.appendChild(card);

    /* cap the stack from the top, so the newest is always the one on screen */
    var live = host.querySelectorAll(".holotoast:not(.is-leaving)");
    for (var k = 0; k < live.length - MAX; k++) {
      if (live[k].holotoastDismiss) live[k].holotoastDismiss();
    }

    card.holotoastDismiss = dismiss;
    run();

    return { el: card, dismiss: dismiss };
  }

  holotoast.region = ensureRegion;

  window.holotoast = holotoast;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { ensureRegion(); });
  } else {
    ensureRegion();
  }
})();
