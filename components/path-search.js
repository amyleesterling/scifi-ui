/* ---- path search (holoPathSearch) -----------------------------------------
   Ported from ng-extend (branch eyewire-ii-community), src/find_path_status.ts:
   startLoader(). It is the loading state EyeWire II shows while the server
   traces a path through a neuron between two points: in the Find Path status
   line, and at the foot of the Highlight box. Every number below is the
   shipped one.

     var search = holoPathSearch(canvas, { width: 190, height: 24 });
     search.finish(function () { ... });   // end on the surge, then call back
     search.stop();                        // stop now, no finish

   What it draws. A source dot on the left, a target dot on the right, and
   seven explorers that leave the source together. Each takes a small step
   every frame on a biased random walk: its heading is pulled 8 percent of
   the way toward the target, then knocked by a random turn of up to 0.45
   radians either way, and it moves 1.25 px. They bounce off the top, the
   bottom and the left edge. Each leaves a violet trail, and the canvas is
   never cleared: every frame erases 9 percent of what is there, so trails
   linger and dissolve rather than vanish.

   The first explorer within 5 px of the target wins. Its whole route, the
   path it actually wandered, is redrawn as one bright line over 350ms, holds,
   fades, and at 950ms the search starts again. A search that has wandered
   900 steps without arriving also starts again. So it loops while it waits,
   and no two runs draw the same thing: the routes are the random walk.

   It is the stepped leader of a lightning strike. The leader feels its way
   out in short random steps, and the channel that connects first carries the
   bright return stroke.

   The finish. A wait that ends should say so. finish(done) carries the
   explorer nearest the target the rest of the way (2.2 px steps, heading
   straight at it with up to 0.55 radians of wobble) and plays one 1.5s
   sequence on that route:

     0    to 260ms    strike: the route snaps across, violet white
     260  to 1150ms   surge: two jittered ghosts of the route (3.2 and 5 px
                      of jitter, flickering between 35 and 85 percent) and
                      two white sparks a frame, 3 to 9 px long, off random
                      points on it. Over the first 450ms of the surge the
                      colour runs from violet white (235 220 255) to success
                      green (124 255 178), the target dot turns green and
                      grows from 3 to 3.6 px, and a ring opens out of the
                      target from 3 to 13 px over 520ms, fading as it goes
     1150 to 1500ms   the route fades, the canvas clears, done() is called

   During the finish each frame erases 26 percent instead of 9. The ghosts
   are redrawn every frame, and at the slow erase they pile into a solid
   blob within a few frames.

   It does not show progress. Nothing on the canvas comes from the request
   it stands in for. Do not present it as a live view of the work.

   Reduced motion: the explorers never move. The canvas shows the two dots,
   and finish() calls done() straight away. Put the state in words beside it.

   Deviations from the source, and why:
   - The source takes a caller owned { raf, timer } record and writes finish
     onto it. Here the function returns { finish, stop }: a library call
     should hand back its own controls.
   - stop() is new. The source's callers cancel the frame themselves.
   - The size is an options object with the shipped default (190 by 24, the
     Find Path line). The Highlight box calls it at 136 by 26. */
(function () {
  "use strict";

  function holoPathSearch(cv, opts) {
    opts = opts || {};
    var W = opts.width || 190, H = opts.height || 24;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + "px"; cv.style.height = H + "px";
    var ctx = cv.getContext("2d");
    var raf = 0, stopped = false;
    var api = {
      finish: function (done) { if (done) done(); },
      stop: function () { stopped = true; cancelAnimationFrame(raf); }
    };
    if (!ctx) return api;
    ctx.scale(dpr, dpr);

    var S = { x: 9, y: H / 2 }, T = { x: W - 9, y: H / 2 };
    var walkers = [];
    var found = null, foundAt = 0;
    var ending = null;
    function reset() {
      walkers = [];
      for (var i = 0; i < 7; i++) {
        walkers.push({ x: S.x, y: S.y, a: (Math.random() - 0.5) * 2.4, pts: [S.x, S.y] });
      }
      found = null;
    }
    reset();
    var reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

    function dot(x, y, c, r) {
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }

    function frame(now) {
      if (stopped) return;
      /* Fade old trails rather than clearing, so paths linger then dissolve.
         During the finish the jittered ghosts must die fast, or they pile
         into a blob. */
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0," + (ending ? 0.26 : found ? 0.04 : 0.09) + ")";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";

      var i, w, n, k;
      if (!found && !reduce) {
        for (i = 0; i < walkers.length; i++) {
          w = walkers[i];
          var toT = Math.atan2(T.y - w.y, T.x - w.x);
          /* Steer toward the target with jitter, bounce off the edges. */
          var d = toT - w.a; d = Math.atan2(Math.sin(d), Math.cos(d));
          w.a += d * 0.08 + (Math.random() - 0.5) * 0.9;
          var px = w.x, py = w.y;
          w.x += Math.cos(w.a) * 1.25; w.y += Math.sin(w.a) * 1.25;
          if (w.y < 2 || w.y > H - 2) { w.a = -w.a; w.y = Math.max(2, Math.min(H - 2, w.y)); }
          if (w.x < 2) { w.a = Math.PI - w.a; w.x = 2; }
          w.pts.push(w.x, w.y);
          ctx.strokeStyle = "rgba(200,164,255,0.55)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(w.x, w.y); ctx.stroke();
          if (Math.hypot(T.x - w.x, T.y - w.y) < 5) { found = w.pts; foundAt = now; break; }
        }
        /* A search that wandered too long starts over. */
        if (!found && walkers[0].pts.length > 900) reset();
      }

      if (found && ending) {
        var t = now - foundAt;
        var STRIKE = 260, SURGE = 1150, END = 1500;
        k = Math.min(1, t / STRIKE);
        n = Math.max(2, Math.floor((found.length / 2) * k));
        var g = Math.max(0, Math.min(1, (t - STRIKE) / 450));   /* violet to green */
        var fade = t > SURGE ? 1 - (t - SURGE) / (END - SURGE) : 1;
        var rgb = Math.round(235 - 111 * g) + "," + Math.round(220 + 35 * g) + "," + Math.round(255 - 77 * g);
        var stroke = function (jitter, width, alpha, blur) {
          ctx.strokeStyle = "rgba(" + rgb + "," + (alpha * fade) + ")";
          ctx.lineWidth = width; ctx.shadowColor = "rgb(" + rgb + ")"; ctx.shadowBlur = blur;
          ctx.beginPath();
          for (var j = 0; j < n; j++) {
            var x = found[j * 2] + (jitter ? (Math.random() - 0.5) * jitter : 0);
            var y = found[j * 2 + 1] + (jitter ? (Math.random() - 0.5) * jitter : 0);
            if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.stroke(); ctx.shadowBlur = 0;
        };
        stroke(0, 1.8, 0.95, 10);
        if (t > STRIKE && t < SURGE) {
          /* Voltage: jittered ghosts of the route, and sparks off it. */
          var flick = 0.35 + Math.random() * 0.5;
          stroke(3.2, 1, flick, 6);
          stroke(5, 0.7, flick * 0.6, 4);
          for (var s = 0; s < 2; s++) {
            var q = Math.floor(Math.random() * (found.length / 2));
            var sx = found[q * 2], sy = found[q * 2 + 1];
            var a = Math.random() * Math.PI * 2, len = 3 + Math.random() * 6;
            ctx.strokeStyle = "rgba(255,255,255," + (0.75 * fade) + ")"; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(sx, sy);
            ctx.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); ctx.stroke();
          }
        }
        if (t > STRIKE) {
          /* The target answers: a ring opens out from it. */
          var r = Math.min(1, (t - STRIKE) / 520);
          ctx.strokeStyle = "rgba(124,255,178," + ((1 - r) * 0.9) + ")"; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(T.x, T.y, 3 + r * 10, 0, Math.PI * 2); ctx.stroke();
        }
        dot(S.x, S.y, "#7cffb2", 3);
        dot(T.x, T.y, t > STRIKE ? "#7cffb2" : "#ff8fcf", t > STRIKE ? 3.6 : 3);
        if (t > END) {
          var done = ending; ending = null;
          ctx.clearRect(0, 0, W, H);
          done();
          return;
        }
        raf = requestAnimationFrame(frame);
        return;
      }

      if (found) {
        /* The winning route lights up, then the search restarts. */
        k = Math.min(1, (now - foundAt) / 350);
        ctx.strokeStyle = "rgba(235,220,255," + (0.9 * (1 - Math.max(0, (now - foundAt - 500) / 400))) + ")";
        ctx.lineWidth = 1.6; ctx.shadowColor = "#c8a4ff"; ctx.shadowBlur = 8;
        ctx.beginPath();
        n = Math.floor((found.length / 2) * k);
        for (i = 0; i < n; i++) {
          if (i) ctx.lineTo(found[i * 2], found[i * 2 + 1]); else ctx.moveTo(found[0], found[1]);
        }
        ctx.stroke(); ctx.shadowBlur = 0;
        if (now - foundAt > 950) { ctx.clearRect(0, 0, W, H); reset(); }
      }
      dot(S.x, S.y, "#6fe0a0", 3);
      dot(T.x, T.y, "#ff8fcf", 3);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    api.finish = function (done) {
      done = done || function () {};
      if (stopped || reduce) { done(); return; }
      ending = done;
      /* A route already lighting up becomes the finish, from its first frame. */
      if (found) { foundAt = performance.now(); return; }
      /* The explorer nearest the target wins; its route is carried the rest
         of the way there and lit. */
      var best = walkers[0];
      for (var i = 0; i < walkers.length; i++) {
        var w = walkers[i];
        if (Math.hypot(T.x - w.x, T.y - w.y) < Math.hypot(T.x - best.x, T.y - best.y)) best = w;
      }
      var pts = best.pts.slice();
      var x = best.x, y = best.y;
      for (var s = 0; s < 400 && Math.hypot(T.x - x, T.y - y) > 3; s++) {
        var a = Math.atan2(T.y - y, T.x - x) + (Math.random() - 0.5) * 1.1;
        x += Math.cos(a) * 2.2; y = Math.max(2, Math.min(H - 2, y + Math.sin(a) * 2.2));
        pts.push(x, y);
      }
      pts.push(T.x, T.y);
      found = pts;
      foundAt = performance.now();
    };
    return api;
  }

  window.holoPathSearch = holoPathSearch;
})();
