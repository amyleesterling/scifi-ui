/* ---- holo-timeline: sequences are authored, not hand-timed ------------------
   Ported from human-brain (js/holo-timeline.js), the timeline that replaced
   that site's scattered setTimeout chains: one place to say "over the next
   second these opacities crossfade while the camera glides there, then this
   fires". Shaped like the seek-and-tween core of GSAP, small enough to read
   in one sitting, no dependency. Carried whole, with its two rules intact:

   - Reduced motion collapses the whole timeline to its final state in one
     step, so a sequence must be authored with its end state as the truth
     and the motion as presentation only.
   - Nothing renders by itself: the caller passes onTick (upstream, a panel
     render loop's once()), so a stopped render loop still shows every frame
     of a playing timeline and shows nothing when idle.

   API, as upstream: timeline({onTick, onDone}) returns tl with
     .to(obj, props, {at, dur, ease, onUpdate})  tween numeric properties;
        start values read when the tween first runs, so tweens sequence
     .drive(fn, {at, dur, ease})   eased 0..1 for uniforms, colours, DOM
     .call(fn, at)                 fire once at a point in time
     .wait(d)                      a pure gap
     .play() .seek(t) .stop() .duration()

   One deviation: upstream is an ES module; this repo has no build step, so
   the export becomes window.holoTimeline. */
(function () {
  "use strict";

  var EASES = {
    linear: function (t) { return t; },
    in: function (t) { return t * t * t; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOut: function (t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
  };

  var REDUCED = window.matchMedia
    ? matchMedia("(prefers-reduced-motion: reduce)").matches : false;

  function timeline(opts) {
    opts = opts || {};
    var items = [];
    var dur = 0, raf = 0, t0 = 0, playing = false;

    function span(o, fallback) {
      var at = o.at == null ? dur : o.at;
      var d = o.dur == null ? fallback : o.dur;
      dur = Math.max(dur, at + d);
      return { at: at, d: d };
    }

    var tl = {
      to: function (obj, props, o) {
        o = o || {};
        var s = span(o, 0.6);
        var ease = EASES[o.ease] || EASES.inOut;
        var from = null;
        items.push({ at: s.at, d: s.d, apply: function (k) {
          if (!from) {
            from = {};
            for (var p in props) from[p] = obj[p];
          }
          var e = ease(k);
          for (var q in props) obj[q] = from[q] + (props[q] - from[q]) * e;
          if (o.onUpdate) o.onUpdate(e);
        } });
        return tl;
      },
      drive: function (fn, o) {
        o = o || {};
        var s = span(o, 0.6);
        var ease = EASES[o.ease] || EASES.inOut;
        items.push({ at: s.at, d: s.d, apply: function (k) { fn(ease(k)); } });
        return tl;
      },
      call: function (fn, at) {
        var p = at == null ? dur : at;
        dur = Math.max(dur, p);
        items.push({ at: p, d: 0, fire: fn, fired: false });
        return tl;
      },
      wait: function (d) { dur += d; return tl; },
      duration: function () { return dur; },

      play: function () {
        tl.stop();
        if (REDUCED) {
          tl.seek(dur);
          if (opts.onDone) opts.onDone();
          return tl;
        }
        playing = true;
        t0 = performance.now() / 1000;
        function step() {
          if (!playing) return;
          var t = performance.now() / 1000 - t0;
          tl.seek(t);
          if (t >= dur) {
            playing = false;
            if (opts.onDone) opts.onDone();
            return;
          }
          raf = requestAnimationFrame(step);
        }
        raf = requestAnimationFrame(step);
        return tl;
      },
      seek: function (t) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (it.fire) {
            if (!it.fired && t >= it.at) { it.fired = true; it.fire(); }
          } else if (t >= it.at) {
            it.apply(Math.min(1, it.d ? (t - it.at) / it.d : 1));
          }
        }
        if (opts.onTick) opts.onTick();
        return tl;
      },
      stop: function () {
        playing = false;
        cancelAnimationFrame(raf);
        raf = 0;
        return tl;
      }
    };
    return tl;
  }

  window.holoTimeline = timeline;
})();
