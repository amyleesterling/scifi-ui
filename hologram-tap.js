// scifi-ui tap activation  ...  see README.md
//
// One file, one mechanism, for the whole library. A hover treatment on a device
// with no pointer to hover with is a treatment nobody can reach, so a tap on
// anything that carries one puts the class holo-on on it and every :hover rule
// in this library names holo-on as a second selector. Nothing is per component.
//
// The rules it works to:
//
//   One at a time.        Tapping a second thing releases the first. Tapping
//                         nothing in particular releases everything.
//   Never swallow a tap.  A tap that landed on a real link or button belongs to
//                         that control. preventDefault is never called here, on
//                         any path, and a tap on a control is not turned into an
//                         activation at all.
//   Leave a mouse alone.  A pointer that can hover gets nothing from this file.
//                         The gate is the pointer that produced the event plus
//                         the hover media query, so touch on a laptop with a
//                         trackpad works and a mouse on a touchscreen does not
//                         end up with a card stuck in its hover state.
//   A drag is not a tap.  Movement past a few pixels, or a long press, or a
//                         scroll, and nothing activates. This is why it is on
//                         pointerdown and pointerup rather than touchstart.
//
// It also fires holotap:on and holotap:off on the element, bubbling, so a
// component whose hover state is more than a stylesheet can hook the same
// signal. detail carries clientX, clientY and pointerType. The particle trace
// uses it to strike its light at the tap point, and the achievement toast uses
// it to hold the real timer while the rail it draws is held.
//
// Load it on any page that loads any part of this library. It costs four
// listeners on the document and does nothing at all until a tap arrives.
(function () {
  "use strict";

  var CLASS = "holo-on";

  // The things that own a hover treatment and are not themselves controls.
  // A control is left out on purpose: it already answers to :active and
  // :focus-visible, and a button left sitting in its hover state after a tap
  // reads as a stuck toggle rather than as feedback. Add your own to the list
  // with data-holo-tap on the element.
  var HOSTS = ".holoframe, .holo, .holoboot, .holounder, .holosweep, " +
              ".holocard, .holobar, .holotint, .holotoast, [data-holo-tap]";

  // What counts as a real control. A media element is deliberately not one: it
  // is a surface rather than a button, it is usually the whole inside of the
  // frame that carries the treatment, and lighting the frame cannot interfere
  // with its native controls when nothing here is prevented.
  var CONTROLS = "a[href], button, input, select, textarea, summary, label, " +
                 "[tabindex], [role=\"button\"], [role=\"link\"], " +
                 "[contenteditable=\"\"], [contenteditable=\"true\"]";

  var SLOP = 10;    // px of travel still counted as a tap
  var HOLD = 700;   // ms after which a press is a press, not a tap

  var active = null;   // the one element currently carrying the class
  var down = null;     // where and when the current press started

  function now() {
    return window.performance ? performance.now() : Date.now();
  }

  // read live rather than once, because a media query result can change under
  // you when a pointer is plugged in or a device is docked
  function noHover() {
    return !!window.matchMedia && matchMedia("(hover: none)").matches;
  }

  function fire(el, name, ev) {
    el.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      detail: ev ? {
        clientX: ev.clientX, clientY: ev.clientY, pointerType: ev.pointerType
      } : null
    }));
  }

  function clear() {
    if (!active) return;
    var el = active;
    active = null;
    el.classList.remove(CLASS);
    fire(el, "holotap:off", null);
  }

  function set(el, ev) {
    // a re-tap of the thing already lit does not relight it or disturb the one
    // at a time rule, but it does re-fire the signal. That is what lets an
    // effect whose whole point is a replay, the boot, the underline, the trace,
    // play again on every tap rather than only on the first one that lit it.
    if (el === active) { fire(el, "holotap:on", ev); return; }
    clear();
    active = el;
    el.classList.add(CLASS);
    fire(el, "holotap:on", ev);
  }

  function commit(target, ev) {
    if (!target || target.nodeType !== 1 || !target.closest) return;

    // a tap on a control is that control's tap and nothing else. The one thing
    // it does here is leave the host it sits inside alone: a tap on the link in
    // a card should not put the card's own effect out.
    if (target.closest(CONTROLS)) {
      if (!(active && active.contains(target))) clear();
      return;
    }

    var host = target.closest(HOSTS);
    if (host) set(host, ev);
    else clear();
  }

  addEventListener("pointerdown", function (e) {
    down = null;
    if (!e.isPrimary) return;
    // a mouse that can hover is already served. A mouse on a device whose
    // primary pointer cannot hover is not, so the query decides rather than
    // the pointer type alone.
    if (e.pointerType === "mouse" && (e.button !== 0 || !noHover())) return;
    down = { x: e.clientX, y: e.clientY, t: now(), target: e.target };
  }, true);

  addEventListener("pointerup", function (e) {
    var d = down;
    down = null;
    if (!d || !e.isPrimary) return;
    if (Math.abs(e.clientX - d.x) > SLOP) return;
    if (Math.abs(e.clientY - d.y) > SLOP) return;
    if (now() - d.t > HOLD) return;
    commit(d.target, e);
  }, true);

  // a touch that turns into a scroll or a gesture is cancelled rather than
  // released, and some browsers keep sending it to a captured element instead,
  // so the press is dropped on either signal
  addEventListener("pointercancel", function () { down = null; }, true);
  addEventListener("scroll", function () { down = null; },
    { passive: true, capture: true });

  // keyboard and pointer should not both look active at once. Moving focus
  // outside whatever is lit puts it out, and Escape puts it out from anywhere.
  addEventListener("focusin", function (e) {
    if (active && !active.contains(e.target)) clear();
  }, true);

  addEventListener("keydown", function (e) {
    if (e.key === "Escape") clear();
  });

  // a host page may want to release it, or ask what is lit
  window.holotap = {
    clear: clear,
    get element() { return active; },
    className: CLASS,
    hosts: HOSTS
  };
})();
