/* ---- researcher profile (nge-profile-*) ----------------------------------
   Drives the reproduced EyeWire II researcher profile: opens the dialog,
   switches tabs, swaps the right column to a badge's detail when a badge is
   clicked, and opens the "all special awards" modal.

   The profile is a real <dialog> opened with showModal, so focus trapping and
   Escape are the user agent's job. The special-awards overlay is a plain
   element toggled with [hidden]. Nothing here signs in or sends anything. */

(function () {
  "use strict";

  function openDialog(dlg, opener) {
    if (!dlg) return;
    dlg._opener = opener || document.activeElement;
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  }
  function closeDialog(dlg) {
    if (!dlg) return;
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
    if (dlg._opener && dlg._opener.focus) dlg._opener.focus();
  }

  function wireTabs(root) {
    var tabs = [].slice.call(root.querySelectorAll(".nge-profile-tabbar [role=tab]"));
    if (!tabs.length) return;
    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle("nge-profile-tab--active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
    }
    root.addEventListener("click", function (e) {
      var tab = e.target.closest(".nge-profile-tabbar [role=tab]");
      if (tab) select(tab);
      var jump = e.target.closest("[data-rp-tab]");
      if (jump) { var t = document.getElementById(jump.getAttribute("data-rp-tab")); if (t) select(t); }
    });
    root.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var n = e.key === "ArrowRight" ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
      tabs[n].focus(); select(tabs[n]);
    });
    root._selectTab = select;
  }

  // clicking a badge swaps the right column's viz panel to that badge's detail
  function wireBadgeDetail(root) {
    var img = root.querySelector("#rp-viz-img");
    var name = root.querySelector("#rp-viz-name");
    var desc = root.querySelector("#rp-viz-desc");
    var thr = root.querySelector("#rp-viz-thr");
    var title = root.querySelector(".nge-profile-viz-title");
    if (!img) return;
    function show(b) {
      var src = b.getAttribute("data-badge-img");
      if (src) img.src = src;
      if (name) name.textContent = b.getAttribute("data-badge-name") || "";
      if (desc) desc.textContent = b.getAttribute("data-badge-desc") || "";
      if (thr) {
        var t = b.getAttribute("data-badge-threshold") || "";
        var track = b.getAttribute("data-badge-track");
        thr.innerHTML = track === "special" ? t
          : "Unlocked at <strong>" + t + "</strong>";
      }
      if (title) title.textContent = b.getAttribute("data-badge-track") === "special"
        ? "Special Award" : "Badge Detail";
    }
    function handle(e) {
      var b = e.target.closest("[data-badge-name]");
      if (!b) return;
      if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
      if (e.type === "keydown") e.preventDefault();
      show(b);
      // if the viz is off-screen (trophy tab), bring the overview forward
      var ov = document.getElementById("rp-t-ov");
      if (root._selectTab && ov && document.getElementById("rp-b-ov").hidden) root._selectTab(ov);
    }
    root.addEventListener("click", handle);
    root.addEventListener("keydown", handle);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var dlg = document.querySelector("dialog.nge-profile-modal");
    if (dlg) {
      wireTabs(dlg);
      wireBadgeDetail(dlg);
      dlg.querySelectorAll("[data-rp-close]").forEach(function (b) {
        b.addEventListener("click", function () { closeDialog(dlg); });
      });
      dlg.addEventListener("click", function (e) { if (e.target === dlg) closeDialog(dlg); });
    }

    document.querySelectorAll("[data-holoresearcher]").forEach(function (btn) {
      var target = document.getElementById(btn.getAttribute("data-holoresearcher"));
      btn.addEventListener("click", function () { openDialog(target, btn); });
    });

    // all special awards overlay
    var special = document.getElementById("rp-special");
    if (special) {
      function openS() { special.hidden = false; }
      function closeS() { special.hidden = true; }
      document.addEventListener("click", function (e) {
        if (e.target.closest("[data-rp-special]")) openS();
        else if (e.target.closest("[data-rp-special-close]")) closeS();
        else if (e.target === special) closeS();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !special.hidden) closeS();
      });
    }
  });
})();
