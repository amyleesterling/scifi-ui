/* ---- researcher profile + badge award (holoresearcher, holoaward) --------
   Opens the profile modal, switches its tabs, and turns any badge into an
   award screen.

     <button data-holoresearcher="researcherProfile">Open profile</button>
     <dialog class="holoresearcher" id="researcherProfile"> ... </dialog>
     <dialog class="holoaward" id="badgeAward"> ... </dialog>

   Tabs are buttons with role=tab and aria-controls; clicking one shows its
   panel and hides the rest, and the arrow keys move between them, which is the
   tab pattern a screen reader expects.

   A badge is any element with data-award. Its label, glyph and colours are read
   off the badge itself, dropped into the single .holoaward dialog, and the
   confetti burst fires if confetti-burst.js is on the page. One award dialog is
   reused for every badge rather than one per badge.

   Both dialogs are real <dialog>s opened with showModal, so focus trapping and
   Escape are the user agent's job. Nothing here authenticates or sends
   anything. */

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

  /* ---- tabs ------------------------------------------------------------- */
  function wireTabs(root) {
    var tabs = [].slice.call(root.querySelectorAll("[role=tab]"));
    if (!tabs.length) return;

    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
    }

    root.addEventListener("click", function (e) {
      var tab = e.target.closest("[role=tab]");
      if (tab) select(tab);
    });

    root.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var next = e.key === "ArrowRight" ? (i + 1) % tabs.length
                                        : (i - 1 + tabs.length) % tabs.length;
      tabs[next].focus();
      select(tabs[next]);
    });
  }

  /* ---- award screen ----------------------------------------------------- */
  function wireAward(award, profile) {
    if (!award) return;
    var coin = award.querySelector(".holobadge");
    var glyph = award.querySelector(".holobadge-glyph");
    var nameEl = award.querySelector(".holoaward-name");

    function show(badge) {
      var label = badge.getAttribute("data-award") || "Badge";
      var g = badge.querySelector(".holobadge-glyph");
      if (glyph && g) glyph.textContent = g.textContent;
      if (coin) {
        coin.style.setProperty("--b1", badge.style.getPropertyValue("--b1") || "#7fd0ff");
        coin.style.setProperty("--b2", badge.style.getPropertyValue("--b2") || "#2f6fd6");
        coin.style.setProperty("--bglow", badge.style.getPropertyValue("--bglow") || "rgb(120 170 255 / .6)");
      }
      if (nameEl) nameEl.textContent = label;
      openDialog(award, badge);
      if (typeof window.holoburst === "function") window.holoburst("rainbow", 1.5);
    }

    // any earned badge on the page opens the award; a locked one does not
    document.addEventListener("click", function (e) {
      var badge = e.target.closest("[data-award]");
      if (!badge || badge.classList.contains("is-locked")) return;
      // a badge inside the profile still works; the profile stays open behind it
      show(badge);
    });

    award.querySelectorAll("[data-holoaward-close]").forEach(function (b) {
      b.addEventListener("click", function () { closeDialog(award); });
    });
    award.addEventListener("click", function (e) { if (e.target === award) closeDialog(award); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("dialog.holoresearcher").forEach(function (dlg) {
      wireTabs(dlg);
      dlg.querySelectorAll("[data-holoresearcher-close]").forEach(function (b) {
        b.addEventListener("click", function () { closeDialog(dlg); });
      });
      dlg.addEventListener("click", function (e) { if (e.target === dlg) closeDialog(dlg); });
    });

    document.querySelectorAll("[data-holoresearcher]").forEach(function (btn) {
      var dlg = document.getElementById(btn.getAttribute("data-holoresearcher"));
      btn.addEventListener("click", function () { openDialog(dlg, btn); });
    });

    var award = document.querySelector("dialog.holoaward");
    var profile = document.querySelector("dialog.holoresearcher");
    wireAward(award, profile);
  });
})();
