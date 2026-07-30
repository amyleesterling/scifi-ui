/* ---- measured data readout (holoreadout) ---------------------------------
   Pairs with data-readout.css. See that file for the unit bug this component
   exists to stop you repeating.

     holoReadout(el, {
       stats: [
         { value: 38, label: "cells" },
         { value: 481, unit: "µm", label: "of cortex" },
       ],
       histogram: { values: [8, 6, 8, 10, 1, 1], colour: (i, n) => "#8E46C0" },
       caption: "34 somata by depth",
       provenance: "CAVE · minnie65_phase3_v1 · mat 1853",
     });

   Everything is derived from `values` at render time. That is the whole point:
   a readout that is typed into the markup is a caption wearing a HUD costume,
   and it goes stale the first time the data behind it moves.

   `caption` and `provenance` are HTML, so a caption can carry marked up
   figures. Build those with holoReadout.value(), which puts the unit in the
   opt-out span for you:

     caption: holoReadout.value(34) + " somata, " +
              holoReadout.value(429) + " to " + holoReadout.value(910, "µm") +
              " below the pia"

   Both are author supplied strings and are written straight into innerHTML.
   Do not pass anything a stranger typed. */

(function (root) {
  "use strict";

  function fmt(n, dp) {
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: dp || 0,
      maximumFractionDigits: dp == null ? 0 : dp,
    });
  }

  /* A number, and optionally its unit in the span that opts out of the
     uppercase transform. Never concatenate a raw unit into an uppercased
     label: see the note at the top of data-readout.css. */
  function value(n, unit, dp) {
    var out = "<b>" + fmt(n, dp) + "</b>";
    if (unit) out += ' <span class="holoreadout-u">' + unit + "</span>";
    return out;
  }

  function holoReadout(el, opts) {
    if (!el) return null;
    opts = opts || {};
    el.classList.add("holoreadout");
    var html = "";

    if (opts.stats && opts.stats.length) {
      html += '<p class="holoreadout-stats">' + opts.stats.map(function (s) {
        return "<span>" + value(s.value, s.unit, s.dp) +
               (s.label ? " " + s.label : "") + "</span>";
      }).join("") + "</p>";
    }

    var h = opts.histogram;
    if (h && h.values && h.values.length) {
      var vals = h.values;
      var top = Math.max.apply(null, vals) || 1;
      /* An empty bin still gets its 1px seat from the stylesheet and is only
         dimmed, because a gap in a distribution is information. A bin that is
         simply absent and a bin that measured zero must not look the same. */
      html += '<div class="holoreadout-hist" role="img" aria-label="' +
        (h.label || (vals.length + " bins, tallest " + fmt(top))) + '">' +
        vals.map(function (v, i) {
          var col = h.colour ? h.colour(i, vals.length, v)
                  : (h.colours ? h.colours[i] : "");
          return '<span class="holoreadout-bar"' +
            (h.binLabel ? ' tabindex="0" title="' + h.binLabel(i, v) +
                          '" aria-label="' + h.binLabel(i, v) + '"' : "") +
            ' style="height:' + (v / top * 100).toFixed(1) + "%" +
            (col ? ";background:" + col : "") +
            ";opacity:" + (v ? 0.92 : 0.16) + '"></span>';
        }).join("") + "</div>";
    }

    if (opts.caption) {
      html += '<p class="holoreadout-cap">' + opts.caption + "</p>";
    }
    if (opts.provenance) {
      html += '<p class="holoreadout-prov">' + opts.provenance + "</p>";
    }

    el.innerHTML = html;
    /* the bars are the only hover state here, so this is all the tap wiring
       the component needs; hologram-tap.js does the rest */
    if (h && h.binLabel) el.setAttribute("data-holo-tap", "");
    return el;
  }

  holoReadout.value = value;
  holoReadout.fmt = fmt;

  root.holoReadout = holoReadout;
})(window);
