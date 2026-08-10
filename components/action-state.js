/* ---- the whole button lifecycle (holoaction) ------------------------------
   Pairs with action-state.css.

     var send = holoAction(buttonEl, {
       label: "Send",
       busyLabel: "Sending",
       doneLabel: "Sent",
       failLabel: "Did not send",
       run: function () { return somePromise; },   // optional
     });

     send.start(); send.succeed(); send.fail(); send.reset();

   Three models, each doing the job it suits:

     press    a damped spring on a 0 to 1 value, released with velocity
     sending  a wrapped gaussian packet crossing the fill
     failure  the same spring integrator with the damping dropped, so it rings

   Visual component only. Nothing here submits anything, there is no form and
   no named field. Pass `run` and the component will drive its own states from
   your promise, or call the state methods yourself.

   Returns a handle with .start(), .succeed(), .fail(), .reset(), .destroy().
--------------------------------------------------------------------------- */
(function (global) {
  "use strict";

  var reduced = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)");

  /* wrapped gaussian: the packet has a definite centre and a soft head and
     tail, which a gradient can only approximate */
  function packet(phase, x, sigma) {
    var d = phase - x;
    d -= Math.floor(d);
    var dd = Math.min(d, 1 - d);
    return Math.exp(-(dd * dd) / (2 * sigma * sigma));
  }

  var CHECK = "M2 8.2 L6 12 L13 3.4";
  var CROSS = "M3 3 L12 12 M12 3 L3 12";

  function holoAction(btn, opts) {
    opts = opts || {};
    if (!btn) return null;

    var labels = {
      idle: opts.label || btn.textContent.trim() || "Send",
      busy: opts.busyLabel || "Working",
      done: opts.doneLabel || "Done",
      fail: opts.failLabel || "Did not send",
    };

    btn.classList.add("holoaction");
    btn.setAttribute("type", btn.getAttribute("type") || "button");
    btn.setAttribute("data-holo-tap", "");
    btn.innerHTML =
      '<span class="holoaction-wave"><canvas></canvas></span>' +
      '<span class="holoaction-mark" aria-hidden="true">' +
        '<svg viewBox="0 0 15 15"><path d=""></path></svg>' +
      '</span>' +
      '<span class="holoaction-label"></span>' +
      '<span class="holoaction-status" role="status" aria-live="polite"></span>';

    var labelEl = btn.querySelector(".holoaction-label");
    var markPath = btn.querySelector(".holoaction-mark path");
    var mark = btn.querySelector(".holoaction-mark");
    var status = btn.querySelector(".holoaction-status");
    var cv = btn.querySelector("canvas");
    var ctx = cv.getContext("2d");

    labelEl.textContent = labels.idle;

    var state = "idle";
    var phase = 0, waveRaf = 0, waveLast = 0;

    /* ---- the packet, only while genuinely busy ------------------------- */
    function paintWave() {
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var r = cv.getBoundingClientRect();
      var W = Math.max(1, Math.round(r.width * dpr));
      var H = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      ctx.clearRect(0, 0, W, H);
      var tint = getComputedStyle(btn).getPropertyValue("--holoaction-tint").trim().replace(/\s+/g, ",") || "178,216,248";
      var step = Math.max(1, Math.floor(dpr));
      for (var x = 0; x < W; x += step) {
        var a = packet(phase, x / W, 0.09);
        if (a < 0.004) continue;
        ctx.fillStyle = "rgba(" + tint + "," + (a * 0.5).toFixed(3) + ")";
        ctx.fillRect(x, 0, step, H);
      }
    }
    function waveFrame(now) {
      if (!waveLast) waveLast = now;
      var dt = Math.min((now - waveLast) / 1000, 0.05);
      waveLast = now;
      phase = (phase + dt * 0.75) % 1;
      paintWave();
      waveRaf = global.requestAnimationFrame(waveFrame);
    }
    function startWave() {
      if (waveRaf || (reduced && reduced.matches)) return;
      waveLast = 0;
      waveRaf = global.requestAnimationFrame(waveFrame);
    }
    function stopWave() {
      if (waveRaf) global.cancelAnimationFrame(waveRaf);
      waveRaf = 0;
      ctx.clearRect(0, 0, cv.width, cv.height);
    }

    /* ---- one spring integrator, reused for press, mark and ring --------
       Different stiffness and damping give the three behaviours, so there is
       one piece of physics in the file rather than three sets of keyframes. */
    function spring(apply, opts2) {
      var x = opts2.from, v = opts2.v0 || 0, target = opts2.to;
      var k = opts2.k, c = opts2.c, raf = 0, backstop = 0, last = 0;
      function frame(now) {
        if (!last) last = now;
        var dt = Math.min((now - last) / 1000, 1 / 30);
        last = now;
        var h = dt / 3;
        for (var i = 0; i < 3; i++) {
          var a = -k * (x - target) - c * v;
          v += a * h; x += v * h;
        }
        apply(x);
        if (Math.abs(x - target) < 0.001 && Math.abs(v) < 0.001) {
          apply(target);
          global.clearTimeout(backstop);
          return;
        }
        raf = global.requestAnimationFrame(frame);
      }
      if (reduced && reduced.matches) { apply(target); return { stop: function () {} }; }
      raf = global.requestAnimationFrame(frame);
      /* teardown backstop, per AGENTS.md section 4 */
      backstop = global.setTimeout(function () {
        if (raf) global.cancelAnimationFrame(raf);
        apply(target);
      }, 4000);
      return { stop: function () { if (raf) global.cancelAnimationFrame(raf); global.clearTimeout(backstop); } };
    }

    var running = [];
    function run(s) { running.push(s); return s; }
    function stopAll() { running.forEach(function (s) { s.stop(); }); running.length = 0; }

    function setPress(v) { btn.style.setProperty("--press", v.toFixed(3)); }
    function setShift(v) { btn.style.setProperty("--shift", v.toFixed(2)); }
    function setMark(v) { mark.style.setProperty("--in", Math.max(0, Math.min(1, v)).toFixed(3)); }

    /* press is critically damped so it feels crisp, release is a touch under
       so it comes back with a little life */
    btn.addEventListener("pointerdown", function () {
      if (state !== "idle") return;
      stopAll();
      run(spring(setPress, { from: 0, to: 1, k: 900, c: 60 }));
    });
    function release() {
      if (state !== "idle") return;
      stopAll();
      run(spring(setPress, { from: 1, to: 0, k: 420, c: 22 }));
    }
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", release);

    function setState(next) {
      state = next;
      btn.classList.toggle("is-sending", next === "sending");
      btn.classList.toggle("is-done", next === "done");
      btn.classList.toggle("is-failed", next === "failed");
      btn.setAttribute("aria-disabled", String(next === "sending"));
      if (next === "sending") btn.setAttribute("aria-busy", "true");
      else btn.removeAttribute("aria-busy");
      labelEl.textContent = labels[next === "sending" ? "busy" : next === "done" ? "done" : next === "failed" ? "fail" : "idle"];
      status.textContent = labelEl.textContent;
    }

    var handle = {
      start: function () {
        if (state === "sending") return handle;
        stopAll(); setMark(0); setShift(0); setPress(0);
        markPath.setAttribute("d", "");
        setState("sending");
        startWave();
        return handle;
      },
      succeed: function () {
        stopWave();
        setState("done");
        markPath.setAttribute("d", CHECK);
        stopAll();
        /* the mark lands on an underdamped spring, so it arrives */
        run(spring(setMark, { from: 0, to: 1, k: 320, c: 15 }));
        return handle;
      },
      fail: function () {
        stopWave();
        setState("failed");
        markPath.setAttribute("d", CROSS);
        stopAll();
        setMark(1);
        /* a real ring: displaced, then far too little damping to settle fast */
        run(spring(setShift, { from: 0, to: 0, v0: 70, k: 620, c: 7 }));
        return handle;
      },
      reset: function () {
        stopWave(); stopAll();
        setMark(0); setShift(0); setPress(0);
        markPath.setAttribute("d", "");
        setState("idle");
        return handle;
      },
      /* drive the whole lifecycle from a promise */
      run: function (fn) {
        var p = (fn || opts.run);
        handle.start();
        if (typeof p !== "function") return handle;
        try {
          Promise.resolve(p()).then(function () { handle.succeed(); },
                                    function () { handle.fail(); });
        } catch (err) { handle.fail(); }
        return handle;
      },
      state: function () { return state; },
      destroy: function () { stopWave(); stopAll(); },
    };

    if (typeof opts.run === "function") {
      btn.addEventListener("click", function () {
        if (state === "sending") return;
        if (state !== "idle") { handle.reset(); return; }
        handle.run();
      });
    }

    var ro = null;
    if (global.ResizeObserver) { ro = new global.ResizeObserver(function () { if (waveRaf) paintWave(); }); ro.observe(cv); }
    var baseDestroy = handle.destroy;
    handle.destroy = function () { baseDestroy(); if (ro) ro.disconnect(); };

    return handle;
  }

  global.holoAction = holoAction;
})(window);
