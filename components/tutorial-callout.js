/* ---- tutorial callout (holotip) -----------------------------------------
   Builds and drives the callout defined in tutorial-callout.css.

   Two ways in. Declarative, which keeps the copy in the HTML:

     <ol class="holotip-steps" id="tour" hidden>
       <li data-holotip-target="#rail" data-holotip-side="bottom"
           data-holotip-title="The rail">
         <p>Any markup you like.</p>
       </li>
     </ol>
     <button data-holotip-start="#tour">Take the tour</button>

   or from script:

     const tour = holotip([{ target: "#rail", side: "bottom",
                             title: "The rail", html: "<p>Copy.</p>" }]);
     tour.start();          // also .next() .prev() .go(i) .stop()

   The panel is position fixed and nothing here listens for wheel or touch,
   so the page keeps its own scrolling. Escape dismisses. Left and right
   arrows step. The whole thing is removed from the DOM on stop and focus
   goes back to whatever opened it. */

(function () {
  "use strict";

  var GAP = 14;   /* clearance between target and panel, matches the beak */
  var EDGE = 8;   /* smallest gap allowed between panel and viewport edge  */
  var CORNER = 20; /* keeps the beak clear of the rounded corners          */

  var reduce = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  var uid = 0;

  function Tour(steps, options) {
    this.steps = steps || [];
    this.options = options || {};
    this.index = -1;
    this.node = null;
    this.target = null;
    this.opener = null;
    this.id = "holotip-" + (++uid);
    this._onScroll = this._reposition.bind(this);
    this._onKey = this._key.bind(this);
    this._onDocKey = this._docKey.bind(this);
  }

  Tour.prototype.start = function (from) {
    if (!this.steps.length) return this;
    this.opener = document.activeElement;
    this.go(typeof from === "number" ? from : 0);
    window.addEventListener("scroll", this._onScroll, true);
    window.addEventListener("resize", this._onScroll);
    document.addEventListener("keydown", this._onDocKey);
    return this;
  };

  Tour.prototype.stop = function () {
    window.removeEventListener("scroll", this._onScroll, true);
    window.removeEventListener("resize", this._onScroll);
    document.removeEventListener("keydown", this._onDocKey);
    this._clearTarget();
    if (this.node) { this.node.remove(); this.node = null; }
    this.index = -1;
    var o = this.opener;
    this.opener = null;
    if (o && o.focus) o.focus();
    return this;
  };

  Tour.prototype.next = function () {
    if (this.index >= this.steps.length - 1) return this.stop();
    return this.go(this.index + 1);
  };

  Tour.prototype.prev = function () {
    if (this.index <= 0) return this;
    return this.go(this.index - 1);
  };

  Tour.prototype._clearTarget = function () {
    if (this.target) {
      this.target.classList.remove("holotip-target");
      this.target = null;
    }
  };

  Tour.prototype.go = function (i) {
    var step = this.steps[i];
    if (!step) return this;
    this.index = i;
    this._clearTarget();

    /* rebuilt per step rather than patched, so the entrance and the letter
       reveal replay on every step instead of only on the first one */
    if (this.node) this.node.remove();
    var node = this.node = this._build(step, i);
    document.body.appendChild(node);

    var target = step.target ? document.querySelector(step.target) : null;
    if (target) {
      this.target = target;
      target.classList.add("holotip-target");
      if (!this._inView(target)) {
        target.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: reduce.matches ? "auto" : "smooth"
        });
      }
    }

    this._reposition();
    node.focus();
    return this;
  };

  Tour.prototype._inView = function (t) {
    var r = t.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= (window.innerHeight || 0);
  };

  Tour.prototype._build = function (step, i) {
    var self = this;
    var total = this.steps.length;

    var node = el("div", "holotip");
    node.tabIndex = -1;
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "false");
    node.style.setProperty("--holotip-progress", (i + 1) / total);

    var beak = el("i", "holotip-beak");
    beak.setAttribute("aria-hidden", "true");
    node.appendChild(beak);

    ["tl", "tr", "bl", "br"].forEach(function (c) {
      var s = el("span", "holotip-corner holotip-corner--" + c);
      s.setAttribute("aria-hidden", "true");
      node.appendChild(s);
    });

    var close = el("button", "holotip-close");
    close.type = "button";
    close.setAttribute("aria-label", "End the tour");
    close.textContent = "×";
    close.addEventListener("click", function () { self.stop(); });
    node.appendChild(close);

    if (step.title) {
      var h = el("h2", "holotip-title");
      h.id = this.id + "-title-" + i;
      /* the accessible name is the whole title, not the letter spans */
      h.setAttribute("aria-label", step.title);
      var chars = String(step.title).split("");
      chars.forEach(function (ch, n) {
        var s = el("span", "holotip-letter");
        s.setAttribute("aria-hidden", "true");
        /* capped stagger. Uncapped, a long title is still assembling after
           the reader has moved on to the body copy */
        s.style.animationDelay = Math.min(n * 0.022, 0.24) + "s";
        s.textContent = ch === " " ? " " : ch;
        h.appendChild(s);
      });
      node.appendChild(h);
      node.setAttribute("aria-labelledby", h.id);
    } else {
      node.setAttribute("aria-label", "Tour step " + (i + 1) + " of " + total);
    }

    var body = el("div", "holotip-body");
    body.id = this.id + "-body-" + i;
    if (step.html) body.innerHTML = step.html;
    else if (step.text) body.textContent = step.text;
    node.appendChild(body);
    node.setAttribute("aria-describedby", body.id);

    var actions = el("div", "holotip-actions");

    if (i > 0) {
      var back = el("button", "holotip-back");
      back.type = "button";
      back.textContent = step.backLabel || "back";
      back.addEventListener("click", function () { self.prev(); });
      actions.appendChild(back);
    }

    var next = el("button", "holotip-next");
    next.type = "button";
    next.textContent = step.nextLabel || (i === total - 1 ? "done" : "next");
    next.addEventListener("click", function () { self.next(); });
    actions.appendChild(next);

    var count = el("span", "holotip-count");
    count.setAttribute("aria-hidden", "true");
    count.textContent = (i + 1) + "/" + total;
    actions.appendChild(count);

    node.appendChild(actions);

    var rail = el("div", "holotip-rail");
    rail.setAttribute("aria-hidden", "true");
    rail.appendChild(el("i"));
    node.appendChild(rail);

    node.addEventListener("keydown", this._onKey);
    return node;
  };

  /* ---- placement -------------------------------------------------------
     Put the panel on the requested side, flip to the opposite side if it
     does not fit there, clamp the result into the viewport, then slide the
     beak along the panel edge so it still points at the target. */
  Tour.prototype._reposition = function () {
    var node = this.node;
    if (!node) return;
    var step = this.steps[this.index] || {};
    var t = this.target ? this.target.getBoundingClientRect() : null;

    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var w = node.offsetWidth;
    var h = node.offsetHeight;

    if (!t) {
      node.setAttribute("data-side", "center");
      node.style.left = Math.round((vw - w) / 2) + "px";
      node.style.top = Math.round((vh - h) / 2) + "px";
      return;
    }

    var side = step.side || "bottom";
    var fits = {
      bottom: t.bottom + GAP + h <= vh - EDGE,
      top: t.top - GAP - h >= EDGE,
      right: t.right + GAP + w <= vw - EDGE,
      left: t.left - GAP - w >= EDGE
    };
    var opposite = { bottom: "top", top: "bottom", right: "left", left: "right" };
    if (!fits[side] && fits[opposite[side]]) side = opposite[side];

    var left, top;
    if (side === "bottom" || side === "top") {
      left = t.left + t.width / 2 - w / 2;
      top = side === "bottom" ? t.bottom + GAP : t.top - GAP - h;
    } else {
      left = side === "right" ? t.right + GAP : t.left - GAP - w;
      top = t.top + t.height / 2 - h / 2;
    }

    left = clamp(left, EDGE, Math.max(EDGE, vw - w - EDGE));
    top = clamp(top, EDGE, Math.max(EDGE, vh - h - EDGE));

    node.setAttribute("data-side", side);
    node.style.left = Math.round(left) + "px";
    node.style.top = Math.round(top) + "px";

    /* the beak keeps pointing at the target centre even after the clamp
       moved the panel, and never rides up onto a rounded corner */
    if (side === "bottom" || side === "top") {
      var bx = clamp(t.left + t.width / 2 - left, CORNER, Math.max(CORNER, w - CORNER));
      node.style.setProperty("--holotip-beak", Math.round(bx) + "px");
    } else {
      var by = clamp(t.top + t.height / 2 - top, CORNER, Math.max(CORNER, h - CORNER));
      node.style.setProperty("--holotip-beak", Math.round(by) + "px");
    }
  };

  Tour.prototype._key = function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); this.next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); this.prev(); }
  };

  /* Escape from anywhere, because focus can leave the panel with one click.
     Nothing else is captured at document level: swallowing Enter globally
     breaks every form on the host page. */
  Tour.prototype._docKey = function (e) {
    if (e.key === "Escape") { e.preventDefault(); this.stop(); }
  };

  function holotip(steps, options) { return new Tour(steps, options); }

  /* read a step list out of the DOM */
  holotip.fromList = function (listOrSelector) {
    var list = typeof listOrSelector === "string"
      ? document.querySelector(listOrSelector) : listOrSelector;
    if (!list) return null;
    var steps = [];
    Array.prototype.forEach.call(list.children, function (li) {
      steps.push({
        target: li.getAttribute("data-holotip-target") || null,
        side: li.getAttribute("data-holotip-side") || "bottom",
        title: li.getAttribute("data-holotip-title") || "",
        nextLabel: li.getAttribute("data-holotip-next") || null,
        html: li.innerHTML
      });
    });
    return holotip(steps);
  };

  /* wire up any button that names a step list */
  holotip.init = function (root) {
    var scope = root || document;
    var buttons = scope.querySelectorAll("[data-holotip-start]");
    Array.prototype.forEach.call(buttons, function (btn) {
      if (btn.holotipBound) return;
      btn.holotipBound = true;
      btn.addEventListener("click", function () {
        var tour = holotip.fromList(btn.getAttribute("data-holotip-start"));
        if (tour) tour.start();
      });
    });
  };

  window.holotip = holotip;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { holotip.init(); });
  } else {
    holotip.init();
  }
})();
